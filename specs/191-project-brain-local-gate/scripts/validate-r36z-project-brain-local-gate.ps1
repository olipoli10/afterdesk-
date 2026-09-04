[CmdletBinding()]
param()

$ErrorActionPreference = "Stop"
$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..\..\..")).Path
$featureRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$evidenceRoot = Join-Path $featureRoot "evidence"
$commandOutputRoot = Join-Path $evidenceRoot "command-output"
$reportPath = Join-Path $evidenceRoot "local-gate-report.json"
$closeoutPath = Join-Path $evidenceRoot "closeout.md"
$mutationsEvidencePath = Join-Path $evidenceRoot "mutations.md"
$contractPath = Join-Path $PSScriptRoot "r36z-gate-contract.json"
$runId = "r36z-" + [Guid]::NewGuid().ToString("N")
$fragmentRoot = Join-Path ([IO.Path]::GetTempPath()) $runId
$serverName = "endvera-r36z-gate-$PID"
$databaseName = "afterdesk_r36z_${PID}_integration"
$serverCreated = $false
$databaseCleanupVerified = $false
$fragmentCleanupVerified = $false
$phaseOneComplete = $false
$commands = [Collections.Generic.List[object]]::new()

function Assert-LastExitCode {
  param([Parameter(Mandatory = $true)][string]$Label)
  if ($LASTEXITCODE -ne 0) { throw "R36Z_COMMAND_FAILED:${Label}:$LASTEXITCODE" }
}

function Get-MatchCount {
  param([string]$Text, [string]$Pattern)
  $matches = [regex]::Matches($Text, $Pattern, [Text.RegularExpressions.RegexOptions]::IgnoreCase)
  if ($matches.Count -eq 0) { return 0 }
  return [int](($matches | ForEach-Object { [int]$_.Groups[1].Value } | Measure-Object -Maximum).Maximum)
}

function Invoke-RecordedCommand {
  param(
    [Parameter(Mandatory = $true)][string]$Name,
    [Parameter(Mandatory = $true)][string]$File,
    [Parameter(Mandatory = $true)][string[]]$Arguments,
    [int]$AllowedSkipped = 0
  )
  $started = [DateTime]::UtcNow
  $output = @(& $File @Arguments 2>&1)
  $exitCode = $LASTEXITCODE
  $ended = [DateTime]::UtcNow
  $text = $output -join "`n"
  $bounded = if ($text.Length -gt 131072) { "[TRUNCATED_TO_LAST_131072_CHARS]`n" + $text.Substring($text.Length - 131072) } else { $text }
  $bounded = ((($bounded -split "`r?`n") | ForEach-Object { $_.TrimEnd() }) -join "`n").TrimEnd()
  $logPath = Join-Path $commandOutputRoot "$Name.log"
  [IO.File]::WriteAllText($logPath, $bounded + "`n", [Text.UTF8Encoding]::new($false))
  $passed = Get-MatchCount $text '(?m)^\s*Tests\s+(\d+)\s+passed'
  $skipped = Get-MatchCount $text '\b([1-9]\d*)\s+skipped\b'
  $pending = Get-MatchCount $text '\b([1-9]\d*)\s+pending\b'
  $commands.Add([ordered]@{
    name = $Name
    argv = @($File) + $Arguments
    startedAtUtc = $started.ToString("o")
    endedAtUtc = $ended.ToString("o")
    exitCode = $exitCode
    testTotals = [ordered]@{ passed = $passed; skipped = $skipped; mandatorySkipped = 0; pending = $pending }
    outputEvidencePath = "evidence/command-output/$Name.log"
    outputSha256 = (Get-FileHash -LiteralPath $logPath -Algorithm SHA256).Hash.ToLowerInvariant()
  })
  if ($exitCode -ne 0) { throw "R36Z_COMMAND_FAILED:${Name}:$exitCode" }
  if ($skipped -ne $AllowedSkipped -or $pending -ne 0) { throw "R36Z_MANDATORY_TEST_NOT_EXECUTED:${Name}:skipped=$skipped:allowedSkipped=$AllowedSkipped:pending=$pending" }
  return $output
}

