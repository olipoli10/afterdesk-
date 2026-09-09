# R0.1 source review dispositions

Requested audit model: gpt-6-astra, high; requested correction-review model:
gpt-5.6-sol, high. These are task dispatch selections, not served-model API
attestations or a model-quality benchmark. Neither review contacted a provider
on behalf of the product. No claim that model diversity proves correctness.

## Confirmed historical defects

Astra read-only audit confirmed the old maximum-four report conflict, invalid
incomplete stdout handling, mixing historical/current errors and tested HEADs,
unbounded token matching, no independently anchored exhaustive inventory and
lexical-only artifact path confinement. Old code and evidence remain unchanged.

## New implementation — Sol findings and corrections

1. Lifecycle metadata exclusions inconsistent: evidence anchor now permits only
   the two named mutable lifecycle files; source and contract remain pinned.
   Real Git test covers metadata-only archive closure.
2. Journal truncated in place: enrollment intent and result files are exclusive
   writes with fsync. Journal replacement writes a separate exclusive .next file,
   fsyncs it, then renames. Failed replacement preserves prior ledger and exposes
   orphan intent; real filesystem test proves refusal rather than silent loss.
3. Vitest summary could contradict assertions: reject failed/unknown suite or
   assertion statuses, require actual passed assertion count.
4. TAP could contain contradictory summaries: require exactly one complete summary,
   zero failed/cancelled, matching top-level test count; no duplicate first-match.
5. Secret detector omitted labeled access keys and UTF16: add named-secret coverage
   and withhold NUL/non-UTF8 output. Never emit the matched value. Key-header-only
   markers are not key material; a body remains blocked. No test-folder exemption.
6. mkdir occurred before junction check: validate/create each parent sequentially;
   real junction test proves no outside attempt directory was created.
7. Dependencies unbound: hash Node executable and both installed dependency trees
   before/after attempts. Explicit generated-cache exclusion remains a limitation,
   not a claim of hostile-host protection. Dependency drift test refuses launch.
8. Filesystem tests omitted from frozen command: both test files are included,
   with a floor of 51 cases (42 pure, nine real filesystem/Git cases).
9. Post-command source check happened after completed record: source change now
   records SOURCE_CHANGED before any success record, withholding streams. A real
   mutation/restore test proves restoring source cannot erase the incident.

Parent additionally found overly narrow path syntax incompatible with Next dynamic
routes. Safe paths now allow brackets/parentheses/spaces while denying traversal,
control characters, ADS, Windows device aliases and trailing-dot/space aliases.
All 4546 existing tracked source paths were checked successfully.

Combined pre-freeze tests: 51 passed, zero failed. The first failed development
test remains described in development.md. Final source review is pending; freeze
must wait for its disposition. Historical provider, device and build gates remain
unresolved regardless of this contract's test result.
