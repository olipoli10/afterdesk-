[CmdletBinding()]
param(
  [string]$ExpectedHead = '',
  [string]$ExpectedApiOrigin = '',
  [string]$ExpectedVersionCode = ''
)

$ErrorActionPreference = "Stop"
$easCliVersion = "23.2.0"
$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$mobileRoot = Join-Path $repoRoot "apps\mobile"
$inputGuard = Join-Path $PSScriptRoot 'check-founder-android-inputs.mjs'

function Assert-FounderBuildInputs {
  # Never print caller values, Git paths/status, environment values or raw errors.
  $guardOutput = @(& node $inputGuard --expected-head $ExpectedHead --expected-api-origin $ExpectedApiOrigin --expected-version-code $ExpectedVersionCode 2>&1)
  if ($LASTEXITCODE -ne 0) { throw 'FOUNDER_ANDROID_LOCAL_PREFLIGHT_REFUSED' }
  try { $receipt = ($guardOutput -join "`n") | ConvertFrom-Json -ErrorAction Stop }
  catch { throw 'FOUNDER_ANDROID_LOCAL_PREFLIGHT_REFUSED' }
  if ($receipt.status -cne 'FOUNDER_ANDROID_INPUTS_VALIDATED_LOCAL_ONLY' -or $receipt.trackedSourceBindingVerified -ne $true) {
    throw 'FOUNDER_ANDROID_LOCAL_PREFLIGHT_REFUSED'
  }
}

function Invoke-FounderEas {
  param([Parameter(ValueFromRemainingArguments = $true)][string[]]$Arguments)

  # Recheck before every external CLI invocation, including immediately before
  # the build after authentication latency. This launcher never configures login.
  Assert-FounderBuildInputs
  $cliOutput = @(& npx --yes "eas-cli@$easCliVersion" @Arguments 2>&1)
  if ($LASTEXITCODE -ne 0) {
    throw 'FOUNDER_ANDROID_EAS_COMMAND_FAILED'
  }
  # No arbitrary EAS output or authenticated account name is echoed.
  $cliOutput = $null
}

Push-Location $mobileRoot
try {
  Invoke-FounderEas whoami
  Write-Host 'Verification locale avant build Android interne; aucune preuve de compatibilite distante.'
  Invoke-FounderEas build --platform android --profile founder-device --non-interactive --wait
  Write-Host 'Commande de build terminee. Validation du binaire et du backend encore requise.'
} catch {
  # A CLI failure can be an unknown remote outcome. Never automatically resubmit.
  Write-Output 'FOUNDER_ANDROID_BUILD_STOPPED_NO_AUTOMATIC_RETRY'
  exit 1
} finally {
  Pop-Location
}
