import { EmptyState, LinkButton } from "@/components/ui";

/** The operator console's own 404 — see src/app/va/not-found.tsx for why. */
export default function AdminNotFound() {
  return (
    <EmptyState
      title="This page doesn't exist."
      body="Nothing matches that address. The record may have been removed, or the link may be out of date."
      action={<LinkButton href="/admin">Back to the console</LinkButton>}
    />
  );
}
