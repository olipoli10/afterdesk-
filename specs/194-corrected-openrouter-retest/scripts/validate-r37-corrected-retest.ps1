[CmdletBinding()]
param(
  [switch]$PreflightOnly,
  [switch]$RequireComplete,
  [switch]$ReportOnly
)

$ErrorActionPreference = "Stop"
$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..\..\..")).Path
$featureRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$evidenceRoot = Join-Path $featureRoot "evidence"
$preflightPath = Join-Path $evidenceRoot "credential-free-preflight.json"
$observedReportPath = Join-Path $evidenceRoot "observed-provider-report.json"
$originalReportPath = Join-Path $repoRoot "specs\192-openrouter-provider-sandbox\evidence\observed-provider-report.json"
$expectedOriginalHash = "bc79e1416f82ff08665690b0140471111ce00abb0a026419bb503688b6797eb3"
$serverName = "endvera-r37-corrected-$PID"
$databaseName = "afterdesk_r37_corrected_${PID}_integration"
$serverCreated = $false
$databaseCleanupVerified = $false
$resultState = ""
$credentialRequiredForCompletion = $false

function Assert-ExitCode([string]$Label) {
  if ($LASTEXITCODE -ne 0) { throw "R37_CORRECTED_COMMAND_FAILED:${Label}:$LASTEXITCODE" }
}

function Get-Sha256([string]$Path) {
  $stream = [IO.File]::OpenRead($Path)
  try {
    $algorithm = [Security.Cryptography.SHA256]::Create()
    try {
      return ([BitConverter]::ToString($algorithm.ComputeHash($stream))).Replace("-", "").ToLowerInvariant()
    } finally {
      $algorithm.Dispose()
    }
  } finally {
    $stream.Dispose()
  }
}

function Assert-OriginalReport {
  if (-not (Test-Path -LiteralPath $originalReportPath)) { throw "R37_ORIGINAL_REPORT_MISSING" }
  if ((Get-Sha256 $originalReportPath) -ne $expectedOriginalHash) {
    throw "R37_ORIGINAL_REPORT_HASH_DRIFT"
  }
}

function Assert-Preflight($Report) {
  if ($Report.schemaVersion -ne 1 -or $Report.release -ne "R37-CORRECTED-OPENROUTER-RETEST" -or $Report.provider -ne "OPENROUTER") { throw "R37_CORRECTED_PREFLIGHT_IDENTITY_INVALID" }
  if ($Report.requestVersion -ne "R37BB_CORRECTED" -or -not $Report.syntheticOnly -or $Report.maxRetryCount -ne 0) { throw "R37_CORRECTED_PREFLIGHT_CONTRACT_INVALID" }
  if ($Report.credentialValueInspected -or $Report.providerLaneEnabled -or $Report.externalCommunicationAuthorized -or $Report.externalToolWriteAuthorized -or $Report.deploymentAuthorized) { throw "R37_CORRECTED_PREFLIGHT_AUTHORITY_INVALID" }
  if ($Report.expectedCallCount -ne 6 -or $Report.applicationCeilingUsdMicros -ne "5000000" -or $Report.founderCeilingCadMicros -ne "10000000") { throw "R37_CORRECTED_PREFLIGHT_CEILING_INVALID" }
  if (@($Report.modelIds).Count -ne 2 -or $Report.modelIds[0] -ne "openai/gpt-5.4" -or $Report.modelIds[1] -ne "openai/gpt-5.4-mini") { throw "R37_CORRECTED_PREFLIGHT_MODEL_SET_INVALID" }
  if (-not $Report.originalReportImmutable -or $Report.originalReportSha256 -ne $expectedOriginalHash) { throw "R37_ORIGINAL_REPORT_HASH_DRIFT" }
}

