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
  kind = "input",
  maxFileSizeMB,
  maxFiles,
  allowedExtensions,
  files,
  onChange,
}: {
  /** "input" = client's source data, "deliverable" = the worker's finished work. */
  kind?: "input" | "deliverable";
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

    // Accumulate locally: `files` is the prop captured when the loop started,
    // so spreading it per-upload would make each success overwrite the last
    // (select 3 files, keep 1). Every onChange gets the running total.
    const accumulated = [...files];

    for (const file of list) {
      if (accumulated.length >= maxFiles) {
        setPending((p) => [
          ...p,
          { name: file.name, status: "error", error: `Limit is ${maxFiles} files` },
        ]);
        continue;
      }
      const ext = file.name.split(".").pop()?.toLowerCase() ?? "";
      if (!allowedExtensions.includes(ext)) {
        setPending((p) => [
          ...p,
          { name: file.name, status: "error", error: `.${ext || "?"} files aren't accepted` },
        ]);
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
      body.append("kind", kind);
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
          accumulated.push({ id: json.id, fileName: json.fileName, sizeBytes: json.sizeBytes });
          onChange([...accumulated]);
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
        accept={allowedExtensions.map((extension) => `.${extension}`).join(",")}
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
      <p className="mt-1 font-mono text-[11px] text-[#5B6069]">
        {allowedExtensions.map((e) => `.${e}`).join(", ")} — up to {maxFileSizeMB} MB each,{" "}
        {maxFiles} files max.
      </p>

      {files.length > 0 || pending.length > 0 ? (
        <ul
          aria-live="polite"
          className="mt-3 divide-y divide-[#14161A]/[0.06] rounded-md border border-[#14161A]/10 bg-white text-sm"
        >
          {files.map((f) => (
            <li key={f.id} className="flex items-center justify-between gap-3 px-3 py-2">
              <span className="truncate text-[#14161A]">{f.fileName}</span>
              <span className="flex shrink-0 items-center gap-2">
                <span className="font-mono text-xs tabular-nums text-[#5B6069]">
                  {formatBytes(f.sizeBytes)}
                </span>
                <button
                  type="button"
                  aria-label={`Remove ${f.fileName}`}
                  className="-my-1 min-h-11 min-w-11 rounded px-2 py-2 text-xs font-medium text-[#5B6069] transition-colors duration-150 hover:text-[#8C2F23] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#14161A]"
                  onClick={() => onChange(files.filter((x) => x.id !== f.id))}
                >
                  Remove
                </button>
              </span>
            </li>
          ))}
          {pending.map((p, i) => (
            <li key={`${p.name}-${i}`} className="flex items-center justify-between gap-3 px-3 py-2">
              <span className="truncate text-[#5B6069]">{p.name}</span>
              {p.status === "uploading" ? (
                <span className="font-mono text-xs text-[#5B6069]">Uploading…</span>
              ) : (
                <span className="flex items-center gap-1">
                  <span className="text-xs text-[#8C2F23]">{p.error}</span>
                  <button
                    type="button"
                    aria-label={`Dismiss error for ${p.name}`}
                    className="-my-1 min-h-11 min-w-11 rounded px-2 py-2 text-xs font-medium text-[#5B6069] transition-colors duration-150 hover:text-[#14161A] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#14161A]"
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
