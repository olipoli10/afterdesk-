# Quickstart: Secretary broadcast preparation

1. Run pure parser/fingerprint tests.
2. Start one disposable PostgreSQL database and apply migrations.
3. Seed synthetic owner, field worker and 11 synthetic eligible contacts.
4. Exercise exact 2, 10, duplicate, 11, missing, ambiguous, replay and altered-replay commands.
5. Restart the server-side projection and compare fingerprints.
6. Confirm field-worker redaction and zero provider/SMS effects.
