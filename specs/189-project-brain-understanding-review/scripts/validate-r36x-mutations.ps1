$ErrorActionPreference = "Stop"
$root = (Resolve-Path (Join-Path $PSScriptRoot "..\..\..")).Path
$service = Join-Path $root "src\server\construction-operating-assistant-r36x\project-brain-understanding-review.ts"
$contract = Join-Path $root "src\lib\construction-operating-assistant-r36x\project-brain-understanding-review.ts"
$migration = Join-Path $root "prisma\migrations\20260904010000_construction_assistant_r36x_project_brain_understanding\migration.sql"
$guard = "test/construction-operating-assistant-r36x-understanding-mutation-guards.test.ts"
$serverGuard = "test/construction-operating-assistant-r36x-understanding-server.test.ts"
$mutations = @(
  @{ Name="field-worker-can-read-or-decide"; Path=$service; From='new Set(["owner", "admin"])'; To='new Set(["owner", "admin", "member"])'; Test=$guard },
  @{ Name="cross-workspace-candidate-enters-review"; Path=$migration; From='candidate."batchId" = review."candidateBatchId"'; To='candidate."batchId" <> review."candidateBatchId"'; Test=$guard },
  @{ Name="contradiction-member-is-overwritten-or-deleted"; Path=$migration; From='CREATE TRIGGER "CPBUCM_immutable"'; To='CREATE TRIGGER "CPBUCM_mutable"'; Test=$guard },
  @{ Name="resolution-removes-original-conflict"; Path=$migration; From='CREATE TRIGGER "CPBURes_immutable"'; To='CREATE TRIGGER "CPBURes_mutable"'; Test=$guard },
  @{ Name="automatic-resolution-is-accepted"; Path=$contract; From='z.object({ mode: z.literal("REJECT_ALL_UNSUPPORTED") }).strict(),'; To='z.object({ mode: z.literal("AUTOMATIC") }).strict(),'; Test=$guard },
  @{ Name="resolution-selects-non-member"; Path=$contract; From='!members.includes(candidateId)'; To='members.includes(candidateId)'; Test="test/construction-operating-assistant-r36x-understanding-contracts.test.ts" },
  @{ Name="resolution-and-disposition-disagree"; Path=$service; From='if (expected && expected !== decision.disposition)'; To='if (expected && expected === decision.disposition)'; Test=$guard },
  @{ Name="multi-group-derived-outcomes-conflict"; Path=$service; From='if (prior && prior !== outcome)'; To='if (false && prior !== outcome)'; Test=$guard },
  @{ Name="candidate-without-disposition-is-omitted"; Path=$service; From='if (dispositions.size !== exact.candidateBatch.candidates.length)'; To='if (false && dispositions.size !== exact.candidateBatch.candidates.length)'; Test=$guard },
  @{ Name="unresolved-contradiction-can-seal"; Path=$service; From='if (!current) throw new Error("PROJECT_BRAIN_UNDERSTANDING_INCOMPLETE")'; To='if (false && !current) throw new Error("PROJECT_BRAIN_UNDERSTANDING_INCOMPLETE")'; Test=$guard },
  @{ Name="stale-fingerprint-can-confirm"; Path=$service; From='review.reviewFingerprint !== command.reviewFingerprint'; To='review.reviewFingerprint === command.reviewFingerprint'; Test=$guard },
  @{ Name="canonical-hash-does-not-cover-complete-review"; Path=$contract; From='candidates: [...input.candidates].sort'; To='candidates: [...input.candidates].slice(0, 1).sort'; Test=$guard },
  @{ Name="replay-creates-second-effect"; Path=$service; From="if (prior) {`n      if (prior.commandHash !== commandHash)"; To="if (false && prior) {`n      if (prior.commandHash !== commandHash)"; Test=$guard },
  @{ Name="command-id-body-drift-is-accepted"; Path=$service; From='if (prior.commandHash !== commandHash)'; To='if (prior.commandHash === commandHash)'; Test=$guard },
  @{ Name="partial-transaction-commits"; Path=$service; From="stateVersion: 1, status: `"DRAFT`", reviewFingerprint: null, canonicalEffectId: reviewId });`n      await tx.constructionProjectBrainUnderstandingDecision.create"; To="stateVersion: 1, status: `"DRAFT`", reviewFingerprint: null, canonicalEffectId: reviewId });`n      if (false) await tx.constructionProjectBrainUnderstandingDecision.create"; Test=$guard },
  @{ Name="binary-or-provider-path-is-reachable"; Path=$service; From='import "server-only";'; To="import `"server-only`";`nvoid fetch(`"https://example.invalid`" );"; Test=$serverGuard },
  @{ Name="confirmed-history-can-update-delete-or-truncate"; Path=$migration; From='CREATE TRIGGER "CPBUSnap_immutable"'; To='CREATE TRIGGER "CPBUSnap_mutable"'; Test=$guard },
  @{ Name="confirmation-sequence-is-duplicated-or-current-order-drifts"; Path=$migration; From='CREATE UNIQUE INDEX "CPBUR_confirmed_sequence_key"'; To='CREATE INDEX "CPBUR_confirmed_sequence_key"'; Test=$guard }
)
function Hash([byte[]]$bytes) { $sha=[Security.Cryptography.SHA256]::Create(); try { ([Convert]::ToHexString($sha.ComputeHash($bytes))).ToLowerInvariant() } finally { $sha.Dispose() } }
$results=[Collections.Generic.List[object]]::new()
Push-Location $root
try {
  foreach ($mutation in $mutations) {
    $bytes=[IO.File]::ReadAllBytes($mutation.Path); $before=Hash $bytes
    try {
      $text=[Text.Encoding]::UTF8.GetString($bytes)
      $index=$text.IndexOf($mutation.From,[StringComparison]::Ordinal)
      if ($index -lt 0) { throw "Mutation target not found: $($mutation.Name)" }
      $changed=$text.Substring(0,$index)+$mutation.To+$text.Substring($index+$mutation.From.Length)
      [IO.File]::WriteAllText($mutation.Path,$changed,[Text.UTF8Encoding]::new($false))
      & npm.cmd test -- --run $mutation.Test *> $null
      if ($LASTEXITCODE -eq 0) { throw "Mutation survived: $($mutation.Name)" }
    } finally { [IO.File]::WriteAllBytes($mutation.Path,$bytes) }
    $after=Hash ([IO.File]::ReadAllBytes($mutation.Path)); if ($after -ne $before) { throw "Byte restore failed: $($mutation.Name)" }
    & npm.cmd test -- --run $mutation.Test *> $null; if ($LASTEXITCODE -ne 0) { throw "Green rerun failed: $($mutation.Name)" }
    $results.Add([pscustomobject]@{name=$mutation.Name;beforeSha256=$before;afterSha256=$after;byteExactRestore=$true;green=$true})
    Write-Host "R36X_MUTATION_KILLED=$($mutation.Name) SHA256=$before"
  }
} finally { Pop-Location }
$results | ConvertTo-Json -Depth 3
Write-Host "R36X_MUTATIONS=PASS COUNT=$($results.Count) BYTE_EXACT_RESTORE=true"
