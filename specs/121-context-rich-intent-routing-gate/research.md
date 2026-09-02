# Research: Context-Rich Intent Routing Gate

- R18 is the common context-rich boundary used by R25 calls and R26 email.
- R18 already verifies workspace role, project/contact/evidence context and exact source replay.
- R36A is deterministic and provider-neutral; it can classify before R18 resolution without a provider call.
- Existing adapter result schemas select fields rather than spreading unknown R18 fields, so an optional routing projection is backward compatible.
- The existing construction audit ledger is preferable to a new table or migration for the routing decision.
