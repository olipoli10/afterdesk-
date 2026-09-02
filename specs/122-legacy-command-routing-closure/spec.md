# Feature Specification: Legacy Command Routing Closure

## Purpose

Remove the final user-facing direct R2 entry points so the authenticated web form and legacy command API both cross R36C.

## Requirements

- The web server action MUST call R36C with a server-derived portal request.
- The legacy command API MUST accept only authenticated portal commands with matching server-derived sender identity.
- Client-supplied non-portal channel, provider or provider message identity MUST be refused at this API.
- Internal operational behavior and replay MUST remain unchanged.
- Provider-required work MUST return the R36C truthful deferred result.
- No provider, external dispatch, schema, dependency or lockfile change is permitted.

## Success Criteria

- Static wiring proves no user-facing boundary calls R2 directly.
- Portal internal and provider-required PostgreSQL cases pass through R36C.
- R2, R36C, web action and API regressions pass.
