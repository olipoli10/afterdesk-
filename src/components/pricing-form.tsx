"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { approvePricing, cancelTask } from "@/server/actions/admin";
import {
  Card,
  CardBody,
  Field,
  SectionLabel,
  inputClass,
  buttonPrimary,
  buttonDanger,
  moneyClient,
  moneyPayout,
} from "@/components/ui";

function parseUsd(v: string): number | null {
  const cleaned = v.replace(/[$,\s]/g, "");
  if (!/^\d+(\.\d{1,2})?$/.test(cleaned)) return null;
  return Math.round(parseFloat(cleaned) * 100);
}

function usdString(cents: number | null): string {
  return cents != null ? String(Math.round(cents / 100)) : "";
}

export type AiSuggestion = {
  priceCents: number;
  vaPayoutCents: number | null;
  estimatedMinutes: number | null;
  /** "" if the model's suggested_category_slug didn't match anything active
   *  — see the resolution comment in admin/pricing/[id]/page.tsx. */
  categoryId: string;
  confidence: "low" | "medium" | "high" | null;
};

/**
 * Batch-first pricing form: Ctrl+Enter approves, and approval auto-advances
 * to the next task in the queue. The two prices are independent by design —
 * no formula links them.
 *
 * When an AI suggestion exists, every field below starts PRE-FILLED with
 * it — this is the "admin reviews, doesn't calculate from zero" flow. The
 * primary button's label tracks whether the admin has touched anything:
 * untouched, it reads "Approve $X as suggested" (the one-click fast path
 * for a suggestion that's already right); the moment any field changes it
 * becomes "Approve & next" (the adjusted-then-approve path). Both hit the
 * exact same approvePricing call with whatever is currently in the
 * fields — this is a labeling distinction, not two different actions, so
 * there is only ever one code path to keep correct.
 */
