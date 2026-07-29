import Link from "next/link";
import { requireRole } from "@/lib/authz";
import { getSettings } from "@/lib/settings";
import { aiEnabled } from "@/lib/ai";
import { TaskChat } from "@/components/task-chat";
import { TaskForm } from "@/components/task-form";
import { PageTitle } from "@/components/ui";

export default async function NewTaskPage({
  searchParams,
}: {
  searchParams: Promise<{ mode?: string }>;
}) {
  await requireRole("CLIENT");
  const settings = await getSettings();
  const { mode } = await searchParams;

  // The assistant is the default way in; the plain form stays available and is
  // the automatic fallback when no AI key is configured.
  const useChat = aiEnabled && mode !== "form";

  return (
    <div className="mx-auto max-w-2xl">
      <PageTitle
        title={useChat ? "What do you need done?" : "Describe your task"}
        sub={
          useChat
            ? "Say it however it comes out. The assistant will shape it into a brief, then you approve one fixed price before anything starts."
            : "Plain language. You'll get one fixed price to approve before anything starts."
        }
        action={
          aiEnabled ? (
            <Link
              href={useChat ? "/client/tasks/new?mode=form" : "/client/tasks/new"}
              className="text-[13px] font-medium text-neutral-500 transition-colors hover:text-neutral-900"
            >
              {useChat ? "Write it out myself" : "Use the assistant"}
            </Link>
          ) : null
        }
      />

      {useChat ? (
        <TaskChat
          maxFileSizeMB={settings.maxFileSizeMB}
          maxFiles={settings.maxFilesPerTask}
          allowedExtensions={settings.allowedExtensions}
        />
      ) : (
        <TaskForm
          maxFileSizeMB={settings.maxFileSizeMB}
          maxFiles={settings.maxFilesPerTask}
          allowedExtensions={settings.allowedExtensions}
        />
      )}
    </div>
  );
}
