# Baseline

- Current app config uses `assets/images/icon.png`; the R35 packager still required `assets/expo.icon` for iOS and failed `RELEASE_IDENTITY_MISMATCH`.
- Release definition still labeled the app icon as a placeholder and used `/client/privacy` for account deletion.
- No Expo locale metadata files existed.
- Windows host observation: no Android SDK, JDK, adb or EAS executable; iOS simulator binaries require macOS/Xcode.

