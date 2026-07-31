import { EmptyState, LinkButton } from "@/components/ui";

/**
 * A 404 raised inside the worker portal (a withdrawn task, a stale link)
 * renders HERE, inside src/app/va/layout.tsx, so the nav, Notifications and
 * Sign out stay on screen. Without this file it fell through to the root
 * src/app/not-found.tsx, which has no chrome at all.
 */
export default function VaNotFound() {
  return (
    <EmptyState
      tone="night"
      title="This page doesn't exist."
      body="The task or course you asked for isn't here. It may have been withdrawn, or the link may be out of date."
      action={
        <LinkButton href="/va" tone="night">
          Back to my work
        </LinkButton>
      }
    />
  );
}
