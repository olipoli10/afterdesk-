import Link from "next/link";
import { redirect } from "next/navigation";
import { getSessionUser, roleHome } from "@/lib/authz";
import {
  SectionLabel,
  buttonOnDark,
  buttonGhostOnDark,
  buttonPrimary,
  buttonSecondary,
} from "@/components/ui";

const TASK_TYPES = [
  {
    title: "CRM cleanup",
    body: "Merge duplicates, fix casing and formatting, standardize phone numbers, flag incomplete records.",
  },
  {
    title: "Data entry & transcription",
    body: "Invoices, receipts, forms, scanned documents, PDFs — into the spreadsheet format you specify.",
  },
  {
    title: "List building",
    body: "Company names, decision-maker titles, verified emails, locations — researched row by row.",
  },
  {
    title: "Prospect research",
    body: "Qualify a list against your criteria, enrich it with the fields your team actually uses.",
  },
  {
    title: "Document formatting",
    body: "Reformat, restructure and clean up spreadsheets, decks and documents to a house standard.",
  },
  {
    title: "Anything you can describe",
    body: "There is no category menu. If you can write the task in a paragraph, you can send it.",
  },
];

const STEPS = [
  {
    n: "01",
    title: "Describe the task",
    body: "Plain language, in one box. Attach the export, list or document it operates on. No scoping calls, no category menus, no account manager.",
  },
  {
    n: "02",
    title: "Get one fixed price",
    body: "A person reads your task and sets a single price — never a range, never an estimate that moves later. Approve it or decline it. Nothing starts until you accept.",
  },
  {
    n: "03",
    title: "Work happens overnight",
    body: "Your assistant works 12–13 hours ahead of Eastern Time. Accept a quote at the end of your day and the work is underway while you sleep.",
  },
  {
    n: "04",
    title: "Reviewed, then delivered",
    body: "Every deliverable is checked against your description before you ever see it. If it misses, it goes back — you get the corrected version, not the first draft.",
  },
];

const DATA_POINTS = [
  {
    title: "Your identity is never shared",
    body: "The person doing your task never learns your name, your company or your contact details. All communication runs through us — there is no channel where a worker could reach you, by design.",
  },
  {
    title: "File access is scoped and revoked",
    body: "Only the assistant currently working your task can open your files, and access ends the moment the task leaves their hands — finished, reassigned or expired.",
  },
  {
    title: "Every file access is logged",
    body: "Who opened which file, and when. If you ever need to know where your data went, the answer is a record, not a reassurance.",
  },
  {
    title: "Deleted on a schedule",
    body: "Files are purged 90 days after a task completes. Need them gone sooner? Ask, and they are deleted on request.",
  },
];

