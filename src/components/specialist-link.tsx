import Link from "next/link";
import { CLIENT_I18N } from "@/lib/i18n/client";
import type { SiteLang } from "@/lib/i18n/langs";

/**
 * THE DOOR TO THE WORKER SIDE, KEPT SECONDARY ON PURPOSE.
 *
 * The repositioning removed the EARN toggle from the client header, and that
 * removal was right and stays: a client landing on a page that offers to
 * switch them to the worker side is being told, above the fold, that this is a
 * two-sided marketplace, which is the one reading the positioning cannot
 * carry.
 *
 * But removing the toggle also removed the only path. An audit of the four
 * client-corridor pages found the link survived on the homepage footer alone;
 * /about, /how-it-works and /services offered a specialist no way in at all,
 * in any of the four languages. That is not restraint, it is a dead end for
 * the people the Academy exists to reach.
 *
 * So the asymmetry is deliberate and this component encodes it:
 *
 *   client -> specialists   secondary, footer only, never the header
 *   specialists -> client   clearly available (the /workers header keeps its
 *                           own toggle, which is correct on that side)
 *
 * The label is `CLIENT_I18N.footer.work` rather than a new string, so the
 * wording is identical to the homepage's own footer link in all four
 * languages. A second door with a different name reads as a different place.
 */
export function SpecialistLink({
  lang,
  tone = "paper",
}: {
  lang: SiteLang;
  tone?: "paper" | "night";
}) {
  const cls =
    tone === "night"
      ? "text-[#8A9099] hover:text-white"
      : "text-[#5B6069] hover:text-[#14161A]";
  return (
    <Link
      href="/workers"
      className={`inline-flex min-h-11 items-center transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-current ${cls}`}
    >
      {CLIENT_I18N[lang].footer.work}
    </Link>
  );
}
