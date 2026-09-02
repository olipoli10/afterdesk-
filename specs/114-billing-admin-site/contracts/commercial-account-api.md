# R34 Commercial Account API Contract

## Client read

`GET /api/endvera/v1/mobile/commercial-account?workspaceId=<id>`

- authenticated owner/office membership;
- private/no-store and rate-limited;
- returns strict account/plan/usage/support projection;
- returns no field-worker projection;
- `billingProvider=DISABLED_LOCAL`, `providerObserved=false`, `externalEffectCount=0`.

## Admin read

`GET /api/endvera/v1/admin/construction-commercial`

- ADMIN only;
- returns deterministic attention-ordered portfolio;
- reading performs zero state transition.

## Admin command

`POST /api/endvera/v1/admin/construction-commercial`

Closed body:

```json
{
  "commandId": "uuid",
  "workspaceId": "canonical-id",
  "kind": "ASSIGN_PLAN | CHANGE_PLAN | CHANGE_STATE",
  "expectedAccountVersion": 0,
  "planKey": "EARLY_ACCESS",
  "planVersion": 1,
  "nextState": "PREPARED | INTERNAL_TRIAL | SUSPENDED | CANCELLED"
}
```

Actor/role are session-derived. The response returns one exact account version
or a closed refusal. No request can set price, provider, paid status or usage.

## Support

Client and admin support surfaces consume existing R22 reads/commands. R34 may
add Web adapters and links, but no alternate support lifecycle.
