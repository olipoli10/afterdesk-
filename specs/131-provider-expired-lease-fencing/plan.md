# R37I implementation plan

1. Add a deterministic PostgreSQL RED that advances the trusted clock beyond lease expiry while the adapter retains its token.
2. Add fresh phase-time reads around the asynchronous callback.
3. Fence R37F canonical evidence and R37C evidence transitions by exact token plus unexpired lease.
4. Release the exact reservation on expiry and preserve null canonical evidence.
5. Run targeted, R37 regression, root, typecheck, lint and diff gates.
6. Record the security scan identity and close the queue locally.
