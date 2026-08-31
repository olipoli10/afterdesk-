[CmdletBinding()]
param()

$ErrorActionPreference = 'Stop'
$root = (Resolve-Path (Join-Path $PSScriptRoot '..\..\..')).Path
$feature = Join-Path $root 'specs\078-construction-assistant-v1-r2-founder-observed-loop'
$observation = Join-Path $feature 'evidence\founder-observation.json'

if (Test-Path -LiteralPath $observation) { throw 'FOUNDER_OBSERVATION_MUST_NOT_EXIST_DURING_PREFLIGHT' }
if ((git -C $root rev-parse '1dcd7c8874c7039bfc0bc9cf7cbfc5bd90ef0fa7^{tree}').Trim() -ne 'c0c9dbcb800e469775b9c4339da914cbc16da1dd') { throw 'SOURCE_TREE_DRIFT' }
if ((git -C $root hash-object package-lock.json).Trim() -ne (git -C $root rev-parse '1dcd7c8874c7039bfc0bc9cf7cbfc5bd90ef0fa7:package-lock.json').Trim()) { throw 'PACKAGE_LOCK_DRIFT' }
$historicalDiff = git -C $root diff --name-only '1dcd7c8874c7039bfc0bc9cf7cbfc5bd90ef0fa7' -- src prisma package-lock.json specs/030* specs/031* specs/032* specs/033* specs/034* specs/035* specs/036* specs/037* specs/038* specs/039* specs/040* specs/041* specs/042* specs/043* specs/044* specs/045* specs/046* specs/047* specs/048* specs/049* specs/050* specs/051* specs/052* specs/053* specs/054* specs/055* specs/056* specs/057* specs/058* specs/059* specs/060* specs/061* specs/062* specs/063* specs/064* specs/065* specs/066* specs/067* specs/068* specs/069* specs/070* specs/071* specs/072* specs/073* specs/074* specs/075* specs/076* specs/077*
if ($historicalDiff) { throw "HISTORICAL_PRODUCT_DRIFT: $($historicalDiff -join ', ')" }

npm.cmd run test:run -- test/construction-assistant-v1-r2-observed-contract.test.ts test/construction-assistant-v1-r2-observed-control.test.ts test/construction-assistant-v1-r2-observed-harness.test.ts
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
Write-Output 'FOUNDER_TEST_PREFLIGHT_VALID'
