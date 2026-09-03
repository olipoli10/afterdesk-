# Feature Specification: Provider Security Hardening R37G

**Created**: 2026-09-03  
**Status**: In progress  
**Evidence label**: `SYNTHETIC`; no provider response has been observed.

## Problem

The completed R37A-R37F diff scan found five current defects at the local provider boundary: a stale callback can write after lease reclaim, a foreign-workspace grant can create a durable run before rejection, a direct executor caller can bypass runtime seal validation, canonical recovery does not recompute its digest, and failed dispositions can expose canonical evidence.

**Denominator and evidence**: the exact 17-file committed range `fad720c..a4a096b`, reviewed 2026-09-03 by a completed Codex Security diff scan. Customer demand and production prevalence are `UNKNOWN`; this release is selected as a mandatory security correction, not a market claim.

## Scope and Exclusions

In scope: existing R37A, R37C and R37F runtime boundaries, focused tests, documentation and autonomous queue records. Explicitly excluded: provider calls, credentials, public routes, customer data, external reads or writes, schema or migration changes, new dependencies, Preview, Production and deployment.

## Authorization, Tenancy and Data Classification

Only an active `owner` or workspace `admin` may create or replay a controlled provider run. Actor, workspace and grant ownership are rechecked together before any durable run or audit side effect. Test inputs are synthetic `public` or `business_confidential` facts only; no secret, identity-bearing customer datum or cross-workspace content may reach an adapter.

## Failure and Exception States

- Invalid runtime seals and foreign grants fail before adapter invocation and before durable creation.
- A stale lease returns an in-progress result without evidence mutation.
- Canonical digest drift fails closed.
- `FAILED`, `FAILED_REPLAY` and `IN_PROGRESS` expose no canonical evidence.
- Caller-controlled time is a recorded deferred gate: any future untrusted route is blocked until time comes from a trusted server clock.

## Economics, Verification and Delivery

Existing integer-microdollar reserve, settle-or-release ceilings remain unchanged. This release adds no spend and no price or margin claim. Verification consists of unit tests plus real disposable PostgreSQL authorization, concurrency, recovery and replay tests. Delivery is local source and Git evidence only; no provider result or external state is delivered.

## Observability, Rollout and Rollback

Existing run, spend and audit records remain reconstructible. No sensitive content is added to logs. Rollout is one local forward code change with no database migration. Rollback is the preceding local Git commit; no historical row is reinterpreted or deleted.

## Functional Requirements

- **FR-001**: Reject malformed or fingerprint-drifted sealed attempts inside the exported R37A executor before adapter invocation.
- **FR-002**: Verify owner/admin authority and exact workspace/grant binding before the first durable controlled-run side effect.
- **FR-003**: Pass the exact run ID and lease token into the adapter callback and fence every canonical-evidence write with both values.
- **FR-004**: Recompute the canonical evidence fingerprint from unsigned content during every recovery.
- **FR-005**: Return canonical evidence only for `SUCCEEDED` and `SUCCEEDED_REPLAY` dispositions.
- **FR-006**: Preserve exact spend, replay, reconnect and zero-transport behavior without a schema, migration or dependency change.
- **FR-007**: Record caller-controlled time as a blocking prerequisite before any future untrusted route or provider authorization.

## Edge Cases

- An old adapter resumes after another worker has replaced its lease token.
- A valid member supplies a valid grant ID owned by another workspace.
- Snapshot content and both stored fingerprint copies drift together.
- A failed durable run retains forensic snapshot fields but must not expose them as successful canonical output.
- A future internal caller invokes the exported R37A executor directly.

## Success Criteria

- **SC-001**: Five security regression tests fail on R37F and pass on R37G.
- **SC-002**: A stale callback creates zero canonical-evidence mutation.
- **SC-003**: A cross-workspace grant creates zero controlled-run row and zero external effect.
- **SC-004**: R37A-R37G unit and disposable PostgreSQL regressions pass.
- **SC-005**: Source inspection retains zero credential read, network client, provider call or external transport.
