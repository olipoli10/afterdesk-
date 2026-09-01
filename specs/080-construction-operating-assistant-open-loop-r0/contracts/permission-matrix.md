# Construction Permission Matrix

Capabilities are explicit and workspace-scoped. A phone number, contact record or login alone grants nothing.

| Capability | Owner/Admin | Office manager | Project manager | Field worker | Accountant | External contact | ENDVERA operator |
|---|---:|---:|---:|---:|---:|---:|---:|
| Submit project update | Yes | Yes | Yes | Assigned projects | Limited | Consent link only | On bounded work unit |
| View project operational state | All | All | Assigned | Assigned, limited | Assigned, financial | No | Minimum needed |
| View costs/receivables/amounts | Yes | Policy | Policy | No | Yes | No | Only bounded need |
| Verify operational fact | Yes | Yes | Policy | Own evidence only | Financial facts | No | Structured result only |
| Prepare routine message | Yes | Yes | Policy | No | Policy | No | If work unit permits |
| Approve/send routine message | Yes | Policy | Policy | No | Policy | No | No client authority |
| Change external calendar | Yes | Policy | Policy | No | No | No | No client authority |
| Issue invoice/accounting write | Explicit A3 | Explicit A3 | No | No | Explicit A3 | No | No |
| Connect/revoke providers | Yes | No | No | No | No | No | No |
| Manage members/roles | Yes | No | No | No | No | No | No |
| View full audit | Yes | Policy | Assigned | Own submissions | Financial | No | Work-unit audit only |

## Required negative tests

- A field worker cannot see an amount, margin, receivable or unrelated project.
- An external contact cannot query project state by texting the business number.
- An office manager without `APPROVE_ROUTINE_MESSAGE` cannot approve a prepared SMS.
- An operator cannot inherit the owner's authority through a Human Work Unit.
- Revoked memberships and communication identities fail immediately.

