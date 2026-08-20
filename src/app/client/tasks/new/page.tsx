import Link from "next/link";
import { headers } from "next/headers";
import { requireRole } from "@/lib/authz";
import { getSettings } from "@/lib/settings";
import { aiEnabled } from "@/lib/ai";
import { TaskChat } from "@/components/task-chat";
import { TaskForm } from "@/components/task-form";
import { A2PortalPresence } from "@/components/a2-portal-presence";
import {
  CLIENT_PORTAL_I18N,
  clientPortalLangOf,
} from "@/lib/i18n/client-portal";

export default async function NewTaskPage({
  searchParams,
}: {
  searchParams: Promise<{ mode?: string }>;
}) {
  await requireRole("CLIENT");
  const settings = await getSettings();
  const { mode } = await searchParams;
  const lang = clientPortalLangOf((await headers()).get("x-site-lang"));
  const copy = CLIENT_PORTAL_I18N[lang].intake;

  // The real intake chat remains the default only when the configured model
  // key exists. The form is a complete, honest fallback — never a fake A2.
  const useChat = aiEnabled && mode !== "form";

  if (useChat) {
    return (
      <div
        data-a2-blank-canvas=""
        className="mx-auto flex min-h-[calc(100dvh-12rem)] w-full max-w-3xl flex-col justify-center py-3 text-[#F7F6F3] sm:py-8"
      >
        <h1 className="sr-only">{copy.title}</h1>
        <TaskChat
          maxFileSizeMB={settings.maxFileSizeMB}
          maxFiles={settings.maxFilesPerTask}
          allowedExtensions={settings.allowedExtensions}
          copy={copy}
          language={lang}
        />
        <div className="mt-4 flex flex-col gap-2 px-1 text-[12px] leading-relaxed text-[#747C88] sm:flex-row sm:items-center sm:justify-between sm:gap-5">
          <p>
            {copy.disclosure}{" "}
            <Link href="/privacy" className="text-[#C9A76A] underline decoration-[#C9A76A]/40 underline-offset-2">
              {copy.privacy}
            </Link>
            .
          </p>
          <Link
            href="/client/tasks/new?mode=form"
            className="inline-flex min-h-11 shrink-0 items-center text-[13px] font-medium text-[#A1A8B3] underline decoration-white/20 underline-offset-4 transition-colors hover:text-[#E2C486] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#E2C486]"
          >
            {copy.switchToForm}
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-4xl text-[#F7F6F3]">
      <header className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="font-mono text-[12px] uppercase tracking-[0.16em] text-[#C9A76A]">
            {copy.kicker}
          </p>
          <h1 className="mt-2 text-[clamp(1.7rem,4vw,2.55rem)] font-semibold leading-[1.05] tracking-[-0.04em]">
            {copy.title}
          </h1>
        </div>
        {aiEnabled ? (
          <Link
            href="/client/tasks/new"
            className="inline-flex min-h-11 items-center rounded-md border border-white/15 px-3 text-[13px] font-medium text-[#B7BDC7] transition-colors hover:border-[#C9A76A]/60 hover:text-[#E2C486] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#E2C486]"
          >
            {copy.switchToChat}
          </Link>
        ) : null}
      </header>
      <div className="grid gap-4 lg:grid-cols-[220px_minmax(0,1fr)]">
        <aside className="rounded-[12px] border border-[#4A3A26] bg-[#111317] p-4">
          <A2PortalPresence label={copy.a2Label} />
          <p className="mt-4 font-mono text-[12px] uppercase tracking-[0.12em] text-[#D87526]">
            {copy.a2Status}
          </p>
          <p className="mt-2 text-[13px] leading-relaxed text-[#A1A8B3]">
            {copy.approvalNote}
          </p>
        </aside>
        <TaskForm
          maxFileSizeMB={settings.maxFileSizeMB}
          maxFiles={settings.maxFilesPerTask}
          allowedExtensions={settings.allowedExtensions}
        />
      </div>
    </div>
  );
}
