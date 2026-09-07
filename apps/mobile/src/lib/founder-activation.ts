import { z } from "zod";

const requiredConfigurationName = z.enum([
  "TWILIO_ACCOUNT_SID",
  "TWILIO_API_KEY_SID",
  "TWILIO_API_KEY_SECRET",
  "TWILIO_AUTH_TOKEN",
  "TWILIO_PHONE_NUMBER",
  "ENDVERA_PROVIDER_WEBHOOK_ORIGIN",
]);

export const founderActivationReadinessSchema = z.object({
  schemaVersion: z.literal(1),
  status: z.enum(["CODE_READY_EXTERNAL_SETUP_REQUIRED", "LIVE_SELF_PILOT_READY"]),
  mobile: z.object({
    appName: z.literal("ENDVERA"),
    iosBundleIdentifier: z.literal("ai.endvera.mobile"),
    androidPackage: z.literal("ai.endvera.mobile"),
    founderBuildProfile: z.literal("founder-device"),
    signed: z.boolean(),
    installedOnFounderDevice: z.boolean(),
  }).strict(),
  devicePermissions: z.array(z.object({
    resource: z.enum(["CONTACTS", "CALENDAR"]),
    requestMode: z.enum(["PROGRESSIVE_NATIVE", "PROGRESSIVE_NATIVE_READ_WRITE"]),
    declared: z.boolean(),
    observedGranted: z.boolean(),
  }).strict()).length(2),
  dedicatedNumber: z.object({
    providerCandidate: z.literal("TWILIO"),
    numberProvisioned: z.boolean(),
    smsVerified: z.boolean(),
    voiceVerified: z.boolean(),
    regulatoryApprovalObserved: z.boolean(),
    requiredConfigurationNames: z.array(requiredConfigurationName).length(6),
  }).strict(),
  calendar: z.object({
    nativeDevicePathDeclared: z.boolean(),
    directGoogleOAuthConfigured: z.boolean(),
    directGoogleOAuthObserved: z.boolean(),
  }).strict(),
  requiredOwnerActions: z.array(z.string().min(1)).min(1),
  claims: z.object({
    codeReady: z.boolean(),
    signedBuildReady: z.boolean(),
    liveNumberReady: z.boolean(),
    liveSelfPilotReady: z.boolean(),
    storePublished: z.boolean(),
    externalTransportPerformed: z.boolean(),
    providerObserved: z.boolean(),
  }).strict(),
}).strict();

export function parseFounderActivationReadiness(value: unknown) {
  const parsed = founderActivationReadinessSchema.parse(value);
  if (parsed.claims.signedBuildReady !== parsed.mobile.signed || (parsed.mobile.installedOnFounderDevice && !parsed.mobile.signed)) {
    throw new Error("FOUNDER_ACTIVATION_SIGNED_BUILD_CLAIM_MISMATCH");
  }
  const live = parsed.mobile.signed && parsed.mobile.installedOnFounderDevice &&
    parsed.devicePermissions.every((item) => item.observedGranted) &&
    parsed.dedicatedNumber.numberProvisioned && parsed.dedicatedNumber.smsVerified &&
    parsed.dedicatedNumber.voiceVerified && parsed.dedicatedNumber.regulatoryApprovalObserved;
  if (parsed.status === "LIVE_SELF_PILOT_READY" && (!live || !parsed.claims.liveSelfPilotReady)) {
    throw new Error("FOUNDER_ACTIVATION_CLAIM_INFLATION_REFUSED");
  }
  if (parsed.claims.externalTransportPerformed || parsed.claims.providerObserved || parsed.claims.storePublished) {
    throw new Error("FOUNDER_ACTIVATION_UNOBSERVED_CLAIM_REFUSED");
  }
  return parsed;
}
