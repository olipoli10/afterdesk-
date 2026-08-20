import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = process.cwd();
const read = (file: string) => readFileSync(join(ROOT, file), "utf8");

describe("ENDVERA entrepreneur portal experience", () => {
  it("keeps login and client registration inside the ENDVERA night identity", () => {
    const login = read("src/app/(public)/login/page.tsx");
    const register = read("src/app/(public)/register/page.tsx");
    const shell = read("src/components/auth-shell.tsx");

    expect(login).toMatch(/<AuthShell[\s\S]*tone="endvera"/);
    expect(login).toMatch(/<LoginForm[\s\S]*tone="glass"/);
    expect(register).toMatch(/<AuthShell[\s\S]*tone="endvera"/);
    expect(shell).toContain('tone?: "paper" | "endvera"');
    expect(shell).toContain("night-grid");
    expect(shell).toContain("data-endvera-auth");
  });

  it("keeps the safe post-login destination while changing authentication language", () => {
    const login = read("src/app/(public)/login/page.tsx");
    const languageSwitch = read("src/components/client-language-switch.tsx");
    const genericSwitch = read("src/components/lang-switch.tsx");

    expect(login).toContain("languageSearch");
    expect(login).toMatch(/ClientLanguageSwitch[\s\S]*search=\{languageSearch\}/);
    expect(languageSwitch).toContain("search={search}");
    expect(genericSwitch).toContain("new URLSearchParams(search)");
  });

  it("uses the ENDVERA night shell for every authenticated client route", () => {
    const layout = read("src/app/client/layout.tsx");
    const appShell = read("src/components/app-shell.tsx");

    expect(layout).toMatch(/<AppShell[\s\S]*tone="night"/);
    expect(layout).toMatch(/<AppShell[\s\S]*width="wide"/);
    expect(layout).toContain("CLIENT_PORTAL_I18N");
    expect(appShell).toContain("data-endvera-portal");
  });

  it("makes the dashboard lead with action, status and a direct A2 request door", () => {
    const dashboard = read("src/app/client/page.tsx");

    expect(dashboard).toContain("data-portal-overview");
    expect(dashboard).toContain("data-portal-request");
    expect(dashboard).toContain("A2PortalPresence");
    expect(dashboard).toContain("needsAction");
    expect(dashboard).toContain("inMotion");
    expect(dashboard).toContain("delivered");
  });

  it("puts the frozen original A2 inside a large thinking box instead of a chat bubble", () => {
    const chat = read("src/components/task-chat.tsx");
    const a2 = read("src/components/a2-portal-presence.tsx");

    expect(chat).toContain("data-a2-thinking-box");
    expect(chat).toContain("A2PortalPresence");
    expect(chat).toContain('role="log"');
    expect(chat).toContain('aria-live="polite"');
    expect(a2).toContain("A2_REST");
    expect(a2).toContain("data-a2-portal-presence");
    expect(a2).toContain('label="A2"');
  });

  it("opens on a quiet A2 conversation canvas instead of a process dashboard", () => {
    const page = read("src/app/client/tasks/new/page.tsx");
    const chat = read("src/components/task-chat.tsx");
    const a2 = read("src/components/a2-portal-presence.tsx");
    const i18n = read("src/lib/i18n/client-portal.ts");

    expect(page).toContain("data-a2-blank-canvas");
    expect(page).not.toContain('<ol aria-label="Request process"');
    expect(chat).toContain("data-a2-opening");
    expect(chat).toContain("turns.slice(1)");
    expect(chat).toContain("copy.start");
    expect(a2).toContain('size?: "compact" | "standard" | "hero"');
    expect(i18n).toContain("start: string");
  });

  it("preserves the real intake and submission actions and names A2 as intake only", () => {
    const chat = read("src/components/task-chat.tsx");
    const intake = read("src/server/actions/intake.ts");

    expect(chat).toContain('from "@/server/actions/intake"');
    expect(chat).toContain('from "@/server/actions/client-tasks"');
    expect(chat).toContain("sendIntakeTurn(next.slice(1))");
    expect(chat).toContain("submitTask({");
    expect(chat).toContain("A2 structures the brief");
    expect(intake).toContain('const user = await requireRole("CLIENT")');
  });

  it("ships four portal languages and a static reduced-motion composition", () => {
    const i18n = read("src/lib/i18n/client-portal.ts");
    const css = read("src/app/globals.css");

    expect(i18n).toContain("en:");
    expect(i18n).toContain("fr:");
    expect(i18n).toContain("es:");
    expect(i18n).toContain("tl:");
    expect(i18n).toMatch(/const es:[\s\S]*sectionTitles:[\s\S]*statusLabels:/);
    expect(i18n).toMatch(/const tl:[\s\S]*sectionTitles:[\s\S]*statusLabels:/);
    expect(css).toMatch(/prefers-reduced-motion:\s*reduce[\s\S]*data-a2-portal-presence/);
  });

  it("keeps legacy client documents readable inside the ENDVERA night shell", () => {
    const detail = read("src/app/client/tasks/[id]/page.tsx");
    const standing = read("src/app/client/standing-capacity/page.tsx");

    expect(detail).toContain("data-client-document");
    expect(detail).toContain("bg-[#F7F6F3]");
    expect(standing).toContain("data-client-document");
    expect(standing).toContain("bg-[#F7F6F3]");
  });
});
