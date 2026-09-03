# Research: Provider Security Hardening R37G

The security scan reviewed the exact committed range `fad720c..a4a096b`, all 17 changed files, six threat surfaces and six candidates. It confirmed two medium and three low findings. The fixes stay inside existing local contracts: PostgreSQL remains authoritative, lease tokens become true fencing tokens, fingerprints are recomputed, and authorization precedes durable effects. No new dependency or schema is needed.

The optional caller-supplied clock remains deferred because the reviewed range has no untrusted route. It must be replaced by a trusted injected clock before provider or public-route authority.
