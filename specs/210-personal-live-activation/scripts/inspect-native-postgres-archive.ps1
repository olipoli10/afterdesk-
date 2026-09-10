$ErrorActionPreference = 'Stop'
$pgRoot = [IO.Path]::GetFullPath('C:/dev/endvera-astra-r03/.scratch/postgres-native-17.11-3')
$pgArchive = Join-Path $pgRoot 'postgresql-17.11-3-windows-x64-binaries.zip'
$pgExtract = Join-Path $pgRoot 'runtime'
if (Test-Path -LiteralPath $pgExtract) { throw 'EXTRACTION_TARGET_EXISTS_NO_OVERWRITE' }
for ($pgAncestor = Get-Item -LiteralPath $pgRoot; $null -ne $pgAncestor; $pgAncestor = $pgAncestor.Parent) {
  if ($pgAncestor.Attributes -band [IO.FileAttributes]::ReparsePoint) { throw 'REPARSE_PATH_REFUSED' }
}
Add-Type -AssemblyName System.IO.Compression.FileSystem
$pgZip = [IO.Compression.ZipFile]::OpenRead($pgArchive)
try {
  $pgSeen = [Collections.Generic.HashSet[string]]::new([StringComparer]::OrdinalIgnoreCase)
  $pgBytes = [long]0
  foreach ($pgEntry in $pgZip.Entries) {
    $pgName = $pgEntry.FullName.Replace('\','/')
    if ($pgName -match '(^/|:|(^|/)\.\.?(/|$)|[\x00-\x1f])' -or -not $pgSeen.Add($pgName.TrimEnd('/'))) { throw 'ZIP_PATH_OR_DUPLICATE_REFUSED' }
    $pgUnixType = ($pgEntry.ExternalAttributes -shr 16) -band 0xF000
    if ($pgUnixType -notin @(0,0x8000,0x4000) -or ($pgEntry.ExternalAttributes -band 0x400)) { throw 'ZIP_SYMLINK_OR_SPECIAL_FILE_REFUSED' }
    $pgDestination = [IO.Path]::GetFullPath((Join-Path $pgExtract $pgName))
    if (-not $pgDestination.StartsWith($pgExtract + [IO.Path]::DirectorySeparatorChar,[StringComparison]::OrdinalIgnoreCase)) { throw 'ZIP_TRAVERSAL_REFUSED' }
    $pgBytes += $pgEntry.Length
    if ($pgBytes -gt 3GB) { throw 'ZIP_UNCOMPRESSED_SIZE_REFUSED' }
  }
  [IO.Directory]::CreateDirectory($pgExtract) | Out-Null
  $pgCount = 0
  foreach ($pgEntry in $pgZip.Entries) {
    $pgName = $pgEntry.FullName.Replace('\','/')
    if ($pgName -notmatch '^pgsql/(bin|lib|share)/' -or $pgName.EndsWith('/')) { continue }
    $pgDestination = [IO.Path]::GetFullPath((Join-Path $pgExtract $pgName))
    [IO.Directory]::CreateDirectory([IO.Path]::GetDirectoryName($pgDestination)) | Out-Null
    [IO.Compression.ZipFileExtensions]::ExtractToFile($pgEntry,$pgDestination,$false)
    $pgCount++
  }
} finally { $pgZip.Dispose() }
$pgSignatures = @(Get-ChildItem -LiteralPath (Join-Path $pgExtract 'pgsql/bin') -File | Where-Object { $_.Extension -eq '.dll' -or $_.Name -in @('postgres.exe','pg_ctl.exe','initdb.exe') } | ForEach-Object {
  $pgSig = Get-AuthenticodeSignature -LiteralPath $_.FullName
  [pscustomobject]@{ file=$_.Name; bytes=$_.Length; sha256=(Get-FileHash -LiteralPath $_.FullName -Algorithm SHA256).Hash.ToLowerInvariant(); status=$pgSig.Status.ToString(); signer=$pgSig.SignerCertificate.Subject; thumbprint=$pgSig.SignerCertificate.Thumbprint }
})
$pgReceipt = [ordered]@{ inspectedAt=[DateTime]::UtcNow.ToString('o'); extractionRoot=$pgExtract; extractedFiles=$pgCount; archiveUncompressedBytes=$pgBytes; traversalGuardPassed=$true; executableRun=$false; signatures=$pgSignatures }
$pgReceipt | ConvertTo-Json -Depth 5 | Set-Content -LiteralPath 'specs/210-personal-live-activation/evidence/native-postgres-signature-inspection.json' -Encoding utf8
$pgSignatures | Format-Table file,status,signer -AutoSize
