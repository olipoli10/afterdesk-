import "server-only";

const key = "ENDVERA_PERSONAL_MODEL_OPERATOR_SETUP_CONFIGURATION";

/** Reconstruct the server artifact before its integrity checks. Split storage
 * takes precedence; incomplete parts must never fall back to an older value. */
export function readPersonalOperatorConfiguration(env: NodeJS.ProcessEnv): string | undefined {
  const count = env[`${key}_PART_COUNT`];
  let raw: string | undefined;
  if (count === undefined) raw = env[key];
  else {
    if (!/^[1-4]$/.test(count)) return undefined;
    const parts = Array.from({ length: Number(count) }, (_, index) => env[`${key}_PART_${index + 1}`]);
    if (parts.some(part => typeof part !== "string" || part.length === 0 || Buffer.byteLength(part, "utf8") > 32768)) return undefined;
    raw = parts.join("");
  }
  if (typeof raw !== "string" || Buffer.byteLength(raw, "utf8") > 32768) return undefined;
  return raw;
}
