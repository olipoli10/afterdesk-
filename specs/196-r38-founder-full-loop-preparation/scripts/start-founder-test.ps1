[CmdletBinding()]
param()

$ErrorActionPreference = 'Stop'
$root = (Resolve-Path (Join-Path $PSScriptRoot '..\..\..')).Path
$databaseName = 'endvera-construction-operating-assistant-r38'
$appPort = 3038
$tokenBytes = New-Object byte[] 32
$random = [System.Security.Cryptography.RandomNumberGenerator]::Create()
$random.GetBytes($tokenBytes)
$random.Dispose()
$accessToken = -join ($tokenBytes | ForEach-Object { $_.ToString('x2') })
$sha256 = [System.Security.Cryptography.SHA256]::Create()
$tokenHashBytes = $sha256.ComputeHash([System.Text.Encoding]::UTF8.GetBytes($accessToken))
$sha256.Dispose()
$tokenHash = -join ($tokenHashBytes | ForEach-Object { $_.ToString('x2') })
$expiresAt = [DateTime]::UtcNow.AddHours(6).ToString('yyyy-MM-ddTHH:mm:ss.fffZ')
$logRoot = Join-Path $root 'storage\founder-tests\coa-r38'
$stdoutLog = Join-Path $logRoot 'next.stdout.log'
$stderrLog = Join-Path $logRoot 'next.stderr.log'

function Invoke-R38Native {
  param(
    [Parameter(Mandatory = $true)][scriptblock]$Command,
    [Parameter(Mandatory = $true)][string]$Label,
    [switch]$Capture
  )
  $previousPreference = $ErrorActionPreference
  $ErrorActionPreference = 'Continue'
  try {
    $output = (& $Command 2>&1 | Out-String)
    $nativeExit = $LASTEXITCODE
  } finally {
    $ErrorActionPreference = $previousPreference
  }
  if ($nativeExit -ne 0) { throw "R38_COMMAND_FAILED:${Label}:$nativeExit" }
  if ($Capture) { return $output }
  if ($output) { Write-Output $output.TrimEnd() }
}

Push-Location $root
try {
  New-Item -ItemType Directory -Force -Path $logRoot | Out-Null
  $serverStatePath = Join-Path $env:LOCALAPPDATA "prisma-dev-nodejs\Data\$databaseName\server.json"
  if (-not (Test-Path -LiteralPath $serverStatePath)) {
    Invoke-R38Native -Label 'prisma-dev-create' -Command { .\node_modules\.bin\prisma.cmd dev --name $databaseName --detach }
  } else {
    $knownState = Get-Content -Raw -LiteralPath $serverStatePath | ConvertFrom-Json
    $knownProcess = Get-Process -Id ([int]$knownState.pid) -ErrorAction SilentlyContinue
    if (-not $knownProcess) {
      Invoke-R38Native -Label 'prisma-dev-start' -Command { .\node_modules\.bin\prisma.cmd dev start $databaseName }
    }
  }
  if (-not (Test-Path -LiteralPath $serverStatePath)) { throw 'R38_PRISMA_SERVER_STATE_MISSING' }
  $serverState = Get-Content -Raw -LiteralPath $serverStatePath | ConvertFrom-Json
  $databasePort = [int]$serverState.databasePort
  $directUrl = "postgres://postgres:postgres@127.0.0.1:$databasePort/template1?sslmode=disable"

  $env:DATABASE_URL = "$directUrl&pgbouncer=true&connection_limit=5"
  $env:DIRECT_URL = $directUrl
  $env:BETTER_AUTH_SECRET = 'endvera-r38-local-synthetic-secret-at-least-32-characters'
  $env:BETTER_AUTH_URL = "http://127.0.0.1:$appPort"
  $env:NEXT_PUBLIC_APP_URL = "http://127.0.0.1:$appPort"
  $env:ENDVERA_R38_FOUNDER_TEST_MODE = 'ENABLED'
  $env:ENDVERA_R38_DISPOSABLE_DB_NAME = $databaseName
  $env:ENDVERA_R38_FOUNDER_TOKEN_SHA256 = $tokenHash
  $env:ENDVERA_R38_FOUNDER_TOKEN_EXPIRES_AT = $expiresAt
  $env:ENDVERA_R38_HUMAN_OBSERVATION = 'OLIVIER_PRESENT'
  $env:NODE_ENV = 'development'

  if (-not (Test-Path -LiteralPath (Join-Path $root '.prisma-client\index.js'))) {
    throw 'R38_PRISMA_CLIENT_MISSING_RUN_NPM_INSTALL'
  }
  Invoke-R38Native -Label 'prisma-migrate-deploy' -Command { .\node_modules\.bin\prisma.cmd migrate deploy }
  Invoke-R38Native -Label 'prepare-founder-test' -Command { .\node_modules\.bin\tsx.cmd --require ./scripts/register-server-only.cjs specs/196-r38-founder-full-loop-preparation/scripts/prepare-founder-test.ts }

  $existing = Get-CimInstance Win32_Process -Filter "Name = 'node.exe'" | Where-Object { $_.CommandLine -like "*next*dev*--port*$appPort*" }
  if (-not $existing) {
    Start-Process -FilePath 'npm.cmd' -ArgumentList @('run', 'dev', '--', '--webpack', '--hostname', '127.0.0.1', '--port', "$appPort") -WorkingDirectory $root -RedirectStandardOutput $stdoutLog -RedirectStandardError $stderrLog -WindowStyle Hidden | Out-Null
  }

  $ready = $false
  for ($attempt = 0; $attempt -lt 60; $attempt++) {
    try {
      $response = Invoke-WebRequest -UseBasicParsing -Uri "http://127.0.0.1:$appPort/" -TimeoutSec 2
      if ($response.StatusCode -ge 200 -and $response.StatusCode -lt 500) { $ready = $true; break }
    } catch {
      Start-Sleep -Milliseconds 1000
    }
  }
  if (-not $ready) { throw "R38_LOCAL_SERVER_NOT_READY: see $stderrLog" }

  Write-Output 'R38_FOUNDER_FULL_LOOP_PREFLIGHT_READY'
  Write-Output "ACCESS_URL=http://127.0.0.1:$appPort/client/founder-full-loop/access?token=$accessToken"
  Write-Output "SERVER_STDOUT=$stdoutLog"
  Write-Output "SERVER_STDERR=$stderrLog"
} finally {
  Pop-Location
}
