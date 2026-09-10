# Founder Android build input guard — local implementation

Continue the accepted personal-pilot backend/APK compatibility work. The existing
builder can invoke project:init and commit app.json, then submit an APK without
an explicitly source-bound API origin. Prevent that recurrence before the next
build. This step submits nothing and does not invent backend readiness.

Implement a small read-only local preflight helper and update only
scripts/start-founder-android-build-secure.ps1 to call it before any EAS command
and immediately before build. Require expected source HEAD, HTTPS API origin and
Android versionCode supplied by the controller. Verify clean Git, unchanged exact
HEAD, configured project identity, current package/version identity and explicit
founder-device profile API origin. Only the current dedicated personal backend
origin https://endvera-core-sandbox-afterdesk.vercel.app is in scope; reject
credentials, path, query, fragment, non-HTTPS and cloud-only ambiguous origin.

The source profile must explicitly declare the public origin under its env,
without arbitrary secrets or unrelated environment fields. Do not add this env
or bump versions during this step: coherent identity/profile changes follow the
verified backend and their own existing release validators. Current code4 with
no explicit source profile origin must fail the preflight, not produce another
unconfigured APK. Do not modify credential-free/store profile contracts here.

Remove project:init, implicit staging/committing and tolerated post-init changes.
Existing linked project ID is verified, never rewritten. Do not change source,
environment files, credentials or app identity from a launcher. Keep EAS internal
Android founder-device only, never auto-submit/store/push. Error output must not
echo arbitrary CLI arguments or secrets. Read-only preflight is not remote
compatibility proof, spending authority or a substitute for controller-observed
deployment/auth/API behavior and current available version/budget.

Tests: missing/invalid/mismatched origin, changed HEAD/dirty tree, wrong profile,
wrong project/package/version and source mutation between preflight calls;
valid synthetic fixture control. No EAS/network/API call in tests. Distinct peer
reviews the small critical launch change. No new APK/runtime/phone observation,
metrics or completion claim until actually observed.
