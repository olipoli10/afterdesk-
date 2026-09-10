import { createElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { PersonalCalendarDraftTimes } from "../src/components/personal-calendar-draft-times";
const session = vi.hoisted(() => ({ activeWorkspace: { id: "synthetic-workspace", defaultLocale: "fr-CA" } }));
vi.mock("react-native", () => ({ Text: ({ children }: { children: ReactNode }) => createElement("span", null, children), View: "div" }));
vi.mock("../src/components/ui", () => ({ Notice: "aside", sharedStyles: { muted: {}, value: {} } }));
vi.mock("../src/state/mobile-session", () => ({ useMobileSession: () => session }));
const draft = Object.freeze({ startsAt: "2026-09-11T18:00:00.000Z", endsAt: "2026-09-11T19:00:00.000Z", timezone: "America/Toronto" });
const render = (value: { startsAt: string; endsAt: string; timezone: string } = draft, showRaw = true) => renderToStaticMarkup(createElement(PersonalCalendarDraftTimes, { workspaceId: "synthetic-workspace", draft: value, showRaw }));
beforeEach(() => { session.activeWorkspace = { id: "synthetic-workspace", defaultLocale: "fr-CA" }; });
describe("calendar draft local time rendering", () => {
  it("renders local dates and exact raw values together in French", () => {
    const output = render();
    expect(output).toContain("Heures locales du brouillon"); expect(output).toContain("14:00 (UTC−04:00)"); expect(output).not.toContain("14:00:00.000");
    expect(output).toContain(draft.startsAt); expect(output).toContain(draft.endsAt); expect(output).toContain(draft.timezone);
  });
  it("uses the matching workspace English locale", () => {
    session.activeWorkspace.defaultLocale = "en-CA";
    expect(render()).toContain("Draft local times"); expect(render()).toContain("Exact recorded start");
  });
  it("uses the existing French fallback for unsupported or nonmatching workspace locales", () => {
    session.activeWorkspace.defaultLocale = "es"; expect(render()).toContain("Heures locales du brouillon");
    session.activeWorkspace = { id: "other-workspace", defaultLocale: "en-CA" }; expect(render()).toContain("Heures locales du brouillon");
  });
  it.each(["Mars/Colony", ""])("renders invalid timezone %s as explicit unavailability, preserving raw values", timezone => {
    const output = render({ ...draft, timezone });
    expect(output).toContain("Heure locale indisponible"); expect(output).toContain(draft.startsAt); expect(output).not.toContain("14:00:00.000");
  });
  it("renders invalid dates without throwing and localizes the refusal", () => {
    session.activeWorkspace.defaultLocale = "en-CA";
    expect(render({ ...draft, startsAt: "2026-02-30T14:00:00Z" })).toContain("Local time unavailable");
  });
  it("can supplement an existing exact-field list without duplicating raw values", () => {
    const output = render(draft, false); expect(output).toContain("14:00 (UTC−04:00)"); expect(output).not.toContain(draft.startsAt);
  });
});
