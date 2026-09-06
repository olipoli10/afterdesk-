# Plan: Secretary broadcast exact approval

1. Add nullable exact-approval fields through one additive migration.
2. Define strict command and unsent-result contracts.
3. Lock one workspace-bound draft and compare exact version plus payload hash.
4. Persist approval and audit atomically; reconstruct only identical replay.
5. Expose the transition through the authenticated broadcast endpoint.
6. Prove manager authority, second-approval refusal and zero transport in disposable PostgreSQL.
