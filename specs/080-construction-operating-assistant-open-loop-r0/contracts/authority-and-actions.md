# Authority and Action Contract

## Risk classes

| Class | Examples | R0 behavior |
|---|---|---|
| A0 internal observation | classify message, compute missing evidence | May run after identity/project validation |
| A1 reversible internal proposal | create reminder proposal, assign next actor | Persist proposal with audit |
| A2 external routine action | send SMS, create external calendar event | Prepare exact action; no R0 delivery |
| A3 financial/legal commitment | issue invoice, approve spend, sign, pay | Explicit one-shot authority and connector policy required; unavailable in R0 |

## Point-of-use decision

Every action decision binds:

- workspace and project;
- authenticated actor and role/capabilities;
- exact action type;
- exact target identity;
- exact channel/provider adapter;
- exact payload and canonical hash;
- source loop ID and state version;
- risk class;
- expiry and replay key;
- approval policy version.

If any bound field changes, the approval is stale.

## R0 ceiling

R0 may create an internal proposal and a `PREPARED_UNSENT` evidence request. It may not send, retry, fall back, create an external calendar event, create an accounting transaction or perform any network request.

