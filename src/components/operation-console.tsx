import type { ConsoleCopy } from "@/lib/i18n/client";
import { OperationConsoleMotion } from "./operation-console-motion";

/**
 * THE OPERATION CONSOLE — deliberately static.
 *
 * Seven stations, one result moving through them. This is the section that
 * answers the question the rest of the page leaves open: what actually
 * happens between "you approve" and "you receive". It is a Server Component
 * with no JavaScript, no timers and no animation ON PURPOSE — the diagram has
 * to explain the operating model on its own before any motion is allowed to
 * decorate it. If a future slice animates this, the static rendering below
 * remains the reduced-motion, no-JS and screen-reader truth.
 *
 * TRUTH RULES this component is built around (ADR-022, invariant 18):
 *  - one result, never a queue: nothing here may imply production volume;
 *  - the method lane list (station 04) names POSSIBLE managed methods, not a
 *    claim that every lane is currently automatic;
 *  - human review is visibly part of the model (station 06 and the closing
 *    note), because it is part of the model;
 *  - no recurring loop, no "runs by itself", no throughput counter.
 *
 * COLOR LAW (globals.css): amber #D98324 marks the ISSUE station only; green
 * #1E7F5C marks VERIFIED only. Green text never sits directly on the night
 * surface, so the verified chip is paper text carrying a green underline —
 * the same treatment the homepage ledger uses for "passed". Color is never
 * the only carrier: both states also say their word (statusIssue /
 * statusVerified), which is what test/public-site-truth.test.ts pins.
 *
 * STAGE B added a motion layer WITHOUT changing any of the above. The list
 * below is still rendered here, on the server, and is handed to
 * `OperationConsoleMotion` as `children` — which Next.js documents as staying
 * outside the client module graph, so none of this markup becomes a client
 * component. The island only sets two numbers on a wrapper; `globals.css`
 * derives every animated state from them. Delete the island and the page is
 * exactly what it was.
 *
 * Without CSS this renders as a plain ordered list read top to bottom —
 * number, station name, status word, one line of what happens. That reading
 * order IS the journey, which is why the rail is vertical at every width
 * instead of a seven-column strip that would crush each station to ~160px.
 */
export function OperationConsole({ copy }: { copy: ConsoleCopy }) {
  return (
    <section className="border-t border-white/8 bg-[#0D0E11]">
      <div className="mx-auto w-full max-w-[1120px] px-6 py-16 sm:py-24">
        <p className="font-mono text-[11px] uppercase tracking-[0.14em] text-[#767C86]">
          {copy.label}
        </p>
        <h2 className="mt-3 max-w-[30ch] text-[clamp(1.4rem,3vw,2rem)] font-semibold leading-[1.2] tracking-[-0.02em] text-white">
          {copy.h2}
        </h2>
        {/* The whole journey in one paragraph for anyone not seeing the
            diagram — same convention as the hero's srPreview. */}
        <p className="sr-only">{copy.srSummary}</p>

        <OperationConsoleMotion copy={copy.motion}>
        <ol className="mt-12 max-w-[760px]">
          {copy.stations.map(([label, body], i) => {
            const isIssue = i === 4;
            const isVerified = i === 6;
            return (
              <li
                key={label}
                /* `relative` positions the rail segment below, nothing else.
                   The ring anchors to the badge, not to this row. */
                className="op-station relative grid grid-cols-[44px_1fr] gap-x-5 pb-9 last:pb-0"
              >
                {/* rail segment down to the next station */}
                {i < copy.stations.length - 1 && (
                  <span
                    aria-hidden
                    className="absolute bottom-0 left-[21.5px] top-11 w-px bg-white/12"
                  />
                )}
                {/* `relative` here is load-bearing, not decoration: the ring
                    inside is absolutely positioned, so it resolves against the
                    nearest positioned ancestor. Without it that ancestor is
                    the row, and the ring renders as a full-width capsule
                    (~766px desktop, ~333px mobile) instead of a 50px circle
                    around the badge. */}
                <span
                  className={`relative grid h-11 w-11 place-items-center rounded-full border bg-[#111317] font-mono text-[12px] tabular-nums ${
                    isIssue
                      ? "border-[#D98324]/60 text-[#D98324]"
                      : isVerified
                        ? "border-[#1E7F5C]/60 text-[#C9CDD3]"
                        : "border-white/15 text-[#8A9099]"
                  }`}
                >
                  {String(i + 1).padStart(2, "0")}
                  {/* Purely decorative: marks the station being worked on.
                      Driven by the wrapper's `data-active` in globals.css, and
                      it carries no information the words do not. */}
                  <span aria-hidden className="op-station-ring" />
                </span>
                <div className="pt-2">
                  <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                    <p className="text-[16px] font-medium text-white">{label}</p>
                    {isIssue && (
                      <span className="font-mono text-[10px] uppercase tracking-[0.16em] text-[#D98324]">
                        {copy.statusIssue}
                      </span>
                    )}
                    {isVerified && (
                      <span className="border-b-2 border-[#1E7F5C] pb-px font-mono text-[10px] uppercase tracking-[0.16em] text-[#F7F6F3]">
                        {copy.statusVerified}
                      </span>
                    )}
                  </div>
                  <p className="mt-1.5 max-w-[52ch] text-[14px] leading-[1.6] text-[#9AA1AB]">
                    {body}
                  </p>
                </div>
              </li>
            );
          })}
        </ol>
        </OperationConsoleMotion>

        {/* The sentence that closes the autonomy reading: a person reviews
            every delivery. Stated after the diagram, where it lands as the
            rule the diagram just demonstrated. */}
        <p className="mt-10 max-w-[62ch] border-t border-white/8 pt-6 text-[13px] leading-[1.6] text-[#767C86]">
          {copy.reviewNote}
        </p>
      </div>
    </section>
  );
}
