[CmdletBinding()]
param()

$ErrorActionPreference = "Stop"
$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..\..\..")).Path
$serverName = "endvera-r36y-validation-$PID"
$databaseName = "afterdesk_r36y_${PID}_integration"
$serverCreated = $false

function Assert-LastExitCode {
  param([Parameter(Mandatory = $true)][string]$Label)
  if ($LASTEXITCODE -ne 0) { throw "$Label failed with exit code $LASTEXITCODE." }
}

Push-Location $repoRoot
try {
  & npx vitest run `
    test/construction-operating-assistant-r36y-assistant-memory-contracts.test.ts `
    test/construction-operating-assistant-r36y-assistant-memory-api.test.ts `
    test/construction-operating-assistant-r36y-assistant-memory-server.test.ts `
    test/construction-operating-assistant-r36y-assistant-memory-mutation-guards.test.ts `
    test/construction-operating-assistant-r36x-understanding-contracts.test.ts `
    test/construction-operating-assistant-r36x-understanding-api.test.ts `
    test/construction-operating-assistant-r36x-understanding-server.test.ts
  Assert-LastExitCode "R36Y and R36X contracts"

  & npm --prefix apps/mobile test -- --run project-brain-assistant-memory.test.ts
  Assert-LastExitCode "R36Y mobile contracts"

  & pwsh -NoProfile -File specs/190-project-brain-assistant-memory/scripts/validate-r36y-mutations.ps1
  Assert-LastExitCode "R36Y mutation validation"

  $env:DATABASE_URL = "postgres://postgres:postgres@127.0.0.1:1/afterdesk_r36y_validation"
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
    test/integration/construction-operating-assistant-r36y-assistant-memory.itest.ts
  Assert-LastExitCode "R36Y disposable PostgreSQL integration"

  Write-Output "R36Y_RELEASE_VALIDATION=PASS"
} finally {
  Remove-Item Env:AFTERDESK_TEST_DATABASE_URL -ErrorAction SilentlyContinue
  Remove-Item Env:ALLOW_INTEGRATION_DB_RESET -ErrorAction SilentlyContinue
  if ($serverCreated) {
    "i will lose local data" | & npx prisma dev rm --force $serverName
    if ($LASTEXITCODE -ne 0) { Write-Warning "Disposable PostgreSQL cleanup failed for $serverName." }
  }
  Pop-Location
}
