[CmdletBinding()]
param()

$ErrorActionPreference = "Stop"
$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..\..\..")).Path
$serverName = "endvera-r36w-validation-$PID"
$databaseName = "afterdesk_r36w_${PID}_integration"
$serverCreated = $false

function Assert-LastExitCode {
  param([Parameter(Mandatory = $true)][string]$Label)
  if ($LASTEXITCODE -ne 0) { throw "$Label failed with exit code $LASTEXITCODE." }
}

Push-Location $repoRoot
try {
  & npx vitest run `
    test/construction-operating-assistant-r36w-fact-candidates-contracts.test.ts `
    test/construction-operating-assistant-r36w-fact-candidates-api.test.ts `
    test/construction-operating-assistant-r36w-fact-candidates-server.test.ts `
    test/construction-operating-assistant-r36w-fact-candidates-mutation-guards.test.ts `
    test/construction-operating-assistant-r36v-project-brain-contracts.test.ts `
    test/construction-operating-assistant-r36v-project-brain-api.test.ts `
    test/construction-operating-assistant-r36v-project-brain-server-hardening.test.ts
  Assert-LastExitCode "R36W and R36V contracts"

  $env:DATABASE_URL = "postgres://postgres:postgres@127.0.0.1:1/afterdesk_r36w_validation"
  $env:DIRECT_URL = $env:DATABASE_URL
  try {
    & npx prisma validate
    Assert-LastExitCode "Prisma validation"
  } finally {
    Remove-Item Env:DATABASE_URL -ErrorAction SilentlyContinue
    Remove-Item Env:DIRECT_URL -ErrorAction SilentlyContinue
  }

  & npm run validate:provider-boundary
  Assert-LastExitCode "Provider boundary validation"

  $devOutput = @(& npx prisma dev -n $serverName -d 2>&1)
  Assert-LastExitCode "Disposable PostgreSQL start"
  $serverCreated = $true
  $templateUrl = $devOutput |
    ForEach-Object { $_.ToString().Trim() } |
    Where-Object { $_ -match '^postgres://' } |
    Select-Object -Last 1
  if (-not $templateUrl) { throw "Disposable PostgreSQL did not report a TCP URL." }

  "CREATE DATABASE `"$databaseName`" TEMPLATE template0;" |
    & npx prisma db execute --stdin --url $templateUrl
  Assert-LastExitCode "Disposable integration database creation"

  $uri = [UriBuilder]$templateUrl
  $uri.Path = "/$databaseName"
  $uri.Query = "$($uri.Query.TrimStart('?'))&pgbouncer=true&connection_limit=10"
  $env:AFTERDESK_TEST_DATABASE_URL = $uri.Uri.AbsoluteUri
  $env:ALLOW_INTEGRATION_DB_RESET = "1"
  & npm run test:integration -- `
    test/integration/construction-operating-assistant-r36w-fact-candidates.itest.ts
  Assert-LastExitCode "R36W disposable PostgreSQL integration"

  Write-Output "R36W_RELEASE_VALIDATION=PASS"
} finally {
  Remove-Item Env:AFTERDESK_TEST_DATABASE_URL -ErrorAction SilentlyContinue
  Remove-Item Env:ALLOW_INTEGRATION_DB_RESET -ErrorAction SilentlyContinue
  if ($serverCreated) {
    "i will lose local data" | & npx prisma dev rm --force $serverName
    if ($LASTEXITCODE -ne 0) { Write-Warning "Disposable PostgreSQL cleanup failed for $serverName." }
  }
  Pop-Location
}
