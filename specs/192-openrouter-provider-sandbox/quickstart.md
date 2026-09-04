# Quickstart: R37 OpenRouter Provider Sandbox

## 1. Credential-free validation

```powershell
pwsh specs/192-openrouter-provider-sandbox/scripts/validate-r37-openrouter-sandbox.ps1 -PreflightOnly
```

Expected terminal state: `CREDENTIAL_REQUIRED` and zero external requests.

## 2. Install the local credential safely

Create a dedicated OpenRouter key with a 5 USD limit. Do not paste it into chat or pass it on the command line. In a fresh private PowerShell session, set it only for that process:

```powershell
$env:R37_OPENROUTER_CONTROLLER_API_KEY = Read-Host 'OpenRouter R37 key' -MaskInput
```

The value is intentionally absent from source, reports and command history.

## 3. Execute once

In the same private PowerShell session, run the completion validator exactly
once:

```powershell
pwsh specs/192-openrouter-provider-sandbox/scripts/validate-r37-openrouter-sandbox.ps1 -RequireComplete
```

The runner must use a fresh disposable PostgreSQL database, at most six calls, at most 5 USD, and always revoke/disable/clean up.

Only a report produced from actual OpenRouter responses can return
`OPENROUTER_SANDBOX_OBSERVED_PASS`. Never rerun after an ambiguous attempted
dispatch; inspect the durable ledger and report first.

## 4. Stop conditions

Stop without retry on secret leakage, non-synthetic input, unexpected host/redirect/model, missing ZDR/data denial, provider fallback, ambiguous prior dispatch, budget breach, response schema drift, ledger mismatch or cleanup failure.
