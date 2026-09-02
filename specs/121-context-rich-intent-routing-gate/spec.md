# Feature Specification: Context-Rich Intent Routing Gate

**Feature Branch**: `codex/endvera-construction-operating-assistant-r10-r12-autonomous`
**Created**: 2026-09-02
**Status**: Draft

## Purpose

Ensure selected voice-call transcripts, project emails, portal text and file observations all cross the provider-neutral assistant brain before the context-rich R18 resolver can apply or resolve work.

## User Scenarios

### P1 — Voice call asks for external intelligence

An authorized, consented voice transcript asking for public research receives a truthful provider-required-not-authorized response and never reaches an external service.

### P2 — Selected project email stays operational

An admitted project email containing a supported operational update remains on the internal resolver path and preserves its project/evidence context.

### P3 — Every source retains an auditable routing decision

Portal text, voice transcript, email and file observation each produce a provider-neutral routing projection stored in the audit ledger, with exact replay.

## Requirements

- **FR-001**: R18 MUST classify the normalized source body through R36A before resolving or applying an intent.
- **FR-002**: Source kinds MUST map deterministically to portal, voice-transcript or email routing channels.
- **FR-003**: Internal dispositions MUST preserve current R18 behavior and context resolution.
- **FR-004**: Candidate, human, clarification and refusal dispositions MUST stop before canonical transition.
- **FR-005**: Non-internal replies MUST state that no external work or result occurred.
- **FR-006**: The routing projection MUST contain no provider/model/adapter identity.
- **FR-007**: One immutable audit decision MUST be retained per workspace/source and exact replay MUST not create a second decision.
- **FR-008**: A source replay with changed content MUST remain refused by existing R18 claim guards.
- **FR-009**: Existing R18, R25 and R26 response contracts MUST remain backward compatible.
- **FR-010**: External dispatch, credentials, customer data and schema changes remain forbidden.

## Success Criteria

- 100% of tested R18 source kinds cross the routing gate.
- Supported operational inputs retain existing outcomes.
- Public research, restricted personal research and mixed consequential requests create zero canonical effect and zero dispatch.
- Routing decision replay creates one audit row.
- R18/R25/R26 regressions, typecheck and lint pass without migration or lockfile change.
