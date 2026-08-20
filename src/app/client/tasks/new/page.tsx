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

  return (
    <div className="mx-auto max-w-4xl text-[#F7F6F3]">
      <header className="mb-5">
        <p className="font-mono text-[12px] uppercase tracking-[0.16em] text-[#C9A76A]">
          {copy.kicker}
        </p>
        <div className="mt-2 flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="text-[clamp(1.7rem,4vw,2.55rem)] font-semibold leading-[1.05] tracking-[-0.04em]">
              {copy.title}
            </h1>
            <p className="mt-3 max-w-2xl text-[15px] leading-relaxed text-[#A1A8B3]">
              {copy.sub}
            </p>
          </div>
          {aiEnabled ? (
            <Link
              href={useChat ? "/client/tasks/new?mode=form" : "/client/tasks/new"}
              className="inline-flex min-h-11 items-center rounded-md border border-white/15 px-3 text-[13px] font-medium text-[#B7BDC7] transition-colors hover:border-[#C9A76A]/60 hover:text-[#E2C486] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#E2C486]"
            >
              {useChat ? copy.switchToForm : copy.switchToChat}
            </Link>
          ) : null}
        </div>
      </header>

      <ol aria-label="Request process" className="mb-5 grid grid-cols-2 overflow-hidden rounded-[9px] border border-white/10 bg-white/[0.035] sm:grid-cols-4">
        {copy.stages.map((stage, index) => (
          <li key={stage} className="flex min-h-14 items-center gap-2 border-white/10 px-3 py-2.5 even:border-l sm:border-l sm:first:border-l-0">
            <span className={`grid h-6 w-6 shrink-0 place-items-center rounded-full border font-mono text-[12px] ${index === 0 ? "border-[#C9A76A] bg-[#C9A76A] text-[#14161A]" : "border-white/20 text-[#8F97A3]"}`}>
              {index + 1}
            </span>
            <span className={`text-[12px] leading-tight ${index === 0 ? "text-[#F7F6F3]" : "text-[#8F97A3]"}`}>{stage}</span>
          </li>
        ))}
      </ol>

      {useChat ? (
        <p className="mb-5 text-[12px] leading-[1.6] text-[#8F97A3]">
          {copy.disclosure}{" "}
          <Link href="/privacy" className="text-[#C9A76A] underline decoration-[#C9A76A]/40 underline-offset-2">
            {copy.privacy}
          </Link>
          .
        </p>
      ) : null}

      {useChat ? (
        <TaskChat
          maxFileSizeMB={settings.maxFileSizeMB}
          maxFiles={settings.maxFilesPerTask}
          allowedExtensions={settings.allowedExtensions}
          copy={copy}
        />
      ) : (
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
      )}
    </div>
  );
}
