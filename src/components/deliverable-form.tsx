"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { submitDeliverable } from "@/server/actions/va-tasks";
import { FileUpload, type UploadedFile } from "@/components/file-upload";
import {
  METRIC_ENUM_LABELS,
  METRIC_FIELDS,
  METRIC_LABELS,
  isMetricsCategory,
  metricsSchemaFor,
} from "@/lib/delivery-metrics";
import { Card, CardBody, Field, SectionLabel, inputClassNight, buttonPrimaryNight } from "@/components/ui";

export function DeliverableForm({
  taskId,
  categorySlug,
  maxFileSizeMB,
  maxFiles,
  allowedExtensions,
  isResubmission,
}: {
  taskId: string;
  categorySlug: string | null;
  maxFileSizeMB: number;
  maxFiles: number;
  allowedExtensions: string[];
  isResubmission: boolean;
}) {
  const router = useRouter();
  const [files, setFiles] = useState<UploadedFile[]>([]);
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, start] = useTransition();

  // Only two categories have a shape; everywhere else this whole block is
  // absent and the form is byte-identical to what it was before.
  const slug = isMetricsCategory(categorySlug) ? categorySlug : null;
  const fields = slug ? METRIC_FIELDS[slug] : null;
  const [values, setValues] = useState<Record<string, string>>({});
  const allFilled = !fields || fields.every((f) => (values[f.key] ?? "") !== "");

  /**
   * Validated here with the SAME schema the server uses, so the two can never
   * disagree about what a valid delivery looks like. The server still parses
   * independently: this is a courtesy to the worker, not a security boundary.
   */
  function checkedMetrics(): { ok: true; value: unknown } | { ok: false; error: string } {
    if (!slug || !fields) return { ok: true, value: undefined };
    if (!allFilled) return { ok: false, error: "Fill in every number before sending." };
    const schema = metricsSchemaFor(slug);
    if (!schema) return { ok: true, value: undefined };

    const payload: Record<string, unknown> = { v: 1, category: slug };
    for (const f of fields) {
      const raw = values[f.key] ?? "";
      payload[f.key] = f.kind === "number" ? Number(raw) : raw;
    }
    const parsed = schema.safeParse(payload);
    if (!parsed.success) {
      return {
        ok: false,
        error: parsed.error.issues[0]?.message ?? "Check the delivery numbers.",
      };
    }
    return { ok: true, value: parsed.data };
  }

  return (
    <Card tone="night">
      <CardBody>
        <SectionLabel tone="night">{isResubmission ? "Send the corrected work" : "Deliver the work"}</SectionLabel>
        <div className="mt-4 space-y-4">
          {/* Above Files on purpose: the counts get filled while the work is
              still fresh, not after the upload spinner has finished. */}
          {slug && fields ? (
            <div className="w-full rounded-lg border border-white/10 bg-[#111317] p-4">
              <p className="font-mono text-[11px] font-medium uppercase tracking-[0.1em] text-white/55">
                What you covered
              </p>
              <p className="mt-1.5 text-xs leading-relaxed text-white/55">
                These numbers are shown to the client after the operator approves your
                delivery. Marking something unavailable is a correct answer, not a miss.
              </p>
              <div className="mt-4 grid gap-4 sm:grid-cols-2">
                {fields.map((f) => (
                  <Field key={f.key} label={METRIC_LABELS[slug][f.key]} tone="night">
                    {f.kind === "number" ? (
                      <input
                        type="number"
                        inputMode="numeric"
                        min={f.min}
                        max={1000000}
                        step={1}
                        className={inputClassNight}
                        value={values[f.key] ?? ""}
                        onChange={(e) =>
                          setValues((v) => ({ ...v, [f.key]: e.target.value }))
                        }
                      />
                    ) : (
                      <select
                        className={inputClassNight}
                        value={values[f.key] ?? ""}
                        onChange={(e) =>
                          setValues((v) => ({ ...v, [f.key]: e.target.value }))
                        }
                      >
                        <option value="">Choose one</option>
                        {f.options.map((o) => (
                          <option key={o} value={o}>
                            {METRIC_ENUM_LABELS[slug][f.key]?.[o] ?? o}
                          </option>
                        ))}
                      </select>
                    )}
                  </Field>
                ))}
              </div>
            </div>
          ) : null}

          <Field
            label="Files"
            hint="The finished work. Several files are fine — they are reviewed together as one delivery."
            group
            tone="night"
          >
            <FileUpload
              kind="deliverable"
              maxFileSizeMB={maxFileSizeMB}
              maxFiles={maxFiles}
              allowedExtensions={allowedExtensions}
              files={files}
              onChange={setFiles}
            />
          </Field>

          <Field
            label="Note (optional)"
            hint="Anything the operator should know — assumptions you made, rows you could not resolve. This is not shown to the client."
            tone="night"
          >
            <textarea
              rows={4}
              className={inputClassNight}
              value={note}
              onChange={(e) => setNote(e.target.value)}
            />
          </Field>

          {error ? (
            <p role="alert" className="text-sm text-[#FF9A8B]">
              {error}
            </p>
          ) : null}

          <div className="flex flex-wrap items-center gap-3">
            <button
              className={buttonPrimaryNight}
              /* Deliberately NOT disabled on an incomplete metrics block. A
                 dead button with six possible causes tells the worker
                 nothing; clicking it names the missing piece instead. */
              disabled={isPending}
              onClick={() =>
                start(async () => {
                  setError(null);
                  const metrics = checkedMetrics();
                  if (!metrics.ok) {
                    setError(metrics.error);
                    return;
                  }
                  const result = await submitDeliverable({
                    taskId,
                    note: note || undefined,
                    fileIds: files.map((f) => f.id),
                    metrics: metrics.value,
                  });
                  if (!result.ok) {
                    setError(result.error);
                    return;
                  }
                  router.push("/va");
                  router.refresh();
                })
              }
            >
              {isPending ? "Sending…" : "Send for review"}
            </button>
            <span className="text-xs leading-relaxed text-[#8A9099]">
              The operator reviews every delivery before it reaches the client.
            </span>
          </div>
        </div>
      </CardBody>
    </Card>
  );
}
