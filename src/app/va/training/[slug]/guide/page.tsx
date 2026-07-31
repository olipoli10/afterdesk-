import Link from "next/link";
import { notFound } from "next/navigation";
import { requireRole } from "@/lib/authz";
import { prisma } from "@/lib/db";
import { familyOf } from "@/lib/families";
import { guideFor } from "@/lib/training/content";
import { Card, CardBody, LinkButton, SectionLabel } from "@/components/ui";

/**
 * The category's FIELD GUIDE — the hands-on companion to its course. The
 * course teaches the judgement; this is the thing you keep open while you
 * work: method steps, tools, what fails review, the pre-delivery checklist.
 * The "what counts as delivered" block quotes the category's REAL dispute
 * criteria from the database, so training and judgement can never drift.
 */

export const metadata = {
  title: "Field guide",
  robots: { index: false, follow: false },
};

export default async function FieldGuidePage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  await requireRole("VA");
  const { slug } = await params;

  const guide = guideFor(slug);
  if (!guide) notFound();

  const category = await prisma.taskCategory.findUnique({
    where: { slug },
    select: { name: true, disputeCriteria: true },
  });
  if (!category) notFound();

  const fam = familyOf(slug);

  return (
    <div className="mx-auto max-w-2xl">
      <p className="mb-4">
        <Link
          href={`/va/training/${slug}`}
          className="-mx-2 inline-flex min-h-11 items-center px-2 text-sm font-medium text-[#8A9099] transition-colors duration-150 hover:text-[#F7F6F3] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-[#0A0B0D]"
        >
          ← {category.name} course
        </Link>
      </p>

      {/* head */}
      <p
        className="flex items-center gap-1.5 font-mono text-[11px] font-semibold uppercase tracking-[0.1em]"
        style={{ color: fam.hue }}
      >
        <span
          aria-hidden
          className="h-[7px] w-[7px] rounded-full"
          style={{ backgroundColor: fam.hue }}
        />
        Field guide
      </p>
      <h1 className="mt-1.5 text-[26px] font-semibold leading-[1.15] tracking-[-0.02em] text-[#F7F6F3]">
        {category.name}
      </h1>
      <p className="mt-2 max-w-[58ch] text-[15px] leading-relaxed text-[#8A9099]">
        {guide.intro}
      </p>

      {/* the standard — the real dispute criteria, verbatim from the db */}
      <div className="mt-5 rounded-[4px] border border-white/10 bg-[#111317] px-4 py-3.5">
        <p
          className="font-mono text-[11px] font-semibold uppercase tracking-[0.1em]"
          style={{ color: fam.hue }}
        >
          What counts as delivered
        </p>
        {category.disputeCriteria ? (
          <p className="mt-1.5 text-sm leading-relaxed text-[#F7F6F3]">
            {category.disputeCriteria}
          </p>
        ) : null}
        <p className="mt-2 text-sm leading-relaxed text-[#F7F6F3]/80">{guide.delivered}</p>
      </div>

      {/* method */}
      <section className="mt-7">
        <SectionLabel as="h2" className="mb-3" tone="night">
          The method
        </SectionLabel>
        <Card tone="night">
          <ol className="divide-y divide-white/[0.06]">
            {guide.method.map((m, i) => (
              <li key={i} className="flex gap-3.5 px-4 py-3.5">
                <span
                  aria-hidden
                  className="mt-0.5 font-mono text-[13px] font-bold tabular-nums"
                  style={{ color: fam.hue }}
                >
                  {String(i + 1).padStart(2, "0")}
                </span>
                <span className="min-w-0">
                  <span className="block text-sm font-semibold text-[#F7F6F3]">{m.step}</span>
                  <span className="mt-0.5 block text-sm leading-relaxed text-[#8A9099]">
                    {m.detail}
                  </span>
                </span>
              </li>
            ))}
          </ol>
        </Card>
      </section>

      {/* tools */}
      <section className="mt-7">
        <SectionLabel as="h2" className="mb-3" tone="night">
          The tools
        </SectionLabel>
        <Card tone="night">
          <dl className="divide-y divide-white/[0.06]">
            {guide.tools.map((t, i) => (
              <div key={i} className="px-4 py-3">
                <dt className="text-sm font-semibold text-[#F7F6F3]">{t.name}</dt>
                <dd className="mt-0.5 text-sm leading-relaxed text-[#8A9099]">{t.use}</dd>
              </div>
            ))}
          </dl>
        </Card>
        <p className="mt-2 text-xs leading-relaxed text-[#8A9099]">
          Free tools only — no task here assumes paid software.
        </p>
      </section>

      {/* mistakes */}
      <section className="mt-7">
        <SectionLabel as="h2" className="mb-3" tone="night">
          What fails review
        </SectionLabel>
        <Card tone="night">
          <dl className="divide-y divide-white/[0.06]">
            {guide.mistakes.map((m, i) => (
              <div key={i} className="px-4 py-3">
                <dt className="text-sm font-semibold text-[#F7F6F3]">{m.mistake}</dt>
                <dd className="mt-0.5 text-sm leading-relaxed text-[#8A9099]">{m.why}</dd>
              </div>
            ))}
          </dl>
        </Card>
      </section>

      {/* worked example */}
      <section className="mt-7">
        <SectionLabel as="h2" className="mb-3" tone="night">
          A worked example
        </SectionLabel>
        <Card tone="night">
          <CardBody>
            <p className="text-sm leading-[1.7] text-[#F7F6F3]">{guide.example}</p>
          </CardBody>
        </Card>
      </section>

      {/* checklist */}
      <section className="mt-7">
        <SectionLabel as="h2" className="mb-3" tone="night">
          Before you upload
        </SectionLabel>
        <Card tone="night">
          <ul className="divide-y divide-white/[0.06]">
            {guide.checklist.map((c, i) => (
              <li key={i} className="flex gap-3 px-4 py-2.5">
                <span
                  aria-hidden
                  className="mt-[7px] h-[7px] w-[7px] shrink-0 rounded-[2px] border"
                  style={{ borderColor: fam.hue }}
                />
                <span className="text-sm leading-relaxed text-[#F7F6F3]">{c}</span>
              </li>
            ))}
          </ul>
        </Card>
      </section>

      <div className="mt-8 flex flex-wrap items-center gap-3 border-t border-white/10 pt-5">
        <LinkButton href={`/va/pool?cat=${slug}`} tone="night">
          See open {category.name} tasks
        </LinkButton>
        <LinkButton href={`/va/training/${slug}`} variant="secondary" tone="night">
          Back to the course
        </LinkButton>
      </div>
    </div>
  );
}
