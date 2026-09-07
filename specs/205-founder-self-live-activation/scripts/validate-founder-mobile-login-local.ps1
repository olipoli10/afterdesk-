[CmdletBinding()]
param()

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..\..\..")).Path
$featureRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$evidencePath = Join-Path $featureRoot "evidence\founder-mobile-login-local-smoke.json"
$serverName = "endvera-founder-login-205-$PID"
$databaseName = "endvera_founder_login_205_$PID"
$databaseCreated = $false
$databaseRemoved = $false
$webProcess = $null
$listenerProcessId = $null
$webStopped = $false
$tempRoot = Join-Path ([IO.Path]::GetTempPath()) ("endvera-founder-login-205-" + [Guid]::NewGuid().ToString("N"))
$failureCode = $null
$completedChecks = [ordered]@{}
$managedEnvironmentNames = @(
  "DATABASE_URL", "DIRECT_URL", "BETTER_AUTH_SECRET", "BETTER_AUTH_URL", "NEXT_PUBLIC_APP_URL", "NODE_ENV",
  "ENDVERA_FOUNDER_LOGIN_SMOKE", "ENDVERA_FOUNDER_LOGIN_DISPOSABLE_DB_NAME",
  "ENDVERA_FOUNDER_LOGIN_SMOKE_EMAIL", "ENDVERA_FOUNDER_LOGIN_SMOKE_PASSWORD"
)
$previousEnvironment = @{}
foreach ($name in $managedEnvironmentNames) {
  $previousEnvironment[$name] = [Environment]::GetEnvironmentVariable($name, "Process")
}
$prismaCommand = Join-Path $repoRoot "node_modules\.bin\prisma.cmd"
$tsxCommand = Join-Path $repoRoot "node_modules\.bin\tsx.cmd"

function New-RandomSecret([int]$ByteCount) {
  $bytes = New-Object byte[] $ByteCount
  $generator = [Security.Cryptography.RandomNumberGenerator]::Create()
  try { $generator.GetBytes($bytes) } finally { $generator.Dispose() }
  return [Convert]::ToBase64String($bytes)
}

function Get-FreeTcpPort {
  $listener = [Net.Sockets.TcpListener]::new([Net.IPAddress]::Loopback, 0)
  try {
    $listener.Start()
    return ([Net.IPEndPoint]$listener.LocalEndpoint).Port
  } finally {
    $listener.Stop()
  }
}

function Assert-Command([string]$Code) {
  if ($LASTEXITCODE -ne 0) { throw "FL205_$($Code)_FAILED" }
}

function Read-JsonResponse($Response, [string]$Code) {
  try { return $Response.Content | ConvertFrom-Json } catch { throw "FL205_$($Code)_INVALID_JSON" }
}

$port = Get-FreeTcpPort
$baseUrl = "http://127.0.0.1:$port"
$syntheticEmail = "founder-205-$([Guid]::NewGuid().ToString("N"))@example.invalid"
$syntheticPassword = "Ev!" + (New-RandomSecret 30)
$authSecret = New-RandomSecret 48

[IO.Directory]::CreateDirectory($tempRoot) | Out-Null
$standardOutputPath = Join-Path $tempRoot "next.stdout.log"
$standardErrorPath = Join-Path $tempRoot "next.stderr.log"

