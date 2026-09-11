import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import {
  markPersonalActivationPresented,
  personalActivationPromptKey,
  shouldPresentPersonalActivation,
} from "../src/lib/personal-activation-prompt";

function storage() {
  const values = new Map<string, string>();
  return {
    values,
    getItemAsync: vi.fn(async (key: string) => values.get(key) ?? null),
    setItemAsync: vi.fn(async (key: string, value: string) => { values.set(key, value); }),
  };
}

describe("personal activation prompt", () => {
  it("presents exactly once per valid workspace and verifies the durable write", async () => {
    const store = storage();
    expect(await shouldPresentPersonalActivation("workspace-1", store)).toBe(true);
    await markPersonalActivationPresented("workspace-1", store);
    expect(await shouldPresentPersonalActivation("workspace-1", store)).toBe(false);
    expect(store.setItemAsync).toHaveBeenCalledWith(personalActivationPromptKey("workspace-1"), "presented");
  });

  it("rejects unsafe workspace keys and refuses an unconfirmed store write", async () => {
    expect(() => personalActivationPromptKey("../workspace")).toThrow("PERSONAL_ACTIVATION_WORKSPACE_REQUIRED");
    const store = storage();
    store.setItemAsync.mockImplementation(async () => undefined);
    await expect(markPersonalActivationPresented("workspace-1", store)).rejects.toThrow("PERSONAL_ACTIVATION_PROMPT_NOT_PERSISTED");
  });

  it("routes an authenticated owner to phone activation and keeps a permanent manual entry point", () => {
    const today = readFileSync(join(process.cwd(), "src/app/(app)/index.tsx"), "utf8");
    expect(today).toContain("shouldPresentPersonalActivation(workspaceId, SecureStore)");
    expect(today).toContain('router.replace("/device-access")');
    expect(today.match(/Commencer l’activation/g)).toHaveLength(2);
    expect(today).toContain("SMS prérempli");
  });
});
