import { createElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import SettingsScreen from "../src/app/(app)/settings";
import PermissionsScreen from "../src/app/(app)/permissions";

const effects = vi.hoisted(() => ({ push: vi.fn(), loadPermissions: vi.fn(), loadAuthority: vi.fn(), revoke: vi.fn(), command: vi.fn(), signOut: vi.fn(), buttons: [] as { label: string; press: () => void }[] }));
const state = vi.hoisted(() => ({ role: "OWNER" as "OWNER" | "OFFICE_MANAGER" | "FIELD_WORKER" | null }));
vi.mock("expo-router", () => ({ router: { push: effects.push } }));
vi.mock("react-native", () => ({ Text: "span", View: "div", StyleSheet: { create: (styles: unknown) => styles } }));
vi.mock("../src/components/ui", () => ({
  Button: ({ children, onPress }: { children: string; onPress: () => void }) => { effects.buttons.push({ label: children, press: onPress }); return createElement("button", null, children); },
  Heading: ({ title, body }: { title: string; body?: string }) => createElement("header", null, title, " ", body),
  Card: "section", Empty: "p", Label: "label", Loading: "p", Notice: "aside", Screen: ({ children }: { children: ReactNode }) => createElement("main", null, children),
  sharedStyles: { name: {}, muted: {}, value: {} },
}));
vi.mock("../src/state/mobile-session", () => ({ useMobileSession: () => ({
  bootstrap: null, activeWorkspace: state.role ? { id: "synthetic-workspace", name: "Synthetic workspace", role: state.role } : null,
  permissionCenter: null, permissionLoadState: "IDLE", authorityCockpit: null, authorityLoadState: "IDLE", publicError: null,
  loadPermissions: effects.loadPermissions, loadAuthority: effects.loadAuthority, revokePermission: effects.revoke,
  submitAuthorityCommand: effects.command, signOut: effects.signOut,
}) }));
const render = (screen: typeof SettingsScreen) => renderToStaticMarkup(createElement(screen));

beforeEach(() => { vi.clearAllMocks(); effects.buttons.length = 0; state.role = "OWNER"; });
describe("installed app and separate connection navigation — rendered components, not device proof", () => {
  it("preserves version diagnostics without asserting the installed build is unsigned or undeployed", () => {
    const text = render(SettingsScreen);
    expect(text).toContain("0.2.0"); expect(text).toContain("Android 7");
    expect(text).not.toContain("ni signé"); expect(text).not.toContain("ni déployé");
    expect(text).toContain("L’installation de l’app n’active pas tes connexions");
  });
  it("distinguishes workspace rules from phone access without claiming all live providers are disabled", () => {
    const text = render(PermissionsScreen);
    expect(text).not.toContain("Les fournisseurs externes restent désactivés");
    expect(text).toContain("Les accès du téléphone et le service texto se règlent séparément");
  });
  it.each([SettingsScreen, PermissionsScreen])("owner can navigate to the existing phone and personal-service surfaces", screen => {
    render(screen);
    effects.buttons.find(button => button.label === "Gérer les accès de mon téléphone")?.press();
    effects.buttons.find(button => button.label === "Vérifier mon service texto ENDVERA")?.press();
    expect(effects.push.mock.calls).toEqual([["/device-access"], ["/personal-service"]]);
    expect(effects.revoke).not.toHaveBeenCalled(); expect(effects.command).not.toHaveBeenCalled();
  });
  it.each(["OFFICE_MANAGER", "FIELD_WORKER", null] as const)("does not offer owner-only setup for role %s", role => {
    state.role = role; render(SettingsScreen); render(PermissionsScreen);
    expect(effects.buttons.some(button => button.label === "Vérifier mon service texto ENDVERA")).toBe(false);
    expect(effects.push).not.toHaveBeenCalled(); expect(effects.command).not.toHaveBeenCalled();
    expect(effects.revoke).not.toHaveBeenCalled(); expect(effects.signOut).not.toHaveBeenCalled();
  });
});
