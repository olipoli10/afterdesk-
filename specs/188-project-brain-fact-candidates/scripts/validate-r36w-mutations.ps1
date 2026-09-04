$ErrorActionPreference = "Stop"

$root = (Resolve-Path (Join-Path $PSScriptRoot "..\..\..")).Path
$contractPath = Join-Path $root "src\lib\construction-operating-assistant-r36w\project-brain-fact-candidates.ts"
$servicePath = Join-Path $root "src\server\construction-operating-assistant-r36w\project-brain-fact-candidates.ts"
$migrationPath = Join-Path $root "prisma\migrations\20260903220000_construction_assistant_r36w_project_brain_fact_candidates\migration.sql"
$contractTest = "test/construction-operating-assistant-r36w-fact-candidates-contracts.test.ts"
$serverTest = "test/construction-operating-assistant-r36w-fact-candidates-server.test.ts"
$guardTest = "test/construction-operating-assistant-r36w-fact-candidates-mutation-guards.test.ts"

$mutations = @(
  @{ Name = "unregistered-adapter-is-accepted"; Path = $contractPath; From = '  "ADMITTED_SOURCE_METADATA_V1",'; To = "  `"ADMITTED_SOURCE_METADATA_V1`",`n  `"MODEL_V1`,"; Test = $guardTest },
  @{ Name = "owner-text-is-semantically-split-or-inferred"; Path = $contractPath; From = 'const value = input.ownerBrief[ownerBriefField];'; To = 'const value = `${input.ownerBrief[ownerBriefField]} (inferred)`;'; Test = $contractTest },
  @{ Name = "text-range-no-longer-reconstructs-value"; Path = $contractPath; From = 'rangeEnd: value.length,'; To = 'rangeEnd: value.length - 1,'; Test = $contractTest },
  @{ Name = "source-metadata-comes-from-request"; Path = $contractPath; From = 'displayName: source.displayName,'; To = 'displayName: input.ownerBrief.summary,'; Test = $contractTest },
  @{ Name = "metadata-is-promoted-to-job-fact"; Path = $contractPath; From = "adapter: `"ADMITTED_SOURCE_METADATA_V1`",`n        kind: `"SOURCE_METADATA`","; To = "adapter: `"ADMITTED_SOURCE_METADATA_V1`",`n        kind: `"OWNER_TEXT`","; Test = $contractTest },
  @{ Name = "binary-object-is-opened"; Path = $servicePath; From = 'import "server-only";'; To = "import `"server-only`";`nimport `"@/lib/storage-local`";"; Test = $serverTest },
  @{ Name = "provider-or-network-path-is-reachable"; Path = $servicePath; From = 'function falseEffects() {'; To = "function falseEffects() {`n  void fetch(`"https://example.invalid`" );"; Test = $serverTest },
  @{ Name = "candidate-is-automatically-confirmed"; Path = $contractPath; From = 'status: "CANDIDATE_UNCONFIRMED" as const,'; To = 'status: "CONFIRMED" as const,'; Test = $contractTest },
  @{ Name = "confidence-becomes-probability"; Path = $contractPath; From = 'confidenceClass: "EXACT_OWNER_TEXT",'; To = "confidenceClass: `"EXACT_OWNER_TEXT`",`n      confidence: 0.99,"; Test = $contractTest },
  @{ Name = "replay-creates-second-candidate-set"; Path = $servicePath; From = 'if (equivalent) {'; To = 'if (false && equivalent) {'; Test = $guardTest },
  @{ Name = "command-id-body-drift-is-accepted"; Path = $servicePath; From = 'if (priorDecision.commandHash !== commandHash)'; To = 'if (priorDecision.commandHash === commandHash)'; Test = $guardTest },
  @{ Name = "cross-workspace-source-or-batch-is-visible"; Path = $servicePath; From = 'where: { workspaceId: input.workspaceId, projectId: input.projectId, intakeId: input.intakeId },'; To = 'where: { projectId: input.projectId, intakeId: input.intakeId },'; Test = $guardTest },
  @{ Name = "partial-batch-commits-after-failure"; Path = $servicePath; From = 'await tx.constructionProjectBrainFactCandidateDecision.create({'; To = 'if (false) await tx.constructionProjectBrainFactCandidateDecision.create({'; Test = $guardTest; Last = $true },
  @{ Name = "candidate-history-can-be-updated-deleted-or-truncated"; Path = $migrationPath; From = 'CREATE TRIGGER "ConstructionProjectBrainFactCandidate_no_truncate" BEFORE TRUNCATE ON "ConstructionProjectBrainFactCandidate"'; To = '-- MUTATED no-truncate guard removed'; Test = $guardTest }
)

function Get-Sha256([byte[]] $Bytes) {
  $sha = [System.Security.Cryptography.SHA256]::Create()
  try { return ([Convert]::ToHexString($sha.ComputeHash($Bytes))).ToLowerInvariant() }
  finally { $sha.Dispose() }
}

function Replace-Exact([string] $Text, [string] $From, [string] $To, [bool] $Last) {
  $index = if ($Last) { $Text.LastIndexOf($From, [StringComparison]::Ordinal) } else { $Text.IndexOf($From, [StringComparison]::Ordinal) }
  if ($index -lt 0) { throw "Mutation target not found: $From" }
  return $Text.Substring(0, $index) + $To + $Text.Substring($index + $From.Length)
}

$results = [System.Collections.Generic.List[object]]::new()
Push-Location $root
try {
  foreach ($mutation in $mutations) {
    $originalBytes = [IO.File]::ReadAllBytes($mutation.Path)
    $before = Get-Sha256 $originalBytes
    try {
      $originalText = [Text.Encoding]::UTF8.GetString($originalBytes)
      $mutatedText = Replace-Exact $originalText $mutation.From $mutation.To ([bool]$mutation.Last)
      [IO.File]::WriteAllText($mutation.Path, $mutatedText, [Text.UTF8Encoding]::new($false))
      $output = (& npm.cmd test -- --run $mutation.Test 2>&1 | Out-String)
      $redExit = $LASTEXITCODE
      if ($redExit -eq 0) { throw "Mutation survived: $($mutation.Name)" }
    }
    finally {
      [IO.File]::WriteAllBytes($mutation.Path, $originalBytes)
    }
    $after = Get-Sha256 ([IO.File]::ReadAllBytes($mutation.Path))
    if ($after -ne $before) { throw "Byte restore failed: $($mutation.Name)" }
    $greenOutput = (& npm.cmd test -- --run $mutation.Test 2>&1 | Out-String)
    if ($LASTEXITCODE -ne 0) { throw "Green rerun failed: $($mutation.Name)`n$greenOutput" }
    $results.Add([pscustomobject]@{
      name = $mutation.Name
      target = [IO.Path]::GetRelativePath($root, $mutation.Path).Replace("\", "/")
      guard = $mutation.Test
      redExit = $redExit
      beforeSha256 = $before
      afterSha256 = $after
      byteExactRestore = $true
      green = $true
    })
    Write-Host "R36W_MUTATION_KILLED=$($mutation.Name) SHA256=$before"
  }
}
finally {
  Pop-Location
}

$results | ConvertTo-Json -Depth 4
Write-Host "R36W_MUTATIONS=PASS COUNT=$($results.Count) BYTE_EXACT_RESTORE=true"
