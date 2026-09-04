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
$serverName = "endvera-r37-openrouter-$PID"
$databaseName = "afterdesk_r37_${PID}_integration"
$serverCreated = $false
$databaseCleanupVerified = $false
$resultState = ""
$credentialRequiredForCompletion = $false

function Assert-ExitCode([string]$Label) {
  if ($LASTEXITCODE -ne 0) { throw "R37_COMMAND_FAILED:${Label}:$LASTEXITCODE" }
}

function Assert-Preflight($Report) {
  $expected = @("applicationCeilingUsdMicros","credentialPresent","credentialValueInspected","deploymentAuthorized","exchangeCadMicros","exchangeEvidenceObservedAt","exchangeValid","expectedCallCount","externalCommunicationAuthorized","founderCeilingCadMicros","modelIds","provider","providerLaneEnabled","release","schemaVersion","state","syntheticOnly")
  $actual = @($Report.PSObject.Properties.Name | Sort-Object)
  if (@(Compare-Object ($expected | Sort-Object) $actual).Count -ne 0) { throw "R37_PREFLIGHT_SHAPE_INVALID" }
  if ($Report.schemaVersion -ne 1 -or $Report.release -ne "R37-PROVIDER-SANDBOX" -or $Report.provider -ne "OPENROUTER" -or -not $Report.syntheticOnly) { throw "R37_PREFLIGHT_IDENTITY_INVALID" }
  if ($Report.credentialValueInspected -or $Report.providerLaneEnabled -or $Report.externalCommunicationAuthorized -or $Report.deploymentAuthorized) { throw "R37_PREFLIGHT_AUTHORITY_INVALID" }
  if ($Report.expectedCallCount -ne 6 -or $Report.applicationCeilingUsdMicros -ne "5000000" -or $Report.founderCeilingCadMicros -ne "10000000") { throw "R37_PREFLIGHT_CEILING_INVALID" }
  if (@($Report.modelIds).Count -ne 2 -or $Report.modelIds[0] -ne "openai/gpt-5.4" -or $Report.modelIds[1] -ne "openai/gpt-5.4-mini") { throw "R37_PREFLIGHT_MODEL_SET_INVALID" }
}

function Assert-ObservedReport($Report) {
  if ($Report.schemaVersion -ne 1 -or $Report.provider -ne "OPENROUTER" -or $Report.evidenceLabel -ne "OBSERVED_PROVIDER_SYNTHETIC_INPUT") { throw "R37_OBSERVED_REPORT_IDENTITY_INVALID" }
  if (-not $Report.grantsRevoked -or -not $Report.providerLaneDisabled -or $Report.externalCommunicationPerformed -or $Report.externalToolWritePerformed -or $Report.deploymentPerformed) { throw "R37_OBSERVED_CLEANUP_INVALID" }
  if ([int64]$Report.settledSpendMicros -lt 0 -or [int64]$Report.settledSpendMicros -gt 5000000) { throw "R37_OBSERVED_USD_CEILING_EXCEEDED" }
  if ($Report.expectedCallCount -ne 6 -or $Report.dispatchedCallCount -lt 1 -or $Report.dispatchedCallCount -gt 6) { throw "R37_OBSERVED_DENOMINATOR_INVALID" }
  if ($Report.canonicalObservationCount -ne @($Report.observations).Count -or $Report.canonicalObservationCount -gt $Report.dispatchedCallCount) { throw "R37_OBSERVED_MATRIX_INVALID" }
  foreach ($item in @($Report.observations)) {
    if ($item.provider -ne "OPENROUTER" -or $item.evidenceLabel -ne "OBSERVED_PROVIDER_SYNTHETIC_INPUT" -or -not $item.oracle.passed) { throw "R37_OBSERVATION_INVALID" }
    if ([int64]$item.costMicros -gt 100000) { throw "R37_ATTEMPT_CEILING_EXCEEDED" }
  }
  if ($Report.verdict -eq "OPENROUTER_SANDBOX_OBSERVED_PASS") {
    if ($Report.dispatchedCallCount -ne 6 -or $Report.canonicalObservationCount -ne 6 -or @($Report.failureCodes).Count -ne 0) { throw "R37_OBSERVED_PASS_INVALID" }
  } elseif ($Report.verdict -eq "REWORK") {
    if (@($Report.failureCodes).Count -lt 1 -or $null -ne $Report.selectedR38Candidate) { throw "R37_OBSERVED_REWORK_INVALID" }
  } else {
    throw "R37_OBSERVED_VERDICT_INVALID"
  }
}

if ($ReportOnly) {
  if (-not (Test-Path -LiteralPath $observedReportPath)) { throw "R37_OBSERVED_REPORT_MISSING" }
  $sealedReport = Get-Content -Raw -LiteralPath $observedReportPath | ConvertFrom-Json
  Assert-ObservedReport $sealedReport
  Write-Output "R37_STATE=$($sealedReport.verdict)"
  Write-Output "R37_REPORT_ONLY=true"
  Write-Output "R37_NETWORK_CALLS=0"
  return
}

