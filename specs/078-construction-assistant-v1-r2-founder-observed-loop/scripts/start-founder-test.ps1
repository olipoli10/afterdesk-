[CmdletBinding()]
param()

$ErrorActionPreference = 'Stop'
$root = (Resolve-Path (Join-Path $PSScriptRoot '..\..\..')).Path
$directUrl = 'postgres://postgres:postgres@localhost:51282/template1?sslmode=disable'
$env:DATABASE_URL = "$directUrl&pgbouncer=true&connection_limit=5"
$env:DIRECT_URL = $directUrl
$env:BETTER_AUTH_SECRET = 'endvera-r2-local-synthetic-secret-at-least-32-characters'
$env:BETTER_AUTH_URL = 'http://127.0.0.1:3000'
$env:NEXT_PUBLIC_APP_URL = 'http://127.0.0.1:3000'
$env:NODE_ENV = 'development'

Push-Location $root
try {
  $devList = npx.cmd prisma dev ls 2>&1 | Out-String
  if ($devList -notmatch 'endvera-construction-v1-r2\s+running') {
    npx.cmd prisma dev start endvera-construction-v1-r2 | Out-Host
  }
  npx.cmd prisma generate | Out-Host
  npx.cmd prisma migrate deploy | Out-Host
  npx.cmd tsx specs/078-construction-assistant-v1-r2-founder-observed-loop/scripts/prepare-founder-test.ts | Out-Host
  Write-Output 'PRODUCT_COMMAND=npm.cmd run dev -- --hostname 127.0.0.1 --port 3000'
  Write-Output 'OBSERVATION_COMMAND=npx.cmd tsx specs/078-construction-assistant-v1-r2-founder-observed-loop/scripts/founder-observation-server.ts'
  Write-Output 'PRODUCT_URL=http://127.0.0.1:3000/login'
  Write-Output 'OBSERVATION_URL=http://127.0.0.1:4178/'
} finally {
  Pop-Location
}
