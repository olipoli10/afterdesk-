import { cookies } from "next/headers";
import { PolicyPage } from "@/components/policy-page";
import { docLangOf } from "@/lib/i18n/docs";
import { SECURITY_I18N } from "@/lib/i18n/legal";
import { langAlternates } from "@/lib/i18n/langs";

async function resolveLang(sp: { lang?: string }) {
  const jar = await cookies();
  return docLangOf(
    sp.lang,
    jar.get("ss-lang-doc")?.value,
    jar.get("ss-lang-client")?.value,
    jar.get("ss-lang-worker")?.value
  );
}

export async function generateMetadata({
  searchParams,
}: {
  searchParams: Promise<{ lang?: string }>;
}) {
  const sp = await searchParams;
  const t = SECURITY_I18N[await resolveLang(sp)];
  return {
    title: t.meta.title,
    description: t.meta.description,
    alternates: langAlternates("/security", sp.lang),
  };
}

export default async function SecurityPage({
  searchParams,
}: {
  searchParams: Promise<{ lang?: string }>;
}) {
  const sp = await searchParams;
  const lang = await resolveLang(sp);
  const t = SECURITY_I18N[lang];

  return (
    <PolicyPage path="/security" lang={lang} title={t.title} intro={t.intro}>
      <section>
        <h2 className="text-xl font-semibold">{t.access.h2}</h2>
        <p className="mt-2">{t.access.body}</p>
      </section>
      <section>
        <h2 className="text-xl font-semibold">{t.automation.h2}</h2>
        <p className="mt-2">{t.automation.body}</p>
      </section>
      <section>
        <h2 className="text-xl font-semibold">{t.files.h2}</h2>
        <p className="mt-2">{t.files.body1}</p>
        <p className="mt-2">{t.files.body2}</p>
      </section>
      <section>
        <h2 className="text-xl font-semibold">{t.payments.h2}</h2>
        <p className="mt-2">{t.payments.body}</p>
      </section>
      <section>
        <h2 className="text-xl font-semibold">{t.reporting.h2}</h2>
        <p className="mt-2">
          {t.reporting.pre}{" "}
          <a className="underline" href="mailto:security@afterdesk.co">
            security@afterdesk.co
          </a>
          {t.reporting.post}
        </p>
      </section>
    </PolicyPage>
  );
}
