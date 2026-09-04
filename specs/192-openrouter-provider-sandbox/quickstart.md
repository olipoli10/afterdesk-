# Quickstart: R37 OpenRouter Provider Sandbox

## 1. Credential-free validation

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File specs/192-openrouter-provider-sandbox/scripts/validate-r37-openrouter-sandbox.ps1 -PreflightOnly
```

Expected terminal state: `CREDENTIAL_REQUIRED` and zero external requests.

## 2. Install the local credential safely

Create a dedicated OpenRouter key with a 5 USD limit. Do not paste it into chat
or pass it on the command line. Start the secure local launcher:

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File scripts/start-r37-openrouter-sandbox-secure.ps1
```

Paste the key only at the masked prompt. The launcher injects it into the
validator process, removes it afterward and zeroes its temporary unmanaged
buffer. The value is absent from source, reports and command history.

## 3. Execute once

The launcher runs the completion validator exactly once. The runner must use a
fresh disposable PostgreSQL database, at most six calls, at most 5 USD, and
always revoke/disable/clean up.

Only a report produced from actual OpenRouter responses can return
`OPENROUTER_SANDBOX_OBSERVED_PASS`. Never rerun after an ambiguous attempted
dispatch; inspect the durable ledger and report first.

## 4. Stop conditions

Stop without retry on secret leakage, non-synthetic input, unexpected host/redirect/model, missing ZDR/data denial, provider fallback, ambiguous prior dispatch, budget breach, response schema drift, ledger mismatch or cleanup failure.
