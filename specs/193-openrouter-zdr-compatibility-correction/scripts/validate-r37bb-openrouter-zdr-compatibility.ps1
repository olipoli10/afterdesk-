[CmdletBinding()]
param()

$ErrorActionPreference = "Stop"
$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..\..\..")).Path
$featureRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$snapshotPath = Join-Path $featureRoot "evidence\openrouter-endpoint-eligibility-2026-09-05.json"
$r37ReportPath = Join-Path $repoRoot "specs\192-openrouter-provider-sandbox\evidence\observed-provider-report.json"
$expectedR37Hash = "bc79e1416f82ff08665690b0140471111ce00abb0a026419bb503688b6797eb3"

function Assert-ExitCode([string]$Label) {
  if ($LASTEXITCODE -ne 0) { throw "R37BB_COMMAND_FAILED:${Label}:$LASTEXITCODE" }
}

Push-Location $repoRoot
try {
  foreach ($required in @(
    "spec.md",
    "plan.md",
    "tasks.md",
    "research.md",
    "data-model.md",
    "goal.md",
    "contracts\openrouter-zdr-compatibility.md",
    "evidence\openrouter-endpoint-eligibility-2026-09-05.json",
    "evidence\red.md"
  )) {
    if (-not (Test-Path -LiteralPath (Join-Path $featureRoot $required))) {
      throw "R37BB_ARTIFACT_MISSING:$required"
    }
  }

  $snapshot = Get-Content -Raw -LiteralPath $snapshotPath | ConvertFrom-Json
  if ($snapshot.evidenceLabel -ne "OBSERVED_PUBLIC_METADATA") { throw "R37BB_EVIDENCE_LABEL_INVALID" }
  if (@($snapshot.models).Count -ne 2) { throw "R37BB_MODEL_SET_INVALID" }
  if (@($snapshot.incompatibleR37Parameters).Count -ne 2) { throw "R37BB_DIAGNOSIS_INCOMPLETE" }

  $actualR37Hash = (Get-FileHash -Algorithm SHA256 -LiteralPath $r37ReportPath).Hash.ToLowerInvariant()
  if ($actualR37Hash -ne $expectedR37Hash) { throw "R37BB_R37_SEAL_DRIFT" }

  foreach ($credentialName in @("R37_OPENROUTER_CONTROLLER_API_KEY", "OPENROUTER_API_KEY")) {
    if (Test-Path -LiteralPath "Env:$credentialName") { throw "R37BB_CREDENTIAL_PRESENT" }
  }

  $sourcePath = "src/lib/construction-operating-assistant-r37bb/contracts.ts"
  $forbiddenSourcePatterns = @("fetch\s*\(", "process\.env", "Authorization", "OPENROUTER_ENDPOINT")
  foreach ($pattern in $forbiddenSourcePatterns) {
    $matches = @(rg -n --no-heading --color never $pattern $sourcePath 2>$null)
    if ($LASTEXITCODE -notin @(0, 1)) { throw "R37BB_SOURCE_SCAN_FAILED" }
    if ($matches.Count -gt 0) { throw "R37BB_PROVIDER_REACH_FORBIDDEN" }
  }

  $secretPrefixPattern = "sk-" + "or-v1-"
  $secretFiles = @(rg -l --hidden --glob "!node_modules/**" --glob "!.git/**" $secretPrefixPattern . 2>$null)
  if ($LASTEXITCODE -notin @(0, 1)) { throw "R37BB_SECRET_SCAN_FAILED" }
  if ($secretFiles.Count -gt 0) { throw "R37BB_SECRET_MATERIAL_FOUND" }

  & npm run test:run -- test/construction-operating-assistant-r37bb-zdr-compatibility.test.ts
  Assert-ExitCode "targeted-tests"
  & npm run typecheck
  Assert-ExitCode "typecheck"
  & npm run validate:provider-boundary
  Assert-ExitCode "provider-boundary"
  & git diff --check
  Assert-ExitCode "diff-check"
} finally {
  Pop-Location
}

Write-Output "R37BB_STATE=LOCAL_COMPATIBILITY_CORRECTION_PASS"
Write-Output "R37BB_PROVIDER_GENERATION_CALLS=0"
Write-Output "R37BB_SPEND_MICROS=0"
Write-Output "R37_SEAL_PRESERVED=true"
