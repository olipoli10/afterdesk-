# R37 mutation evidence

Executed 2026-09-04 against in-memory request/response/source copies and one owned disposable PostgreSQL database. No credential value was present or inspected. Every mutation was local, failed its exact guard and left the tracked implementation unchanged.

| Mutation | Exact guard | Result |
|---|---|---|
| fixture labelled as observed | `r37CampaignReportSchema` requires `OBSERVED_PROVIDER_SYNTHETIC_INPUT` and six canonical observations | KILLED |
| wrong model | closed `R37_MODELS` request schema | KILLED |
| fallback enabled | `allow_fallbacks: false` literal | KILLED |
| supported parameters disabled | `require_parameters: true` literal | KILLED |
| data collection allowed | `data_collection: deny` literal | KILLED |
| ZDR disabled | `zdr: true` literal | KILLED |
| tool attached | strict request schema and response tool-call refusal | KILLED |
| alternate network host | `R37O_ALTERNATE_NETWORK_DESTINATION` | KILLED |
| network/secret moved outside exact transport | `R37O_NETWORK_TRANSPORT_PRESENT` and `R37O_SECRET_ACCESS_PRESENT` | KILLED |
| public or transitive transport reachability | `R37O_DIRECT_PROVIDER_EXECUTION_EXPOSED` and `R37O_TRANSITIVE_PROVIDER_EXECUTION_EXPOSED` | KILLED |
| missing provider cost | `R37_RESPONSE_COST_REQUIRED` | KILLED |
| returned model drift | `R37_RESPONSE_MODEL_DRIFT` | KILLED |
| per-attempt cost above 100,000 micro-USD | `R37_ATTEMPT_COST_CEILING_EXCEEDED` | KILLED |
| unknown fact citation | `R37_UNKNOWN_FACT_CITATION` | KILLED |
| external-effect claim | `R37_EXTERNAL_EFFECT_CLAIMED` | KILLED |
| prior campaign/replay | `R37_AMBIGUOUS_PRIOR_CAMPAIGN`; provider mock remained at six calls | KILLED |
| provider failure cleanup | `REWORK`, both grants revoked and global lane disabled | KILLED |

Targeted GREEN rerun:

- Unit and boundary: 16 tests passed across three files.
- Disposable PostgreSQL: 3 tests passed after all 66 migrations; owned server/database removed.
- Mandatory source-tree provider boundary: 581 executable modules, zero violations.
- Structural source hashes after the mutation run:
  - contracts: `723d948ab50a9d88f6729ff4a1ff61418f6d7ef0895cd3986ef9e477014c2be2`
  - transport: `365683f676f81043d8f894b9b3be8ac361fcae520285a8534b62a728f3cd72c2`
  - campaign: `97a299a3cfaba1a1997c21edc1853e8dd1c4c12384b60969af3891c478ebf5ff`

Evidence label: `TEST + SYNTHETIC`. No provider observation is claimed by these mutations.
