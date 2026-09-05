# Quickstart: Validate R37B locally

No credential is required or permitted.

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File specs/193-openrouter-zdr-compatibility-correction/scripts/validate-r37bb-openrouter-zdr-compatibility.ps1
```

Expected terminal state:

```text
R37BB_STATE=LOCAL_COMPATIBILITY_CORRECTION_PASS
R37BB_PROVIDER_GENERATION_CALLS=0
R37BB_SPEND_MICROS=0
R37_SEAL_PRESERVED=true
```

This proves local compatibility preparation only. It does not authorize or execute another OpenRouter generation request.
