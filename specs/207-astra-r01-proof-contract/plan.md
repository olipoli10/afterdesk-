# ENDVERA Astra R0.1 — local proof-contract repair

## Goal and scope

Repair the local evidence lifecycle, then freeze and run a fresh, bounded local
validation. This is not another provider, device, founder or full G0–G7 campaign.
Spec206 remains LOCAL_REVALIDATION_BLOCKED — UNSEALED. Its commands, failed
attempts, reports and verdict are immutable historical evidence, never regraded.

Source: 7e767929390de48167865c01d1a848e6fccbf7b4, tree
ae6edec55c30cb8e470e0c83c39dee8cbc7d9a7d. Brain start:
d96866623558ede5ac5f25274e636db12bd8e79b, tree
47fdc13b664f053256ac5a2c5f1ac1b1f55e7ba6. Both verified clean.
Writable product checkout: C:/dev/endvera-astra-r01, branch codex/endvera-astra-r01.
Only specs/207-astra-r01-proof-contract and its generated evidence may change.
The canonical Brain may receive a local validated checkpoint. Product code,
lockfiles, old specs and the two source checkouts remain unchanged.

## Execution order

1. Specify and implement a versioned local evidence contract, recorder and
   validator. Preserve every old command via the immutable Git source anchor.
   Separate historical failures from current observations; do not silently
   convert either into a green product verdict.
2. Adversarial tests and distinct source review: tampered bytes, missing attempts,
   changed commands, wrong HEAD, truncated journals, incomplete output, false
   success, retries, secret-shaped output, unavailable checks and changed kit.
   Fix reproducible contract defects before the new freeze.
3. Commit the entire kit, identity, exact command descriptors, result parsers and
   tests. Run fresh protocol, root/mobile unit suites, static provider-boundary
   and metric checks. Capture raw streams and native exits; redact by withholding
   unsafe streams with an incident, not by pretending altered bytes are raw.
4. Freeze the evidence archive in a separate commit. Derive a local seal from
   that explicit immutable anchor, validate it, drain the bounded queue and
   checkpoint the Brain. No product-level PASS or model adoption claim.

## Contract semantics

- The frozen check list cannot be shrunk after results arrive. Revisions require
  a different campaign identity and freeze, not a new parser for an old result.
- Each attempt is enrolled before launch in an append-only journal. Every attempt
  directory and enrollment must correspond exactly; crashes and missing output
  remain INCOMPLETE. Completed runs retain both raw streams and their hashes.
- At closure the journal and all evidence files are bound to an explicit evidence
  Git commit. Validation compares the complete committed and on-disk sets. This
  detects omission relative to that anchor; Git is local provenance, not an
  independent execution witness or cryptographic actor attestation.
- Current selection is deterministic: latest enrolled attempt for each check at
  the frozen tested HEAD. A later failure cannot be hidden by selecting an earlier
  pass. Historical failure counts are reported separately, never reset.
- Command arguments, cwd, parser and timeout come only from the committed kit.
  Native exit zero alone is insufficient. Parsers require meaningful output.
- Token-bounded secret detection still scans all raw text, including digest
  fields. No blanket hash-field, test-folder or historical-report exception.
  A private-key header alone is reported as a marker; header plus body is denied.
  This scanner is pattern coverage, not a guarantee of no possible secret.
- A sealed REWORK/INCOMPLETE is valid evidence. A valid seal is not a green product.
- Product status remains LOCAL_REVALIDATION_REWORK while known web storage,
  native device, runtime candidate, and external metadata gates are unresolved.
  Historical build facts remain explicitly historical, not freshly executed.
- New local checks cannot award roadmap, build readiness, C2, real-test readiness
  or Verified-E2E credit. Recalculate the existing canonical rubric unchanged.

## Authority and exclusions

Local files, synthetic tests, normal Codex audit quota, local Git and Brain only.
No provider API, credentials, personal/customer/prospect data, SMS/calls/email,
OAuth, spending, push, deployment, Preview, Production or store operations.
No timer and no founder test. The latest explicit user scope overrides historical
Brain instructions to restart a heartbeat or keep building unrelated releases.
Do not create a second gateway or weaken action authorization.

## Size and stop criteria

Bounded repair, estimated 1–3 hours; INSUFFICIENT SUBSTANCE FOR OVERNIGHT.
Reference: spec206 showed that repeating hundreds of harness checks does not
resolve a contradictory proof contract. Target causal defects, then one fresh
unit-suite pass per surface, no repeated builds for unchanged build inputs.
Finish when this scope is verified and documented, or no useful authorized work
remains. A freeze defect leaves that run recorded and requires a new identity.
No routine GO between chapters. No project-complete claim.

## Deterministic acceptance

`node --test specs/207-astra-r01-proof-contract/protocol.test.mjs`

`node specs/207-astra-r01-proof-contract/campaign.mjs validate <evidence-commit>`

Both must pass, and the returned seal verdict must reflect all current results,
incidents and unresolved product gates. Review and exact commits belong in the
final report. Missing external observations remain blockers, not synthetic PASS.
