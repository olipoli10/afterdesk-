import { cookies } from "next/headers";
import { PolicyPage } from "@/components/policy-page";
import { docLangOf } from "@/lib/i18n/docs";
import { TERMS_I18N } from "@/lib/i18n/legal";
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
  const t = TERMS_I18N[await resolveLang(sp)];
  return {
    title: t.meta.title,
    description: t.meta.description,
    alternates: langAlternates("/terms", sp.lang),
  };
}

export default async function TermsPage({
  searchParams,
}: {
  searchParams: Promise<{ lang?: string }>;
}) {
  const sp = await searchParams;
  const lang = await resolveLang(sp);
  const t = TERMS_I18N[lang];

  return (
    <PolicyPage path="/terms" lang={lang} title={t.title} intro={t.intro}>
      <section>
        <h2 className="text-xl font-semibold">{t.scope.h2}</h2>
        <p className="mt-2">{t.scope.body}</p>
      </section>
      <section>
        <h2 className="text-xl font-semibold">{t.review.h2}</h2>
        <p className="mt-2">{t.review.body}</p>
      </section>
      <section>
        <h2 className="text-xl font-semibold">{t.payments.h2}</h2>
        <p className="mt-2">{t.payments.body}</p>
      </section>
      <section>
        <h2 className="text-xl font-semibold">{t.operator.h2}</h2>
        <p className="mt-2">{t.operator.body}</p>
      </section>
      <section>
        <h2 className="text-xl font-semibold">{t.rights.h2}</h2>
        <p className="mt-2">{t.rights.body}</p>
      </section>
    </PolicyPage>
  );
}
