import { requireRole } from "@/lib/authz";
import { OnboardingCockpitClient } from "@/components/construction-operating-assistant-r32/onboarding-cockpit-client";
import { onboardingCockpitForUser } from "@/server/construction-operating-assistant-r32/onboarding";

export const dynamic = "force-dynamic";

export default async function OnboardingPage() {
  const user = await requireRole("CLIENT");
  return <OnboardingCockpitClient initial={await onboardingCockpitForUser({ userId: user.id })} />;
}
