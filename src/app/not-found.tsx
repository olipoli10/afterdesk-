import Link from "next/link";
import { getSessionUser, roleHome, type Role } from "@/lib/authz";

const primaryLink =
  "lift inline-flex min-h-11 items-center rounded-full bg-[#F7F6F3] px-4 py-1.5 text-[#14161A] transition-colors hover:bg-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-[#0A0B0D]";

const quietLink =
  "inline-flex min-h-11 items-center px-2 text-[#8A9099] transition-colors hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white";

/** Each portal named the way its own nav names it. */
const BACK_LABEL: Record<Role, string> = {
  ADMIN: "Back to the console",
  VA: "Back to my work",
  CLIENT: "Back to my tasks",
};

/**
 * Same drafting-plate treatment as src/app/error.tsx and the closing panel
 * on the client homepage — see the comment there for why.
 *
 * WHY THIS READS THE SESSION: a 404 is only an exit if its buttons land
 * somewhere. Both public destinations here bounce a signed-in account —
 * src/app/page.tsx and src/app/workers/page.tsx each redirect to roleHome —
 * and an unverified one is sent to /verify-email by requireUser(), so a
 * worker who mistyped a task URL used to be offered two buttons and a client
 * one, none of which did what its label said. Signed in, the plate offers the
 * single room that account can actually reach.
 */
export default async function NotFound() {
  const user = await getSessionUser();

  return (
    <main className="relative flex min-h-screen items-center justify-center overflow-hidden bg-[#0A0B0D] px-6">
      <div aria-hidden className="night-grid--center pointer-events-none absolute inset-0" />
      <div className="plate plate--ink relative w-full max-w-[420px] px-7 py-10 text-center sm:px-9">
        <span className="inline-block border border-[#F7F6F3]/25 px-3 py-1 font-mono text-[11px] uppercase tracking-[0.22em] text-[#F7F6F3]">
          404
        </span>
        <h1 className="mt-6 text-[19px] font-semibold leading-snug tracking-[-0.01em] text-[#F7F6F3]">
          This page doesn&apos;t exist.
        </h1>
        <div className="mt-8 flex items-center justify-center gap-4 text-[13px] font-medium">
          {user ? (
            user.emailVerified ? (
              <Link href={roleHome(user.role)} className={primaryLink}>
                {BACK_LABEL[user.role]}
              </Link>
            ) : (
              <Link href="/verify-email" className={primaryLink}>
                Finish verifying your email
              </Link>
            )
          ) : (
            <>
              <Link href="/" className={primaryLink}>
                Get work done
              </Link>
              <Link href="/workers" className={quietLink}>
                For workers
              </Link>
            </>
          )}
        </div>
      </div>
    </main>
  );
}
