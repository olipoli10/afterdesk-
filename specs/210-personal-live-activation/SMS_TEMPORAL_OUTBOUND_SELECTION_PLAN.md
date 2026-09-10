# Temporal outbound scheduling exclusion — local bounded change

2026-09-10. Scope: existing `outbound-queue.ts`, new focused unit regressions, this plan. No native fixture, locked dispatcher, schema, worker, provider or flag changes.

## Defect and decision

The ordinary `reply:<sourceId>` selection branch currently accepts an attached temporal question solely because its text equals source.result.reply. A pending question whose registry is OFF/expired/terminal or definitively revoked can therefore repeatedly occupy oldest-first LIMIT10 even though the locked send gate correctly refuses it.

Filter before ORDER BY/LIMIT. Ordinary fallback requires **global absence** of any registry attachment by outbound id; an attachment in another actor/workspace must not look absent. Otherwise require enabled STORE/BRIDGE/current pilot, exact PREPARED actor/source/question request hash/full wire/review, current active shared ledger, immutable snapshot epochs and currently valid SMS inbound/model/calendar grants/accounts/credential references. No credential content is read. Retain all historical rows and pending messages.

The SQL is a scheduling hint only. It deliberately does not duplicate canonical proposal reinspection, model fingerprint computation, budget/approval/claim validation or the complete locked dispatcher. Existing last-moment checks remain the only sending authority. Definitive revocations and immutable binding changes should not monopolize the queue; transient budget/provider/rate failures still can remain pending and global fairness is not promised.

Capture temporal eligibility-switch state before awaits and refuse a changed state before returning candidates. Preserve existing ordinary/confirmation branches and result format. Use SQL parameters for gates/scopes and text comparisons for JSON versions/UTC timestamp strings, never casts of untrusted JSON.

## Proof plan

New unit tests assert global attachment fallback, eligibility predicates and their position before LIMIT, exact flags/current scope, immutable returned candidates, changes during SQL and no writes/provider imports. SQL mocks are not proof of selection semantics.

Controller-owned native fixture should put a valid ordinary reply behind a temporal question and use LIMIT1: STORE/BRIDGE OFF, expired PREPARED, terminal EXPIRED/REFUSED, revoked Google/model grant, changed owner/identity epoch. Assert the ordinary reply is selected while retained question/proof/budget stay unchanged. Positive eligible temporal question must still be selected. Foreign attachment fallback must be checked structurally without weakening the existing composite FK constraints to forge an invalid row. Current locked dispatcher continues to revalidate every selected id.

## Current local receipt and exact limit

10:33:13 America/Toronto:15 new SQL-shape/control tests plus16 legacy selector tests =31/31 PASS. Root TypeScript and scoped ESLint PASS. Independent source review underway; no native selector proof run by this lane.

The hint does not compare the canonical model authority fingerprint. A credentialRef/externalAccountKeyHash change without the expected account stateVersion increment can therefore remain a hint while the locked canonical dispatcher refuses it. Controller decision: keep this bounded scheduling limitation explicit and **do not duplicate** the canonical fingerprint in SQL. The complete locked gate remains mandatory. This is not a sending-authority bypass.
