# R37I RED evidence

Security scan `47af2451-032d-44b0-8dbf-42b1af1efae7`, finding `csf_07a831cefdcb51ae08bfbb9e`, reported one medium-severity expired-lease weakness with high confidence.

The deterministic PostgreSQL mutation advanced the trusted clock 1,001 ms across a 1,000 ms lease while retaining the original token. Before remediation, ENDVERA returned `SUCCEEDED`, persisted canonical evidence and settled the attempt. The required result is a failed disposition, null canonical evidence and exact reservation release.

Focused RED: 1 failed, 4 skipped. No provider, network or external write was used.
