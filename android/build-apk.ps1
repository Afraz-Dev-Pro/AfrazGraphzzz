$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

$project = Split-Path -Parent $MyInvocation.MyCommand.Path
$workspace = Split-Path -Parent $project
$sdkCandidates = @($env:ANDROID_HOME, $env:ANDROID_SDK_ROOT, (Join-Path $env:USERPROFILE 'AppData\Local\Android\Sdk'), 'C:\Users\afraz\AppData\Local\Android\Sdk') | Where-Object { $_ -and (Test-Path -LiteralPath (Join-Path $_ 'build-tools\36.0.0\aapt2.exe')) }
if (-not $sdkCandidates) { throw 'Android SDK build-tools 36.0.0 were not found.' }
$sdk = $sdkCandidates[0]
$javaCandidates = @(@($env:JAVA_HOME, 'C:\Program Files\Android\Android Studio\jbr') | Where-Object { $_ -and (Test-Path -LiteralPath (Join-Path $_ 'bin\javac.exe')) })
if (-not $javaCandidates) { throw 'A JDK with javac was not found.' }
$javaHome = $javaCandidates[0]
$env:JAVA_HOME = $javaHome
$env:PATH = "$javaHome\bin;$env:PATH"
$buildTools = Join-Path $sdk 'build-tools\36.0.0'
$platform = Join-Path $sdk 'platforms\android-37.2'
$androidJar = Join-Path $platform 'android.jar'
$resourceDir = Join-Path $project 'app\src\main\res'
$sourceDir = Join-Path $project 'app\src\main\java'
$manifest = Join-Path $project 'app\src\main\AndroidManifest.xml'
$assets = Join-Path $project 'app\src\main\assets'
$build = Join-Path $project 'build\manual-apk'
$output = Join-Path $workspace 'build\AfrazGraphzzz-1.1.apk'

foreach ($required in @((Join-Path $buildTools 'aapt2.exe'), (Join-Path $buildTools 'd8.bat'), (Join-Path $buildTools 'zipalign.exe'), (Join-Path $buildTools 'apksigner.bat'), (Join-Path $javaHome 'bin\javac.exe'), (Join-Path $javaHome 'bin\jar.exe'), (Join-Path $javaHome 'bin\keytool.exe'), $androidJar)) {
    if (-not (Test-Path -LiteralPath $required)) { throw "Android build tool not found: $required" }
}

New-Item -ItemType Directory -Force -Path $assets, $build, (Split-Path -Parent $output) | Out-Null
Copy-Item -LiteralPath (Join-Path $workspace 'index.html') -Destination $assets
Copy-Item -LiteralPath (Join-Path $workspace 'styles.css') -Destination $assets
Copy-Item -LiteralPath (Join-Path $workspace 'app.js') -Destination $assets
Copy-Item -LiteralPath (Join-Path $workspace 'icon.svg') -Destination $assets

$compiledResources = Join-Path $build 'compiled-resources.zip'
$generated = Join-Path $build 'generated'
$classes = Join-Path $build 'classes'
$dex = Join-Path $build 'dex'
$unsigned = Join-Path $build 'app-unsigned.apk'
$aligned = Join-Path $build 'app-aligned.apk'
$keystore = Join-Path $project 'debug.keystore'
if (Test-Path -LiteralPath $build) {
    $projectRoot = (Resolve-Path -LiteralPath $project).Path.TrimEnd('\') + '\'
    $resolvedBuild = (Resolve-Path -LiteralPath $build).Path
    if (-not $resolvedBuild.StartsWith($projectRoot, [System.StringComparison]::OrdinalIgnoreCase)) { throw "Refusing to clear build files outside the Android project: $resolvedBuild" }
    Remove-Item -LiteralPath $resolvedBuild -Recurse -Force
}
New-Item -ItemType Directory -Force -Path $generated, $classes, $dex | Out-Null

& (Join-Path $buildTools 'aapt2.exe') compile --dir $resourceDir -o $compiledResources
if ($LASTEXITCODE -ne 0) { throw 'Android resource compilation failed.' }
& (Join-Path $buildTools 'aapt2.exe') link --manifest $manifest -I $androidJar --min-sdk-version 23 --target-sdk-version 35 --version-code 2 --version-name 1.1 --java $generated -o $unsigned -A $assets $compiledResources
if ($LASTEXITCODE -ne 0) { throw 'Android package resource linking failed.' }

$rSource = Join-Path $generated 'com\graphite\calculator\R.java'
$mainSource = Join-Path $sourceDir 'com\graphite\calculator\MainActivity.java'
& (Join-Path $javaHome 'bin\javac.exe') -source 8 -target 8 -classpath $androidJar -d $classes $rSource $mainSource
if ($LASTEXITCODE -ne 0) { throw 'Android Java compilation failed.' }
$classFiles = @(Get-ChildItem -LiteralPath $classes -Filter '*.class' -Recurse | ForEach-Object { $_.FullName })
& (Join-Path $buildTools 'd8.bat') --lib $androidJar --min-api 23 --output $dex $classFiles
if ($LASTEXITCODE -ne 0) { throw 'Android bytecode conversion failed.' }
& (Join-Path $javaHome 'bin\jar.exe') uf $unsigned -C $dex classes.dex
if ($LASTEXITCODE -ne 0) { throw 'Adding compiled Android code to the APK failed.' }
& (Join-Path $buildTools 'zipalign.exe') -f 4 $unsigned $aligned
if ($LASTEXITCODE -ne 0) { throw 'APK alignment failed.' }

if (-not (Test-Path -LiteralPath $keystore)) {
    & (Join-Path $javaHome 'bin\keytool.exe') -genkeypair -keystore $keystore -storepass android -keypass android -alias androiddebugkey -dname 'CN=Android Debug,O=Android,C=US' -keyalg RSA -keysize 2048 -validity 10000
    if ($LASTEXITCODE -ne 0) { throw 'Creating the local debug signing key failed.' }
}
foreach ($artifact in @($output, "$output.idsig")) { if (Test-Path -LiteralPath $artifact) { Remove-Item -LiteralPath $artifact -Force } }
& (Join-Path $buildTools 'apksigner.bat') sign --v4-signing-enabled false --ks $keystore --ks-pass pass:android --key-pass pass:android --out $output $aligned
if ($LASTEXITCODE -ne 0) { throw 'Signing the APK failed.' }
& (Join-Path $buildTools 'apksigner.bat') verify --verbose $output
if ($LASTEXITCODE -ne 0) { throw 'APK signature verification failed.' }

Write-Output "APK created: $output"
