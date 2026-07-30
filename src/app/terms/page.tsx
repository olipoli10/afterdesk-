import type { Metadata } from "next";
import { PolicyPage } from "@/components/policy-page";

export const metadata: Metadata = { title: "Terms" };

export default function TermsPage() {
  return (
    <PolicyPage
      title="Service terms"
      intro="These terms describe the operational agreement shown before a task is purchased. Entity details and governing-law language must be reviewed by counsel before public launch."
    >
      <section>
        <h2 className="text-xl font-semibold">A task is a fixed scope</h2>
        <p className="mt-2">
          The approved brief, quantity, file set, delivery standard, deadline and fixed price form
          the task. Work begins only after payment confirmation. New scope requires a new quote.
        </p>
      </section>
      <section>
        <h2 className="text-xl font-semibold">Quality review and recourse</h2>
        <p className="mt-2">
          The operator reviews each delivery against the written brief and category standard.
          Clients may use the task page to request the included revision rounds or open a dispute
          during the displayed review window. Disputes are decided against the written standard,
          not an undisclosed preference.
        </p>
      </section>
      <section>
        <h2 className="text-xl font-semibold">Payments and refunds</h2>
        <p className="mt-2">
          Clients purchase a deliverable from Second Shift; the worker is an independent
          subcontractor paid by Second Shift. An upheld dispute queues a refund to the original
          payment method. Fraudulent chargebacks, unlawful tasks and material misrepresentation may
          result in suspension.
        </p>
      </section>
      <section>
        <h2 className="text-xl font-semibold">Confidentiality and rights</h2>
        <p className="mt-2">
          Users must upload only material they are authorized to share. Workers may use task data
          only to complete the assigned work and may not contact or identify the client. On full
          payment, the client receives the rights Second Shift can transfer in the commissioned
          deliverable, excluding third-party materials and pre-existing tools.
        </p>
      </section>
    </PolicyPage>
  );
}

