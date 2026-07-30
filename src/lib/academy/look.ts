import { familyOf, type Family } from "@/lib/families";
import type { CourseTrack } from "./types";

/**
 * Visual identity of a course. Category courses inherit their work family's
 * hue from the board, so the taxonomy a worker learns in the academy is the
 * one they claim from. Foundations get dusk — the platform's own color,
 * because those courses are about working HERE, not about a kind of work.
 * (Not server-only: hue strings carry no secrets.)
 */
const FOUNDATIONS: Family = {
  key: "foundations",
  label: "Foundations",
  hue: "#1B2740",
  tint: "#E7EAF1",
};

export function courseLook(track: CourseTrack, slug: string): Family {
  return track === "foundations" ? FOUNDATIONS : familyOf(slug);
}
