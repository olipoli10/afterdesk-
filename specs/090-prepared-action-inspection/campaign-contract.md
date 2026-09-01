# ENDVERA Autonomous Continuation Campaign R10–R12

## Terminal condition

The campaign is complete only when all three queue entries are `DONE`, every
entry has exact output HEAD/TREE and durable evidence, the continuation validator
returns `VERDICT=DRAINED`, the product and Brain are tracked clean, and the
thread watchdog has been paused or removed.

Completing one feature, commit, checkpoint or validation pass is not a terminal
condition. While the queue returns `VERDICT=CONTINUATION_REQUIRED`, progress is
informational and the next dependency-ready entry begins without founder input.

## Authority

Local source, tests, disposable PostgreSQL, local Expo/Next builds and local Git
commits only. No provider, credential, customer/prospect data, external
transport, external write, real SMS/call/email/calendar/payment, push, Preview,
Production, deployment, EAS or app-store action.

## Evidence classification

All evidence is local code, automated synthetic fixtures and disposable
PostgreSQL. It is not customer evidence, provider readiness, mobile-device
observation, willingness to pay or Verified-E2E coverage.

