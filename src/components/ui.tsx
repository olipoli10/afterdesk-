import Link from "next/link";
import type { ReactNode } from "react";

/* ─────────────────────────────────────────────────────────────────────────
   "The Paper Ledger" — the logged-in apps are the documents the homepages
   promise: a paper desk (#F7F6F3), white printed sheets with hairline ink
   borders, Geist Mono for every structural string, statuses as stamps.
   Color is rationed by the palette law (see globals.css header).
   Motion: a tool moves like paper — 150ms color transitions, nothing else.
   ───────────────────────────────────────────────────────────────────────── */

/** A printed sheet on the desk. */
export function Card({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <div
      className={`rounded-lg border border-[#14161A]/10 bg-white shadow-[0_1px_2px_rgba(20,22,26,0.04)] ${className}`}
    >
      {children}
    </div>
  );
}

export function CardBody({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <div className={`p-4 sm:p-5 ${className}`}>{children}</div>;
}

export function PageTitle({
  title,
  sub,
  action,
}: {
  title: string;
  sub?: string;
  action?: ReactNode;
}) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="text-xl font-semibold tracking-[-0.02em] text-[#14161A]">{title}</h1>
        {sub ? <p className="mt-1 max-w-2xl text-sm leading-relaxed text-[#5B6069]">{sub}</p> : null}
      </div>
      {action}
    </div>
  );
}

/**
 * Small mono uppercase section label — like the row labels on the homepage
 * quote card. `as` lets list sections keep a real heading for screen readers.
 */
export function SectionLabel({
  children,
  className = "",
  as: Tag = "p",
}: {
  children: ReactNode;
  className?: string;
  as?: "p" | "h2" | "h3";
}) {
  return (
    <Tag
      className={`font-mono text-[11px] font-medium uppercase tracking-[0.14em] text-[#5B6069] ${className}`}
    >
      {children}
    </Tag>
  );
}

/** THE STAMP — status chips render through this; tone classes come from status.ts. */
export function Badge({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <span
      className={`inline-flex items-center gap-1 whitespace-nowrap rounded-[3px] border px-1.5 py-[3px] font-mono text-[11px] font-medium uppercase leading-none tracking-[0.08em] ${className}`}
    >
      {children}
    </span>
  );
}

/** An unprinted form: dashed rule, no sheet. */
export function EmptyState({
  title,
  body,
  action,
}: {
  title: string;
  body: string;
  action?: ReactNode;
}) {
  return (
    <div className="rounded-lg border border-dashed border-[#14161A]/20">
      <div className="flex flex-col items-start gap-2 px-6 py-12">
        <h2 className="text-sm font-medium text-[#14161A]">{title}</h2>
        <p className="max-w-xl text-sm leading-relaxed text-[#5B6069]">{body}</p>
        {action ? <div className="mt-3">{action}</div> : null}
      </div>
    </div>
  );
}

export function Field({
  label,
  hint,
  children,
  group = false,
}: {
  label: string;
  hint?: string;
  children: ReactNode;
  /** Use for composite controls such as the file picker; avoids nesting a button inside a label. */
  group?: boolean;
}) {
  const content = (
    <>
      <span className="mb-1.5 block font-mono text-[11px] font-medium uppercase tracking-[0.1em] text-[#5B6069]">
        {label}
      </span>
      {children}
      {hint ? (
        <span className="mt-1.5 block text-xs leading-relaxed text-[#5B6069]">{hint}</span>
      ) : null}
    </>
  );

  if (group) {
    return (
      <div role="group" aria-label={label} className="block">
        {content}
      </div>
    );
  }

  return (
    <label className="block">
      {content}
    </label>
  );
}

/* 16px on mobile kills iOS focus-zoom; sm: restores desktop density.
   Focus is ink, never blue. */
export const inputClass =
  "w-full rounded-md border border-[#14161A]/20 bg-white px-3 py-2 text-[16px] text-[#14161A] placeholder:text-[#5B6069] focus:border-[#14161A] focus:outline-none focus:ring-2 focus:ring-[#14161A]/30 sm:text-sm";

export const buttonPrimary =
  "inline-flex min-h-11 items-center justify-center gap-1.5 rounded-md bg-[#14161A] px-4 py-2 text-sm font-medium text-[#F7F6F3] transition-colors duration-150 hover:bg-black focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#14161A] focus-visible:ring-offset-2 focus-visible:ring-offset-[#F7F6F3] disabled:cursor-not-allowed disabled:opacity-40";

export const buttonSecondary =
  "inline-flex min-h-11 items-center justify-center gap-1.5 rounded-md border border-[#14161A]/20 bg-white px-4 py-2 text-sm font-medium text-[#14161A] transition-colors duration-150 hover:border-[#14161A]/40 hover:bg-[#F7F6F3] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#14161A] focus-visible:ring-offset-2 focus-visible:ring-offset-[#F7F6F3] disabled:cursor-not-allowed disabled:opacity-40";

/** For dark night surfaces (marketing blocks). */
export const buttonOnDark =
  "inline-flex min-h-11 items-center justify-center gap-1.5 rounded-md bg-[#F7F6F3] px-4 py-2 text-sm font-medium text-[#14161A] transition-colors duration-150 hover:bg-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-[#0A0B0D]";

export const buttonGhostOnDark =
  "inline-flex min-h-11 items-center justify-center gap-1.5 rounded-md border border-white/25 px-4 py-2 text-sm font-medium text-white transition-colors duration-150 hover:border-white/50 hover:bg-white/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-[#0A0B0D]";

/** Destructive actions only — never a status color. */
export const buttonDanger =
  "inline-flex min-h-11 items-center justify-center gap-1.5 rounded-md border border-[#A23B2E]/40 bg-white px-4 py-2 text-sm font-medium text-[#8C2F23] transition-colors duration-150 hover:bg-[#A23B2E]/[0.06] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#8C2F23] focus-visible:ring-offset-2 focus-visible:ring-offset-[#F7F6F3] disabled:cursor-not-allowed disabled:opacity-40";

/* Money treatments — two DISTINCT exports on purpose: the visual split
   mirrors the RULE 2 code-level separation. Never introduce a shared
   "price" component that could blur them. */
export const moneyClient = "font-mono tabular-nums text-[#14161A]";
export const moneyPayout = "font-mono tabular-nums text-[#166049]";

/** Inline text link — ink with a soft underline; replaces every stray blue anchor. */
export const linkInline =
  "font-medium text-[#14161A] underline decoration-[#14161A]/30 underline-offset-2 transition-colors duration-150 hover:decoration-[#14161A]";

export function LinkButton({
  href,
  children,
  variant = "primary",
}: {
  href: string;
  children: ReactNode;
  variant?: "primary" | "secondary";
}) {
  return (
    <Link href={href} className={variant === "primary" ? buttonPrimary : buttonSecondary}>
      {children}
    </Link>
  );
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}
