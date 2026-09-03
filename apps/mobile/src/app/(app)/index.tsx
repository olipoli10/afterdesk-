import { useEffect, useState } from "react";
import { router } from "expo-router";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { AppIcon } from "@/components/app-icon";
import {
  BrandHeader,
  Button,
  Card,
  Empty,
  Heading,
  Loading,
  MetricPill,
  Notice,
  Screen,
  SectionHeader,
  StatusPill,
  colors,
  sharedStyles,
} from "@/components/ui";
import { mobileGoldenWorkflowCopy, type MobileGoldenWorkflowRoute } from "@/lib/golden-workflow";
import { mobileProductCopy } from "@/lib/product-experience";
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
  const [showPlan, setShowPlan] = useState(false);
  const { activeWorkspace, cockpit, goldenWorkflow, goldenWorkflowLoadState, publicError, loadGoldenWorkflow } = useMobileSession();
  const fallbackLocale = activeWorkspace?.defaultLocale === "en-CA" ? "en-CA" : "fr-CA";
  const copy = mobileProductCopy(goldenWorkflow?.workspace.locale ?? fallbackLocale);

  useEffect(() => {
    if (activeWorkspace) void loadGoldenWorkflow();
  }, [activeWorkspace, loadGoldenWorkflow]);

  if (!goldenWorkflow && goldenWorkflowLoadState === "LOADING") {
    return <Screen><BrandHeader workspace={activeWorkspace?.name} /><Loading label={mobileGoldenWorkflowCopy(fallbackLocale, "cockpit.syncing")} /></Screen>;
  }

  if (!goldenWorkflow) {
    return (
      <Screen>
        <BrandHeader workspace={activeWorkspace?.name} onMore={() => router.push("/more")} moreLabel={copy.tabs.more} />
        <Heading eyebrow={copy.home.eyebrow} title={copy.home.title} body={copy.home.body} />
        {publicError ? <Notice danger>{publicError}</Notice> : null}
        <Card><Empty>{mobileGoldenWorkflowCopy(fallbackLocale, "cockpit.empty")}</Empty></Card>
        <Button icon="sync" accessibilityRole="button" accessibilityLabel={mobileGoldenWorkflowCopy(fallbackLocale, "action.SYNC")} accessibilityState={{ busy: goldenWorkflowLoadState === "LOADING" }} onPress={() => void loadGoldenWorkflow()}>
          {mobileGoldenWorkflowCopy(fallbackLocale, "action.SYNC")}
        </Button>
      </Screen>
    );
  }

  const locale = goldenWorkflow.workspace.locale;
  const current = goldenWorkflow.steps.find((item) => item.step === goldenWorkflow.currentStep) ?? goldenWorkflow.steps[0];
  const pendingCount = "pendingApprovalCount" in goldenWorkflow ? goldenWorkflow.pendingApprovalCount : 0;
  const appointments = cockpit?.calendar.length ?? 0;
  const openLoops = cockpit?.projects.reduce((count, project) => count + project._count.openLoops, 0) ?? 0;

  return (
    <Screen>
      <BrandHeader workspace={goldenWorkflow.workspace.name} onMore={() => router.push("/more")} moreLabel={copy.tabs.more} />
      <Heading eyebrow={copy.home.eyebrow} title={copy.home.title} body={copy.home.body} />
      {publicError ? <Notice danger>{publicError}</Notice> : null}

      <Card tone="warm" style={styles.askCard}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={copy.talkToEndvera}
          accessibilityHint={copy.home.quickAsk}
          onPress={() => router.push("/assistant")}
          style={({ pressed }) => [styles.askMain, pressed && styles.pressed]}
        >
          <View style={styles.assistantMark}><AppIcon name="assistant" color={colors.accentBright} size={24} /></View>
          <View style={styles.askCopy}>
            <Text style={styles.askTitle}>{copy.home.quickAsk}</Text>
            <Text style={styles.askHint}>{copy.talkToEndvera}</Text>
          </View>
          <AppIcon name="arrow" color={colors.accentBright} size={20} />
        </Pressable>
        <View style={styles.askActions}>
          <Pressable accessibilityRole="button" accessibilityLabel={copy.home.write} onPress={() => router.push("/assistant")} style={({ pressed }) => [styles.askAction, pressed && styles.pressed]}>
            <AppIcon name="assistant" color={colors.text} size={18} />
            <Text style={styles.askActionText}>{copy.home.write}</Text>
          </Pressable>
          <View style={styles.actionDivider} />
          <Pressable accessibilityRole="button" accessibilityLabel={copy.home.speak} onPress={() => router.push("/calls")} style={({ pressed }) => [styles.askAction, pressed && styles.pressed]}>
            <AppIcon name="microphone" color={colors.text} size={18} />
            <Text style={styles.askActionText}>{copy.home.speak}</Text>
          </Pressable>
        </View>
      </Card>

      <View style={styles.metricsRow}>
        <MetricPill icon="calendar" value={appointments} label={copy.home.appointments} />
        <MetricPill icon="review" value={pendingCount} label={copy.home.toReview} />
      </View>
      <View style={styles.metricsRow}>
        <MetricPill icon="projects" value={cockpit?.projects.length ?? 0} label={copy.projectsScreen.active} />
        <MetricPill icon="clock" value={openLoops} label={copy.home.openLoops} />
      </View>

      <SectionHeader title={copy.home.priority} />
      <Card style={styles.priorityCard}>
        <View style={styles.priorityTop}>
          <StatusPill tone={current.status === "BLOCKED" ? "warning" : "accent"}>
            {mobileGoldenWorkflowCopy(locale, `status.${current.status}`)}
          </StatusPill>
          <Text style={styles.progress}>{goldenWorkflow.completedCount}/{goldenWorkflow.totalCount}</Text>
        </View>
        <View style={styles.priorityBody}>
          <View style={styles.priorityLine} />
          <View style={styles.priorityCopy}>
            <Text style={styles.priorityTitle}>{mobileGoldenWorkflowCopy(locale, current.titleKey)}</Text>
            <Text style={sharedStyles.muted}>{mobileGoldenWorkflowCopy(locale, current.bodyKey)}</Text>
          </View>
        </View>
        {current.blockers.map((blocker) => <Notice danger key={blocker.code}>{mobileGoldenWorkflowCopy(locale, blocker.copyKey)}</Notice>)}
        <Button icon="arrow" accessibilityRole="button" accessibilityLabel={mobileGoldenWorkflowCopy(locale, goldenWorkflow.primaryAction.copyKey)} accessibilityHint={mobileGoldenWorkflowCopy(locale, current.bodyKey)} accessibilityState={{ busy: goldenWorkflowLoadState === "LOADING" }} onPress={() => openRoute(goldenWorkflow.primaryAction.route)}>
          {mobileGoldenWorkflowCopy(locale, goldenWorkflow.primaryAction.copyKey)}
        </Button>
      </Card>

      <SectionHeader title={mobileGoldenWorkflowCopy(locale, "cockpit.progress")} action={showPlan ? copy.home.hidePlan : copy.home.fullPlan} onAction={() => setShowPlan((value) => !value)} />
      {showPlan ? (
        <Card tone="flat">
          {goldenWorkflow.steps.map((item) => (
            <View key={item.step} accessible accessibilityRole="summary" accessibilityLabel={`${mobileGoldenWorkflowCopy(locale, item.titleKey)}. ${mobileGoldenWorkflowCopy(locale, `status.${item.status}`)}`} style={styles.planRow}>
              <View style={[styles.stepDot, item.status === "COMPLETE" && styles.stepDotDone]}>
                {item.status === "COMPLETE" ? <AppIcon name="check" color={colors.background} size={13} /> : <Text style={styles.stepNumber}>{item.order}</Text>}
              </View>
              <Text style={styles.planTitle}>{mobileGoldenWorkflowCopy(locale, item.titleKey)}</Text>
              <Text style={item.status === "COMPLETE" ? sharedStyles.success : sharedStyles.subtle}>{mobileGoldenWorkflowCopy(locale, `status.${item.status}`)}</Text>
            </View>
          ))}
        </Card>
      ) : null}

      <Card tone="flat" style={styles.controlCard}>
        <View style={styles.controlIcon}><AppIcon name="shield" color={colors.success} size={20} /></View>
        <View style={styles.controlCopy}>
          <Text style={styles.controlTitle}>{copy.home.controlTitle}</Text>
          <Text style={sharedStyles.muted}>{copy.home.controlBody}</Text>
        </View>
      </Card>
    </Screen>
  );
}

