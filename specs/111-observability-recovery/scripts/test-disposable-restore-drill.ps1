$ErrorActionPreference = "Stop"

. "$PSScriptRoot\run-disposable-restore-drill.ps1" `
  -SourceUrl 'postgres://unused:unused@127.0.0.1:5432/endvera_r31_source' `
  -TargetUrl 'postgres://unused:unused@127.0.0.1:5433/endvera_r31_restored' `
  -WorkspaceId 'unused' `
  -PostgresBinPath $PSScriptRoot `
  -OutputPath (Join-Path $env:TEMP 'endvera-r31-unused.json')

function Assert-R31Refusal {
  param([scriptblock]$Action, [string]$Code)
  try {
    & $Action
    throw "EXPECTED_REFUSAL_NOT_OBSERVED:$Code"
  } catch {
    if ($_.Exception.Message -ne $Code) { throw }
  }
}

$accepted = Assert-R31DisposableEndpoint -Label 'endvera-r31-source' -Url 'postgres://u:p@127.0.0.1:5432/endvera_r31_source'
if ($accepted.Host -ne '127.0.0.1') { throw 'RECOVERY_ACCEPTANCE_GUARD_FAILED' }

Assert-R31Refusal { Assert-R31DisposableEndpoint -Label 'production' -Url 'postgres://u:p@127.0.0.1:5432/endvera_r31_source' } 'RECOVERY_DATABASE_NOT_DISPOSABLE'
Assert-R31Refusal { Assert-R31DisposableEndpoint -Label 'endvera-r31-source' -Url 'postgres://u:p@db.example.com:5432/endvera_r31_source' } 'RECOVERY_DATABASE_HOST_REFUSED'
Assert-R31Refusal { Assert-R31DisposableEndpoint -Label 'endvera-r31-source' -Url 'postgres://u:p@127.0.0.1:5432/postgres' } 'RECOVERY_DATABASE_NAME_REFUSED'
Assert-R31Refusal { Assert-R31DisposableEndpoint -Label 'endvera-r31-source' -Url 'https://127.0.0.1/endvera_r31_source' } 'RECOVERY_DATABASE_SCHEME_REFUSED'

[ordered]@{
  schemaVersion = 1
  status = 'PASS'
  acceptedDisposableEndpointCount = 1
  refusedMutationCount = 4
} | ConvertTo-Json
