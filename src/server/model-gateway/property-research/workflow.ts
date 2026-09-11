import "server-only";
import { canonicalFingerprint } from "../evidence";
import { normalizeAssistantText } from "@/lib/sms-assistant/routing";
import { propertyRequestSchema, addressResolutionSchema, parcelsSchema, assessmentSchema, businessSchema, propertyWebSchema,
  type PropertyRequest, type PropertySource, type PropertyTool, type PropertyReport, type RegisteredPropertySource,
  type ResolvedAddress } from "./contracts";

export type PropertyTools = Readonly<{
  resolve_address: (input: PropertyRequest, signal: AbortSignal) => Promise<unknown>;
  find_cadastral_lots: (input: ResolvedAddress, signal: AbortSignal) => Promise<unknown>;
  get_assessment_record: (input: { lotId: string; municipality: string }, signal: AbortSignal) => Promise<unknown>;
  search_web_with_sources: (input: { address: string; municipality: string }, signal: AbortSignal) => Promise<unknown>;
  lookup_quebec_business: (input: { businessNumber: string }, signal: AbortSignal) => Promise<unknown>;
}>;
export type PropertyToolReceipt = Readonly<{ tool: PropertyTool; inputHash: string; outputHash: string | null;
  status: "COMPLETED" | "UNAVAILABLE"; automaticRetry: false }>;

/** Read-only source workflow. No model-supplied function name or arbitrary URL
 * is executable. The tool registry owns transport, source rights and budgets.
 * Every failure retains its receipt; cancellation never causes automatic replay. */
