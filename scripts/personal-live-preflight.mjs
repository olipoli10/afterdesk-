import { pathToFileURL } from "node:url";

const groups = {
  backend: ["DATABASE_URL", "BETTER_AUTH_SECRET", "BETTER_AUTH_URL"],
  twilio: ["TWILIO_ACCOUNT_SID", "TWILIO_AUTH_TOKEN", "TWILIO_API_KEY_SID", "TWILIO_API_KEY_SECRET", "TWILIO_PHONE_NUMBER", "ENDVERA_TWILIO_SMS_WEBHOOK_URL"],
  google: ["GOOGLE_CLIENT_ID", "GOOGLE_CLIENT_SECRET", "GOOGLE_REDIRECT_URI", "ENDVERA_CONNECTOR_ENCRYPTION_KEY"],
  pilot: ["ENDVERA_PERSONAL_PILOT_EXPIRES_AT", "ENDVERA_PERSONAL_BUDGET_CAD", "ENDVERA_EXTERNAL_AUTHORITY_REF", "ENDVERA_EXTERNAL_OWNER_REF", "ENDVERA_PROVIDER_WEBHOOK_ORIGIN"],
  outbound: ["ENDVERA_TWILIO_STATUS_WEBHOOK_URL", "ENDVERA_TWILIO_RATE_REVIEW_REF", "ENDVERA_TWILIO_RATE_REVIEWED_AT", "ENDVERA_SMS_SEGMENT_RESERVE_CAD", "ENDVERA_VOICE_MINUTE_RESERVE_CAD"],
  worker: ["CRON_SECRET"],
};

// Explicitly select output fields. Never serialize the environment or values,
// never load credentials from arbitrary sibling worktrees or personal vaults.
/** @param {Readonly<Record<string, string | undefined>>} env */
export function personalLivePreflight(env = process.env, now = Date.now()) {
  const configuration = Object.fromEntries(Object.entries(groups).map(([group, names]) => [group,
    names.map(name => ({ name, present: typeof env[name] === "string" && env[name].trim().length > 0 })),
  ]));
  const missing = Object.values(configuration).flat().filter(item => !item.present).map(item => item.name);
  const deadline = Date.parse(env.ENDVERA_PERSONAL_PILOT_EXPIRES_AT ?? "");
  const budget = Number(env.ENDVERA_PERSONAL_BUDGET_CAD);
  const errors = [];
  for (const name of ["BETTER_AUTH_URL", "ENDVERA_TWILIO_SMS_WEBHOOK_URL", "GOOGLE_REDIRECT_URI"]) {
    if (!env[name]) continue;
    try {
      const url = new URL(env[name]);
      if (url.protocol !== "https:" || url.username || url.password || url.hash) errors.push(`${name}:HTTPS_URL_REQUIRED`);
    } catch { errors.push(`${name}:INVALID_URL`); }
  }
  if (!Number.isFinite(deadline) || deadline <= now) errors.push("PILOT_EXPIRY_REQUIRED");
  if (!Number.isFinite(budget) || budget <= 0) errors.push("POSITIVE_CAD_BUDGET_REQUIRED");
  return {
    schemaVersion: 1,
    checkedAt: new Date(now).toISOString(),
    status: missing.length || errors.length ? "CONFIGURATION_REQUIRED" : "CONFIGURATION_PRESENT_UNVERIFIED",
    configuration, missing, errors,
    liveReady: false,
    unresolvedEvidence: ["HTTPS_BACKEND_LOGIN", "VERIFIED_PHONE_BINDING", "SMS_RECEIPT", "GOOGLE_CONSENT_AND_CALENDAR_SYNC", "APPROVED_OUTBOUND_SMS", "APPROVED_VOICE_CALL", "SAMSUNG_LOGIN"],
    providerCallsPerformed: 0,
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  console.log(JSON.stringify(personalLivePreflight(), null, 2));
}
