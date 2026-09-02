import { sha256Canonical } from "@/lib/construction-assistant-v1/canonical";
import type {
  MessagingDeliveryStatus,
} from "@/lib/construction-operating-assistant-r24/contracts";

export type MessagingKeyword = "STOP" | "START_REVIEW_REQUIRED" | "HELP" | "NONE";

function normalizedKeyword(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/gu, "")
    .trim()
    .replace(/[.!?]+$/gu, "")
    .toUpperCase();
}

export function classifyMessagingKeyword(body: string): MessagingKeyword {
  const value = normalizedKeyword(body);
  if (["STOP", "ARRET", "ARRETE", "DESABONNER", "UNSUBSCRIBE", "CANCEL"].includes(value)) {
    return "STOP";
  }
  if (["START", "DEMARRER", "REABONNER", "UNSTOP"].includes(value)) {
    return "START_REVIEW_REQUIRED";
  }
  if (["HELP", "AIDE", "INFO"].includes(value)) return "HELP";
  return "NONE";
}

export function opaqueContactMessagingRef(input: { workspaceId: string; contactId: string }) {
  return `ref_${sha256Canonical({
    schemaVersion: 1,
    purpose: "contact-messaging-r24",
    workspaceId: input.workspaceId,
    contactId: input.contactId,
  })}`;
}

export function deriveMessagingPermission(input: {
  consentStatus: "unknown" | "granted" | "withdrawn";
  suppressionStatus: "allowed" | "suppressed" | "review_required";
}):
  | { allowed: true; reason: "CONSENT_GRANTED" }
  | { allowed: false; reason: "CONSENT_REQUIRED" | "CONSENT_WITHDRAWN" | "CONTACT_SUPPRESSED" | "CONSENT_REVIEW_REQUIRED" } {
  if (input.suppressionStatus === "suppressed") {
    return { allowed: false, reason: "CONTACT_SUPPRESSED" };
  }
  if (input.suppressionStatus === "review_required") {
    return { allowed: false, reason: "CONSENT_REVIEW_REQUIRED" };
  }
  if (input.consentStatus === "withdrawn") {
    return { allowed: false, reason: "CONSENT_WITHDRAWN" };
  }
  if (input.consentStatus !== "granted") {
    return { allowed: false, reason: "CONSENT_REQUIRED" };
  }
  return { allowed: true, reason: "CONSENT_GRANTED" };
}

const DELIVERY_RANK: Record<MessagingDeliveryStatus, number> = {
  PREPARED: 10,
  QUEUED: 20,
  SENT: 30,
  DELIVERED: 40,
  FAILED: 40,
};

export function nextDeliveryStatus(
  current: MessagingDeliveryStatus | null,
  next: MessagingDeliveryStatus,
): { accepted: true; rank: number } | { accepted: false; reason: "DELIVERY_STATE_REGRESSION" | "DELIVERY_TERMINAL_CONFLICT" } {
  if (!current) return { accepted: true, rank: DELIVERY_RANK[next] };
  const currentRank = DELIVERY_RANK[current];
  const nextRank = DELIVERY_RANK[next];
  if (nextRank < currentRank) return { accepted: false, reason: "DELIVERY_STATE_REGRESSION" };
  if (
    currentRank === 40 &&
    nextRank === 40 &&
    current !== next
  ) {
    return { accepted: false, reason: "DELIVERY_TERMINAL_CONFLICT" };
  }
  return { accepted: true, rank: nextRank };
}