export async function researchProperty(raw: unknown, options: {
  tools: PropertyTools; sources: readonly RegisteredPropertySource[]; mode: "SYNTHETIC" | "PERMITTED_PUBLIC";
  now: Date; signal: AbortSignal; timeoutMs?: number;
}) {
  const request = propertyRequestSchema.parse(raw);
  const now = options.now.getTime();
  const timeoutMs = options.timeoutMs ?? 20_000;
  if (!Number.isFinite(now) || !Number.isInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 60_000) throw new Error("PROPERTY_CLOCK_OR_DEADLINE_INVALID");
  const sources = structuredClone(options.sources);
  if (!sources.length || sources.some(s => s.usage !== options.mode || s.maxAgeMs <= 0 || !Number.isFinite(s.maxAgeMs)
    || normalizeAssistantText(s.municipality) !== normalizeAssistantText(request.municipality))) throw new Error("PROPERTY_MUNICIPALITY_OR_SOURCE_NOT_SUPPORTED");
  const receipts: PropertyToolReceipt[] = [];
  const findings: PropertyReport["findings"][number][] = [];
  const controller = new AbortController();
  let abort: () => void = () => undefined;
  const interrupted = new Promise<never>((_, reject) => { abort = () => { controller.abort(); reject(new Error("PROPERTY_WORK_INTERRUPTED")); }; });
  // Avoid an unhandled rejection between source calls while preserving race semantics.
  void interrupted.catch(() => undefined);
  options.signal.addEventListener("abort", abort, { once: true });
  const timer = setTimeout(abort, timeoutMs);
  const live = () => { if (options.signal.aborted || controller.signal.aborted) throw new Error("PROPERTY_WORK_INTERRUPTED"); };
  function inspectSource(source: PropertySource, tool: RegisteredPropertySource["tool"]) {
    const registered = sources.filter(s => s.sourceId === source.sourceId && s.tool === tool);
    if (registered.length !== 1 || !registered[0].allowedHosts.includes(new URL(source.url).hostname)) throw new Error("PROPERTY_SOURCE_NOT_REGISTERED");
    const observed = Date.parse(source.observedAt), effective = Date.parse(source.effectiveAt);
    if (observed > now || effective > now || effective > observed) throw new Error("PROPERTY_SOURCE_TIME_INVALID");
    if (now - observed > registered[0].maxAgeMs || now - effective > registered[0].maxAgeMs) {
      findings.push({ code: "SOURCE_STALE", subject: `${source.sourceId}:${source.documentVersion}` });
    }
  }
  async function run<T>(tool: RegisteredPropertySource["tool"], input: unknown, call: () => Promise<unknown>, inspect: (value: unknown) => T): Promise<T | null> {
    live();
    const inputHash = canonicalFingerprint(input);
    try {
      const result = await Promise.race([Promise.resolve().then(() => { live(); return call(); }), interrupted]);
      live();
      const parsed = inspect(result);
      receipts.push({ tool, inputHash, outputHash: canonicalFingerprint(parsed), status: "COMPLETED", automaticRetry: false });
      return parsed;
    } catch {
      receipts.push({ tool, inputHash, outputHash: null, status: "UNAVAILABLE", automaticRetry: false });
      findings.push({ code: "SOURCE_UNAVAILABLE", subject: tool });
      live();
      return null;
    }
  }
  function report(data: Omit<PropertyReport, "schemaVersion" | "requestId" | "workspaceId" | "findings" | "registeredOwnerStatus" | "observedAt" | "fingerprint" | "actionAuthority" | "evidenceMode">) {
    const content = { schemaVersion: 1 as const, requestId: request.requestId, workspaceId: request.workspaceId,
      ...data, findings, registeredOwnerStatus: "NOT_VERIFIED" as const, observedAt: options.now.toISOString(),
      evidenceMode: options.mode === "SYNTHETIC" ? "SYNTHETIC" as const : "PUBLIC_SOURCE_RECORDS" as const, actionAuthority: false as const };
    const result: PropertyReport = { ...content, fingerprint: canonicalFingerprint(content) };
    receipts.push({ tool: "create_property_report", inputHash: canonicalFingerprint(request), outputHash: result.fingerprint, status: "COMPLETED", automaticRetry: false });
    return { report: result, receipts };
  }
  try {
    live();
    const resolved = await run("resolve_address", request, () => options.tools.resolve_address(request, controller.signal), value => {
      const parsed = addressResolutionSchema.parse(value);
      for (const address of parsed.candidates) {
        if (normalizeAssistantText(address.municipality) !== normalizeAssistantText(request.municipality)) throw new Error("MUNICIPALITY_CHANGED");
        inspectSource(address.source, "resolve_address");
      }
      return parsed;
    });
    if (!resolved || resolved.candidates.length !== 1) {
      findings.push({ code: "ADDRESS_AMBIGUOUS", subject: request.address });
      return report({ status: "CLARIFICATION_REQUIRED", address: null, addressCandidates: resolved?.candidates ?? [],
        lots: [], businesses: [], web: [], nextDecision: "Préciser l’adresse complète et la municipalité pour identifier un seul emplacement." });
    }
    const address = resolved.candidates[0];
    const parcels = await run("find_cadastral_lots", address, () => options.tools.find_cadastral_lots(address, controller.signal), value => {
      const parsed = parcelsSchema.parse(value);
      if (parsed.addressId !== address.addressId || new Set(parsed.lots.map(l => l.lotId)).size !== parsed.lots.length) throw new Error("PARCEL_BINDING_CHANGED");
      parsed.lots.forEach(l => inspectSource(l.source, "find_cadastral_lots")); return parsed;
    });
    const lots: PropertyReport["lots"][number][] = [];
    for (const lot of parcels?.lots ?? []) {
      const params = { lotId: lot.lotId, municipality: address.municipality };
      const assessment = await run("get_assessment_record", params, () => options.tools.get_assessment_record(params, controller.signal), value => {
        const parsed = assessmentSchema.parse(value);
        if (parsed.lotId !== lot.lotId) throw new Error("ASSESSMENT_LOT_CHANGED");
        parsed.records.forEach(r => inspectSource(r.source, "get_assessment_record")); return parsed;
      });
      const records = assessment?.records ?? [];
      if (!records.length) findings.push({ code: "MISSING_ASSESSMENT", subject: lot.lotId });
      if (new Set(records.map(r => normalizeAssistantText(r.listedOwner))).size > 1) findings.push({ code: "OWNER_CONTRADICTION", subject: lot.lotId });
      lots.push({ ...lot, assessment: records });
    }
    if (!lots.length) findings.push({ code: "NO_LOTS", subject: address.addressId });
    // Public web queries contain only the location, not assessment-roll people.
    const webInput = { address: address.address, municipality: address.municipality };
    const web = await run("search_web_with_sources", webInput, () => options.tools.search_web_with_sources(webInput, controller.signal), value => {
      const parsed = propertyWebSchema.parse(value); parsed.items.forEach(i => inspectSource(i.source, "search_web_with_sources")); return parsed;
    });
    const businessNumbers = [...new Set(lots.flatMap(l => l.assessment.filter(r => r.ownerKind === "BUSINESS" && r.businessNumber).map(r => r.businessNumber!)))];
    const businesses: PropertyReport["businesses"][number][] = [];
    for (const businessNumber of businessNumbers.slice(0, 10)) {
      const business = await run("lookup_quebec_business", { businessNumber }, () => options.tools.lookup_quebec_business({ businessNumber }, controller.signal), value => {
        const parsed = businessSchema.parse(value);
        if (parsed.businessNumber !== businessNumber) throw new Error("BUSINESS_NUMBER_CHANGED");
        inspectSource(parsed.source, "lookup_quebec_business"); return parsed;
      });
      if (business) {
        businesses.push(business);
        const owners = lots.flatMap(l => l.assessment.filter(r => r.businessNumber === businessNumber).map(r => normalizeAssistantText(r.listedOwner)));
        if (owners.some(owner => !business.names.map(normalizeAssistantText).includes(owner))) findings.push({ code: "COMPANY_NAME_MISMATCH", subject: businessNumber });
      }
    }
    return report({ status: findings.length ? "PARTIAL" : "SOURCES_COLLECTED", address, addressCandidates: [], lots, businesses, web: web?.items ?? [],
      nextDecision: findings.length ? "Vérifier les informations manquantes ou contradictoires avant toute démarche auprès d’un propriétaire."
        : "Décider si une vérification distincte au registre foncier est nécessaire pour confirmer le titulaire du droit." });
  } finally { clearTimeout(timer); options.signal.removeEventListener("abort", abort); }
}
