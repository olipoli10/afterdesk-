# ENDVERA Mobile

One Expo codebase targets iOS and Android. The existing Next.js application remains the canonical server.

## Local use

1. Set `EXPO_PUBLIC_ENDVERA_API_URL` to the local ENDVERA server URL reachable by the device or emulator.
2. Run `npm start` from this directory.
3. Sign in with an existing local ENDVERA client account.

The app stores only Better Auth session material in native SecureStore. Cockpit, financial, message, and command state stays in memory and is refreshed from PostgreSQL-backed APIs. External SMS, email, calls, calendar writes, payments, EAS builds, and store distribution are outside R8 authority.
