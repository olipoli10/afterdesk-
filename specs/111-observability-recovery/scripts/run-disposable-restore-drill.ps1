param(
  [Parameter(Mandatory = $true)][string]$SourceUrl,
  [Parameter(Mandatory = $true)][string]$TargetUrl,
  [Parameter(Mandatory = $true)][string]$WorkspaceId,
  [Parameter(Mandatory = $true)][string]$PostgresBinPath,
  [Parameter(Mandatory = $true)][string]$OutputPath,
  [string]$SourceLabel = "endvera-r31-source",
  [string]$TargetLabel = "endvera-r31-restored"
)

$ErrorActionPreference = "Stop"

function Assert-R31DisposableEndpoint {
  param([string]$Label, [string]$Url)

  if ($Label -notmatch '^endvera-r31-[a-z0-9-]{1,80}$') {
    throw "RECOVERY_DATABASE_NOT_DISPOSABLE"
  }

  $uri = [System.Uri]::new($Url)
  if ($uri.Scheme -notin @('postgres', 'postgresql')) {
    throw "RECOVERY_DATABASE_SCHEME_REFUSED"
  }
  if ($uri.Host -notin @('127.0.0.1', 'localhost')) {
    throw "RECOVERY_DATABASE_HOST_REFUSED"
  }
  $databaseName = $uri.AbsolutePath.TrimStart('/')
  if ([string]::IsNullOrWhiteSpace($databaseName) -or $databaseName -in @('postgres', 'template0', 'template1')) {
    throw "RECOVERY_DATABASE_NAME_REFUSED"
  }

  return $uri
}

function Get-R31SafeDatabaseUrl {
  param([System.Uri]$Uri)
  return "postgresql://$($Uri.Host):$($Uri.Port)$($Uri.AbsolutePath)?sslmode=disable"
}

function Get-R31Credentials {
  param([System.Uri]$Uri)
  $parts = $Uri.UserInfo.Split(':', 2)
  return @{
    PGUSER = if ($parts.Count -gt 0) { [System.Uri]::UnescapeDataString($parts[0]) } else { '' }
    PGPASSWORD = if ($parts.Count -gt 1) { [System.Uri]::UnescapeDataString($parts[1]) } else { '' }
    PGSSLMODE = 'disable'
  }
}

function Invoke-R31Process {
  param(
    [string]$FilePath,
    [string[]]$Arguments,
    [hashtable]$Environment = @{}
  )

  $info = [System.Diagnostics.ProcessStartInfo]::new()
  $info.FileName = $FilePath
  $info.UseShellExecute = $false
  $info.CreateNoWindow = $true
  $info.RedirectStandardOutput = $true
  $info.RedirectStandardError = $true
  foreach ($argument in $Arguments) { [void]$info.ArgumentList.Add($argument) }
  foreach ($entry in $Environment.GetEnumerator()) { $info.Environment[$entry.Key] = [string]$entry.Value }
  $process = [System.Diagnostics.Process]::new()
  $process.StartInfo = $info
  [void]$process.Start()
  $stdout = $process.StandardOutput.ReadToEnd()
  $stderr = $process.StandardError.ReadToEnd()
  $process.WaitForExit()
  if ($process.ExitCode -ne 0) {
    throw "RECOVERY_PROCESS_FAILED:$($process.ExitCode):$stderr"
  }
  return $stdout.Trim()
}

function Get-R31Manifest {
  param([string]$Url, [string]$Workspace)

  $environment = @{
    DATABASE_URL = $Url
    DIRECT_URL = $Url
  }
  $node = (Get-Command node.exe -ErrorAction Stop).Source
  $tsx = Join-Path (Get-Location) 'node_modules/tsx/dist/cli.mjs'
  if (-not (Test-Path -LiteralPath $tsx -PathType Leaf)) { throw 'RECOVERY_TSX_RUNTIME_MISSING' }
  $output = Invoke-R31Process -FilePath $node -Arguments @(
    $tsx,
    '--require',
    './scripts/register-server-only.cjs',
    'specs/111-observability-recovery/scripts/emit-recovery-manifest.ts',
    $Workspace
  ) -Environment $environment
  return $output | ConvertFrom-Json -Depth 20
}

