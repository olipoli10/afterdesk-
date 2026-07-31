import Link from "next/link";
import type { ReactNode } from "react";

/* ─────────────────────────────────────────────────────────────────────────
   "The Paper Ledger" — the logged-in apps are the documents the homepages
   promise: a paper desk (#F7F6F3), white printed sheets with hairline ink
   borders, Geist Mono for every structural string, statuses as stamps.
   Color is rationed by the palette law (see globals.css header).
   Motion: a tool moves like paper — 150ms color transitions, nothing else.
   ───────────────────────────────────────────────────────────────────────── */

/** A printed sheet on the desk — or, tone="night", a frosted glass bubble
 *  floating over the worker portal's dark grid (src/app/va, AppShell
 *  tone="night" — see the fixed night-grid + glow it renders behind every
 *  card). Same recipe as the login modal's dialog (src/components/
 *  login-modal.tsx): a translucent tint, backdrop-blur, and a single inset
 *  highlight standing in for a top-lit edge — reused rather than a flatter
 *  opaque #111317, so cards read as floating glass, not paint. */
export function Card({
  children,
  className = "",
  tone = "paper",
}: {
  children: ReactNode;
  className?: string;
  tone?: "paper" | "night";
}) {
  const surface =
    tone === "night"
      ? "border-white/[0.14] bg-white/[0.05] shadow-[inset_0_1px_0_rgba(255,255,255,0.1),0_16px_40px_-24px_rgba(0,0,0,0.6)] backdrop-blur-xl"
      : "border-[#14161A]/10 bg-white shadow-[0_1px_2px_rgba(20,22,26,0.04)]";
  return <div className={`rounded-lg border ${surface} ${className}`}>{children}</div>;
}

