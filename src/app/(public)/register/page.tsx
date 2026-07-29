import Link from "next/link";
import { googleEnabled } from "@/lib/auth";
import { AuthShell } from "@/components/auth-shell";
import { ClientRegisterForm } from "@/components/register-forms";

const ASIDE = [
  {
    title: "You approve the price before anything starts",
    body: "Send a task, get one fixed price back. Decline it and you owe nothing — no subscription, no minimum.",
  },
  {
    title: "Every deliverable is checked first",
    body: "Work is reviewed against your description before it reaches you. You get the corrected version, not the first attempt.",
  },
  {
    title: "Your data stays scoped and logged",
    body: "Only the assistant on your task can open your files, access ends when the task does, and everything is purged after 90 days.",
  },
];

export default function RegisterClientPage() {
  return (
    <AuthShell
      title="Create a client account"
      sub="Send tasks, approve a fixed price, download checked work."
      aside={ASIDE}
      footer={
        <>
          Already registered?{" "}
          <Link href="/login" className="font-medium text-blue-700 hover:underline">
            Sign in
          </Link>
        </>
      }
    >
      <ClientRegisterForm googleEnabled={googleEnabled} />
    </AuthShell>
  );
}
