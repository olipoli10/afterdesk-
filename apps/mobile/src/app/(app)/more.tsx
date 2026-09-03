import { router } from "expo-router";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { AppIcon, type AppIconName } from "@/components/app-icon";
import { BrandHeader, Card, Heading, Screen, colors } from "@/components/ui";
import { mobileProductCopy } from "@/lib/product-experience";
import { useMobileSession } from "@/state/mobile-session";

const groups = [
  {
    titleKey: "work",
    icon: "projects",
    routes: [
      ["onboarding", "/onboarding"], ["jobs", "/jobs"], ["followUps", "/follow-ups"],
      ["timeline", "/timeline"], ["provenance", "/provenance"], ["evidence", "/evidence"],
    ],
  },
  {
    titleKey: "communications",
    icon: "assistant",
    routes: [
      ["calendarConnections", "/calendar-connections"], ["messages", "/messages"],
      ["calls", "/calls"], ["email", "/email"], ["contacts", "/contacts"],
    ],
  },
  {
    titleKey: "money",
    icon: "money",
    routes: [
      ["accounting", "/accounting"], ["receivables", "/receivables"], ["outbox", "/outbox"],
    ],
  },
  {
    titleKey: "trust",
    icon: "shield",
    routes: [
      ["permissions", "/permissions"], ["privacy", "/privacy"],
      ["reliability", "/reliability"], ["humanSupport", "/human-support"], ["settings", "/settings"],
    ],
  },
] as const;

export default function MoreScreen() {
  const { activeWorkspace } = useMobileSession();
  const copy = mobileProductCopy(activeWorkspace?.defaultLocale);

  return (
    <Screen>
      <BrandHeader workspace={activeWorkspace?.name} />
      <Heading eyebrow="ENDVERA" title={copy.moreTitle} body={copy.moreBody} />
      {groups.map((group) => (
        <Card key={group.titleKey} style={styles.groupCard}>
          <View style={styles.groupHeader}>
            <View style={styles.groupIcon}><AppIcon name={group.icon as AppIconName} color={colors.accentBright} size={20} /></View>
            <Text style={styles.groupTitle}>{copy.moreGroups[group.titleKey]}</Text>
          </View>
          <View style={styles.list}>
            {group.routes.map(([labelKey, href], index) => (
              <Pressable
                key={href}
                accessibilityRole="link"
                accessibilityLabel={copy.moreRoutes[labelKey]}
                accessibilityHint={copy.moreOpenHint}
                onPress={() => router.push(href as never)}
                style={({ pressed }) => [styles.route, index < group.routes.length - 1 && styles.routeDivider, pressed && styles.pressed]}
              >
                <Text style={styles.routeLabel}>{copy.moreRoutes[labelKey]}</Text>
                <AppIcon name="arrow" color={colors.subtle} size={18} />
              </Pressable>
            ))}
          </View>
        </Card>
      ))}
    </Screen>
  );
}

const styles = StyleSheet.create({
  groupCard: { paddingVertical: 12 },
  groupHeader: { flexDirection: "row", alignItems: "center", gap: 10, paddingBottom: 5 },
  groupIcon: { width: 38, height: 38, borderRadius: 13, alignItems: "center", justifyContent: "center", backgroundColor: colors.accentSoft },
  groupTitle: { color: colors.text, fontSize: 14, fontWeight: "800", letterSpacing: 0.4 },
  list: { gap: 0 },
  route: { minHeight: 52, flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12, paddingVertical: 12, paddingHorizontal: 2 },
  routeDivider: { borderBottomColor: colors.border, borderBottomWidth: StyleSheet.hairlineWidth },
  routeLabel: { flex: 1, color: colors.text, fontSize: 15, lineHeight: 21, fontWeight: "600" },
  pressed: { opacity: 0.62 },
});
