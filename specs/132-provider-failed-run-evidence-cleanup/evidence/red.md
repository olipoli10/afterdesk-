# R37J RED

Command: focused disposable-PostgreSQL run of both `clears canonical evidence` cases in the R37G security-hardening integration test.

Result before remediation: 2 failed, 5 skipped.

- Expiry after the R37F provider write returned `FAILED` and released spend, but `canonicalEvidenceSnapshot` remained populated.
- A one-shot trusted terminal-clock failure after the R37F provider write returned `FAILED` and released spend, but `canonicalEvidenceSnapshot` remained populated.

The failures are non-vacuous and reproduce security finding `csf_3bf4140f108a33c61429caab` without provider access or external transport.
