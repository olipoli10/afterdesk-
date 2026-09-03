import { router } from "expo-router";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import { AppIcon } from "@/components/app-icon";
import { calendarVerificationPresentation, upcomingWorkspaceDays } from "@/lib/calendar-display";
import {
  BrandHeader,
  Button,
  Card,
  Empty,
  Heading,
  Screen,
  StatusPill,
  colors,
  sharedStyles,
} from "@/components/ui";
import { mobileProductCopy, mobileProductLocale } from "@/lib/product-experience";
import { useMobileSession } from "@/state/mobile-session";

function dateKey(value: string, timezone: string, locale: string) {
  return new Intl.DateTimeFormat(locale, {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    timeZone: timezone,
  }).format(new Date(value));
}

function displayDay(value: string, timezone: string, locale: string) {
  return new Intl.DateTimeFormat(locale, {
    weekday: "long",
    month: "long",
    day: "numeric",
    timeZone: timezone,
  }).format(new Date(value));
}

function displayTime(value: string, timezone: string, locale: string) {
  return new Intl.DateTimeFormat(locale, {
    hour: "numeric",
    minute: "2-digit",
    timeZone: timezone,
  }).format(new Date(value));
}

export default function CalendarScreen() {
  const { cockpit, activeWorkspace } = useMobileSession();
  const locale = mobileProductLocale(activeWorkspace?.defaultLocale);
  const copy = mobileProductCopy(locale);
  const items = cockpit?.calendar ?? [];
  const timezone = activeWorkspace?.defaultTimezone ?? "America/Toronto";
  const days = upcomingWorkspaceDays(timezone, locale);
  const groups = items.reduce<Record<string, typeof items>>((result, item) => {
    const key = dateKey(item.startsAt, item.timezone, locale);
    result[key] = [...(result[key] ?? []), item];
    return result;
  }, {});

  return (
    <Screen>
      <BrandHeader workspace={activeWorkspace?.name} onMore={() => router.push("/more")} moreLabel={copy.tabs.more} />
      <Heading eyebrow={copy.calendarScreen.eyebrow} title={copy.calendarScreen.title} body={copy.calendarScreen.body} />

      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.dayStrip}>
        {days.map((day, index) => (
          <View key={day.key} style={[styles.day, index === 0 && styles.dayActive]}>
            <Text style={[styles.dayName, index === 0 && styles.dayNameActive]}>
              {day.weekday}
            </Text>
            <Text style={[styles.dayNumber, index === 0 && styles.dayNumberActive]}>{day.dayNumber}</Text>
            {index === 0 ? <View style={styles.todayDot} /> : null}
          </View>
        ))}
      </ScrollView>

      <Button icon="assistant" accessibilityRole="button" accessibilityLabel={copy.calendarScreen.add} onPress={() => router.push("/assistant")}>
        {copy.calendarScreen.add}
      </Button>

      {items.length ? (
        Object.values(groups).map((group) => (
          <View key={dateKey(group[0].startsAt, group[0].timezone, locale)} style={styles.group}>
            <Text style={styles.groupTitle}>{displayDay(group[0].startsAt, group[0].timezone, locale)}</Text>
            <Card style={styles.eventsCard}>
              {group.map((item, index) => {
                const verification = calendarVerificationPresentation(item.verificationState.toLowerCase());
                const status =
                  verification === "verified"
                    ? { label: copy.calendarScreen.verified, tone: "success" as const }
                    : verification === "proposed"
                      ? { label: copy.calendarScreen.needsReview, tone: "warning" as const }
                      : verification === "rejected"
                        ? { label: copy.calendarScreen.rejected, tone: "danger" as const }
                        : { label: copy.calendarScreen.unknown, tone: "danger" as const };
                return (
                  <View key={item.id} style={[styles.event, index < group.length - 1 && styles.eventDivider]}>
                    <View style={styles.timeColumn}>
                      <Text style={styles.time}>{displayTime(item.startsAt, item.timezone, locale)}</Text>
                      <View style={[styles.eventDot, verification !== "verified" && styles.eventDotUnverified]} />
                    </View>
                    <View style={styles.eventCopy}>
                      <Text style={styles.eventTitle}>
                        {"title" in item && typeof item.title === "string" ? item.title : item.project?.name ?? copy.calendarScreen.title}
                      </Text>
                      <Text style={sharedStyles.muted}>{[item.project?.code, item.contact?.displayName].filter(Boolean).join(" · ")}</Text>
                      <StatusPill tone={status.tone}>{status.label}</StatusPill>
                    </View>
                  </View>
                );
              })}
            </Card>
          </View>
        ))
      ) : (
        <Card style={styles.emptyCard}>
          <View style={styles.emptyIcon}><AppIcon name="calendar" color={colors.accentBright} size={28} /></View>
          <Empty>{copy.calendarScreen.empty}</Empty>
        </Card>
      )}

      <View style={styles.connectorNote}>
        <AppIcon name="sync" color={colors.subtle} size={17} />
        <Text style={styles.connectorText}>{copy.calendarScreen.connector}</Text>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  dayStrip: { gap: 9, paddingRight: 20 },
  day: { width: 58, height: 72, borderRadius: 18, alignItems: "center", justifyContent: "center", backgroundColor: colors.panel, borderWidth: 1, borderColor: colors.border },
  dayActive: { backgroundColor: colors.accent, borderColor: colors.accent },
  dayName: { color: colors.muted, fontSize: 11, fontWeight: "700", textTransform: "uppercase" },
  dayNameActive: { color: "#351809" },
  dayNumber: { color: colors.text, fontSize: 21, fontWeight: "800", marginTop: 2 },
  dayNumberActive: { color: "#160C05" },
  todayDot: { width: 4, height: 4, borderRadius: 2, backgroundColor: "#351809", marginTop: 3 },
  group: { gap: 10 },
  groupTitle: { color: colors.text, fontSize: 17, fontWeight: "800", textTransform: "capitalize" },
  eventsCard: { paddingVertical: 4 },
  event: { minHeight: 94, flexDirection: "row", gap: 15, paddingVertical: 15 },
  eventDivider: { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
  timeColumn: { width: 65, alignItems: "flex-end", paddingTop: 2 },
  time: { color: colors.text, fontSize: 14, fontWeight: "800" },
  eventDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.success, marginTop: 10 },
  eventDotUnverified: { backgroundColor: colors.warning },
  eventCopy: { flex: 1, gap: 6 },
  eventTitle: { color: colors.text, fontSize: 17, lineHeight: 22, fontWeight: "700" },
  emptyCard: { minHeight: 170, alignItems: "center", justifyContent: "center" },
  emptyIcon: { width: 58, height: 58, borderRadius: 20, alignItems: "center", justifyContent: "center", backgroundColor: colors.panelWarm, marginBottom: 3 },
  connectorNote: { flexDirection: "row", alignItems: "flex-start", gap: 9, paddingHorizontal: 4 },
  connectorText: { flex: 1, color: colors.subtle, fontSize: 12, lineHeight: 17 },
});
