# ENDVERA Mobile

One Expo codebase targets iOS and Android. The existing Next.js application remains the canonical server.

## Local use

1. Set `EXPO_PUBLIC_ENDVERA_API_URL` to the local ENDVERA server URL reachable by the device or emulator.
2. Run `npm start` from this directory.
3. Sign in with an existing local ENDVERA client account.

The app stores only Better Auth session material in native SecureStore. Cockpit, financial, message, and command state stays in memory and is refreshed from PostgreSQL-backed APIs.

## Local release package

The shared application identity is `ai.endvera.mobile` on iOS and Android.
A signed founder build without `EXPO_PUBLIC_ENDVERA_API_URL` opens in a
fail-closed configuration state instead of crashing or attempting a guessed
server. Sign-in remains disabled until an approved HTTPS backend origin is
embedded in a later build.
R35 records version/build metadata, assets, bilingual listing drafts, privacy
disclosures and local build runbooks in the repository. The package is not
signed, uploaded, published, deployed or observed through a store.

External SMS, email, calls, calendar writes, payments, EAS actions, signing,
store distribution, Preview and Production remain outside local authority.
