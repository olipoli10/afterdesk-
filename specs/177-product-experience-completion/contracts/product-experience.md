# Product Experience Contract

## Public routes

- `GET /`: existing homepage plus exactly one prominent link to `/textassist`.
- `GET /textassist`: bilingual construction operating-assistant narrative with honest availability and no external request.
- `GET /account-deletion`: public instructions and authenticated/support paths; viewing the page performs no deletion.

## Mobile navigation

- Visible tabs: `index`, `assistant`, `projects`, `calendar`, `more`.
- Every existing route remains registered.
- Secondary routes use `href: null` in tab options and are linked from `more`.
- Direct navigation to a secondary route remains supported.

## Safety

- No public surface calls a provider or accepts credentials.
- No mobile navigation change bypasses existing authorization or role projection.
- No copy states that an SMS, call, calendar write, accounting write, deployment, signing, or publication is currently active.

