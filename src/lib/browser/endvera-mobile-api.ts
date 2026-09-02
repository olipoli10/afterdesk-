"use client";

type EndveraMobileResource = "privacy" | "reliability";

const ENDPOINTS: Record<EndveraMobileResource, string> = {
  privacy: "/api/endvera/v1/mobile/privacy",
  reliability: "/api/endvera/v1/mobile/reliability",
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

export function getEndveraMobileResource<T>(resource: EndveraMobileResource, workspaceId: string): Promise<T> {
  const endpoint = `${ENDPOINTS[resource]}?workspaceId=${encodeURIComponent(workspaceId)}`;
  return requestJson<T>(endpoint, { method: "GET", cache: "no-store" });
}

export function postEndveraMobileResource<T>(resource: EndveraMobileResource, body: unknown): Promise<T> {
  return requestJson<T>(ENDPOINTS[resource], {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}
