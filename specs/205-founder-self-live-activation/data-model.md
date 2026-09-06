# Data Model: Founder self live activation

## DevicePermissionState

- `resource`: CONTACTS or CALENDAR
- `status`: UNDETERMINED, DENIED, GRANTED or UNAVAILABLE
- `canAskAgain`
- `lastCheckedAt`
- No contact or calendar values are included.

## FounderActivationReadiness

- `schemaVersion`
- `status`: CODE_READY_EXTERNAL_SETUP_REQUIRED or LIVE_SELF_PILOT_READY
- per-platform install profile and signing state
- native protected-resource declarations
- dedicated-number provider requirements
- direct calendar connector requirements
- invariant and evidence flags

## ExternalCapabilityAuthority

- `capability`: AI, EMAIL, GOOGLE_OAUTH, SMS or VOICE
- global transport gate
- capability gate
- authority reference
- owner reference
- required configuration names
- decision and missing requirements

## State transitions

1. Code prepared -> signed internal build -> installed physical build.
2. Permission undetermined -> granted or denied -> optionally revoked.
3. Number unconfigured -> compliance pending -> provisioned -> SMS/voice verified.
4. Action prepared -> approved -> dispatched -> provider-confirmed or failed.
