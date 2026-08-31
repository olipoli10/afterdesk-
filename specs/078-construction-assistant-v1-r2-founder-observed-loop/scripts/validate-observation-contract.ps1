[CmdletBinding()]
param()

$ErrorActionPreference = 'Stop'
$root = (Resolve-Path (Join-Path $PSScriptRoot '..\..\..')).Path
$feature = Join-Path $root 'specs\078-construction-assistant-v1-r2-founder-observed-loop'
$manifest = Join-Path $feature 'LONG_RUN_PROGRAM.json'

pwsh C:\dev\afterdesk-project-brain\scripts\validate-long-run-program.ps1 -ManifestPath $manifest
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

npm.cmd run test:run -- test/construction-assistant-v1-r2-observed-contract.test.ts test/construction-assistant-v1-r2-observed-control.test.ts
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

Write-Output 'OBSERVATION_CONTRACT_VALID'
