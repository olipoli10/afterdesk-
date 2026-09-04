[CmdletBinding()]
param()

$ErrorActionPreference = "Stop"
$contractPath = Join-Path $PSScriptRoot "r36z-gate-contract.json"
$validatorPath = Join-Path $PSScriptRoot "validate-r36z-contract.ps1"
$beforeBytes = [IO.File]::ReadAllBytes($contractPath)
$beforeHash = (Get-FileHash -LiteralPath $contractPath -Algorithm SHA256).Hash.ToLowerInvariant()

$mutations = [ordered]@{
  "intake-source-or-brief-is-omitted" = "intakeSourceAndBriefRequired"
  "r36w-unconfirmed-candidate-becomes-truth" = "unconfirmedCandidateNeverTruth"
  "contradiction-member-or-history-is-erased" = "contradictionHistoryAppendOnly"
  "contradiction-fixture-is-vacuous-auto-detected-or-loses-exact-provenance" = "contradictionFixtureExplicitExactProvenance"
  "unresolved-contradiction-can-seal" = "unresolvedContradictionCannotSeal"
  "assistant-reads-draft-or-stale-memory" = "assistantCurrentConfirmedOnly"
  "citation-chain-is-missing-or-mismatched" = "citationChainRequired"
  "prepared-action-hides-recipient-channel-or-body" = "preparedPayloadVisible"
  "prepared-action-approves-or-delivers" = "preparedActionNoApprovalDelivery"
  "restart-reuses-same-process-state" = "freshProcessRestartRequired"
  "replay-or-concurrency-duplicates-effect" = "replayConcurrencyIdempotent"
  "cross-tenant-project-or-role-discloses-content" = "tenantProjectRoleNonDisclosure"
  "mobile-flow-requires-technical-id" = "mobileNoTechnicalIds"
  "provider-credential-network-or-semantic-binary-path-is-reachable" = "zeroProviderCredentialNetworkSemanticBinary"
  "external-transport-write-or-spend-is-nonzero" = "zeroExternalTransportWriteSpend"
  "missing-skipped-or-unknown-assertion-can-pass" = "missingSkippedUnknownFails"
  "test-writes-final-report-or-fragment-allowlist-is-bypassed" = "validatorOwnsFinalReport"
  "cleanup-target-is-not-owned" = "cleanupOwnershipRequired"
}

$results = [Collections.Generic.List[object]]::new()
try {
  foreach ($entry in $mutations.GetEnumerator()) {
    $id = [string]$entry.Key
    $key = [string]$entry.Value
    $source = [Text.Encoding]::UTF8.GetString($beforeBytes)
    $needle = '"' + $key + '": true'
    $replacement = '"' + $key + '": false'
    $occurrences = ([regex]::Matches($source, [regex]::Escape($needle))).Count
    if ($occurrences -ne 1) { throw "R36Z_MUTATION_SETUP_INVALID:${id}:$occurrences" }

    $mutated = $source.Replace($needle, $replacement)
    [IO.File]::WriteAllText($contractPath, $mutated, [Text.UTF8Encoding]::new($false))
    $mutationHash = (Get-FileHash -LiteralPath $contractPath -Algorithm SHA256).Hash.ToLowerInvariant()
    if ($mutationHash -eq $beforeHash) { throw "R36Z_MUTATION_NON_VACUOUS_REQUIRED:$id" }

    $output = @(& pwsh -NoProfile -File $validatorPath -ContractPath $contractPath 2>&1)
    $exitCode = $LASTEXITCODE
    $expectedGuard = "R36Z_CONTRACT_GUARD:$key"
    if ($exitCode -eq 0 -or -not (($output -join "`n").Contains($expectedGuard))) {
      throw "R36Z_MUTATION_NOT_KILLED:$id expected=$expectedGuard exit=$exitCode output=$($output -join ' | ')"
    }

    [IO.File]::WriteAllBytes($contractPath, $beforeBytes)
    $afterHash = (Get-FileHash -LiteralPath $contractPath -Algorithm SHA256).Hash.ToLowerInvariant()
    if ($afterHash -ne $beforeHash) { throw "R36Z_MUTATION_RESTORE_MISMATCH:$id" }
    & pwsh -NoProfile -File $validatorPath -ContractPath $contractPath | Out-Null
    if ($LASTEXITCODE -ne 0) { throw "R36Z_MUTATION_TARGETED_RERUN_FAILED:$id" }

    $results.Add([ordered]@{
      id = $id
      status = "KILLED"
      setupAssertion = "exactly one true invariant was present"
      expectedGuard = $expectedGuard
      observedExitCode = $exitCode
      beforeSha256 = $beforeHash
      mutationSha256 = $mutationHash
      afterSha256 = $afterHash
      byteExactRestore = $true
      targetedGreenRerun = $true
    })
  }
} finally {
  [IO.File]::WriteAllBytes($contractPath, $beforeBytes)
}

$fragmentDirectory = $env:R36Z_FRAGMENT_DIR
$runId = $env:R36Z_RUN_ID
if ($fragmentDirectory -and $runId) {
  [IO.Directory]::CreateDirectory($fragmentDirectory) | Out-Null
  $fragmentPath = Join-Path $fragmentDirectory "mutations.json"
  if (Test-Path -LiteralPath $fragmentPath) { throw "R36Z_DUPLICATE_MUTATIONS_FRAGMENT" }
  $fragment = [ordered]@{
    schemaVersion = 1
    runId = $runId
    fragmentId = "mutations"
    evidenceLabels = [ordered]@{ test = $true; synthetic = $true; founderObserved = $false; customerObserved = $false; providerObserved = $false }
    mutations = @($results)
  }
  [IO.File]::WriteAllText($fragmentPath, (($fragment | ConvertTo-Json -Depth 20) + "`n"), [Text.UTF8Encoding]::new($false))
}

Write-Output "R36Z_MUTATIONS_KILLED=$($results.Count)"
Write-Output "R36Z_MUTATION_RESTORE_SHA256=$beforeHash"
Write-Output "R36Z_MUTATION_VALIDATION=PASS"
