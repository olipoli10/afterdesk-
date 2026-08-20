# Candidate Execution Boundary v1 — local evidence gate only

This gate closes the gap between a rehearsed frozen worktree and an actual
candidate process. It does not launch Codex, Claude, a provider, a shell
command, a network client or a benchmark slot.

## Why the gate exists

The V2 dry-run schedule declares `networkAccess: "none"`, while a real model
CLI needs authenticated provider egress. The worktree rehearsal proves Git
seed, cleanliness, packet identity and cleanup, but it cannot prove that model
egress is isolated from repository secrets or that the provider data boundary
has been independently accepted.

An approved schedule is therefore not executable evidence. Candidate execution
remains fail-closed until a separate local authority file binds the exact plan
to independently reviewed controls.

## What the authority binds

The ignored local authority file contains metadata only:

- the SHA-256 fingerprint of the exact 32-slot V2 plan;
- one exact candidate declaration per frozen candidate;
- SHA-256 fingerprints of each externally controlled executable and wrapper;
- opaque references to reviewed network-policy evidence, provider-data-boundary
  evidence and an independent approval;
- fixed boundaries: detached frozen worktree, frozen DevBench input only,
  environment-variable names only, and privacy-checked measured-run evidence
  only.

It recursively rejects fields that could carry prompts, outputs, content,
credentials, tokens, commands, executable paths or endpoints. Evidence
references are identifiers, not evidence bodies and never secrets.

## Local workflow

The existing ignored dry-run manifest must already be `APPROVED`.

```powershell
npm run devbench:execution:template
```

This creates a DRAFT, create-only authority file under:

```text
.scratch/engineering-factory/candidate-execution-authority/candidate-execution-authority.json
```

An independent reviewer must verify the actual external controls, replace the
placeholders with opaque evidence references and exact SHA-256 fingerprints,
then change `status` to `APPROVED`. The preflight is read-only:

```powershell
npm run devbench:execution:preflight
```

Its only successful status is `EXECUTION_REVIEW_READY`. That means the
metadata is internally consistent and admitted to external review. It is not
proof that an operating-system network policy exists, not provider approval,
not a provider call and not an adoption decision.

## Deliberate non-capabilities

- No process launcher is imported by the module or either command.
- No command line, executable path, endpoint, credential or environment value
  can enter the authority file.
- No provider receives the challenge, repository, prompt or output.
- No candidate output is captured by this gate.
- No trial slot is started and no ranking is produced.
- No Preview, Production, rollout, merge or model selection is authorized.

The future external runner remains a separately reviewed component. It may
consume a successful report only after the referenced evidence is independently
validated outside this schema.
