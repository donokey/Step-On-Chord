#requires -Version 5.1
<#
.SYNOPSIS
  Step On Chord — Python sidecar 构建脚本（两步构建的第一步）

.DESCRIPTION
  1. PyInstaller onedir 打包 backend/engine_main.py → chordcraft-engine.exe
  2. 产物移动到 resources/python-backend/（electron/sidecar.ts 生产路径约定）
  3. 组装 resources/python-backend/engine-data/：
     - ChordMini / SongFormer 运行时代码（不含权重，权重首启下载）
     - voicing 指法数据库（随包内置的只读数据）
     - musicfm torch.load 兼容 patch（torch >= 2.6）

.PARAMETER SkipSmokeTest
  跳过末尾的 exe 启动冒烟测试（/api/health 探活）

.EXAMPLE
  powershell -ExecutionPolicy Bypass -File scripts\build-backend.ps1
#>
[CmdletBinding()]
param(
  [switch]$SkipSmokeTest
)

$ErrorActionPreference = 'Stop'
$ProjectRoot = Split-Path -Parent $PSScriptRoot
$DistPy      = Join-Path $ProjectRoot 'dist-py'
$BuildPy     = Join-Path $ProjectRoot 'build-py'
$PyBackend   = Join-Path $ProjectRoot 'resources\python-backend'
$EngineData  = Join-Path $PyBackend 'engine-data'
$ModelsDir   = Join-Path $ProjectRoot 'resources\models'

function Write-Step([string]$Title) {
  Write-Host "`n============================================================" -ForegroundColor DarkCyan
  Write-Host "  $Title" -ForegroundColor Cyan
  Write-Host "============================================================" -ForegroundColor DarkCyan
}

function Test-Command([string]$Name) {
  return $null -ne (Get-Command $Name -ErrorAction SilentlyContinue)
}

function Resolve-Python {
  foreach ($candidate in @('py', 'python')) {
    if (Test-Command $candidate) { return $candidate }
  }
  throw '未找到 Python 解释器（py / python 均不可用）。'
}

function Invoke-Robocopy([string[]]$Args2) {
  & robocopy @Args2 | Out-Null
  if ($LASTEXITCODE -ge 8) { throw "robocopy 失败（退出码 $LASTEXITCODE）：$($Args2 -join ' ')" }
}

# ---------------------------------------------------------------- Step 1：PyInstaller 打包

Write-Step 'Step 1/4 · PyInstaller onedir 打包（入口 backend/engine_main.py）'
$Python = Resolve-Python
Write-Host "  Python 解释器：$Python"
Set-Location $ProjectRoot
& $Python -m PyInstaller backend\build.spec --noconfirm --distpath dist-py --workpath build-py
if ($LASTEXITCODE -ne 0) { throw "PyInstaller 构建失败（退出码 $LASTEXITCODE）" }
$builtExe = Join-Path $DistPy 'chordcraft-engine\chordcraft-engine.exe'
if (-not (Test-Path $builtExe)) { throw "未找到 PyInstaller 产物：$builtExe" }

# ---------------------------------------------------------------- Step 2：移动到 resources/python-backend

Write-Step 'Step 2/4 · 产物 → resources/python-backend/'
if (Test-Path $PyBackend) { Remove-Item -Recurse -Force $PyBackend }
New-Item -ItemType Directory -Force -Path $PyBackend | Out-Null
Invoke-Robocopy @((Join-Path $DistPy 'chordcraft-engine'), $PyBackend, '/E', '/NFL', '/NDL', '/NJH', '/NJS', '/NP')
Write-Host "  chordcraft-engine.exe 已就位：$(Join-Path $PyBackend 'chordcraft-engine.exe')"

# ---------------------------------------------------------------- Step 3：engine-data 运行时代码（不含权重）

Write-Step 'Step 3/4 · engine-data（ChordMini / SongFormer 代码 + voicing 数据）'
if (Test-Path $EngineData) { Remove-Item -Recurse -Force $EngineData }

# ChordMini runtime（排除 checkpoints 权重与训练/测试脚本）
Invoke-Robocopy @(
  (Join-Path $ModelsDir 'acr_model'), (Join-Path $EngineData 'acr_model'), '/E',
  '/XD', '.git', '__pycache__', 'checkpoints', 'test',
  '/XF', '*.pth', '*.pt', '*.safetensors', '*.bin', '*.lab', '*.sh', 'test*.py', 'train*.py', 'validate*.py', '.git*',
  '/NFL', '/NDL', '/NJH', '/NJS', '/NP'
)
if (-not (Test-Path (Join-Path $EngineData 'acr_model\btc_chord_recognition.py'))) {
  throw 'engine-data/acr_model 不完整：缺少 btc_chord_recognition.py（请先运行 scripts/prepare-models.ps1）'
}

