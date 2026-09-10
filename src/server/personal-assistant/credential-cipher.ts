import "server-only";
import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

export function requireConnectorKey(encoded: string | undefined): Buffer {
  if (!encoded || !/^[A-Za-z0-9+/]{43}=$/.test(encoded)) throw new Error("CONNECTOR_KEY_REQUIRED");
  const key = Buffer.from(encoded, "base64");
  if (key.length !== 32) throw new Error("CONNECTOR_KEY_REQUIRED");
  return key;
}

// AAD binds each encrypted value to its workspace, connector and purpose.
// Random IVs prevent identical secrets from producing identical ciphertext.
export function sealConnectorSecret(plaintext: string, binding: string, key: Buffer): string {
  if (key.length !== 32 || !binding || plaintext.length > 65536) throw new Error("CONNECTOR_CIPHER_INPUT_REFUSED");
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  cipher.setAAD(Buffer.from(binding));
  const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  return ["v1", iv.toString("base64url"), cipher.getAuthTag().toString("base64url"), ciphertext.toString("base64url")].join(".");
}

export function openConnectorSecret(value: string, binding: string, key: Buffer): string {
  try {
    if (value.length > 100000) throw new Error();
    const [version, iv, tag, ciphertext, extra] = value.split(".");
    if (version !== "v1" || extra !== undefined || !iv || !tag || !ciphertext || key.length !== 32) throw new Error();
    const ivBytes = Buffer.from(iv, "base64url");
    const tagBytes = Buffer.from(tag, "base64url");
    if (ivBytes.length !== 12 || tagBytes.length !== 16) throw new Error();
    const decipher = createDecipheriv("aes-256-gcm", key, ivBytes);
    decipher.setAAD(Buffer.from(binding));
    decipher.setAuthTag(tagBytes);
    return Buffer.concat([decipher.update(Buffer.from(ciphertext, "base64url")), decipher.final()]).toString("utf8");
  } catch { throw new Error("CONNECTOR_SECRET_UNAVAILABLE"); }
}
