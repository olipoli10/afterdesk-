$ErrorActionPreference = 'Stop'

$FeatureRoot = Split-Path -Parent $PSScriptRoot
$FixturePath = Join-Path $FeatureRoot 'fixtures\open-loop-proof-contract.json'
$MutationPath = Join-Path $FeatureRoot 'evidence\mutation-results.json'

npx.cmd tsx (Join-Path $PSScriptRoot 'run-mutations.ts')
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

$fixture = Get-Content -LiteralPath $FixturePath -Raw | ConvertFrom-Json
$mutations = Get-Content -LiteralPath $MutationPath -Raw | ConvertFrom-Json
$invalid = 0
if ($fixture.scenarioId -ne 'WORK_FINISHED_TO_INVOICE_READY_LOCAL_R0') { $invalid++ }
if ($fixture.externalTransportCount -ne 0 -or $fixture.providerInvocationCount -ne 0) { $invalid++ }
if ($mutations.mutationCount -lt 20 -or -not $mutations.allKilled -or -not $mutations.allByteRestored) { $invalid++ }
if ($mutations.beforeSha256 -ne $mutations.afterSha256) { $invalid++ }

Write-Output "MUTATIONS=$($mutations.mutationCount)"
Write-Output "INVALID=$invalid"
if ($invalid -ne 0) { Write-Output 'VERDICT=INVALID'; exit 1 }
Write-Output 'VERDICT=OPEN_LOOP_PROOF_READY'
