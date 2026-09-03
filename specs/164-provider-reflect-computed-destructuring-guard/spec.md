# R37AP — Provider Reflect computed destructuring guard

## Objective

Prevent a string-literal computed `apply` property in a Reflect destructuring declaration or assignment from hiding a tracked dynamic module load.

## Acceptance

- `{ ["apply"]: invoke } = Reflect` is tracked in declarations and assignments.
- Tracked Reflect namespace aliases remain supported.
- `require` and tracked `createRequire` loaders remain fail-closed for nonliteral targets.
- Other computed property names and unrelated objects are not classified as module loads.
- No inspected source executes and no provider or external transport is used.
