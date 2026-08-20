# Build Android APKs locally.
# Requirements: JDK 21, Android SDK, ANDROID_HOME or ANDROID_SDK_ROOT.
# For signed release builds without a local Android toolchain, push a version tag
# and let .github/workflows/android-build.yml build with repository secrets.

$ErrorActionPreference = 'Stop'
$root = $PSScriptRoot
Set-Location $root

if (-not (Get-Command java -ErrorAction SilentlyContinue)) {
    throw '未找到 Java。请安装 JDK 21，或推送版本标签使用 GitHub Actions 构建。'
}
if (-not $env:ANDROID_HOME -and -not $env:ANDROID_SDK_ROOT) {
    throw '未设置 ANDROID_HOME / ANDROID_SDK_ROOT。请配置 Android SDK，或推送版本标签使用 GitHub Actions 构建。'
}

& "$root\scripts\build-apk-local.ps1"
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
