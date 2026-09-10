import { createHash } from "node:crypto";
import { z } from "zod";

/** Pure OFF foundation. These comparisons do not authenticate an SMS or authorize Google. */
export const SMS_CALENDAR_CONFIRMATION_VERSION = "ENDVERA_CALENDAR_CONFIRM_V1" as const;
const id = z.string().min(1).max(191), hashValue = z.string().regex(/^[a-f0-9]{64}$/);
const date = z.string().datetime({ offset: true });
const positiveVersion = z.number().int().positive();
const phone = z.string().regex(/^\+[1-9]\d{7,14}$/);
const bindingSchema = z.object({
  owner: z.object({ workspaceId: id, userId: id, memberId: id, memberRole: z.literal("owner"), memberRevision: date, workspaceRevision: date,
    identityId: id, identityRevision: date, smsAccountId: id,
    smsAccountVersion: positiveVersion, smsInboundGrantId: id, smsInboundGrantVersion: positiveVersion,
    ownerNumber: phone, endveraNumber: phone }).strict(),
  source: z.object({ operationId: id, requestHash: hashValue, providerMessageId: z.string().regex(/^SM[a-f0-9]{32}$/),
    modelChildOperationId: id, reviewActionId: id }).strict(),
  calendar: z.object({ operationId: id, requestHash: hashValue, requestId: z.string().uuid(), accountId: id,
    accountVersion: positiveVersion, credentialId: id, writeGrantId: id, writeGrantVersion: positiveVersion }).strict(),
  draft: z.object({ title: z.string().min(1).max(240).refine(value => value.trim() === value && !/[\r\n\u0000-\u001f\u007f]/.test(value)),
    startsAt: date, endsAt: date, timezone: z.string().min(1).max(80).refine(value => value.trim() === value) }).strict(),
  policyVersion: z.literal(SMS_CALENDAR_CONFIRMATION_VERSION),
}).strict();
export type SmsCalendarConfirmationBinding = z.infer<typeof bindingSchema>;
const sha = (value: string) => createHash("sha256").update(value).digest("hex");

// 64 public, lowercase, accent-free words. No user ID, phone number or technical UUID in the phrase.
const words = Object.freeze("abricot acacia aigle amande ananas ancre arbre atlas aurore avoine azur baleine bambou banane bateau bison bouleau branche brique bronze cacao cactus canard caramel castor cerise chalet chardon chemin cheval citron cuivre dune erable etoile falaise feuille fleur foret fraise framboise galet gazelle glacier hibou hiver jardin jasmin lac laine lapin lavande lilas lion loutre lune menthe merle miel moulin neige nuage olive opale".split(" "));

function phraseFromEntropy(hex: string): string {
  if (!/^[a-f0-9]{6}$/.test(hex) || words.length !== 64) throw new Error("CONFIRMATION_ENTROPY_REQUIRED");
  const value = BigInt(`0x${hex}`);
  const selected = Array.from({ length: 4 }, (_, index) => words[Number(value >> BigInt((3 - index) * 6) & 63n)]);
  return `CONFIRME ENDVERA AGENDA ${selected.join(" ")}`;
}
function freezeDeep<T>(value: T): Readonly<T> {
  if (value && typeof value === "object") { for (const child of Object.values(value)) freezeDeep(child); Object.freeze(value); }
  return value;
}
function checkedBinding(raw: unknown) {
  const binding = bindingSchema.parse(raw);
  const { draft, calendar } = binding;
  const start = Date.parse(draft.startsAt), end = Date.parse(draft.endsAt);
  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) throw new Error("CONFIRMATION_INTERVAL_INVALID");
  const expectedHash = sha(JSON.stringify({ ...draft, accountVersion: calendar.accountVersion, requestId: calendar.requestId }));
  if (expectedHash !== calendar.requestHash) throw new Error("CONFIRMATION_DRAFT_HASH_CHANGED");
  // No default timezone: unsupported Intl/zone fails preparation before any summary exists.
  const formatter = new Intl.DateTimeFormat("fr-CA", { timeZone: draft.timezone, calendar: "gregory", numberingSystem: "latn", dateStyle: "full", timeStyle: "long" });
  return { binding, localStart: formatter.format(start), localEnd: formatter.format(end) };
}
function namespace(binding: SmsCalendarConfirmationBinding) {
  const owner = binding.owner;
  // Re-pairing, ownership/workspace moves and protocol upgrades must NOT reset
  // the permanent registry for the same visible SMS conversation.
  return sha(JSON.stringify(["ENDVERA_CALENDAR_CONFIRMATION", owner.ownerNumber, owner.endveraNumber]));
}
function summary(binding: SmsCalendarConfirmationBinding, phrase: string, localStart: string, localEnd: string) {
  return `Rendez-vous à vérifier : ${binding.draft.title}\nDébut : ${localStart}\nFin : ${localEnd}\nFuseau : ${binding.draft.timezone}\nValeurs exactes : ${binding.draft.startsAt} / ${binding.draft.endsAt}\nPour confirmer uniquement ce rendez-vous, réponds exactement :\n${phrase}\nAucun ajout n’est encore confirmé. Cette demande expire dans au plus dix minutes.`;
}
const preparedSchema = z.object({ status: z.literal("PREPARED_LOCAL_OFF"), executionAuthorized: z.literal(false), requiresDurableUniqueness: z.literal(true),
  binding: bindingSchema, bindingHash: hashValue, phrase: z.string().max(200), namespace: hashValue, nonReuseKey: hashValue,
  summary: z.string().min(1).max(1500), summaryHash: hashValue, createdAt: date, expiresAt: date }).strict();
