import type { Metadata } from "next";
import { PolicyPage } from "@/components/policy-page";
import { getSettings } from "@/lib/settings";

export const metadata: Metadata = {
  title: "Privacy",
  description:
    "What AfterDesk collects, why, how long it is kept, and who can see it. Client and worker never learn each other’s identity — that separation is enforced in the data layer, not just the interface.",
  alternates: { canonical: "/privacy" },
};

export const dynamic = "force-dynamic";

export default async function PrivacyPage() {
  const settings = await getSettings();
  return (
    <PolicyPage
      title="Privacy"
      intro="We collect the minimum information needed to quote, perform, review, pay for and support a task."
    >
      <section>
        <h2 className="text-xl font-semibold">Information processed</h2>
        <p className="mt-2">
          Account details, task briefs, uploaded files, delivery files, payment references,
          quality decisions, security logs and support communications. Worker applications also
          include experience, specialties, availability and an optional work-sample URL.
        </p>
      </section>
      <section>
        <h2 className="text-xl font-semibold">How it is used</h2>
        <p className="mt-2">
          To operate the task, prevent fraud, enforce the identity boundary, provide support,
          satisfy financial recordkeeping and improve aggregate service quality. Task intake text
          may be sent to the configured AI provider to structure a draft brief; do not submit
          secrets that are unnecessary for quoting.
        </p>
      </section>
      <section>
        <h2 className="text-xl font-semibold">Service providers</h2>
        <p className="mt-2">
          The configured infrastructure, database and object-storage providers process service
          data. Stripe processes card payments, Resend delivers transactional email, and Anthropic
          processes AI-assisted intake when enabled. Each provider receives only the data needed
          for its function.
        </p>
      </section>
      <section>
        <h2 className="text-xl font-semibold">Retention and requests</h2>
        <p className="mt-2">
          Task files are purged after the retention period shown in the task protocol, currently{" "}
          {settings.retentionDays} days. Financial, fraud-prevention and audit records may be retained longer where
          operational or legal obligations require it. For access, correction or deletion
          requests, email{" "}
          <a className="underline" href="mailto:privacy@afterdesk.co">
            privacy@afterdesk.co
          </a>
          .
        </p>
      </section>
    </PolicyPage>
  );
}
