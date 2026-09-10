# UTC-naive storage and absolute deadlines — bounded repair

2026-09-10. The first native runs apply every migration and prove distinct
simultaneous PostgreSQL17.11 backends, but Google7/11 and outbox3/10 pass only.
Historical PGlite passes are not overwritten. Native default TimeZone is
America/New_York; the product's Prisma DateTime columns are timestamp(3) without
time zone and use UTC-naive storage. Mixed comparisons with timestamptz use the
session zone. A transaction-local UTC/New_York diagnostic also found that an
unannotated raw Prisma Date parameter is not safe to assume timestamp-naive.

## Repair, not a test-environment workaround

1. Keep the current schema types and exact one-use claims. Normalize each raw
   instant parameter targeting/comparing a timestamp(3) column with
   `($n::timestamptz AT TIME ZONE 'UTC')`. Normalize real SQL clocks to UTC-naive
   only when writing/comparing naive columns. Do not alter genuine instant-return
   queries or JSON timestamps which already carry an offset.
2. Add one forward migration for affected personal-operation/model/confirmation
   defaults and confirmation trigger functions. Never edit an applied migration,
   weaken source/hash/owner/lease checks or shift historical rows automatically.
   Existing persisted timestamps may have mixed provenance; this repair does not
   certify or rewrite them. Remote migration remains unperformed.
3. Separate ownership: controller handles SMS/outbox/recovery/queue; native lane
   handles Google action and model-operation raw SQL; gateway lane handles
   confirmation modules, forward migration and default inventory. Every critical
   diff receives another agent's review. Mobile dictation work remains independent.
4. Preserve the four Google and seven outbox baseline failures. Re-run unchanged
   behavioral assertions under native default non-UTC time, plus explicit UTC,
   negative and positive-zone diagnostic cases. Verify round-trip instants,
   expired/future deadlines, single transport winner, revocation, uncertain holds,
   source/JSON provenance and confirmation state transitions.
5. Run root/type/boundary tests and the full native SQL suite when source and
   migration agree. Retain failed outputs and prove each owned cluster stops.

No provider, real SMS/call, OAuth consent, new budget, remote data rewrite or
deployment is authorized by this local repair. No readiness metric changes.
