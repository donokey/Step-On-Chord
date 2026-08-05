#requires -Version 5.1
<#
.SYNOPSIS
  Step On Chord — Windows 安装包构建脚本（两步构建的第二步）

.DESCRIPTION
  前置：先运行 scripts/build-backend.ps1 生成 resources/python-backend/
  1. npm run build（tsc 类型检查 + vite 构建渲染进程 + 主进程/preload）
  2. electron-builder 按 electron-builder.yml 打 NSIS 安装包
  产物：release/step-on-chord-<version>-setup.exe

.EXAMPLE
  powershell -ExecutionPolicy Bypass -File scripts\build-installer.ps1
#>
[CmdletBinding()]
param()

$ErrorActionPreference = 'Stop'
$ProjectRoot = Split-Path -Parent $PSScriptRoot
$PyBackend   = Join-Path $ProjectRoot 'resources\python-backend\chordcraft-engine.exe'

if (-not (Test-Path $PyBackend)) {
  throw "缺少 Python sidecar 产物：$PyBackend`n请先运行：powershell -ExecutionPolicy Bypass -File scripts\build-backend.ps1"
}

Set-Location $ProjectRoot

Write-Host "`n[1/2] npm run build（类型检查 + vite 构建）" -ForegroundColor Cyan
& npm.cmd run build
if ($LASTEXITCODE -ne 0) { throw "npm run build 失败（退出码 $LASTEXITCODE）" }

Write-Host "`n[2/2] electron-builder（NSIS 安装包）" -ForegroundColor Cyan
& npx.cmd electron-builder --config electron-builder.yml
if ($LASTEXITCODE -ne 0) { throw "electron-builder 失败（退出码 $LASTEXITCODE）" }

$installer = Get-ChildItem (Join-Path $ProjectRoot 'release') -Filter '*-setup.exe' -ErrorAction SilentlyContinue |
  Sort-Object LastWriteTime -Descending | Select-Object -First 1
if ($installer) {
  Write-Host "`n安装包构建完成：$($installer.FullName)（$([int]($installer.Length / 1MB)) MB）" -ForegroundColor Green
} else {
  throw '未在 release/ 下找到 *-setup.exe 产物'
}

