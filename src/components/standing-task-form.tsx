"use client";

import { useState, useTransition } from "react";
import { submitStandingTask } from "@/server/actions/standing-capacity";
import { FileUpload, type UploadedFile } from "@/components/file-upload";
import { Card, CardBody, Field, inputClass, buttonPrimary } from "@/components/ui";

export function StandingTaskForm({
  remainingMinutes,
  maxFileSizeMB,
  maxFiles,
  allowedExtensions,
}: {
  remainingMinutes: number;
  maxFileSizeMB: number;
  maxFiles: number;
  allowedExtensions: string[];
}) {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [minutes, setMinutes] = useState(30);
  const [files, setFiles] = useState<UploadedFile[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [overflow, setOverflow] = useState<{ remainingMinutes: number } | null>(null);
  const [done, setDone] = useState(false);
  const [isPending, startTransition] = useTransition();

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setOverflow(null);
    startTransition(async () => {
      const result = await submitStandingTask({
        title,
        description,
        estimatedMinutes: minutes,
        fileIds: files.map((f) => f.id),
      });
      if (!result.ok) {
        setError(result.error);
        if (result.overflow) setOverflow(result.overflow);
        return;
      }
      setTitle("");
      setDescription("");
      setMinutes(30);
      setFiles([]);
      setDone(true);
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
              value={title}
              onChange={(e) => setTitle(e.target.value)}
            />
          </Field>

          <Field label="Describe the task" hint="Plain language — what needs to be done, what the output should look like.">
            <textarea
              required
              minLength={10}
              rows={6}
              className={inputClass}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </Field>

          <Field
            label="Estimated time"
            hint={`${remainingMinutes} minute${remainingMinutes === 1 ? "" : "s"} left in this week's block.`}
          >
            <input
              type="number"
              required
              min={5}
              max={24 * 60}
              step={5}
              className={inputClass}
              value={minutes}
              onChange={(e) => setMinutes(Number(e.target.value))}
            />
          </Field>

          <Field label="Files (optional)">
            <FileUpload
              kind="input"
              maxFileSizeMB={maxFileSizeMB}
              maxFiles={maxFiles}
              allowedExtensions={allowedExtensions}
              files={files}
              onChange={setFiles}
            />
          </Field>

          {overflow ? (
            <div className="rounded-[4px] border border-dashed border-[#14161A]/15 px-4 py-3 text-sm text-[#5B6069]">
              <p className="font-medium text-[#14161A]">
                This would go over your remaining {overflow.remainingMinutes} minute
                {overflow.remainingMinutes === 1 ? "" : "s"} for the week.
              </p>
              <p className="mt-1.5">
                Wait for next week&apos;s block, submit this as a one-off task at the normal fixed
                price instead, or ask an operator about moving up a capacity tier.
              </p>
            </div>
          ) : null}

          {error && !overflow ? (
            <p role="alert" className="text-sm text-[#8C2F23]">
              {error}
            </p>
          ) : null}
          {done ? (
            <p role="status" className="text-sm text-[#166049]">
              Task submitted.
            </p>
          ) : null}

          <button type="submit" disabled={isPending} className={buttonPrimary}>
            {isPending ? "Submitting…" : "Submit to this week's block"}
          </button>
        </form>
      </CardBody>
    </Card>
  );
}