function Assert-ObservedReport($Report) {
  if ($Report.schemaVersion -ne 1 -or $Report.provider -ne "OPENROUTER" -or $Report.evidenceLabel -ne "OBSERVED_PROVIDER_SYNTHETIC_INPUT") { throw "R37_CORRECTED_REPORT_IDENTITY_INVALID" }
  if ($Report.campaignId -notmatch '^r37-corrected-openrouter-') { throw "R37_CORRECTED_CAMPAIGN_ID_INVALID" }
  if (-not $Report.grantsRevoked -or -not $Report.providerLaneDisabled -or $Report.externalCommunicationPerformed -or $Report.externalToolWritePerformed -or $Report.deploymentPerformed) { throw "R37_CORRECTED_CLEANUP_INVALID" }
  if ([int64]$Report.settledSpendMicros -lt 0 -or [int64]$Report.settledSpendMicros -gt 5000000) { throw "R37_CORRECTED_USD_CEILING_EXCEEDED" }
  if ($Report.expectedCallCount -ne 6 -or $Report.dispatchedCallCount -lt 1 -or $Report.dispatchedCallCount -gt 6 -or $Report.replayedDispatchCount -ne 0) { throw "R37_CORRECTED_DENOMINATOR_INVALID" }
  if ($Report.canonicalObservationCount -ne @($Report.observations).Count -or $Report.canonicalObservationCount -gt $Report.dispatchedCallCount) { throw "R37_CORRECTED_MATRIX_INVALID" }
  foreach ($item in @($Report.observations)) {
    if ($item.provider -ne "OPENROUTER" -or $item.evidenceLabel -ne "OBSERVED_PROVIDER_SYNTHETIC_INPUT") { throw "R37_CORRECTED_OBSERVATION_INVALID" }
    if (-not $item.oracle.passed -and @($item.oracle.reasonCodes).Count -lt 1) { throw "R37_CORRECTED_FAILED_OBSERVATION_REASON_MISSING" }
    if ([int64]$item.costMicros -gt 100000) { throw "R37_CORRECTED_ATTEMPT_CEILING_EXCEEDED" }
  }
  if ($Report.verdict -eq "OPENROUTER_SANDBOX_OBSERVED_PASS") {
    if ($Report.dispatchedCallCount -ne 6 -or $Report.canonicalObservationCount -ne 6 -or @($Report.failureCodes).Count -ne 0 -or @($Report.observations | Where-Object { -not $_.oracle.passed }).Count -ne 0) { throw "R37_CORRECTED_PASS_INVALID" }
  } elseif ($Report.verdict -eq "REWORK") {
    if (@($Report.failureCodes).Count -lt 1 -or $null -ne $Report.selectedR38Candidate) { throw "R37_CORRECTED_REWORK_INVALID" }
  } else { throw "R37_CORRECTED_VERDICT_INVALID" }
}

Assert-OriginalReport

if ($ReportOnly) {
  if (-not (Test-Path -LiteralPath $observedReportPath)) { throw "R37_CORRECTED_REPORT_MISSING" }
  Assert-ObservedReport (Get-Content -Raw -LiteralPath $observedReportPath | ConvertFrom-Json)
  Assert-OriginalReport
  Write-Output "R37_CORRECTED_REPORT_VALID=true"
  Write-Output "R37_CORRECTED_NETWORK_CALLS=0"
  return
}

