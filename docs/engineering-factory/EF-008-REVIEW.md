# EF-008 — Controlled Bake-off Review

**Status:** `V1 CATALOG TECHNICALLY COMPLETE — NO ADOPTION`. This is one
focused local case. It does not adopt a model, provider, gateway or coding
workflow.

## Frozen inputs

- Factory base before seed creation: `27e1ffdf802c595cd782ebf7c7df651f306c9556`
- Candidate execution start: `265063c2c8eea4b4cd6f7ad10f4d8197ec6d7a84`
- Candidate A branch: `devbench/ef008-codex`
- Candidate A final commit: `555706100cd135b0d7f7c85ce484b203d64b8816`
- Candidate B branch: `devbench/ef008-claude`
- Candidate B final commit: `83cabc44453ea04b639aeb989397d314cd8427c7`
- Challenge: `docs/engineering-factory/EF-008-FROZEN-CHALLENGE.md` in the
  frozen candidate seed.
- Scope: `src/lib/ai-work-engine/primitives/files.ts` only in both completed
  candidates.

## Independent reviewer checks

| Gate | Candidate A — Codex | Candidate B — Claude |
| --- | --- | --- |
| Candidate parent is the frozen seed | pass | pass |
| Allowed-file scope / lockfile / worktree | one allowed source file / unchanged / clean | one allowed source file / unchanged / clean |
| Seeded and expanded file suites | 68/68 pass | 68/68 pass |
| TypeScript | pass | pass |
| Lint | 0 errors; 2 pre-existing warnings | 0 errors; 2 pre-existing warnings |
| Full suite | 58 files / 1219 tests pass | 58 files / 1219 tests pass |
| `git diff --check` | pass | pass |
| Named mutation evidence | reported: `file-admission-bypass`, caught and byte-restored | reported: `file-admission-bypass`, caught and byte-restored |
| Mismatch rejected before `read()` | pass | pass |
| Final suffix is case-insensitive | pass | pass |
| Compound executable suffix is refused | pass | pass |
| Refusal omits client file name and bytes | pass | pass |

Both candidates insert the admission decision in `readAcceptedFile` before
`file.read()`. Both accept only the expected case-insensitive final suffix,
reject `report.csv.exe`, preserve valid bounded ingestion and keep the client
file name and bytes out of the refusal. Under the frozen oracle their runtime
behavior is equivalent.

Candidate A is materially smaller: it accepts a typed raw extension
(`"csv" | "xlsx"`) from each caller and tests the lowercased file name with
`endsWith`. That is sufficient for the current two private call sites and all
frozen cases. However, the type system permits a future caller to wire
`runIngestCsv` to `"xlsx"` or `runIngestXlsx` to `"csv"`; the incorrect pair
would compile because the primitive identity and its allowed suffix are two
separate facts at the call site.

Candidate B passes the primitive identity to the gate and derives the allowed
suffix from one typed table. A future caller cannot choose an extension
independently from that identity. Its `finalSuffixOf` helper also states the
final-suffix rule directly rather than relying on the equivalent `endsWith`
property. This is a small but real maintenance advantage at a security
boundary. Candidate B's 72-line diff is nevertheless disproportionate: most
of the additional lines are explanatory comments, not stronger executable
behavior. If this candidate is later adopted, those comments should be edited
down without changing the table-driven invariant.

## Decision

**Technical winner for EF-008: Candidate B (Claude), narrowly.** Both
candidates are behaviorally correct under the frozen oracle. Candidate B wins
because the primitive-to-suffix relationship is centralized and typed, which
removes a future caller mis-wiring state that Candidate A still allows to
compile. This is not a claim that its larger patch is generally preferable;
the benefit is limited to that specific coupling invariant.

This remains deliberately limited:

- neither run supplies a supported elapsed-time or cost measurement, so no
  speed or cost ranking exists;
- one file-admission case cannot establish general coding quality, provider
  quality, gateway readiness or operational reliability;
- the winning commit remains a local candidate, not an adopted product change;
- EF-008 completes the eight frozen DevBench v1 families, but completing the
  catalog is not the same as completing an adoption decision.

## Local-only statement

No candidate was merged. No push, Preview, Production action, provider call,
database operation, credential access or protected product-worktree
modification occurred during this review.
