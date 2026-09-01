[CmdletBinding()]
param()

$ErrorActionPreference = 'Stop'
$root = (Resolve-Path (Join-Path $PSScriptRoot '..\..\..')).Path
$directUrl = 'postgres://postgres:postgres@localhost:51290/template1?sslmode=disable'
$env:DATABASE_URL = "$directUrl&pgbouncer=true&connection_limit=5"
$env:DIRECT_URL = $directUrl
$env:BETTER_AUTH_SECRET = 'endvera-r3-local-synthetic-secret-at-least-32-characters'
$env:BETTER_AUTH_URL = 'http://localhost:3000'
$env:NEXT_PUBLIC_APP_URL = 'http://localhost:3000'
$env:ENDVERA_R3_FOUNDER_RETEST = 'ENABLED'
$env:ENDVERA_R3_DISPOSABLE_DB_NAME = 'endvera-construction-v1-r3'
$env:NODE_ENV = 'development'

Push-Location $root
try {
  $devList = npm.cmd exec prisma dev ls 2>&1 | Out-String
  if ($devList -notmatch 'endvera-construction-v1-r3\s+running') {
    throw 'R3_NAMED_DISPOSABLE_DATABASE_NOT_RUNNING'
  }
  npm.cmd exec prisma generate | Out-Host
  npm.cmd exec prisma migrate deploy | Out-Host
  npm.cmd exec tsx specs/079-construction-assistant-v1-r3-corrected-founder-retest/scripts/prepare-founder-test.ts | Out-Host
  Write-Output 'PRODUCT_COMMAND=npm.cmd run dev -- --hostname localhost --port 3000'
  Write-Output 'PRODUCT_URL=http://localhost:3000/client/construction-retest'
  Write-Output 'SYNTHETIC_EMAIL=olivier.r3@example.invalid'
  Write-Output 'SYNTHETIC_PASSWORD=Endvera-R3-Local-Only-2026!'
} finally {
  Pop-Location
}