export function CardBody({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <div className={`p-4 sm:p-5 ${className}`}>{children}</div>;
}

export function PageTitle({
  title,
  sub,
  action,
  tone = "paper",
}: {
  title: string;
  sub?: string;
  action?: ReactNode;
  tone?: "paper" | "night";
}) {
  const ink = tone === "night" ? "text-[#F7F6F3]" : "text-[#14161A]";
  const muted = tone === "night" ? "text-[#8A9099]" : "text-[#5B6069]";
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className={`text-xl font-semibold tracking-[-0.02em] ${ink}`}>{title}</h1>
        {sub ? <p className={`mt-1 max-w-2xl text-sm leading-relaxed ${muted}`}>{sub}</p> : null}
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
  tone = "paper",
}: {
  children: ReactNode;
  className?: string;
  as?: "p" | "h2" | "h3";
  tone?: "paper" | "night";
}) {
  const muted = tone === "night" ? "text-[#8A9099]" : "text-[#5B6069]";
  return (
    <Tag className={`font-mono text-[11px] font-medium uppercase tracking-[0.14em] ${muted} ${className}`}>
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
  tone = "paper",
}: {
  title: string;
  body: string;
  action?: ReactNode;
  tone?: "paper" | "night";
}) {
  const border = tone === "night" ? "border-white/15" : "border-[#14161A]/20";
  const ink = tone === "night" ? "text-[#F7F6F3]" : "text-[#14161A]";
  const muted = tone === "night" ? "text-[#8A9099]" : "text-[#5B6069]";
  return (
    <div className={`rounded-lg border border-dashed ${border}`}>
      <div className="flex flex-col items-start gap-2 px-6 py-12">
        <h2 className={`text-sm font-medium ${ink}`}>{title}</h2>
        <p className={`max-w-xl text-sm leading-relaxed ${muted}`}>{body}</p>
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
  tone = "paper",
}: {
  label: string;
  hint?: string;
  children: ReactNode;
  /** Use for composite controls such as the file picker; avoids nesting a button inside a label. */
  group?: boolean;
  /** "glass" is the login modal's frosted treatment; "night" is the worker
   *  portal's solid dark surface. Both put light text on a dark ground, so
   *  they share the same label/hint colors here — only the input's own
   *  background (inputClass vs inputClassNight) differs between them. */
  tone?: "paper" | "glass" | "night";
}) {
  const muted = tone === "paper" ? "text-[#5B6069]" : "text-white/55";
  const content = (
    <>
      <span className={`mb-1.5 block font-mono text-[11px] font-medium uppercase tracking-[0.1em] ${muted}`}>
        {label}
      </span>
      {children}
      {hint ? <span className={`mt-1.5 block text-xs leading-relaxed ${muted}`}>{hint}</span> : null}
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
   Focus is ink, never blue.

   The field is a RECESSED pale grey at rest and turns white on focus. It
   used to be white at rest, which on a white card meant the only thing
   saying "you can type here" was a 20%-alpha hairline — the fields read as
   empty space with a line under them. Grey-at-rest / white-on-focus also
   gives focus a second signal beyond the ring, which matters most on the
   long client forms where several fields sit in a column. */
export const inputClass =
  "w-full rounded-md border border-[#14161A]/20 bg-[#F1EFEB] px-3 py-2 text-[16px] text-[#14161A] placeholder:text-[#5B6069] focus:border-[#14161A] focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#14161A]/30 sm:text-sm";

/** Worker-portal dark equivalent — same recessed-at-rest / lighter-on-focus
 *  logic as inputClass, inverted for a dark ground. */
export const inputClassNight =
  "w-full rounded-md border border-white/15 bg-white/[0.06] px-3 py-2 text-[16px] text-[#F7F6F3] placeholder:text-white/40 focus:border-white/40 focus:bg-white/10 focus:outline-none focus:ring-2 focus:ring-white/25 sm:text-sm";

export const buttonPrimary =
  "inline-flex min-h-11 items-center justify-center gap-1.5 rounded-md bg-[#14161A] px-4 py-2 text-sm font-medium text-[#F7F6F3] transition-colors duration-150 hover:bg-black focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#14161A] focus-visible:ring-offset-2 focus-visible:ring-offset-[#F7F6F3] disabled:cursor-not-allowed disabled:opacity-40";

export const buttonSecondary =
  "inline-flex min-h-11 items-center justify-center gap-1.5 rounded-md border border-[#14161A]/20 bg-white px-4 py-2 text-sm font-medium text-[#14161A] transition-colors duration-150 hover:border-[#14161A]/40 hover:bg-[#F7F6F3] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#14161A] focus-visible:ring-offset-2 focus-visible:ring-offset-[#F7F6F3] disabled:cursor-not-allowed disabled:opacity-40";

/** The worker portal's primary/secondary buttons — same shapes as
 *  buttonPrimary/buttonSecondary, inverted for the dark surface. Primary is
 *  a solid paper chip (matches buttonOnDark below, the marketing blocks'
 *  own dark-surface CTA); secondary is a hairline outline on transparent,
 *  the dark equivalent of a white card with an ink border. */
export const buttonPrimaryNight =
  "inline-flex min-h-11 items-center justify-center gap-1.5 rounded-md bg-[#F7F6F3] px-4 py-2 text-sm font-medium text-[#14161A] transition-colors duration-150 hover:bg-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-[#0A0B0D] disabled:cursor-not-allowed disabled:opacity-40";

export const buttonSecondaryNight =
  "inline-flex min-h-11 items-center justify-center gap-1.5 rounded-md border border-white/20 bg-transparent px-4 py-2 text-sm font-medium text-[#F7F6F3] transition-colors duration-150 hover:border-white/40 hover:bg-white/[0.04] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-[#0A0B0D] disabled:cursor-not-allowed disabled:opacity-40";

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
/** #166049 is a DARK green, tuned for AA contrast on white — it nearly
 *  disappears on the portal's #0A0B0D. #3DDCA0 is the brighter green
 *  already used for money/approval on dark surfaces elsewhere (the login
 *  modal's "Application received" banner, LiveTaskWindow's delivered stamp
 *  family) — reused here rather than picked fresh. */
export const moneyPayoutNight = "font-mono tabular-nums text-[#3DDCA0]";

/** Inline text link — ink with a soft underline; replaces every stray blue anchor. */
export const linkInline =
  "font-medium text-[#14161A] underline decoration-[#14161A]/30 underline-offset-2 transition-colors duration-150 hover:decoration-[#14161A]";

export function LinkButton({
  href,
  children,
  variant = "primary",
  tone = "paper",
}: {
  href: string;
  children: ReactNode;
  variant?: "primary" | "secondary";
  tone?: "paper" | "night";
}) {
  const cls =
    tone === "night"
      ? variant === "primary"
        ? buttonPrimaryNight
        : buttonSecondaryNight
      : variant === "primary"
        ? buttonPrimary
        : buttonSecondary;
  return (
    <Link href={href} className={cls}>
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
