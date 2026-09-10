[CmdletBinding()]
param(
  [ValidateRange(0,419430400)][long]$PriorDownloadedBytes = 0,
  [ValidateSet('BaseToolchain','OldnamesCandidate')][string]$PackageSet = 'BaseToolchain'
)
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Net.Http
Add-Type -AssemblyName System.IO.Compression
$taskRepo = (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path
$taskScratch = Join-Path $taskRepo '.scratch'
$taskRoot = Join-Path $taskScratch ('personal-msvc-inspection-' + [Guid]::NewGuid().ToString('N'))
$taskDownloadLimit = 400MB
$taskExtractLimit = if ($PackageSet -eq 'OldnamesCandidate') { 1GB } else { 4GB }
$taskDownloaded = $PriorDownloadedBytes
$taskExtracted = [long]0
$taskReceipts = [Collections.Generic.List[object]]::new()
$taskStage = 'PREFLIGHT'
$taskExit = 1

function Assert-PlainAncestors([string]$Path) {
  for ($item = Get-Item -LiteralPath $Path; $null -ne $item;) {
    if ($item.Attributes -band [IO.FileAttributes]::ReparsePoint) { throw 'TOOLCHAIN_REPARSE_REFUSED' }
    $item = if ($item -is [IO.FileInfo]) { $item.Directory } else { $item.Parent }
  }
}
function Save-Receipt {
  $receipt = @{ stage = $taskStage; packageSet = $PackageSet; catalogManifestIntegrityVerified = $false; packages = @($taskReceipts.ToArray()); downloadedBytes = $taskDownloaded; priorDownloadedBytes = $PriorDownloadedBytes; extractedBytes = $taskExtracted; limits = @{ download = $taskDownloadLimit; extraction = $taskExtractLimit }; executionAuthorized = $false; downloadedToolExecuted = $false; installerExecuted = $false; userLicenseAcceptanceSubmitted = $false; runtimeModified = $false; inspectionRoot = $taskRoot }
  [IO.File]::WriteAllText((Join-Path $taskRoot 'inspection.json'), ($receipt | ConvertTo-Json -Depth 8), [Text.UTF8Encoding]::new($false))
}
function Fetch-PublisherArchive($Package) {
  $allowedHosts = @('download.visualstudio.microsoft.com', 'api.nuget.org', 'globalcdn.nuget.org', 'codeload.github.com')
  $uri = [Uri]$Package.Url
  $handler = [Net.Http.HttpClientHandler]::new()
  $handler.AllowAutoRedirect = $false
  $client = [Net.Http.HttpClient]::new($handler)
  $client.Timeout = [TimeSpan]::FromSeconds(120)
  $deadline = [Threading.CancellationTokenSource]::new(120000)
  $response = $null
  $temporary = Join-Path $taskRoot ($Package.Name + '.partial')
  try {
    for ($redirect = 0; $redirect -le 3; $redirect++) {
      if ($uri.Scheme -ne 'https' -or $uri.Host -notin $allowedHosts -or $uri.UserInfo -or -not $uri.IsDefaultPort) { throw 'TOOLCHAIN_PUBLISHER_URL_REFUSED' }
      $response = $client.GetAsync($uri, [Net.Http.HttpCompletionOption]::ResponseHeadersRead, $deadline.Token).GetAwaiter().GetResult()
      if ([int]$response.StatusCode -in @(301,302,303,307,308)) {
        if ($redirect -eq 3 -or -not $response.Headers.Location) { throw 'TOOLCHAIN_REDIRECT_REFUSED' }
        $next = [Uri]::new($uri, $response.Headers.Location)
        $response.Dispose(); $response = $null; $uri = $next
      } else { break }
    }
    if ([int]$response.StatusCode -ne 200) { throw 'TOOLCHAIN_HTTP_FAILED' }
    $maximum = if ($Package.Size) { [long]$Package.Size } else { [long]20MB }
    if ($response.Content.Headers.ContentLength -and $response.Content.Headers.ContentLength -gt $maximum) { throw 'TOOLCHAIN_DOWNLOAD_BOUND' }
    $input = $response.Content.ReadAsStreamAsync($deadline.Token).GetAwaiter().GetResult()
    $output = [IO.File]::Open($temporary, [IO.FileMode]::CreateNew, [IO.FileAccess]::Write, [IO.FileShare]::None)
    try {
      $buffer = [byte[]]::new(65536)
      $count = [long]0
      while (($read = $input.ReadAsync($buffer, 0, $buffer.Length, $deadline.Token).GetAwaiter().GetResult()) -gt 0) {
        $count += $read; $script:taskDownloaded += $read
        if ($count -gt $maximum -or $script:taskDownloaded -gt $taskDownloadLimit) { throw 'TOOLCHAIN_DOWNLOAD_BOUND' }
        $output.Write($buffer, 0, $read)
      }
    } finally { $output.Dispose(); $input.Dispose() }
    if ($Package.Size -and $count -ne [long]$Package.Size) { throw 'TOOLCHAIN_SIZE_MISMATCH' }
    $hash = (Get-FileHash -LiteralPath $temporary -Algorithm $Package.Algorithm).Hash.ToLowerInvariant()
    $expected = $Package.Hash
    if ($Package.Algorithm -eq 'SHA512') { $expected = ([BitConverter]::ToString([Convert]::FromBase64String($expected))).Replace('-', '').ToLowerInvariant() }
    if ($expected -and $hash -ne $expected) { throw 'TOOLCHAIN_HASH_MISMATCH' }
    $archive = Join-Path $taskRoot ($Package.Name + '.' + $Package.Extension)
    [IO.File]::Move($temporary, $archive)
    return @{ name = $Package.Name; sourceUrl = $Package.Url; finalUrl = $uri.AbsoluteUri; bytes = $count; catalogBytes = $Package.CatalogSize; algorithm = $Package.Algorithm; hash = $hash; publisherDigestVerified = [bool]$expected; archive = $archive; sourceCommit = $Package.Commit }
  } finally { if ($response) { $response.Dispose() }; $deadline.Dispose(); $client.Dispose(); $handler.Dispose() }
}
function Extract-CompleteArchive($Receipt) {
  $destination = Join-Path $taskRoot ($Receipt.name + '-complete')
  $null = [IO.Directory]::CreateDirectory($destination)
  Assert-PlainAncestors $destination
  $file = [IO.File]::OpenRead($Receipt.archive)
  $zip = [IO.Compression.ZipArchive]::new($file, [IO.Compression.ZipArchiveMode]::Read)
  try {
    if ($zip.Entries.Count -gt 50000) { throw 'TOOLCHAIN_ARCHIVE_ENTRY_BOUND' }
    $targets = [Collections.Generic.HashSet[string]]::new([StringComparer]::OrdinalIgnoreCase)
    $planned = [Collections.Generic.List[object]]::new()
    $total = [long]0
    foreach ($entry in $zip.Entries) {
      $name = $entry.FullName.Replace('\','/')
      $parts = $name.TrimEnd('/').Split('/')
      if (-not $name -or $name.StartsWith('/') -or $name -match '[\x00-\x1f:<>"|?*]' -or ($parts | Where-Object { -not $_ -or $_ -in @('.','..') -or $_ -match '[. ]$|^(CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])(\.|$)' })) { throw 'TOOLCHAIN_ARCHIVE_PATH_REFUSED' }
      $mode = ($entry.ExternalAttributes -shr 16) -band 0xF000
      if ($mode -notin @(0,0x4000,0x8000) -or ($entry.ExternalAttributes -band 0x400)) { throw 'TOOLCHAIN_ARCHIVE_LINK_REFUSED' }
      $target = [IO.Path]::GetFullPath((Join-Path $destination ($name.TrimEnd('/').Replace('/','\'))))
      if (-not $target.StartsWith($destination.TrimEnd('\')+'\',[StringComparison]::OrdinalIgnoreCase) -or -not $targets.Add($target)) { throw 'TOOLCHAIN_ARCHIVE_COLLISION' }
      $total += $entry.Length
      if ($entry.Length -lt 0 -or $total + $script:taskExtracted -gt $taskExtractLimit) { throw 'TOOLCHAIN_EXTRACTION_BOUND' }
      $planned.Add(@{ entry = $entry; target = $target; directory = $name.EndsWith('/') })
    }
    foreach ($plan in $planned) {
      if ($plan.directory) { $null = [IO.Directory]::CreateDirectory($plan.target); continue }
      $parent = [IO.Path]::GetDirectoryName($plan.target)
      $null = [IO.Directory]::CreateDirectory($parent)
      Assert-PlainAncestors $parent
      $input = $plan.entry.Open()
      $output = [IO.File]::Open($plan.target,[IO.FileMode]::CreateNew,[IO.FileAccess]::Write,[IO.FileShare]::None)
      try {
        $buffer = [byte[]]::new(65536); $count = [long]0
        while (($read = $input.Read($buffer,0,$buffer.Length)) -gt 0) {
          $count += $read; $script:taskExtracted += $read
          if ($count -gt $plan.entry.Length -or $script:taskExtracted -gt $taskExtractLimit) { throw 'TOOLCHAIN_EXTRACTION_BOUND' }
          $output.Write($buffer,0,$read)
        }
        if ($count -ne $plan.entry.Length) { throw 'TOOLCHAIN_ARCHIVE_LENGTH_MISMATCH' }
      } finally { $output.Dispose(); $input.Dispose() }
    }
    $Receipt.extractedRoot = $destination; $Receipt.extractedBytes = $total; $Receipt.entryCount = $zip.Entries.Count
  } finally { $zip.Dispose(); $file.Dispose() }
}

$taskPackages = @(
  @{ Name='msvc-crt-headers'; Extension='vsix'; Size=2128977; Algorithm='SHA256'; Hash='852382a9aa73502b7849c1bcadfb603ba7175c4e8b60e6aba03c7de711d4ece5'; Url='https://download.visualstudio.microsoft.com/download/pr/c610cd8c-801b-44b8-a80a-82cc382aeb43/852382a9aa73502b7849c1bcadfb603ba7175c4e8b60e6aba03c7de711d4ece5/Microsoft.VC.14.44.17.14.CRT.Headers.base.vsix' },
  @{ Name='msvc-crt-x64'; Extension='vsix'; Size=51521199; Algorithm='SHA256'; Hash='f01f701a7bcd9587a340898c851424f6a52bb913a70c185ff0d5bf0288c5831a'; Url='https://download.visualstudio.microsoft.com/download/pr/67cf767c-5e71-47c2-a54a-cd5631e28942/f01f701a7bcd9587a340898c851424f6a52bb913a70c185ff0d5bf0288c5831a/Microsoft.VC.14.44.17.14.CRT.x64.Desktop.base.vsix' },
  @{ Name='msvc-tools-x64'; Extension='vsix'; Size=26660160; Algorithm='SHA256'; Hash='ee0baaa3a112d255f19f6c27dcc0ff6e496949eb9f1f37be0ac908c562a7076c'; Url='https://download.visualstudio.microsoft.com/download/pr/bbc72d8e-2acd-4229-8f6a-85e23c5e3456/ee0baaa3a112d255f19f6c27dcc0ff6e496949eb9f1f37be0ac908c562a7076c/Microsoft.VC.14.44.17.14.Tools.HostX64.TargetX64.base.vsix' },
  @{ Name='msvc-tools-resources'; Extension='vsix'; Size=225537; Algorithm='SHA256'; Hash='6e31f47833bfa585f56d55716a1ef081f1434f93ad77160eab49c6e193765832'; Url='https://download.visualstudio.microsoft.com/download/pr/bbc72d8e-2acd-4229-8f6a-85e23c5e3456/6e31f47833bfa585f56d55716a1ef081f1434f93ad77160eab49c6e193765832/Microsoft.VC.14.44.17.14.Tools.HostX64.TargetX64.Res.base.enu.vsix' },
  @{ Name='windows-sdk-cpp'; Extension='nupkg'; Size=160512239; Algorithm='SHA512'; Hash='MqsFt32HBBS/8VDK3Z0SlLFqWtm4wwZjZ8laUqJGRw6iboobY7LV7CZXjzs1xPzhbZNQEkGpvid/6+ajttO8Sg=='; Url='https://api.nuget.org/v3-flatcontainer/microsoft.windows.sdk.cpp/10.0.26100.9169/microsoft.windows.sdk.cpp.10.0.26100.9169.nupkg' },
  @{ Name='windows-sdk-x64'; Extension='nupkg'; Size=53001499; Algorithm='SHA512'; Hash='d8D2Bw+8GYiZOHR8JTdCB5IlXeliIyPNy6/Bc37R4HIaN3z3L2XMy+bi2rcXIvR/7gMfW7v4KRDhgpIGnvKA6g=='; Url='https://api.nuget.org/v3-flatcontainer/microsoft.windows.sdk.cpp.x64/10.0.26100.9169/microsoft.windows.sdk.cpp.x64.10.0.26100.9169.nupkg' },
  @{ Name='pgvector-source'; Extension='zip'; Size=$null; Algorithm='SHA256'; Hash=$null; Commit='8ee86c96f0fd72390f890aa8a336fda6d3ab4c6c'; Url='https://codeload.github.com/pgvector/pgvector/zip/8ee86c96f0fd72390f890aa8a336fda6d3ab4c6c' }
)
# The catalogue's four VSIX sizes differ from the current publisher responses;
# retain both values and preserve the exact original publisher cryptographic pins.
$taskObservedVsixSizes = @{ 'msvc-crt-headers'=2116223; 'msvc-crt-x64'=50776097; 'msvc-tools-x64'=26604670; 'msvc-tools-resources'=231770 }
foreach ($package in $taskPackages) {
  $package.CatalogSize = $package.Size
  if ($taskObservedVsixSizes.ContainsKey($package.Name)) { $package.Size = $taskObservedVsixSizes[$package.Name] }
}
if ($PackageSet -eq 'OldnamesCandidate') {
  # Explicit one-package lane. Never reacquire the original six packages/source or relax this pin.
  $taskPackages = @(@{ Name='msvc-crt-x64-store'; Extension='vsix'; Size=27596908; CatalogSize=28032384; Algorithm='SHA256'; Hash='9135b03c0df53c7a0aa9bef7230a1c2ff4263a0ee7baa7e419d034f484f6bb56'; Url='https://download.visualstudio.microsoft.com/download/pr/67cf767c-5e71-47c2-a54a-cd5631e28942/9135b03c0df53c7a0aa9bef7230a1c2ff4263a0ee7baa7e419d034f484f6bb56/Microsoft.VC.14.44.17.14.CRT.x64.Store.base.vsix' })
}
try {
  if ($PackageSet -eq 'OldnamesCandidate' -and $PriorDownloadedBytes -ne 295586127) { throw 'TOOLCHAIN_PRIOR_BUDGET_REFUSED' }
  Assert-PlainAncestors $taskScratch
  if (([IO.DriveInfo]::new([IO.Path]::GetPathRoot($taskRepo))).AvailableFreeSpace -lt (5GB + $taskDownloadLimit)) { throw 'TOOLCHAIN_FREE_SPACE_REQUIRED' }
  $null = [IO.Directory]::CreateDirectory($taskRoot)
  $taskSid = [Security.Principal.WindowsIdentity]::GetCurrent().User
  $taskAcl = [Security.AccessControl.DirectorySecurity]::new(); $taskAcl.SetOwner($taskSid); $taskAcl.SetAccessRuleProtection($true,$false)
  $taskAcl.AddAccessRule([Security.AccessControl.FileSystemAccessRule]::new($taskSid,'FullControl','ContainerInherit,ObjectInherit','None','Allow'))
  Set-Acl -LiteralPath $taskRoot -AclObject $taskAcl
  & git check-ignore --quiet -- $taskRoot
  if ($LASTEXITCODE -ne 0) { throw 'TOOLCHAIN_SCRATCH_NOT_IGNORED' }
  Write-Output ('TOOLCHAIN_INSPECTION_ROOT='+$taskRoot)
  foreach ($package in $taskPackages) {
    $taskStage = 'DOWNLOAD_'+$package.Name
    $receipt = Fetch-PublisherArchive $package
    $taskReceipts.Add($receipt)
    $taskStage = 'EXTRACT_'+$package.Name
    Extract-CompleteArchive $receipt
    Save-Receipt
    Write-Output ('TOOLCHAIN_PACKAGE_INSPECTED='+$package.Name+' bytes='+$receipt.bytes+' entries='+$receipt.entryCount)
  }
  $taskStage = 'ACQUIRED_EXTRACTED_NOT_EXECUTED'
  Save-Receipt
  Write-Output ('TOOLCHAIN_DOWNLOAD_BYTES='+$taskDownloaded)
  Write-Output ('TOOLCHAIN_EXTRACTED_BYTES='+$taskExtracted)
  $taskExit = 0
} catch {
  Write-Output ('TOOLCHAIN_FAILURE stage='+$taskStage+' type='+$_.Exception.GetType().Name+' line='+$_.InvocationInfo.ScriptLineNumber)
  if ($_.Exception.Message -match '^TOOLCHAIN_[A-Z_]+$') { Write-Output $_.Exception.Message }
  if (Test-Path -LiteralPath $taskRoot) { Save-Receipt }
}
exit $taskExit
