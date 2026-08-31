$ErrorActionPreference = "Stop"

$featureRoot = Split-Path -Parent $PSScriptRoot
$repoRoot = (Resolve-Path (Join-Path $featureRoot "..\..")).Path
$evidenceRoot = Join-Path $featureRoot "evidence"

& (Join-Path $PSScriptRoot "validate-founder-observation.ps1")

$adjudication = Get-Content (Join-Path $evidenceRoot "adjudication.json") -Raw | ConvertFrom-Json
if ($adjudication.verdict -ne "REWORK") {
  throw "Founder adjudication must remain REWORK."
}

$postCorrection = Get-Content (Join-Path $evidenceRoot "post-correction-synthetic-verification.json") -Raw | ConvertFrom-Json
if ($postCorrection.verdict -ne "CORRECTED_LOOP_SYNTHETIC_PASS") {
  throw "Post-correction synthetic verification is missing or invalid."
}

$admission = Get-Content (Join-Path $evidenceRoot "admission.json") -Raw | ConvertFrom-Json
$currentLockBlob = (& git -C $repoRoot hash-object (Join-Path $repoRoot "package-lock.json")).Trim()
if ($currentLockBlob -ne $admission.packageLockBlob) {
  throw "package-lock.json changed from the admitted baseline."
}

$schemaDiff = & git -C $repoRoot diff 1dcd7c8874c7039bfc0bc9cf7cbfc5bd90ef0fa7 -- prisma/schema.prisma prisma/migrations
if ($schemaDiff) {
  throw "Prisma schema or migrations changed during the observation lane."
}

& git -C $repoRoot diff --check
if ($LASTEXITCODE -ne 0) {
  throw "git diff --check failed."
}

Write-Output "CLOSEOUT_VALID_REWORK_WITH_SYNTHETIC_CORRECTION_PASS"
