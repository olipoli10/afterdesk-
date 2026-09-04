[CmdletBinding()]
param(
  [string]$ContractPath = (Join-Path $PSScriptRoot "r36z-gate-contract.json")
)

$ErrorActionPreference = "Stop"

function Fail-Contract {
  param([Parameter(Mandatory = $true)][string]$Guard)
  throw "R36Z_CONTRACT_GUARD:$Guard"
}

if (-not (Test-Path -LiteralPath $ContractPath -PathType Leaf)) {
  Fail-Contract "contractFileRequired"
}

try {
  $contract = Get-Content -LiteralPath $ContractPath -Raw -Encoding utf8 | ConvertFrom-Json -Depth 20
} catch {
  Fail-Contract "contractJsonRequired"
}

$expectedTopLevel = @("schemaVersion", "release", "allowedFragments", "requiredAssertionIds", "requiredMutationIds", "invariants")
$actualTopLevel = @($contract.PSObject.Properties.Name)
if (@(Compare-Object $expectedTopLevel $actualTopLevel).Count -ne 0) { Fail-Contract "strictTopLevelShape" }
if ($contract.schemaVersion -ne 1) { Fail-Contract "schemaVersion" }
if ($contract.release -ne "R36Z-PROJECT-BRAIN-LOCAL-GATE") { Fail-Contract "releaseIdentity" }

$expectedFragments = @("integration.json", "mobile.json", "mutations.json")
if (@(Compare-Object $expectedFragments @($contract.allowedFragments)).Count -ne 0 -or @($contract.allowedFragments).Count -ne $expectedFragments.Count) {
  Fail-Contract "fragmentAllowlist"
}

foreach ($listName in @("requiredAssertionIds", "requiredMutationIds")) {
  $values = @($contract.$listName)
  if ($values.Count -eq 0 -or @($values | Sort-Object -Unique).Count -ne $values.Count) {
    Fail-Contract "$($listName)UniqueNonEmpty"
  }
}
if (@($contract.requiredAssertionIds).Count -ne 50) { Fail-Contract "requiredAssertionCount" }
if (@($contract.requiredMutationIds).Count -ne 18) { Fail-Contract "requiredMutationCount" }

$expectedInvariantKeys = @(
  "intakeSourceAndBriefRequired",
  "unconfirmedCandidateNeverTruth",
  "contradictionHistoryAppendOnly",
  "contradictionFixtureExplicitExactProvenance",
  "unresolvedContradictionCannotSeal",
  "assistantCurrentConfirmedOnly",
  "citationChainRequired",
  "preparedPayloadVisible",
  "preparedActionNoApprovalDelivery",
  "freshProcessRestartRequired",
  "replayConcurrencyIdempotent",
  "tenantProjectRoleNonDisclosure",
  "mobileNoTechnicalIds",
  "zeroProviderCredentialNetworkSemanticBinary",
  "zeroExternalTransportWriteSpend",
  "missingSkippedUnknownFails",
  "validatorOwnsFinalReport",
  "cleanupOwnershipRequired"
)
$actualInvariantKeys = @($contract.invariants.PSObject.Properties.Name)
if (@(Compare-Object $expectedInvariantKeys $actualInvariantKeys).Count -ne 0) { Fail-Contract "strictInvariantShape" }
foreach ($key in $expectedInvariantKeys) {
  if ($contract.invariants.$key -ne $true) { Fail-Contract $key }
}

$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..\..\..")).Path
$testPaths = @(
  (Join-Path $repoRoot "test\integration\construction-operating-assistant-r36z-project-brain-local-gate.itest.ts"),
  (Join-Path $repoRoot "apps\mobile\test\project-brain-local-gate.test.ts")
)
foreach ($testPath in $testPaths) {
  if (-not (Test-Path -LiteralPath $testPath -PathType Leaf)) { Fail-Contract "requiredTestSource" }
  $source = Get-Content -LiteralPath $testPath -Raw -Encoding utf8
  if ($source -match "local-gate-report\.json") { Fail-Contract "validatorOwnsFinalReport" }
}

Write-Output "R36Z_CONTRACT_VALIDATION=PASS"
