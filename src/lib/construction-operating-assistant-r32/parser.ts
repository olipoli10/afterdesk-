import { parseCsv } from "@/lib/ai-work-engine/codecs/csv";
import { sha256Canonical } from "@/lib/construction-assistant-v1/canonical";
import {
  ONBOARDING_IMPORT_MAX_BYTES,
  ONBOARDING_IMPORT_MAX_ROWS,
  ONBOARDING_IMPORT_PARSER_VERSION,
  ONBOARDING_IMPORT_REGISTRY_VERSION,
  onboardingImportKindSchema,
  onboardingImportReasonCodeSchema,
  type onboardingImportRowStateSchema,
} from "./contracts";
import type { z } from "zod";

type ImportKind = z.infer<typeof onboardingImportKindSchema>;
type RowState = z.infer<typeof onboardingImportRowStateSchema>;
type ReasonCode = z.infer<typeof onboardingImportReasonCodeSchema>;
export type NormalizedContactProposal = { displayName: string; role: string; normalizedPhone: string | null; normalizedEmail: string | null; projectCode: string | null };
export type NormalizedProjectProposal = { code: string; name: string; address: string | null };
export type NormalizedImportProposal = NormalizedContactProposal | NormalizedProjectProposal;
export type ParsedImportRow = { rowNumber: number; rowFingerprint: string; state: RowState; reasonCodes: ReasonCode[]; normalizedProposal: NormalizedImportProposal };
export type ParsedImport = { kind: ImportKind; registryVersion: 1; parserVersion: typeof ONBOARDING_IMPORT_PARSER_VERSION; sourceHash: string; sourceByteCount: number; headers: string[]; rows: ParsedImportRow[]; previewFingerprint: string };

const REGISTRY = {
  CONTACTS_CSV: { required: ["display_name", "role"], optional: ["phone", "email", "project_code"] },
  PROJECTS_CSV: { required: ["code", "name"], optional: ["address"] },
} as const;

function normalizeHeader(value: string) {
  return value.trim().toLocaleLowerCase("en-CA");
}

function collapse(value: string) {
  return value.replace(/\s+/gu, " ").trim();
}

export function normalizeImportedPhone(value: string): string | null {
  const compact = value.replace(/[\s().-]/gu, "").trim();
  if (!compact) return null;
  if (!/^\+?[0-9]{7,15}$/u.test(compact)) return null;
  return compact.startsWith("+") ? compact : `+${compact}`;
}

export function normalizeImportedEmail(value: string): string | null {
  const normalized = value.trim().toLocaleLowerCase("en-CA");
  if (!normalized) return null;
  if (normalized.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/u.test(normalized)) return null;
  return normalized;
}

function blankContact(): NormalizedContactProposal {
  return { displayName: "", role: "", normalizedPhone: null, normalizedEmail: null, projectCode: null };
}

function blankProject(): NormalizedProjectProposal {
  return { code: "", name: "", address: null };
}

export function parseOnboardingImport(input: { kind: ImportKind; csvBytes: Uint8Array }): ParsedImport {
  const kind = onboardingImportKindSchema.parse(input.kind);
  if (input.csvBytes.byteLength > ONBOARDING_IMPORT_MAX_BYTES) throw new Error("ONBOARDING_IMPORT_TOO_LARGE");
  const buffer = Buffer.from(input.csvBytes);
  const sourceHash = sha256Canonical({ bytesBase64: buffer.toString("base64") });
  const decoded = parseCsv(buffer, { hasHeaderRow: true, delimiter: "," });
  if (!decoded.ok) throw new Error("ONBOARDING_IMPORT_CSV_REFUSED");
  if (decoded.table.rows.length > ONBOARDING_IMPORT_MAX_ROWS) throw new Error("ONBOARDING_IMPORT_ROW_LIMIT");
  const headers = decoded.table.headers.map(normalizeHeader);
  if (new Set(headers).size !== headers.length) throw new Error("ONBOARDING_IMPORT_DUPLICATE_COLUMN");
  const registry = REGISTRY[kind];
  const allowed = new Set<string>([...registry.required, ...registry.optional]);
  if (headers.some((header) => !allowed.has(header))) throw new Error("ONBOARDING_IMPORT_UNKNOWN_COLUMN");
  if (registry.required.some((required) => !headers.includes(required))) throw new Error("ONBOARDING_IMPORT_REQUIRED_COLUMN_MISSING");
  const position = new Map(headers.map((header, index) => [header, index]));
  const cell = (row: string[], header: string) => collapse(row[position.get(header) ?? -1] ?? "");
  const rows: ParsedImportRow[] = decoded.table.rows.map((row, index) => {
    const reasonCodes: ReasonCode[] = [];
    let normalizedProposal: NormalizedImportProposal;
    if (kind === "CONTACTS_CSV") {
      const proposal = blankContact();
      proposal.displayName = cell(row, "display_name");
      proposal.role = cell(row, "role");
      const phoneRaw = cell(row, "phone");
      const emailRaw = cell(row, "email");
      proposal.normalizedPhone = normalizeImportedPhone(phoneRaw);
      proposal.normalizedEmail = normalizeImportedEmail(emailRaw);
      proposal.projectCode = cell(row, "project_code").toLocaleUpperCase("fr-CA") || null;
      if (!proposal.displayName || !proposal.role) reasonCodes.push("MISSING_REQUIRED_VALUE");
      if (proposal.displayName.length > 160 || proposal.role.length > 120 || (proposal.projectCode?.length ?? 0) > 40) reasonCodes.push("FIELD_TOO_LONG");
      if (phoneRaw && !proposal.normalizedPhone) reasonCodes.push("INVALID_PHONE");
      if (emailRaw && !proposal.normalizedEmail) reasonCodes.push("INVALID_EMAIL");
      normalizedProposal = proposal;
    } else {
      const proposal = blankProject();
      proposal.code = cell(row, "code").toLocaleUpperCase("fr-CA");
      proposal.name = cell(row, "name");
      proposal.address = cell(row, "address") || null;
      if (!proposal.code || !proposal.name) reasonCodes.push("MISSING_REQUIRED_VALUE");
      if (proposal.code.length > 40 || proposal.name.length > 160 || (proposal.address?.length ?? 0) > 300) reasonCodes.push("FIELD_TOO_LONG");
      normalizedProposal = proposal;
    }
    const rowFingerprint = sha256Canonical({ kind, rowNumber: index + 2, normalizedProposal });
    return { rowNumber: index + 2, rowFingerprint, state: reasonCodes.length ? "INVALID" : "READY", reasonCodes, normalizedProposal };
  });
  const previewFingerprint = sha256Canonical({ kind, registryVersion: ONBOARDING_IMPORT_REGISTRY_VERSION, parserVersion: ONBOARDING_IMPORT_PARSER_VERSION, sourceHash, headers, rows });
  return { kind, registryVersion: ONBOARDING_IMPORT_REGISTRY_VERSION, parserVersion: ONBOARDING_IMPORT_PARSER_VERSION, sourceHash, sourceByteCount: buffer.byteLength, headers, rows, previewFingerprint };
}
