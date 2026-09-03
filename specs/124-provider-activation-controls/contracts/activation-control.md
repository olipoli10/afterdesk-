# Activation Control Contract

Every reservation must provide a workspace-bound grant, exact case/model binding,
idempotency key and requested integer microdollars. The service rechecks role,
expiry, revocation, lane state and both ceilings inside one transaction. Unknown
fields and missing configuration refuse.
