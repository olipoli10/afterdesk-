import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(join(process.cwd(), path), "utf8");

describe("personal phone activation card wiring", () => {
  it("shows the server-provided ENDVERA number and performs proof-by-SMS pairing without typed phone input", () => {
    const card = read("src/components/personal-phone-activation-card.tsx");
    expect(card).toContain("api.personalPhone(workspaceId)");
    expect(card).toContain("api.pairPersonalPhone(workspaceId, allowSms, allowVoice)");
    expect(card).toContain("personalPairingSmsUri(request)");
    expect(card).toContain("ENDVERA associera automatiquement ton numéro");
    expect(card).not.toContain("TextInput");
  });

  it("places number pairing on the same first-run surface as native permissions", () => {
    const screen = read("src/app/(app)/device-access.tsx");
    expect(screen).toContain("PersonalPhoneActivationCard");
    expect(screen).toContain("requestAll");
    expect(screen).toContain("Examiner les permissions restantes");
  });
});
