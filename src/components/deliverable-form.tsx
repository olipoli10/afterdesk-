"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { submitDeliverable } from "@/server/actions/va-tasks";
import { FileUpload, type UploadedFile } from "@/components/file-upload";
import { Card, CardBody, Field, SectionLabel, inputClass, buttonPrimary } from "@/components/ui";

export function DeliverableForm({
  taskId,
  maxFileSizeMB,
  maxFiles,
  allowedExtensions,
  isResubmission,
}: {
  taskId: string;
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

  return (
    <Card>
      <CardBody>
        <SectionLabel>{isResubmission ? "Send the corrected work" : "Deliver the work"}</SectionLabel>
        <div className="mt-4 space-y-4">
          <Field
            label="Files"
            hint="The finished work. Several files are fine — they are reviewed together as one delivery."
            group
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
          >
            <textarea
              rows={4}
              className={inputClass}
              value={note}
              onChange={(e) => setNote(e.target.value)}
            />
          </Field>

          {error ? (
            <p role="alert" className="text-sm text-[#8C2F23]">
              {error}
            </p>
          ) : null}

          <div className="flex flex-wrap items-center gap-3">
            <button
              className={buttonPrimary}
              disabled={isPending}
              onClick={() =>
                start(async () => {
                  setError(null);
                  const result = await submitDeliverable({
                    taskId,
                    note: note || undefined,
                    fileIds: files.map((f) => f.id),
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
            <span className="text-xs leading-relaxed text-[#5B6069]">
              The operator reviews every delivery before it reaches the client.
            </span>
          </div>
        </div>
      </CardBody>
    </Card>
  );
}
