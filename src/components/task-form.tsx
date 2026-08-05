"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { submitTask } from "@/server/actions/client-tasks";
import { FileUpload, type UploadedFile } from "@/components/file-upload";
import { Card, CardBody, Field, inputClass, buttonPrimary } from "@/components/ui";

export function TaskForm({
  maxFileSizeMB,
  maxFiles,
  allowedExtensions,
}: {
  maxFileSizeMB: number;
  maxFiles: number;
  allowedExtensions: string[];
}) {
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [quantity, setQuantity] = useState("");
  const [deadlineLocal, setDeadlineLocal] = useState("");
  const [files, setFiles] = useState<UploadedFile[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    startTransition(async () => {
      const result = await submitTask({
        title,
        description,
        quantity: quantity || undefined,
        deadlineLocal: deadlineLocal || undefined,
        timezone,
        fileIds: files.map((f) => f.id),
      });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      router.push(`/client/tasks/${result.taskId}`);
    });
  }

  return (
    <Card>
      <CardBody>
        <form onSubmit={onSubmit} className="space-y-5">
          <Field label="Deliverable title" hint="A short handle for the result you want returned.">
            <input
              required
              minLength={3}
              maxLength={140}
              className={inputClass}
              placeholder="e.g. Clean and deduplicate our CRM export"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
            />
          </Field>

          <Field
            label="Deliverable, rules and definition of done"
            hint="State the required output, source material, rules, fields or formatting, checks that matter, and how uncertain cases should be handled."
          >
            <textarea
              required
              minLength={10}
              rows={7}
              className={inputClass}
              placeholder="e.g. Return a clean XLSX in the same column order. Merge contacts on email, normalize names, retain source links for enriched fields, and place uncertain or missing records in an exception tab."
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </Field>

          <div className="grid gap-5 sm:grid-cols-2">
            <Field label="Quantity / volume (optional)">
              <input
                className={inputClass}
                placeholder="e.g. ~4,000 rows"
                value={quantity}
                onChange={(e) => setQuantity(e.target.value)}
              />
            </Field>
            <Field
              label="Deadline (optional)"
              hint={`Your local time (${timezone}). This is when you receive the finished, reviewed work.`}
            >
              <input
                type="datetime-local"
                className={inputClass}
                value={deadlineLocal}
                onChange={(e) => setDeadlineLocal(e.target.value)}
              />
            </Field>
          </div>

          <Field
            label="Source files (optional)"
            hint="The material the work operates on: an export, list, spreadsheet or document set."
            group
          >
            <FileUpload
              maxFileSizeMB={maxFileSizeMB}
              maxFiles={maxFiles}
              allowedExtensions={allowedExtensions}
              files={files}
              onChange={setFiles}
            />
          </Field>

          {error ? (
            <p role="alert" className="text-sm text-[#8C2F23]">
              {error}
            </p>
          ) : null}

          <div className="flex items-center gap-3">
            <button type="submit" disabled={isPending} className={buttonPrimary}>
              {isPending ? "Submitting…" : "Submit task"}
            </button>
            <span className="text-xs text-[#5B6069]">
              You&apos;ll receive one fixed price to approve. Nothing starts before you do.
            </span>
          </div>
        </form>
      </CardBody>
    </Card>
  );
}
