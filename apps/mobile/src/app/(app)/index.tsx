import { useEffect } from "react";
import { router } from "expo-router";
import { Text, View } from "react-native";
import { Button, Card, Empty, Heading, Label, Loading, Notice, Screen, sharedStyles } from "@/components/ui";
import { mobileGoldenWorkflowCopy, type MobileGoldenWorkflowRoute } from "@/lib/golden-workflow";
import { useMobileSession } from "@/state/mobile-session";

function openRoute(route: MobileGoldenWorkflowRoute) {
  if (route === "ONBOARDING") return router.push("/onboarding");
  if (route === "ASSISTANT") return router.push("/assistant");
  if (route === "PROJECTS") return router.push("/projects");
  if (route === "JOBS") return router.push("/jobs");
  if (route === "CALENDAR") return router.push("/calendar");
  if (route === "EVIDENCE") return router.push("/evidence");
  if (route === "FOLLOW_UPS") return router.push("/follow-ups");
  if (route === "RECEIVABLES") return router.push("/receivables");
  if (route === "ACTIONS") return router.push("/actions");
  if (route === "TIMELINE") return router.push("/timeline");
  if (route === "PROVENANCE") return router.push("/provenance");
  if (route === "HUMAN_SUPPORT") return router.push("/human-support");
  return router.push("/");
}

export default function TodayScreen() {
  const { activeWorkspace, goldenWorkflow, goldenWorkflowLoadState, publicError, loadGoldenWorkflow } = useMobileSession();
  const fallbackLocale = activeWorkspace?.defaultLocale === "en-CA" ? "en-CA" : "fr-CA";
  useEffect(() => { if (activeWorkspace) void loadGoldenWorkflow(); }, [activeWorkspace, loadGoldenWorkflow]);
  if (!goldenWorkflow && goldenWorkflowLoadState === "LOADING") return <Screen><Loading label={mobileGoldenWorkflowCopy(fallbackLocale, "cockpit.syncing")} /></Screen>;
  if (!goldenWorkflow) return <Screen><Heading eyebrow={mobileGoldenWorkflowCopy(fallbackLocale, "cockpit.eyebrow")} title={mobileGoldenWorkflowCopy(fallbackLocale, "cockpit.title")} body={mobileGoldenWorkflowCopy(fallbackLocale, "cockpit.body")} />{publicError ? <Notice danger>{publicError}</Notice> : null}<Card><Empty>{mobileGoldenWorkflowCopy(fallbackLocale, "cockpit.empty")}</Empty></Card><Button accessibilityRole="button" accessibilityLabel={mobileGoldenWorkflowCopy(fallbackLocale, "action.SYNC")} accessibilityState={{ busy: goldenWorkflowLoadState === "LOADING" }} onPress={() => void loadGoldenWorkflow()}>{mobileGoldenWorkflowCopy(fallbackLocale, "action.SYNC")}</Button></Screen>;
  const locale = goldenWorkflow.workspace.locale;
  const current = goldenWorkflow.steps.find((item) => item.step === goldenWorkflow.currentStep) ?? goldenWorkflow.steps[0];
  return <Screen>
    <Heading eyebrow={mobileGoldenWorkflowCopy(locale, "cockpit.eyebrow")} title={mobileGoldenWorkflowCopy(locale, "cockpit.title")} body={`${goldenWorkflow.workspace.name}${goldenWorkflow.project ? ` · ${goldenWorkflow.project.code}` : ""}`} />
    {publicError ? <Notice danger>{publicError}</Notice> : null}
    <Card>
      <Label>{mobileGoldenWorkflowCopy(locale, "cockpit.progress")}</Label>
      <Text accessibilityRole="summary" style={sharedStyles.name}>{goldenWorkflow.completedCount}/{goldenWorkflow.totalCount}</Text>
      <Text style={sharedStyles.value}>{mobileGoldenWorkflowCopy(locale, current.titleKey)}</Text>
      <Text style={sharedStyles.muted}>{mobileGoldenWorkflowCopy(locale, current.bodyKey)}</Text>
      {current.blockers.map((blocker) => <Notice danger key={blocker.code}>{mobileGoldenWorkflowCopy(locale, blocker.copyKey)}</Notice>)}
      <Button accessibilityRole="button" accessibilityLabel={mobileGoldenWorkflowCopy(locale, goldenWorkflow.primaryAction.copyKey)} accessibilityHint={mobileGoldenWorkflowCopy(locale, current.bodyKey)} accessibilityState={{ disabled: false, busy: goldenWorkflowLoadState === "LOADING" }} onPress={() => openRoute(goldenWorkflow.primaryAction.route)}>{mobileGoldenWorkflowCopy(locale, goldenWorkflow.primaryAction.copyKey)}</Button>
    </Card>
    <Card>
      <Label>{mobileGoldenWorkflowCopy(locale, "cockpit.progress")}</Label>
      {goldenWorkflow.steps.map((item) => <View key={item.step} accessible accessibilityRole="summary" accessibilityLabel={`${mobileGoldenWorkflowCopy(locale, item.titleKey)}. ${mobileGoldenWorkflowCopy(locale, `status.${item.status}`)}`} style={sharedStyles.stack}><View style={sharedStyles.row}><Text style={sharedStyles.value}>{item.order}. {mobileGoldenWorkflowCopy(locale, item.titleKey)}</Text><Text style={item.status === "COMPLETE" ? sharedStyles.success : sharedStyles.muted}>{mobileGoldenWorkflowCopy(locale, `status.${item.status}`)}</Text></View></View>)}
    </Card>
    <Card>
      <Label>{mobileGoldenWorkflowCopy(locale, "cockpit.external")}</Label>
      <Text style={sharedStyles.muted}>{mobileGoldenWorkflowCopy(locale, "cockpit.external_disabled")}</Text>
    </Card>
    <Button tone="secondary" accessibilityRole="button" accessibilityLabel={mobileGoldenWorkflowCopy(locale, "action.SYNC")} accessibilityState={{ busy: goldenWorkflowLoadState === "LOADING" }} disabled={goldenWorkflowLoadState === "LOADING"} onPress={() => void loadGoldenWorkflow()}>{mobileGoldenWorkflowCopy(locale, goldenWorkflowLoadState === "LOADING" ? "cockpit.syncing" : "action.SYNC")}</Button>
  </Screen>;
}
