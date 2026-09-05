# Research: R37 Controller Contract Alignment

## Finding 1 — Capability mismatch

`INVOICE_READINESS` asks the controller to decide readiness from three known facts, but allowed only `CLARIFY`. The observed model selected `ANSWER_FROM_STATE`, cited every required fact and invented none. **Decision**: add `ANSWER_FROM_STATE`; retain `CLARIFY` as a safe alternative.

## Finding 2 — Hidden limitation contract

The oracle requires exact limitation concepts, but the request exposed only case ID, locale, facts and task. **Decision**: serialize `allowedCapabilities` and `expectedLimitations` from the parsed case into the user message. Do not expose answer-term oracle internals.

## Finding 3 — Evidence immutability

The observed report is a valid REWORK result under the contract that actually ran. **Decision**: never edit or recompute its stored oracle. Use it only as diagnostic input and guard its exact SHA-256.

## Alternatives rejected

- Weakening the oracle: rejected because it would hide the missing run contract.
- Changing the historical report: rejected because it would fabricate a PASS.
- Running another provider call: rejected because no authority exists and local proof is sufficient for this correction.

