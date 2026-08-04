#requires -Version 5.1
<#
.SYNOPSIS
  Step On Chord — 模型权重与运行时代码准备脚本（原 prepare_third_party.sh 的 Windows 精简版）

.DESCRIPTION
  1. 创建 resources/models/ 目录结构
  2. SongFormer 代码（git clone + MuQ/MusicFM 子模块）→ resources/models/SongFormer
  3. SongFormer 权重：SongFormer.safetensors + MusicFM（HF 镜像下载 + MD5 校验）
  4. MuQ 权重：OpenMuQ/MuQ-large-msd-iter（huggingface_hub 预下载到 HF 缓存）
  5. ChordMini runtime（ChordMiniApp pin 的子模块）→ resources/models/acr_model
  6. BTC 权重（ChordMini main 分支真实权重）→ acr_model/checkpoints/{btc,SL}
  7. musicfm torch.load 兼容 patch（torch >= 2.6 weights_only 默认值变更）
  8. Python 依赖安装（可用 -SkipPythonDeps 跳过）
  9. 启动 sidecar 调 /api/health 验证自检项
  不拉取 MOSS-Music（已废弃）。脚本幂等：已完成的步骤自动跳过，可反复执行。

.PARAMETER HfEndpoint
  HuggingFace 端点。默认国内镜像 https://hf-mirror.com；海外网络改为 https://huggingface.co

.PARAMETER SkipPythonDeps
  跳过 Python 依赖安装（仅下载代码与权重）

.PARAMETER SkipHealthCheck
  跳过末尾的 sidecar 健康检查

.EXAMPLE
  powershell -ExecutionPolicy Bypass -File scripts\prepare-models.ps1
#>
[CmdletBinding()]
param(
  [string]$HfEndpoint = 'https://hf-mirror.com',
  [switch]$SkipPythonDeps,
  [switch]$SkipHealthCheck
)

$ErrorActionPreference = 'Stop'
$ProjectRoot   = Split-Path -Parent $PSScriptRoot
$ReferenceDir  = Join-Path $ProjectRoot 'reference'
$ModelsDir     = Join-Path $ProjectRoot 'resources\models'
$AcrDir        = Join-Path $ModelsDir 'acr_model'
$SongFormerDir = Join-Path $ModelsDir 'SongFormer'
$PyMirror      = 'https://pypi.tuna.tsinghua.edu.cn/simple'

# 约束语言模式（ConstrainedLanguage）兼容：仅用核心类型，不用 New-Object/.NET 静态方法
$script:Results = @()

# ---------------------------------------------------------------- 工具函数

function Write-Step([string]$Title) {
  Write-Host "`n============================================================" -ForegroundColor DarkCyan
  Write-Host "  $Title" -ForegroundColor Cyan
  Write-Host "============================================================" -ForegroundColor DarkCyan
}

function Add-Result([string]$Step, [string]$Status, [string]$Detail = '') {
  # 约束模式不允许 [pscustomobject] 转换，用哈希表（核心类型）
  $script:Results += @{ Step = $Step; Status = $Status; Detail = $Detail }
  $color = switch ($Status) { 'OK' { 'Green' } 'SKIP' { 'DarkGray' } 'FAIL' { 'Red' } default { 'Yellow' } }
  Write-Host "  [$Status] $Step $(if ($Detail) { "- $Detail" })" -ForegroundColor $color
}

function Test-Command([string]$Name) {
  return $null -ne (Get-Command $Name -ErrorAction SilentlyContinue)
}

function Resolve-Python {
  foreach ($candidate in @('py', 'python')) {
    if (Test-Command $candidate) { return $candidate }
  }
  throw '未找到 Python 解释器（py / python 均不可用）。请安装 Python 3.10+。'
}

function Invoke-GitClone([string]$Url, [string]$Dest, [switch]$SkipLfs) {
  if (Test-Path (Join-Path $Dest '.git')) { return $false }
  if (Test-Path $Dest) { Remove-Item -Recurse -Force $Dest }
  if ($SkipLfs) { $env:GIT_LFS_SKIP_SMUDGE = '1' } else { Remove-Item Env:GIT_LFS_SKIP_SMUDGE -ErrorAction SilentlyContinue }
  & git clone --depth 1 $Url $Dest
  if ($LASTEXITCODE -ne 0) { throw "git clone 失败：$Url" }
  return $true
}