export type PreparedSmsCalendarConfirmation = z.infer<typeof preparedSchema>;

/** Three CSPRNG bytes supply correlation diversity, NOT authentication strength. Never model/user supplied. */
export function prepareSmsCalendarConfirmation(input: { binding: unknown; entropyHex: string; createdAt: string; expiresAt: string }): Readonly<PreparedSmsCalendarConfirmation> {
  const checked = checkedBinding(input.binding), phrase = phraseFromEntropy(input.entropyHex);
  const createdAt = date.parse(input.createdAt), expiresAt = date.parse(input.expiresAt);
  const ttl = Date.parse(expiresAt) - Date.parse(createdAt);
  if (!Number.isFinite(ttl) || ttl <= 0 || ttl > 600_000) throw new Error("CONFIRMATION_EXPIRY_INVALID");
  const scope = namespace(checked.binding), text = summary(checked.binding, phrase, checked.localStart, checked.localEnd);
  return freezeDeep(preparedSchema.parse({ status: "PREPARED_LOCAL_OFF", executionAuthorized: false, requiresDurableUniqueness: true,
    binding: checked.binding, bindingHash: sha(JSON.stringify(checked.binding)), phrase, namespace: scope, nonReuseKey: sha(JSON.stringify([scope, phrase])),
    summary: text, summaryHash: sha(text), createdAt, expiresAt }));
}

/** Reserves this namespace from model/legacy interpretation, including malformed confirmation attempts. */
export function isReservedCalendarConfirmationText(text: string): boolean {
  return /^\s*confirme\s+endvera\s+agenda\b/i.test(text);
}

export function inspectSmsCalendarConfirmation(input: { prepared: unknown; currentBinding: unknown; body: string; now: string;
  activeChallengeCount: number; phase: "PREPARED" | "WAITING" | "CONSUMED" | "COMPLETED" | "UNCERTAIN" | "EXPIRED" | "REFUSED" }) {
  const refuse = () => Object.freeze({ status: "REFUSED" as const, executionAuthorized: false as const });
  try {
    const prepared = preparedSchema.parse(input.prepared);
    if (input.phase !== "WAITING" || input.activeChallengeCount !== 1 || input.body !== prepared.phrase) return refuse();
    if (!/^CONFIRME ENDVERA AGENDA (?:[a-z]+ ){3}[a-z]+$/.test(prepared.phrase)
      || prepared.phrase.slice("CONFIRME ENDVERA AGENDA ".length).split(" ").some(word => !words.includes(word))) return refuse();
    const instant = Date.parse(date.parse(input.now)), created = Date.parse(prepared.createdAt), expires = Date.parse(prepared.expiresAt);
    if (!Number.isFinite(instant) || instant < created || instant >= expires || expires <= created || expires - created > 600_000) return refuse();
    const checked = checkedBinding(input.currentBinding), original = checkedBinding(prepared.binding);
    if (sha(JSON.stringify(checked.binding)) !== prepared.bindingHash || sha(JSON.stringify(original.binding)) !== prepared.bindingHash
      || prepared.namespace !== namespace(checked.binding) || prepared.nonReuseKey !== sha(JSON.stringify([prepared.namespace, prepared.phrase]))
      || prepared.summary !== summary(original.binding, prepared.phrase, original.localStart, original.localEnd) || sha(prepared.summary) !== prepared.summaryHash) return refuse();
    return Object.freeze({ status: "MATCHED_NOT_AUTHORIZED" as const, executionAuthorized: false as const,
      operationId: checked.binding.calendar.operationId, expectedRequestHash: checked.binding.calendar.requestHash,
      bindingHash: prepared.bindingHash, nonReuseKey: prepared.nonReuseKey });
  } catch { return refuse(); }
}
