import { requireApprovedVa } from "@/lib/authz";
import {
  standingCapacityAccountsForWorker,
  standingCapacityForWorker,
  draftContextNotesForWorker,
} from "@/lib/queries/standing-capacity";
import { EmptyState } from "@/components/ui";
import { StandingContextNoteForm } from "@/components/standing-context-note-form";

export const metadata = {
  title: "My accounts",
  robots: { index: false, follow: false },
};

export default async function VaStandingCapacityPage() {
  const user = await requireApprovedVa();
  const accounts = await standingCapacityAccountsForWorker(user.id);

  if (accounts.length === 0) {
    return (
      <EmptyState
        tone="night"
        title="No standing capacity accounts"
        body="When an operator assigns you to a recurring client account, it shows up here — with everything that account's context holds, so you never start cold."
      />
    );
  }

  const detailed = await Promise.all(
    accounts.map(async (a) => ({
      account: a,
      full: await standingCapacityForWorker(a.id, user.id),
      drafts: await draftContextNotesForWorker(a.id, user.id),
    }))
  );

  return (
    <div className="space-y-8">
      <h1 className="text-[26px] font-semibold leading-[1.1] tracking-[-0.02em] text-white">
        My accounts
      </h1>
      {detailed.map(({ account, full, drafts }) => (
        <div
          key={account.id}
          className="rounded-[8px] border border-white/10 bg-[#111317] p-5"
        >
          <p className="font-mono text-[11px] uppercase tracking-[0.14em] text-[#8A9099]">
            {account.tierHours}h / week account
          </p>

          {full?.preference &&
          (full.preference.communicationStyle || full.preference.deliverableFormat || full.preference.notes) ? (
            <div className="mt-4 space-y-2 border-t border-white/8 pt-4 text-[13px] text-[#C9CDD3]">
              {full.preference.communicationStyle ? (
                <p>
                  <span className="text-[#8A9099]">Communication style: </span>
                  {full.preference.communicationStyle}
                </p>
              ) : null}
              {full.preference.deliverableFormat ? (
                <p>
                  <span className="text-[#8A9099]">Delivery format: </span>
                  {full.preference.deliverableFormat}
                </p>
              ) : null}
              {full.preference.notes ? (
                <p>
                  <span className="text-[#8A9099]">Notes: </span>
                  {full.preference.notes}
                </p>
              ) : null}
            </div>
          ) : null}

          <div className="mt-4 border-t border-white/8 pt-4">
            <p className="mb-2 text-[13px] font-medium text-[#F7F6F3]">Account history</p>
            {full?.contextNotes.length ? (
              <ul className="space-y-2">
                {full.contextNotes.map((note) => (
                  <li key={note.id} className="rounded-[4px] bg-white/[0.03] px-3 py-2 text-[13px] text-[#C9CDD3]">
                    {note.body}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-[13px] text-[#8A9099]">
                Nothing recorded yet — you&apos;re the first specialist on this account, or nothing
                has been published yet.
              </p>
            )}
          </div>

          {drafts.length > 0 ? (
            <div className="mt-4 border-t border-white/8 pt-4">
              <p className="mb-2 text-[13px] font-medium text-[#F7F6F3]">Your notes awaiting review</p>
              <ul className="space-y-2">
                {drafts.map((d) => (
                  <li key={d.id} className="rounded-[4px] border border-dashed border-white/15 px-3 py-2 text-[13px] text-[#8A9099]">
                    {d.body}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          <div className="mt-4 border-t border-white/8 pt-4">
            <p className="mb-2 text-[13px] font-medium text-[#F7F6F3]">Leave a note for the next specialist</p>
            <StandingContextNoteForm accountId={account.id} />
          </div>
        </div>
      ))}
    </div>
  );
}
