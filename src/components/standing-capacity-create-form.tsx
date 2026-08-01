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
  const [error, setError] = useState<string | null>(null);
  const [isPending, start] = useTransition();

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    start(async () => {
      const result = await createStandingCapacityAccount({ clientId, tierHours });
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
