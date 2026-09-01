# Plan

1. Reuse R3 connector accounts, grants and operations for SMS and voice.
2. Add strict provider-neutral event, management, approval and dispatch-plan
   contracts.
3. Bind opaque local identities and admit SMS/voice events into the shared R2
   command engine.
4. Split exact approval from dispatch preparation and expose authenticated APIs.
5. Prove replay, concurrency, permissions, consent, privacy and zero transport
   with pure and disposable-PostgreSQL tests.
