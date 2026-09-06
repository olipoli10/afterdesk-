import { Tabs } from "expo-router";
import { Platform, StyleSheet, View, type ColorValue } from "react-native";
import { AppIcon, type AppIconName } from "@/components/app-icon";
import { colors } from "@/components/ui";
import { preparedActionInspections } from "@/lib/prepared-actions";
import { mobileProductCopy } from "@/lib/product-experience";
import { useMobileSession } from "@/state/mobile-session";

function TabIcon({
  name,
  color,
  focused,
  emphasized = false,
}: {
  name: AppIconName;
  color: ColorValue;
  focused: boolean;
  emphasized?: boolean;
}) {
  return (
    <View
      style={[
        styles.tabIcon,
        focused && !emphasized && styles.tabIconActive,
        emphasized && styles.tabIconAssistant,
        emphasized && focused && styles.tabIconAssistantActive,
      ]}
    >
      <AppIcon
        name={name}
        color={emphasized && focused ? "#160C05" : emphasized ? colors.accentBright : color}
        size={emphasized ? 24 : 22}
      />
    </View>
  );
}

const TodayTabIcon = ({ color, focused }: { color: ColorValue; focused: boolean }) => <TabIcon name="today" color={color} focused={focused} />;
const ProjectsTabIcon = ({ color, focused }: { color: ColorValue; focused: boolean }) => <TabIcon name="projects" color={color} focused={focused} />;
const AssistantTabIcon = ({ color, focused }: { color: ColorValue; focused: boolean }) => <TabIcon name="assistant" color={color} focused={focused} emphasized />;
const CalendarTabIcon = ({ color, focused }: { color: ColorValue; focused: boolean }) => <TabIcon name="calendar" color={color} focused={focused} />;
const ReviewTabIcon = ({ color, focused }: { color: ColorValue; focused: boolean }) => <TabIcon name="review" color={color} focused={focused} />;

export default function AppLayout() {
  const { activeWorkspace, cockpit } = useMobileSession();
  const copy = mobileProductCopy(activeWorkspace?.defaultLocale);
  const pendingCount = preparedActionInspections(cockpit?.actions ?? []).filter(
    (action) => action.state === "PREPARED_UNSENT",
  ).length;

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.text,
        tabBarInactiveTintColor: colors.muted,
        tabBarHideOnKeyboard: true,
        tabBarLabelStyle: styles.tabLabel,
        tabBarItemStyle: styles.tabItem,
        tabBarStyle: styles.tabBar,
        sceneStyle: { backgroundColor: colors.background },
      }}
    >
      <Tabs.Screen name="index" options={{ title: copy.tabs.today, tabBarAccessibilityLabel: copy.tabs.today, tabBarIcon: TodayTabIcon }} />
      <Tabs.Screen name="projects" options={{ title: copy.tabs.projects, tabBarAccessibilityLabel: copy.tabs.projects, tabBarIcon: ProjectsTabIcon }} />
      <Tabs.Screen name="assistant" options={{ title: copy.tabs.assistant, tabBarAccessibilityLabel: copy.tabs.assistant, tabBarIcon: AssistantTabIcon }} />
      <Tabs.Screen name="calendar" options={{ title: copy.tabs.calendar, tabBarAccessibilityLabel: copy.tabs.calendar, tabBarIcon: CalendarTabIcon }} />
      <Tabs.Screen name="actions" options={{ title: copy.tabs.review, tabBarAccessibilityLabel: copy.tabs.review, tabBarBadge: pendingCount || undefined, tabBarBadgeStyle: styles.badge, tabBarIcon: ReviewTabIcon }} />

      <Tabs.Screen name="more" options={{ href: null }} />
      <Tabs.Screen name="text-assist" options={{ href: null }} />
      <Tabs.Screen name="onboarding" options={{ href: null }} />
      <Tabs.Screen name="jobs" options={{ href: null }} />
      <Tabs.Screen name="follow-ups" options={{ href: null }} />
      <Tabs.Screen name="timeline" options={{ href: null }} />
      <Tabs.Screen name="provenance" options={{ href: null }} />
      <Tabs.Screen name="calendar-connections" options={{ href: null }} />
      <Tabs.Screen name="messages" options={{ href: null }} />
      <Tabs.Screen name="calls" options={{ href: null }} />
      <Tabs.Screen name="email" options={{ href: null }} />
      <Tabs.Screen name="accounting" options={{ href: null }} />
      <Tabs.Screen name="contacts" options={{ href: null }} />
      <Tabs.Screen name="evidence" options={{ href: null }} />
      <Tabs.Screen name="permissions" options={{ href: null }} />
      <Tabs.Screen name="device-access" options={{ href: null }} />
      <Tabs.Screen name="privacy" options={{ href: null }} />
      <Tabs.Screen name="reliability" options={{ href: null }} />
      <Tabs.Screen name="outbox" options={{ href: null }} />
      <Tabs.Screen name="receivables" options={{ href: null }} />
      <Tabs.Screen name="human-support" options={{ href: null }} />
      <Tabs.Screen name="settings" options={{ href: null }} />
      <Tabs.Screen name="project-brain-intake" options={{ href: null }} />
      <Tabs.Screen name="project-brain-understanding-review" options={{ href: null }} />
    </Tabs>
  );
}

const styles = StyleSheet.create({
  tabBar: {
    position: "absolute",
    height: Platform.OS === "ios" ? 86 : 74,
    paddingTop: 8,
    paddingBottom: Platform.OS === "ios" ? 22 : 8,
    backgroundColor: "#111317F2",
    borderTopColor: colors.border,
    borderTopWidth: StyleSheet.hairlineWidth,
    elevation: 18,
  },
  tabItem: { paddingTop: 1 },
  tabLabel: { fontSize: 11, fontWeight: "700", marginTop: 1 },
  tabIcon: { width: 38, height: 32, alignItems: "center", justifyContent: "center", borderRadius: 14 },
  tabIconActive: { backgroundColor: colors.panelStrong },
  tabIconAssistant: {
    width: 48,
    height: 48,
    borderRadius: 24,
    marginTop: -15,
    backgroundColor: colors.panelStrong,
    borderWidth: 3,
    borderColor: colors.accent,
  },
  tabIconAssistantActive: {
    backgroundColor: colors.accent,
    borderWidth: 4,
    borderColor: colors.background,
  },
  badge: { backgroundColor: colors.danger, color: "#190B08", fontWeight: "800", fontSize: 10 },
});
