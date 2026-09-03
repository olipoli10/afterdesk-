import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import app from "../apps/mobile/app.json";
import disclosure from "../release/endvera-construction-v1/privacy-disclosure.json";
import apple from "../release/endvera-construction-v1/store/apple-submission-workbook.json";
import google from "../release/endvera-construction-v1/store/google-play-submission-workbook.json";
import screenshots from "../release/endvera-construction-v1/store/screenshot-plan.json";
import readiness from "../release/endvera-construction-v1/store-compliance-readiness.json";
import fr from "../release/endvera-construction-v1/store/fr-CA.json";
import en from "../release/endvera-construction-v1/store/en-CA.json";
import { validateStoreCompliance } from "../scripts/validate-endvera-store-compliance.mjs";

const input = { app, disclosure, apple, google, screenshots, readiness, listings: [fr, en] };

describe("R36I store compliance and listing pack", () => {
  it("keeps one canonical data inventory across Apple and Google", () => {
    const report = validateStoreCompliance(input);
    const canonical = disclosure.classes.map((item) => item.code);
    expect(apple.canonicalDataClassCodes).toEqual(canonical);
    expect(google.canonicalDataClassCodes).toEqual(canonical);
    expect(report.dataClassesChecked).toBe(canonical.length);
  });

  it("matches runtime microphone permission and bilingual product claims", () => {
    expect(apple.permissions).toEqual(google.permissions);
    expect(apple.permissions).toEqual([{ code: "MICROPHONE", purpose: "Permettre à ENDVERA d’enregistrer uniquement la note vocale que vous choisissez." }]);
    expect(fr.capabilityCodes).toEqual(en.capabilityCodes);
    expect(fr.unavailableCapabilityCodes).toEqual(en.unavailableCapabilityCodes);
    expect(fr.shortDescription.length).toBeLessThanOrEqual(80);
    expect(en.shortDescription.length).toBeLessThanOrEqual(80);
  });

  it("retains legal review, account access, deletion resource and real screenshots as blockers", () => {
    expect(readiness.readiness).toBe("READY_FOR_EXTERNAL_COMPLIANCE_INPUTS");
    expect(readiness.remainingBlockers.map((item) => item.code)).toEqual([
      "APPLE_DEVELOPER_ACCOUNT",
      "GOOGLE_PLAY_DEVELOPER_ACCOUNT",
      "LEGAL_PRIVACY_REVIEW",
      "PUBLIC_ACCOUNT_DELETION_RESOURCE",
      "REAL_DEVICE_SCREENSHOTS",
      "STORE_REVIEW_CREDENTIALS",
    ]);
    expect(screenshots.capturedCount).toBe(0);
    expect(screenshots.realDeviceObserved).toBe(false);
  });

  it("records current store requirements without claiming submission", () => {
    expect(apple.storeRequirements).toMatchObject({ screenshotMinimum: 1, screenshotMaximum: 10, appPreviewRequired: false, privacyPolicyUrlRequired: true });
    expect(google.storeRequirements).toMatchObject({ screenshotMinimum: 2, screenshotMaximumPerDeviceType: 8, dataSafetyFormRequired: true, privacyPolicyUrlRequired: true });
    expect(google.accountDeletion).toMatchObject({ inAppPathPresent: true, publicWebResourcePresent: false });
    expect(readiness).toMatchObject({ submitted: false, uploaded: false, storeAvailable: false, providerObserved: false, externalEffectCount: 0 });
  });

  it("plans honest bilingual scenes without fabricating screenshots", () => {
    expect(screenshots.scenes.map((scene) => scene.code)).toEqual([
      "ASSISTANT_INTAKE",
      "PROJECT_MEMORY",
      "CALENDAR_AND_FOLLOW_UP",
      "INVOICE_READINESS",
      "PREPARED_COMMUNICATION",
      "HUMAN_EXCEPTION_SUPPORT",
    ]);
    expect(screenshots.scenes.every((scene) => scene.captured === false && scene.syntheticDataOnly === true)).toBe(true);
    expect(screenshots.locales).toEqual(["fr-CA", "en-CA"]);
  });

  it("fails closed on drift, fabricated evidence and inflated claims", () => {
    expect(() => validateStoreCompliance({ ...input, readiness: { ...readiness, submitted: true } })).toThrow("STORE_COMPLIANCE_CLAIM_INFLATION_REFUSED");
    expect(() => validateStoreCompliance({ ...input, screenshots: { ...screenshots, capturedCount: 1 } })).toThrow("STORE_COMPLIANCE_SCREENSHOT_EVIDENCE_REFUSED");
    expect(() => validateStoreCompliance({ ...input, google: { ...google, canonicalDataClassCodes: google.canonicalDataClassCodes.slice(1) } })).toThrow("STORE_COMPLIANCE_DATA_CLASS_DRIFT");
    expect(() => validateStoreCompliance({ ...input, apple: { ...apple, permissions: [] } })).toThrow("STORE_COMPLIANCE_PERMISSION_DRIFT");
  });

  it("uses a deterministic local validator with no account, network or upload action", () => {
    const source = readFileSync("scripts/validate-endvera-store-compliance.mjs", "utf8");
    expect(source).not.toMatch(/fetch\(|axios|child_process|execSync|spawnSync/iu);
    expect(source).not.toMatch(/eas\s+submit|fastlane|app-store-connect|play\.googleapis/iu);
  });
});
