[CmdletBinding()]
param()

$ErrorActionPreference = "Stop"
$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..\..\..")).Path
$serverName = "endvera-r36v-full-integration-$PID"
$databaseName = "afterdesk_r36v_full_${PID}_integration"
$serverCreated = $false

function Assert-LastExitCode {
  param([Parameter(Mandatory = $true)][string]$Label)
  if ($LASTEXITCODE -ne 0) {
    throw "$Label failed with exit code $LASTEXITCODE."
  }
}

Push-Location $repoRoot
try {
  $devOutput = @(& npx prisma dev -n $serverName -d 2>&1)
  Assert-LastExitCode "Disposable PostgreSQL start"
  $serverCreated = $true
  $templateUrl = $devOutput |
    ForEach-Object { $_.ToString().Trim() } |
    Where-Object { $_ -match '^postgres://' } |
    Select-Object -Last 1
  if (-not $templateUrl) {
    throw "Disposable PostgreSQL did not report a TCP URL."
  }

  "CREATE DATABASE `"$databaseName`" TEMPLATE template0;" |
    & npx prisma db execute --stdin --url $templateUrl
  Assert-LastExitCode "Disposable integration database creation"

  $uri = [UriBuilder]$templateUrl
  $uri.Path = "/$databaseName"
  $uri.Query = "$($uri.Query.TrimStart('?'))&pgbouncer=true&connection_limit=10"
  $env:AFTERDESK_TEST_DATABASE_URL = $uri.Uri.AbsoluteUri
  $env:ALLOW_INTEGRATION_DB_RESET = "1"

  & npm run test:integration
  Assert-LastExitCode "Full serialized integration suite"
  Write-Output "R36V_FULL_INTEGRATION=PASS"
} finally {
  Remove-Item Env:AFTERDESK_TEST_DATABASE_URL -ErrorAction SilentlyContinue
  Remove-Item Env:ALLOW_INTEGRATION_DB_RESET -ErrorAction SilentlyContinue
  if ($serverCreated) {
    "i will lose local data" | & npx prisma dev rm --force $serverName
    if ($LASTEXITCODE -ne 0) {
      Write-Warning "Disposable PostgreSQL cleanup failed for $serverName."
    }
  }
  Pop-Location
}
