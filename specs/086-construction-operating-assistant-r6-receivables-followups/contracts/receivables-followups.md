# Contract v1

- `recordConstructionReceivable`: creates one issued invoice state.
- `recordConstructionReceivablePayment`: appends one payment and updates the
  balance atomically under an expected version.
- `scheduleConstructionFollowUp`: binds one due policy to a receivable or open
  loop and freezes the contact/channel/body.
- `prepareDueConstructionFollowUps`: claims due rows and creates one proposed
  `ConstructionAction`; result is always `PREPARED_UNSENT`.
- `constructionReceivablesForRole`: owner/office sees money; field worker sees
  only project and operational next-action state.