function Invoke-Download([string]$Url, [string]$Target, [string]$ExpectedMd5 = '') {
  if (Test-Path $Target) {
    if (-not $ExpectedMd5) { return 'SKIP' }
    $hash = (Get-FileHash -Algorithm MD5 $Target).Hash.ToLowerInvariant()
    if ($hash -eq $ExpectedMd5.ToLowerInvariant()) { return 'SKIP' }
    Write-Host "  已存在但 MD5 不匹配，重新下载：$Target" -ForegroundColor Yellow
    Remove-Item $Target -Force
  }
  $tmp = "$Target.download"
  [void](New-Item -ItemType Directory -Force -Path (Split-Path $Target))
  Write-Host "  下载：$Url"
  & curl.exe -L --fail --retry 3 --connect-timeout 20 -o $tmp $Url
  if ($LASTEXITCODE -ne 0) {
    Remove-Item $tmp -Force -ErrorAction SilentlyContinue
    throw "下载失败：$Url`n  请手动下载后放到：$Target"
  }
  Move-Item $tmp $Target -Force
  if ($ExpectedMd5) {
    $hash = (Get-FileHash -Algorithm MD5 $Target).Hash.ToLowerInvariant()
    if ($hash -ne $ExpectedMd5.ToLowerInvariant()) {
      Remove-Item $Target -Force
      throw "MD5 校验失败（期望 $ExpectedMd5，实际 $hash）：$Url`n  请手动下载后放到：$Target"
    }
  }
  return 'OK'
}

# ---------------------------------------------------------------- Step 0：环境检查与目录结构

Write-Step 'Step 0/8 · 环境检查与目录创建'
if (-not (Test-Command 'git')) { throw '未找到 git，请先安装 Git for Windows。' }
$Python = Resolve-Python
Write-Host "  Python 解释器：$Python"
@(
  $ModelsDir,
  (Join-Path $AcrDir 'checkpoints\btc'),
  (Join-Path $AcrDir 'checkpoints\SL'),
  $SongFormerDir,
  (Join-Path $ModelsDir 'voicing'),
  $ReferenceDir
) | ForEach-Object { [void](New-Item -ItemType Directory -Force -Path $_) }
Add-Result '目录结构 resources/models/{acr_model,SongFormer,voicing}' 'OK'

# ---------------------------------------------------------------- Step 1：SongFormer 代码

Write-Step 'Step 1/8 · SongFormer 代码（ASLP-lab/SongFormer + MuQ/MusicFM 子模块）'
try {
  $sfRef = Join-Path $ReferenceDir 'SongFormer'
  $cloned = Invoke-GitClone 'https://github.com/ASLP-lab/SongFormer.git' $sfRef
  & git -C $sfRef submodule update --init --depth 1 src/third_party/MuQ src/third_party/musicfm
  if ($LASTEXITCODE -ne 0) { throw 'SongFormer 子模块（MuQ/MusicFM）拉取失败，请检查网络后重试。' }

  # 复制到 resources/models/SongFormer（排除版本控制、训练 recipe、大权重——权重在 Step 2 单独下载）
  $robocopyArgs = @(
    $sfRef, $SongFormerDir, '/E',
    '/XD', '.git', 'recipes', 'docs', 'figs',
    '/XF', '.git', '.gitattributes', '.gitignore', '.gitmodules', '*.pt', '*.pth', '*.safetensors', '*.bin', '*.wav', '*.mp3',
    '/NFL', '/NDL', '/NJH', '/NJS', '/NP'
  )
  & robocopy @robocopyArgs | Out-Null
  if ($LASTEXITCODE -ge 8) { throw "robocopy 复制 SongFormer 失败（退出码 $LASTEXITCODE）" }
  Add-Result 'SongFormer 代码 → resources/models/SongFormer' $(if ($cloned) { 'OK' } else { 'SKIP（已存在，已同步）' })
} catch {
  Add-Result 'SongFormer 代码' 'FAIL' "$_`n    手动方案：git clone https://github.com/ASLP-lab/SongFormer.git 后连子模块一起复制到 resources/models/SongFormer"
}

# ---------------------------------------------------------------- Step 2：SongFormer 权重（MD5 校验）

