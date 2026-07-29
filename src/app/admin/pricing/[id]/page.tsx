import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { requireRole } from "@/lib/authz";
import { prisma } from "@/lib/db";
import { taskForAdmin } from "@/lib/queries/tasks";
import { LocalTime } from "@/components/local-time";
import { PricingForm } from "@/components/pricing-form";
import { Card, CardBody, PageTitle, formatBytes } from "@/components/ui";

export default async function PricingDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requireRole("ADMIN");
  const { id } = await params;
  const task = await taskForAdmin(id);
  if (!task) notFound();
  if (!["submitted", "pricing_review"].includes(task.status)) {
    // Already priced (or moved on) — send the admin to the full task view.
    redirect(`/admin/tasks/${task.id}`);
  }

  const inputFiles = task.files.filter((f) => f.kind === "input");
  const categories = await prisma.taskCategory.findMany({
    where: { active: true },
    select: { id: true, name: true },
    orderBy: { sortOrder: "asc" },
  });

  return (
    <div className="mx-auto max-w-3xl">
      <PageTitle
        title={task.title}
        sub={`From ${task.client.name} (${task.client.email})`}
        action={
          <Link href="/admin/pricing" className="text-sm font-medium text-neutral-500 hover:text-neutral-900">
            ← Queue
          </Link>
        }
      />

      <div className="mb-4 grid gap-4 lg:grid-cols-[1fr_320px]">
        <Card>
          <CardBody>
            <h2 className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-neutral-400">
              Description
            </h2>
            <p className="whitespace-pre-wrap text-sm leading-relaxed text-neutral-800">
              {task.description}
            </p>
            {task.quantity ? (
              <p className="mt-3 border-t border-neutral-100 pt-3 text-sm text-neutral-600">
                <span className="text-xs text-neutral-400">Volume:</span> {task.quantity}
              </p>
            ) : null}
          </CardBody>
        </Card>

        <div className="space-y-4">
          <Card>
            <CardBody>
              <h2 className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-neutral-400">
                Deadlines
              </h2>
              {task.clientDeadlineUtc ? (
                <dl className="space-y-2 text-sm">
                  <div>
                    <dt className="text-xs text-neutral-400">Client receives by (your time)</dt>
                    <dd className="font-medium text-neutral-900">
                      <LocalTime iso={task.clientDeadlineUtc} />
                    </dd>
                  </div>
                  <div>
                    <dt className="text-xs text-neutral-400">Same moment in Manila</dt>
                    <dd className="text-neutral-700">
                      <LocalTime iso={task.clientDeadlineUtc} timeZone="Asia/Manila" />
                    </dd>
                  </div>
                  <p className="pt-1 text-xs text-neutral-400">
                    The VA deadline (client deadline − QC buffer) is computed automatically
                    at approval.
                  </p>
                </dl>
              ) : (
                <p className="text-sm text-neutral-500">No deadline set by the client.</p>
              )}
            </CardBody>
          </Card>

          <Card>
            <CardBody>
              <h2 className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-neutral-400">
                AI price suggestion
              </h2>
              {task.aiLowCents != null && task.aiHighCents != null ? (
                <p className="text-sm text-neutral-800">
                  ${(task.aiLowCents / 100).toFixed(0)} – ${(task.aiHighCents / 100).toFixed(0)}
                  {task.aiReasoning ? (
                    <span className="mt-1 block text-xs text-neutral-500">{task.aiReasoning}</span>
                  ) : null}
                </p>
              ) : (
                <p className="text-sm text-neutral-500">
                  Not available yet — AI-suggested ranges arrive at build step 4. Price
                  manually for now.
                </p>
              )}
            </CardBody>
          </Card>

          <Card>
            <CardBody>
              <h2 className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-neutral-400">
                Client files ({inputFiles.length})
              </h2>
              {inputFiles.length === 0 ? (
                <p className="text-sm text-neutral-500">No files attached.</p>
              ) : (
                <ul className="divide-y divide-neutral-100 text-sm">
                  {inputFiles.map((f) => (
                    <li key={f.id} className="flex items-center justify-between py-2">
                      <a
                        href={`/api/files/${f.id}/download`}
                        className="truncate font-medium text-indigo-600 hover:underline"
                      >
                        {f.fileName}
                      </a>
                      <span className="shrink-0 pl-2 text-xs text-neutral-400">
                        {formatBytes(f.sizeBytes)}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </CardBody>
          </Card>
        </div>
      </div>

      <PricingForm
        taskId={task.id}
        fileCount={inputFiles.length}
        categories={categories}
      />
    </div>
  );
}
