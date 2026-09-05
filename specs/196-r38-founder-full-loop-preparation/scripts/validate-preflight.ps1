[CmdletBinding()]
param()

$ErrorActionPreference = 'Stop'
$root = (Resolve-Path (Join-Path $PSScriptRoot '..\..\..')).Path
$feature = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$observation = Join-Path $feature 'evidence\founder-observation.json'
if (Test-Path -LiteralPath $observation) { throw 'FOUNDER_OBSERVATION_MUST_NOT_EXIST_DURING_PREFLIGHT' }

$required = @(
  'spec.md',
  'plan.md',
  'tasks.md',
  'contracts\founder-full-loop.md',
  'scripts\start-founder-test.ps1',
  'scripts\prepare-founder-test.ts',
  '..\..\src\app\founder-full-loop\page.tsx',
  '..\..\src\app\founder-full-loop\access\route.ts',
  '..\..\src\components\construction-operating-assistant-r38\founder-full-loop-console.tsx',
  '..\..\src\server\construction-operating-assistant-r38\founder-test.ts'
)
foreach ($relative in $required) {
  $candidate = Join-Path $feature $relative
  if (-not (Test-Path -LiteralPath $candidate)) { throw "R38_REQUIRED_FILE_MISSING:$relative" }
}

$page = Get-Content -Raw -LiteralPath (Join-Path $root 'src\app\founder-full-loop\page.tsx')
$access = Get-Content -Raw -LiteralPath (Join-Path $root 'src\app\founder-full-loop\access\route.ts')
$harness = Get-Content -Raw -LiteralPath (Join-Path $root 'src\server\construction-operating-assistant-r38\founder-test.ts')
$launcher = Get-Content -Raw -LiteralPath (Join-Path $feature 'scripts\start-founder-test.ps1')
foreach ($guard in @('NODE_ENV === "production"', 'ENDVERA_R38_FOUNDER_TEST_MODE')) {
  if ($page -notlike "*$guard*") { throw "R38_PAGE_GUARD_MISSING:$guard" }
}
if ($access -notlike '*assertLoopbackHost*' -or $access -notlike '*consumeFounderAccessToken*') { throw 'R38_ACCESS_GUARD_MISSING' }
foreach ($guard in @('endvera-construction-operating-assistant-r38', 'PREPARED_UNSENT', 'transportAuthorized: false', 'fieldWorkerFinancialLeakCount')) {
  if ($harness -notlike "*$guard*") { throw "R38_HARNESS_GUARD_MISSING:$guard" }
}
if ($launcher -match 'OPENROUTER|TWILIO|GOOGLE_CLIENT|QUICKBOOKS') { throw 'R38_EXTERNAL_PROVIDER_REFERENCE_REFUSED' }
if ($launcher -notlike '*/founder-full-loop/access?token=*') { throw 'R38_DIRECT_ACCESS_URL_MISSING' }

Write-Output 'R38_FOUNDER_FULL_LOOP_PREFLIGHT_READY'