Write-Step 'Step 2/8 · SongFormer / MusicFM 权重下载（hf-mirror，MD5 校验）'
$sfCkpts = Join-Path $SongFormerDir 'src\SongFormer\ckpts'
$weights = @(
  @{ Url = "$HfEndpoint/ASLP-lab/SongFormer/resolve/main/SongFormer.safetensors";
     Target = (Join-Path $sfCkpts 'SongFormer.safetensors'); Md5 = '5a24800e12ab357744f8b47e523ba3e6' },
  @{ Url = "$HfEndpoint/minzwon/MusicFM/resolve/main/pretrained_msd.pt";
     Target = (Join-Path $sfCkpts 'MusicFM\pretrained_msd.pt'); Md5 = 'df930aceac8209818556c4a656a0714c' },
  @{ Url = "$HfEndpoint/minzwon/MusicFM/resolve/main/msd_stats.json";
     Target = (Join-Path $sfCkpts 'MusicFM\msd_stats.json'); Md5 = '75ab2e47b093e07378f7f703bdb82c14' }
)
foreach ($w in $weights) {
  $name = Split-Path $w.Target -Leaf
  try {
    $status = Invoke-Download $w.Url $w.Target $w.Md5
    Add-Result "权重 $name" $status $(if ($status -eq 'SKIP') { '已存在且 MD5 校验通过' } else { '' })
  } catch {
    Add-Result "权重 $name" 'FAIL' "$_"
  }
}

# ---------------------------------------------------------------- Step 3：MuQ 权重（HF 缓存预下载）

Write-Step 'Step 3/8 · MuQ 权重（OpenMuQ/MuQ-large-msd-iter，约 1.3GB，入 HF 缓存）'
try {
  & $Python -c "import huggingface_hub" 2>$null
  if ($LASTEXITCODE -ne 0) {
    Write-Host '  安装 huggingface_hub…'
    & $Python -m pip install huggingface_hub -i $PyMirror
    if ($LASTEXITCODE -ne 0) { throw 'huggingface_hub 安装失败' }
  }
  $muqScript = Join-Path $env:TEMP 'chordcraft_download_muq.py'
  $muqPy = @'
import os
os.environ["HF_ENDPOINT"] = os.environ.get("CHORDCRAFT_HF_ENDPOINT", "https://hf-mirror.com")
from huggingface_hub import snapshot_download
path = snapshot_download("OpenMuQ/MuQ-large-msd-iter")
print("MuQ downloaded:", path)
'@
  # Python 3 容忍 UTF-8 BOM，直接用 Set-Content（约束模式兼容）
  $muqPy | Set-Content -Path $muqScript -Encoding UTF8
  $env:CHORDCRAFT_HF_ENDPOINT = $HfEndpoint
  & $Python $muqScript
  Remove-Item $muqScript -Force -ErrorAction SilentlyContinue
  if ($LASTEXITCODE -ne 0) {
    throw "MuQ 下载失败。请手动从 $HfEndpoint/OpenMuQ/MuQ-large-msd-iter 下载（点 Files and versions 全量）到 HF 缓存目录。"
  }
  Add-Result 'MuQ 权重（HF 缓存）' 'OK'
} catch {
  Add-Result 'MuQ 权重' 'FAIL' "$_"
}

# ---------------------------------------------------------------- Step 4：ChordMini runtime（ChordMiniApp pin 子模块）

Write-Step 'Step 4/8 · ChordMini runtime 代码（ChordMiniApp pin 子模块）'
try {
  $cmAppRef = Join-Path $ReferenceDir 'ChordMiniApp'
  [void](Invoke-GitClone 'https://github.com/ptnghia-j/ChordMiniApp.git' $cmAppRef -SkipLfs)
  $env:GIT_LFS_SKIP_SMUDGE = '1'
  & git -C $cmAppRef submodule update --init --depth 1 python_backend/models/ChordMini
  if ($LASTEXITCODE -ne 0) { throw 'ChordMini 子模块拉取失败，请检查网络后重试。' }

  $acrSrc = Join-Path $cmAppRef 'python_backend\models\ChordMini'
  if (-not (Test-Path (Join-Path $acrSrc 'btc_chord_recognition.py'))) {
    throw "ChordMini runtime 不完整：缺少 $acrSrc\btc_chord_recognition.py"
  }
  $robocopyArgs = @(
    $acrSrc, $AcrDir, '/E',
    '/XD', '.git', 'test',
    '/XF', '.git', '.gitattributes', '.gitignore', '.gitmodules',
    'test*.py', 'train*.py', 'validate*.py', '*.pth', '*.pt', '*.lab', '*.sh',
    '/NFL', '/NDL', '/NJH', '/NJS', '/NP'
  )
  & robocopy @robocopyArgs | Out-Null
  if ($LASTEXITCODE -ge 8) { throw "robocopy 复制 ChordMini runtime 失败（退出码 $LASTEXITCODE）" }
  # 清理根目录训练配置（config/ 下的 btc_config.yaml 必须保留，不受影响）
  Get-ChildItem $AcrDir -Filter '*.yaml' -File | Where-Object { $_.DirectoryName -eq $AcrDir } | Remove-Item -Force
  # 注：原脚本的 numba cache patch 指向 /tmp（Windows 不适用），
  # 桌面版 chord_recognition.py 已在 import 前设置 NUMBA_CACHE_DIR 到系统临时目录，无需 patch。
  Add-Result 'ChordMini runtime → resources/models/acr_model' 'OK'
} catch {
  Add-Result 'ChordMini runtime' 'FAIL' "$_"
}

