[CmdletBinding()]
param()

$ErrorActionPreference = 'Stop'
$root = (Resolve-Path (Join-Path $PSScriptRoot '..\..\..')).Path
$feature = Join-Path $root 'specs\079-construction-assistant-v1-r3-corrected-founder-retest'
$manifest = Join-Path $feature 'LONG_RUN_PROGRAM.json'

pwsh C:\dev\afterdesk-project-brain\scripts\validate-long-run-program.ps1 -ManifestPath $manifest
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

npm.cmd run test:run -- test/construction-assistant-v1-r3-founder-retest-contract.test.ts
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

npm.cmd exec tsx specs/079-construction-assistant-v1-r3-corrected-founder-retest/scripts/run-mutations.ts
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

Write-Output 'R3_RETEST_CONTRACT_VALID'
