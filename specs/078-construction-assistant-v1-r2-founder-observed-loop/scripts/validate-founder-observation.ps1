[CmdletBinding()]
param()
$ErrorActionPreference = 'Stop'
$feature = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$observation = Join-Path $feature 'evidence\founder-observation.json'
$measurements = Join-Path $feature 'evidence\technical-measurements.json'
if (-not (Test-Path -LiteralPath $observation)) { throw 'FOUNDER_OBSERVATION_MISSING' }
if (-not (Test-Path -LiteralPath $measurements)) { throw 'TECHNICAL_MEASUREMENTS_MISSING' }
$result = npm.cmd exec -- tsx (Join-Path $PSScriptRoot 'adjudicate.ts') | Out-String
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
if ($result -notmatch '"verdict": "REWORK"') { throw 'OBSERVATION_VERDICT_DRIFT' }
Write-Output 'FOUNDER_OBSERVATION_VALID_REWORK'