# ---------------------------------------------------------------- Step 5：BTC 权重（ChordMini main 真实文件）

Write-Step 'Step 5/8 · BTC 权重（btc_combined_best.pth / btc_model_large_voca.pt）'
try {
  $cmRef = Join-Path $ReferenceDir 'ChordMini'
  [void](Invoke-GitClone 'https://github.com/ptnghia-j/ChordMini.git' $cmRef)

  $plSource = Join-Path $cmRef 'checkpoints\btc_model_best.pth'
  $slSource = Join-Path $cmRef 'checkpoints\btc_model_large_voca.pt'
  $plTarget = Join-Path $AcrDir 'checkpoints\btc\btc_combined_best.pth'
  $slTarget = Join-Path $AcrDir 'checkpoints\SL\btc_model_large_voca.pt'

  foreach ($pair in @(@($plSource, $plTarget, 'PL btc_combined_best.pth'), @($slSource, $slTarget, 'SL btc_model_large_voca.pt'))) {
    if ((Test-Path $pair[1]) -and (Get-Item $pair[1]).Length -gt 1MB) { continue }
    if (-not (Test-Path $pair[0]) -or (Get-Item $pair[0]).Length -lt 1MB) {
      throw "$($pair[2]) 源文件缺失或过小（疑似 LFS pointer）：$($pair[0])"
    }
    Copy-Item $pair[0] $pair[1] -Force
    $sizeMB = [int]((Get-Item $pair[1]).Length / 1MB)
    Write-Host "  已放置 $($pair[2])（约 $sizeMB MB）"
  }
  Add-Result 'BTC 权重 → acr_model/checkpoints/{btc,SL}' 'OK'
} catch {
  Add-Result 'BTC 权重' 'FAIL' "$_`n    手动方案：从 ChordMini 仓库或 AI-ChordCraft third_party/acr_model/checkpoints/ 复制对应文件"
}

# ---------------------------------------------------------------- Step 6：musicfm torch.load 兼容 patch

Write-Step 'Step 6/8 · musicfm torch.load 兼容 patch（torch >= 2.6）'
try {
  $patchTarget = Join-Path $SongFormerDir 'src\third_party\musicfm\model\musicfm_25hz.py'
  if (-not (Test-Path $patchTarget)) { throw "文件不存在：$patchTarget（Step 1 未完成？）" }
  $content = Get-Content $patchTarget -Raw
  $needle = 'S = torch.load(model_path)["state_dict"]'
  $replacement = 'S = torch.load(model_path, weights_only=False)["state_dict"]'
  if ($content.Contains($replacement)) {
    Add-Result 'musicfm patch' 'SKIP' '已应用过'
  } elseif ($content.Contains($needle)) {
    $content = $content.Replace($needle, $replacement)
    # Python 3 容忍 UTF-8 BOM，直接用 Set-Content（约束模式兼容）
    Set-Content -Path $patchTarget -Value $content -Encoding UTF8 -NoNewline
    Add-Result 'musicfm patch（weights_only=False）' 'OK'
  } else {
    Add-Result 'musicfm patch' 'SKIP' '未找到目标代码行（上游可能已修复）'
  }
} catch {
  Add-Result 'musicfm patch' 'FAIL' "$_"
}

# ---------------------------------------------------------------- Step 7：Python 依赖

