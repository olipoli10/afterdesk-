import { router } from "expo-router";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { Card, Heading, Label, Screen, colors, sharedStyles } from "@/components/ui";

const groups = [
  {
    title: "TRAVAIL",
    routes: [
      ["Démarrage", "/onboarding"], ["Jobs", "/jobs"], ["Suivis", "/follow-ups"],
      ["Timeline", "/timeline"], ["Provenance", "/provenance"], ["Preuves", "/evidence"],
    ],
  },
  {
    title: "COMMUNICATIONS",
    routes: [
      ["Calendriers connectés", "/calendar-connections"], ["Messages", "/messages"],
      ["Appels", "/calls"], ["Courriel", "/email"], ["Contacts", "/contacts"],
    ],
  },
  {
    title: "ARGENT ET ACTIONS",
    routes: [
      ["Comptabilité", "/accounting"], ["Comptes à recevoir", "/receivables"],
      ["Actions à approuver", "/actions"], ["Reprise", "/outbox"],
    ],
  },
  {
    title: "CONFIANCE ET COMPTE",
    routes: [
      ["Permissions", "/permissions"], ["Confidentialité", "/privacy"],
      ["Fiabilité", "/reliability"], ["Appui humain", "/human-support"], ["Réglages", "/settings"],
    ],
  },
] as const;

export default function MoreScreen() {
  return (
    <Screen>
      <Heading eyebrow="ENDVERA" title="Plus" body="Tous les outils restent disponibles, regroupés sans encombrer tes actions principales." />
      {groups.map((group) => (
        <Card key={group.title}>
          <Label>{group.title}</Label>
          <View style={styles.list}>
            {group.routes.map(([label, href]) => (
              <Pressable
                key={href}
                accessibilityRole="link"
                accessibilityLabel={label}
                onPress={() => router.push(href as never)}
                style={({ pressed }) => [styles.route, pressed && styles.pressed]}
              >
                <Text style={sharedStyles.value}>{label}</Text>
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
