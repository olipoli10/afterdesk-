# Controller review: separate Google Calendar from social login

Controller fully read the author diff, helper, captured-auth tests, peer tests,
configuration contract and existing external-capabilities implementation.
No concrete blocking defect found in the narrow change. Author and peer are
separate reviewing agents, not independent evidence of model quality.

The new exact server-only opt-in is ANDed with all existing credentials and
capability/owner/authority guards. Calendar code/scopes/expiry remain unchanged.
No hostname heuristic or shared-credential fallback, role downgrade, account
linking relaxation, schema or device permission change. Production auth-secret
requirement and anti-linking settings retained. Absence now disables previously
implicit social login: this intentional compatibility change is documented and
must be reconciled before any other public deployment (not authorized here).
This patch does not revoke sessions or dynamically react to environment changes.

Author reproduction 7PASS/4FAIL retained in its review report; corrected author
66 and peer69 targeted tests PASS. Controller fresh full root7086/461files PASS
with three historical skipped tests at2026-09-11T01:42:41.341Z. Local webpack
Next build PASS at01:45:32.701Z; scoped author types/lint and peer lint PASS.
No assertion in historical tests was changed. Original user tsconfig/drafts
remain outside the patch and must not be staged or silently deployed.

Runtime Google key presence and exact callback have been verified separately,
but no real owner OAuth consent, login/token exchange or calendar data is proof
of these synthetic tests. Personal-only next publication must leave social login
absent and all non-Google provider/worker switches off; project cron scheduler
must remain disabled despite its inherited definition. Existing100CAD mandate.
