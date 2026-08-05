import { LocalTime } from "@/components/local-time";
import { Card, CardBody, SectionLabel } from "@/components/ui";
import type { ExecutionReport } from "@/lib/queries/tasks";

/**
 * The execution report the client sees on their own task.
 *
 * The claim it makes is not marketing, it is a property of the code: a
 * Submission can only be created by requireApprovedVa() (which gates on
 * role === "VA") and can only be approved by requireRole("ADMIN"), and User
 * carries exactly one role column. The person who did the work is therefore
 * structurally incapable of being the person who released it. That is the one
 * sentence on this card that is stated without hedging, because it is the one
 * the type system enforces.
 *
 * Compact by default. The headline and the guarantee are always visible; the
 * step-by-step record is behind a native <details> so the page does not turn
 * into a log file, and so this needs no client-side JavaScript.
 */

const DOT: Record<string, string> = {
  review: "bg-[#1E7F5C]",
  flag: "bg-[#D98324]",
  normal: "bg-[#14161A]/20",
};

function headline(sentBack: number, reviewed: number): string | null {
  // Nothing has been through review yet, so there is no outcome to state and
  // the timeline below still carries the honest partial story.
  if (reviewed === 0) return null;
  if (sentBack === 0) return "Passed our review on the first delivery.";
  if (sentBack === 1) return "Sent back once for corrections before it passed our review.";
  return `Sent back ${sentBack} times for corrections before it passed our review.`;
}

export function ExecutionReportCard({ report }: { report: ExecutionReport }) {
  if (report.entries.length === 0) return null;

  const head = headline(report.sentBack, report.reviewed);

  return (
    <Card className="mb-4">
      <CardBody>
        <SectionLabel as="h2" className="mb-2">
          How this was handled
        </SectionLabel>

        {head ? (
          <p className="text-sm font-medium text-[#14161A]">{head}</p>
        ) : null}

        {/* Present tense on purpose: this card also renders on a task that is
            still being priced, where "the specialist who did this work" would
            presuppose work nobody has started. One sentence, every state. */}
        <p className="mt-1.5 text-sm leading-relaxed text-[#5B6069]">
          The specialist who does your work cannot send it to you. A separate reviewer has to
          pass it first, and that is enforced by the software, not by a policy anyone can
          skip.
        </p>

        {report.standard ? (
          <div className="mt-3 rounded-[4px] bg-[#14161A]/[0.02] px-3 py-2.5">
            <p className="font-mono text-[10px] font-medium uppercase tracking-[0.1em] text-[#5B6069]">
              Judged against
              {report.categoryName ? ` the ${report.categoryName.toLowerCase()} standard` : null}
            </p>
            <p className="mt-1 text-sm leading-relaxed text-[#14161A]">{report.standard}</p>
          </div>
        ) : null}

        <details className="group mt-3 border-t border-[#14161A]/[0.06] pt-3">
          <summary className="-mx-1 cursor-pointer list-none px-1 py-1 text-sm font-medium text-[#14161A] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#14161A]/30">
            <span className="underline decoration-[#14161A]/25 underline-offset-4 group-open:decoration-transparent">
              Every step, with the time it happened
            </span>
            <span className="ml-1.5 font-mono text-xs text-[#5B6069] group-open:hidden">
              ({report.entries.length})
            </span>
          </summary>

          <ol className="mt-3 space-y-0">
            {report.entries.map((e, i) => (
              <li key={i} className="relative flex gap-3 pb-3 last:pb-0">
                {/* Connector, drawn behind the dot and stopped on the last row. */}
                {i < report.entries.length - 1 ? (
                  <span
                    aria-hidden
                    className="absolute left-[3.5px] top-[7px] h-full w-px bg-[#14161A]/[0.10]"
                  />
                ) : null}
                <span
                  aria-hidden
                  className={`relative mt-[5px] h-2 w-2 shrink-0 rounded-full ring-2 ring-white ${
                    DOT[e.tone] ?? DOT.normal
                  }`}
                />
                <div className="min-w-0 flex-1">
                  <p className="text-sm leading-snug text-[#14161A]">{e.label}</p>
                  <p className="mt-0.5 font-mono text-xs tabular-nums text-[#5B6069]">
                    <LocalTime iso={e.at} dateStyle="short" />
                  </p>
                </div>
              </li>
            ))}
          </ol>

          {report.sentBack > 0 ? (
            <p className="mt-1 border-t border-[#14161A]/[0.06] pt-3 text-xs leading-relaxed text-[#5B6069]">
              You are not shown the returned versions or what our reviewer wrote to the
              specialist. Only work that passed reaches you.
            </p>
          ) : null}
        </details>
      </CardBody>
    </Card>
  );
}
