import { Tabs } from "expo-router";
import { Text, type ColorValue } from "react-native";
import { colors } from "@/components/ui";

function TabGlyph({ value, color }: { value: string; color: ColorValue }) {
  return <Text style={{ color, fontSize: 18 }}>{value}</Text>;
}

export default function AppLayout() {
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
      <Tabs.Screen name="index" options={{ title: "Aujourd’hui", tabBarIcon: ({ color }) => <TabGlyph value="⌁" color={color} /> }} />
      <Tabs.Screen name="assistant" options={{ title: "Assistant", tabBarIcon: ({ color }) => <TabGlyph value="A2" color={color} /> }} />
      <Tabs.Screen name="projects" options={{ title: "Chantiers", tabBarIcon: ({ color }) => <TabGlyph value="▦" color={color} /> }} />
      <Tabs.Screen name="timeline" options={{ title: "Timeline", tabBarIcon: ({ color }) => <TabGlyph value="≡" color={color} /> }} />
      <Tabs.Screen name="calendar" options={{ title: "Agenda", tabBarIcon: ({ color }) => <TabGlyph value="◷" color={color} /> }} />
      <Tabs.Screen name="contacts" options={{ title: "Contacts", tabBarIcon: ({ color }) => <TabGlyph value="◎" color={color} /> }} />
      <Tabs.Screen name="evidence" options={{ title: "Preuves", tabBarIcon: ({ color }) => <TabGlyph value="＋" color={color} /> }} />
      <Tabs.Screen name="receivables" options={{ title: "À recevoir", tabBarIcon: ({ color }) => <TabGlyph value="$" color={color} /> }} />
      <Tabs.Screen name="actions" options={{ title: "Actions", tabBarIcon: ({ color }) => <TabGlyph value="✓" color={color} /> }} />
      <Tabs.Screen name="settings" options={{ title: "Compte", tabBarIcon: ({ color }) => <TabGlyph value="•" color={color} /> }} />
    </Tabs>
  );
}
