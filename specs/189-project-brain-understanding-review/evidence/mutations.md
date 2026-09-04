# R36X Proportional Mutation Evidence

**State**: `COMPLETE`

All 18 required local mutations were observed RED through their smallest relevant guard, restored byte-exactly, and rerun GREEN. The reusable runner is `scripts/validate-r36x-mutations.ps1`.

| Mutation | Target | Guard | SHA-256 before and after restore |
|---|---|---|---|
| `field-worker-can-read-or-decide` | review service | owner/admin authorization allowlist | `f7c56755246072c4301a348ad1aabfcffcfd60e99d8b68eb55844cb162c749ca` |
| `cross-workspace-candidate-enters-review` | R36X migration | reciprocal review/batch candidate guard | `058d01fe505ff5a60629017c2c4246192301049f3aa495aa4912e73d3844e936` |
| `contradiction-member-is-overwritten-or-deleted` | R36X migration | append-only member trigger | `058d01fe505ff5a60629017c2c4246192301049f3aa495aa4912e73d3844e936` |
| `resolution-removes-original-conflict` | R36X migration | append-only resolution trigger | `058d01fe505ff5a60629017c2c4246192301049f3aa495aa4912e73d3844e936` |
| `automatic-resolution-is-accepted` | review contract | strict explicit resolution union | `135eae6a0b06584414dcb4245343fd7ca691e9f7e0a0c5dc9459f4086d461330` |
| `resolution-selects-non-member` | review contract | contradiction membership validation | `135eae6a0b06584414dcb4245343fd7ca691e9f7e0a0c5dc9459f4086d461330` |
| `resolution-and-disposition-disagree` | review service | canonical resolution/disposition matrix | `f7c56755246072c4301a348ad1aabfcffcfd60e99d8b68eb55844cb162c749ca` |
| `multi-group-derived-outcomes-conflict` | review service | derived-outcome agreement guard | `f7c56755246072c4301a348ad1aabfcffcfd60e99d8b68eb55844cb162c749ca` |
| `candidate-without-disposition-is-omitted` | review service | complete candidate coverage gate | `f7c56755246072c4301a348ad1aabfcffcfd60e99d8b68eb55844cb162c749ca` |
| `unresolved-contradiction-can-seal` | review service | current-resolution completeness gate | `f7c56755246072c4301a348ad1aabfcffcfd60e99d8b68eb55844cb162c749ca` |
| `stale-fingerprint-can-confirm` | review service | exact fingerprint comparison | `f7c56755246072c4301a348ad1aabfcffcfd60e99d8b68eb55844cb162c749ca` |
| `canonical-hash-does-not-cover-complete-review` | review contract | complete ordered candidate snapshot | `135eae6a0b06584414dcb4245343fd7ca691e9f7e0a0c5dc9459f4086d461330` |
| `replay-creates-second-effect` | review service | exact command receipt replay branch | `f7c56755246072c4301a348ad1aabfcffcfd60e99d8b68eb55844cb162c749ca` |
| `command-id-body-drift-is-accepted` | review service | command/body hash binding | `f7c56755246072c4301a348ad1aabfcffcfd60e99d8b68eb55844cb162c749ca` |
| `partial-transaction-commits` | review service | review plus decision atomic transaction | `f7c56755246072c4301a348ad1aabfcffcfd60e99d8b68eb55844cb162c749ca` |
| `binary-or-provider-path-is-reachable` | review service | server-only provider/network sentinel | `f7c56755246072c4301a348ad1aabfcffcfd60e99d8b68eb55844cb162c749ca` |
| `confirmed-history-can-update-delete-or-truncate` | R36X migration | immutable snapshot trigger | `058d01fe505ff5a60629017c2c4246192301049f3aa495aa4912e73d3844e936` |
| `confirmation-sequence-is-duplicated-or-current-order-drifts` | R36X migration | unique project sequence index | `058d01fe505ff5a60629017c2c4246192301049f3aa495aa4912e73d3844e936` |

Every post-restore rerun exited `0`. The runner compares original and restored SHA-256 before advancing. No provider, credential, customer datum, external transport/write, deployment, store action, Preview, Production or push was used.
