export const MOBILE_RELEASE_INFO = {
  schemaVersion: 1,
  productName: "ENDVERA",
  semanticVersion: "0.1.0",
  ios: { bundleIdentifier: "ai.endvera.mobile", buildNumber: "1" },
  android: { package: "ai.endvera.mobile", versionCode: 1 },
  publicPaths: {
    privacy: "/privacy",
    security: "/security",
    support: "/construction/support",
    accountDeletion: "/client/privacy",
  },
  readiness: "LOCAL_PACKAGE_READY",
  signed: false,
  uploaded: false,
  published: false,
  deployed: false,
  providerObserved: false,
  externalEffectCount: 0,
} as const;

export function mobileReleaseLabel(platform: "ios" | "android") {
  return platform === "ios"
    ? `${MOBILE_RELEASE_INFO.semanticVersion} (${MOBILE_RELEASE_INFO.ios.buildNumber})`
    : `${MOBILE_RELEASE_INFO.semanticVersion} (${MOBILE_RELEASE_INFO.android.versionCode})`;
}
