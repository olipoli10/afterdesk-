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
          <Field label="Title" hint="A short handle for the task.">
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
            label="Describe the task"
            hint="Plain language. What needs to be done, what the output should look like, anything the worker must know."
          >
            <textarea
              required
              minLength={10}
              rows={7}
              className={inputClass}
              placeholder="e.g. The attached export has ~4,000 contacts. Merge duplicates, fix casing on names, flag rows with missing emails, and return a clean XLSX in the same column order."
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
            label="Input files (optional)"
            hint="The data the task operates on — an export, a list, a spreadsheet."
          >
            <FileUpload
              maxFileSizeMB={maxFileSizeMB}
              maxFiles={maxFiles}
              allowedExtensions={allowedExtensions}
              files={files}
              onChange={setFiles}
            />
          </Field>

          {error ? <p className="text-sm text-red-600">{error}</p> : null}

          <div className="flex items-center gap-3">
            <button type="submit" disabled={isPending} className={buttonPrimary}>
              {isPending ? "Submitting…" : "Submit task"}
            </button>
            <span className="text-xs text-neutral-400">
              You&apos;ll receive one fixed price to approve — nothing starts before you do.
            </span>
          </div>
        </form>
      </CardBody>
    </Card>
  );
}
