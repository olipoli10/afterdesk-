# Data Model: Secretary command entry

## Capability entry

- `key`: one of the seven R38B capability keys
- `kind`: `ASSISTANT_PROMPT` or `APP_ROUTE`
- `value`: exact prompt or owned app route
- `label`: visible action wording

Every capability has exactly one entry. The entry is immutable and performs no action itself.

## Assistant prefill

- Source: one navigation parameter
- Valid value: one trimmed non-empty string, maximum 10,000 characters
- Invalid value: absent, array ambiguity after first selection, blank or oversized
- Lifecycle: consumed once into the local composer; never persisted or submitted automatically

## State transitions

`CAPABILITY_VISIBLE → ENTRY_SELECTED → DESTINATION_OPENED → PROMPT_REVIEWED → EXISTING_SEND_CONTROL`

Only the final existing send control can create an assistant attempt.
