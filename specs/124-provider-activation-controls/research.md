# Research: Provider Activation Controls R37B

- **Decision**: Represent provider money in integer microdollars with reserve,
  settle or release states. This follows the project constitution.
- **Decision**: Persist grants and spend state so restart cannot reset ceilings.
- **Decision**: Use one workspace grant plus a global kill switch; both are checked
  at point of use.
- **Rejected**: In-memory counters, unlimited defaults, environment-variable
  authorization and provider-side budget enforcement alone.
- **Unknown**: Real provider price, quality, latency and customer value until R37.
