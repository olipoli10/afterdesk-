$ErrorActionPreference = 'Stop'
$pgRoot = 'C:/dev/endvera-astra-r03/.scratch/postgres-native-17.11-3'
$pgArchive = Join-Path $pgRoot 'postgresql-17.11-3-windows-x64-binaries.zip'
$pgExpectedHash = '4b8db0930c38f6ef845db919551dedda3b6b845aeb0927b3d79a6e8e9e4537cf'
if ((Get-FileHash -LiteralPath $pgArchive -Algorithm SHA256).Hash.ToLowerInvariant() -ne $pgExpectedHash) { throw 'ARCHIVE_IDENTITY_CHANGED' }
$pgRuntime = Join-Path $pgRoot 'runtime/pgsql'
for ($pgAncestor = Get-Item -LiteralPath $pgRuntime; $null -ne $pgAncestor; $pgAncestor = $pgAncestor.Parent) {
  if ($pgAncestor.Attributes -band [IO.FileAttributes]::ReparsePoint) { throw 'REPARSE_PATH_REFUSED' }
}
$pgReceiptPath = 'specs/210-personal-live-activation/evidence/native-postgres-signature-inspection.json'
$pgReceipt = Get-Content -LiteralPath $pgReceiptPath -Raw | ConvertFrom-Json -AsHashtable
$pgSignatures = @(Get-ChildItem -LiteralPath $pgRuntime -Recurse -File | Where-Object { $_.Extension -eq '.dll' -or $_.Name -in @('postgres.exe','pg_ctl.exe','initdb.exe','psql.exe') } | ForEach-Object {
  if ($_.Attributes -band [IO.FileAttributes]::ReparsePoint) { throw 'REPARSE_FILE_REFUSED' }
  $pgSig = Get-AuthenticodeSignature -LiteralPath $_.FullName
  [ordered]@{ file=$_.FullName.Substring($pgRuntime.Length+1); bytes=$_.Length; sha256=(Get-FileHash -LiteralPath $_.FullName -Algorithm SHA256).Hash.ToLowerInvariant(); status=$pgSig.Status.ToString(); signer=$pgSig.SignerCertificate.Subject; thumbprint=$pgSig.SignerCertificate.Thumbprint }
})
$pgVersions = @()
foreach ($pgName in @('postgres.exe','pg_ctl.exe','initdb.exe','psql.exe')) {
  $pgExe = Join-Path $pgRuntime ('bin/' + $pgName)
  $pgPrior = @($pgReceipt.signatures | Where-Object { $_.file -eq $pgName })
  if ($pgPrior.Count -eq 1 -and $pgPrior[0].sha256 -ne (Get-FileHash -LiteralPath $pgExe -Algorithm SHA256).Hash.ToLowerInvariant()) { throw 'EXECUTABLE_IDENTITY_CHANGED' }
  $pgOutput = @(& $pgExe --version 2>&1)
  if ($LASTEXITCODE -ne 0) { throw "NATIVE_VERSION_FAILED:$pgName" }
  $pgVersions += [ordered]@{ file=$pgName; command='--version'; output=($pgOutput -join "`n"); exitCode=$LASTEXITCODE }
}
$pgReceipt.signatures = $pgSignatures
$pgReceipt.executableRun = $true
$pgReceipt.versionChecksOnly = $true
$pgReceipt.clusterCreated = $false
$pgReceipt.serverStarted = $false
$pgReceipt.officialHttpsProvenanceAcceptedUnsignedLocalTooling = $true
$pgReceipt.publisherSignatureVerified = $false
$pgReceipt.approvalBasis = 'Parent agent accepted exact official HTTPS provenance and pinned local archive identity for isolated local tooling despite NotSigned; only --version authorized in this step.'
$pgReceipt.versionCheckedAt = [DateTime]::UtcNow.ToString('o')
$pgReceipt.versionChecks = $pgVersions
$pgReceipt | ConvertTo-Json -Depth 6 | Set-Content -LiteralPath $pgReceiptPath -Encoding utf8
$pgVersions | ConvertTo-Json -Depth 4
[pscustomobject]@{ inspectedSignatures=$pgSignatures.Count; unsigned=@($pgSignatures | Where-Object { $_.status -eq 'NotSigned' }).Count; clusterCreated=$false; serverStarted=$false }
