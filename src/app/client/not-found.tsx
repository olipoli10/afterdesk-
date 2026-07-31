import { EmptyState, LinkButton } from "@/components/ui";

/** The client desk's own 404 — see src/app/va/not-found.tsx for why. */
export default function ClientNotFound() {
  return (
    <EmptyState
      title="This page doesn't exist."
      body="The task you asked for isn't here. It may have been removed, or the link may be out of date."
      action={<LinkButton href="/client">Back to my tasks</LinkButton>}
    />
  );
}
