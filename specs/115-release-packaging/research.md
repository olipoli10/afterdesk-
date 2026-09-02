# R35 Research and decisions

## Existing product facts

- One Expo application already targets iOS and Android with bundle/package
  identifier `ai.endvera.mobile`, scheme `endvera` and local icon/splash assets.
- The Expo project has no EAS project/owner, signing reference or store action.
- Mobile runtime configuration currently accepts one API origin and requires
  HTTPS outside development.
- The Web application already exposes `/privacy` and `/security`; R30 owns
  privacy/export/deletion controls and R34 owns honest Construction claims.
- Root and mobile lockfiles are stable and R35 needs no new package.

## Decisions

### D1 — Tracked release package, not a deployment system

R35 produces canonical JSON, metadata and runbooks. It does not invoke a hosted
build or deployment service. This proves packaging correctness without
confusing configuration with an observed release.

### D2 — Presence-only environment reports

Validators receive names and presence booleans. They never echo or persist
values. Public origins are stored only as unresolved route requirements until
later authority chooses real HTTPS hosts.

### D3 — Static candidate identity with explicit increments

App identifiers remain stable. Build number/version code are explicit positive
integers in the Expo config and manifest. R35 does not reserve or submit them
to Apple or Google.

### D4 — Store metadata as structured bilingual drafts

`fr-CA` and `en-CA` JSON files share one capability/status code catalog.
Validation compares codes and booleans, not translated prose bytes.

### D5 — Privacy disclosure is product-specific and closed

The structured disclosure covers ENDVERA Construction data classes and points
to canonical R30 controls. It records no tracking, advertising, sale or broad
device/contact/mailbox collection.

### D6 — Tamper evidence binds inputs, not generated timestamps

The canonical manifest excludes wall-clock generation time. It binds source
HEAD/TREE plus sorted input hashes so identical tracked state regenerates
byte-for-byte.

### D7 — Local readiness is the maximum possible verdict

R35 can reach `LOCAL_PACKAGE_READY`. Signing, upload, store review, provider
observation, public deployment and Production remain false regardless of test
volume.
