[CmdletBinding()]
param()

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$featureRoot = Split-Path -Parent $PSScriptRoot
$proofPath = Join-Path $featureRoot 'evidence\local-proof-result.json'
$mutationPath = Join-Path $featureRoot 'evidence\mutation-results.json'
$errors = [System.Collections.Generic.List[string]]::new()

if (-not (Test-Path -LiteralPath $proofPath -PathType Leaf)) {
    $errors.Add('missing local proof result')
}
if (-not (Test-Path -LiteralPath $mutationPath -PathType Leaf)) {
    $errors.Add('missing mutation result')
}

if ($errors.Count -eq 0) {
    $proof = Get-Content -LiteralPath $proofPath -Raw | ConvertFrom-Json
    $mutations = Get-Content -LiteralPath $mutationPath -Raw | ConvertFrom-Json

    $knownProofFields = @(
        'schemaVersion', 'scenarioId', 'materialClass', 'databaseClass', 'verdict',
        'canonicalEffects', 'invoiceReadiness', 'isolation', 'validation', 'limits', 'sealedAtUtc'
    )
    foreach ($field in $proof.PSObject.Properties.Name) {
        if ($knownProofFields -notcontains $field) { $errors.Add("unknown proof field: $field") }
    }

    if ($proof.scenarioId -ne 'WORK_FINISHED_TO_INVOICE_READY_LOCAL_R0') { $errors.Add('scenario id drift') }
    if ($proof.verdict -ne 'READY_FOR_FOUNDER_OWNED_INVOICE_READINESS_LOOP_TEST') { $errors.Add('verdict drift') }
    if ($proof.materialClass -ne 'SYNTHETIC_ONLY') { $errors.Add('material is not synthetic only') }
    if ($proof.databaseClass -ne 'DISPOSABLE_LOCAL_POSTGRESQL') { $errors.Add('database is not disposable local PostgreSQL') }
    if ($proof.canonicalEffects.canonicalOpenLoops -ne 1) { $errors.Add('canonical loop count is not one') }
    if ($proof.canonicalEffects.duplicateCanonicalEffects -ne 0 -or $proof.canonicalEffects.replayCanonicalEffects -ne 0) { $errors.Add('duplicate or replay created a canonical effect') }
    if ($proof.canonicalEffects.externalTransports -ne 0 -or $proof.canonicalEffects.providerInvocations -ne 0) { $errors.Add('external transport or provider invocation observed') }
    if ($proof.invoiceReadiness.preparedFollowUpStatus -ne 'PREPARED_UNSENT' -or $proof.invoiceReadiness.transportAuthorized) { $errors.Add('prepared follow-up boundary drift') }
    if ($proof.isolation.fieldWorkerFinancialLeakCount -ne 0 -or $proof.isolation.inventedFactCount -ne 0) { $errors.Add('financial leakage or invented fact observed') }
    if ($proof.validation.mutationCount -lt 20 -or $proof.validation.mutationsKilled -ne $proof.validation.mutationCount -or $proof.validation.mutationsByteRestored -ne $proof.validation.mutationCount) { $errors.Add('mutation threshold not satisfied') }
    if ($proof.validation.packageLockChanged) { $errors.Add('package-lock changed') }
    if ($proof.validation.buildPagesPassed -ne $proof.validation.buildPagesExpected) { $errors.Add('build page count mismatch') }
    if ($proof.limits.founderObserved -or $proof.limits.customerObserved -or $proof.limits.providerObserved) { $errors.Add('unearned observed claim') }
    if ($proof.limits.verifiedE2EObservedCoveragePercent -ne 0 -or $proof.limits.r3FounderObservationUpgraded) { $errors.Add('dashboard or R3 evidence drift') }
    if (-not $mutations.allKilled -or -not $mutations.allByteRestored -or $mutations.beforeSha256 -ne $mutations.afterSha256) { $errors.Add('mutation evidence invalid') }
}

Write-Output "INVALID=$($errors.Count)"
if ($errors.Count -gt 0) {
    foreach ($errorMessage in $errors) { Write-Output "ERROR=$errorMessage" }
    Write-Output 'VERDICT=INVALID'
    exit 1
}

Write-Output 'VERDICT=READY_FOR_FOUNDER_OWNED_INVOICE_READINESS_LOOP_TEST'
exit 0
