[CmdletBinding()]
param()

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$root = Split-Path -Parent $PSScriptRoot
$requiredFiles = @(
    'spec.md',
    'plan.md',
    'tasks.md',
    'research.md',
    'data-model.md',
    'quickstart.md',
    'ASSET_REUSE_AUDIT.md',
    'PRODUCT_ROADMAP_A_TO_Z.md',
    'CONNECTOR_AND_PLATFORM_PLAN.md',
    'checklists/requirements.md',
    'contracts/open-loop-closure.md',
    'contracts/authority-and-actions.md',
    'contracts/permission-matrix.md',
    'contracts/connector-boundaries.md',
    'LONG_RUN_PROGRAM.json',
    'CONTINUATION_QUEUE.json'
)

$errors = [System.Collections.Generic.List[string]]::new()
foreach ($relative in $requiredFiles) {
    $candidate = Join-Path $root $relative
    if (-not (Test-Path -LiteralPath $candidate -PathType Leaf)) {
        $errors.Add("missing required artifact: $relative")
    }
}

$combined = (Get-Content -Raw -LiteralPath (Join-Path $root 'spec.md'), (Join-Path $root 'plan.md'), (Join-Path $root 'PRODUCT_ROADMAP_A_TO_Z.md'), (Join-Path $root 'evidence/dashboard-baseline.md')) -join "`n"
foreach ($requiredText in @(
    'WORK_FINISHED_TO_INVOICE_READY_LOCAL_R0',
    'Open-Loop',
    'real provider/customer test readiness: NO-GO',
    'Verified-E2E observed coverage: 0%',
    'No provider',
    'React Native',
    'Google Calendar'
)) {
    if ($combined -notmatch [regex]::Escape($requiredText)) {
        $errors.Add("missing required product decision: $requiredText")
    }
}

$forbiddenPatterns = @(
    'R3.*OBSERVED_PASS',
    'Verified-E2E observed coverage:\s*[1-9]',
    'real provider/customer test readiness:\s*GO'
)
foreach ($pattern in $forbiddenPatterns) {
    if ($combined -match $pattern) {
        $errors.Add("forbidden unearned claim matched: $pattern")
    }
}

Write-Output "PRODUCT_RESET_ARTIFACTS=$($requiredFiles.Count) INVALID=$($errors.Count)"
if ($errors.Count -gt 0) {
    foreach ($errorMessage in $errors) { Write-Output "ERROR=$errorMessage" }
    exit 1
}

Write-Output 'VERDICT=PRODUCT_RESET_READY_FOR_IMPLEMENTATION'
exit 0
