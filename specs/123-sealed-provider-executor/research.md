# Research: R37A Sealed Provider Executor

## Gateway is transport, not ENDVERA's brain

OpenRouter remains a gateway candidate. ENDVERA retains explicit model binding,
fallback policy and action authority. R37A copies R36B privacy constraints
rather than adding automatic gateway routing.

## No usable provider path before separate authorization

An HTTP client plus placeholder secret makes accidental dispatch too easy. R37A
builds a credential-free request form and supports only an injected synthetic
adapter. Observed capability needs a separate spec, current evidence and
explicit authority.

## Proof labels cannot be upgraded by a mock

Adapter output exercises limits and audit behavior only. Every outcome is
`SYNTHETIC`, `externalDispatchPerformed: false` and never certified.

## Retrieval and controller remain distinct

Perplexity can be assessed for public-source retrieval; OpenRouter for
controller reasoning. Neither gains authority to message, alter calendars or
access customer data in R37A.
