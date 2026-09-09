# Local Android dev-build helper for Windows.
#
# Bundles every quirk that makes `expo run:android` fail on this machine:
#   1. CMake 3.22.1's bundled ninja 1.10.2 hits "manifest still dirty after
#      100 tries" on Windows. The build therefore needs a newer CMake.
#   2. `expo prebuild --clean` wipes android/local.properties (our CMake pin),
#      so it is rewritten here after every prebuild.
#   3. Leftover native CMake caches (.cxx) reference deleted CMake dirs and
#      break the build; they are cleared before compiling.
#
# Usage (from the mobile/ directory):
#   .\scripts\android-build.ps1            # prebuild + build
#   .\scripts\android-build.ps1 -Install    # also installs to a connected phone
#
# Skip the prebuild with -NoPrebuild when only Java/Kotlin changed.

param(
  [switch]$Install,
  [switch]$NoPrebuild
)

$ErrorActionPreference = 'Stop'

$javaHome = 'C:\Program Files\Eclipse Adoptium\jdk-17.0.20.101-hotspot'
$sdkHome  = "$env:LOCALAPPDATA\Android\Sdk"
$mobile   = Split-Path -Parent $PSScriptRoot
$cmakeDir = "$sdkHome\cmake\3.31.6"

if (-not (Test-Path "$cmakeDir\bin\cmake.exe")) {
  Write-Host "Newer CMake not found at $cmakeDir" -ForegroundColor Red
  Write-Host 'Install it: Android Studio > SDK Manager > SDK Tools > CMake 3.31.x, then rerun.'
  exit 1
}

# 3.22.1 still present means Studio's default ninja can get picked up again.
$legacy = "$sdkHome\cmake\3.22.1"
if (Test-Path $legacy) {
  Write-Host "Removing legacy CMake 3.22.1 (broken ninja) from the SDK..." -ForegroundColor Yellow
  Remove-Item -Recurse -Force $legacy
}

if (-not $NoPrebuild) {
  Push-Location $mobile
  try {
    npx expo prebuild --platform android --clean
    if ($LASTEXITCODE -ne 0) { throw 'expo prebuild failed' }
  } finally {
    Pop-Location
  }
}

# Re-pin CMake (prebuild --clean deletes local.properties) and the SDK path.
$props = @(
  'sdk.dir=' + $sdkHome.Replace('\', '\\').Replace(':', '\:'),
  'cmake.dir=' + $cmakeDir.Replace('\', '\\').Replace(':', '\:')
) -join "`n"
Set-Content -Path "$mobile\android\local.properties" -Value $props -NoNewline

# Clear stale native caches that may reference deleted CMake dirs.
$cxxDirs = @(
  "$mobile\node_modules\expo\node_modules\expo-modules-core\android\.cxx",
  "$mobile\node_modules\react-native-reanimated\android\.cxx",
  "$mobile\node_modules\react-native-screens\android\.cxx",
  "$mobile\node_modules\react-native-worklets\android\.cxx"
)
foreach ($dir in $cxxDirs) {
  if (Test-Path $dir) {
    Write-Host "Clearing $dir"
    Remove-Item -Recurse -Force $dir
  }
}

Push-Location "$mobile\android"
try {
  $env:JAVA_HOME  = $javaHome
  $env:ANDROID_HOME = $sdkHome
  .\gradlew.bat app:assembleDebug -x lint -x test
  if ($LASTEXITCODE -ne 0) { throw 'gradle build failed' }
} finally {
  Pop-Location
}

Write-Host "`nAPK: $mobile\android\app\build\outputs\apk\debug\app-debug.apk" -ForegroundColor Green

if ($Install) {
  $adb = "$sdkHome\platform-tools\adb.exe"
  if (-not (Test-Path $adb)) { throw "adb not found at $adb" }
  & $adb install -r "$mobile\android\app\build\outputs\apk\debug\app-debug.apk"
}
