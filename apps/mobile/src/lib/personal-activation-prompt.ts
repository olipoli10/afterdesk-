const PROMPT_VERSION = "v1";
const workspaceId = /^[A-Za-z0-9_-]{1,191}$/;

export type PersonalActivationPromptStore = {
  getItemAsync: (key: string) => Promise<string | null>;
  setItemAsync: (key: string, value: string) => Promise<void>;
};

export function personalActivationPromptKey(id: string) {
  if (!workspaceId.test(id)) throw new Error("PERSONAL_ACTIVATION_WORKSPACE_REQUIRED");
  return `endvera.personal-activation.${PROMPT_VERSION}.${id}`;
}

export async function shouldPresentPersonalActivation(
  id: string,
  store: PersonalActivationPromptStore,
) {
  return (await store.getItemAsync(personalActivationPromptKey(id))) !== "presented";
}

export async function markPersonalActivationPresented(
  id: string,
  store: PersonalActivationPromptStore,
) {
  const key = personalActivationPromptKey(id);
  await store.setItemAsync(key, "presented");
  if ((await store.getItemAsync(key)) !== "presented") {
    throw new Error("PERSONAL_ACTIVATION_PROMPT_NOT_PERSISTED");
  }
}
