import Link from "next/link";
import { redirect } from "next/navigation";
import { getSessionUser, roleHome } from "@/lib/authz";
import { buttonPrimary, buttonSecondary } from "@/components/ui";

export default async function Home() {
  const user = await getSessionUser();
  if (user) redirect(roleHome(user.role));

  return (
    <div className="flex min-h-screen flex-col">
      <header className="border-b border-neutral-200 bg-white">
        <div className="mx-auto flex h-12 w-full max-w-6xl items-center justify-between px-4">
          <span className="text-sm font-semibold tracking-tight">Nightlexicon</span>
          <Link
            href="/login"
            className="text-[13px] font-medium text-neutral-600 hover:text-neutral-900"
          >
            Sign in
          </Link>
        </div>
      </header>
      <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col justify-center px-4 py-16">
        <h1 className="text-2xl font-semibold tracking-tight text-neutral-900">
          Administrative work, done overnight.
        </h1>
        <p className="mt-3 max-w-xl text-sm leading-relaxed text-neutral-600">
          Submit a task in plain language — CRM cleanup, data entry, list research,
          prospecting. You get one fixed price to approve. Work happens while you
          sleep, and every deliverable is quality-checked before it reaches you.
        </p>
        <div className="mt-8 flex flex-wrap gap-3">
          <Link href="/register" className={buttonPrimary}>
            Create a client account
          </Link>
          <Link href="/register/va" className={buttonSecondary}>
            Apply as a virtual assistant
          </Link>
        </div>
      </main>
    </div>
  );
}