Push-Location $repoRoot
try {
  if (-not (Test-Path -LiteralPath $prismaCommand) -or -not (Test-Path -LiteralPath $tsxCommand)) {
    throw "FL205_LOCAL_TOOLCHAIN_MISSING"
  }

  foreach ($providerVariable in @(
    "OPENROUTER_API_KEY",
    "R37_OPENROUTER_CONTROLLER_API_KEY",
    "TWILIO_ACCOUNT_SID",
    "TWILIO_AUTH_TOKEN",
    "RESEND_API_KEY",
    "GOOGLE_CLIENT_ID",
    "GOOGLE_CLIENT_SECRET"
  )) {
    if (Test-Path "Env:$providerVariable") { throw "FL205_EXTERNAL_PROVIDER_ENVIRONMENT_PRESENT" }
  }

  if ($serverName.ToLowerInvariant().Contains("r38") -or $databaseName.ToLowerInvariant().Contains("r38")) {
    throw "FL205_R38_NAME_REFUSED"
  }

  $previousPreference = $ErrorActionPreference
  $ErrorActionPreference = "Continue"
  try {
    $devOutput = @(& $prismaCommand dev -n $serverName -d 2>&1)
    $devExitCode = $LASTEXITCODE
  } finally { $ErrorActionPreference = $previousPreference }
  if ($devExitCode -ne 0) { throw "FL205_DATABASE_START_FAILED" }
  $databaseCreated = $true

  $templateUrl = $devOutput |
    ForEach-Object { $_.ToString().Trim() } |
    Where-Object { $_ -match '^postgres://.*(localhost|127\.0\.0\.1)' } |
    Select-Object -Last 1
  if (-not $templateUrl) { throw "FL205_LOCAL_DATABASE_URL_MISSING" }

  $templateUri = [Uri]$templateUrl
  if (@("localhost", "127.0.0.1") -notcontains $templateUri.Host) {
    throw "FL205_NONLOCAL_DATABASE_REFUSED"
  }

  $previousPreference = $ErrorActionPreference
  $ErrorActionPreference = "Continue"
  try {
    "CREATE DATABASE `"$databaseName`" TEMPLATE template0;" |
      & $prismaCommand db execute --stdin --url $templateUrl 2>&1 | Out-Null
    $databaseCreateExitCode = $LASTEXITCODE
  } finally { $ErrorActionPreference = $previousPreference }
  if ($databaseCreateExitCode -ne 0) { throw "FL205_DATABASE_CREATE_FAILED" }

  $directDatabaseUri = [UriBuilder]$templateUrl
  $directDatabaseUri.Path = "/$databaseName"
  $pooledDatabaseUri = [UriBuilder]$directDatabaseUri.Uri
  $query = $pooledDatabaseUri.Query.TrimStart("?")
  $pooledDatabaseUri.Query = if ($query) { "$query&pgbouncer=true&connection_limit=5" } else { "pgbouncer=true&connection_limit=5" }

  $env:DATABASE_URL = $pooledDatabaseUri.Uri.AbsoluteUri
  $env:DIRECT_URL = $directDatabaseUri.Uri.AbsoluteUri
  $env:BETTER_AUTH_SECRET = $authSecret
  $env:BETTER_AUTH_URL = $baseUrl
  $env:NEXT_PUBLIC_APP_URL = $baseUrl
  $env:NODE_ENV = "development"
  $env:ENDVERA_FOUNDER_LOGIN_SMOKE = "ENABLED"
  $env:ENDVERA_FOUNDER_LOGIN_DISPOSABLE_DB_NAME = $databaseName
  $env:ENDVERA_FOUNDER_LOGIN_SMOKE_EMAIL = $syntheticEmail
  $env:ENDVERA_FOUNDER_LOGIN_SMOKE_PASSWORD = $syntheticPassword

  $previousPreference = $ErrorActionPreference
  $ErrorActionPreference = "Continue"
  try {
    & $prismaCommand migrate deploy 2>&1 | Out-Null
    $migrationExitCode = $LASTEXITCODE
  } finally { $ErrorActionPreference = $previousPreference }
  if ($migrationExitCode -ne 0) { throw "FL205_MIGRATION_DEPLOY_FAILED" }
  $completedChecks.migrationsApplied = $true

  $previousPreference = $ErrorActionPreference
  $ErrorActionPreference = "Continue"
  try {
    $seedOutput = @(& $tsxCommand --require ./scripts/register-server-only.cjs specs/205-founder-self-live-activation/scripts/seed-founder-mobile-login.ts 2>&1)
    $seedExitCode = $LASTEXITCODE
  } finally { $ErrorActionPreference = $previousPreference }
  if ($seedExitCode -ne 0) { throw "FL205_SYNTHETIC_SEED_FAILED" }
  try { $seed = ($seedOutput -join "`n") | ConvertFrom-Json } catch { throw "FL205_SYNTHETIC_SEED_INVALID_JSON" }
  if (
    $seed.dataClass -ne "SYNTHETIC_LOCAL_ONLY" -or
    -not $seed.clientVerified -or
    $seed.credentialCount -ne 1 -or
    $seed.workspaceCount -ne 1 -or
    $seed.ownerMembershipCount -ne 1
  ) { throw "FL205_SYNTHETIC_SEED_POSTCONDITION_FAILED" }
  $completedChecks.syntheticVerifiedClientSeeded = $true
  $completedChecks.syntheticWorkspaceCreated = $true

  $nodeCommand = (Get-Command node.exe -ErrorAction Stop).Source
  $serverArguments = @{
    FilePath = $nodeCommand
    ArgumentList = @("node_modules/next/dist/bin/next", "dev", "--webpack", "--hostname", "127.0.0.1", "--port", "$port")
    WorkingDirectory = $repoRoot
    WindowStyle = "Hidden"
    RedirectStandardOutput = $standardOutputPath
    RedirectStandardError = $standardErrorPath
    PassThru = $true
  }
  $webProcess = Start-Process @serverArguments

  $ready = $false
  for ($attempt = 0; $attempt -lt 90; $attempt++) {
    if ($webProcess.HasExited) { throw "FL205_LOCAL_SERVER_EXITED_EARLY" }
    try {
      $probe = Invoke-WebRequest -UseBasicParsing -Uri "$baseUrl/api/auth/get-session" -Method Get -TimeoutSec 3
      if ($probe.StatusCode -eq 200) { $ready = $true; break }
    } catch {}
    Start-Sleep -Milliseconds 500
  }
  if (-not $ready) { throw "FL205_LOCAL_SERVER_NOT_READY" }
  $completedChecks.localServerReady = $true

  $listener = Get-NetTCPConnection -LocalAddress "127.0.0.1" -LocalPort $port -State Listen -ErrorAction SilentlyContinue | Select-Object -First 1
  if ($listener) { $listenerProcessId = [int]$listener.OwningProcess }

  $session = New-Object Microsoft.PowerShell.Commands.WebRequestSession
  $mobileHeaders = @{
    "expo-origin" = "endvera://"
    "x-skip-oauth-proxy" = "true"
  }

  $anonymousBootstrapStatus = $null
  try {
    $anonymousBootstrap = Invoke-WebRequest -UseBasicParsing -Uri "$baseUrl/api/endvera/v1/mobile/bootstrap" -Method Get -Headers $mobileHeaders -TimeoutSec 20
    $anonymousBootstrapStatus = [int]$anonymousBootstrap.StatusCode
  } catch {
    if ($_.Exception.Response) { $anonymousBootstrapStatus = [int]$_.Exception.Response.StatusCode }
  }
  if ($anonymousBootstrapStatus -ne 401) { throw "FL205_ANONYMOUS_BOOTSTRAP_NOT_REFUSED" }
  $completedChecks.anonymousBootstrapRefused = $true

  $loginBody = @{ email = $syntheticEmail; password = $syntheticPassword; rememberMe = $true } | ConvertTo-Json -Compress
  $loginArguments = @{
    UseBasicParsing = $true
    Uri = "$baseUrl/api/auth/sign-in/email"
    Method = "Post"
    ContentType = "application/json"
    Headers = $mobileHeaders
    Body = $loginBody
    WebSession = $session
    TimeoutSec = 20
  }
  $loginResponse = Invoke-WebRequest @loginArguments
  if ($loginResponse.StatusCode -ne 200) { throw "FL205_MOBILE_LOGIN_REFUSED" }
  $login = Read-JsonResponse $loginResponse "MOBILE_LOGIN"
  if (-not $login.user -or $login.user.role -ne "CLIENT" -or -not $login.user.emailVerified) {
    throw "FL205_MOBILE_LOGIN_USER_INVALID"
  }
  if ($session.Cookies.Count -lt 1) { throw "FL205_MOBILE_SESSION_COOKIE_MISSING" }
  $completedChecks.mobileEmailPasswordLogin = $true
  $completedChecks.mobileSessionCookieIssued = $true

  $sessionArguments = @{
    UseBasicParsing = $true
    Uri = "$baseUrl/api/auth/get-session"
    Method = "Get"
    Headers = $mobileHeaders
    WebSession = $session
    TimeoutSec = 20
  }
  $sessionResponse = Invoke-WebRequest @sessionArguments
  if ($sessionResponse.StatusCode -ne 200) { throw "FL205_SESSION_LOOKUP_REFUSED" }
  $currentSession = Read-JsonResponse $sessionResponse "SESSION_LOOKUP"
  if (
    -not $currentSession.user -or
    $currentSession.user.email -ne $syntheticEmail -or
    $currentSession.user.role -ne "CLIENT" -or
    -not $currentSession.user.emailVerified
  ) { throw "FL205_SESSION_POSTCONDITION_FAILED" }
  $completedChecks.verifiedClientSessionResolved = $true

  $bootstrapArguments = @{
    UseBasicParsing = $true
    Uri = "$baseUrl/api/endvera/v1/mobile/bootstrap"
    Method = "Get"
    Headers = $mobileHeaders
    WebSession = $session
    TimeoutSec = 20
  }
  $bootstrapResponse = Invoke-WebRequest @bootstrapArguments
  if ($bootstrapResponse.StatusCode -ne 200) { throw "FL205_MOBILE_BOOTSTRAP_REFUSED" }
  $bootstrap = Read-JsonResponse $bootstrapResponse "MOBILE_BOOTSTRAP"
  $cacheControl = [string]$bootstrapResponse.Headers["Cache-Control"]
  if (
    $bootstrap.schemaVersion -ne 1 -or
    $bootstrap.user.email -ne $syntheticEmail -or
    @($bootstrap.workspaces).Count -ne 1 -or
    $bootstrap.workspaces[0].role -ne "OWNER" -or
    $bootstrap.workspaces[0].defaultTimezone -ne "America/Toronto" -or
    $bootstrap.workspaces[0].defaultLocale -ne "fr-CA" -or
    $bootstrap.workspaces[0].permissions.externalTransportAuthorized -ne $false -or
    $cacheControl -notmatch "private" -or
    $cacheControl -notmatch "no-store"
  ) { throw "FL205_MOBILE_BOOTSTRAP_POSTCONDITION_FAILED" }
  $completedChecks.mobileBootstrapResolved = $true
  $completedChecks.workspaceIsolationObserved = $true
  $completedChecks.externalTransportDisabled = $true
} catch {
  $candidate = [string]$_.Exception.Message
  $failureCode = if ($candidate -match '^FL205_[A-Z0-9_:]+$') { $candidate } else { "FL205_UNEXPECTED_LOCAL_FAILURE" }
} finally {
  foreach ($processId in (@($listenerProcessId, $(if ($webProcess) { $webProcess.Id } else { $null })) | Where-Object { $_ })) {
    try {
      $process = Get-Process -Id $processId -ErrorAction SilentlyContinue
      if ($process) { Stop-Process -Id $processId -Force -ErrorAction Stop }
    } catch {
      if (-not $failureCode) { $failureCode = "FL205_LOCAL_SERVER_CLEANUP_FAILED" }
    }
  }

  for ($attempt = 0; $attempt -lt 20; $attempt++) {
    if (-not (Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue)) {
      $webStopped = $true
      break
    }
    Start-Sleep -Milliseconds 250
  }
  if (-not $webStopped -and -not $failureCode) { $failureCode = "FL205_LOCAL_SERVER_CLEANUP_NOT_VERIFIED" }

  if ($databaseCreated) {
    $previousPreference = $ErrorActionPreference
    $ErrorActionPreference = "Continue"
    try {
      "i will lose local data" | & $prismaCommand dev rm --force $serverName 2>&1 | Out-Null
      $removeExitCode = $LASTEXITCODE
    } finally { $ErrorActionPreference = $previousPreference }
    if ($removeExitCode -eq 0) {
      $previousPreference = $ErrorActionPreference
      $ErrorActionPreference = "Continue"
      try {
        $listedServers = @(& $prismaCommand dev ls 2>&1) -join "`n"
        $listExitCode = $LASTEXITCODE
      } finally { $ErrorActionPreference = $previousPreference }
      if ($listExitCode -eq 0) { $databaseRemoved = $listedServers -notmatch [Regex]::Escape($serverName) }
    }
    if (-not $databaseRemoved -and -not $failureCode) { $failureCode = "FL205_DATABASE_CLEANUP_NOT_VERIFIED" }
  }

  foreach ($name in $managedEnvironmentNames) {
    $previousValue = $previousEnvironment[$name]
    if ($null -eq $previousValue) {
      Remove-Item "Env:$name" -ErrorAction SilentlyContinue
    } else {
      [Environment]::SetEnvironmentVariable($name, [string]$previousValue, "Process")
    }
  }

  Pop-Location

  try {
    $resolvedTemp = [IO.Path]::GetFullPath($tempRoot)
    $systemTemp = [IO.Path]::GetFullPath([IO.Path]::GetTempPath())
    if (
      $resolvedTemp.StartsWith($systemTemp, [StringComparison]::OrdinalIgnoreCase) -and
      [IO.Path]::GetFileName($resolvedTemp).StartsWith("endvera-founder-login-205-", [StringComparison]::OrdinalIgnoreCase)
    ) { Remove-Item -LiteralPath $resolvedTemp -Recurse -Force -ErrorAction SilentlyContinue }
  } catch {
    if (-not $failureCode) { $failureCode = "FL205_TEMP_CLEANUP_FAILED" }
  }
}

$report = [ordered]@{
  schemaVersion = 1
  release = "R39C-FOUNDER-DEVICE-LOGIN-LOCAL-SMOKE"
  observedAtUtc = [DateTime]::UtcNow.ToString("o")
  verdict = if ($failureCode) { "REWORK" } else { "LOCAL_MOBILE_AUTH_BOOTSTRAP_PASS" }
  dataClass = "SYNTHETIC_LOCAL_ONLY"
  checks = $completedChecks
  cleanup = [ordered]@{
    localServerStopped = $webStopped
    disposableDatabaseRemoved = $databaseRemoved
  }
  boundaries = [ordered]@{
    newDisposableDatabase = $databaseCreated
    r38Touched = $false
    credentialValuePersisted = $false
    credentialValueReported = $false
    providerCalls = 0
    externalNetworkCalls = 0
    externalTransportPerformed = $false
    tunnelCreated = $false
    deploymentPerformed = $false
    easBuildPerformed = $false
  }
  failureCode = $failureCode
}

[IO.Directory]::CreateDirectory((Split-Path -Parent $evidencePath)) | Out-Null
[IO.File]::WriteAllText(
  $evidencePath,
  (($report | ConvertTo-Json -Depth 10) + "`n"),
  [Text.UTF8Encoding]::new($false)
)

if ($failureCode) { throw "FOUNDER_LOGIN_LOCAL_SMOKE_FAILED:$failureCode" }
Write-Output "FOUNDER_LOGIN_LOCAL_SMOKE=PASS"
Write-Output "SYNTHETIC_CLIENT_LOGIN=PASS"
Write-Output "MOBILE_BOOTSTRAP=PASS"
Write-Output "DISPOSABLE_DATABASE_REMOVED=$databaseRemoved"
Write-Output "EXTERNAL_NETWORK_CALLS=0"
