# R12 closeout — native prepared-action control

Status: `DONE`

The native Actions surface now renders the canonical prepared-action payload
before any decision: recipient, channel, body, version, fingerprint and
provenance. Only authorized owner/office sessions receive decision controls;
field workers remain redacted and cannot approve, reject or revoke.

Approve, reject and revoke bind the exact action version and fingerprint. A
stable command ID is retained when an outcome is unknown, so a retry replays
the same decision instead of creating another transition. Every successful
decision refreshes the canonical cockpit. Approval remains
`APPROVED_UNSENT`; no native or server path dispatches a message.

Validation on the final R12 source:

- mobile unit suite: 3 files, 16 tests passed;
- disposable PostgreSQL: combined R10-R12, 3 files, 5 tests passed;
- native exact-approval retry proof: one canonical approval and zero simulated deliveries;
- Expo Doctor: 21/21 checks passed;
- mobile ESLint: passed;
- mobile and root TypeScript: passed;
- local Expo export: iOS, Android and web bundles produced with a synthetic HTTPS API origin;
- the first export without an API origin failed closed with `MOBILE_API_URL_REQUIRED`;
- no schema, migration, dependency or lockfile change;
- no provider, credential, external transport, customer data, push, store,
  Preview, Production or external write.