export default async function Home() {
  const user = await getSessionUser();
  if (user) redirect(roleHome(user.role));

  return (
    <div className="flex min-h-screen flex-col bg-white">
      {/* ---------- Header + hero (dark) ---------- */}
      <div className="bg-[#0b1120]">
        <header className="border-b border-white/10">
          <div className="mx-auto flex h-14 w-full max-w-6xl items-center justify-between px-5">
            <span className="text-[15px] font-semibold tracking-[-0.02em] text-white">
              Nightlexicon
            </span>
            <div className="flex items-center gap-2">
              <Link
                href="/login"
                className="rounded-md px-3 py-1.5 text-[13px] font-medium text-neutral-300 transition-colors hover:text-white"
              >
                Sign in
              </Link>
              <Link href="/register" className={`${buttonOnDark} !py-1.5 !text-[13px]`}>
                Submit a task
              </Link>
            </div>
          </div>
        </header>

        <section className="mx-auto w-full max-w-6xl px-5 py-20 sm:py-28">
          <SectionLabel className="!text-neutral-400">
            Outsourced administrative work
          </SectionLabel>
          <h1 className="display mt-4 max-w-3xl text-4xl font-semibold text-white sm:text-5xl lg:text-[3.4rem]">
            Your admin backlog, cleared overnight.
          </h1>
          <p className="mt-5 max-w-2xl text-base leading-relaxed text-neutral-300 sm:text-[17px]">
            Describe a task in plain English and attach the file it works on. We give you one
            fixed price to approve, a trained assistant completes it while you sleep, and we
            check the work before it reaches you.
          </p>

          <div className="mt-8 flex flex-wrap items-center gap-3">
            <Link href="/register" className={buttonOnDark}>
              Submit your first task
            </Link>
            <Link href="/register/va" className={buttonGhostOnDark}>
              Apply as an assistant
            </Link>
          </div>

          <p className="mt-4 text-[13px] text-neutral-400">
            No subscription. No minimum. Nothing starts before you approve the price.
          </p>

          {/* Pipeline strip — the product's own vocabulary, not decoration */}
          <div className="mt-14 border-t border-white/10 pt-6">
            <ol className="flex flex-wrap items-center gap-x-3 gap-y-2 font-mono text-[11px] uppercase tracking-label text-neutral-400">
              {[
                "You submit",
                "We price it",
                "You approve",
                "Work happens",
                "We check it",
                "You download",
              ].map((label, i, arr) => (
                <li key={label} className="flex items-center gap-3">
                  <span className={i === arr.length - 1 ? "text-white" : undefined}>{label}</span>
                  {i < arr.length - 1 ? (
                    <span aria-hidden className="text-neutral-600">
                      →
                    </span>
                  ) : null}
                </li>
              ))}
            </ol>
          </div>
        </section>
      </div>

      {/* ---------- What you can send ---------- */}
      <section className="mx-auto w-full max-w-6xl px-5 py-16 sm:py-24">
        <SectionLabel>What you can send us</SectionLabel>
        <h2 className="mt-3 max-w-2xl text-2xl font-semibold tracking-[-0.025em] text-neutral-900 sm:text-3xl">
          The work that fills your team&apos;s day and none of their job description.
        </h2>
        <div className="mt-10 grid gap-px overflow-hidden rounded-lg border border-neutral-200 bg-neutral-200 sm:grid-cols-2 lg:grid-cols-3">
          {TASK_TYPES.map((t) => (
            <div key={t.title} className="bg-white p-5">
              <h3 className="text-[15px] font-medium text-neutral-900">{t.title}</h3>
              <p className="mt-1.5 text-[13px] leading-relaxed text-neutral-500">{t.body}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ---------- How it works ---------- */}
      <section className="border-y border-neutral-200 bg-neutral-50">
        <div className="mx-auto w-full max-w-6xl px-5 py-16 sm:py-24">
          <SectionLabel>How it works</SectionLabel>
          <h2 className="mt-3 max-w-2xl text-2xl font-semibold tracking-[-0.025em] text-neutral-900 sm:text-3xl">
            Four steps. You are only involved in two of them.
          </h2>
          <div className="mt-10 grid gap-8 sm:grid-cols-2">
            {STEPS.map((s) => (
              <div key={s.n} className="flex gap-4">
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded border border-neutral-300 bg-white font-mono text-[11px] font-medium text-neutral-500">
                  {s.n}
                </span>
                <div>
                  <h3 className="text-[15px] font-medium text-neutral-900">{s.title}</h3>
                  <p className="mt-1.5 text-sm leading-relaxed text-neutral-600">{s.body}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ---------- Data handling ---------- */}
      <section className="mx-auto w-full max-w-6xl px-5 py-16 sm:py-24">
        <SectionLabel>How your data is handled</SectionLabel>
        <h2 className="mt-3 max-w-2xl text-2xl font-semibold tracking-[-0.025em] text-neutral-900 sm:text-3xl">
          You are handing over real customer data. Here is exactly what happens to it.
        </h2>
        <div className="mt-10 grid gap-x-10 gap-y-8 sm:grid-cols-2">
          {DATA_POINTS.map((p) => (
            <div key={p.title} className="border-t border-neutral-200 pt-5">
              <h3 className="text-[15px] font-medium text-neutral-900">{p.title}</h3>
              <p className="mt-1.5 text-sm leading-relaxed text-neutral-600">{p.body}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ---------- For assistants ---------- */}
      <section className="mx-auto w-full max-w-6xl px-5 pb-16 sm:pb-24">
        <div className="rounded-lg border border-neutral-200 bg-white p-6 sm:p-8">
          <div className="flex flex-wrap items-start justify-between gap-6">
            <div className="max-w-xl">
              <SectionLabel>For virtual assistants</SectionLabel>
              <h2 className="mt-3 text-xl font-semibold tracking-[-0.02em] text-neutral-900">
                Paid per task, at a rate you see before you claim it.
              </h2>
              <p className="mt-2 text-sm leading-relaxed text-neutral-600">
                Pass a short entry test, then browse available work. Every task shows its payout
                and its deadline up front — you claim what you want, first come first served. No
                bidding, no client calls, no chasing anyone for payment.
              </p>
            </div>
            <Link href="/register/va" className={buttonSecondary}>
              Apply as an assistant
            </Link>
          </div>
        </div>
      </section>

      {/* ---------- Closing CTA ---------- */}
      <section className="border-t border-neutral-200 bg-neutral-50">
        <div className="mx-auto w-full max-w-6xl px-5 py-16 text-center sm:py-20">
          <h2 className="text-2xl font-semibold tracking-[-0.025em] text-neutral-900 sm:text-3xl">
            Send us the task you have been putting off.
          </h2>
          <p className="mx-auto mt-3 max-w-lg text-sm leading-relaxed text-neutral-600">
            Describe it, attach the file, and you will have a fixed price to approve — or decline,
            at no cost.
          </p>
          <div className="mt-7 flex flex-wrap justify-center gap-3">
            <Link href="/register" className={buttonPrimary}>
              Create a client account
            </Link>
            <Link href="/login" className={buttonSecondary}>
              Sign in
            </Link>
          </div>
        </div>
      </section>

      <footer className="border-t border-neutral-200 bg-white">
        <div className="mx-auto flex w-full max-w-6xl flex-wrap items-center justify-between gap-3 px-5 py-6">
          <span className="text-[13px] font-medium text-neutral-900">Nightlexicon</span>
          <div className="flex items-center gap-5 text-[13px] text-neutral-500">
            <Link href="/login" className="transition-colors hover:text-neutral-900">
              Sign in
            </Link>
            <Link href="/register" className="transition-colors hover:text-neutral-900">
              Client sign-up
            </Link>
            <Link href="/register/va" className="transition-colors hover:text-neutral-900">
              Assistant application
            </Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
