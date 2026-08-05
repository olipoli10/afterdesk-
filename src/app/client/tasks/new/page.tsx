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

  // The intake chat is the default way in; the plain form stays available and
  // is the automatic fallback when no AI key is configured. Client canon: the
  // chat speaks as "we" and is never called an assistant.
  const useChat = aiEnabled && mode !== "form";

  return (
    <div className="mx-auto max-w-2xl">
      <PageTitle
        title={useChat ? "What result do you need delivered?" : "Describe the deliverable"}
        sub={
          useChat
            ? "Describe the result in your own words. We'll structure it into a brief for you to review, then confirm fit, timing and one fixed price before anything starts."
            : "Define the output, rules, source material and what a correct result looks like. You'll receive one fixed price to approve before anything starts."
        }
        action={
          aiEnabled ? (
            <Link
              href={useChat ? "/client/tasks/new?mode=form" : "/client/tasks/new"}
              className="text-[13px] font-medium text-[#5B6069] transition-colors duration-150 hover:text-[#14161A]"
            >
              {useChat ? "Write it out myself" : "Talk it through instead"}
            </Link>
          ) : null
        }
      />

      {useChat ? (
        <p className="-mt-2 mb-5 text-[12px] leading-[1.55] text-[#5B6069]">
          AI helps structure this intake conversation; it does not complete your task. Review the
          brief before submitting and do not include unnecessary sensitive information. See our{" "}
          <Link href="/privacy" className="underline decoration-[#5B6069]/40 underline-offset-2">
            privacy policy
          </Link>
          .
        </p>
      ) : null}

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
