# Implementation Plan: Legacy Command Routing Closure

1. Add one server helper that converts an authenticated portal envelope to the strict R36C request.
2. Reject non-portal/provider-bearing input at the legacy API.
3. Route the web form server action and API through R36C.
4. Add static boundary and PostgreSQL behavior tests.
5. Run focused regressions, typecheck, lint and queue closeout.

No schema or external state changes are required; rollback is the feature commit revert.
