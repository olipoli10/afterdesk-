import { Tabs } from "expo-router";
import { Text, type ColorValue } from "react-native";
import { colors } from "@/components/ui";
import { mobileProductCopy } from "@/lib/product-experience";
import { useMobileSession } from "@/state/mobile-session";

function TabGlyph({ value, color }: { value: string; color: ColorValue }) {
  return <Text style={{ color, fontSize: 18 }}>{value}</Text>;
}

export default function AppLayout() {
  const { activeWorkspace } = useMobileSession();
  const copy = mobileProductCopy(activeWorkspace?.defaultLocale);
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.accent,
        tabBarInactiveTintColor: colors.muted,
        tabBarStyle: { backgroundColor: colors.panel, borderTopColor: colors.border },
        sceneStyle: { backgroundColor: colors.background },
      }}
    >
      <Tabs.Screen name="index" options={{ title: copy.tabs.today, tabBarAccessibilityLabel: copy.tabs.today, tabBarIcon: ({ color }) => <TabGlyph value="⌁" color={color} /> }} />
      <Tabs.Screen name="assistant" options={{ title: copy.tabs.assistant, tabBarAccessibilityLabel: copy.tabs.assistant, tabBarIcon: ({ color }) => <TabGlyph value="A2" color={color} /> }} />
      <Tabs.Screen name="projects" options={{ title: copy.tabs.projects, tabBarAccessibilityLabel: copy.tabs.projects, tabBarIcon: ({ color }) => <TabGlyph value="▦" color={color} /> }} />
      <Tabs.Screen name="calendar" options={{ title: copy.tabs.calendar, tabBarAccessibilityLabel: copy.tabs.calendar, tabBarIcon: ({ color }) => <TabGlyph value="◷" color={color} /> }} />
      <Tabs.Screen name="more" options={{ title: copy.tabs.more, tabBarAccessibilityLabel: copy.tabs.more, tabBarIcon: ({ color }) => <TabGlyph value="•••" color={color} /> }} />

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
      <Tabs.Screen name="privacy" options={{ href: null }} />
      <Tabs.Screen name="reliability" options={{ href: null }} />
      <Tabs.Screen name="outbox" options={{ href: null }} />
      <Tabs.Screen name="receivables" options={{ href: null }} />
      <Tabs.Screen name="human-support" options={{ href: null }} />
      <Tabs.Screen name="actions" options={{ href: null }} />
      <Tabs.Screen name="settings" options={{ href: null }} />
    </Tabs>
  );
}