# SongFormer runtime（排除权重/训练 recipe/媒体文件）
Invoke-Robocopy @(
  (Join-Path $ModelsDir 'SongFormer'), (Join-Path $EngineData 'SongFormer'), '/E',
  '/XD', '.git', '__pycache__', 'recipes', 'docs', 'figs',
  '/XF', '*.pth', '*.pt', '*.safetensors', '*.bin', '*.wav', '*.mp3', '.git*',
  '/NFL', '/NDL', '/NJH', '/NJS', '/NP'
)
if (-not (Test-Path (Join-Path $EngineData 'SongFormer\app.py'))) {
  throw 'engine-data/SongFormer 不完整：缺少 app.py（请先运行 scripts/prepare-models.ps1）'
}

# voicing 指法数据库（随包内置，只读数据非权重）
Invoke-Robocopy @(
  (Join-Path $ModelsDir 'voicing'), (Join-Path $EngineData 'voicing'), '/E',
  '/XF', '__pycache__',
  '/NFL', '/NDL', '/NJH', '/NJS', '/NP'
)

# musicfm torch.load 兼容 patch（torch >= 2.6 weights_only 默认值变更）
$patchTarget = Join-Path $EngineData 'SongFormer\src\third_party\musicfm\model\musicfm_25hz.py'
if (Test-Path $patchTarget) {
  $content = Get-Content $patchTarget -Raw
  $needle = 'S = torch.load(model_path)["state_dict"]'
  $replacement = 'S = torch.load(model_path, weights_only=False)["state_dict"]'
  if ($content.Contains($replacement)) {
    Write-Host '  musicfm patch：已应用过，跳过'
  } elseif ($content.Contains($needle)) {
    Set-Content -Path $patchTarget -Value ($content.Replace($needle, $replacement)) -Encoding UTF8 -NoNewline
    Write-Host '  musicfm patch（weights_only=False）：已应用'
  } else {
    Write-Host '  musicfm patch：未找到目标代码行（上游可能已修复）' -ForegroundColor Yellow
  }
} else {
  Write-Host "  musicfm patch：文件不存在 $patchTarget" -ForegroundColor Yellow
}

# ---------------------------------------------------------------- Step 4：冒烟测试（exe 能否启动 + /api/health 探活）

Write-Step 'Step 4/4 · 冒烟测试（chordcraft-engine.exe + /api/health）'
if ($SkipSmokeTest) {
  Write-Host '  SKIP：-SkipSmokeTest 指定跳过'
} else {
  $exe = Join-Path $PyBackend 'chordcraft-engine.exe'
  $port = 18999
  $outLog = Join-Path $env:TEMP 'chordcraft-engine-smoke-out.log'
  $errLog = Join-Path $env:TEMP 'chordcraft-engine-smoke-err.log'
  $env:CHORDCRAFT_MODEL_DIR = $ModelsDir  # 冒烟测试用开发期模型目录
  $proc = $null
  try {
    $proc = Start-Process -FilePath $exe -ArgumentList @("$port") -PassThru -WindowStyle Hidden `
      -RedirectStandardOutput $outLog -RedirectStandardError $errLog
    $health = $null
    for ($i = 0; $i -lt 120 -and -not $health; $i++) {
      Start-Sleep -Milliseconds 500
      if ($proc.HasExited) { break }
      try { $health = Invoke-RestMethod -Uri "http://127.0.0.1:$port/api/health" -TimeoutSec 2 } catch { }
    }
    if (-not $health) {
      $tail = ''
      if (Test-Path $errLog) { $tail = (Get-Content $errLog -Tail 25) -join "`n" }
      throw "chordcraft-engine.exe 60s 内未就绪（exitCode=$($proc.ExitCode)）。stderr 末尾：`n$tail"
    }
    Write-Host "  /api/health 通过：version=$($health.version)"
    foreach ($key in @('acr_model', 'songformer', 'voicing_db')) {
      Write-Host ("    {0,-12} {1}" -f $key, $health.checks.$key)
    }
  } finally {
    Remove-Item Env:CHORDCRAFT_MODEL_DIR -ErrorAction SilentlyContinue
    if ($proc -and -not $proc.HasExited) { Stop-Process -Id $proc.Id -Force -ErrorAction SilentlyContinue }
  }
}

Write-Host "`nPython sidecar 构建完成：resources/python-backend（下一步运行 scripts/build-installer.ps1）" -ForegroundColor Green

