# R35 Local Release Package Contract

R35 exposes no public mutation API. The contract is a local canonical artifact.

## Generate input

```json
{
  "mode": "LOCAL_INTERNAL",
  "sourceHead": "40 lowercase hexadecimal characters",
  "sourceTree": "40 lowercase hexadecimal characters",
  "environmentPresence": {
    "VARIABLE_NAME": true
  }
}
```

Only known variable names are accepted. Values are never accepted.

## Manifest output

```json
{
  "schemaVersion": 1,
  "releaseKey": "ENDVERA_CONSTRUCTION_V1",
  "releaseVersion": 1,
  "readiness": "LOCAL_PACKAGE_READY",
  "source": { "head": "...", "tree": "..." },
  "targets": ["WEB", "IOS", "ANDROID"],
  "identities": [],
  "inputs": [],
  "validationCommands": [],
  "signed": false,
  "uploaded": false,
  "published": false,
  "deployed": false,
  "providerObserved": false,
  "externalEffectCount": 0,
  "manifestHash": "..."
}
```

## Refusal codes

- `RELEASE_MODE_UNKNOWN`
- `RELEASE_SOURCE_FINGERPRINT_INVALID`
- `RELEASE_ENVIRONMENT_UNKNOWN`
- `RELEASE_ENVIRONMENT_MISSING`
- `RELEASE_SECRET_VALUE_REFUSED`
- `RELEASE_PATH_ESCAPE_REFUSED`
- `RELEASE_INPUT_MISSING`
- `RELEASE_INPUT_HASH_MISMATCH`
- `RELEASE_ASSET_DIMENSION_MISMATCH`
- `RELEASE_LOCALE_PARITY_MISMATCH`
- `RELEASE_DISCLOSURE_INCOMPLETE`
- `RELEASE_CLAIM_UNSUPPORTED`
- `RELEASE_ACTION_INFLATION_REFUSED`
- `RELEASE_MANIFEST_HASH_MISMATCH`

Every refusal leaves the last validated manifest untouched and produces zero
external effect.
