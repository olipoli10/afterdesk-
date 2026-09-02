"use client";

type EndveraMobileResource = "privacy" | "reliability" | "onboarding" | "goldenWorkflow";

const ENDPOINTS: Record<EndveraMobileResource, string> = {
  privacy: "/api/endvera/v1/mobile/privacy",
  reliability: "/api/endvera/v1/mobile/reliability",
  onboarding: "/api/endvera/v1/mobile/onboarding",
  goldenWorkflow: "/api/endvera/v1/mobile/golden-workflow",
};

async function requestJson<T>(endpoint: string, init: RequestInit): Promise<T> {
  const response = await fetch(endpoint, {
    ...init,
    credentials: "same-origin",
    redirect: "error",
    headers: {
      Accept: "application/json",
      ...init.headers,
    },
  });
  if (!response.ok) throw new Error("ENDVERA_SAME_ORIGIN_REQUEST_REFUSED");
  return await response.json() as T;
}

export function getEndveraMobileResource<T>(resource: EndveraMobileResource, workspaceId?: string): Promise<T> {
  const endpoint = workspaceId ? `${ENDPOINTS[resource]}?workspaceId=${encodeURIComponent(workspaceId)}` : ENDPOINTS[resource];
  return requestJson<T>(endpoint, { method: "GET", cache: "no-store" });
}

export function postEndveraMobileResource<T>(resource: EndveraMobileResource, body: unknown): Promise<T> {
  return requestJson<T>(ENDPOINTS[resource], {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}
