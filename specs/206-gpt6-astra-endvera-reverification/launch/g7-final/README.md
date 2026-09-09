# Final G7 execution

Preparation only; do not launch before the parent confirms the exact FINAL_HEAD. Both kits remain unchanged. The plan contains 18 original frozen commands followed by 18 separately named R0b commands, each with its own native recorder entry and separate frozen replay-helper record.

Validate preparation without running any product checks:

`node specs/206-gpt6-astra-endvera-reverification/scripts/run-g7-final.mjs --validate-only`

Only after authorization and a clean tracked checkout:

`node specs/206-gpt6-astra-endvera-reverification/scripts/run-g7-final.mjs <FINAL_HEAD>`

The sequence uses one worker. A failed product check is recorded and replayed as FAIL; it does not become PASS because the wrapper exits successfully. Infrastructure/recording errors, source drift and unconfirmed owned-process/DB cleanup stop execution. Existing output IDs are refused, never overwritten. The runner records database closure from owned UUID server messages; this is not an OS-wide process census. A DB failure before ownership is reported is labeled NO_DATABASE_OWNERSHIP_REPORTED, not proven cleanup. Unique synthetic persisted stores are retained; no unrelated DB/store is opened or removed.

The original results remain canonical frozen outcomes. R0b results are supplementary corrected-harness evidence, not replacements. Native NOT_APPLICABLE is accepted only through the original frozen helper and its matching contract. No global green verdict, device observation or provider/customer authorization is inferred.
