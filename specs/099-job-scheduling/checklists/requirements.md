# Requirements quality checklist

- [x] Product outcome is independent of one UI.
- [x] Canonical state is PostgreSQL, not a model transcript.
- [x] Workspace and role boundaries are explicit.
- [x] Replay, changed-body collision and stale-version behavior are explicit.
- [x] Conflicts are inspected before schedule commitment.
- [x] Dependency cycles and downstream impact are specified.
- [x] Field financial-redaction boundary is explicit.
- [x] Provider, external transport and external write remain prohibited.
- [x] Completion requires both deterministic and database-backed proof.
