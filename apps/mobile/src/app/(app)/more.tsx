import { router } from "expo-router";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { Card, Heading, Label, Screen, colors, sharedStyles } from "@/components/ui";
import { mobileProductCopy } from "@/lib/product-experience";
import { useMobileSession } from "@/state/mobile-session";

const groups = [
  {
    titleKey: "work",
    routes: [
      ["onboarding", "/onboarding"], ["jobs", "/jobs"], ["followUps", "/follow-ups"],
      ["timeline", "/timeline"], ["provenance", "/provenance"], ["evidence", "/evidence"],
    ],
  },
  {
    titleKey: "communications",
    routes: [
      ["calendarConnections", "/calendar-connections"], ["messages", "/messages"],
      ["calls", "/calls"], ["email", "/email"], ["contacts", "/contacts"],
    ],
  },
  {
    titleKey: "money",
    routes: [
      ["accounting", "/accounting"], ["receivables", "/receivables"],
      ["actions", "/actions"], ["outbox", "/outbox"],
    ],
  },
  {
    titleKey: "trust",
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
      <Heading eyebrow="ENDVERA" title={copy.moreTitle} body={copy.moreBody} />
      {groups.map((group) => (
        <Card key={group.titleKey}>
          <Label>{copy.moreGroups[group.titleKey]}</Label>
          <View style={styles.list}>
            {group.routes.map(([labelKey, href]) => (
              <Pressable
                key={href}
                accessibilityRole="link"
                accessibilityLabel={copy.moreRoutes[labelKey]}
                accessibilityHint={copy.moreOpenHint}
                onPress={() => router.push(href as never)}
                style={({ pressed }) => [styles.route, pressed && styles.pressed]}
              >
                <Text style={sharedStyles.value}>{copy.moreRoutes[labelKey]}</Text>
                <Text aria-hidden style={styles.arrow}>›</Text>
              </Pressable>
            ))}
          </View>
        </Card>
      ))}
    </Screen>
  );
}

const styles = StyleSheet.create({
  list: { gap: 2 },
  route: {
    minHeight: 50,
    borderBottomColor: colors.border,
    borderBottomWidth: StyleSheet.hairlineWidth,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 12,
  },
  pressed: { opacity: 0.65 },
  arrow: { color: colors.accent, fontSize: 28, lineHeight: 30 },
});
