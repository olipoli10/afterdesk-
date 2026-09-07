const LOCAL_HOSTS = new Set(["127.0.0.1", "localhost", "10.0.2.2"]);
const UNCONFIGURED_AUTH_ORIGIN = "https://configuration-required.invalid";

function isPrivateIpv4(hostname: string) {
  const match = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(hostname);
  if (!match) return false;
  const octets = match.slice(1).map(Number);
  if (octets.some((part) => part > 255)) return false;
  return (
    octets[0] === 10 ||
    (octets[0] === 172 && octets[1] >= 16 && octets[1] <= 31) ||
    (octets[0] === 192 && octets[1] === 168)
  );
}

export function resolveMobileApiBaseUrl(
  rawValue: string | undefined,
  options: { development: boolean },
) {
  const value = rawValue?.trim() || (options.development ? "http://127.0.0.1:3000" : "");
  if (!value) throw new Error("MOBILE_API_URL_REQUIRED");

  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error("MOBILE_API_URL_INVALID");
  }
  if (
    url.username ||
    url.password ||
    url.search ||
    url.hash ||
    (url.pathname !== "/" && url.pathname !== "")
  ) {
    throw new Error("MOBILE_API_URL_INVALID");
  }

  const localHttp =
    options.development &&
    url.protocol === "http:" &&
    (LOCAL_HOSTS.has(url.hostname) || isPrivateIpv4(url.hostname));
  if (url.protocol !== "https:" && !localHttp) {
    throw new Error("MOBILE_API_URL_HTTPS_REQUIRED");
  }

  return url.origin;
}

export function mobileApiBaseUrl() {
  return resolveMobileApiBaseUrl(process.env.EXPO_PUBLIC_ENDVERA_API_URL, {
    development: __DEV__,
  });
}

export function resolveMobileAuthRuntime(
  rawValue: string | undefined,
  options: { development: boolean },
) {
  try {
    return {
      baseUrl: resolveMobileApiBaseUrl(rawValue, options),
      configured: true,
    } as const;
  } catch (error) {
    if (error instanceof Error && error.message === "MOBILE_API_URL_REQUIRED") {
      return {
        baseUrl: UNCONFIGURED_AUTH_ORIGIN,
        configured: false,
      } as const;
    }
    throw error;
  }
}
