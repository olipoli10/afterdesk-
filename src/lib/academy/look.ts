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
  hue: "#1B2740", // dusk — the platform's own colour: this is about working HERE
  tint: "#E7EAF1",
};

/**
 * Career sits in the dusk family too — it is about you and the profession
 * rather than a kind of work — but lifted so the two sections read apart.
 * 8.26:1 on paper.
 */
const CAREER: Family = {
  key: "career",
  label: "The career",
  hue: "#3A4A66",
  tint: "#E8EAEF",
};

/**
 * Craft gets its own hue, solved to the same contrast as the four work
 * families (6.87:1 on paper, against their 6.87–6.97) so the whole set still
 * differs in hue only. Sienna is the one warm slot left that collides with
 * nothing reserved: green is money, red is deadline urgency, amber is
 * returned work.
 */
const CRAFT: Family = {
  key: "craft",
  label: "The toolkit",
  hue: "#7A4A1F",
  tint: "#EFE9E2",
};

export const TRACK_LOOK: Record<Exclude<CourseTrack, "category">, Family> = {
  foundations: FOUNDATIONS,
  career: CAREER,
  craft: CRAFT,
};

export function courseLook(track: CourseTrack, slug: string): Family {
  return track === "category" ? familyOf(slug) : TRACK_LOOK[track];
}

/**
 * FOUNDATIONS.hue (#1B2740) is the platform's own "dusk" colour — chosen
 * dark on purpose so it holds 8+:1 contrast against the PAPER academy
 * (src/app/academy). Every course-detail page under the WORKER portal
 * (src/app/va/training/**) is night-toned, and that same dark navy sits
 * almost flush against the #0A0B0D page behind it — the "Start here —
 * Foundations" label and its dot were reading as invisible there.
 *
 * Use this wherever a look's hue paints TEXT, a dot, or a border on a
 * night-toned page; leave look.hue untouched for the paper academy, whose
 * contrast was already solved.
 */
export function nightHue(look: Family): string {
  return look.key === "foundations" ? "#6E85B8" : look.hue;
}
