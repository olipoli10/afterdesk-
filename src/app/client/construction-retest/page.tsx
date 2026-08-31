import { notFound } from "next/navigation";
import { requireRole } from "@/lib/authz";
import { FounderRetestConsole } from "@/components/construction-assistant-v1/founder-retest/founder-retest-console";
import { loadFounderRetestState } from "@/server/actions/construction-assistant-v1-r3-retest";

export const dynamic = "force-dynamic";

export default async function ConstructionFounderRetestPage() {
  if (process.env.NODE_ENV === "production" || process.env.ENDVERA_R3_FOUNDER_RETEST !== "ENABLED") notFound();
  await requireRole("CLIENT");
  const initialState = await loadFounderRetestState();
  return <FounderRetestConsole initialState={initialState} />;
}
