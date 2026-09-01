[CmdletBinding()]
param()

$ErrorActionPreference = 'Stop'
$root = (Resolve-Path (Join-Path $PSScriptRoot '..\..\..')).Path
$feature = Join-Path $root 'specs\079-construction-assistant-v1-r3-corrected-founder-retest'
$packetPath = Join-Path $feature 'evidence\preflight-packet.json'
$founderObservationPath = Join-Path $feature 'evidence\founder-observation.json'
$liveSessionPath = Join-Path $feature 'evidence\live-founder-session.json'
$source = 'C:\dev\nightlexicon-endvera-construction-assistant-v1-r2-observed'
$expectedSourceHead = '682eddc528eb564fb4c13e56ef18328e42ad0ba7'
$expectedSourceTree = '8a89ef281e3c8df81f5a60ccc25c08f610d57da2'
$expectedLockBlob = 'f0663f30d007cb2664f7944749cfb0cc12849fd8'

function Assert-Equal([string]$actual, [string]$expected, [string]$guard) {
  if ($actual.Trim() -ne $expected) { throw "$guard expected=$expected actual=$actual" }
}

if (Test-Path $founderObservationPath) { throw 'FOUNDER_OBSERVATION_EXISTS_BEFORE_INVITATION' }
if (Test-Path $liveSessionPath) { throw 'FOUNDER_TIMER_STARTED_BEFORE_FIRST_ACTION' }

Assert-Equal (& git -C $source rev-parse HEAD) $expectedSourceHead 'SOURCE_HEAD_DRIFT'
Assert-Equal (& git -C $source rev-parse 'HEAD^{tree}') $expectedSourceTree 'SOURCE_TREE_DRIFT'
if ((git -C $source status --porcelain).Count -ne 0) { throw 'SOURCE_TRACKED_DIRTY' }
Assert-Equal (git -C $root rev-parse "$expectedSourceHead`:package-lock.json") $expectedLockBlob 'PACKAGE_LOCK_DRIFT'

$historical = git -C $root diff --name-only $expectedSourceHead -- prisma specs/030-* specs/031-* specs/032-* specs/033-* specs/034-* specs/035-* specs/036-* specs/037-* specs/038-* specs/039-* specs/040-* specs/041-* specs/042-* specs/043-* specs/044-* specs/045-* specs/046-* specs/047-* specs/048-* specs/049-* specs/050-* specs/051-* specs/052-* specs/053-* specs/054-* specs/055-* specs/056-* specs/057-* specs/058-* specs/059-* specs/060-* specs/061-* specs/062-* specs/063-* specs/064-* specs/065-* specs/066-* specs/067-* specs/068-* specs/069-* specs/070-* specs/071-* specs/072-* specs/073-* specs/074-* specs/075-* specs/076-* specs/077-* specs/078-*
if ($historical) { throw "HISTORICAL_SCOPE_DRIFT $($historical -join ',')" }

$requiredFiles = @(
  'src/app/client/construction-retest/page.tsx',
  'src/components/construction-assistant-v1/founder-retest/contract.ts',
  'src/components/construction-assistant-v1/founder-retest/founder-retest-console.tsx',
  'src/server/actions/construction-assistant-v1-r3-retest.ts',
  'test/construction-assistant-v1-r3-founder-retest-contract.test.ts',
  'test/construction-assistant-v1-r3-founder-retest-postgres.test.ts'
)
foreach ($relative in $requiredFiles) {
  if (-not (Test-Path (Join-Path $root $relative))) { throw "PREFLIGHT_FILE_MISSING $relative" }
}

$action = Get-Content -Raw (Join-Path $root 'src/server/actions/construction-assistant-v1-r3-retest.ts')
foreach ($guard in @('NODE_ENV === "production"', 'ENDVERA_R3_FOUNDER_RETEST', 'requireRole("CLIENT")', 'ENDVERA_R3_DISPOSABLE_DB_NAME', 'externalTransportUsed: false')) {
  if (-not $action.Contains($guard)) { throw "LOCAL_GUARD_MISSING $guard" }
}

$component = Get-Content -Raw (Join-Path $root 'src/components/construction-assistant-v1/founder-retest/founder-retest-console.tsx')
foreach ($visible in @('Test local — aucun vrai SMS ne sera envoyé', 'Terminer le test', 'Projects', 'Calendar', 'Inbox')) {
  if (-not $component.Contains($visible)) { throw "GUIDED_UI_COPY_MISSING $visible" }
}

$packet = Get-Content -Raw $packetPath | ConvertFrom-Json
if ($packet.schemaVersion -ne 1 -or $packet.verdict -ne 'FOUNDER_RETEST_PREFLIGHT_READY') { throw 'PREFLIGHT_PACKET_INVALID' }
if ($packet.externalProviderCallCount -ne 0 -or $packet.externalTransportCount -ne 0) { throw 'EXTERNAL_ACTIVITY_RECORDED' }
if (-not $packet.disposableDatabase.freshMigrationApplied) { throw 'FRESH_MIGRATION_NOT_ATTESTED' }
if ($packet.disposableDatabase.workspaceCountBeforeFounder -ne 0) { throw 'DISPOSABLE_DATABASE_NOT_PRISTINE' }
if ($packet.validation.fullSuite.passedTests -ne 1189 -or $packet.validation.integrations.passedTests -ne 97 -or $packet.validation.build.staticPages -ne 99) {
  throw 'PRISTINE_ATTESTATION_DRIFT'
}

npm.cmd run test:run -- test/construction-assistant-v1-r3-founder-retest-contract.test.ts test/construction-assistant-v1-r3-founder-retest-postgres.test.ts
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

git -C $root diff --check
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

Write-Output 'R3_FOUNDER_RETEST_PREFLIGHT_VALID'
