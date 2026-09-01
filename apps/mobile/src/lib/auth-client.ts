import { expoClient } from "@better-auth/expo/client";
import { createAuthClient } from "better-auth/react";
import type { BetterAuthClientPlugin } from "better-auth/client";
import * as SecureStore from "expo-secure-store";
import { mobileApiBaseUrl } from "@/lib/config";

const officialExpoPlugin = expoClient({
  scheme: "endvera",
  storagePrefix: "endvera",
  cookiePrefix: "better-auth",
  storage: SecureStore,
});

const client = createAuthClient({
  baseURL: mobileApiBaseUrl(),
  // @better-auth/expo 1.6.25 and Better Auth 1.6.25 are runtime-compatible,
  // but TypeScript 6 expands their generic fetch signatures differently.
  // Keep the official plugin and narrow only that published type mismatch.
  plugins: [officialExpoPlugin as unknown as BetterAuthClientPlugin],
});

export const authClient = client as typeof client & { getCookie(): string };
