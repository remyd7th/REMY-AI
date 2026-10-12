$ErrorActionPreference = 'Stop'

$webRoot = Resolve-Path (Join-Path $PSScriptRoot '..')
$androidRoot = Join-Path $webRoot 'android'
$webAssets = Join-Path $webRoot 'www'
$androidAssets = Join-Path $androidRoot 'app/src/main/assets/public'

$jdksDirectory = Join-Path $env:USERPROFILE '.jdks'
$pinnedJdk = Get-ChildItem -LiteralPath $jdksDirectory -Directory -Filter 'jbr-21*' -ErrorAction SilentlyContinue | Sort-Object Name -Descending | Select-Object -First 1
if ($pinnedJdk) {
  $env:JAVA_HOME = $pinnedJdk.FullName
} elseif (-not $env:JAVA_HOME -or -not (Test-Path (Join-Path $env:JAVA_HOME 'bin/java.exe'))) {
  $javaPath = (Get-Command java -ErrorAction Stop).Source
  $env:JAVA_HOME = Split-Path (Split-Path $javaPath -Parent) -Parent
}

if (-not $env:GRADLE_USER_HOME -or -not (Test-Path $env:GRADLE_USER_HOME -PathType Container)) {
  $env:GRADLE_USER_HOME = Join-Path $env:TEMP 'remy-ai-gradle'
}
if (-not $env:ANDROID_USER_HOME) {
  $env:ANDROID_USER_HOME = Join-Path $androidRoot '.android'
}
New-Item -ItemType Directory -Force -Path $env:ANDROID_USER_HOME | Out-Null

if (-not (Test-Path (Join-Path $webAssets 'index.html'))) {
  throw "Missing Capacitor landing page: $(Join-Path $webAssets 'index.html')"
}

New-Item -ItemType Directory -Force -Path $androidAssets | Out-Null
Copy-Item -Path (Join-Path $webAssets '*') -Destination $androidAssets -Recurse -Force

$capacitorConfig = [ordered]@{
  appId = 'com.remy.ai'
  appName = 'Remy AI'
  webDir = 'www'
  server = @{
    allowNavigation = @('remyaii.netlify.app', 'remy-ai-api.onrender.com', 'accounts.google.com', 'www.google.com')
  }
} | ConvertTo-Json -Depth 5
$configPath = Join-Path $androidRoot 'app/src/main/assets/capacitor.config.json'
[System.IO.File]::WriteAllText($configPath, $capacitorConfig, [System.Text.UTF8Encoding]::new($false))

Push-Location $androidRoot
try {
  & .\gradlew.bat :app:assembleDebug
  if ($LASTEXITCODE -ne 0) {
    throw "Gradle failed with exit code $LASTEXITCODE"
  }
} finally {
  Pop-Location
}

$apk = Join-Path $androidRoot 'app/build/outputs/apk/debug/app-debug.apk'
if (-not (Test-Path $apk)) {
  throw "Gradle finished without producing the expected APK: $apk"
}

Write-Output "APK ready: $apk"