Push-Location $repoRoot
try {
  [IO.Directory]::CreateDirectory($evidenceRoot) | Out-Null
  foreach ($required in @("spec.md","plan.md","tasks.md","research.md","data-model.md","goal.md","LONG_RUN_PROGRAM.json","contracts\openrouter-provider-sandbox.md")) {
    if (-not (Test-Path -LiteralPath (Join-Path $featureRoot $required))) { throw "R37_ARTIFACT_MISSING:$required" }
  }
  Get-Content -Raw -LiteralPath (Join-Path $featureRoot "LONG_RUN_PROGRAM.json") | ConvertFrom-Json | Out-Null
  Get-Content -Raw -LiteralPath "specs/090-prepared-action-inspection/PROJECT_BACKLOG.json" | ConvertFrom-Json | Out-Null
  Get-Content -Raw -LiteralPath "specs/090-prepared-action-inspection/CONTINUATION_QUEUE.json" | ConvertFrom-Json | Out-Null
  if (@(git diff -- package-lock.json).Count -ne 0) { throw "R37_LOCKFILE_CHANGED" }

  $preflightJson = & npx tsx --require ./scripts/register-server-only.cjs scripts/run-r37-openrouter-sandbox.ts --preflight
  Assert-ExitCode "preflight"
  $preflight = $preflightJson | ConvertFrom-Json
  Assert-Preflight $preflight
  [IO.File]::WriteAllText($preflightPath, (($preflight | ConvertTo-Json -Depth 20) + "`n"), [Text.UTF8Encoding]::new($false))

  & npx vitest run test/construction-operating-assistant-r37-openrouter-sandbox.test.ts test/construction-operating-assistant-r37k-provider-route-absence.test.ts test/construction-operating-assistant-r37o-provider-boundary-release-gate.test.ts
  Assert-ExitCode "unit-and-boundary-tests"
  & npm run validate:provider-boundary
  Assert-ExitCode "provider-boundary"

  if ($preflight.credentialPresent -and -not $preflight.exchangeValid) { throw "R37_EXCHANGE_EVIDENCE_REQUIRED" }

  # Windows PowerShell 5.1 promotes any native stderr line to an ErrorRecord
  # when ErrorActionPreference is Stop. Prisma writes harmless config notices
  # to stderr, so capture its real process exit code without treating those
  # notices as terminating PowerShell errors.
  $previousErrorActionPreference = $ErrorActionPreference
  $ErrorActionPreference = "Continue"
  try {
    $devOutput = @(& npx prisma dev -n $serverName -d 2>&1)
    $devExitCode = $LASTEXITCODE
  } finally {
    $ErrorActionPreference = $previousErrorActionPreference
  }
  if ($devExitCode -ne 0) { throw "R37_COMMAND_FAILED:database-start:$devExitCode" }
  $serverCreated = $true
  $templateUrl = $devOutput | ForEach-Object { $_.ToString().Trim() } | Where-Object { $_ -match '^postgres://' } | Select-Object -Last 1
  if (-not $templateUrl) { throw "R37_DATABASE_URL_MISSING" }
  $previousErrorActionPreference = $ErrorActionPreference
  $ErrorActionPreference = "Continue"
  try {
    "CREATE DATABASE `"$databaseName`" TEMPLATE template0;" | & npx prisma db execute --stdin --url $templateUrl
    $databaseCreateExitCode = $LASTEXITCODE
  } finally {
    $ErrorActionPreference = $previousErrorActionPreference
  }
  if ($databaseCreateExitCode -ne 0) { throw "R37_COMMAND_FAILED:database-create:$databaseCreateExitCode" }
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
    # The integration global setup already rebuilt this exact disposable
    # database from all migration.sql files. Running Prisma migrate deploy a
    # second time is both redundant and invalid here because that safe rebuild
    # intentionally does not create Prisma's _prisma_migrations ledger.
    & npx tsx --require ./scripts/register-server-only.cjs scripts/run-r37-openrouter-sandbox.ts
    Assert-ExitCode "observed-run"
    $report = Get-Content -Raw -LiteralPath $observedReportPath | ConvertFrom-Json
    Assert-ObservedReport $report
    $resultState = "OPENROUTER_SANDBOX_OBSERVED_PASS"
  }
} finally {
  Remove-Item Env:DATABASE_URL -ErrorAction SilentlyContinue
  Remove-Item Env:DIRECT_URL -ErrorAction SilentlyContinue
  Remove-Item Env:AFTERDESK_TEST_DATABASE_URL -ErrorAction SilentlyContinue
  Remove-Item Env:ALLOW_INTEGRATION_DB_RESET -ErrorAction SilentlyContinue
  if ($serverCreated) {
    $previousErrorActionPreference = $ErrorActionPreference
    $ErrorActionPreference = "Continue"
    try {
      "i will lose local data" | & npx prisma dev rm --force $serverName 2>&1 | Out-Null
      $cleanupExitCode = $LASTEXITCODE
    } finally {
      $ErrorActionPreference = $previousErrorActionPreference
    }
    if ($cleanupExitCode -ne 0) { throw "R37_DATABASE_CLEANUP_FAILED:$serverName" }
    $databaseCleanupVerified = $true
  }
  Pop-Location
}

if (-not $databaseCleanupVerified) { throw "R37_DATABASE_CLEANUP_NOT_VERIFIED" }
if ($credentialRequiredForCompletion) { throw "R37_CREDENTIAL_REQUIRED" }
Write-Output "R37_STATE=$resultState"
Write-Output "R37_CREDENTIAL_VALUE_INSPECTED=false"
if (-not $preflight.credentialPresent) { Write-Output "R37_NETWORK_CALLS=0" }
