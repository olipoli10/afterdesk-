"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { createStandingCapacityAccount } from "@/server/actions/standing-capacity";
import { Field, inputClass, buttonPrimary } from "@/components/ui";

export function CreateAccountForm({
  clients,
  tiers,
}: {
  clients: { id: string; name: string; email: string }[];
  tiers: { hours: number; weeklyClientPriceCents: number; weeklyVaPayoutCents: number }[];
}) {
  const router = useRouter();
  const [clientId, setClientId] = useState("");
  const [tierHours, setTierHours] = useState(tiers[0]?.hours ?? 0);
  const [isInternal, setIsInternal] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isPending, start] = useTransition();

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    start(async () => {
      const result = await createStandingCapacityAccount({ clientId, tierHours, isInternal });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setClientId("");
      router.refresh();
    });
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-wrap items-end gap-2">
      <Field label="Client">
        <select required className={inputClass} value={clientId} onChange={(e) => setClientId(e.target.value)}>
          <option value="">Choose a client…</option>
          {clients.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name} ({c.email})
            </option>
          ))}
        </select>
      </Field>
      <Field label="Tier">
        <select
          className={inputClass}
          value={tierHours}
          onChange={(e) => setTierHours(Number(e.target.value))}
        >
          {tiers.map((t) => (
            <option key={t.hours} value={t.hours}>
              {t.hours}h/week — ${(t.weeklyClientPriceCents / 100).toFixed(0)}
            </option>
          ))}
        </select>
      </Field>
      {/* Only settable here. The account's tasks inherit it at creation and
          the integrity trigger freezes a task's isInternal the moment it
          leaves submitted — and a standing task leaves it in the same
          transaction. There is no later chance to mark this account's work
          as practice, so it has to be decided now. */}
      <label className="flex min-h-11 cursor-pointer items-center gap-2 text-[13px] text-[#30343A]">
        <input
          type="checkbox"
          checked={isInternal}
          onChange={(e) => setIsInternal(e.target.checked)}
          className="h-4 w-4 accent-[#14161A]"
        />
        Practice account — keep its work out of public counters
      </label>
      <button type="submit" className={buttonPrimary} disabled={isPending || !clientId}>
        {isPending ? "Opening…" : "Open account"}
      </button>
      {error ? (
        <p role="alert" className="w-full text-sm text-[#8C2F23]">
          {error}
        </p>
      ) : null}
    </form>
  );
}
