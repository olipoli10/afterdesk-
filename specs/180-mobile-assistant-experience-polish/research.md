# Research Decisions

- Workspace `defaultLocale` is the authoritative language source after authentication; no new device-locale dependency is required.
- All secondary routes remain real Expo Router screens and are grouped, not removed.
- Recovery stays adjacent to the public error and calls an already-safe refresh or stable retry path.
- The change does not translate every historical diagnostic surface; it closes the primary daily experience first.

