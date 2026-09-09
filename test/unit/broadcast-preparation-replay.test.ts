import { beforeEach, describe, expect, it, vi } from "vitest";
import { sha256Canonical } from "@/lib/construction-assistant-v1/canonical";
import { buildSecretaryBroadcastRequestHash } from "@/lib/construction-operating-assistant-r38e/contracts";

const state = vi.hoisted(() => ({
  membership: vi.fn(), contacts: vi.fn(), existing: vi.fn(), reply: vi.fn(), create: vi.fn(), lock: vi.fn(),
}));
vi.mock("@/lib/db", () => ({ prisma: {
  constructionContact: { findMany: state.contacts },
  $transaction: async (fn: (tx: unknown) => unknown) => fn({
    $queryRaw: state.lock, constructionContact: { findMany: state.contacts },
    constructionSecretaryBroadcastDraft: { findUnique: state.existing, create: state.create },
    constructionMessage: { findUniqueOrThrow: state.reply, create: state.create },
  }),
} }));
vi.mock("@/server/construction-assistant-v1/workspace", () => ({
  requireActiveConstructionMember: state.membership,
  ConstructionAccessDenied: class extends Error { constructor() { super("CONSTRUCTION_RESOURCE_NOT_FOUND"); } },
}));
import { prepareSecretaryBroadcast } from "@/server/construction-operating-assistant-r38e/broadcast-preparation";
const candidate = {kind:"CANDIDATE" as const, recipientNames:["Contact Simulation A", "Contact Simulation B"], body:"Reçu."};
const input = {
  userId:"syn-owner", request:{schemaVersion:1 as const,requestId:"aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",workspaceId:"syn-workspace",message:"Texte Contact Simulation A et Contact Simulation B que Reçu.",occurredAt:"2026-09-09T12:00:00.000Z"},
  channel:"MOBILE_APP" as const, candidate,
  routing:{schemaVersion:1 as const,intentClass:"COMMUNICATION_DRAFT" as const,capabilityKey:"COMMUNICATION_PREPARATION" as const,disposition:"INTERNAL_TOOL" as const,readiness:"INTERNAL_READY" as const,citationsRequired:false,approvalRequired:true,providerExecutionAuthorized:false as const,externalDispatchPerformed:false as const},
};
const requestHash = sha256Canonical({candidateHash:buildSecretaryBroadcastRequestHash(candidate),channel:input.channel,occurredAt:input.request.occurredAt,sender:"user:syn-owner",provider:null,providerMessageId:null});
describe("ARCH001 persisted broadcast preparation replay", () => {
  beforeEach(() => {
    vi.clearAllMocks();state.membership.mockResolvedValue({role:"owner",status:"active"});state.contacts.mockResolvedValue([]);
    state.existing.mockResolvedValue({id:"syn-draft",requestHash,sourceMessageId:"syn-inbound"});
    state.reply.mockResolvedValue({id:"syn-reply",originalBody:"Préparation historique synthétique. Aucun texto envoyé."});
  });
  it("replays the persisted result when previously selected contacts are no longer active", async () => {
    await expect(prepareSecretaryBroadcast(input)).resolves.toMatchObject({replayed:true,canonicalEffectId:"syn-draft",status:"PREPARED_UNSENT",externalTransportPerformed:false});
    expect(state.contacts).not.toHaveBeenCalled();expect(state.create).not.toHaveBeenCalled();
  });
  it("replays the exact prior result even if a new homonym now exists", async () => {
    state.contacts.mockResolvedValue([{id:"syn-1",displayName:candidate.recipientNames[0],normalizedPhone:"synthetic"},{id:"syn-2",displayName:candidate.recipientNames[0],normalizedPhone:"synthetic"}]);
    await expect(prepareSecretaryBroadcast(input)).resolves.toMatchObject({replayed:true});expect(state.contacts).not.toHaveBeenCalled();
  });
  it("replays despite removed phones without refreshing recipient snapshot or granting approval", async () => {
    state.contacts.mockResolvedValue(candidate.recipientNames.map((displayName,i)=>({id:`syn-contact${i}`,displayName,normalizedPhone:null})));
    const result=await prepareSecretaryBroadcast(input);
    expect(result).toMatchObject({status:"PREPARED_UNSENT",replayed:true,externalTransportPerformed:false});
    expect(state.contacts).not.toHaveBeenCalled();expect(state.create).not.toHaveBeenCalled();
  });
  it("checks current authorization before serving persisted replay", async () => {
    state.membership.mockResolvedValue({role:"member",status:"active"});
    await expect(prepareSecretaryBroadcast(input)).rejects.toThrow("CONSTRUCTION_RESOURCE_NOT_FOUND");
    expect(state.existing).not.toHaveBeenCalled();expect(state.reply).not.toHaveBeenCalled();
  });
  it("still resolves and refuses missing contacts for a NEW request", async () => {
    state.existing.mockResolvedValue(null);
    await expect(prepareSecretaryBroadcast(input)).rejects.toThrow("R38E_CONTACT_NOT_FOUND");
    expect(state.contacts).toHaveBeenCalledOnce();expect(state.create).not.toHaveBeenCalled();
  });
  it("refuses changed input hash before resolving current contacts", async () => {
    await expect(prepareSecretaryBroadcast({...input,candidate:{...candidate,body:"Modification."}})).rejects.toThrow("R38E_BROADCAST_REPLAY_MISMATCH");
    expect(state.contacts).not.toHaveBeenCalled();expect(state.create).not.toHaveBeenCalled();
  });
});
