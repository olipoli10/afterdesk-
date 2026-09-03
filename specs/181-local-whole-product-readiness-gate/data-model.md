# Data Model

`WholeProductReadiness` contains a schema version, verdict, per-platform local evidence, backend boundary evidence, hash-bound inputs, resolved local items, remaining external blockers, project continuation state and immutable external-effect flags.

`ProtectedInput` contains repository-relative path and lowercase SHA-256.

`ExternalBlocker` contains a stable code, affected targets, owner class and required observed evidence.

