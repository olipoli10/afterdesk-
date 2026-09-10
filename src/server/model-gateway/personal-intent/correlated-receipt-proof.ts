import "server-only";
import { z } from "zod";
import { canonicalJson } from "../evidence";
import { temporalSha } from "@/server/personal-assistant/sms-temporal-clarification-authority";
import { inspectDurableSmsTemporalCorrelation, type DurableSmsTemporalCorrelationInput } from "@/server/personal-assistant/sms-temporal-clarification";
import { inspectPersonalTemporalCorrelationEvidence } from "./correlated-temporal-evidence";
import { resolveInspectedPersonalTemporalEvidence } from "./correlated-temporal-resolution";

export const PERSONAL_CORRELATED_RECEIPT_PROOF_VERSION = "personal-correlated-receipt-proof-v1";
type Json = null | boolean | number | string | Json[] | { [key: string]: Json };
const json: z.ZodType<Json> = z.lazy(() => z.union([z.null(), z.boolean(), z.number().finite(), z.string(), z.array(json), z.record(z.string(), json)]));
const packetSchema = z.object({ packet: json, packetHash: z.string().regex(/^[a-f0-9]{64}$/) }).strict();
function freeze<T>(value: T): T { if (value && typeof value === "object") { Object.values(value).forEach(freeze); Object.freeze(value); } return value; }

/** Pure inspection of asserted completed-receipt facts; the DB loader must
 * authenticate them. Recomputes existing bytes without replaying any transition. */
export function inspectCorrelatedPersonalReceiptProof(input: DurableSmsTemporalCorrelationInput, untrustedPacket: { packet: unknown; packetHash: string }) {
  const stored = packetSchema.parse(untrustedPacket), bytes = canonicalJson(stored.packet);
  if (Buffer.byteLength(bytes, "utf8") > 131072 || temporalSha(bytes) !== stored.packetHash) throw new Error("CORRELATED_RECEIPT_PACKET_CHANGED");
  const durable = inspectDurableSmsTemporalCorrelation(input);
  const evidence = inspectPersonalTemporalCorrelationEvidence(durable.historicalCorrelation, durable.prepared);
  const recalculated = resolveInspectedPersonalTemporalEvidence(evidence, durable.prepared.rawProposal);
  if (recalculated.status !== "RESOLVED_NOT_AUTHORIZED" || canonicalJson(recalculated) !== bytes) throw new Error("CORRELATED_RECEIPT_RESOLUTION_CHANGED");
  const value = { status: "CORRELATED_RECEIPT_PROOF_INSPECTED_NOT_AUTHORIZED" as const,
    version: PERSONAL_CORRELATED_RECEIPT_PROOF_VERSION, subject: { kind: "personal_sms_temporal_receipt" as const, receiptId: durable.receiptId },
    packetHash: stored.packetHash, originalPacket: stored.packet, resolution: recalculated,
    executionAuthorized: false as const, providerExecutionPerformed: false as const, persistencePerformed: false as const,
    sourceAuthority: "NOT_AUTHENTICATED_BY_THIS_PURE_CONTRACT" as const, draft: null };
  return freeze({ ...value, proofHash: temporalSha(canonicalJson(value)) });
}