export function PricingForm({
  taskId,
  fileCount,
  categories,
  aiSuggestion,
}: {
  taskId: string;
  fileCount: number;
  categories: { id: string; name: string }[];
  aiSuggestion: AiSuggestion | null;
}) {
  const router = useRouter();
  const [clientPrice, setClientPrice] = useState(() => usdString(aiSuggestion?.priceCents ?? null));
  const [vaPayout, setVaPayout] = useState(() => usdString(aiSuggestion?.vaPayoutCents ?? null));
  const [tier, setTier] = useState<"standard" | "high_value">("standard");
  const [categoryId, setCategoryId] = useState(aiSuggestion?.categoryId ?? "");
  const [estimatedMinutes, setEstimatedMinutes] = useState(
    aiSuggestion?.estimatedMinutes ? String(aiSuggestion.estimatedMinutes) : ""
  );
  const [filesVerified, setFilesVerified] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showCancel, setShowCancel] = useState(false);
  const [cancelReason, setCancelReason] = useState("");
  const [isPending, startTransition] = useTransition();

  const untouched =
    aiSuggestion != null &&
    clientPrice === usdString(aiSuggestion.priceCents) &&
    vaPayout === usdString(aiSuggestion.vaPayoutCents) &&
    categoryId === aiSuggestion.categoryId &&
    estimatedMinutes === (aiSuggestion.estimatedMinutes ? String(aiSuggestion.estimatedMinutes) : "");

  const cp = parseUsd(clientPrice);
  const vp = parseUsd(vaPayout);
  const margin = cp != null && vp != null ? cp - vp : null;

  function approve() {
    setError(null);
    startTransition(async () => {
      const result = await approvePricing({
        taskId,
        clientPrice,
        vaPayout,
        tier,
        categoryId,
        estimatedMinutes,
        filesVerified,
      });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      // Approve-and-advance: straight to the next task in the queue.
      if (result.nextId) router.push(`/admin/pricing/${result.nextId}`);
      else router.push("/admin/pricing");
      router.refresh();
    });
  }

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
        e.preventDefault();
        approve();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clientPrice, vaPayout, tier, categoryId, estimatedMinutes, filesVerified]);

  return (
    <Card>
      <CardBody>
        <div className="mb-3 flex items-baseline justify-between gap-2">
          <SectionLabel as="h2">Set pricing</SectionLabel>
          {aiSuggestion ? (
            <span className="text-xs text-[#5B6069]">
              {untouched ? "Pre-filled from the AI suggestion above" : "Adjusted from the AI suggestion"}
            </span>
          ) : null}
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Client price (USD)" hint="What the client pays. Never shown to workers.">
            <input
              className={inputClass}
              placeholder="e.g. 180"
              value={clientPrice}
              onChange={(e) => setClientPrice(e.target.value)}
              autoFocus
            />
          </Field>
          <Field label="Worker payout (USD)" hint="What the worker receives. Never shown to the client.">
            <input
              className={inputClass}
              placeholder="e.g. 60"
              value={vaPayout}
              onChange={(e) => setVaPayout(e.target.value)}
            />
          </Field>
        </div>

        {margin != null ? (
          <p className="mt-2 text-xs text-[#5B6069]">
            Margin:{" "}
            <span
              className={
                margin >= 0
                  ? `font-medium ${moneyClient}`
                  : "font-mono font-medium tabular-nums text-[#955710]"
              }
            >
              ${(margin / 100).toFixed(2)}
            </span>
            {cp ? (
              <span className="font-mono tabular-nums"> ({Math.round((margin / cp) * 100)}%)</span>
            ) : null}
          </p>
        ) : null}

        <div className="mt-4 grid gap-4 sm:grid-cols-3">
          <Field label="Category" hint="Sets the standard the work is judged against.">
            <select
              className={inputClass}
              value={categoryId}
              onChange={(e) => setCategoryId(e.target.value)}
            >
              <option value="">Choose…</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Estimated minutes" hint="Your honest guess at the work involved.">
            <input
              inputMode="numeric"
              className={inputClass}
              placeholder="e.g. 120"
              value={estimatedMinutes}
              onChange={(e) => setEstimatedMinutes(e.target.value.replace(/\D/g, ""))}
            />
          </Field>
          <Field label="Priority tier" hint="High-value is gated on worker score.">
            <select
              className={inputClass}
              value={tier}
              onChange={(e) => setTier(e.target.value as "standard" | "high_value")}
            >
              <option value="standard">Standard</option>
              <option value="high_value">High-value</option>
            </select>
          </Field>
        </div>

        {vp != null && estimatedMinutes && Number(estimatedMinutes) > 0 ? (
          <p className="mt-2 text-xs text-[#5B6069]">
            Implied worker rate:{" "}
            <span className={`font-medium ${moneyPayout}`}>
              ${((vp / 100 / (Number(estimatedMinutes) / 60)) || 0).toFixed(2)}/hour
            </span>
          </p>
        ) : null}

        <label className="mt-4 flex items-start gap-2 text-sm text-[#14161A]">
          <input
            type="checkbox"
            className="mt-0.5 accent-[#14161A]"
            checked={filesVerified}
            onChange={(e) => setFilesVerified(e.target.checked)}
          />
          <span>
            I reviewed the description, quantity{fileCount > 0 ? ` and ${fileCount} file${fileCount > 1 ? "s" : ""}` : ""}{" "}
            for contact info or identifying details — required before this becomes
            visible to workers.
          </span>
        </label>

        {error ? (
          <p role="alert" className="mt-3 text-sm text-[#8C2F23]">
            {error}
          </p>
        ) : null}

        <div className="mt-5 flex items-center gap-3">
          <button className={buttonPrimary} disabled={isPending} onClick={approve}>
            {isPending
              ? "Approving…"
              : untouched && cp != null
                ? `Approve $${(cp / 100).toFixed(0)} as suggested`
                : "Approve & next"}
          </button>
          <span className="font-mono text-xs text-[#5B6069]">Ctrl+Enter</span>
          <span className="flex-1" />
          {!showCancel ? (
            <button
              className="text-sm font-medium text-[#5B6069] transition-colors duration-150 hover:text-[#8C2F23]"
              onClick={() => setShowCancel(true)}
            >
              Reject…
            </button>
          ) : null}
        </div>

        {showCancel ? (
          <div className="mt-4 space-y-2 border-t border-[#14161A]/[0.06] pt-4">
            <Field label="Rejection reason (logged, required)">
              <input
                className={inputClass}
                value={cancelReason}
                onChange={(e) => setCancelReason(e.target.value)}
              />
            </Field>
            <div className="flex gap-2">
              <button
                className={buttonDanger}
                disabled={isPending || cancelReason.trim().length < 3}
                onClick={() => {
                  setError(null);
                  startTransition(async () => {
                    const result = await cancelTask({ taskId, reason: cancelReason });
                    if (!result.ok) {
                      setError(result.error);
                      return;
                    }
                    router.push("/admin/pricing");
                    router.refresh();
                  });
                }}
              >
                Reject this task
              </button>
              <button
                className="px-2 text-sm text-[#5B6069] transition-colors duration-150 hover:text-[#14161A]"
                onClick={() => setShowCancel(false)}
              >
                Keep it
              </button>
            </div>
          </div>
        ) : null}
      </CardBody>
    </Card>
  );
}
