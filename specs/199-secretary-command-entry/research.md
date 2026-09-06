# Research: Secretary command entry

## Reuse the existing assistant

**Decision**: Route command capabilities to the current assistant composer with a prefilled prompt.
**Rationale**: This preserves one product surface and user review.
**Alternative considered**: A new command form was rejected because it recreates the form-led experience the founder cut.

## Never auto-submit navigation input

**Decision**: Prefill exactly once and require the existing explicit send action.
**Rationale**: Navigation parameters are not action authority and some commands imply sensitive writes.
**Alternative considered**: Automatic submission was rejected as an invisible action trigger.

## Dedicated destinations

**Decision**: Google connection and call work open their existing purpose-built surfaces.
**Rationale**: Their prerequisites cannot be truthfully completed by a prompt alone.
