import { notFound } from "next/navigation";
import { FounderInvoiceReadinessConsole } from "@/components/construction-operating-assistant-r38/founder-full-loop-console";
import { loadFounderTestState } from "@/server/construction-operating-assistant-r38/founder-test-actions";

export const dynamic = "force-dynamic";

export default async function FounderInvoiceReadinessPage({
  searchParams,
}: {
  searchParams: Promise<{ reload?: string }>;
}) {
  if (process.env.NODE_ENV === "production" || process.env.ENDVERA_R38_FOUNDER_TEST_MODE !== "ENABLED") {
    notFound();
  }
  const query = await searchParams;
  const initialState = await loadFounderTestState({ completeReload: query.reload === "1" });
  return <FounderInvoiceReadinessConsole initialState={initialState} />;
}

