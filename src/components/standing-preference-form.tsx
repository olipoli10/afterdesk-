"use client";

import { useState, useTransition } from "react";
import { writeAccountPreference } from "@/server/actions/standing-capacity";
import { Card, CardBody, Field, inputClass, buttonSecondary } from "@/components/ui";

export function StandingPreferenceForm({
  initial,
}: {
  initial: { communicationStyle: string | null; deliverableFormat: string | null; notes: string | null } | null;
}) {
  const [communicationStyle, setCommunicationStyle] = useState(initial?.communicationStyle ?? "");
  const [deliverableFormat, setDeliverableFormat] = useState(initial?.deliverableFormat ?? "");
  const [notes, setNotes] = useState(initial?.notes ?? "");
  const [saved, setSaved] = useState(false);
  const [isPending, startTransition] = useTransition();

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaved(false);
    startTransition(async () => {
      await writeAccountPreference({
        communicationStyle: communicationStyle || undefined,
        deliverableFormat: deliverableFormat || undefined,
        notes: notes || undefined,
      });
      setSaved(true);
    });
  }

  return (
    <Card>
      <CardBody>
        {/* This is the client's own account — whoever picks it up next reads
            it, but it is never attributed to a name. */}
        <form onSubmit={onSubmit} className="space-y-4">
          <Field label="Preferred communication style" hint="How you like updates written — brief, detailed, formal, casual.">
            <input
              maxLength={500}
              className={inputClass}
              value={communicationStyle}
              onChange={(e) => setCommunicationStyle(e.target.value)}
            />
          </Field>
          <Field label="Preferred delivery format" hint="File types, naming conventions, structure you want deliverables to follow.">
            <input
              maxLength={500}
              className={inputClass}
              value={deliverableFormat}
              onChange={(e) => setDeliverableFormat(e.target.value)}
            />
          </Field>
          <Field label="Anything else standing" hint="Recurring context worth every specialist knowing before they start.">
            <textarea
              rows={4}
              maxLength={2000}
              className={inputClass}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
          </Field>
          <div className="flex items-center gap-3">
            <button type="submit" disabled={isPending} className={buttonSecondary}>
              {isPending ? "Saving…" : "Save preferences"}
            </button>
            {saved ? <span className="text-sm text-[#166049]">Saved.</span> : null}
          </div>
        </form>
      </CardBody>
    </Card>
  );
}
