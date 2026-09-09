import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import ConstructionPublicPage from "@/app/construction/page";
import { interpretConstructionMessage } from "@/lib/construction-assistant-v1/interpreter";
import type { InterpreterContext } from "@/lib/construction-assistant-v1/contracts";

vi.stubGlobal("React", React);
vi.mock("next/headers", () => ({ cookies: async () => ({ get: () => undefined }) }));
vi.mock("@/components/lang-switch", () => ({ LangSwitch: () => null }));
vi.mock("@/components/logo", () => ({ Wordmark: () => null }));

const context: InterpreterContext = {
  referenceNow: "2026-09-09T13:00:00.000Z", locale: "fr-CA", timezone: "America/Toronto",
  projects: [{ id: "syn-project-laval", code: "LAVAL-001", name: "Laval" }],
  contacts: [{ id: "syn-contact-marc", displayName: "Marc", preferredLanguage: "fr" }],
};
const plain = (html: string) => html.replace(/<[^>]*>/g, " ").replace(/&#x27;/g, "'").replace(/&quot;/g, '"').replace(/\s+/g, " ");

describe.each(["fr", "en"] as const)("Construction public-copy boundary (%s)", (lang) => {
  const render = async () => renderToStaticMarkup(await ConstructionPublicPage({ searchParams: Promise.resolve({ lang }) }));

  it("keeps current availability next to the hero promise, outside collapsed footer details", async () => {
    const hero = (await render()).split('id="demo"')[0];
    expect(plain(hero)).toContain(lang === "fr" ? "Les vrais textos, appels et calendriers connectés ne sont pas encore activés" : "Live texting, calling and connected calendars are not enabled yet");
    expect(hero).not.toContain("<details");
  });

  it("labels the multi-action scene as an unexecuted target illustration with a non-send control", async () => {
    const html = await render();
    expect(plain(html)).toContain(lang === "fr" ? "ILLUSTRATION DU PARCOURS VISÉ · NON EXÉCUTÉ" : "TARGET WORKFLOW ILLUSTRATION · NOT EXECUTED");
    expect(html).toMatch(/<button[^>]*type="button"[^>]*disabled=""[^>]*>/);
    expect(plain(html)).toContain(lang === "fr" ? "Illustration — aucun envoi" : "Illustration — no sending");
    expect(plain(html)).not.toContain(lang === "fr" ? "Le rendez-vous est ajouté" : "The appointment has been added");
  });

  it("describes a prepared human-review file, not confirmed receipt by a person", async () => {
    const text = plain(await render());
    expect(text).toContain(lang === "fr" ? "Aucune réception ni prise en charge humaine n’est confirmée" : "No human receipt or handling is confirmed");
    expect(text).not.toContain(lang === "fr" ? "une personne reçoit le dossier complet" : "a person gets the full job record");
  });

  it.each(["hero","capabilities","control"] as const)("qualifies human-review preparation in the %s section as a target, not an action on this page",async(section)=>{
    const html=await render();
    const start=section==="hero"?0:section==="capabilities"?html.indexOf(lang==="fr"?"LE PRODUIT VISÉ":"THE TARGET PRODUCT"):html.indexOf('id="control"');
    const end=section==="hero"?html.indexOf('id="demo"'):html.indexOf("</section>",start);
    expect(start).toBeGreaterThanOrEqual(0);
    const text=plain(html.slice(start,end));
    expect(text).toContain(lang==="fr"?"Dans le parcours visé, un dossier serait préparé":"In the target workflow, a file would be prepared");
    for(const present of lang==="fr"?["Dossier préparé pour une revue humaine","le dossier est préparé localement","ENDVERA prépare localement"]:["A file prepared for human review","a file is prepared locally","ENDVERA prepares the job"]){expect(text).not.toContain(present);}
  });

  it("qualifies the walkthrough locally and disclaims receiving, sending, calendar writes and saved actions", async () => {
    const html=await render();
    const walkthrough=plain(html.slice(html.indexOf('id="walkthrough"'),html.indexOf('id="control"')));
    expect(walkthrough).toContain(lang==="fr"?"PARCOURS VISÉ · NON EXÉCUTÉ":"TARGET WORKFLOW · NOT EXECUTED");
    expect(walkthrough).toContain(lang==="fr"?"ne reçoit aucun texto ni appel réel":"does not receive live texts or calls");
    expect(walkthrough).toContain(lang==="fr"?"n’envoie aucun message, ne modifie aucun calendrier et n’enregistre aucune action accomplie":"does not send messages, change calendars or save completed actions");
    const text=plain(html);
    for(const unsupported of lang==="fr"?["Tu textes ou tu appelles","Par texto, appel ou dans l’application, tu dis","L’action, la preuve et la prochaine étape sont conservées","Avant d’envoyer un texto"]:["Text or call","By text, phone or in the app, simply","The action, proof and next step are saved","Before it sends a text"]){expect(text).not.toContain(unsupported);}
  });

  it("interprets the exact simple calendar phrase rendered in the page using synthetic context", async () => {
    const html = await render();
    const uses = plain(html.slice(html.indexOf('id="uses"')));
    const phrase = uses.match(lang === "fr" ? /«\s*([^»]+?)\s*»/ : /“([^”]+)”/)?.[1];
    expect(phrase).toBe(lang === "fr" ? "Qu’est-ce que j’ai demain?" : "What do I have tomorrow?");
    const result = interpretConstructionMessage(phrase!, { ...context, locale: lang === "fr" ? "fr-CA" : "en-CA" });
    expect(result).toMatchObject({ intent: "CALENDAR_QUERY", queryWindow: { kind: "TOMORROW" }, startsAtUtc: null, endsAtUtc: null, outboundDraft: null });
  });

  it("does not treat the multi-action illustration as interpreter execution evidence", async () => {
    const phrase = lang === "fr"
      ? "Ajoute Marc au calendrier demain à 8 h pour Laval et prépare-lui un texto."
      : "Add Marc to the calendar tomorrow at 8 for the Laval job and draft a text for him.";
    expect(plain(await render())).toContain(phrase);
    const result = interpretConstructionMessage(phrase, { ...context, locale: lang === "fr" ? "fr-CA" : "en-CA" });
    expect(result).toMatchObject({ intent: "UNSUPPORTED", startsAtUtc: null, outboundDraft: null });
  });
});

it("keeps the illustrative page disconnected from submission and interpreter execution", () => {
  const source = readFileSync("src/app/construction/page.tsx", "utf8");
  expect(source).not.toMatch(/onClick=|onSubmit=|<form\b|fetch\(|interpretConstructionMessage|use server/);
});
