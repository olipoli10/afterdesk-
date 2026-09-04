$ErrorActionPreference = "Stop"
$root = (Resolve-Path (Join-Path $PSScriptRoot "..\..\..")).Path
$contract = Join-Path $root "src\lib\construction-operating-assistant-r36y\project-brain-assistant-memory.ts"
$service = Join-Path $root "src\server\construction-operating-assistant-r36y\project-brain-assistant-memory.ts"
$migration = Join-Path $root "prisma\migrations\20260904040000_construction_assistant_r36y_project_brain_assistant_memory\migration.sql"
$mobile = Join-Path $root "apps\mobile\src\app\(app)\assistant.tsx"
$guard = "test/construction-operating-assistant-r36y-assistant-memory-mutation-guards.test.ts"
$serverGuard = "test/construction-operating-assistant-r36y-assistant-memory-server.test.ts"
$mutations = @(
  @{ Name="newer-draft-eclipses-confirmed-memory"; Path=$service; From='where: { workspaceId: input.workspaceId, projectId: input.projectId, status: "CONFIRMED" }'; To='where: { workspaceId: input.workspaceId, projectId: input.projectId, status: "DRAFT" }'; Test=$guard },
  @{ Name="unconfirmed-candidate-is-returned-as-truth"; Path=$contract; From='candidate.disposition !== "ACCEPT_AS_REVIEWED"'; To='candidate.disposition === "ACCEPT_AS_REVIEWED"'; Test=$guard },
  @{ Name="unresolved-contradiction-is-hidden-or-resolved"; Path=$service; From='if (!resolution) throw new Error("PROJECT_BRAIN_MEMORY_CORRUPT_SOURCE")'; To='if (false && !resolution) throw new Error("PROJECT_BRAIN_MEMORY_CORRUPT_SOURCE")'; Test=$guard },
  @{ Name="citation-chain-is-optional-or-mismatched"; Path=$migration; From='CREATE CONSTRAINT TRIGGER "CPBMC_provenance_guard"'; To='CREATE CONSTRAINT TRIGGER "CPBMC_provenance_disabled"'; Test=$guard },
  @{ Name="source-metadata-becomes-job-fact"; Path=$contract; From='input.questionKind === "REVIEWED_SOURCE_INVENTORY"'; To='input.questionKind === "PROJECT_SUMMARY"'; Test=$guard },
  @{ Name="unsupported-question-invents-answer"; Path=$contract; From='"NEXT_DECISION",'; To='"ASK_ANYTHING",'; Test=$guard },
  @{ Name="unsupported-action-family-is-prepared"; Path=$contract; From='"EMAIL",'; To='"SEARCH",'; Test=$guard },
  @{ Name="recipient-channel-or-body-is-hidden"; Path=$mobile; From='{copy.assistantMemory.exactMessage}: {preparedAction.body}'; To='{copy.assistantMemory.exactMessage}'; Test=$guard },
  @{ Name="preparation-approves-or-delivers"; Path=$service; From='status: "PREPARED_UNSENT", approvalRequired: true, citations'; To='status: "PREPARED_UNSENT", approvalRequired: false, citations'; Test=$guard },
  @{ Name="stale-memory-hash-is-accepted"; Path=$service; From='command.expectedMemoryCanonicalHash !== memory.memoryCanonicalHash'; To='command.expectedMemoryCanonicalHash === memory.memoryCanonicalHash'; Test=$guard },
  @{ Name="stale-memory-sequence-is-accepted-or-current-pointer-is-ambiguous"; Path=$service; From='command.expectedConfirmedUnderstandingSequence !== memory.confirmedUnderstandingSequence'; To='command.expectedConfirmedUnderstandingSequence === memory.confirmedUnderstandingSequence'; Test=$guard },
  @{ Name="replay-duplicates-action-or-receipt"; Path=$service; From='if (replay) return replay;'; To='if (false && replay) return replay;'; Test=$guard },
  @{ Name="command-id-body-drift-is-accepted"; Path=$service; From='decision.commandHash !== commandHash'; To='decision.commandHash === commandHash'; Test=$guard },
  @{ Name="cross-workspace-memory-contact-or-action-is-visible"; Path=$service; From='id: command.recipientContactRef, workspaceId: command.workspaceId, projectId: command.projectId'; To='id: command.recipientContactRef, projectId: command.projectId'; Test=$guard },
  @{ Name="binary-provider-or-network-path-is-reachable"; Path=$service; From='import "server-only";'; To="import `"server-only`";`nvoid fetch(`"https://example.invalid`" );"; Test=$serverGuard },
  @{ Name="history-can-update-delete-or-truncate"; Path=$migration; From='CREATE TRIGGER "CPBRR_immutable"'; To='CREATE TRIGGER "CPBRR_mutable"'; Test=$guard }
)

function Hash([byte[]]$bytes) {
  $sha = [Security.Cryptography.SHA256]::Create()
  try { ([Convert]::ToHexString($sha.ComputeHash($bytes))).ToLowerInvariant() }
  finally { $sha.Dispose() }
}

$results = [Collections.Generic.List[object]]::new()
Push-Location $root
try {
  foreach ($mutation in $mutations) {
    $bytes = [IO.File]::ReadAllBytes($mutation.Path)
    $before = Hash $bytes
    try {
      $text = [Text.Encoding]::UTF8.GetString($bytes)
      $index = $text.IndexOf($mutation.From, [StringComparison]::Ordinal)
      if ($index -lt 0) { throw "Mutation target not found: $($mutation.Name)" }
      $changed = $text.Substring(0, $index) + $mutation.To + $text.Substring($index + $mutation.From.Length)
      [IO.File]::WriteAllText($mutation.Path, $changed, [Text.UTF8Encoding]::new($false))
      & npm.cmd test -- --run $mutation.Test *> $null
      if ($LASTEXITCODE -eq 0) { throw "Mutation survived: $($mutation.Name)" }
    }
    finally { [IO.File]::WriteAllBytes($mutation.Path, $bytes) }
    $after = Hash ([IO.File]::ReadAllBytes($mutation.Path))
    if ($after -ne $before) { throw "Byte restore failed: $($mutation.Name)" }
    & npm.cmd test -- --run $mutation.Test *> $null
    if ($LASTEXITCODE -ne 0) { throw "Green rerun failed: $($mutation.Name)" }
    $results.Add([pscustomobject]@{ name=$mutation.Name; beforeSha256=$before; afterSha256=$after; byteExactRestore=$true; green=$true })
    Write-Host "R36Y_MUTATION_KILLED=$($mutation.Name) SHA256=$before"
  }
}
finally { Pop-Location }

$results | ConvertTo-Json -Depth 3
Write-Host "R36Y_MUTATIONS=PASS COUNT=$($results.Count) BYTE_EXACT_RESTORE=true"
