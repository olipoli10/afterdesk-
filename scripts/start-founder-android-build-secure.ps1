[CmdletBinding()]
param()

$ErrorActionPreference = "Stop"
$easCliVersion = "23.2.0"
$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$mobileRoot = Join-Path $repoRoot "apps\mobile"
$tokenPointer = [IntPtr]::Zero
$plainToken = $null

function Invoke-Eas {
  param([Parameter(ValueFromRemainingArguments = $true)][string[]]$Arguments)

  & npx --yes "eas-cli@$easCliVersion" @Arguments
  if ($LASTEXITCODE -ne 0) {
    throw "FOUNDER_ANDROID_EAS_COMMAND_FAILED:$($Arguments -join '-'):$LASTEXITCODE"
  }
}

try {
  $initialStatus = @(& git -C $repoRoot status --porcelain=v1)
  if ($LASTEXITCODE -ne 0 -or $initialStatus.Count -ne 0) {
    throw "FOUNDER_ANDROID_BUILD_REQUIRES_CLEAN_GIT"
  }

  $secureToken = Read-Host "Colle ton jeton Expo (masque, jamais affiche ni committe)" -AsSecureString
  if ($secureToken.Length -lt 20) {
    throw "FOUNDER_ANDROID_EXPO_TOKEN_INVALID"
  }

  $tokenPointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secureToken)
  $plainToken = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($tokenPointer)
  if ([string]::IsNullOrWhiteSpace($plainToken)) {
    throw "FOUNDER_ANDROID_EXPO_TOKEN_INVALID"
  }

  $env:EXPO_TOKEN = $plainToken
  $plainToken = $null

  Push-Location $mobileRoot
  try {
    $identityOutput = @(& npx --yes "eas-cli@$easCliVersion" whoami 2>&1)
    if ($LASTEXITCODE -ne 0) {
      throw "FOUNDER_ANDROID_EXPO_AUTH_REFUSED"
    }
    $account = [string]($identityOutput | Where-Object { -not [string]::IsNullOrWhiteSpace([string]$_) } | Select-Object -Last 1)
    if ([string]::IsNullOrWhiteSpace($account)) {
      throw "FOUNDER_ANDROID_EXPO_ACCOUNT_UNRESOLVED"
    }
    Write-Host "Compte Expo authentifie: $account"

    Invoke-Eas project:init --account $account --non-interactive
  } finally {
    Pop-Location
  }

  $postInitStatus = @(& git -C $repoRoot status --porcelain=v1)
  if ($LASTEXITCODE -ne 0) {
    throw "FOUNDER_ANDROID_GIT_STATUS_FAILED"
  }
  $unexpected = @($postInitStatus | Where-Object { $_ -notmatch '^\s*M\s+apps/mobile/app\.json$' })
  if ($unexpected.Count -gt 0) {
    throw "FOUNDER_ANDROID_PROJECT_INIT_UNEXPECTED_MUTATION:$($unexpected -join ',')"
  }
  if ($postInitStatus.Count -gt 0) {
    & git -C $repoRoot add -- apps/mobile/app.json
    if ($LASTEXITCODE -ne 0) { throw "FOUNDER_ANDROID_PROJECT_ID_STAGE_FAILED" }
    & git -C $repoRoot diff --cached --check
    if ($LASTEXITCODE -ne 0) { throw "FOUNDER_ANDROID_PROJECT_ID_DIFF_INVALID" }
    & git -C $repoRoot commit -m "chore: link founder Android EAS project"
    if ($LASTEXITCODE -ne 0) { throw "FOUNDER_ANDROID_PROJECT_ID_COMMIT_FAILED" }
  }

  Push-Location $mobileRoot
  try {
    Write-Host "Demarrage du build Android interne signe. Aucun store ne sera contacte."
    Invoke-Eas build --platform android --profile founder-device --wait
  } finally {
    Pop-Location
  }
} finally {
  Remove-Item Env:EXPO_TOKEN -ErrorAction SilentlyContinue
  $plainToken = $null
  if ($tokenPointer -ne [IntPtr]::Zero) {
    [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($tokenPointer)
  }
  Remove-Variable secureToken,tokenPointer,plainToken -ErrorAction SilentlyContinue
}
