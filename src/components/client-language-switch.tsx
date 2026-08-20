"use client";

import { usePathname } from "next/navigation";
import { LangSwitch } from "@/components/lang-switch";
import {
  CLIENT_PORTAL_LANGS,
  type ClientPortalLang,
} from "@/lib/i18n/client-portal";

/** Keeps the entrepreneur on the same portal screen while changing language. */
export function ClientLanguageSwitch({ current, search }: { current: ClientPortalLang; search?: string }) {
  return (
    <LangSwitch
      path={usePathname()}
      current={current}
      options={CLIENT_PORTAL_LANGS}
      tone="onyx"
      search={search}
    />
  );
}
