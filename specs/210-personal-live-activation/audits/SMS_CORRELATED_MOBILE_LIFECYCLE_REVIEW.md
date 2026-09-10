# Independent mobile read lifecycle review

2026-09-10. Reviewer `openrouter_disabled_adapter`. Read the full changed common MobileApi request path and new correlated-list caller, list parser/session key, lifecycle controller, list component, and author cancellation/list/render tests. This is injected-transport and synthetic-hook evidence, **not a native device test** or authorization to execute a calendar action.

## Inspected behavior

The common request path composes a caller AbortSignal with its existing internal timeout controller, rejects pre-abort before cookie/HTTP work, and races the new caller's bounded fetch/body lifetime even when a fake transport ignores abort. Exact listener cleanup and timer cancellation run on success/failure; no new credentials, retries or changed legacy caller timeout policy are introduced. Cancellation is OUTCOME_UNKNOWN, never a claim that server activity was undone.

The list component is keyed by current user/session/workspace and refuses pending, signed-out, mismatched or non-owner local display scope. Layout cleanup and navigation/AppState pause cancel pending reads and clear data. This display scope is not backend authorization. The generation-fenced lifecycle clears old text synchronously before reload, rejects late old responses, and has a one-shot expiration invalidation rather than polling. Rendering exposes only read refresh, not approval/action controls. Hook/render tests mock lifecycle/native hooks; no real navigation remount or Android foreground event was observed by this reviewer.

## Finding 1: cancellation between private request and public return

Independent RED **12:59:11 local: 11 PASS / 1 FAIL** across author9 + reviewer3. The new caller awaited private request, whose finally removed the signal listener; an abort microtask at that observation point ran before the public caller resumed, yet the caller still parsed and returned the DTO.

Counter-test: `apps/mobile/test/api-caller-cancellation-review.test.ts`. The test calls the real public MobileApi method with fake HTTP and instruments only listener cleanup to schedule the cancellation at the async boundary. Two other reviewer cases check abort during synchronous cookie lookup and exact listener removal after synchronous transport failure. It proves this JavaScript scheduling boundary, not frequency on a device.

The author added checks immediately after the public await and before public return, outside the INVALID_RESPONSE parse catch. Common legacy request handling was not broadened by this fix. Reviewer read the narrow delta and reran **12/12 PASS at 13:01:27**; mobile TypeScript and scoped reviewer lint subsequently exited 0. Original failing oracle remained unchanged.

## Finding 2: slow device clock extends display lifetime

Independent RED **13:03:09 local: 1 PASS / 1 FAIL** in `apps/mobile/test/correlated-calendar-lifecycle-review.test.ts`. With a synthetic device clock 24 hours behind the DTO's server inspectedAt, a six-minute remaining lifetime still rendered READY after six elapsed minutes. The old timer/getSnapshot compared only device Date.now against absolute server expiresAt.

This is stale protected-text display, not an action/approval bypass. Proposed bounded correction: the same helper must cap result acceptance, cached snapshot and one-shot timer by the minimum of absolute expiry and readStartedAt + (expiresAt - inspectedAt). Device clock rollback remains invalidating; a timer never triggers a network refresh. The second independent case checks unsubscribe and paused delayed-response behavior.

The author implemented `correlatedCalendarListDeadline`, used by result acceptance, getSnapshot and the timer, with exactly that minimum. The reviewer read the saved helper/call sites and the additional slow-clock latency/rollback tests. Fresh independent five-suite rerun **13:05:04 local: 71/71 PASS** (author39 lifecycle +18 render +9 API +reviewer5). Mobile TypeScript and scoped reviewer lint subsequently exited 0. The original slow-clock assertion remains; only its label was clarified from server-proven to server-reported lifetime because this is a synthetic DTO fixture.

**Final bounded verdict: GREEN after both reproduced findings were corrected.** Source/session lifecycle, common request cleanup and new component were reviewed; no further actionable critical defect was identified. This does not assert real-device AppState timing, physical clock accuracy, actual HTTP cancellation or provider behavior. No reviewer production source, provider, native database, device build or deployment was modified/run.
