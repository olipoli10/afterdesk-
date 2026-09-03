# R37Y — Provider loader factory assignment guard

## Objective

Track loaders assigned after declaration from a known `createRequire` factory or tracked module namespace factory call.

## Acceptance

- Assigned loader factory results retain computed-target refusal and literal-target visibility.
- Prior declaration-based loader behavior remains unchanged.
- Zero provider, credential, network, customer data or external write.

