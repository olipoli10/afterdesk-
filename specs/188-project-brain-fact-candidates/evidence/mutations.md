# R36W Proportional Mutation Evidence

**State**: `COMPLETE`

All 14 required local mutations were observed RED through their smallest relevant guard, restored byte-exactly, and rerun GREEN. The reusable runner is `scripts/validate-r36w-mutations.ps1`.

| Mutation | Target | Guard | SHA-256 before and after restore |
|---|---|---|---|
| `unregistered-adapter-is-accepted` | fact-candidate contract | closed-registry source guard | `6ba4cb729a527b59f020c09296831d8bcb5150bc65ae7e3637b2345c586b2ab5` |
| `owner-text-is-semantically-split-or-inferred` | fact-candidate contract | exact owner-copy behavior | `6ba4cb729a527b59f020c09296831d8bcb5150bc65ae7e3637b2345c586b2ab5` |
| `text-range-no-longer-reconstructs-value` | fact-candidate contract | Unicode UTF-16 reconstruction | `6ba4cb729a527b59f020c09296831d8bcb5150bc65ae7e3637b2345c586b2ab5` |
| `source-metadata-comes-from-request` | fact-candidate contract | canonical metadata equality | `6ba4cb729a527b59f020c09296831d8bcb5150bc65ae7e3637b2345c586b2ab5` |
| `metadata-is-promoted-to-job-fact` | fact-candidate contract | metadata-kind schema | `6ba4cb729a527b59f020c09296831d8bcb5150bc65ae7e3637b2345c586b2ab5` |
| `binary-object-is-opened` | fact-candidate service | binary-storage sentinel | `4dcfa95ae28bb1a9e0967b0514831ad9280e94057a16cc52a4b64a3634132265` |
| `provider-or-network-path-is-reachable` | fact-candidate service | provider/network sentinel | `4dcfa95ae28bb1a9e0967b0514831ad9280e94057a16cc52a4b64a3634132265` |
| `candidate-is-automatically-confirmed` | fact-candidate contract | unconfirmed-status schema | `6ba4cb729a527b59f020c09296831d8bcb5150bc65ae7e3637b2345c586b2ab5` |
| `confidence-becomes-probability` | fact-candidate contract | strict non-probabilistic schema | `6ba4cb729a527b59f020c09296831d8bcb5150bc65ae7e3637b2345c586b2ab5` |
| `replay-creates-second-candidate-set` | fact-candidate service | equivalent-batch convergence guard | `4dcfa95ae28bb1a9e0967b0514831ad9280e94057a16cc52a4b64a3634132265` |
| `command-id-body-drift-is-accepted` | fact-candidate service | command-hash binding guard | `4dcfa95ae28bb1a9e0967b0514831ad9280e94057a16cc52a4b64a3634132265` |
| `cross-workspace-source-or-batch-is-visible` | fact-candidate service | read-side tenant predicate | `4dcfa95ae28bb1a9e0967b0514831ad9280e94057a16cc52a4b64a3634132265` |
| `partial-batch-commits-after-failure` | fact-candidate service | candidate-before-receipt atomic ordering | `4dcfa95ae28bb1a9e0967b0514831ad9280e94057a16cc52a4b64a3634132265` |
| `candidate-history-can-be-updated-deleted-or-truncated` | R36W forward migration | six append-only trigger signatures | `1dc6f2261f3fa3e5a352cfb0db917edc75c82763f64356444246121a31045653` |

Every RED run exited `1`; every post-restore rerun exited `0`. The runner also compares the SHA-256 of the original byte array with the restored file before permitting the next mutation.

No mutation configured or called a provider, credential, customer datum, external transport, external write, deployment, store action, Preview, Production, or push. External effect count: `0`.
