# Preparation only unless -Publish is explicitly supplied after controller review.
# Per-file atomic rename, NOT a multi-file transaction. No loading, process launch or PostgreSQL command.
[CmdletBinding()]
param([switch]$Publish)
$ErrorActionPreference = 'Stop'
if ($PSVersionTable.PSVersion.Major -lt 7 -or -not $IsWindows) { throw 'PGVECTOR_COPY_WINDOWS_POWERSHELL7_REQUIRED' }
Add-Type -AssemblyName System.IO.Compression
$taskRepo = (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path
$taskRuntime = Join-Path $taskRepo '.scratch\postgres-native-17.11-3\runtime\pgsql'
$taskBuild = Join-Path $taskRepo '.scratch\personal-pgvector-build-18726cfe44b84ef69791bd5960df77d3'
$taskArchive = Join-Path $taskRepo '.scratch\personal-msvc-inspection-e96ff70434b44156958620ac96e0c1e5\pgvector-source.zip'
$taskEntries = [Collections.Generic.List[object]]::new()
$taskStaged = [Collections.Generic.List[object]]::new()
$taskPublished = [Collections.Generic.List[string]]::new()
$taskStage = 'PREFLIGHT'
$taskNonce = [Guid]::NewGuid().ToString('N')
$taskReceipt = $null
$taskStreams = [Collections.Generic.List[IO.Stream]]::new()

function Assert-Plain([string]$Path) {
  for ($item = Get-Item -LiteralPath $Path; $null -ne $item;) {
    if ($item.Attributes -band [IO.FileAttributes]::ReparsePoint) { throw 'PGVECTOR_COPY_REPARSE_REFUSED' }
    $item = if ($item -is [IO.FileInfo]) { $item.Directory } else { $item.Parent }
  }
}
function Get-Digest([byte[]]$Bytes) {
  return [Convert]::ToHexString([Security.Cryptography.SHA256]::HashData($Bytes)).ToLowerInvariant()
}
function Read-Pinned([string]$Path,[string]$Pin,[long]$MaxBytes) {
  Assert-Plain $Path
  $stream = [IO.File]::Open($Path,[IO.FileMode]::Open,[IO.FileAccess]::Read,[IO.FileShare]::Read)
  $taskStreams.Add($stream)
  if ($stream.Length -le 0 -or $stream.Length -gt $MaxBytes) { throw 'PGVECTOR_COPY_LENGTH_REFUSED' }
  $memory = [IO.MemoryStream]::new()
  try { $stream.CopyTo($memory); $bytes=$memory.ToArray() } finally { $memory.Dispose() }
  if ((Get-Digest $bytes) -ne $Pin) { throw 'PGVECTOR_COPY_HASH_REFUSED' }
  return ,$bytes
}
function Add-Entry([string]$Relative,[byte[]]$Bytes) {
  if ($Relative -notmatch '^(lib\\vector\.dll|share\\extension\\vector\.control|share\\extension\\vector--[0-9]+\.[0-9]+\.[0-9]+(--[0-9]+\.[0-9]+\.[0-9]+)?\.sql)$') { throw 'PGVECTOR_COPY_TARGET_REFUSED' }
  $target = [IO.Path]::GetFullPath((Join-Path $taskRuntime $Relative))
  if (-not $target.StartsWith($taskRuntime+'\',[StringComparison]::OrdinalIgnoreCase)) { throw 'PGVECTOR_COPY_TARGET_REFUSED' }
  if ($taskEntries.Where({$_.target -eq $target}).Count) { throw 'PGVECTOR_COPY_DUPLICATE_REFUSED' }
  Assert-Plain ([IO.Path]::GetDirectoryName($target))
  if (Test-Path -LiteralPath $target) { throw 'PGVECTOR_COPY_EXISTING_TARGET_REFUSED' }
  $taskEntries.Add(@{ target=$target; relative=$Relative; bytes=$Bytes; sha256=(Get-Digest $Bytes) })
}

try {
  if ($taskRepo -ne 'C:\dev\endvera-astra-r03') { throw 'PGVECTOR_COPY_WORKSPACE_REFUSED' }
  foreach ($path in @($taskBuild,$taskRuntime,(Join-Path $taskRuntime 'bin'),(Join-Path $taskRuntime 'lib'),(Join-Path $taskRuntime 'share\extension'))) { Assert-Plain $path }
  # Hold these source handles read-only throughout publication. No core runtime file is written.
  $core = @{
    'initdb.exe'='2ef1b590d0967af7c0ea10bbf1b53195a589c75ef5b5cdc6177aa2b0bee9fe65'
    'pg_ctl.exe'='595303cede56a05eff6e2ec6e6e8bd5531c13832ba09fab57b1a9e93bc945c34'
    'postgres.exe'='8ae8bb442e8a4c4fb2c8e9ad38c19aca610ee3cba33afd69249de769f905329b'
    'psql.exe'='aa12e27530ac07f129e69daca953ea5f02202a7bde45d503e771abc39016536d'
  }
  foreach ($entry in $core.GetEnumerator()) { $null=Read-Pinned (Join-Path $taskRuntime ('bin\'+$entry.Key)) $entry.Value 30MB }
  $dll = Read-Pinned (Join-Path $taskBuild 'source\vector.dll') '1d54ce81495fc481da3d261edf4f797c837340a51648d3456afa3d72e4431cef' 1MB
  $sql = Read-Pinned (Join-Path $taskBuild 'source\sql\vector--0.8.6.sql') '7fb5bb279ef83bf9204bfac7405bb5c9a05e49f5ac7d64d1eb4464d103b80f32' 1MB
  $control = Read-Pinned (Join-Path $taskBuild 'source\vector.control') 'f1e1717c0c1da9c200ff3a53acf1d14eba5e3f70da928a723b247b0b1059417d' 4096
  Add-Entry 'lib\vector.dll' $dll
  Add-Entry 'share\extension\vector--0.8.6.sql' $sql
  # Upgrades are read from the entire pinned official source archive, never a glob of mutable build files.
  $archiveBytes = Read-Pinned $taskArchive 'bf0e885aeea36c555da5e0c68869d2282ed53020b4388202dae20368f4a9b5ae' 5MB
  $archiveMemory = [IO.MemoryStream]::new($archiveBytes,$false)
  $zip = [IO.Compression.ZipArchive]::new($archiveMemory,[IO.Compression.ZipArchiveMode]::Read)
  try {
    $prefix='pgvector-8ee86c96f0fd72390f890aa8a336fda6d3ab4c6c/sql/'
    $upgrades=0
    foreach ($entry in $zip.Entries) {
      if (-not $entry.FullName.StartsWith($prefix,[StringComparison]::Ordinal)) { continue }
      $name=$entry.FullName.Substring($prefix.Length)
      if ($name -notmatch '^vector--[0-9]+\.[0-9]+\.[0-9]+--[0-9]+\.[0-9]+\.[0-9]+\.sql$') { continue }
      if ($entry.Length -le 0 -or $entry.Length -gt 1MB) { throw 'PGVECTOR_COPY_SQL_BOUND' }
      $input=$entry.Open(); $memory=[IO.MemoryStream]::new()
      try { $input.CopyTo($memory); $bytes=$memory.ToArray() } finally { $input.Dispose(); $memory.Dispose() }
      if ($bytes.Length -ne $entry.Length) { throw 'PGVECTOR_COPY_SQL_LENGTH_REFUSED' }
      Add-Entry ('share\extension\'+$name) $bytes
      $upgrades++
    }
    if ($upgrades -ne 40) { throw 'PGVECTOR_COPY_UPGRADE_SET_REFUSED' }
  } finally { $zip.Dispose(); $archiveMemory.Dispose() }
  # Control is always the last name made visible. There is still no transaction across files.
  Add-Entry 'share\extension\vector.control' $control
  if ($taskEntries.Count -ne 43) { throw 'PGVECTOR_COPY_FILE_SET_REFUSED' }
  if (-not $Publish) {
    Write-Output ('PGVECTOR_COPY_VALIDATED_NO_WRITES files='+$taskEntries.Count)
  } else {
    $taskStage='STAGING'
    $taskReceipt=Join-Path $taskBuild ('runtime-publication-'+$taskNonce+'.json')
    # Exclusive receipt creation prevents an existing receipt from being replaced.
    $receiptStream=[IO.File]::Open($taskReceipt,[IO.FileMode]::CreateNew,[IO.FileAccess]::ReadWrite,[IO.FileShare]::Read)
    try {
      foreach ($entry in $taskEntries) {
        $parent=[IO.Path]::GetDirectoryName($entry.target); Assert-Plain $parent
        if (Test-Path -LiteralPath $entry.target) { throw 'PGVECTOR_COPY_EXISTING_TARGET_REFUSED' }
        $temporary=Join-Path $parent ('.endvera-vector-'+$taskNonce+'-'+[IO.Path]::GetFileName($entry.target)+'.staged')
        $output=[IO.File]::Open($temporary,[IO.FileMode]::CreateNew,[IO.FileAccess]::ReadWrite,[IO.FileShare]::None)
        $taskStaged.Add(@{ temporary=$temporary; target=$entry.target; sha256=$entry.sha256; bytes=$entry.bytes.Length; published=$false })
        try {
          $output.Write($entry.bytes,0,$entry.bytes.Length); $output.Flush($true); $output.Position=0
          $hash=[Security.Cryptography.SHA256]::Create()
          try { $actual=[Convert]::ToHexString($hash.ComputeHash($output)).ToLowerInvariant() } finally { $hash.Dispose() }
          if ($actual -ne $entry.sha256) { throw 'PGVECTOR_COPY_STAGING_HASH_REFUSED' }
        } finally { $output.Dispose() }
      }
      $taskStage='PUBLISHING'
      foreach ($entry in $taskStaged) {
        Assert-Plain ([IO.Path]::GetDirectoryName($entry.target)); Assert-Plain $entry.temporary
        # Same-directory rename is per-file atomic. false means no overwrite even after the earlier check.
        [IO.File]::Move($entry.temporary,$entry.target,$false)
        $entry.published=$true; $taskPublished.Add($entry.target)
      }
      $taskStage='PUBLISHED_NOT_LOADED'
    } finally {
      $receipt=@{ stage=$taskStage; buildRoot=$taskBuild; runtimeRoot=$taskRuntime; entries=@($taskStaged.ToArray()); published=@($taskPublished.ToArray()); runtimeModified=($taskStaged.Count -gt 0); extensionLoaded=$false; postgresLaunched=$false; atomicity='PER_FILE_ONLY'; autoRetry=$false; automaticDeletion=$false }
      $encoded=[Text.UTF8Encoding]::new($false).GetBytes(($receipt|ConvertTo-Json -Depth 6))
      $receiptStream.Write($encoded,0,$encoded.Length); $receiptStream.Flush($true); $receiptStream.Dispose()
    }
    Write-Output ('PGVECTOR_COPY_PUBLISHED_NOT_LOADED files='+$taskPublished.Count+' receipt='+$taskReceipt)
  }
} catch {
  Write-Output ('PGVECTOR_COPY_REFUSED stage='+$taskStage+' type='+$_.Exception.GetType().Name+' line='+$_.InvocationInfo.ScriptLineNumber)
  exit 1
} finally { foreach ($stream in $taskStreams) { $stream.Dispose() } }
