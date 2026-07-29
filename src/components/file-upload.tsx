"use client";

import { useRef, useState } from "react";
import { formatBytes, buttonSecondary } from "@/components/ui";

export type UploadedFile = { id: string; fileName: string; sizeBytes: number };

type PendingUpload = { name: string; status: "uploading" | "error"; error?: string };

/**
 * Upload-first pattern: each file goes to /api/upload immediately; the task
 * submit action claims the returned file ids.
 */
export function FileUpload({
  maxFileSizeMB,
  maxFiles,
  allowedExtensions,
  files,
  onChange,
}: {
  maxFileSizeMB: number;
  maxFiles: number;
  allowedExtensions: string[];
  files: UploadedFile[];
  onChange: (files: UploadedFile[]) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [pending, setPending] = useState<PendingUpload[]>([]);

  async function handleFiles(selected: FileList | null) {
    if (!selected) return;
    const list = Array.from(selected);
    if (inputRef.current) inputRef.current.value = "";

    for (const file of list) {
      if (files.length + list.indexOf(file) >= maxFiles) break;
      const ext = file.name.split(".").pop()?.toLowerCase() ?? "";
      if (!allowedExtensions.includes(ext)) {
        setPending((p) => [...p, { name: file.name, status: "error", error: "Unsupported type" }]);
        continue;
      }
      if (file.size > maxFileSizeMB * 1024 * 1024) {
        setPending((p) => [
          ...p,
          { name: file.name, status: "error", error: `Over ${maxFileSizeMB} MB` },
        ]);
        continue;
      }

      setPending((p) => [...p, { name: file.name, status: "uploading" }]);
      const body = new FormData();
      body.append("file", file);
      try {
        const res = await fetch("/api/upload", { method: "POST", body });
        const json = await res.json();
        setPending((p) => p.filter((x) => x.name !== file.name || x.status !== "uploading"));
        if (!res.ok) {
          setPending((p) => [
            ...p,
            { name: file.name, status: "error", error: json.error ?? "Upload failed" },
          ]);
        } else {
          onChange([
            ...files,
            { id: json.id, fileName: json.fileName, sizeBytes: json.sizeBytes },
          ]);
        }
      } catch {
        setPending((p) =>
          p.map((x) =>
            x.name === file.name && x.status === "uploading"
              ? { ...x, status: "error" as const, error: "Network error" }
              : x
          )
        );
      }
    }
  }

  return (
    <div>
      <input
        ref={inputRef}
        type="file"
        multiple
        className="hidden"
        onChange={(e) => handleFiles(e.target.files)}
      />
      <button
        type="button"
        className={buttonSecondary}
        onClick={() => inputRef.current?.click()}
      >
        Attach files
      </button>
      <p className="mt-1 text-xs text-neutral-400">
        {allowedExtensions.map((e) => `.${e}`).join(", ")} — up to {maxFileSizeMB} MB each,{" "}
        {maxFiles} files max.
      </p>

      {files.length > 0 || pending.length > 0 ? (
        <ul className="mt-3 divide-y divide-neutral-100 rounded-md border border-neutral-200 bg-white text-sm">
          {files.map((f) => (
            <li key={f.id} className="flex items-center justify-between gap-3 px-3 py-2">
              <span className="truncate text-neutral-800">{f.fileName}</span>
              <span className="flex shrink-0 items-center gap-3">
                <span className="text-xs text-neutral-400">{formatBytes(f.sizeBytes)}</span>
                <button
                  type="button"
                  className="text-xs font-medium text-neutral-400 hover:text-red-600"
                  onClick={() => onChange(files.filter((x) => x.id !== f.id))}
                >
                  Remove
                </button>
              </span>
            </li>
          ))}
          {pending.map((p, i) => (
            <li key={`${p.name}-${i}`} className="flex items-center justify-between gap-3 px-3 py-2">
              <span className="truncate text-neutral-500">{p.name}</span>
              {p.status === "uploading" ? (
                <span className="text-xs text-neutral-400">Uploading…</span>
              ) : (
                <span className="flex items-center gap-2">
                  <span className="text-xs text-red-600">{p.error}</span>
                  <button
                    type="button"
                    className="text-xs font-medium text-neutral-400 hover:text-neutral-700"
                    onClick={() => setPending((x) => x.filter((_, j) => j !== i))}
                  >
                    Dismiss
                  </button>
                </span>
              )}
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
