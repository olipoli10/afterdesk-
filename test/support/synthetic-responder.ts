/**
 * ONE RESPONDER FOR THE WHOLE BOUNDARY.
 *
 * Five stages reach a provider: classification, planning, research, fetch,
 * extract. Each is answered here, in the provider's own wire shapes, from a
 * world declared before the run — and nothing past the boundary is touched.
 *
 * ── HOW A REQUEST FINDS ITS SCENARIO ──
 *
 * Classification, planning, research and fetch all carry the client's brief,
 * so they route on a distinctive phrase of it. `extract` does not: its prompt
 * is field names, source urls and the researcher's prose, with no brief in it
 * at all. It therefore routes on the URL HOST in its own evidence list, which
 * is why each world owns a host tag. Inventing a brief-carrying prompt for
 * extract to route on would have meant changing the primitive to suit the
 * harness, which is the one thing a test layer may never do.
 *
 * A stage this file cannot answer returns null, and the mock throws. Silence
 * is not an option: a responder that quietly returned "nothing found" would
 * make a broken harness look like an honest empty result.
 */

import { SYNTHETIC_PROFILES, asProviderResponse } from "./synthetic-plans";
import {
  extractResponse,
  fetchResponse,
  researchResponse,
  worldByMatch,
  worldByUrls,
} from "./synthetic-web";

/** The user turn's text, whatever content shape the primitive used. */
export function userTextOf(params: Record<string, unknown>): string {
  const messages = params.messages;
  if (!Array.isArray(messages)) return "";
  const parts: string[] = [];
  for (const m of messages) {
    const content = (m as { content?: unknown }).content;
    if (typeof content === "string") parts.push(content);
    else if (Array.isArray(content)) {
      for (const block of content) {
        if (block && typeof block === "object" && "text" in block) parts.push(String(block.text));
      }
    }
  }
  return parts.join("\n");
}

/** `max_uses` as the primitive declared it, so the responder honours its cap. */
function maxUsesOf(params: Record<string, unknown>): number {
  const tools = (params.tools as { max_uses?: number }[] | undefined) ?? [];
  return tools[0]?.max_uses ?? 0;
}

export function syntheticResponderFor(
  params: Record<string, unknown>,
  stage: string
): unknown | null {
  const model = String(params.model);
  const text = userTextOf(params);

  if (stage === "classification" || stage === "planning") {
    const profile = SYNTHETIC_PROFILES.find((p) => text.includes(p.match));
    if (!profile) return null;
    if (stage === "classification") return asProviderResponse(profile.classification, model);
    /**
     * File plans need the run's REAL attachment references, so the manifest
     * lines are read back out of the same prompt. The harness never invents a
     * ref: an id the engine cannot resolve would be a plan the compiler
     * rejects for a reason that has nothing to do with the scenario.
     */
    const refs = [...new Set([...text.matchAll(/file_(\d+):/g)].map((m) => `file_${m[1]}`))];
    return asProviderResponse(profile.plan(refs), model);
  }

  if (stage === "research") {
    const world = worldByMatch(text);
    return world ? researchResponse(world, model) : null;
  }

  if (stage === "fetch") {
    // The fetch prompt carries the defanged objective, not the raw brief, so
    // the world is found by the candidate urls it was handed.
    const world = worldByUrls(text) ?? worldByMatch(text);
    return world ? fetchResponse(world, model, text, maxUsesOf(params)) : null;
  }

  if (stage === "extract") {
    const world = worldByUrls(text);
    return world ? extractResponse(world, model, text) : null;
  }

  return null;
}
