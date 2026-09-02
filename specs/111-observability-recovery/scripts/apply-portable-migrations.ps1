param(
  [Parameter(Mandatory = $true)][string]$DatabaseUrl,
  [Parameter(Mandatory = $true)][string]$PsqlPath
)

$ErrorActionPreference = 'Stop'
$uri = [System.Uri]::new($DatabaseUrl)
if ($uri.Scheme -notin @('postgres', 'postgresql')) { throw 'PORTABLE_MIGRATION_SCHEME_REFUSED' }
if ($uri.Host -notin @('127.0.0.1', 'localhost')) { throw 'PORTABLE_MIGRATION_HOST_REFUSED' }
$databaseName = $uri.AbsolutePath.TrimStart('/')
if ($databaseName -notmatch '^endvera_r31_[a-z0-9_]+_(test|integration)$') { throw 'PORTABLE_MIGRATION_DATABASE_REFUSED' }
if (-not (Test-Path -LiteralPath $PsqlPath -PathType Leaf)) { throw 'PORTABLE_MIGRATION_PSQL_MISSING' }

$userInfo = $uri.UserInfo.Split(':', 2)
$safeUrl = "postgresql://$($uri.Host):$($uri.Port)$($uri.AbsolutePath)?sslmode=disable"
$migrationDirectories = Get-ChildItem -LiteralPath 'prisma/migrations' -Directory | Sort-Object Name
$applied = 0

foreach ($directory in $migrationDirectories) {
  $migrationPath = Join-Path $directory.FullName 'migration.sql'
  $sql = Get-Content -LiteralPath $migrationPath -Raw
  if ($directory.Name -eq '20260730003000_ai_pricing_suggestions') {
    # R31 restores only User + Construction* data. The portable PostgreSQL
    # archive has no pgvector binary, so this unrelated column is represented
    # by a compatible inert array and its unrelated HNSW index is omitted.
    $sql = [regex]::Replace($sql, 'CREATE EXTENSION IF NOT EXISTS vector;\s*', '', 'Singleline')
    $sql = $sql.Replace('vector(1024)', 'DOUBLE PRECISION[]')
    $sql = [regex]::Replace(
      $sql,
      'CREATE INDEX "TaskEmbedding_embedding_hnsw_idx"\s+ON "TaskEmbedding" USING hnsw \("embedding" vector_cosine_ops\);\s*',
      '',
      'Singleline'
    )
  }

  $info = [System.Diagnostics.ProcessStartInfo]::new()
  $info.FileName = $PsqlPath
  $info.UseShellExecute = $false
  $info.CreateNoWindow = $true
  $info.RedirectStandardInput = $true
  $info.RedirectStandardOutput = $true
  $info.RedirectStandardError = $true
  $info.StandardInputEncoding = [System.Text.UTF8Encoding]::new($false)
  foreach ($argument in @('--set=ON_ERROR_STOP=1', '--single-transaction', "--dbname=$safeUrl")) {
    [void]$info.ArgumentList.Add($argument)
  }
  $info.Environment['PGUSER'] = if ($userInfo.Count -gt 0) { [System.Uri]::UnescapeDataString($userInfo[0]) } else { '' }
  $info.Environment['PGPASSWORD'] = if ($userInfo.Count -gt 1) { [System.Uri]::UnescapeDataString($userInfo[1]) } else { '' }
  $info.Environment['PGSSLMODE'] = 'disable'
  $process = [System.Diagnostics.Process]::new()
  $process.StartInfo = $info
  [void]$process.Start()
  $writeError = $null
  try {
    $process.StandardInput.Write($sql)
  } catch {
    $writeError = $_
  } finally {
    $process.StandardInput.Close()
  }
  [void]$process.StandardOutput.ReadToEnd()
  $stderr = $process.StandardError.ReadToEnd()
  $process.WaitForExit()
  if ($process.ExitCode -ne 0 -or $writeError) {
    throw "PORTABLE_MIGRATION_FAILED:$($directory.Name):$stderr"
  }
  $applied += 1
}

[ordered]@{
  schemaVersion = 1
  status = 'PASS'
  appliedMigrationCount = $applied
  vectorSurrogateUsed = $true
  restoreScope = 'USER_AND_CONSTRUCTION_TABLES'
} | ConvertTo-Json