function Invoke-R31RestoreDrill {
  $sourceUri = Assert-R31DisposableEndpoint -Label $SourceLabel -Url $SourceUrl
  $targetUri = Assert-R31DisposableEndpoint -Label $TargetLabel -Url $TargetUrl
  if ($sourceUri.Port -eq $targetUri.Port) {
    throw "RECOVERY_TARGET_NOT_ISOLATED"
  }

  $pgDump = Join-Path $PostgresBinPath 'pg_dump.exe'
  $pgRestore = Join-Path $PostgresBinPath 'pg_restore.exe'
  foreach ($tool in @($pgDump, $pgRestore)) {
    if (-not (Test-Path -LiteralPath $tool -PathType Leaf)) {
      throw "RECOVERY_POSTGRES_TOOL_MISSING"
    }
  }

  $tempRoot = [System.IO.Path]::GetFullPath([System.IO.Path]::GetTempPath())
  $tempDirectory = [System.IO.Directory]::CreateTempSubdirectory('endvera-r31-')
  try {
    $archivePath = Join-Path $tempDirectory.FullName 'recovery.dump'
    $sourceManifest = Get-R31Manifest -Url $SourceUrl -Workspace $WorkspaceId
    $targetBefore = Get-R31Manifest -Url $TargetUrl -Workspace $WorkspaceId
    if ($targetBefore.manifest.totalRows -ne 0) {
      throw 'RECOVERY_TARGET_NOT_EMPTY'
    }

    $sourceEnvironment = Get-R31Credentials -Uri $sourceUri
    [void](Invoke-R31Process -FilePath $pgDump -Arguments @(
      '--format=custom',
      '--data-only',
      '--no-owner',
      '--no-privileges',
      '--table=public."User"',
      '--table=public."Construction"*',
      "--file=$archivePath",
      "--dbname=$(Get-R31SafeDatabaseUrl -Uri $sourceUri)"
    ) -Environment $sourceEnvironment)

    $targetEnvironment = Get-R31Credentials -Uri $targetUri
    [void](Invoke-R31Process -FilePath $pgRestore -Arguments @(
      '--data-only',
      '--disable-triggers',
      '--no-owner',
      '--no-privileges',
      "--dbname=$(Get-R31SafeDatabaseUrl -Uri $targetUri)",
      $archivePath
    ) -Environment $targetEnvironment)

    $restoredManifest = Get-R31Manifest -Url $TargetUrl -Workspace $WorkspaceId
    $matches = $sourceManifest.fingerprint -eq $restoredManifest.fingerprint
    $result = [ordered]@{
      schemaVersion = 1
      status = if ($matches) { 'PASS' } else { 'FAIL' }
      sourceLabel = $SourceLabel
      targetLabel = $TargetLabel
      workspaceId = $WorkspaceId
      sourceManifest = $sourceManifest.manifest
      restoredManifest = $restoredManifest.manifest
      sourceFingerprint = $sourceManifest.fingerprint
      restoredFingerprint = $restoredManifest.fingerprint
      archiveBytes = (Get-Item -LiteralPath $archivePath).Length
      backupScope = 'USER_AND_CONSTRUCTION_TABLES'
      targetVectorSurrogateUsed = $true
      externalTransportPerformed = $false
      customerDataUsed = $false
    }
    if (-not $matches) {
      throw "RECOVERY_MANIFEST_MISMATCH:$($result | ConvertTo-Json -Depth 20 -Compress)"
    }
    $outputDirectory = Split-Path -Parent $OutputPath
    if ($outputDirectory) { New-Item -ItemType Directory -Force -Path $outputDirectory | Out-Null }
    $result | ConvertTo-Json -Depth 20 | Set-Content -LiteralPath $OutputPath -Encoding utf8
    return $result
  } finally {
    $resolvedTemp = [System.IO.Path]::GetFullPath($tempDirectory.FullName)
    if (-not $resolvedTemp.StartsWith($tempRoot, [System.StringComparison]::OrdinalIgnoreCase) -or
        -not $tempDirectory.Name.StartsWith('endvera-r31-', [System.StringComparison]::Ordinal)) {
      throw "RECOVERY_TEMP_CLEANUP_REFUSED"
    }
    Remove-Item -LiteralPath $resolvedTemp -Recurse -Force
  }
}

if ($MyInvocation.InvocationName -ne '.') {
  $result = Invoke-R31RestoreDrill
  $result | ConvertTo-Json -Depth 20
}
