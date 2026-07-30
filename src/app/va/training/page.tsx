import Link from "next/link";
import { requireRole } from "@/lib/authz";
import { prisma } from "@/lib/db";
import { familyOf, FAMILIES } from "@/lib/families";
import { hasGuide, guideFor } from "@/lib/training/content";
import { PageTitle } from "@/components/ui";

/**
 * The training hub — one guide per task category, grouped by work family
 * with the same hue system as the board, so the taxonomy a worker learns
 * here is the same one they claim from.
 *
 * Deliberately open to EVERY worker, approved or not: an applicant who reads
 * the guides before their review delivers better first work, and nothing
 * here is client data. The category list comes from the database (the real
 * taxonomy); the guide content lives in code (survives any db reset).
 */

export const metadata = {
  title: "Training",
  robots: { index: false, follow: false },
};

export default async function TrainingHubPage() {
  await requireRole("VA");

  const categories = await prisma.taskCategory.findMany({
    select: { slug: true, name: true, sortOrder: true },
    orderBy: { sortOrder: "asc" },
  });
  const withGuides = categories.filter((c) => hasGuide(c.slug));

  return (
    <>
      <PageTitle
        title="Training"
        sub="One field guide per category: the method, the tools, the mistakes that fail review, and what “delivered” means. Read the guide before your first task in a category — it is written to get you through QC on the first try."
      />

      <div className="space-y-7">
        {FAMILIES.map((f) => {
          const inFamily = withGuides.filter((c) => familyOf(c.slug).key === f.key);
          if (inFamily.length === 0) return null;
          return (
            <section key={f.key}>
              <p
                className="mb-2.5 flex items-center gap-2 font-mono text-[11px] font-semibold uppercase tracking-[0.1em]"
                style={{ color: f.hue }}
              >
                <span
                  aria-hidden
                  className="h-[3px] w-4 shrink-0 rounded-[2px]"
                  style={{ backgroundColor: f.hue }}
                />
                {f.label}
              </p>
              <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
                {inFamily.map((c) => {
                  const guide = guideFor(c.slug)!;
                  return (
                    <Link
                      key={c.slug}
                      href={`/va/training/${c.slug}`}
                      className="group flex min-w-0 flex-col rounded-[4px] border border-[#E4E2DC] bg-white px-4 py-3.5 transition-colors duration-150 hover:border-[#D5D2CB] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#14161A] focus-visible:ring-offset-2 focus-visible:ring-offset-[#F7F6F3]"
                    >
                      <span className="flex items-center gap-1.5">
                        <span
                          aria-hidden
                          className="h-[7px] w-[7px] shrink-0 rounded-full"
                          style={{ backgroundColor: f.hue }}
                        />
                        <span className="text-[15.5px] font-semibold tracking-[-0.008em] text-[#14161A] group-hover:underline group-hover:decoration-[#14161A]/30 group-hover:underline-offset-2">
                          {c.name}
                        </span>
                      </span>
                      <span className="mt-1.5 text-sm leading-relaxed text-[#5B6069]">
                        {guide.tagline}
                      </span>
                      <span className="mt-2.5 font-mono text-[11px] font-semibold uppercase tracking-[0.08em] text-[#14161A] underline decoration-[#14161A]/30 underline-offset-2">
                        Read the guide
                      </span>
                    </Link>
                  );
                })}
              </div>
            </section>
          );
        })}
      </div>
    </>
  );
}
