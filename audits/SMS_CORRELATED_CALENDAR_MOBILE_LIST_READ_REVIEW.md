# Mobile correlated list — additional bounded source read

2026-09-10. Same-model cross-review, not a separate model-quality or native-device
verification. No source modification or new test run by this reviewer for this
addendum. The peer's independent regression files and controller receipts retain
their own provenance.

Fully read current `personal-correlated-calendar-list.ts`,
`personal-correlated-calendar-list-lifecycle.ts`, the real list component, its
render test harness and `CORRELATED_CALENDAR_LIST_INTEGRATION.md`. This includes
the already-fixed LOADING subscriber reentrance, late raw-result rejection and
the shared minimum absolute/relative display deadline (after the peer's slow-phone
RED). The source is reviewed in its final frozen state, not the older pre-fix code.

No additional actionable defect confirmed in the bounded path: exact workspace
and auth/session-owner key, strict all-or-nothing item parsing, generation-owned
abort, controller installed before publication, post-publication current check,
pause/unmount clearing, cached irreversible EXPIRED snapshots, one-shot timer
without fetch and read-only refresh are coherent. The list never introduces an
approval/prepare/write callback; complete text comes from the frozen item card.

The render tests exercise actual component wiring with synthetic React/native
hook mocks. Lifecycle tests reported by the author and other peer are separate.
The current component pauses on nonactive change/Android blur and uses the native
current-state value for a focus event; no observed Samsung event-ordering proof is
claimed. A speculative blur/change ordering concern was not promoted to a defect
without a reproducible relevant event sequence. Display freshness remains a
conservative local boundary, not server authority or provider truth.

Verdict: bounded source-read GREEN, no new change requested. Main/author report
the final controlled 637-test mobile receipt; that count was not rerun by this
reviewer and is not represented as this lane's independent execution evidence.