const styles = StyleSheet.create({
  askCard: { padding: 0, overflow: "hidden" },
  askMain: { minHeight: 92, flexDirection: "row", alignItems: "center", gap: 13, paddingHorizontal: 16, paddingVertical: 17 },
  assistantMark: { width: 46, height: 46, borderRadius: 15, alignItems: "center", justifyContent: "center", backgroundColor: colors.accentSoft, borderWidth: 1, borderColor: colors.borderWarm },
  askCopy: { flex: 1, minWidth: 0 },
  askTitle: { color: colors.text, fontSize: 17, lineHeight: 22, fontWeight: "800" },
  askHint: { color: colors.muted, fontSize: 13, marginTop: 3 },
  askActions: { minHeight: 50, flexDirection: "row", alignItems: "center", borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.borderWarm },
  askAction: { minHeight: 50, flex: 1, flexDirection: "row", gap: 8, alignItems: "center", justifyContent: "center" },
  askActionText: { color: colors.text, fontSize: 14, fontWeight: "700" },
  actionDivider: { width: StyleSheet.hairlineWidth, height: 24, backgroundColor: colors.borderWarm },
  metricsRow: { flexDirection: "row", gap: 10 },
  priorityCard: { gap: 15 },
  priorityTop: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  progress: { color: colors.subtle, fontSize: 12, fontWeight: "700" },
  priorityBody: { flexDirection: "row", gap: 14 },
  priorityLine: { width: 4, borderRadius: 2, backgroundColor: colors.accent },
  priorityCopy: { flex: 1, gap: 6 },
  priorityTitle: { color: colors.text, fontSize: 21, lineHeight: 27, fontWeight: "800" },
  planRow: { minHeight: 52, flexDirection: "row", alignItems: "center", gap: 10, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
  stepDot: { width: 25, height: 25, borderRadius: 13, alignItems: "center", justifyContent: "center", backgroundColor: colors.panelStrong, borderWidth: 1, borderColor: colors.border },
  stepDotDone: { backgroundColor: colors.success, borderColor: colors.success },
  stepNumber: { color: colors.muted, fontSize: 11, fontWeight: "800" },
  planTitle: { flex: 1, color: colors.text, fontSize: 14, lineHeight: 19, fontWeight: "600" },
  controlCard: { flexDirection: "row", alignItems: "flex-start", gap: 12 },
  controlIcon: { width: 40, height: 40, borderRadius: 13, alignItems: "center", justifyContent: "center", backgroundColor: "#10271E" },
  controlCopy: { flex: 1, gap: 3 },
  controlTitle: { color: colors.text, fontSize: 15, fontWeight: "800" },
  pressed: { opacity: 0.72 },
});
