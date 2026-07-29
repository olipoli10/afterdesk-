import { requireRole } from "@/lib/authz";
import { getSettings } from "@/lib/settings";
import { TaskForm } from "@/components/task-form";
import { PageTitle } from "@/components/ui";

export default async function NewTaskPage() {
  await requireRole("CLIENT");
  const settings = await getSettings();

  return (
    <div className="mx-auto max-w-2xl">
      <PageTitle
        title="Submit a task"
        sub="Describe it in plain language. You'll get one fixed price to approve before anything starts."
      />
      <TaskForm
        maxFileSizeMB={settings.maxFileSizeMB}
        maxFiles={settings.maxFilesPerTask}
        allowedExtensions={settings.allowedExtensions}
      />
    </div>
  );
}
