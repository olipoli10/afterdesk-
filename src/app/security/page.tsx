import type { Metadata } from "next";
import { PolicyPage } from "@/components/policy-page";

export const metadata: Metadata = { title: "Security" };

export default function SecurityPage() {
  return (
    <PolicyPage
      title="Security"
      intro="The identity wall, payment gate and quality review are enforced at the data and transaction layers—not only hidden in the interface."
    >
      <section>
        <h2 className="text-xl font-semibold">Access and identity</h2>
        <p className="mt-2">
          Every protected read and mutation rechecks the signed-in user, role and resource
          ownership. Password accounts must verify their email. Workers lose task-file access as
          soon as a task leaves their hands or their approval is suspended.
        </p>
      </section>
      <section>
        <h2 className="text-xl font-semibold">Files</h2>
        <p className="mt-2">
          Uploads are size-limited, signature-checked, hashed and unavailable until scanning
          passes. Office documents with macros, external relationships, comments, hidden sheets
          or embedded objects are refused. Common author metadata is removed from Office and image
          files. Production scanning fails closed when the malware service is unavailable.
        </p>
        <p className="mt-2">
          No automated system can remove identifying information written into the visible content
          itself. Clients and workers must remove names, contacts and account identifiers before
          upload; the operator performs a second content review before release.
        </p>
      </section>
      <section>
        <h2 className="text-xl font-semibold">Payments and audit</h2>
        <p className="mt-2">
          Card details are collected by Stripe. A task cannot reach the worker pool until a signed
          webhook confirms the approved amount. State changes, payouts, refunds and administrative
          decisions are recorded with idempotency controls and database-enforced invariants.
        </p>
      </section>
      <section>
        <h2 className="text-xl font-semibold">Reporting</h2>
        <p className="mt-2">
          Report a suspected vulnerability to{" "}
          <a className="underline" href="mailto:security@secondshift.co">
            security@secondshift.co
          </a>
          . Do not access other users’ data or disrupt the service while testing.
        </p>
      </section>
    </PolicyPage>
  );
}

