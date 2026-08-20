# Model Gateway v1 — Preflight Evidence

Recorded: 2026-08-19 (America/Toronto)

## Working tree

- Worktree: `C:\dev\nightlexicon-model-gateway`
- Branch: `codex/model-gateway-v1`
- Starting HEAD: `4036d62fc5e56367df8e37cd5cee1d3c550d1cad`
- Starting status: clean
- Base lineage: HumanWorkUnit release-candidate commit `d7f0a394c14259518df3184a3f93fc14293a1427`
- `package-lock.json` SHA-256: `0B01B24159591440E08F8F78FAF3C6E17EF5CE293304B773651F69EC7F60A7CD`
- Dependency setup: ignored `node_modules` junction to the already-installed HumanWorkUnit dependency tree; no install command and no lockfile write.

## Protected fingerprints

| Repository | Branch | HEAD | Observed status |
|---|---|---|---|
| `C:\dev\nightlexicon` | `commercial-readiness-v2` | `0bb3a365951485615537e38533b48b391557e691` | Pre-existing untracked planning/assets only; untouched |
| `C:\dev\nightlexicon-humanworkunit` | `feat/human-workunit-resume` | `d7f0a394c14259518df3184a3f93fc14293a1427` | Only pre-existing untracked `.agents/`; untouched |
| `C:\dev\afterdesk-project-brain` | `main` | `62fba25c5ae3aea140a94de28d3887034733453f` | Clean at preflight |
| `C:\dev\nightlexicon-publicsite-endvera` | `codex/endvera-living-vein` | `fb3b02d0fe65c49bcac1e10f238c223b167177b5` | Preserved; no Model Gateway writes |

## Disposable PostgreSQL authority

- Named local instance: `hwu-integration`
- Status at preflight: running
- TCP host/port: `127.0.0.1:51214`
- Explicit disposable database name: `afterdesk_integration`
- Destructive-test opt-in used only for integration commands: `ALLOW_INTEGRATION_DB_RESET=1`
- The integration guard additionally performs its physical isolation probe before any schema rebuild.
- No shared, Preview or Production database is authorized.

## Scope controls

- Implementation window: T001–T020 only.
- No provider candidate adoption, provider traffic, rollout enablement, Preview, Production or push.
- No `prisma db push`, no package installation, and no writes to protected worktrees.
