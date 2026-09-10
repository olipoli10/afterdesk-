[CmdletBinding()]
param()
$ErrorActionPreference = 'Stop'
$taskRepo = (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path
$taskServer = 'endvera-personal-210-' + [Guid]::NewGuid().ToString('N')
$taskDatabase = 'endvera_personal_210_' + [Guid]::NewGuid().ToString('N')
$taskPrisma = Join-Path $taskRepo 'node_modules\.bin\prisma.cmd'
$taskVars = @('DATABASE_URL','DIRECT_URL','ENDVERA_210_DATABASE_NAME')
$taskPrior = @{}
foreach ($name in $taskVars) { $taskPrior[$name] = [Environment]::GetEnvironmentVariable($name, 'Process') }
$taskStarted = $false
$taskExit = 1
Push-Location $taskRepo
try {
  $taskStartOutput = @(& $taskPrisma dev -n $taskServer -d 2>&1)
  if ($LASTEXITCODE -ne 0) { throw 'PERSONAL_DB_START_FAILED' }
  $taskStarted = $true
  $taskStartText = ($taskStartOutput | Out-String) -replace '\x1B\[[0-9;]*[A-Za-z]', ''
  $taskUrl = [regex]::Matches($taskStartText, 'postgres(?:ql)?://[^\s"<>]+') | ForEach-Object { $_.Value } | Where-Object { ([Uri]$_).Host -in @('localhost','127.0.0.1') } | Select-Object -Last 1
  if (-not $taskUrl) { throw 'PERSONAL_DB_URL_MISSING' }
  $taskUri = [Uri]$taskUrl
  if ($taskUri.Host -notin @('localhost','127.0.0.1')) { throw 'PERSONAL_DB_NOT_LOCAL' }
  "CREATE DATABASE `"$taskDatabase`" TEMPLATE template0;" | & $taskPrisma db execute --stdin --url $taskUrl 2>&1 | Out-Null
  if ($LASTEXITCODE -ne 0) { throw 'PERSONAL_DB_CREATE_FAILED' }
  $taskBuilder = [UriBuilder]$taskUri
  $taskBuilder.Path = '/' + $taskDatabase
  $taskQuery = $taskBuilder.Query.TrimStart('?')
  $taskBuilder.Query = if ($taskQuery) { "$taskQuery&pgbouncer=true&connection_limit=5" } else { 'pgbouncer=true&connection_limit=5' }
  $env:DATABASE_URL = $taskBuilder.Uri.AbsoluteUri
  $env:DIRECT_URL = $taskBuilder.Uri.AbsoluteUri
  $env:ENDVERA_210_DATABASE_NAME = $taskDatabase
  & $taskPrisma migrate deploy 2>&1 | Out-Null
  if ($LASTEXITCODE -ne 0) { throw 'PERSONAL_DB_MIGRATION_FAILED' }
  & node node_modules/vitest/vitest.mjs run --config specs/210-personal-live-activation/vitest.postgres.config.ts
  $taskExit = $LASTEXITCODE
} catch {
  # Only fixed codes; provider/connection output is never printed.
  $taskFailure = $_.Exception.Message
  if ($taskFailure -match '^PERSONAL_DB_[A-Z_]+$') { Write-Output $taskFailure }
  else { Write-Output 'PERSONAL_POSTGRES_RUN_FAILED' }
  $taskExit = 1
} finally {
  if ($taskStarted) {
    # Only the fresh named disposable cluster belongs to this run.
    'i will lose local data' | & $taskPrisma dev rm --force $taskServer 2>&1 | Out-Null
    if ($LASTEXITCODE -ne 0) { Write-Output 'PERSONAL_DB_CLEANUP_FAILED'; $taskExit = 1 }
    else { Write-Output 'PERSONAL_DISPOSABLE_DB_REMOVED' }
  }
  foreach ($name in $taskVars) { [Environment]::SetEnvironmentVariable($name, $taskPrior[$name], 'Process') }
  Pop-Location
}
exit $taskExit
