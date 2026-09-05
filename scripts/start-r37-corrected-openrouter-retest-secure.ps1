[CmdletBinding()]
param()

$ErrorActionPreference = "Stop"
$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$validator = Join-Path $repoRoot "specs\194-corrected-openrouter-retest\scripts\validate-r37-corrected-retest.ps1"
$keyPointer = [IntPtr]::Zero
$plainKey = $null

try {
  $secureKey = Read-Host "Colle la NOUVELLE cle OpenRouter (entree masquee)" -AsSecureString
  if ($secureKey.Length -lt 20) { throw "R37_CREDENTIAL_INPUT_INVALID" }
  $keyPointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secureKey)
  $plainKey = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($keyPointer)
  if ([string]::IsNullOrWhiteSpace($plainKey)) { throw "R37_CREDENTIAL_INPUT_INVALID" }
  $env:R37_OPENROUTER_CONTROLLER_API_KEY = $plainKey
  $plainKey = $null
  Push-Location $repoRoot
  try { & $validator -RequireComplete } finally { Pop-Location }
} finally {
  Remove-Item Env:R37_OPENROUTER_CONTROLLER_API_KEY -ErrorAction SilentlyContinue
  $plainKey = $null
  if ($keyPointer -ne [IntPtr]::Zero) { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($keyPointer) }
  Remove-Variable secureKey,keyPointer,plainKey -ErrorAction SilentlyContinue
}
