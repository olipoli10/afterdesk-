import { cookies } from "next/headers";
import { PolicyPage } from "@/components/policy-page";
import { docLangOf } from "@/lib/i18n/docs";
import { ACCEPTABLE_USE_I18N } from "@/lib/i18n/legal";
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
  const t = ACCEPTABLE_USE_I18N[await resolveLang(sp)];
  return {
    title: t.meta.title,
    description: t.meta.description,
    alternates: langAlternates("/acceptable-use", sp.lang),
  };
}

export default async function AcceptableUsePage({
  searchParams,
}: {
  searchParams: Promise<{ lang?: string }>;
}) {
  const sp = await searchParams;
  const lang = await resolveLang(sp);
  const t = ACCEPTABLE_USE_I18N[lang];

  return (
    <PolicyPage path="/acceptable-use" lang={lang} title={t.title} intro={t.intro}>
      <section>
        <h2 className="text-xl font-semibold">{t.notAccepted.h2}</h2>
        <ul className="mt-2 list-disc space-y-2 pl-5">
          {t.notAccepted.items.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
      </section>
      <section>
        <h2 className="text-xl font-semibold">{t.sensitive.h2}</h2>
        <p className="mt-2">{t.sensitive.body}</p>
      </section>
      <section>
        <h2 className="text-xl font-semibold">{t.enforcement.h2}</h2>
        <p className="mt-2">{t.enforcement.body}</p>
      </section>
    </PolicyPage>
  );
}
