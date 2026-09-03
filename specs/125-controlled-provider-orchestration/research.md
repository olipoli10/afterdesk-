# Research: Controlled Provider Orchestration R37C

- **Decision**: Use a durable leased run separate from the spend attempt so
  execution ownership and financial lifecycle cannot be confused.
- **Decision**: Store successful R37A evidence before returning it and replay
  that stored value without adapter reinvocation.
- **Decision**: Release the reservation on known adapter/validation failure;
  keep an explicit recoverable state if release itself fails.
- **Decision**: Permit expired-lease reclaim only while the adapter contract is
  structurally synthetic and transport-free.
- **Rejected**: In-memory locks, executing before reservation, unbounded retry,
  and treating a returned adapter object as durable evidence.
- **Unknown**: Real provider delivery semantics, pricing and retry guarantees.
