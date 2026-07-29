"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { approvePricing, cancelTask } from "@/server/actions/admin";
import {
  Card,
  CardBody,
  Field,
  inputClass,
  buttonPrimary,
  buttonDanger,
} from "@/components/ui";

function parseUsd(v: string): number | null {
  const cleaned = v.replace(/[$,\s]/g, "");
  if (!/^\d+(\.\d{1,2})?$/.test(cleaned)) return null;
  return Math.round(parseFloat(cleaned) * 100);
}

/**
 * Batch-first pricing form: Ctrl+Enter approves, and approval auto-advances
 * to the next task in the queue. The two prices are independent by design —
 * no formula links them.
 */
export function PricingForm({ taskId, fileCount }: { taskId: string; fileCount: number }) {
  const router = useRouter();
  const [clientPrice, setClientPrice] = useState("");
  const [vaPayout, setVaPayout] = useState("");
  const [tier, setTier] = useState<"standard" | "high_value">("standard");
  const [filesVerified, setFilesVerified] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showCancel, setShowCancel] = useState(false);
  const [cancelReason, setCancelReason] = useState("");
  const [isPending, startTransition] = useTransition();

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
  }, [clientPrice, vaPayout, tier, filesVerified]);

  return (
    <Card>
      <CardBody>
        <h2 className="mb-3 text-[11px] font-semibold uppercase tracking-wider text-neutral-400">
          Set pricing
        </h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Client price (USD)" hint="What the client pays. Never shown to VAs.">
            <input
              className={inputClass}
              placeholder="e.g. 180"
              value={clientPrice}
              onChange={(e) => setClientPrice(e.target.value)}
              autoFocus
            />
          </Field>
          <Field label="VA payout (USD)" hint="What the worker receives. Never shown to the client.">
            <input
              className={inputClass}
              placeholder="e.g. 60"
              value={vaPayout}
              onChange={(e) => setVaPayout(e.target.value)}
            />
          </Field>
        </div>

        {margin != null ? (
          <p className="mt-2 text-xs text-neutral-500">
            Margin:{" "}
            <span className={margin >= 0 ? "font-medium text-neutral-800" : "font-medium text-red-600"}>
              ${(margin / 100).toFixed(2)}
            </span>
            {cp ? ` (${Math.round((margin / cp) * 100)}%)` : null}
          </p>
        ) : null}

        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <Field label="Priority tier" hint="High-value tasks are only visible to top-scored VAs.">
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

        <label className="mt-4 flex items-start gap-2 text-sm text-neutral-700">
          <input
            type="checkbox"
            className="mt-0.5"
            checked={filesVerified}
            onChange={(e) => setFilesVerified(e.target.checked)}
          />
          <span>
            I reviewed the description, quantity{fileCount > 0 ? ` and ${fileCount} file${fileCount > 1 ? "s" : ""}` : ""}{" "}
            for contact info or identifying details — required before this becomes
            visible to VAs.
          </span>
        </label>

        {error ? <p className="mt-3 text-sm text-red-600">{error}</p> : null}

        <div className="mt-5 flex items-center gap-3">
          <button className={buttonPrimary} disabled={isPending} onClick={approve}>
            {isPending ? "Approving…" : "Approve & next"}
          </button>
          <span className="text-xs text-neutral-400">Ctrl+Enter</span>
          <span className="flex-1" />
          {!showCancel ? (
            <button
              className="text-sm font-medium text-neutral-400 hover:text-red-600"
              onClick={() => setShowCancel(true)}
            >
              Cancel task…
            </button>
          ) : null}
        </div>

        {showCancel ? (
          <div className="mt-4 space-y-2 border-t border-neutral-100 pt-4">
            <Field label="Cancellation reason (logged, required)">
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
                Cancel this task
              </button>
              <button
                className="px-2 text-sm text-neutral-500 hover:text-neutral-800"
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
