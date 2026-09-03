# Controlled Run Contract

The coordinator accepts an authenticated workspace actor, active R37B grant,
stable idempotency key, exact R37A sealed attempt, positive reserved amount and
an injected synthetic adapter. It either returns stored synthetic evidence and
settled ledger state, records a released failure, reports an active lease, or
refuses exact binding/authority drift. It never resolves credentials or creates
network transport.
