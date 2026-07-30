import type { Metadata } from "next";
import { PolicyPage } from "@/components/policy-page";

export const metadata: Metadata = {
  title: "Acceptable use",
  description:
    "What Second Shift will and will not take on. Some tasks we turn down — this page says which, and why, in plain language.",
  alternates: { canonical: "/acceptable-use" },
};

export default function AcceptableUsePage() {
  return (
    <PolicyPage
      title="Acceptable use"
      intro="Second Shift handles bounded administrative work. Some tasks are refused even when they can be described."
    >
      <section>
        <h2 className="text-xl font-semibold">Not accepted</h2>
        <ul className="mt-2 list-disc space-y-2 pl-5">
          <li>Illegal activity, fraud, impersonation, harassment or deceptive outreach.</li>
          <li>Credential sharing, account takeovers, bypassing access controls or malware.</li>
          <li>High-stakes legal, medical, financial or employment decisions.</li>
          <li>Payment-card data, authentication secrets or unnecessary government identifiers.</li>
          <li>Copyright infringement, doxxing, surveillance or re-identification of people.</li>
          <li>Tasks requiring a worker to contact a client outside the operator channel.</li>
        </ul>
      </section>
      <section>
        <h2 className="text-xl font-semibold">Sensitive material</h2>
        <p className="mt-2">
          Remove personal and confidential information not needed for the result. If a task cannot
          be completed without unusually sensitive data, contact support before uploading it.
        </p>
      </section>
      <section>
        <h2 className="text-xl font-semibold">Enforcement</h2>
        <p className="mt-2">
          The operator may refuse, cancel or pause a task that creates safety, confidentiality,
          legality or scope risk. A cancelled unpaid task is not charged; paid-task remedies follow
          the service terms and the task’s recorded status.
        </p>
      </section>
    </PolicyPage>
  );
}
