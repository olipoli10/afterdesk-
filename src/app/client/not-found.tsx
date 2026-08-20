import { EmptyState, LinkButton } from "@/components/ui";

/** The client desk's own 404 — see src/app/va/not-found.tsx for why. */
export default function ClientNotFound() {
  return (
    <div className="mx-auto max-w-2xl rounded-[14px] border border-[#C9A76A]/25 bg-[#F7F6F3] p-4 shadow-[0_28px_90px_rgba(0,0,0,.24)] sm:p-6">
      <EmptyState
        title="This page doesn't exist."
        body="The task you asked for isn't here. It may have been removed, or the link may be out of date."
        action={<LinkButton href="/client">Back to my tasks</LinkButton>}
      />
    </div>
  );
}
