import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = readFileSync("src/components/personal-model-connection.tsx", "utf8");

describe("personal model credential mobile UI boundary", () => {
  it("uses a transient masked field and does not persist, log or copy the key", () => {
    expect(source).toMatch(/secureTextEntry/);
    expect(source).toMatch(/autoCorrect=\{false\}/);
    expect(source).toMatch(/autoCapitalize="none"/);
    expect(source).toMatch(/setApiKey\(""\)/);
    expect(source).not.toMatch(/AsyncStorage|SecureStore|console\.|Clipboard|clipboard/);
  });
});
