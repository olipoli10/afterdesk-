import "server-only";
import { z } from "zod";
import { publicCitationUrl } from "../personal-answer/contract";

export const propertyRequestSchema = z.object({
  requestId: z.string().min(1).max(191), workspaceId: z.string().min(1).max(191),
  address: z.string().trim().min(1).max(300), municipality: z.string().trim().min(1).max(120),
}).strict();
export type PropertyRequest = z.infer<typeof propertyRequestSchema>;
export const propertySourceSchema = z.object({
  sourceId: z.string().min(1).max(191), url: z.string().max(2048).transform(publicCitationUrl),
  documentVersion: z.string().min(1).max(191), effectiveAt: z.string().datetime({ offset: true }),
  observedAt: z.string().datetime({ offset: true }),
}).strict();
const addressSchema = z.object({ addressId: z.string().min(1).max(191), address: z.string().min(1).max(300),
  municipality: z.string().min(1).max(120), source: propertySourceSchema }).strict();
export const addressResolutionSchema = z.object({ candidates: z.array(addressSchema).max(10) }).strict();
export const parcelsSchema = z.object({ addressId: z.string().min(1).max(191),
  lots: z.array(z.object({ lotId: z.string().regex(/^[0-9]{7}$/u), source: propertySourceSchema }).strict()).max(10),
}).strict();
export const assessmentSchema = z.object({ lotId: z.string().regex(/^[0-9]{7}$/u),
  records: z.array(z.object({ listedOwner: z.string().trim().min(1).max(300),
    ownerKind: z.enum(["BUSINESS", "PERSON", "UNKNOWN"]), businessNumber: z.string().regex(/^[0-9]{10}$/u).nullable(),
    source: propertySourceSchema,
  }).strict()).max(5),
}).strict();
export const businessSchema = z.object({ businessNumber: z.string().regex(/^[0-9]{10}$/u),
  names: z.array(z.string().trim().min(1).max(300)).min(1).max(10), source: propertySourceSchema,
}).strict();
export const propertyWebSchema = z.object({ items: z.array(z.object({
  title: z.string().min(1).max(300), excerpt: z.string().max(2000), source: propertySourceSchema,
}).strict()).max(5) }).strict();
export type PropertySource = z.infer<typeof propertySourceSchema>;
export type ResolvedAddress = z.infer<typeof addressSchema>;
export type ParcelResult = z.infer<typeof parcelsSchema>;
export type AssessmentResult = z.infer<typeof assessmentSchema>;
export type BusinessResult = z.infer<typeof businessSchema>;
export type WebResult = z.infer<typeof propertyWebSchema>;
export const PROPERTY_TOOLS = ["resolve_address", "find_cadastral_lots", "get_assessment_record", "search_web_with_sources", "lookup_quebec_business", "create_property_report"] as const;
export type PropertyTool = typeof PROPERTY_TOOLS[number];

// This policy is supplied by a registered server connector, never from a model,
// a retrieved page or the source response. Data cannot promote its own provenance.
export type RegisteredPropertySource = Readonly<{
  sourceId: string; tool: Exclude<PropertyTool, "create_property_report">;
  allowedHosts: readonly string[]; municipality: string;
  usage: "SYNTHETIC" | "PERMITTED_PUBLIC"; maxAgeMs: number;
}>;
export type PropertyReport = Readonly<{
  schemaVersion: 1; requestId: string; workspaceId: string; address: ResolvedAddress | null;
  status: "CLARIFICATION_REQUIRED" | "PARTIAL" | "SOURCES_COLLECTED";
  addressCandidates: readonly ResolvedAddress[];
  lots: readonly { lotId: string; source: PropertySource; assessment: AssessmentResult["records"] }[];
  businesses: readonly BusinessResult[]; web: WebResult["items"];
  findings: readonly { code: "SOURCE_STALE" | "SOURCE_UNAVAILABLE" | "ADDRESS_AMBIGUOUS" | "NO_LOTS" | "OWNER_CONTRADICTION" | "COMPANY_NAME_MISMATCH" | "MISSING_ASSESSMENT"; subject: string }[];
  registeredOwnerStatus: "NOT_VERIFIED"; nextDecision: string;
  evidenceMode: "SYNTHETIC" | "PUBLIC_SOURCE_RECORDS";
  observedAt: string; fingerprint: string; actionAuthority: false;
}>;

export const propertyReportSchema = z.object({
  schemaVersion: z.literal(1), requestId: z.string().min(1).max(191), workspaceId: z.string().min(1).max(191),
  address: addressSchema.nullable(), addressCandidates: z.array(addressSchema).max(10),
  status: z.enum(["CLARIFICATION_REQUIRED", "PARTIAL", "SOURCES_COLLECTED"]),
  lots: z.array(z.object({ lotId: z.string().regex(/^[0-9]{7}$/u), source: propertySourceSchema, assessment: assessmentSchema.shape.records }).strict()).max(10),
  businesses: z.array(businessSchema).max(10), web: propertyWebSchema.shape.items,
  findings: z.array(z.object({ code: z.enum(["SOURCE_STALE", "SOURCE_UNAVAILABLE", "ADDRESS_AMBIGUOUS", "NO_LOTS", "OWNER_CONTRADICTION", "COMPANY_NAME_MISMATCH", "MISSING_ASSESSMENT"]), subject: z.string().max(500) }).strict()).max(200),
  registeredOwnerStatus: z.literal("NOT_VERIFIED"), nextDecision: z.string().min(1).max(1000),
  evidenceMode: z.enum(["SYNTHETIC", "PUBLIC_SOURCE_RECORDS"]), observedAt: z.string().datetime({ offset: true }),
  fingerprint: z.string().regex(/^sha256:[a-f0-9]{64}$/u), actionAuthority: z.literal(false),
}).strict();
