# Data Model: Provider Security Hardening R37G

No schema or migration changes are required.

Existing `ControlledProviderRun.leaseToken` becomes the mandatory fencing value for canonical-evidence mutation. Existing `workspaceId` and `grantId` are validated as an exact pair before creation. Existing canonical snapshot and fingerprint fields remain a required pair; recovery additionally recomputes the fingerprint from snapshot content.
