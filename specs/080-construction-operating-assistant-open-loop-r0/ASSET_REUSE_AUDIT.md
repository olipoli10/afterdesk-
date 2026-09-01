# Existing Asset Reuse Audit

| Existing asset | Current proof | R0 decision | Gap to close |
|---|---|---|---|
| Better Auth + CLIENT/VA/ADMIN | Existing product authentication and role checks | Reuse | Add construction-specific capabilities; do not equate login with authority |
| PostgreSQL + Prisma | Durable construction V1 records and disposable DB tests | Reuse | Add forward-only OpenLoop records and projections if implementation needs persistence |
| ConstructionWorkspace/Project/Contact | V1 domain with workspace isolation | Reuse as canonical parent | Extend with loop membership and finer project roles |
| ConstructionMessage/Interpretation | Raw-first normalized intake and closed intents | Reuse | Add typed completion/evidence commands without a second intake engine |
| ConstructionAction | Exact-version, payload-hash approval and local replay refusal | Reuse | Generalize authority metadata for later calendar/message/accounting actions |
| ConstructionAuditEvent | Append-oriented construction history | Reuse | Add loop transition and closure event kinds |
| Local SMS/email simulator | Provider-neutral, zero network | Reuse for R0 proof | Live provider remains a later gated connector |
| Model Gateway | Policy, privacy, audit, breaker concepts | Reuse later | No live model is required for deterministic R0 |
| File-security pipeline | Type/size/malware/metadata/hash controls | Reuse through adapter | Link selected evidence to project/loop rather than Task-only storage |
| Workflow-run processor | Durable leasing, retry and recovery | Reuse for internal timers/follow-up | External side effects need a non-retry boundary and action authority |
| Human Work Units + QC | Bounded human execution infrastructure | Adapt behind exception boundary | Remove marketplace semantics from client experience; minimize context |
| Portal Projects/Calendar/Inbox/A2 | Existing cockpit and conversational surface | Reuse | Add Today/Tomorrow and invoice-readiness projections |
| Voice intake work | Code/test/synthetic provider abstractions | Preserve for later | No live voice proof; needs explicit provider and recording/consent policy |
| Stripe/payment infrastructure | Existing payment concepts | Do not couple to R0 | Customer billing and contractor receivables are different domains |
| Task/file marketplace flows | Mature AfterDesk semantics | Isolate | Do not force construction operations into one-off deliverable/task economics |

## Conclusion

This is an extension, not a rewrite. The reusable foundation is strong enough to build the first workflow locally. The missing product core is a first-class, project-scoped open loop with explicit desired outcome, evidence requirements, next actor, authority, deadlines, contradictions and closure proof.

