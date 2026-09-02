# R36 Internal E2E Report Contract

```json
{
  "schemaVersion": 1,
  "scenarioKey": "ENDVERA_CONSTRUCTION_INTERNAL_E2E",
  "scenarioVersion": 1,
  "scenarioHash": "64 lowercase hex",
  "source": { "head": "40 lowercase hex", "tree": "40 lowercase hex" },
  "databaseMode": "DISPOSABLE_POSTGRESQL",
  "checkpoints": [
    {
      "sequence": 1,
      "code": "ONBOARDING_READY",
      "state": "PASS",
      "observed": "sanitized scalar or closed object",
      "canonicalFingerprint": "64 lowercase hex",
      "externalEffectCount": 0
    }
  ],
  "preRestartFingerprint": "64 lowercase hex",
  "postRestartFingerprint": "64 lowercase hex",
  "providerObserved": false,
  "externalEffectCount": 0,
  "verdict": "INTERNAL_SYNTHETIC_E2E_PASS",
  "reportHash": "64 lowercase hex"
}
```

## Mandatory checkpoint codes

1. `ONBOARDING_READY`
2. `CLEAR_APPOINTMENT_STORED_ONCE`
3. `AMBIGUITY_CLARIFIED_NO_WRITE`
4. `INVOICE_EVIDENCE_GAPS_BLOCKED`
5. `CONTRADICTION_PRESERVED`
6. `AUTHORIZED_RESOLUTION_RECORDED`
7. `READY_TO_INVOICE_EXACT`
8. `PREPARED_ACTIONS_ZERO_DELIVERY`
9. `HUMAN_ESCALATION_RESUMED_ONCE`
10. `DUPLICATE_REPLAY_REFUSED`
11. `RESTART_FINGERPRINT_IDENTICAL`
12. `FIELD_FINANCIAL_LEAK_ZERO`
13. `CROSS_WORKSPACE_REFUSED`
14. `WEB_IOS_ANDROID_PARITY`
15. `FINAL_NEXT_ACTION_DETERMINISTIC`
16. `PACKAGE_STILL_VALID`

Any missing, duplicate, failed or reordered checkpoint forces
`INTERNAL_SYNTHETIC_E2E_FAIL`.
