import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = process.cwd();
const read = (file: string) => readFileSync(join(ROOT, file), "utf8");

describe("ENDVERA portal microphone candidate", () => {
  it("mounts voice inside the existing A2 composer and preserves explicit sending", () => {
    const chat = read("src/components/task-chat.tsx");
    expect(chat).toContain("VoiceIntake");
    expect(chat).toContain("composerRef");
    expect(chat).toContain("onTranscript");
    expect(chat).toContain("setInput");
    expect(chat).toContain("copy.sendToA2");
    expect(chat).toContain("sendIntakeTurn");
  });

  it("keeps the server boundary disabled and free of provider/network authority", () => {
    const action = read("src/server/actions/voice-intake.ts");
    expect(action).toContain('"use server"');
    expect(action).toContain("operationEnabled: false");
    expect(action).toContain("publishedPolicyAvailable: false");
    expect(action).toContain("eligibleRouteAvailable: false");
    expect(action).toContain("configuredSpendCeiling: false");
    expect(action).not.toMatch(/fetch\s*\(/);
    expect(action).not.toContain("process.env");
    expect(action).not.toMatch(/authorization/i);
    expect(action).not.toMatch(/openrouter/i);
  });

  it("exposes disclosure, consent, recording controls and accessible feedback", () => {
    const voice = read("src/components/voice-intake.tsx");
    expect(voice).toContain("getUserMedia");
    expect(voice).toContain("MediaRecorder");
    expect(voice).toContain("beforeunload");
    expect(voice).toContain('aria-live="polite"');
    expect(voice).toContain('role="alert"');
    expect(voice).toContain("copy.consent");
    expect(voice).toContain("copy.pause");
    expect(voice).toContain("copy.resume");
    expect(voice).toContain("copy.finish");
    expect(voice).toContain("copy.cancel");
    expect(voice).toContain("min-h-11");
    expect(voice).toContain("min-w-11");
    expect(voice).toContain("focusComposerAtEnd");
    expect(voice).toContain("speakButtonRef");
    expect(voice).toContain("focusSpeakAfterResetRef");
    expect(voice).toContain("failureActionRef");
    expect(voice).toContain("terminalPhaseForFocusRef");
    expect(voice).toContain('state.phase !== "uncertain"');
  });

  it("ships complete voice copy in English, French, Spanish and Tagalog", () => {
    const i18n = read("src/lib/i18n/client-portal.ts");
    for (const marker of ["voice: {", "Speak instead", "Parler au lieu d’écrire", "Hablar en vez de escribir", "Magsalita sa halip na mag-type"]) {
      expect(i18n).toContain(marker);
    }
    expect(i18n.match(/voice:\s*\{/g)).toHaveLength(4);
    expect(i18n).toContain("sendToA2: string");
    expect(i18n).toContain("paused: string");
    expect(i18n).toContain('paused: "En pause"');
  });

  it("keeps reduced motion static and the mobile status on its own line", () => {
    const css = read("src/app/globals.css");
    const voice = read("src/components/voice-intake.tsx");
    expect(css).toMatch(/prefers-reduced-motion:\s*reduce[\s\S]*data-voice-intake/);
    expect(voice).toContain("data-voice-primary-status");
    expect(voice).toContain("flex-wrap");
    expect(voice).not.toMatch(/requestAnimationFrame/);
  });
});
