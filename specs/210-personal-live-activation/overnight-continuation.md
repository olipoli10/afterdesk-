# Personal service continuous implementation

Status: IN_PROGRESS. Accepted: Olivier's direct instruction in this task,
2026-09-10 approximately02:39Z. No delivery-by-morning guarantee.

## Decision

Continue the existing plan/goal/queue using distinct agent ownership, critical
cross-review, local regressions and checkpointed source. Keep the existing
three-minute heartbeat ACTIVE; it resumes useful authorized work rather than
creating duplicate tasks or merely repeating a GO. A completed batch is not a
completed personal service. Missing access blocks that branch, not unrelated code.

The app goal API still contains an unfinished historical blocked goal. Attempt to
create the precise current goal was refused; do not falsely complete history to
clear it. spec210 goal.md + queue + active thread heartbeat are durable current
execution state. Agent lifetime is not a promise of uninterrupted wall-clock work.

## Architecture and trade-off

Use the existing model gateway and persistent ledgers, not a direct SMS-to-model
to-tool shortcut. ConstructionWorkspace is explicitly namespaced; no fabricated
Task/Client linkage. A candidate proposes source-bound fields and never owns action
authority. Added complexity is justified by replay, spend, cross-account and consent
controls. These controls do not establish semantic model quality or real delivery.

## Rolling critical path

1. Personal subject relation, PostgreSQL CHECK and authenticated stored-source
   reinspection. Local migration tested on disposable DB only.
2. Closed OpenRouter wire adapter, exact provider/model pin, one attempt, timeout,
   deeply immutable schema and untrusted-response inspection. OFF by default.
3. Current reviewed USD/CAD rate policy; explicit per-provider ceiling;
   transaction-scoped USD hold and personal CAD hold; one-attempt fenced claim.
4. Complete personal gateway admission using existing policy/privacy/breaker/audit,
   distinct durable child model operation and post-latency reinspection.
5. Deterministic quoted time resolution, immutable action preparation, worker
   integration behind OFF flag; race/revocation/uncertain outcome DB tests.
6. Android permissions refresh/revocation and selected-contact import, then export
   validation and a coherent internal APK when backend-compatible changes are ready.
7. Current credentials + privacy/rates + owner phone pairing + Google consent;
   exact allowed live observation and budget reconciliation before any successclaim.

## Current separate owner-access dependency

Twilio +14503676562 exists. No inbound webhook/APIkey configured at last observation.
Specific creation/storage permission for a dedicated key and ENDVERA/Vercel secrets
was asked, not yet observed answered. Google consent and owner-phone binding are
not fabricated. Do not ask for the already accepted100CAD budget again. Unchanged
account blockers stay quiet while code work proceeds. Never replenish credit,
message third parties, grant Android permissions automatically or reuse R37.

## Evidence and done criteria

Report local tests, deployed source, installed source and live observed effects
separately. Preserve failedruns and reviews. No roadmap/build/C2/customer/E2E metric
promotion without its rubric. STOP only for real completion or no useful authorized
work; heartbeat remains active until completion or explicit user stop.
