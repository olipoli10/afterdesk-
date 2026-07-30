import Link from "next/link";
import { notFound } from "next/navigation";
import { requireRole } from "@/lib/authz";
import { prisma } from "@/lib/db";
import { familyOf } from "@/lib/families";
import { guideFor } from "@/lib/training/content";
import { Card, CardBody, LinkButton, SectionLabel } from "@/components/ui";

/**
 * One category's field guide. Structure over prose: method as a numbered
 * ladder, mistakes as cause→consequence pairs, the checklist as the last
 * thing before the pool link. The "what counts as delivered" block quotes
 * the category's REAL dispute criteria from the database — the same text
 * the pre-claim page shows — so training and judgement can never drift
 * apart.
 */

export const metadata = {
  title: "Training",
  robots: { index: false, follow: false },
};

export default async function TrainingGuidePage({
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
          href="/va/training"
          className="-mx-2 inline-flex min-h-11 items-center px-2 text-sm font-medium text-[#5B6069] transition-colors duration-150 hover:text-[#14161A] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#14161A] focus-visible:ring-offset-2 focus-visible:ring-offset-[#F7F6F3]"
        >
          ← Training
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
        {fam.label}
      </p>
      <h1 className="mt-1.5 text-[26px] font-semibold leading-[1.15] tracking-[-0.02em] text-[#14161A]">
        {category.name}
      </h1>
      <p className="mt-2 max-w-[58ch] text-[15px] leading-relaxed text-[#5B6069]">
        {guide.intro}
      </p>

      {/* the standard — the real dispute criteria, verbatim from the db */}
      <div className="mt-5 rounded-[4px] px-4 py-3.5" style={{ backgroundColor: fam.tint }}>
        <p
          className="font-mono text-[11px] font-semibold uppercase tracking-[0.1em]"
          style={{ color: fam.hue }}
        >
          What counts as delivered
        </p>
        {category.disputeCriteria ? (
          <p className="mt-1.5 text-sm leading-relaxed text-[#14161A]">
            {category.disputeCriteria}
          </p>
        ) : null}
        <p className="mt-2 text-sm leading-relaxed text-[#14161A]/80">{guide.delivered}</p>
      </div>

      {/* method */}
      <section className="mt-7">
        <SectionLabel as="h2" className="mb-3">
          The method
        </SectionLabel>
        <Card>
          <ol className="divide-y divide-[#14161A]/[0.06]">
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
                  <span className="block text-sm font-semibold text-[#14161A]">{m.step}</span>
                  <span className="mt-0.5 block text-sm leading-relaxed text-[#5B6069]">
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
        <SectionLabel as="h2" className="mb-3">
          The tools
        </SectionLabel>
        <Card>
          <dl className="divide-y divide-[#14161A]/[0.06]">
            {guide.tools.map((t, i) => (
              <div key={i} className="px-4 py-3">
                <dt className="text-sm font-semibold text-[#14161A]">{t.name}</dt>
                <dd className="mt-0.5 text-sm leading-relaxed text-[#5B6069]">{t.use}</dd>
              </div>
            ))}
          </dl>
        </Card>
        <p className="mt-2 text-xs leading-relaxed text-[#5B6069]">
          Free tools only — no task here assumes paid software.
        </p>
      </section>

      {/* mistakes */}
      <section className="mt-7">
        <SectionLabel as="h2" className="mb-3">
          What fails review
        </SectionLabel>
        <Card>
          <dl className="divide-y divide-[#14161A]/[0.06]">
            {guide.mistakes.map((m, i) => (
              <div key={i} className="px-4 py-3">
                <dt className="text-sm font-semibold text-[#14161A]">{m.mistake}</dt>
                <dd className="mt-0.5 text-sm leading-relaxed text-[#5B6069]">{m.why}</dd>
              </div>
            ))}
          </dl>
        </Card>
      </section>

      {/* worked example */}
      <section className="mt-7">
        <SectionLabel as="h2" className="mb-3">
          A worked example
        </SectionLabel>
        <Card>
          <CardBody>
            <p className="text-sm leading-[1.7] text-[#14161A]">{guide.example}</p>
          </CardBody>
        </Card>
      </section>

      {/* checklist */}
      <section className="mt-7">
        <SectionLabel as="h2" className="mb-3">
          Before you upload
        </SectionLabel>
        <Card>
          <ul className="divide-y divide-[#14161A]/[0.06]">
            {guide.checklist.map((c, i) => (
              <li key={i} className="flex gap-3 px-4 py-2.5">
                <span
                  aria-hidden
                  className="mt-[7px] h-[7px] w-[7px] shrink-0 rounded-[2px] border"
                  style={{ borderColor: fam.hue }}
                />
                <span className="text-sm leading-relaxed text-[#14161A]">{c}</span>
              </li>
            ))}
          </ul>
        </Card>
      </section>

      <div className="mt-8 flex flex-wrap items-center gap-3 border-t border-[#14161A]/[0.08] pt-5">
        <LinkButton href={`/va/pool?cat=${slug}`}>See open {category.name} tasks</LinkButton>
        <LinkButton href="/va/training" variant="secondary">
          All guides
        </LinkButton>
      </div>
    </div>
  );
}