Push-Location $repoRoot
try {
  [IO.Directory]::CreateDirectory($evidenceRoot) | Out-Null
  foreach ($required in @("spec.md","plan.md","tasks.md","research.md","data-model.md","goal.md","LONG_RUN_PROGRAM.json","CONTINUATION_QUEUE.json","contracts\openrouter-corrected-retest.md")) {
    if (-not (Test-Path -LiteralPath (Join-Path $featureRoot $required))) { throw "R37_CORRECTED_ARTIFACT_MISSING:$required" }
  }
  Get-Content -Raw -LiteralPath (Join-Path $featureRoot "LONG_RUN_PROGRAM.json") | ConvertFrom-Json | Out-Null
  Get-Content -Raw -LiteralPath (Join-Path $featureRoot "CONTINUATION_QUEUE.json") | ConvertFrom-Json | Out-Null
  if (@(git diff -- package-lock.json).Count -ne 0) { throw "R37_CORRECTED_LOCKFILE_CHANGED" }
  & git grep -q -E 'sk-or-v1-[A-Za-z0-9_-]{20,}' -- specs/194-corrected-openrouter-retest scripts/run-r37-corrected-openrouter-retest.ts scripts/start-r37-corrected-openrouter-retest-secure.ps1 scripts/start-r37-corrected-openrouter-retest-local-web.mjs
  if ($LASTEXITCODE -eq 0) { throw "R37_CORRECTED_SECRET_MATERIAL_DETECTED" }
  if ($LASTEXITCODE -ne 1) { throw "R37_CORRECTED_SECRET_SCAN_FAILED:$LASTEXITCODE" }

  $preflightJson = & npx tsx --require ./scripts/register-server-only.cjs scripts/run-r37-corrected-openrouter-retest.ts --preflight
  Assert-ExitCode "preflight"
  $preflight = $preflightJson | ConvertFrom-Json
  Assert-Preflight $preflight
  [IO.File]::WriteAllText($preflightPath, (($preflight | ConvertTo-Json -Depth 20) + "`n"), [Text.UTF8Encoding]::new($false))

  & npx vitest run test/construction-operating-assistant-r37-corrected-retest.test.ts test/construction-operating-assistant-r37bb-zdr-compatibility.test.ts test/construction-operating-assistant-r37-openrouter-sandbox.test.ts test/construction-operating-assistant-r37k-provider-route-absence.test.ts test/construction-operating-assistant-r37o-provider-boundary-release-gate.test.ts
  Assert-ExitCode "unit-and-boundary-tests"
  & npm run validate:provider-boundary
  Assert-ExitCode "provider-boundary"

  if ($preflight.credentialPresent -and -not $preflight.exchangeValid) { throw "R37_EXCHANGE_EVIDENCE_REQUIRED" }

  $previousPreference = $ErrorActionPreference
  $ErrorActionPreference = "Continue"
  try {
    $devOutput = @(& npx prisma dev -n $serverName -d 2>&1)
    $devExitCode = $LASTEXITCODE
  } finally { $ErrorActionPreference = $previousPreference }
  if ($devExitCode -ne 0) { throw "R37_CORRECTED_COMMAND_FAILED:database-start:$devExitCode" }
  $serverCreated = $true
  $templateUrl = $devOutput | ForEach-Object { $_.ToString().Trim() } | Where-Object { $_ -match '^postgres://' } | Select-Object -Last 1
  if (-not $templateUrl) { throw "R37_CORRECTED_DATABASE_URL_MISSING" }
  $previousPreference = $ErrorActionPreference
  $ErrorActionPreference = "Continue"
  try {
    "CREATE DATABASE `"$databaseName`" TEMPLATE template0;" | & npx prisma db execute --stdin --url $templateUrl
    $databaseCreateExitCode = $LASTEXITCODE
  } finally { $ErrorActionPreference = $previousPreference }
  if ($databaseCreateExitCode -ne 0) { throw "R37_CORRECTED_COMMAND_FAILED:database-create:$databaseCreateExitCode" }
  $uri = [UriBuilder]$templateUrl
  $uri.Path = "/$databaseName"
  $uri.Query = "$($uri.Query.TrimStart('?'))&pgbouncer=true&connection_limit=10"
  $env:AFTERDESK_TEST_DATABASE_URL = $uri.Uri.AbsoluteUri
  $env:ALLOW_INTEGRATION_DB_RESET = "1"
  & npm run test:integration -- test/integration/construction-operating-assistant-r37-openrouter-sandbox.itest.ts
  Assert-ExitCode "postgresql-integration"

  if ($PreflightOnly -or -not $preflight.credentialPresent) {
    $resultState = $preflight.state
    $credentialRequiredForCompletion = $RequireComplete -and -not $preflight.credentialPresent
  } else {
    Remove-Item Env:AFTERDESK_TEST_DATABASE_URL -ErrorAction SilentlyContinue
    Remove-Item Env:ALLOW_INTEGRATION_DB_RESET -ErrorAction SilentlyContinue
    $env:DATABASE_URL = $uri.Uri.AbsoluteUri
    $env:DIRECT_URL = $uri.Uri.AbsoluteUri
    & npx tsx --require ./scripts/register-server-only.cjs scripts/run-r37-corrected-openrouter-retest.ts
    $observedExitCode = $LASTEXITCODE
    if ($observedExitCode -ne 0 -and $observedExitCode -ne 3) { throw "R37_CORRECTED_COMMAND_FAILED:observed-run:$observedExitCode" }
    if (-not (Test-Path -LiteralPath $observedReportPath)) { throw "R37_CORRECTED_REPORT_MISSING_AFTER_RUN" }
    $report = Get-Content -Raw -LiteralPath $observedReportPath | ConvertFrom-Json
    Assert-ObservedReport $report
    $resultState = $report.verdict
  }
} finally {
  Remove-Item Env:DATABASE_URL -ErrorAction SilentlyContinue
  Remove-Item Env:DIRECT_URL -ErrorAction SilentlyContinue
  Remove-Item Env:AFTERDESK_TEST_DATABASE_URL -ErrorAction SilentlyContinue
  Remove-Item Env:ALLOW_INTEGRATION_DB_RESET -ErrorAction SilentlyContinue
  if ($serverCreated) {
    $previousPreference = $ErrorActionPreference
    $ErrorActionPreference = "Continue"
    try {
      "i will lose local data" | & npx prisma dev rm --force $serverName 2>&1 | Out-Null
      $cleanupExitCode = $LASTEXITCODE
    } finally { $ErrorActionPreference = $previousPreference }
    if ($cleanupExitCode -ne 0) { throw "R37_CORRECTED_DATABASE_CLEANUP_FAILED:$serverName" }
    $databaseCleanupVerified = $true
  }
  Pop-Location
}

if (-not $databaseCleanupVerified) { throw "R37_CORRECTED_DATABASE_CLEANUP_NOT_VERIFIED" }
Assert-OriginalReport
if ($credentialRequiredForCompletion) { throw "R37_CREDENTIAL_REQUIRED" }
Write-Output "R37_CORRECTED_STATE=$resultState"
Write-Output "R37_CORRECTED_CREDENTIAL_VALUE_INSPECTED=false"
if (-not $preflight.credentialPresent) { Write-Output "R37_CORRECTED_NETWORK_CALLS=0" }
