# Research: R8 Mobile Foundation

## Decision 1 — Shared native framework

**Decision**: Use stable Expo SDK 57 with React Native and Expo Router for one iOS/Android codebase.

**Rationale**: React Native recommends using a framework for new applications and identifies Expo as the recommended community framework. Expo SDK 57 is the stable SDK documented on 2026-09-01, targets React Native 0.86/React 19.2.3, Android 7+, and iOS 16.4+. SDK 55+ uses the New Architecture exclusively.

**Alternatives considered**: Separate Swift/Kotlin applications would duplicate product logic and slow iteration. Bare React Native would require maintaining framework concerns that Expo already provides. A responsive web wrapper would not establish the native security and lifecycle foundation requested.

**Primary sources (retrieved 2026-09-01)**:

- https://docs.expo.dev/versions/latest/
- https://reactnative.dev/blog/2024/06/25/use-a-framework-to-build-react-native-apps
- https://docs.expo.dev/guides/new-architecture/

## Decision 2 — Mobile authentication

**Decision**: Reuse Better Auth through its official Expo server/client plugin pinned to the repository's 1.6.25 line. Store session cookies/cache in Expo SecureStore. Add the fixed `endvera://` origin and development-only Expo origins; do not add bearer tokens or a second auth system.

**Rationale**: Better Auth's official Expo integration supports native cookie management through SecureStore and authenticated requests back to the existing server. Expo documents SecureStore for small secrets such as tokens and keys. This preserves database-backed revocation and avoids password persistence.

**Alternatives considered**: A custom mobile token exchange creates a second security protocol. The Better Auth bearer plugin is unnecessary and expands risk. Persisting cookies in AsyncStorage is unencrypted and unacceptable.

**Primary sources (retrieved 2026-09-01)**:

- https://better-auth.com/docs/integrations/expo
- https://docs.expo.dev/develop/user-interface/store-data/
- https://docs.expo.dev/versions/latest/sdk/securestore/

## Decision 3 — Navigation and protected state

**Decision**: Use Expo Router protected routes driven by the Better Auth session. Protected content is not mounted until session resolution succeeds.

**Rationale**: Expo Router provides current protected-route primitives and redirects inaccessible routes to the sign-in route, including deep links.

**Alternatives considered**: Manual redirect effects are more error-prone and can momentarily mount protected screens.

**Primary source (retrieved 2026-09-01)**: https://docs.expo.dev/router/advanced/authentication/

## Decision 4 — Canonical data and offline behavior

**Decision**: Keep PostgreSQL/R7 as the only operational source of truth. Cache only the secure auth session. Keep cockpit state in memory and show an explicit unavailable state when a refresh cannot establish current state.

**Rationale**: SecureStore is intended for small secrets and may reject large values. AsyncStorage is unencrypted. A correct encrypted offline financial cache requires a separate threat model and native database key lifecycle; pretending a stale plaintext cache is safe would violate the constitution.

**Alternatives considered**: AsyncStorage was rejected for sensitive data. SecureStore was rejected for large cockpit payloads. SQLCipher is deferred because it requires a custom development build and a separate key/recovery design.

## Decision 5 — Application/API boundary

**Decision**: Add one read-only versioned mobile bootstrap endpoint for active workspace discovery. Continue using the R7 cockpit and command endpoint for all operational state and writes. The mobile client performs strict boundary parsing and never imports server modules.

**Rationale**: R7 currently requires a workspace ID but the phone cannot safely invent or persist membership. A server-derived bootstrap closes that gap without duplicating business logic.

**Alternatives considered**: Hard-coded workspace IDs and client-provided roles are rejected. Expanding R7 GET semantics would make discovery and cockpit responsibilities ambiguous.
