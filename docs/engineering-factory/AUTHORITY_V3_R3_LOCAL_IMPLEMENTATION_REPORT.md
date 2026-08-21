# Authority V3 R3 — local implementation report

Status: **LOCAL STATIC ADMISSION ONLY**

Execution authority: **false**

Provider calls: **0**
Real candidate invocations: **0**

## Scope delivered

This implementation turns the closed R3 design bundle into executable,
fail-closed local admission checks without authorizing or launching a candidate.

- I1: duplicate-key rejection, BOM rejection, JSON parse, exact R3 schema
  identity, closed-object and typed-array checks, and complete local `$ref`
  resolution.
- I2: exact registry checks for 18 roles, 24 gates, six phases, four TPM NV
  public profiles, 11 crash boundaries, 39 mutations, and 52 semantic errors.
- I2 role separation: all declared roles require distinct OS identities,
  identities, keys, binaries, configurations, and launchers; each gate's
  producer and acceptor remain independently bound.
- I2 evidence semantics: a mutation result must match the immutable D0
  mutation/gate/error tuple and name exactly one failed gate.
- I2 recovery semantics: restart classification requires the exact durable
  disk, TPM, publication, and boundary tuple. A mixed or unknown tuple is
  refused.
- I2 terminal semantics: the terminal transition is unique; D4 and P5 share
  one publication key and are created or returned idempotently.
- I2 phase semantics: a schema-valid P0-P5 transition is accepted only when its
  predecessor, producer, signer, acceptor, states, inputs, attestations, output
  schema, and next phase equal the frozen D0 contract.
- I2 TPM semantics: a future `ReadPublic` result must equal the complete
  pre-authorized public-area profile; matching an NV index alone is refused.

The implementation is exposed through:

```text
npm run devbench:authority-v3:r3:validate
```

Its successful report still states `executionAuthorized:false`,
`providerCalls:0`, and `realCandidateInvocations:0`.

## RED and mutation evidence

The new test suite was first observed RED because the R3 admission module did
not exist. The recovery and terminal-publication tests were also observed RED
before their functions existed.

Eight named mutations were then observed failing by their exact test names:

1. `r3-design-authority-bypass`
2. `r3-gate-acceptor-collapse`
3. `r3-orphan-prepared-unanchored`
4. `r3-mutation-gate-drift`
5. `r3-ledger-recovery-boundary-only`
6. `r3-terminal-transition-duplicate`
7. `r3-phase-signer-not-bound`
8. `r3-tpm-index-only-admission`

Each source mutation was restored byte-exactly before the pristine rerun. The
final source SHA-256 after the last two restorations was:

```text
866C9EC9747CF0410630A01FE992C389DE07750FF5E9D97C8A7456A438978C32
```

## Pristine validation

- R3 targeted tests: 14/14 PASS.
- Adjacent Engineering Factory gates: 8 files, 53/53 PASS.
- Full repository suite: 74 files PASS, one skipped; 1,307 tests PASS, one
  skipped.
- TypeScript: PASS.
- ESLint: zero errors; two pre-existing warnings in `bakeoff.ts`.
- `git diff --check`: PASS.
- Lockfile: unchanged.

## Explicitly not claimed

This is not I3-I8 completion. It does not create or attest real OS identities,
keys, TPM state, SQLite durability, firewall state, observer provenance,
packet capture, cleanup, independent review, or publication. Those require a
separately authorized controlled environment and independent evidence.

No WSL, firewall, TPM, provider, credential, candidate, Preview, Production,
or shared database action occurred.