function New-GateAssertion {
  param([Parameter(Mandatory = $true)][string]$Id, [Parameter(Mandatory = $true)][string]$Evidence)
  return [ordered]@{
    id = $Id
    chapter = "GATE"
    expected = 0
    actual = 0
    status = "PASS"
    evidence = $Evidence
    label = "TEST"
  }
}

function Assert-ExactSet {
  param([string[]]$Expected, [string[]]$Actual, [string]$Guard)
  if ($Actual.Count -ne $Expected.Count -or @($Actual | Sort-Object -Unique).Count -ne $Actual.Count -or @(Compare-Object $Expected $Actual).Count -ne 0) {
    throw "R36Z_EXACT_SET_GUARD:$Guard"
  }
}

function Assert-StrictReport {
  param([Parameter(Mandatory = $true)]$Report, [Parameter(Mandatory = $true)]$Contract)
  $top = @("schemaVersion", "release", "runId", "status", "evidenceLabels", "database", "assertions", "mutations", "commands", "effectCounters", "cleanup")
  Assert-ExactSet $top @($Report.PSObject.Properties.Name) "reportTopLevel"
  if ($Report.schemaVersion -ne 1 -or $Report.release -ne "R36Z-PROJECT-BRAIN-LOCAL-GATE" -or $Report.runId -ne $runId -or $Report.status -ne "PASS") { throw "R36Z_REPORT_IDENTITY_INVALID" }
  if (-not $Report.evidenceLabels.code -or -not $Report.evidenceLabels.test -or -not $Report.evidenceLabels.synthetic -or $Report.evidenceLabels.founderObserved -or $Report.evidenceLabels.customerObserved -or $Report.evidenceLabels.providerObserved) { throw "R36Z_REPORT_LABELS_INVALID" }
  if (-not $Report.database.disposable -or -not $Report.database.ownershipVerified -or -not $Report.database.cleanupVerified) { throw "R36Z_REPORT_DATABASE_INVALID" }
  Assert-ExactSet @($Contract.requiredAssertionIds) @($Report.assertions | ForEach-Object { $_.id }) "assertions"
  Assert-ExactSet @($Contract.requiredMutationIds) @($Report.mutations | ForEach-Object { $_.id }) "mutations"
  if (@($Report.assertions | Where-Object { $_.status -ne "PASS" }).Count -ne 0) { throw "R36Z_ASSERTION_NOT_PASS" }
  if (@($Report.mutations | Where-Object { $_.status -ne "KILLED" -or -not $_.byteExactRestore -or -not $_.targetedGreenRerun }).Count -ne 0) { throw "R36Z_MUTATION_NOT_COMPLETE" }
  if (@($Report.commands | Where-Object { $_.exitCode -ne 0 -or $_.testTotals.mandatorySkipped -ne 0 -or $_.testTotals.pending -ne 0 }).Count -ne 0) { throw "R36Z_COMMAND_RECORD_INVALID" }
  foreach ($property in $Report.effectCounters.PSObject.Properties) { if ([int64]$property.Value -ne 0) { throw "R36Z_FORBIDDEN_EFFECT_NONZERO:$($property.Name)" } }
  if (-not $Report.cleanup.serverRemoved -or -not $Report.cleanup.fragmentDirectoryRemoved -or -not $Report.cleanup.reportAtomicRename) { throw "R36Z_CLEANUP_RECORD_INVALID" }
}

