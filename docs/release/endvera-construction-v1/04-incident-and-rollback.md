# Incident and rollback runbook

1. Freeze new promotion and external writes.
2. Identify the exact release manifest, target, build number and observed
   symptom; preserve logs without secrets or customer content.
3. Disable affected provider grants or prepared actions before retry.
4. Restore the last independently verified application artifact and compatible
   forward-only database state. Never use destructive schema rollback.
5. Reconcile queues, idempotency keys, audit history and pending human work.
6. Re-run smoke, privacy, authority and recovery gates before reopening.
7. Record the incident, decision owner, recovery evidence and residual risk.

If a safe rollback artifact or exact authority is absent, remain stopped and
escalate. Do not improvise a store, provider or Production action.
