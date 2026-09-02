# R35 Release Package Data Model

R35 adds no PostgreSQL state. All records are versioned, code-owned or generated
local artifacts.

## ReleaseDefinition

- schemaVersion
- releaseKey and releaseVersion
- productName
- targets: WEB, IOS, ANDROID
- environmentModes: LOCAL_INTERNAL, EXTERNAL_RELEASE
- readiness ceiling: LOCAL_PACKAGE_READY
- authority and forbiddenActions

## ApplicationIdentity

- target
- appName, slug and semanticVersion
- scheme
- iOS bundleIdentifier and buildNumber
- Android package and versionCode
- Web application key

## EnvironmentRequirement

- runtime: WEB_BUILD, WEB_RUNTIME, MOBILE_BUILD, MOBILE_RUNTIME
- variableName
- classification: PUBLIC_ORIGIN, SECRET, DATABASE, STORAGE, PROVIDER, OPERATOR
- requirement by mode
- serializableValue: always false for secrets
- readinessEffect

## AssetRecord

- kind
- repositoryRelativePath
- mediaType
- byteSize
- width and height
- sha256

## StoreListingDraft

- locale
- name, subtitle, shortDescription, fullDescription
- capabilityCodes and unavailableCapabilityCodes
- privacyPath, supportPath and securityPath
- claim boundary booleans

## PrivacyDisclosure

- dataClass
- collected
- purpose codes
- persistence class
- sharing state
- retention authority
- user controls
- tracking, advertising and sale booleans

## ReleaseManifest

- schemaVersion
- release definition hash
- source head and tree
- application identities
- environment contract hash
- sorted asset/listing/disclosure/runbook hashes
- validation commands
- readiness state
- signed/uploaded/published/deployed/providerObserved/externalEffectCount
- canonical manifest hash

## Invariants

- No absolute or parent-traversing path is serializable.
- No credential or environment value is serializable.
- Every referenced file exists inside the repository and matches SHA-256.
- Target and locale catalogs are closed and complete.
- All release-action and provider booleans remain false in R35.
- Same tracked inputs and source fingerprint produce the same bytes.
