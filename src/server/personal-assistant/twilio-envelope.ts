import "server-only";
import { createHash, createHmac, timingSafeEqual } from "node:crypto";

const SID = /^AC[0-9a-f]{32}$/i;
const MESSAGE_SID = /^SM[0-9a-f]{32}$/i;
const PHONE = /^\+[1-9][0-9]{7,14}$/;
export const MAX_TWILIO_BODY_BYTES = 32_768;

export class TwilioIngressRefused extends Error {
  constructor(public readonly code: string) { super(code); }
}

export type TwilioSmsEnvelope = Readonly<{
  accountSid: string;
  messageSid: string;
  from: string;
  to: string;
  body: string;
  contentHash: string;
}>;

// Protocol HMAC covers the exact configured public URL and ALL decoded fields.
// Never derive that URL from untrusted Host / X-Forwarded-* headers.
export function verifyTwilioFormSignature(input: {
  publicUrl: string;
  authToken: string;
  signature: string;
  fields: Readonly<Record<string, string>>;
}): boolean {
  if (!input.authToken || !/^[A-Za-z0-9+/]{27}=$/.test(input.signature)) return false;
  const canonical = Object.keys(input.fields).sort().reduce(
    (value, key) => value + key + input.fields[key], input.publicUrl,
  );
  const expected = createHmac("sha1", input.authToken).update(canonical, "utf8").digest();
  const actual = Buffer.from(input.signature, "base64");
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

export function parseSignedTwilioSms(input: {
  rawBody: string;
  contentType: string;
  signature: string;
  publicUrl: string;
  authToken: string;
  accountSid: string;
  number: string;
}): TwilioSmsEnvelope {
  if (!SID.test(input.accountSid) || !PHONE.test(input.number) || !input.authToken) {
    throw new TwilioIngressRefused("CONFIGURATION_REQUIRED");
  }
  let url: URL;
  try { url = new URL(input.publicUrl); }
  catch { throw new TwilioIngressRefused("CONFIGURATION_REQUIRED"); }
  if (url.protocol !== "https:" || url.username || url.password || url.hash) {
    throw new TwilioIngressRefused("CONFIGURATION_REQUIRED");
  }
  if (input.contentType.split(";", 1)[0].trim().toLowerCase() !== "application/x-www-form-urlencoded") {
    throw new TwilioIngressRefused("UNSUPPORTED_CONTENT_TYPE");
  }
  if (Buffer.byteLength(input.rawBody, "utf8") > MAX_TWILIO_BODY_BYTES) {
    throw new TwilioIngressRefused("BODY_TOO_LARGE");
  }
  const fields: Record<string, string> = Object.create(null);
  for (const [key, value] of new URLSearchParams(input.rawBody)) {
    // This endpoint expects scalar Messaging parameters. Reject pollution rather
    // than letting the verifier and the consumer choose different occurrences.
    if (Object.hasOwn(fields, key)) throw new TwilioIngressRefused("DUPLICATE_PARAMETER");
    fields[key] = value;
  }
  if (!verifyTwilioFormSignature({ ...input, fields })) {
    throw new TwilioIngressRefused("SIGNATURE_INVALID");
  }
  if (fields.AccountSid !== input.accountSid || fields.To !== input.number) {
    throw new TwilioIngressRefused("DESTINATION_MISMATCH");
  }
  if (!MESSAGE_SID.test(fields.MessageSid ?? "") || !PHONE.test(fields.From ?? "")) {
    throw new TwilioIngressRefused("INVALID_ENVELOPE");
  }
  // MMS requires authenticated media retrieval and scanning; never ignore an
  // attachment and silently apply only the text portion of a command.
  if (fields.NumMedia !== "0" || Object.keys(fields).some((key) => /^Media(?:Url|ContentType)\d+$/.test(key))) {
    throw new TwilioIngressRefused("MEDIA_NOT_ENABLED");
  }
  if (!fields.Body?.trim() || fields.Body.length > 10_000) {
    throw new TwilioIngressRefused("INVALID_MESSAGE");
  }
  const envelope = {
    accountSid: fields.AccountSid,
    messageSid: fields.MessageSid,
    from: fields.From,
    to: fields.To,
    body: fields.Body,
  };
  return Object.freeze({
    ...envelope,
    // Metadata may change on redelivery. Bind replay checks to message semantics.
    contentHash: createHash("sha256").update(JSON.stringify(envelope)).digest("hex"),
  });
}
