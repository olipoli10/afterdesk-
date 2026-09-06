# Feature Specification: Secretary broadcast preparation

**Created**: 2026-09-05
**Status**: Draft

## User Story 1 — Name a group naturally (P1)

An authorized owner writes one command such as « Texte Marc, Julie et Karim que le chantier ouvre à 7 h. » ENDVERA resolves an exact visible audience of two to ten active workspace contacts and prepares one durable unsent group draft.

### Acceptance scenarios

1. Exact distinct names and an exact message create one canonical broadcast draft with ordered recipient snapshots.
2. One recipient continues through the existing single-recipient message family.
3. More than ten recipients, duplicate names, missing contacts, ambiguous identities or contacts without an eligible SMS address are refused without a draft.
4. Replaying the same request reconstructs the same draft; changing content under the same request id is refused.

## User Story 2 — Inspect before approval (P1)

The owner can see every recipient, the SMS channel and exact text while the draft remains `PREPARED_UNSENT`. No transport occurs.

### Acceptance scenarios

1. The assistant reply states the recipient count and that the message is prepared but unsent.
2. The owner projection contains exact ordered recipient display names and masked phone destinations.
3. Field-worker projections contain no recipient, phone or message content.

## Requirements

- **FR-001**: The parser MUST accept two to ten exact named contacts separated by commas or `et` before the word `que`.
- **FR-002**: The server MUST resolve identities inside the authenticated workspace and reject ambiguous, absent, duplicate or ineligible contacts.
- **FR-003**: One immutable fingerprint MUST bind workspace, draft id, version, ordered recipients, channel and exact body.
- **FR-004**: A successful request MUST persist one durable `PREPARED_UNSENT` draft and its source messages atomically.
- **FR-005**: Request replay MUST be idempotent and altered replay MUST fail closed.
- **FR-006**: External transport MUST remain false and no provider route may be reachable.
- **FR-007**: Owner/admin may prepare; field workers and cross-workspace actors MUST be refused.
- **FR-008**: This release MUST NOT approve, dispatch or simulate delivery; those are separately gated transitions.

## Success Criteria

- Exact 2-person and 10-person commands create exactly one durable draft each.
- Duplicate, 11-person, missing, ambiguous, ineligible, role and cross-workspace cases create zero drafts.
- Identical replay has zero additional effects; altered replay is refused.
- Restart reconstruction returns the same fingerprint, audience and text.
- Provider calls, SMS sends and external writes remain zero.

## Assumptions

- This bounded grammar is a safe local fallback until an authorized AI interpreter can emit the same closed contract.
- Phone destinations may be stored in the canonical private snapshot but are masked in ordinary projections.
- Approval and dispatch are intentionally separate follow-on releases.
