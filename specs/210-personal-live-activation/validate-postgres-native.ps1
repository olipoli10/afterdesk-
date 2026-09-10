[CmdletBinding()]
param(
  [Parameter(Mandatory = $true)][string]$RuntimeRoot,
  [Parameter(Mandatory = $true)][string]$NodePath,
  [string]$TestFile = ''
)
$ErrorActionPreference = 'Stop'
$taskRepo = (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path
$taskCluster = $null
$taskData = $null
$taskMayBeRunning = $false
$taskExit = 1
$taskPassword = $null
$taskChildEnvironment = @{}
$taskStage = 'VALIDATE_PATHS'

# This script never installs a service, changes PATH, reads a saved credential or deletes a cluster.
# Runtime provenance must be reviewed by the caller BEFORE executing any binary from RuntimeRoot.
function Assert-NoReparseAncestors([string]$Path) {
  for ($ancestor = Get-Item -LiteralPath $Path; $null -ne $ancestor; ) {
    if ($ancestor.Attributes -band [IO.FileAttributes]::ReparsePoint) { throw 'PERSONAL_NATIVE_REPARSE_PATH_REFUSED' }
    $ancestor = if ($ancestor -is [IO.FileInfo]) { $ancestor.Directory } else { $ancestor.Parent }
  }
}
function Resolve-NativeLeaf([string]$Root, [string]$Relative) {
  $item = Get-Item -LiteralPath (Join-Path $Root $Relative) -ErrorAction Stop
  if ($item.PSIsContainer -or ($item.Attributes -band [IO.FileAttributes]::ReparsePoint)) { throw 'PERSONAL_NATIVE_RUNTIME_INVALID' }
  $path = [IO.Path]::GetFullPath($item.FullName)
  if (-not $path.StartsWith($Root.TrimEnd('\') + '\', [StringComparison]::OrdinalIgnoreCase)) { throw 'PERSONAL_NATIVE_RUNTIME_INVALID' }
  return $path
}
function Start-NativeChild([string]$Executable, [string[]]$Arguments) {
  $info = [Diagnostics.ProcessStartInfo]::new()
  $info.FileName = $Executable
  $info.WorkingDirectory = $taskRepo
  $info.UseShellExecute = $false
  $info.CreateNoWindow = $true
  $info.RedirectStandardOutput = $true
  $info.RedirectStandardError = $true
  $info.Environment.Clear()
  foreach ($entry in $taskChildEnvironment.GetEnumerator()) { $info.Environment[$entry.Key] = [string]$entry.Value }
  foreach ($argument in $Arguments) { $info.ArgumentList.Add($argument) }
  $process = [Diagnostics.Process]::new()
  $process.StartInfo = $info
  if (-not $process.Start()) { throw 'PERSONAL_NATIVE_CHILD_START_FAILED' }
  return @{ Process = $process; Out = $process.StandardOutput.ReadToEndAsync(); Err = $process.StandardError.ReadToEndAsync(); OwnsProcessTree = [IO.Path]::GetFileName($Executable) -ne 'pg_ctl.exe' }
}
function Finish-NativeChild($Child, [string]$Label, [int]$TimeoutMs = 30000) {
  if (-not $Child.Process.WaitForExit($TimeoutMs)) {
    # Test/CLI workers belong to this exact child tree. pg_ctl's detached server is stopped only by exact data path.
    try {
      $Child.Process.Kill([bool]$Child.OwnsProcessTree)
      if (-not $Child.Process.WaitForExit(5000)) { throw 'PERSONAL_NATIVE_CHILD_CLEANUP_UNCERTAIN' }
    } finally { $Child.Process.Dispose() }
    [IO.File]::WriteAllText((Join-Path $taskCluster ($Label + '.log')), 'PERSONAL_NATIVE_CHILD_TIMEOUT', [Text.UTF8Encoding]::new($false))
    throw 'PERSONAL_NATIVE_CHILD_TIMEOUT'
  }
  $exitCode = $Child.Process.ExitCode
  # Windows pg_ctl can exit successfully while its detached postgres retains inherited pipe handles.
  # Never await EOF forever. The following version/PID probes, not launcher output, prove server startup.
  $drained = [Threading.Tasks.Task]::WhenAll([Threading.Tasks.Task[]]@($Child.Out, $Child.Err)).Wait(2000)
  if (-not $drained) {
    $Child.Process.StandardOutput.Dispose()
    $Child.Process.StandardError.Dispose()
    if ($Child.OwnsProcessTree) { $Child.Process.Dispose(); throw 'PERSONAL_NATIVE_CHILD_OUTPUT_UNRESOLVED' }
    $output = 'PERSONAL_NATIVE_DAEMON_OUTPUT_PIPE_RETAINED'
  } else {
    $output = $Child.Out.GetAwaiter().GetResult() + $Child.Err.GetAwaiter().GetResult()
  }
  if ($taskPassword) { $output = $output.Replace($taskPassword, '[REDACTED_EPHEMERAL_PASSWORD]') }
  [IO.File]::WriteAllText((Join-Path $taskCluster ($Label + '.log')), $output, [Text.UTF8Encoding]::new($false))
  $result = @{ ExitCode = $exitCode; Output = $output }
  $Child.Process.Dispose()
  return $result
}
function Invoke-NativeChild([string]$Executable, [string[]]$Arguments, [string]$Label, [int]$TimeoutMs = 30000) {
  $result = Finish-NativeChild (Start-NativeChild $Executable $Arguments) $Label $TimeoutMs
  if ($result.ExitCode -ne 0) { throw 'PERSONAL_NATIVE_CHILD_FAILED' }
  return $result.Output
}
try {
  if ([Environment]::OSVersion.Platform -ne [PlatformID]::Win32NT) { throw 'PERSONAL_NATIVE_WINDOWS_REQUIRED' }
  if (-not [IO.Path]::IsPathFullyQualified($RuntimeRoot) -or $RuntimeRoot.StartsWith('\\')) { throw 'PERSONAL_NATIVE_RUNTIME_INVALID' }
  $taskRuntimeItem = Get-Item -LiteralPath $RuntimeRoot
  if (-not $taskRuntimeItem.PSIsContainer -or ($taskRuntimeItem.Attributes -band [IO.FileAttributes]::ReparsePoint)) { throw 'PERSONAL_NATIVE_RUNTIME_INVALID' }
  $taskRuntime = [IO.Path]::GetFullPath($taskRuntimeItem.FullName)
  $approvedRuntime = [IO.Path]::GetFullPath((Join-Path $taskRepo '.scratch\postgres-native-17.11-3\runtime\pgsql'))
  if ($taskRuntime -ne $approvedRuntime) { throw 'PERSONAL_NATIVE_UNAPPROVED_RUNTIME_PATH' }
  Assert-NoReparseAncestors $taskRuntime
  foreach ($name in @('bin', 'lib', 'share')) {
    $directory = Get-Item -LiteralPath (Join-Path $taskRuntime $name)
    if (-not $directory.PSIsContainer -or ($directory.Attributes -band [IO.FileAttributes]::ReparsePoint)) { throw 'PERSONAL_NATIVE_RUNTIME_INVALID' }
    Assert-NoReparseAncestors $directory.FullName
  }
  $taskInit = Resolve-NativeLeaf $taskRuntime 'bin\initdb.exe'
  $taskControl = Resolve-NativeLeaf $taskRuntime 'bin\pg_ctl.exe'
  $taskSql = Resolve-NativeLeaf $taskRuntime 'bin\psql.exe'
  $null = Resolve-NativeLeaf $taskRuntime 'bin\postgres.exe'
  # Hashes from the inspected official EDB17.11-3 archive. This pins bytes, not an Authenticode certification.
  $approvedExecutables = @{
    'initdb.exe' = '2ef1b590d0967af7c0ea10bbf1b53195a589c75ef5b5cdc6177aa2b0bee9fe65'
    'pg_ctl.exe' = '595303cede56a05eff6e2ec6e6e8bd5531c13832ba09fab57b1a9e93bc945c34'
    'postgres.exe' = '8ae8bb442e8a4c4fb2c8e9ad38c19aca610ee3cba33afd69249de769f905329b'
    'psql.exe' = 'aa12e27530ac07f129e69daca953ea5f02202a7bde45d503e771abc39016536d'
  }
  foreach ($binary in $approvedExecutables.GetEnumerator()) {
    $binaryPath = Resolve-NativeLeaf $taskRuntime ('bin\' + $binary.Key)
    if ((Get-FileHash -LiteralPath $binaryPath -Algorithm SHA256).Hash.ToLowerInvariant() -ne $binary.Value) { throw 'PERSONAL_NATIVE_RUNTIME_HASH_MISMATCH' }
  }
  if (-not [IO.Path]::IsPathFullyQualified($NodePath) -or $NodePath.StartsWith('\\') -or -not (Test-Path -LiteralPath $NodePath -PathType Leaf)) { throw 'PERSONAL_NATIVE_NODE_INVALID' }
  $taskNode = (Resolve-Path -LiteralPath $NodePath).Path
  Assert-NoReparseAncestors $taskNode
  if ([IO.Path]::GetFileName($taskNode) -ne 'node.exe') { throw 'PERSONAL_NATIVE_NODE_INVALID' }
  if ($TestFile -and ($TestFile -notmatch '^[a-z-]+\.postgres\.test\.ts$' -or -not (Test-Path -LiteralPath (Join-Path $PSScriptRoot $TestFile) -PathType Leaf))) { throw 'PERSONAL_NATIVE_TEST_FILTER_INVALID' }
  $taskScratch = Join-Path $taskRepo '.scratch'
  if (-not (Test-Path -LiteralPath $taskScratch)) { $null = [IO.Directory]::CreateDirectory($taskScratch) }
  if ((Get-Item -LiteralPath $taskScratch).Attributes -band [IO.FileAttributes]::ReparsePoint) { throw 'PERSONAL_NATIVE_SCRATCH_INVALID' }
  $taskCluster = Join-Path $taskScratch ('personal-pg-native-' + [Guid]::NewGuid().ToString('N'))
  $taskData = Join-Path $taskCluster 'data'
  $null = [IO.Directory]::CreateDirectory($taskCluster)
  $taskStage = 'PRIVATE_CLUSTER_ACL'
  # Restrict the unique new cluster, including inherited log/password/data files, to this local Windows identity.
  $taskSid = [Security.Principal.WindowsIdentity]::GetCurrent().User
  $taskAcl = [Security.AccessControl.DirectorySecurity]::new()
  $taskAcl.SetOwner($taskSid)
  $taskAcl.SetAccessRuleProtection($true, $false)
  $taskAcl.AddAccessRule([Security.AccessControl.FileSystemAccessRule]::new($taskSid, 'FullControl', 'ContainerInherit,ObjectInherit', 'None', 'Allow'))
  Set-Acl -LiteralPath $taskCluster -AclObject $taskAcl
  $taskStage = 'CHILD_ENVIRONMENT'
  # Only ordinary OS/runtime environment is inherited. No provider, credential, PG or application settings leak in.
  foreach ($name in @('SystemRoot', 'WINDIR', 'ComSpec', 'TEMP', 'TMP', 'PATH', 'PATHEXT', 'USERPROFILE', 'APPDATA', 'LOCALAPPDATA', 'PROCESSOR_ARCHITECTURE', 'NUMBER_OF_PROCESSORS')) {
    $value = [Environment]::GetEnvironmentVariable($name, 'Process')
    if ($null -ne $value) { $taskChildEnvironment[$name] = $value }
  }
  $taskChildEnvironment['CI'] = '1'
  $taskChildEnvironment['NODE_ENV'] = 'test'
  $taskChildEnvironment['PRISMA_HIDE_UPDATE_MESSAGE'] = '1'
  $taskChildEnvironment['CHECKPOINT_DISABLE'] = '1'
  $taskChildEnvironment['NEXT_TELEMETRY_DISABLED'] = '1'
  $taskChildEnvironment['EXPO_NO_TELEMETRY'] = '1'
  $taskChildEnvironment['EXPO_OFFLINE'] = '1'
  $taskChildEnvironment['npm_config_offline'] = 'true'
  $taskChildEnvironment['DO_NOT_TRACK'] = '1'
  $taskChildEnvironment['NO_COLOR'] = '1'
  $taskGuard = Join-Path $taskRepo 'specs\206-gpt6-astra-endvera-reverification\phase-checks-r0b\network-guard.cjs'
  if (-not (Test-Path -LiteralPath $taskGuard -PathType Leaf)) { throw 'PERSONAL_NATIVE_NETWORK_GUARD_REQUIRED' }
  $taskChildEnvironment['NODE_OPTIONS'] = '--require="' + $taskGuard.Replace('\', '/') + '"'
  $taskChildEnvironment['DOTENV_CONFIG_PATH'] = Join-Path $taskCluster 'absent.env'
  $taskGit = (Get-Command git -CommandType Application -ErrorAction Stop | Select-Object -First 1).Source
  $taskStage = 'IGNORE_CHECK'
  $ignored = Finish-NativeChild (Start-NativeChild $taskGit @('check-ignore', '--quiet', '--', $taskCluster)) 'ignore-check'
  if ($ignored.ExitCode -ne 0) { throw 'PERSONAL_NATIVE_SCRATCH_NOT_IGNORED' }
  $taskRandom = [byte[]]::new(32)
  $taskStage = 'EPHEMERAL_CREDENTIAL'
  [Security.Cryptography.RandomNumberGenerator]::Fill($taskRandom)
  $taskPassword = -join ($taskRandom | ForEach-Object { $_.ToString('x2') })
  $taskPasswordFile = Join-Path $taskCluster 'ephemeral-password.txt'
  [IO.File]::WriteAllText($taskPasswordFile, $taskPassword + "`n", [Text.UTF8Encoding]::new($false))
  $taskDatabase = 'endvera_personal_210_' + [Guid]::NewGuid().ToString('N')
  $taskUser = 'synthetic_local_operator'
  $taskListener = [Net.Sockets.TcpListener]::new([Net.IPAddress]::Loopback, 0)
  $taskStage = 'LOOPBACK_PORT'
  try { $taskListener.Start(); $taskPort = ([Net.IPEndPoint]$taskListener.LocalEndpoint).Port } finally { $taskListener.Stop() }
  $taskStage = 'INITDB'
  $null = Invoke-NativeChild $taskInit @('-D', $taskData, '--username', $taskUser, '--pwfile', $taskPasswordFile, '--auth-host=scram-sha-256', '--auth-local=scram-sha-256', '--encoding=UTF8', '--no-locale') 'initdb'
  $taskMayBeRunning = $true
  $taskStage = 'START'
  $null = Invoke-NativeChild $taskControl @('-D', $taskData, '-l', (Join-Path $taskCluster 'server.log'), '-o', "-h 127.0.0.1 -p $taskPort -c ssl=off -c log_statement=none -c log_connections=off -c log_disconnections=off", '-w', '-t', '15', 'start') 'start'
  Write-Output 'PERSONAL_NATIVE_DB_STARTED_LOOPBACK'
  $taskChildEnvironment['PGHOST'] = '127.0.0.1'
  $taskChildEnvironment['PGPORT'] = [string]$taskPort
  $taskChildEnvironment['PGUSER'] = $taskUser
  $taskChildEnvironment['PGPASSWORD'] = $taskPassword
  $taskChildEnvironment['PGDATABASE'] = 'postgres'
  $taskChildEnvironment['PGCONNECT_TIMEOUT'] = '5'
  $taskChildEnvironment['PGAPPNAME'] = 'endvera_native_runtime_probe'
  $taskStage = 'VERSION'
  $version = (Invoke-NativeChild $taskSql @('-X', '-A', '-t', '-v', 'ON_ERROR_STOP=1', '-c', 'SHOW server_version_num;') 'version').Trim()
  if ($version -ne '170011') { throw 'PERSONAL_NATIVE_VERSION_UNEXPECTED' }
  Write-Output 'PERSONAL_NATIVE_POSTGRES_17_11_VERIFIED'
  # These two processes must coexist, not merely reconnect sequentially to the same backend.
  $probeSql = "SELECT pg_backend_pid(); SELECT pg_sleep(1); SELECT count(*) FROM pg_stat_activity WHERE application_name='endvera_native_runtime_probe' AND state='active'; SELECT pg_sleep(1);"
  $taskStage = 'DISTINCT_BACKENDS'
  $probeA = Start-NativeChild $taskSql @('-X', '-A', '-t', '-v', 'ON_ERROR_STOP=1', '-c', $probeSql)
  $probeB = Start-NativeChild $taskSql @('-X', '-A', '-t', '-v', 'ON_ERROR_STOP=1', '-c', $probeSql)
  $resultA = Finish-NativeChild $probeA 'backend-probe-a' 10000
  $resultB = Finish-NativeChild $probeB 'backend-probe-b' 10000
  $numbersA = @($resultA.Output -split '\r?\n' | Where-Object { $_ -match '^\d+$' })
  $numbersB = @($resultB.Output -split '\r?\n' | Where-Object { $_ -match '^\d+$' })
  if ($resultA.ExitCode -ne 0 -or $resultB.ExitCode -ne 0 -or $numbersA.Count -ne 2 -or $numbersB.Count -ne 2 -or $numbersA[0] -eq $numbersB[0] -or ([int]$numbersA[1] -lt 2 -and [int]$numbersB[1] -lt 2)) { throw 'PERSONAL_NATIVE_DISTINCT_BACKENDS_UNPROVEN' }
  Write-Output 'PERSONAL_NATIVE_SIMULTANEOUS_DISTINCT_BACKENDS_VERIFIED'
  $taskStage = 'CREATE_DATABASE'
  $null = Invoke-NativeChild $taskSql @('-X', '-v', 'ON_ERROR_STOP=1', '-c', "CREATE DATABASE $taskDatabase TEMPLATE template0;") 'create-database'
  $taskUrl = "postgresql://${taskUser}:${taskPassword}@127.0.0.1:${taskPort}/${taskDatabase}?connection_limit=5&connect_timeout=5"
  $taskChildEnvironment['DATABASE_URL'] = $taskUrl
  $taskChildEnvironment['DIRECT_URL'] = $taskUrl
  $taskChildEnvironment['ENDVERA_210_DATABASE_NAME'] = $taskDatabase
  $taskChildEnvironment['PGDATABASE'] = $taskDatabase
  $taskChildEnvironment['PGAPPNAME'] = 'endvera_native_local_tests'
  $taskStage = 'MIGRATIONS'
  $null = Invoke-NativeChild $taskNode @((Join-Path $taskRepo 'node_modules/prisma/build/index.js'), 'migrate', 'deploy') 'migrations' 120000
  Write-Output 'PERSONAL_NATIVE_MIGRATIONS_APPLIED'
  $testArgs = @((Join-Path $taskRepo 'node_modules/vitest/vitest.mjs'), 'run', '--config', 'specs/210-personal-live-activation/vitest.postgres.config.ts')
  if ($TestFile) { $testArgs += ('specs/210-personal-live-activation/' + $TestFile) }
  $taskStage = 'TESTS'
  $testResult = Finish-NativeChild (Start-NativeChild $taskNode $testArgs) 'tests' 600000
  Write-Output $testResult.Output
  $taskExit = $testResult.ExitCode
} catch {
  $code = $_.Exception.Message
  if ($code -match '^PERSONAL_NATIVE_[A-Z0-9_]+$') { Write-Output $code }
  else { Write-Output 'PERSONAL_NATIVE_VALIDATION_FAILED' }
  # Fixed stage plus error class/line only. Never exception messages, command arguments or environment values.
  Write-Output ('PERSONAL_NATIVE_FAILURE_DIAGNOSTIC stage=' + $taskStage + ' type=' + $_.Exception.GetType().Name + ' line=' + $_.InvocationInfo.ScriptLineNumber + ' category=' + $_.CategoryInfo.Category)
  $taskExit = 1
} finally {
  if ($taskMayBeRunning) {
    try {
      $resolvedData = [IO.Path]::GetFullPath($taskData)
      $expectedData = [IO.Path]::GetFullPath((Join-Path $taskCluster 'data'))
      if ($resolvedData -ne $expectedData -or -not $resolvedData.StartsWith([IO.Path]::GetFullPath($taskScratch).TrimEnd('\') + '\', [StringComparison]::OrdinalIgnoreCase)) { throw 'PERSONAL_NATIVE_CLEANUP_TARGET_INVALID' }
      $null = Invoke-NativeChild $taskControl @('-D', $resolvedData, '-m', 'fast', '-w', '-t', '15', 'stop') 'stop'
      Write-Output 'PERSONAL_NATIVE_DISPOSABLE_SERVER_STOPPED'
    } catch { Write-Output 'PERSONAL_NATIVE_CLEANUP_REQUIRES_REVIEW'; $taskExit = 1 }
  }
  # Data and redacted logs remain in the private ignored directory for diagnosis; no recursive delete is performed.
  if ($taskCluster) { Write-Output ('PERSONAL_NATIVE_RETAINED_CLUSTER=' + $taskCluster) }
  $taskChildEnvironment.Clear()
  $taskPassword = $null
}
exit $taskExit
