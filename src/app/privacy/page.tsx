import { cookies } from "next/headers";
import { PolicyPage } from "@/components/policy-page";
import { docLangOf } from "@/lib/i18n/docs";
import { PRIVACY_I18N } from "@/lib/i18n/legal";
import { langAlternates } from "@/lib/i18n/langs";
import { getSettings } from "@/lib/settings";

export const dynamic = "force-dynamic";

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
  const t = PRIVACY_I18N[await resolveLang(sp)];
  return {
    title: t.meta.title,
    description: t.meta.description,
    alternates: langAlternates("/privacy", sp.lang),
  };
}

export default async function PrivacyPage({
  searchParams,
}: {
  searchParams: Promise<{ lang?: string }>;
}) {
  const [sp, settings] = await Promise.all([searchParams, getSettings()]);
  const lang = await resolveLang(sp);
  const t = PRIVACY_I18N[lang];

  return (
    <PolicyPage path="/privacy" lang={lang} title={t.title} intro={t.intro}>
      <section>
        <h2 className="text-xl font-semibold">{t.processed.h2}</h2>
        <p className="mt-2">{t.processed.body}</p>
      </section>
      <section>
        <h2 className="text-xl font-semibold">{t.used.h2}</h2>
        <p className="mt-2">{t.used.body}</p>
      </section>
      <section>
        <h2 className="text-xl font-semibold">{t.providers.h2}</h2>
        <p className="mt-2">{t.providers.body}</p>
      </section>
      <section>
        <h2 className="text-xl font-semibold">{t.retention.h2}</h2>
        <p className="mt-2">
          {t.retention.pre} {settings.retentionDays} {t.retention.unit}. {t.retention.mid}{" "}
          <a className="underline" href="mailto:privacy@afterdesk.co">
            privacy@afterdesk.co
          </a>
          {t.retention.post}
        </p>
      </section>
    </PolicyPage>
  );
}
