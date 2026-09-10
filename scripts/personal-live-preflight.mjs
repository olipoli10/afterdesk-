import { pathToFileURL } from "node:url";

const groups = {
  backend: ["DATABASE_URL", "BETTER_AUTH_SECRET", "BETTER_AUTH_URL"],
  twilio: ["TWILIO_ACCOUNT_SID", "TWILIO_AUTH_TOKEN", "TWILIO_API_KEY_SID", "TWILIO_API_KEY_SECRET", "TWILIO_PHONE_NUMBER", "ENDVERA_TWILIO_SMS_WEBHOOK_URL"],
  google: ["GOOGLE_CLIENT_ID", "GOOGLE_CLIENT_SECRET", "GOOGLE_REDIRECT_URI", "ENDVERA_CONNECTOR_ENCRYPTION_KEY"],
  pilot: ["ENDVERA_PERSONAL_PILOT_EXPIRES_AT", "ENDVERA_PERSONAL_BUDGET_CAD", "ENDVERA_EXTERNAL_AUTHORITY_REF", "ENDVERA_EXTERNAL_OWNER_REF", "ENDVERA_PROVIDER_WEBHOOK_ORIGIN"],
  outbound: ["ENDVERA_TWILIO_STATUS_WEBHOOK_URL", "ENDVERA_TWILIO_RATE_REVIEW_REF", "ENDVERA_TWILIO_RATE_REVIEWED_AT", "ENDVERA_SMS_SEGMENT_RESERVE_CAD", "ENDVERA_VOICE_MINUTE_RESERVE_CAD"],
  worker: ["CRON_SECRET"],
};

// These are public switch names and exact expected literals, not credential values.
// A requested switch never proves the actor's grant, a usable key, or an effect.
const globalTransport = ["ENDVERA_EXTERNAL_TRANSPORT_ENABLED", "ENABLED"];
const smsProvider = ["ENDVERA_SMS_PROVIDER_ENABLED", "ENABLED"];
const worker = ["ENDVERA_PERSONAL_SMS_WORKER_ENABLED", "true"];
const automaticReplies = ["ENDVERA_PERSONAL_AUTOMATIC_REPLIES_ENABLED", "true"];
const outbound = ["ENDVERA_PERSONAL_OUTBOUND_ENABLED", "true"];
const store = ["ENDVERA_CALENDAR_SMS_CONFIRMATION_STORE_ENABLED", "true"];
const switchGroups = {
  smsIngress: [globalTransport, smsProvider, ["ENDVERA_PERSONAL_SMS_INGRESS_ENABLED", "true"]],
  smsWorker: [globalTransport, smsProvider, worker],
  automaticSelfReplies: [globalTransport, smsProvider, worker, outbound, automaticReplies],
  googleCalendar: [globalTransport, ["ENDVERA_GOOGLE_OAUTH_ENABLED", "ENABLED"]],
  openRouterIntent: [globalTransport, ["ENDVERA_PERSONAL_MODEL_ENGINE_ENABLED", "true"], ["ENDVERA_PERSONAL_MODEL_EXTERNAL_TRANSPORT_ENABLED", "true"]],
  calendarSmsConfirmation: [globalTransport, smsProvider, worker, outbound, automaticReplies, ["ENDVERA_GOOGLE_OAUTH_ENABLED", "ENABLED"], store,
    ["ENDVERA_CALENDAR_SMS_CONFIRMATION_BRIDGE_ENABLED", "true"], ["ENDVERA_CALENDAR_SMS_CONFIRMATION_WORKER_ENABLED", "true"]],
  confirmationMaintenance: [store, ["ENDVERA_CALENDAR_SMS_CONFIRMATION_MAINTENANCE_ENABLED", "true"]],
  uncertainActionRecovery: [["ENDVERA_PERSONAL_ACTION_RECOVERY_ENABLED", "true"]],
  selfVoice: [globalTransport, ["ENDVERA_VOICE_PROVIDER_ENABLED", "ENABLED"], outbound],
};

/** Presence-only and literal-switch diagnostics. Never imports the application,
 * connects to a database, provisions secrets or calls a provider. */
function capabilitySwitchProjection(env) {
  return Object.fromEntries(Object.entries(switchGroups).map(([name, requirements]) => {
    const switches = requirements.map(([name, expected]) => ({ name, requested: env[name] === expected }));
    const missingSwitches = switches.filter(item => !item.requested).map(item => item.name);
    const anyRequested = switches.some(item => item.name !== globalTransport[0] && item.requested);
    return [name, { status: missingSwitches.length === 0 ? "REQUESTED_UNVERIFIED" : anyRequested ? "PARTIALLY_REQUESTED" : "DISABLED",
      switches, missingSwitches, executionAuthorized: false }];
  }));
}

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
    schemaVersion: 2,
    checkedAt: new Date(now).toISOString(),
    status: missing.length || errors.length ? "CONFIGURATION_REQUIRED" : "CONFIGURATION_PRESENT_UNVERIFIED",
    configuration, missing, errors,
    capabilitySwitches: capabilitySwitchProjection(env),
    optionalConfiguration: { model: [{ name: "ENDVERA_PERSONAL_MODEL_CONFIGURATION_JSON",
      present: typeof env.ENDVERA_PERSONAL_MODEL_CONFIGURATION_JSON === "string" && env.ENDVERA_PERSONAL_MODEL_CONFIGURATION_JSON.trim().length > 0 }] },
    // OpenRouter's key is encrypted per owner in PostgreSQL, not inferred from
    // a process variable or read from disk by this diagnostic.
    databaseEvidenceChecked: false,
    liveReady: false,
    unresolvedEvidence: ["HTTPS_BACKEND_LOGIN", "VERIFIED_PHONE_BINDING", "SMS_RECEIPT", "GOOGLE_CONSENT_AND_CALENDAR_SYNC", "APPROVED_OUTBOUND_SMS", "APPROVED_VOICE_CALL", "SAMSUNG_LOGIN",
      "CURRENT_MODEL_RATE_AND_BUDGET_POLICY", "OWNER_MODEL_CONSENT_AND_ENCRYPTED_CREDENTIAL", "CALENDAR_CONFIRMATION_MIGRATION_AND_GRANTS", "EXACT_SMS_CONFIRMATION_OBSERVED", "NATIVE_DATABASE_CONCURRENCY"],
    providerCallsPerformed: 0,
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  console.log(JSON.stringify(personalLivePreflight(), null, 2));
}
