# R0b corrected local execution kit (G3 and separate G7 diagnostics)

The original `phase-checks/` inputs and the original G1 results remain immutable at CAMPAIGN_HEAD `afaedf8e719892503a38016a8c6add55791ddc81`, tree `e324f45808e259f7c93353c5deb8ffb2afab34c2`. This additive kit does not replace those phase contracts and cannot convert the original campaign G1/G7 into PASS. Commands here are fresh G3 corrections/retests and separately labelled G7 diagnostic repetitions, not retrospective G1 evidence or a replacement frozen contract.

## Final local build harness revision

After the first observed build refusals, root-build/routes receive a random ephemeral local authentication secret only in child-process memory. It is never a user/provider credential, never written to an environment file and redacted exactly from captured child output. Product authentication and production storage guards remain unchanged. Next compilation and type collection were observed; production page collection still refuses missing R2 configuration. No R2 settings, synthetic provider credentials, provider client or external storage were enabled to bypass that refusal. The R0b dependency manifest is rebound to these final helper bytes before FINAL_HEAD; the immutable original kit is not changed.

## Reproduced harness defects and bounded changes

1. Windows backslashes inside quoted NODE_OPTIONS preload paths were consumed by Node option parsing. New paths use forward slashes. A real child-process test proves preload, loopback exchange and non-loopback refusal.
2. PrismaDev's `get-port-please` probes listeners on wildcard and LAN addresses. Original DNS guard treated those binds as outbound targets. Recorded diagnostics `g3-r0b-db-diagnostic-1/2` identify the `lookupAndListen`/port-probe stack. The new guard clamps **every Node IP listener** to `127.0.0.1`; it does not authorize LAN binds or expand outbound permission. External fetch, socket and DNS operations remain denied. Five executable guard tests pass.
3. PrismaClient wraps raw CREATE DATABASE in a transaction; recorded SQL error `25001` rejected it. Database creation now uses installed `prisma db execute --stdin` against only the owned server's admin connection, with explicit host/port/database checks. All later migration/seed/test operations use the guarded unique disposable database. No downloads, existing DB reuse or customer data.
4. The current backlog has the exact state `CUT_BY_FOUNDER_DECISION`. Structural validation recognizes that state without treating it as DONE or changing the backlog.
5. The canonical queue validator still requires missing `planSha256` fields in source090. This kit does not weaken that validator or edit source090; its failure remains visible pending an authorized source correction.

## Observed R0b evidence

All runs have separate native stdout, stderr and command records under the parent's `evidence/commands/` recorder. Failed diagnostics and failed creation attempts are preserved.

- `g3-r0b-harness-selftest-1`: five passed, zero failed/skipped.
- `g3-r0b-db-diagnostic-3`: a uniquely named PrismaDev server started and closed, exit 0.
- `g3-r0b-migration-clean-3`: 68 migrations, 179 tables, exit 0. Migration chain SHA256 `f5cead7190cc2d0e3b920cf41d230d4105488da5c2849634bc633cdcc2e89a00`.
- `g3-r0b-db-upgrade-1`: reconstructed previous-chain snapshot plus newest migration and sentinel readback, exit 0.
- `g3-r0b-db-restart-1`: owned server closed, restarted against the same unique store, both synthetic records read through a fresh worker process, exit 0.
- `g3-r0b-db-seed-1`: explicit synthetic user/marker persisted and read back, exit 0.
- `g3-r0b-root-build-1`: exit 1 in 141.490 s. Typecheck, lint (warnings only), provider boundary (599 modules/0 violations) and store compliance passed. Release-package validation lacked `release-manifest-v3.json` during this run. Webpack correctly failed because the local-only guard refused Google Fonts downloads for Geist and Geist Mono. No compiled web build is claimed.
- `g3-r0b-mobile-build-1`: exit 1 in 185.887 s. Typecheck, lint and full iOS/Android/Web export passed; export produced 61 static web routes and both native-platform HBC bundles. Expo Doctor passed 18/20 checks; remote Expo config schema and React Native Directory metadata checks could not complete offline. Successful export does not mean complete Doctor validation or observed native-device behavior.

Engine label remains **PrismaDev/PGlite 0.25.2**, not native multiprocess PostgreSQL. Synthetic closed disk stores are retained and individually named in stdout; nothing was recursively deleted. The original README's scope limits remain: local simulator webhook, mobile outbox OUTCOME_UNKNOWN, anonymous real-HTTP smoke, no provider or Samsung observation. Full test thresholds and all test assertions are unchanged.

`commands.json` and `PHASE_CHECK_CONTRACTS.json` describe this additive kit for reproducibility; they are not the original campaign's frozen contracts. Only the parent may decide a new campaign freeze. `validate-kit.mjs` verifies their 29 command/parser hashes and helper dependencies.
