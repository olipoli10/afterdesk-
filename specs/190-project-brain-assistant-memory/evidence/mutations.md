# R36Y Proportional Mutation Evidence

**State**: `COMPLETE`

All 16 required local mutations were observed RED through their smallest relevant guard, restored byte-exactly, and rerun GREEN. The reusable runner is `scripts/validate-r36y-mutations.ps1`.

| Mutation | Guarded surface | SHA-256 before and after restore |
|---|---|---|
| `newer-draft-eclipses-confirmed-memory` | confirmed-only current-pointer query | `19ed0e6d8e5b97b55f946d3ec71f06cad5c1d9e374f4132b6b76ae816ad012c4` |
| `unconfirmed-candidate-is-returned-as-truth` | accepted-reviewed candidate filter | `26bd8c27f8ff86917dad9f804264abe686b07aae83a35c1baaaedea852095a05` |
| `unresolved-contradiction-is-hidden-or-resolved` | exact resolution completeness | `19ed0e6d8e5b97b55f946d3ec71f06cad5c1d9e374f4132b6b76ae816ad012c4` |
| `citation-chain-is-optional-or-mismatched` | deferred citation provenance trigger | `7c25ae88404b60ef3476201e7e2a681fa6f25a88caa5bfc3897c78ae6418f6fc` |
| `source-metadata-becomes-job-fact` | source-inventory-only projection | `26bd8c27f8ff86917dad9f804264abe686b07aae83a35c1baaaedea852095a05` |
| `unsupported-question-invents-answer` | closed eight-question registry | `26bd8c27f8ff86917dad9f804264abe686b07aae83a35c1baaaedea852095a05` |
| `unsupported-action-family-is-prepared` | closed four-family registry | `26bd8c27f8ff86917dad9f804264abe686b07aae83a35c1baaaedea852095a05` |
| `recipient-channel-or-body-is-hidden` | mobile frozen-payload visibility | `3d9b129051f876429144ba3eaeae2ee9460104499d7798b7c5c7f78784cfb695` |
| `preparation-approves-or-delivers` | prepared-unsent approval boundary | `19ed0e6d8e5b97b55f946d3ec71f06cad5c1d9e374f4132b6b76ae816ad012c4` |
| `stale-memory-hash-is-accepted` | expected canonical-hash comparison | `19ed0e6d8e5b97b55f946d3ec71f06cad5c1d9e374f4132b6b76ae816ad012c4` |
| `stale-memory-sequence-is-accepted-or-current-pointer-is-ambiguous` | expected confirmed-sequence comparison | `19ed0e6d8e5b97b55f946d3ec71f06cad5c1d9e374f4132b6b76ae816ad012c4` |
| `replay-duplicates-action-or-receipt` | replay early-return branch | `19ed0e6d8e5b97b55f946d3ec71f06cad5c1d9e374f4132b6b76ae816ad012c4` |
| `command-id-body-drift-is-accepted` | command/body hash binding | `19ed0e6d8e5b97b55f946d3ec71f06cad5c1d9e374f4132b6b76ae816ad012c4` |
| `cross-workspace-memory-contact-or-action-is-visible` | workspace/project/contact binding | `19ed0e6d8e5b97b55f946d3ec71f06cad5c1d9e374f4132b6b76ae816ad012c4` |
| `binary-provider-or-network-path-is-reachable` | server provider/network sentinel | `19ed0e6d8e5b97b55f946d3ec71f06cad5c1d9e374f4132b6b76ae816ad012c4` |
| `history-can-update-delete-or-truncate` | immutable receipt trigger | `7c25ae88404b60ef3476201e7e2a681fa6f25a88caa5bfc3897c78ae6418f6fc` |

Every post-restore rerun exited `0`. The runner compares original and restored SHA-256 before advancing. The disposable PostgreSQL integration separately exercised update, delete and truncate refusal, exact replay, concurrent duplicate serialization, restart equality and zero delivery. No provider, credential, customer datum, external transport/write, deployment, store action, Preview, Production or push was used.