Push-Location $repoRoot
try {
  [IO.Directory]::CreateDirectory($evidenceRoot) | Out-Null
  [IO.Directory]::CreateDirectory($commandOutputRoot) | Out-Null
  [IO.Directory]::CreateDirectory($fragmentRoot) | Out-Null
  if (-not ([IO.Path]::GetFullPath($fragmentRoot)).StartsWith([IO.Path]::GetTempPath(), [StringComparison]::OrdinalIgnoreCase)) { throw "R36Z_FRAGMENT_OWNERSHIP_INVALID" }
  if (-not $serverName.StartsWith("endvera-r36z-gate-", [StringComparison]::Ordinal)) { throw "R36Z_SERVER_OWNERSHIP_INVALID" }
  if (-not $databaseName.StartsWith("afterdesk_r36z_", [StringComparison]::Ordinal) -or -not $databaseName.EndsWith("_integration", [StringComparison]::Ordinal)) { throw "R36Z_DATABASE_OWNERSHIP_INVALID" }

  foreach ($name in @("OPENAI_API_KEY", "ANTHROPIC_API_KEY", "TWILIO_ACCOUNT_SID", "TWILIO_AUTH_TOKEN", "PERPLEXITY_API_KEY")) {
    if (Test-Path "Env:$name") { throw "R36Z_CREDENTIAL_ENV_REFUSED:$name" }
  }

  & pwsh -NoProfile -File (Join-Path $PSScriptRoot "validate-r36z-contract.ps1") -ContractPath $contractPath
  Assert-LastExitCode "contract"
  $contract = Get-Content -LiteralPath $contractPath -Raw -Encoding utf8 | ConvertFrom-Json -Depth 30

  $env:R36Z_FRAGMENT_DIR = $fragmentRoot
  $env:R36Z_RUN_ID = $runId

  Invoke-RecordedCommand "targeted-contracts" "npx" @(
    "vitest", "run",
    "test/construction-operating-assistant-r36v-project-brain-contracts.test.ts",
    "test/construction-operating-assistant-r36v-project-brain-api.test.ts",
    "test/construction-operating-assistant-r36v-project-brain-query.test.ts",
    "test/construction-operating-assistant-r36v-project-brain-server-hardening.test.ts",
    "test/construction-operating-assistant-r36v-project-brain-file-ownership.test.ts",
    "test/construction-operating-assistant-r36v-local-storage-scan.test.ts",
    "test/construction-operating-assistant-r36w-fact-candidates-contracts.test.ts",
    "test/construction-operating-assistant-r36w-fact-candidates-api.test.ts",
    "test/construction-operating-assistant-r36w-fact-candidates-server.test.ts",
    "test/construction-operating-assistant-r36w-fact-candidates-mutation-guards.test.ts",
    "test/construction-operating-assistant-r36x-understanding-contracts.test.ts",
    "test/construction-operating-assistant-r36x-understanding-api.test.ts",
    "test/construction-operating-assistant-r36x-understanding-server.test.ts",
    "test/construction-operating-assistant-r36x-understanding-mutation-guards.test.ts",
    "test/construction-operating-assistant-r36y-assistant-memory-contracts.test.ts",
    "test/construction-operating-assistant-r36y-assistant-memory-api.test.ts",
    "test/construction-operating-assistant-r36y-assistant-memory-server.test.ts",
    "test/construction-operating-assistant-r36y-assistant-memory-mutation-guards.test.ts"
  ) | Out-Null

  Invoke-RecordedCommand "mobile-project-brain" "npm" @("--prefix", "apps/mobile", "test", "--", "--run", "project-brain-intake.test.ts", "project-brain-understanding-review.test.ts", "project-brain-assistant-memory.test.ts", "project-brain-local-gate.test.ts") | Out-Null
  Invoke-RecordedCommand "mutations" "pwsh" @("-NoProfile", "-File", (Join-Path $PSScriptRoot "validate-r36z-mutations.ps1")) | Out-Null

  $devOutput = @(& npx prisma dev -n $serverName -d 2>&1)
  Assert-LastExitCode "database-start"
  $serverCreated = $true
  $templateUrl = $devOutput | ForEach-Object { $_.ToString().Trim() } | Where-Object { $_ -match '^postgres://' } | Select-Object -Last 1
  if (-not $templateUrl) { throw "R36Z_DATABASE_TCP_URL_MISSING" }
  "CREATE DATABASE `"$databaseName`" TEMPLATE template0;" | & npx prisma db execute --stdin --url $templateUrl
  Assert-LastExitCode "database-create"
  $uri = [UriBuilder]$templateUrl
  $uri.Path = "/$databaseName"
  $uri.Query = "$($uri.Query.TrimStart('?'))&pgbouncer=true&connection_limit=10"
  $env:AFTERDESK_TEST_DATABASE_URL = $uri.Uri.AbsoluteUri
  $env:ALLOW_INTEGRATION_DB_RESET = "1"

  Invoke-RecordedCommand "integrated-project-brain" "npm" @("run", "test:integration", "--", "test/integration/construction-operating-assistant-r36z-project-brain-local-gate.itest.ts") | Out-Null
  Invoke-RecordedCommand "raw-postgresql" "npm" @(
    "run", "test:integration", "--",
    "test/integration/construction-operating-assistant-r36v-project-brain.itest.ts",
    "test/integration/construction-operating-assistant-r36v-project-brain-file-ownership.itest.ts",
    "test/integration/construction-operating-assistant-r36w-fact-candidates.itest.ts",
    "test/integration/construction-operating-assistant-r36x-understanding.itest.ts",
    "test/integration/construction-operating-assistant-r36y-assistant-memory.itest.ts"
  ) | Out-Null
  $phaseOneComplete = $true
} finally {
  Remove-Item Env:R36Z_FRAGMENT_DIR -ErrorAction SilentlyContinue
  Remove-Item Env:R36Z_RUN_ID -ErrorAction SilentlyContinue
  Remove-Item Env:AFTERDESK_TEST_DATABASE_URL -ErrorAction SilentlyContinue
  Remove-Item Env:ALLOW_INTEGRATION_DB_RESET -ErrorAction SilentlyContinue
  if ($serverCreated) {
    "i will lose local data" | & npx prisma dev rm --force $serverName | Out-Null
    if ($LASTEXITCODE -ne 0) { throw "R36Z_DATABASE_CLEANUP_FAILED:$serverName" }
    $databaseCleanupVerified = $true
  }
  if (-not $phaseOneComplete) {
    if ([IO.Directory]::Exists($fragmentRoot)) { [IO.Directory]::Delete($fragmentRoot, $true) }
    Pop-Location
  }
}

try {
  $listedServers = @(& npx prisma dev ls 2>&1) -join "`n"
  if ($listedServers.Contains($serverName)) { throw "R36Z_DATABASE_POST_CLEANUP_PROBE_FAILED" }
  if (-not $databaseCleanupVerified) { throw "R36Z_DATABASE_CLEANUP_NOT_REACHED" }

  $actualFragments = @(Get-ChildItem -LiteralPath $fragmentRoot -File | ForEach-Object { $_.Name })
  Assert-ExactSet @($contract.allowedFragments) $actualFragments "fragments"
  $fragments = @{}
  foreach ($name in @($contract.allowedFragments)) {
    $fragment = Get-Content -LiteralPath (Join-Path $fragmentRoot $name) -Raw -Encoding utf8 | ConvertFrom-Json -Depth 40
    if ($fragment.schemaVersion -ne 1 -or $fragment.runId -ne $runId -or ($fragment.fragmentId + ".json") -ne $name) { throw "R36Z_FRAGMENT_IDENTITY_INVALID:$name" }
    $fragments[$fragment.fragmentId] = $fragment
  }

  $assertions = [Collections.Generic.List[object]]::new()
  foreach ($item in @($fragments.integration.assertions) + @($fragments.mobile.assertions)) { $assertions.Add($item) }
  $assertions.Add((New-GateAssertion "GATE-TARGETED-CONTRACTS" "evidence/command-output/targeted-contracts.log"))
  $assertions.Add((New-GateAssertion "GATE-RAW-POSTGRESQL" "evidence/command-output/raw-postgresql.log"))
  $assertions.Add((New-GateAssertion "GATE-MUTATIONS" "evidence/command-output/mutations.log"))

  Invoke-RecordedCommand "provider-boundary" "npm" @("run", "validate:provider-boundary") | Out-Null
  $assertions.Add((New-GateAssertion "GATE-PROVIDER-BOUNDARY" "evidence/command-output/provider-boundary.log"))
  Invoke-RecordedCommand "root-lint" "npm" @("run", "lint") | Out-Null
  $assertions.Add((New-GateAssertion "GATE-ROOT-LINT" "evidence/command-output/root-lint.log"))
  Invoke-RecordedCommand "root-typecheck" "npm" @("run", "typecheck") | Out-Null
  $assertions.Add((New-GateAssertion "GATE-ROOT-TYPECHECK" "evidence/command-output/root-typecheck.log"))
  Invoke-RecordedCommand "mobile-lint" "npm" @("--prefix", "apps/mobile", "run", "lint") | Out-Null
  $assertions.Add((New-GateAssertion "GATE-MOBILE-LINT" "evidence/command-output/mobile-lint.log"))
  Invoke-RecordedCommand "mobile-typecheck" "npm" @("--prefix", "apps/mobile", "run", "typecheck") | Out-Null
  $assertions.Add((New-GateAssertion "GATE-MOBILE-TYPECHECK" "evidence/command-output/mobile-typecheck.log"))
  Invoke-RecordedCommand "root-full-suite" "npm" @("test", "--", "--run", "--maxWorkers=1", "--no-file-parallelism") -AllowedSkipped 2 | Out-Null
  $assertions.Add((New-GateAssertion "GATE-ROOT-FULL-SUITE" "evidence/command-output/root-full-suite.log"))
  Invoke-RecordedCommand "mobile-full-suite" "npm" @("--prefix", "apps/mobile", "test") | Out-Null
  $assertions.Add((New-GateAssertion "GATE-MOBILE-FULL-SUITE" "evidence/command-output/mobile-full-suite.log"))

  $savedBuildEnvironment = @{}
  foreach ($name in @("VERCEL_ENV", "BETTER_AUTH_SECRET", "R2_ACCOUNT_ID", "R2_ACCESS_KEY_ID", "R2_SECRET_ACCESS_KEY", "R2_BUCKET")) {
    $savedBuildEnvironment[$name] = [Environment]::GetEnvironmentVariable($name, "Process")
  }
  try {
    $env:VERCEL_ENV = "development"
    $env:BETTER_AUTH_SECRET = "r36z-local-synthetic-build-secret-32-characters"
    $env:R2_ACCOUNT_ID = "r36z-local-synthetic"
    $env:R2_ACCESS_KEY_ID = "r36z-local-synthetic"
    $env:R2_SECRET_ACCESS_KEY = "r36z-local-synthetic"
    $env:R2_BUCKET = "r36z-local-synthetic"
    Invoke-RecordedCommand "webpack-build" "npm" @("run", "build", "--", "--webpack") | Out-Null
  } finally {
    foreach ($name in $savedBuildEnvironment.Keys) {
      $value = $savedBuildEnvironment[$name]
      if ($null -eq $value) { Remove-Item "Env:$name" -ErrorAction SilentlyContinue } else { [Environment]::SetEnvironmentVariable($name, $value, "Process") }
    }
  }
  $assertions.Add((New-GateAssertion "GATE-WEBPACK-BUILD" "evidence/command-output/webpack-build.log"))
  $assertions.Add((New-GateAssertion "GATE-REPORT-SCHEMA" "specs/191-project-brain-local-gate/contracts/project-brain-local-gate-report.md"))
  $assertions.Add((New-GateAssertion "GATE-CLEANUP" "validator-owned post-cleanup probes"))

  Assert-ExactSet @($contract.requiredAssertionIds) @($assertions | ForEach-Object { $_.id }) "preReportAssertions"
  $mutations = @($fragments.mutations.mutations)
  Assert-ExactSet @($contract.requiredMutationIds) @($mutations | ForEach-Object { $_.id }) "preReportMutations"

  $mutationLines = @("# R36Z Mutation Evidence", "", "All 18 mutations were killed, restored byte-exactly and followed by a green targeted rerun.", "", "| Mutation | Exact guard | Before/after SHA-256 | Result |", "|---|---|---|---|")
  foreach ($mutation in $mutations) { $mutationLines += "| $($mutation.id) | ``$($mutation.expectedGuard)`` | ``$($mutation.beforeSha256)`` | KILLED / RESTORED |" }
  [IO.File]::WriteAllText($mutationsEvidencePath, ($mutationLines -join "`n") + "`n", [Text.UTF8Encoding]::new($false))

  if ([IO.Directory]::Exists($fragmentRoot)) { [IO.Directory]::Delete($fragmentRoot, $true) }
  $fragmentCleanupVerified = -not [IO.Directory]::Exists($fragmentRoot)
  if (-not $fragmentCleanupVerified) { throw "R36Z_FRAGMENT_CLEANUP_FAILED" }

  $report = [ordered]@{
    schemaVersion = 1
    release = "R36Z-PROJECT-BRAIN-LOCAL-GATE"
    runId = $runId
    status = "PASS"
    evidenceLabels = [ordered]@{ code = $true; test = $true; synthetic = $true; founderObserved = $false; customerObserved = $false; providerObserved = $false }
    database = [ordered]@{ disposable = $true; ownershipVerified = $true; cleanupVerified = $databaseCleanupVerified }
    assertions = @($assertions)
    mutations = $mutations
    commands = @($commands)
    effectCounters = $fragments.integration.effectCounters
    cleanup = [ordered]@{ serverName = $serverName; serverRemoved = $databaseCleanupVerified; fragmentDirectory = $fragmentRoot; fragmentDirectoryRemoved = $fragmentCleanupVerified; reportAtomicRename = $true }
  }
  # Validate the same strict PSCustomObject shape that is actually persisted;
  # an in-memory OrderedDictionary exposes collection members as properties.
  $reportObject = $report | ConvertTo-Json -Depth 50 | ConvertFrom-Json -Depth 50
  Assert-StrictReport $reportObject $contract

  $tempReportPath = Join-Path $evidenceRoot (".local-gate-report.$runId.tmp")
  [IO.File]::WriteAllText($tempReportPath, (($reportObject | ConvertTo-Json -Depth 50) + "`n"), [Text.UTF8Encoding]::new($false))
  [IO.File]::Move($tempReportPath, $reportPath, $true)
  $roundTrip = Get-Content -LiteralPath $reportPath -Raw -Encoding utf8 | ConvertFrom-Json -Depth 50
  Assert-StrictReport $roundTrip $contract

  $closeout = @"
# R36Z Project Brain Local Gate — Closeout

- Verdict local automatisé: `PASS`.
- Preuve: `CODE` + `TEST` + `SYNTHETIC` seulement.
- Observation fondateur: absente.
- Observation client: absente.
- Observation provider: absente.
- Chaîne prouvée: R36V intake → R36W candidats → R36X compréhension confirmée → R36Y rappel cité/action `PREPARED_UNSENT`.
- Reprise: second processus réel, projection et compteurs canoniques identiques.
- Mutations: 18/18 tuées, restauration octet-exacte et rerun ciblé vert.
- Base: PostgreSQL locale jetable, propriété et suppression vérifiées.
- Effets externes: zéro provider, credential, réseau, transport, WRITE, approbation, livraison et dépense.
- Portée publique: aucun push, Preview, Production, déploiement ou store.
- Métriques: roadmap 22%; build readiness 46.75% (affiché 47%); C2 18/18 (100%); real provider/customer test readiness NO-GO; Verified-E2E 0%. Aucun score n’augmente sur cette preuve synthétique.
"@
  [IO.File]::WriteAllText($closeoutPath, $closeout.TrimStart() + "`n", [Text.UTF8Encoding]::new($false))

  & git diff --check
  Assert-LastExitCode "git-diff-check"
  Write-Output "R36Z_ASSERTIONS=$($assertions.Count)"
  Write-Output "R36Z_MUTATIONS=$($mutations.Count)"
  Write-Output "R36Z_REPORT_SHA256=$((Get-FileHash -LiteralPath $reportPath -Algorithm SHA256).Hash.ToLowerInvariant())"
  Write-Output "R36Z_PROJECT_BRAIN_LOCAL_GATE=PASS"
} finally {
  if ([IO.Directory]::Exists($fragmentRoot)) { [IO.Directory]::Delete($fragmentRoot, $true) }
  Pop-Location
}
