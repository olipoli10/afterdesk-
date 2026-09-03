import { router } from "expo-router";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { AppIcon } from "@/components/app-icon";
import {
  BrandHeader,
  Card,
  Empty,
  Heading,
  MetricPill,
  Screen,
  StatusPill,
  colors,
  sharedStyles,
} from "@/components/ui";
import { mobileProductCopy } from "@/lib/product-experience";
import { useMobileSession } from "@/state/mobile-session";

export default function ProjectsScreen() {
  const { cockpit, activeWorkspace } = useMobileSession();
  const copy = mobileProductCopy(activeWorkspace?.defaultLocale);
  const projects = cockpit?.projects ?? [];
  const attentionCount = projects.filter((project) => project._count.openLoops > 0).length;

  return (
    <Screen>
      <BrandHeader workspace={activeWorkspace?.name} onMore={() => router.push("/more")} moreLabel={copy.tabs.more} />
      <Heading eyebrow={copy.projectsScreen.eyebrow} title={copy.projectsScreen.title} body={copy.projectsScreen.body} />

      <View style={styles.metrics}>
        <MetricPill icon="projects" value={projects.length} label={copy.projectsScreen.active} />
        <MetricPill icon="warning" value={attentionCount} label={copy.projectsScreen.needsAttention} />
      </View>

      {!activeWorkspace ? (
        <Card><Empty>{copy.assistantNoWorkspace}</Empty></Card>
      ) : projects.length ? (
        <View style={styles.list}>
          {projects.map((project) => {
            const needsAttention = project._count.openLoops > 0;
            return (
              <Pressable
                key={project.id}
                accessibilityRole="button"
                accessibilityLabel={`${copy.projectsScreen.open}: ${project.name}`}
                onPress={() => router.push({ pathname: "/timeline", params: { projectId: project.id } })}
                style={({ pressed }) => [pressed && styles.pressed]}
              >
                <Card style={styles.projectCard}>
                  <View style={[styles.statusRail, needsAttention ? styles.statusRailWarning : styles.statusRailGood]} />
                  <View style={styles.projectContent}>
                    <View style={styles.projectTop}>
                      <View style={styles.projectIdentity}>
                        <Text style={styles.code}>{project.code}</Text>
                        <Text style={styles.name}>{project.name}</Text>
                      </View>
                      <StatusPill tone={needsAttention ? "warning" : "success"}>
                        {needsAttention ? copy.projectsScreen.needsAttention : copy.projectsScreen.upToDate}
                      </StatusPill>
                    </View>
                    <View style={styles.counts}>
                      <View style={styles.count}>
                        <AppIcon name="contact" color={colors.muted} size={17} />
                        <Text style={sharedStyles.muted}>{project._count.contacts} {copy.projectsScreen.contacts}</Text>
                      </View>
                      <View style={styles.count}>
                        <AppIcon name="calendar" color={colors.muted} size={17} />
                        <Text style={sharedStyles.muted}>{project._count.calendarItems} {copy.projectsScreen.appointments}</Text>
                      </View>
                      <View style={styles.count}>
                        <AppIcon name="clock" color={needsAttention ? colors.warning : colors.muted} size={17} />
                        <Text style={[sharedStyles.muted, needsAttention && styles.warningText]}>{project._count.openLoops} {copy.projectsScreen.openLoops}</Text>
                      </View>
                    </View>
                    <View style={styles.openRow}>
                      <Text style={styles.openText}>{copy.projectsScreen.open}</Text>
                      <AppIcon name="arrow" color={colors.accentBright} size={18} />
                    </View>
                  </View>
                </Card>
              </Pressable>
            );
          })}
        </View>
      ) : (
        <Card><Empty>{copy.projectsScreen.empty}</Empty></Card>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  metrics: { flexDirection: "row", gap: 10 },
  list: { gap: 13 },
  projectCard: { flexDirection: "row", padding: 0, overflow: "hidden", gap: 0 },
  statusRail: { width: 5, alignSelf: "stretch" },
  statusRailWarning: { backgroundColor: colors.warning },
  statusRailGood: { backgroundColor: colors.success },
  projectContent: { flex: 1, padding: 17, gap: 15 },
  projectTop: { flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between", gap: 10 },
  projectIdentity: { flex: 1, minWidth: 0, gap: 4 },
  code: { color: colors.accentBright, fontSize: 11, fontWeight: "800", letterSpacing: 1.2 },
  name: { color: colors.text, fontSize: 20, lineHeight: 25, fontWeight: "800" },
  counts: { gap: 9 },
  count: { flexDirection: "row", alignItems: "center", gap: 9 },
  warningText: { color: colors.warning },
  openRow: { minHeight: 40, flexDirection: "row", alignItems: "center", justifyContent: "space-between", borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border, paddingTop: 12 },
  openText: { color: colors.text, fontSize: 14, fontWeight: "700" },
  pressed: { opacity: 0.72, transform: [{ scale: 0.995 }] },
});
