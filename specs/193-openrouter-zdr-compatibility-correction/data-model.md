# Data Model: OpenRouter ZDR Compatibility Correction

## EndpointSnapshot

- `modelId`: exact allowlisted model slug
- `capturedAtUtc`: timestamp of the public inventory observation
- `sourceUrls`: exact OpenRouter public endpoints used
- `totalEndpointCount`: all endpoints currently serving the model
- `zdrEndpoints`: endpoints present in the public ZDR inventory

## ZdrEndpoint

- `providerName`: human-readable provider
- `tag`: stable routing tag
- `status`: provider health status at capture time
- `supportedParameters`: exact advertised request fields

## CompatibilityDecision

- `modelId`
- `modelExists`
- `eligibleEndpointTags`
- `excludedEndpointReasons`
- `requiredParameters`
- `incompatibleR37Parameters`
- `correctedParameter`
- `evidenceLabel`

## State transitions

`PUBLIC_METADATA_CAPTURED → VALIDATED → COMPATIBILITY_PROVEN`

Any missing model, malformed endpoint, stale date, unsupported required parameter or R37 report hash drift transitions to `REFUSED`.
