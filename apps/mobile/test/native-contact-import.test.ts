import { describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { chooseOneNativeContact, prepareNativeContactImport, parseContactImportReceipt, sanitizeSelectedContact } from "../src/lib/native-contact-import";

const context = { workspaceId: "synthetic-workspace", role: "OWNER", projectIds: ["synthetic-project"], commandId: "00000000-0000-4000-8000-000000000211" };
const draft = { displayName: "Marc synthétique", role: "Fournisseur", phone: "+1 (450) 555-0100", email: "MARC@example.invalid", projectId: "synthetic-project" };

describe("single selected native contact import", () => {
  it("discards native identifiers and unrelated private fields", () => {
    const selected = sanitizeSelectedContact({ fullName: "Marc", phones: [{ number: "+14505550100", id: "private-native-id", label: "mobile" }], emails: [{ address: "marc@example.invalid" }], note: "private", birthday: "private", image: "private", id: "private" });
    expect(selected).toEqual({ displayName: "Marc", phones: ["+14505550100"], emails: ["marc@example.invalid"] });
    expect(JSON.stringify(selected)).not.toContain("private");
  });
  it("reads only the explicitly picked contact and does not read after cancellation", async () => {
    const readFields = vi.fn(async () => ({ fullName: "Marc", phones: [], emails: [] }));
    const pick = vi.fn(async () => ({ readFields }));
    const bridge = { readPermission: vi.fn(async () => ({ granted: true, canAskAgain: true })), requestPermission: vi.fn(async () => ({ granted: true, canAskAgain: true })), pick };
    expect(await chooseOneNativeContact(bridge)).toMatchObject({ status: "SELECTED_NOT_UPLOADED" });
    expect(readFields).toHaveBeenCalledTimes(1); expect(pick).toHaveBeenCalledTimes(1); expect(bridge.requestPermission).not.toHaveBeenCalled();
    expect(await chooseOneNativeContact({ ...bridge, pick: async () => null })).toEqual({ status: "CANCELED" });
    expect(readFields).toHaveBeenCalledTimes(1);
  });
  it("does not read a contact after denied permission or native failure", async () => {
    const pick = vi.fn(async () => null); const denied = async () => ({ granted: false, canAskAgain: false });
    expect(await chooseOneNativeContact({ readPermission: denied, requestPermission: denied, pick })).toEqual({ status: "PERMISSION_DENIED", canAskAgain: false });
    expect(pick).not.toHaveBeenCalled();
    expect(await chooseOneNativeContact({ readPermission: () => { throw new Error("native-private-error"); }, requestPermission: denied, pick })).toEqual({ status: "UNAVAILABLE" });
  });
  it("requests optional permission only once and accepts no automatic phone choice", async () => {
    const requestPermission = vi.fn(async () => ({ granted: false, canAskAgain: true }));
    const pick = vi.fn(async () => null);
    expect(await chooseOneNativeContact({ readPermission: async () => ({ granted: false, canAskAgain: true }), requestPermission, pick })).toEqual({ status: "PERMISSION_DENIED", canAskAgain: true });
    expect(requestPermission).toHaveBeenCalledTimes(1); expect(pick).not.toHaveBeenCalled();
    expect(sanitizeSelectedContact({ fullName: "Marc", phones: [{ number: "+14505550100" }, { number: "+14505550101" }] })).not.toHaveProperty("phone");
  });
  it("prepares only exact reviewed fields for the existing idempotent owner endpoint", () => {
    const command = prepareNativeContactImport(draft, context);
    expect(command).toEqual({ schemaVersion: 1, action: "CREATE_FIRST_CONTACT", commandId: context.commandId, workspaceId: context.workspaceId, displayName: draft.displayName, role: draft.role, phone: "+14505550100", email: "marc@example.invalid", projectId: "synthetic-project" });
    expect(Object.isFrozen(command)).toBe(true);
    expect(() => prepareNativeContactImport({ ...draft, phone: "4505550100" }, context)).toThrow();
    expect(() => prepareNativeContactImport({ ...draft, email: "", phone: "" }, context)).toThrow();
    expect(() => prepareNativeContactImport({ ...draft, projectId: "foreign-project" }, context)).toThrow();
    expect(() => prepareNativeContactImport(draft, { ...context, role: "FIELD_WORKER" })).toThrow();
    expect(() => prepareNativeContactImport({ ...draft, nativeId: "do-not-upload" }, context)).toThrow();
  });
  it("requires a matching confirmed contact receipt, and distinguishes reuse from creation", () => {
    const command = prepareNativeContactImport(draft, context);
    const result = { schemaVersion: 1, resultType: "CONTACT", workspaceId: context.workspaceId, commandId: context.commandId, contactId: "canonical-contact", created: false, replayed: true, providerObserved: false, externalEffectCount: 0 };
    expect(parseContactImportReceipt(result, command)).toMatchObject({ created: false, replayed: true });
    for (const changed of [{ workspaceId: "foreign" }, { commandId: "00000000-0000-4000-8000-000000000212" }, { resultType: "PROJECT" }, { contactId: null }, { created: undefined }]) {
      expect(() => parseContactImportReceipt({ ...result, ...changed }, command)).toThrow();
    }
  });
  it("bounds selected values and strips duplicate options without silently clipping", () => {
    expect(sanitizeSelectedContact({ phones: [{ number: "same" }, { number: "same" }], emails: [] }).phones).toEqual(["same"]);
    expect(() => sanitizeSelectedContact({ phones: Array.from({ length: 21 }, () => ({ number: "x" })) })).toThrow();
  });
  it("uses explicit native picker and selected fields, not bulk enumeration or background storage", () => {
    const source = readFileSync("src/components/native-contact-import.tsx", "utf8");
    expect(source).toContain("Contact.presentPicker()");
    expect(source).toContain("ContactField.FULL_NAME, ContactField.PHONES, ContactField.EMAILS");
    expect(source).not.toMatch(/getAll|getContactsAsync|AsyncStorage|SecureStore|setInterval/);
    expect(source).toContain("Confirmer ces champs et enregistrer");
    expect(source).toContain("api.onboardingCommand(review)");
  });
});
