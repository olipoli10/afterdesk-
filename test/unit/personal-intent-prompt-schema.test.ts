import { describe, expect, it } from "vitest";
import { personalIntentResponseFormat } from "@/server/model-gateway/personal-intent/prompt";

function collectKeys(value: unknown, keys = new Set<string>()): Set<string> {
  if (Array.isArray(value)) {
    value.forEach(item => collectKeys(item, keys));
    return keys;
  }
  if (value === null || typeof value !== "object") return keys;
  for (const [key, item] of Object.entries(value)) {
    keys.add(key);
    collectKeys(item, keys);
  }
  return keys;
}

describe("personal intent provider schema", () => {
  it("uses an OpenAI-compatible strict union while retaining a closed root object", () => {
    const format = personalIntentResponseFormat();
    const schema = format.json_schema.schema as Record<string, unknown>;
    const keys = collectKeys(schema);

    expect(format.json_schema.strict).toBe(true);
    expect(schema.type).toBe("object");
    expect(schema.required).toEqual(["schemaVersion", "requestFingerprint", "actions"]);
    expect(schema.additionalProperties).toBe(false);
    expect(keys.has("anyOf")).toBe(true);
    expect(keys.has("oneOf")).toBe(false);
    expect(keys.has("$schema")).toBe(false);
  });

  it("returns the same frozen provider schema for every request", () => {
    const first = personalIntentResponseFormat();
    const second = personalIntentResponseFormat();

    expect(first.json_schema.schema).toBe(second.json_schema.schema);
    expect(Object.isFrozen(first.json_schema.schema)).toBe(true);
  });
});
