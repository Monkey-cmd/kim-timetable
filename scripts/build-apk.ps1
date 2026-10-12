param([string]$JavaHome='', [string]$AndroidSdkRoot='', [switch]$NoSync, [switch]$TcpLoopbackWorkaround)
$ErrorActionPreference = 'Stop'
$projectRoot = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$toolchainRoot = [System.IO.Path]::GetFullPath((Join-Path $projectRoot '../android-build-tools'))
if (-not $JavaHome) {
    if ($env:JAVA_HOME) { $JavaHome = $env:JAVA_HOME }
    elseif (Test-Path -LiteralPath (Join-Path $toolchainRoot 'jdk')) {
        $jdkDirectory = Get-ChildItem -LiteralPath (Join-Path $toolchainRoot 'jdk') -Directory | Where-Object { Test-Path -LiteralPath (Join-Path $_.FullName 'bin/java.exe') } | Select-Object -First 1
        if ($jdkDirectory) { $JavaHome = $jdkDirectory.FullName }
    }
}
if (-not $AndroidSdkRoot) { $AndroidSdkRoot = Join-Path $toolchainRoot 'android-sdk' }
if (-not (Test-Path -LiteralPath (Join-Path $AndroidSdkRoot 'platforms/android-36/android.jar'))) {
    throw 'Android SDK API 36 is missing. Install the SDK after explicitly accepting the Google SDK license.'
}
if (-not $JavaHome -or -not (Test-Path -LiteralPath (Join-Path $JavaHome 'bin/javac.exe'))) { throw 'Java 21 JDK is required. Pass -JavaHome or prepare the portable JDK.' }
$env:JAVA_HOME = [System.IO.Path]::GetFullPath($JavaHome)
$env:PATH = (Join-Path $env:JAVA_HOME 'bin') + ';' + $env:PATH
$env:ANDROID_HOME = [System.IO.Path]::GetFullPath($AndroidSdkRoot)
$env:ANDROID_SDK_ROOT = $env:ANDROID_HOME
$env:GRADLE_USER_HOME = Join-Path $toolchainRoot 'gradle-cache'
$env:ANDROID_USER_HOME = Join-Path $toolchainRoot 'android-user'
if ($TcpLoopbackWorkaround) {
    # A missing Unix socket directory makes the JDK use its normal TCP pipe fallback.
    # This is process-local and works around AF_UNIX failures in the desktop runner.
    $socketDirectory = Join-Path $toolchainRoot 'tcp-only-no-unix-sockets'
    if (Test-Path -LiteralPath $socketDirectory) { throw 'The TCP fallback socket path must not exist' }
    $env:JAVA_TOOL_OPTIONS = ($env:JAVA_TOOL_OPTIONS + ' "-Djdk.net.unixdomain.tmpdir=' + $socketDirectory + '"').Trim()
}
if (-not $NoSync) {
    Push-Location $projectRoot
    try {
        & node scripts/sync-web.mjs
        if ($LASTEXITCODE -ne 0) { throw 'Web asset preparation failed' }
        & node node_modules/@capacitor/cli/bin/capacitor sync android
        if ($LASTEXITCODE -ne 0) { throw 'Android sync failed' }
    } finally { Pop-Location }
}
$outputRoot = Join-Path $projectRoot 'build-output'
New-Item -ItemType Directory -Path $outputRoot -Force | Out-Null
$debugKey = Join-Path $outputRoot 'demo-debug.keystore'
if (-not (Test-Path -LiteralPath $debugKey)) {
    & (Join-Path $env:JAVA_HOME 'bin/keytool.exe') -genkeypair -keystore $debugKey -storepass android -keypass android -alias androiddebugkey -dname 'CN=Android Debug,O=Android,C=CN' -keyalg RSA -keysize 2048 -validity 10000
    if ($LASTEXITCODE -ne 0) { throw 'Demo signing key creation failed' }
}
# A temporary ASCII project path avoids Android Windows path restrictions.
$tempBase = [System.IO.Path]::GetFullPath([System.IO.Path]::GetTempPath())
$stagingRoot = [System.IO.Path]::GetFullPath((Join-Path $tempBase ('Kim-timetable-build-' + [guid]::NewGuid().ToString('N'))))
if (-not $stagingRoot.StartsWith($tempBase, [System.StringComparison]::OrdinalIgnoreCase)) { throw 'Invalid build staging path' }
New-Item -ItemType Directory -Path $stagingRoot -Force | Out-Null
Copy-Item -LiteralPath (Join-Path $projectRoot 'android') -Destination (Join-Path $stagingRoot 'android') -Recurse
foreach ($pluginName in @('android','app','preferences')) {
    $pluginDestination = Join-Path $stagingRoot ('node_modules/@capacitor/' + $pluginName)
    New-Item -ItemType Directory -Path (Split-Path -Parent $pluginDestination) -Force | Out-Null
    Copy-Item -LiteralPath (Join-Path $projectRoot ('node_modules/@capacitor/' + $pluginName)) -Destination $pluginDestination -Recurse
}
New-Item -ItemType Directory -Path (Join-Path $stagingRoot 'build-output') -Force | Out-Null
Copy-Item -LiteralPath $debugKey -Destination (Join-Path $stagingRoot 'build-output/demo-debug.keystore')
$sdkProperty = 'sdk.dir=' + $env:ANDROID_HOME.Replace('\','/')
[System.IO.File]::WriteAllText((Join-Path $stagingRoot 'android/local.properties'), $sdkProperty + "`n", [System.Text.UTF8Encoding]::new($false))
Write-Output ('Build workspace: ' + $stagingRoot)
Push-Location (Join-Path $stagingRoot 'android')
try {
    & .\gradlew.bat --no-daemon --max-workers=2 --console=plain assembleDebug
    if ($LASTEXITCODE -ne 0) { throw ('Android build failed. Build workspace retained: ' + $stagingRoot) }
} finally { Pop-Location }
$builtApk = Join-Path $stagingRoot 'android/app/build/outputs/apk/debug/app-debug.apk'
if (-not (Test-Path -LiteralPath $builtApk)) { throw 'Build finished without an APK' }
$apkPath = Join-Path $outputRoot 'kim-timetable-0.3.0-demo.apk'
Copy-Item -LiteralPath $builtApk -Destination $apkPath -Force
$buildTools = Get-ChildItem -LiteralPath (Join-Path $env:ANDROID_HOME 'build-tools') -Directory | Sort-Object Name -Descending | Select-Object -First 1
& (Join-Path $buildTools.FullName 'apksigner.bat') verify --verbose $apkPath
if ($LASTEXITCODE -ne 0) { throw 'APK signature verification failed' }
Get-FileHash -LiteralPath $apkPath -Algorithm SHA256
Write-Output ('APK ready: ' + $apkPath)
