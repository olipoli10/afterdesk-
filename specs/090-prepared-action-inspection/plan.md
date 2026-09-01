# R10 Plan — Exact Prepared-Action Inspection

## Objective

Expose one strict owner/office-manager prepared-action projection containing the
exact recipient, channel, body, version, payload fingerprint, source provenance,
approval state and a literal `externalTransportPerformed: false`. Preserve the
existing field-worker projection without message body, financial data or hidden
payload fields.

## Allowed implementation

- add strict R10 contracts and a server projection service;
- compose the projection into the authenticated shared cockpit;
- add focused contract and disposable-PostgreSQL proof;
- preserve the existing ConstructionAction table and provider-neutral payload.

## Completion gate

- authorized owner/office can inspect exact recipient/channel/body/provenance;
- field worker receives no sensitive payload;
- cross-workspace access is refused;
- unknown fields and any transport=true response are rejected;
- no schema, migration, dependency, provider or network change.