Write-Step 'Step 7/8 · Python 依赖安装'
if ($SkipPythonDeps) {
  Add-Result 'Python 依赖' 'SKIP' '-SkipPythonDeps 指定跳过'
} else {
  try {
    # 必须先装 torch CPU 版：requirements.txt 里的 torch>=2.2 若从 PyPI 解析会拉到 ~2.5GB 的 CUDA 版
    & $Python -c "import torch" 2>$null
    if ($LASTEXITCODE -ne 0) {
      Write-Host '  安装 torch（CPU 版，约 200MB）…'
      & $Python -m pip install torch --index-url https://download.pytorch.org/whl/cpu
      if ($LASTEXITCODE -ne 0) { throw 'torch 安装失败（CPU 源），可手动执行：py -m pip install torch --index-url https://download.pytorch.org/whl/cpu' }
    } else {
      Write-Host '  torch 已安装，跳过'
    }

    Write-Host '  安装 backend/requirements.txt…'
    & $Python -m pip install -r (Join-Path $ProjectRoot 'backend\requirements.txt') -i $PyMirror
    if ($LASTEXITCODE -ne 0) { throw 'backend/requirements.txt 安装失败' }

    Write-Host '  安装 SongFormer 推理依赖…'
    $sfDeps = @('gradio', 'matplotlib', 'omegaconf', 'ema-pytorch', 'muq', 'safetensors',
                'transformers', 'huggingface-hub', 'msaf', 'x-transformers', 'einops')
    & $Python -m pip install @sfDeps -i $PyMirror
    if ($LASTEXITCODE -ne 0) { throw "SongFormer 推理依赖安装失败：$($sfDeps -join ', ')" }
    Add-Result 'Python 依赖（backend + torch CPU + SongFormer 推理）' 'OK'
  } catch {
    Add-Result 'Python 依赖' 'FAIL' "$_"
  }
}

# ---------------------------------------------------------------- Step 8：健康检查

Write-Step 'Step 8/8 · sidecar /api/health 自检'
if ($SkipHealthCheck) {
  Add-Result '健康检查' 'SKIP' '-SkipHealthCheck 指定跳过'
} else {
  $port = 18923
  $outLog = Join-Path $env:TEMP 'chordcraft-sidecar-out.log'
  $errLog = Join-Path $env:TEMP 'chordcraft-sidecar-err.log'
  $proc = $null
  try {
    $proc = Start-Process -FilePath $Python -ArgumentList @('backend\engine_main.py', "$port") `
      -WorkingDirectory $ProjectRoot -PassThru -WindowStyle Hidden `
      -RedirectStandardOutput $outLog -RedirectStandardError $errLog
    $health = $null
    for ($i = 0; $i -lt 60 -and -not $health; $i++) {
      Start-Sleep -Milliseconds 500
      try { $health = Invoke-RestMethod -Uri "http://127.0.0.1:$port/api/health" -TimeoutSec 2 } catch { }
    }
    if (-not $health) {
      $tail = if (Test-Path $errLog) { (Get-Content $errLog -Tail 20) -join "`n" } else { '' }
      throw "sidecar 30s 内未就绪。stderr 末尾：`n$tail"
    }
    Write-Host "  engine 版本：$($health.version) · model_dir：$($health.model_dir)"
    foreach ($key in @('acr_model', 'songformer', 'voicing_db')) {
      $value = [bool]$health.checks.$key
      $color = if ($value) { 'Green' } else { 'Yellow' }
      Write-Host ("    {0,-12} {1}" -f $key, $(if ($value) { '✔ true' } else { '✘ false' })) -ForegroundColor $color
    }
    Add-Result '健康检查（acr_model / songformer 应为 true）' 'OK'
    if (-not $health.checks.voicing_db) {
      Write-Host '  提示：voicing_db 为可选项（源自 AI-Musician-Skills/guitar-arrange-skill），不影响分析。' -ForegroundColor Yellow
    }
  } catch {
    Add-Result '健康检查' 'FAIL' "$_"
  } finally {
    if ($proc -and -not $proc.HasExited) { Stop-Process -Id $proc.Id -Force -ErrorAction SilentlyContinue }
  }
}

# ---------------------------------------------------------------- 汇总

Write-Step '执行汇总'
foreach ($item in $script:Results) {
  $line = "  {0,-6} {1}" -f $item.Status, $item.Step
  if ($item.Detail) { $line += " - $($item.Detail)" }
  Write-Host $line
}
$failCount = @($script:Results | Where-Object { $_.Status -eq 'FAIL' }).Count
if ($failCount -gt 0) {
  Write-Host "有 $failCount 个步骤失败，请按上方 FAIL 项的手动指引处理后重新运行本脚本（幂等）。`n" -ForegroundColor Red
  exit 1
}
Write-Host "全部完成。可以运行 npm.cmd run dev 启动应用。`n" -ForegroundColor Green
exit 0




