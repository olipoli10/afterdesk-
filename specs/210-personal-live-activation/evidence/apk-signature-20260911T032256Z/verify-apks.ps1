# Portable, controller-approved verification only. No APK execution or signing.
# Pins read from https://dl.google.com/android/repository/repository2-1.xml
# and https://api.adoptium.net/v3/assets/feature_releases/17/ga (Windows x64 JRE).
$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest
$taskRoot = 'C:\dev\endvera-astra-r03\.scratch\apk-signature-verification-20260911T031954Z'
if ($PSScriptRoot -cne $taskRoot) { throw 'UNEXPECTED_SCRIPT_DIRECTORY' }
function Assert-RegularPath([string]$path) {
    $cursor = [IO.Path]::GetFullPath($path)
    while ($cursor) {
        if (Test-Path -LiteralPath $cursor) {
            if ((Get-Item -LiteralPath $cursor -Force).Attributes -band [IO.FileAttributes]::ReparsePoint) { throw 'REPARSE_PATH' }
        }
        $cursor = [IO.Path]::GetDirectoryName($cursor)
    }
}
Assert-RegularPath $taskRoot
if (@(Get-ChildItem -LiteralPath $taskRoot -Force).Count -ne 1) { throw 'REQUIRES_FRESH_OWNED_DIRECTORY' }
$archives = @(
    @{ name='android-build-tools-36.0.0.zip'; uri='https://dl.google.com/android/repository/build-tools_r36_windows.zip'; size=58699878L; algorithm='SHA1'; digest='f16ccffd34de8790dede813a6c7d8e2c11a27b50'; folder='android'; allowedHosts=@('dl.google.com') },
    @{ name='temurin-jre-17.0.20.1+1.zip'; uri='https://github.com/adoptium/temurin17-binaries/releases/download/jdk-17.0.20.1%2B1/OpenJDK17U-jre_x64_windows_hotspot_17.0.20.1_1.zip'; size=43780109L; algorithm='SHA256'; digest='bc21a93923103cdaac93ee337b0ae4365e739fde36df823dd456bc67c8a9d352'; folder='java'; allowedHosts=@('github.com','release-assets.githubusercontent.com') }
)
$apkInputs = @(
    @{ name='android5'; path='C:\dev\endvera-astra-r03\.scratch\endvera-android-5-cb38a5da.apk'; digest='bf034e6b8ce0b28ebe49228524714a9ba7e9120c7155d9e3ce0747fd9f788e9e' },
    @{ name='android4'; path='C:\Users\oliro\Downloads\application-fccebc0b-b48f-4a99-99e2-5eda00d37711.apk'; digest='f33de2e1076d6bffeaf644371197b04153c371649d2d2dd82495758caeb1907e' }
)
function Sha256([string]$path) { (Get-FileHash -LiteralPath $path -Algorithm SHA256).Hash.ToLowerInvariant() }
function Download-Pinned($spec) {
    $handler = [Net.Http.HttpClientHandler]::new()
    $handler.AllowAutoRedirect = $false
    $handler.UseCookies = $false
    $handler.UseDefaultCredentials = $false
    $client = [Net.Http.HttpClient]::new($handler)
    $client.Timeout = [Threading.Timeout]::InfiniteTimeSpan
    $cts = [Threading.CancellationTokenSource]::new([TimeSpan]::FromSeconds(120))
    $response = $null
    try {
        $uri = [Uri]$spec.uri
        for ($hop=0; $hop -lt 4; $hop++) {
            if ($uri.Scheme -cne 'https' -or $uri.Port -ne 443 -or $uri.UserInfo -or $uri.Host -cnotin $spec.allowedHosts) { throw 'DOWNLOAD_TARGET_REFUSED' }
            $request = [Net.Http.HttpRequestMessage]::new([Net.Http.HttpMethod]::Get,$uri)
            try { $response = $client.SendAsync($request,[Net.Http.HttpCompletionOption]::ResponseHeadersRead,$cts.Token).GetAwaiter().GetResult() } finally { $request.Dispose() }
            if ([int]$response.StatusCode -in @(301,302,303,307,308)) {
                $location = $response.Headers.Location
                if ($null -eq $location) { throw 'MISSING_REDIRECT' }
                $uri = [Uri]::new($uri,$location)
                $response.Dispose(); $response=$null
                continue
            }
            break
        }
        if ($null -eq $response -or [int]$response.StatusCode -ne 200) { throw 'DOWNLOAD_HTTP_REFUSED' }
        if ($null -ne $response.Content.Headers.ContentLength -and $response.Content.Headers.ContentLength -ne $spec.size) { throw 'DOWNLOAD_LENGTH_HEADER' }
        $path = Join-Path $taskRoot $spec.name
        $file = [IO.File]::Open($path,[IO.FileMode]::CreateNew,[IO.FileAccess]::Write,[IO.FileShare]::None)
        $stream = $response.Content.ReadAsStreamAsync($cts.Token).GetAwaiter().GetResult()
        try {
            $buffer = [byte[]]::new(65536); $total=0L
            while (($read=$stream.ReadAsync($buffer,0,$buffer.Length,$cts.Token).GetAwaiter().GetResult()) -gt 0) {
                $total += $read
                if ($total -gt $spec.size) { throw 'DOWNLOAD_SIZE_EXCEEDED' }
                $file.Write($buffer,0,$read)
            }
            if ($total -ne $spec.size) { throw 'DOWNLOAD_SIZE_MISMATCH' }
        } finally { $stream.Dispose(); $file.Dispose() }
        $actual = (Get-FileHash -LiteralPath $path -Algorithm $spec.algorithm).Hash.ToLowerInvariant()
        if ($actual -cne $spec.digest) { throw 'SUPPLIER_DIGEST_MISMATCH' }
        return @{ name=$spec.name; source=$spec.uri; bytes=$total; supplierAlgorithm=$spec.algorithm; supplierDigest=$actual; sha256=(Sha256 $path) }
    } finally { if ($response) { $response.Dispose() }; $cts.Dispose(); $client.Dispose(); $handler.Dispose() }
}
function Extract-Checked($spec) {
    $destination = Join-Path $taskRoot $spec.folder
    $zip = [IO.Compression.ZipFile]::OpenRead((Join-Path $taskRoot $spec.name))
    try {
        if ($zip.Entries.Count -lt 1 -or $zip.Entries.Count -gt 20000) { throw 'ZIP_COUNT' }
        $seen = [Collections.Generic.HashSet[string]]::new([StringComparer]::OrdinalIgnoreCase)
        $total=0L
        foreach ($entry in $zip.Entries) {
            $name=$entry.FullName
            if (!$name -or $name.Length -gt 512 -or $name.Contains('\') -or $name.Contains(':') -or $name.StartsWith('/') -or $name -match '[\x00-\x1f]' -or ($name.Split('/') | Where-Object { $_ -in @('.','..') -or $_.EndsWith('.') -or $_.EndsWith(' ') })) { throw 'ZIP_PATH' }
            if (!$seen.Add($name.TrimEnd('/'))) { throw 'ZIP_DUPLICATE' }
            $mode=($entry.ExternalAttributes -shr 16) -band 0xF000
            if ($mode -notin @(0,0x8000,0x4000) -or ($entry.ExternalAttributes -band 0x400)) { throw 'ZIP_LINK_OR_SPECIAL' }
            $resolved=[IO.Path]::GetFullPath((Join-Path $destination $name))
            if (!$resolved.StartsWith($destination+'\',[StringComparison]::OrdinalIgnoreCase)) { throw 'ZIP_ESCAPE' }
            $total += $entry.Length
            if ($entry.Length -gt 268435456 -or $total -gt 536870912) { throw 'ZIP_SIZE' }
        }
        [IO.Directory]::CreateDirectory($destination) | Out-Null
        foreach ($entry in $zip.Entries) {
            $path=Join-Path $destination $entry.FullName
            if ($entry.FullName.EndsWith('/')) { [IO.Directory]::CreateDirectory($path) | Out-Null; continue }
            [IO.Directory]::CreateDirectory([IO.Path]::GetDirectoryName($path)) | Out-Null
            Assert-RegularPath $path
            $inputStream=$entry.Open(); $outStream=[IO.File]::Open($path,[IO.FileMode]::CreateNew,[IO.FileAccess]::Write,[IO.FileShare]::None)
            try {
                $buffer=[byte[]]::new(65536); $count=0L
                while (($read=$inputStream.Read($buffer,0,$buffer.Length)) -gt 0) {
                    $count += $read
                    if ($count -gt $entry.Length) { throw 'ZIP_ENTRY_EXPANDED_SIZE' }
                    $outStream.Write($buffer,0,$read)
                }
                if ($count -ne $entry.Length) { throw 'ZIP_ENTRY_TRUNCATED' }
            } finally { $inputStream.Dispose(); $outStream.Dispose() }
        }
        return @{ entries=$zip.Entries.Count; expandedBytes=$total; destination=$destination }
    } finally { $zip.Dispose() }
}
function Invoke-JavaBounded([string]$java,[string[]]$arguments,[string]$name) {
    $start=[Diagnostics.ProcessStartInfo]::new()
    $start.FileName=$java; $start.UseShellExecute=$false; $start.CreateNoWindow=$true
    $start.WorkingDirectory=$taskRoot; $start.RedirectStandardOutput=$true; $start.RedirectStandardError=$true; $start.RedirectStandardInput=$true
    $start.Environment.Clear()
    foreach ($key in @('SystemRoot','WINDIR')) { $start.Environment[$key]=[Environment]::GetEnvironmentVariable($key) }
    $start.Environment['TEMP']=Join-Path $taskRoot 'tmp'; $start.Environment['TMP']=$start.Environment['TEMP']
    foreach ($arg in @('-Xmx512m','-XX:-UsePerfData',('-Djava.io.tmpdir='+$start.Environment['TEMP']),('-Duser.home='+(Join-Path $taskRoot 'home'))) + $arguments) { $start.ArgumentList.Add($arg) }
    $process=[Diagnostics.Process]::new(); $process.StartInfo=$start
    $timer=[Diagnostics.Stopwatch]::StartNew()
    $out=[Text.StringBuilder]::new(); $err=[Text.StringBuilder]::new()
    try {
        if (!$process.Start()) { throw 'JAVA_START_REFUSED' }
        $process.StandardInput.Close()
        $ob=[char[]]::new(4096); $eb=[char[]]::new(4096)
        $ot=$process.StandardOutput.ReadAsync($ob,0,$ob.Length); $et=$process.StandardError.ReadAsync($eb,0,$eb.Length)
        while ($null -ne $ot -or $null -ne $et -or !$process.HasExited) {
            if ($timer.Elapsed.TotalSeconds -ge 90) { throw 'JAVA_DEADLINE' }
            if ($ot -and $ot.IsCompleted) {
                $n=$ot.GetAwaiter().GetResult()
                if ($n -eq 0) { $ot=$null } else { [void]$out.Append($ob,0,$n); $ot=$process.StandardOutput.ReadAsync($ob,0,$ob.Length) }
            }
            if ($et -and $et.IsCompleted) {
                $n=$et.GetAwaiter().GetResult()
                if ($n -eq 0) { $et=$null } else { [void]$err.Append($eb,0,$n); $et=$process.StandardError.ReadAsync($eb,0,$eb.Length) }
            }
            if ($out.Length+$err.Length -gt 1048576) { throw 'JAVA_OUTPUT_LIMIT' }
            [Threading.Thread]::Sleep(10)
        }
        $stdout=$out.ToString(); $stderr=$err.ToString()
        [IO.File]::WriteAllText((Join-Path $taskRoot ($name+'.stdout.txt')),$stdout)
        [IO.File]::WriteAllText((Join-Path $taskRoot ($name+'.stderr.txt')),$stderr)
        return @{ name=$name; arguments=$arguments; exitCode=$process.ExitCode; elapsedMs=$timer.ElapsedMilliseconds; stdout=$stdout; stderr=$stderr }
    } finally {
        if ($process.Id -and !$process.HasExited) { $process.Kill($true); [void]$process.WaitForExit(2000) }
        $process.Dispose()
    }
}
$receipt=[ordered]@{ version='local-apk-signature-verification-v1'; startedAt=[DateTime]::UtcNow.ToString('o'); helperSha256=(Sha256 $PSCommandPath); downloads=@(); extraction=@(); inputs=@(); commands=@(); cryptographicSignatureVerified=$false; certificateContinuityVerified=$false; apkExecuted=$false; installed=$false; errorCode=$null }
try {
    foreach ($apk in $apkInputs) {
        Assert-RegularPath $apk.path
        $hash=Sha256 $apk.path
        if ($hash -cne $apk.digest) { throw 'APK_INITIAL_HASH' }
        $receipt.inputs += @{ name=$apk.name; path=$apk.path; beforeSha256=$hash; afterSha256=$null; signerCertificateSha256=@() }
    }
    foreach ($spec in $archives) { Write-Output ('Downloading pinned archive: '+$spec.name); $receipt.downloads += Download-Pinned $spec }
    foreach ($spec in $archives) { $receipt.extraction += Extract-Checked $spec }
    $javaMatches=@(Get-ChildItem -LiteralPath (Join-Path $taskRoot 'java') -Filter java.exe -Recurse -File)
    $jarMatches=@(Get-ChildItem -LiteralPath (Join-Path $taskRoot 'android') -Filter apksigner.jar -Recurse -File)
    if ($javaMatches.Count -ne 1 -or $jarMatches.Count -ne 1) { throw 'TOOL_INVENTORY' }
    $java=$javaMatches[0].FullName; $jar=$jarMatches[0].FullName
    Assert-RegularPath $java; Assert-RegularPath $jar
    $receipt.tools=@{ java=@{ path=$java; sha256=(Sha256 $java) }; apksigner=@{ path=$jar; sha256=(Sha256 $jar) } }
    foreach ($folder in @('tmp','home')) { [IO.Directory]::CreateDirectory((Join-Path $taskRoot $folder)) | Out-Null }
    $javaVersion=Invoke-JavaBounded $java @('-version') 'java-version'; $receipt.commands += $javaVersion
    if ($javaVersion.exitCode -ne 0 -or $javaVersion.stderr -notmatch '17\.0\.20\.1') { throw 'JAVA_VERSION' }
    $signerVersion=Invoke-JavaBounded $java @('-jar',$jar,'version') 'apksigner-version'; $receipt.commands += $signerVersion
    if ($signerVersion.exitCode -ne 0) { throw 'APKSIGNER_VERSION' }
    foreach ($apk in $apkInputs) {
        Write-Output ('Verifying local APK: '+$apk.name)
        $verification=Invoke-JavaBounded $java @('-jar',$jar,'verify','--verbose','--print-certs',$apk.path) ($apk.name+'-verify')
        $receipt.commands += $verification
        $certs=@([regex]::Matches($verification.stdout,'(?m)^Signer #\d+ certificate SHA-256 digest: ([0-9a-fA-F]{64})\s*$') | ForEach-Object { $_.Groups[1].Value.ToLowerInvariant() })
        ($receipt.inputs | Where-Object name -eq $apk.name).signerCertificateSha256=$certs
    }
    $verificationResults=@($receipt.commands | Where-Object { $_.name -like '*-verify' })
    $receipt.cryptographicSignatureVerified=($verificationResults.Count -eq 2 -and @($verificationResults | Where-Object exitCode -ne 0).Count -eq 0)
    $first=@($receipt.inputs[0].signerCertificateSha256 | Sort-Object); $second=@($receipt.inputs[1].signerCertificateSha256 | Sort-Object)
    $receipt.certificateContinuityVerified=($receipt.cryptographicSignatureVerified -and $first.Count -gt 0 -and $first.Count -eq $second.Count -and ($first -join ',') -ceq ($second -join ','))
} catch {
    # Fixed local error labels only; never retain redirect URLs/ambient environment.
    $message=$_.Exception.Message
    $receipt.errorCode=if ($message -cmatch '^[A-Z_]{3,80}$') { $message } else { 'LOCAL_VERIFICATION_FAILED' }
} finally {
    foreach ($record in $receipt.inputs) { $record.afterSha256=Sha256 $record.path }
    $receipt.inputsUnchanged=(@($receipt.inputs | Where-Object { $_.beforeSha256 -cne $_.afterSha256 }).Count -eq 0 -and $receipt.inputs.Count -eq 2)
    $receipt.finishedAt=[DateTime]::UtcNow.ToString('o')
    $receiptPath=Join-Path $taskRoot 'receipt.json'
    [IO.File]::WriteAllText($receiptPath,($receipt | ConvertTo-Json -Depth 12))
    Write-Output ($receipt | ConvertTo-Json -Depth 12)
    Write-Output ('Receipt SHA256: '+(Sha256 $receiptPath))
}
if ($receipt.errorCode -or !$receipt.cryptographicSignatureVerified -or !$receipt.certificateContinuityVerified -or !$receipt.inputsUnchanged) { exit 1 }
