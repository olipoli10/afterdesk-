import { router } from "expo-router";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { AppIcon } from "@/components/app-icon";
import { BrandHeader, Button, Card, Heading, Notice, Screen, colors, sharedStyles } from "@/components/ui";
import { TEXT_ASSIST_FOUNDATION } from "@/lib/text-assist-foundation";
import { VIRTUAL_SECRETARY_ACTIONS } from "@/lib/virtual-secretary-actions";
import { useMobileSession } from "@/state/mobile-session";

export default function TextAssistSetupScreen() {
  const { activeWorkspace } = useMobileSession();

  const openCapability = (action: (typeof VIRTUAL_SECRETARY_ACTIONS)[number]) => {
    if (action.entry.kind === "ASSISTANT_PROMPT") {
      router.push({ pathname: "/assistant", params: { prompt: action.entry.value } });
      return;
    }
    router.push(action.entry.value as never);
  };

  return (
    <Screen>
      <BrandHeader workspace={activeWorkspace?.name} />
      <Heading
        eyebrow="TON ASSISTANT ENDVERA"
        title="Texte. Parle. ENDVERA s’occupe du reste."
        body="Connecte seulement ce qui t’est utile. ENDVERA garde le contexte, choisit le bon outil et te montre toute action sensible avant de l’exécuter."
      />

      <Button onPress={() => router.push(TEXT_ASSIST_FOUNDATION.actions.assistant.route as never)}>
        {TEXT_ASSIST_FOUNDATION.actions.assistant.label}
      </Button>
      <Button
        tone="secondary"
        onPress={() => router.push(TEXT_ASSIST_FOUNDATION.actions.permissions.route as never)}
      >
        {TEXT_ASSIST_FOUNDATION.actions.permissions.label}
      </Button>

      <Card style={styles.heroCard}>
        <View style={styles.titleRow}>
          <View style={styles.icon}><AppIcon name="assistant" color={colors.accentBright} size={24} /></View>
          <View style={styles.flex}>
            <Text style={sharedStyles.name}>{TEXT_ASSIST_FOUNDATION.sms.title}</Text>
            <Text style={styles.status}>{TEXT_ASSIST_FOUNDATION.sms.readiness}</Text>
          </View>
        </View>
        <Text style={sharedStyles.muted}>{TEXT_ASSIST_FOUNDATION.sms.detail}</Text>
        <Text style={styles.status}>{TEXT_ASSIST_FOUNDATION.sms.number ?? "Aucun numéro attribué pour l’instant"}</Text>
        <Notice>Aucun accès à l’historique de tes textos ou appels.</Notice>
      </Card>

      <Card>
        <Text style={sharedStyles.name}>{TEXT_ASSIST_FOUNDATION.gateway.title}</Text>
        <Text style={sharedStyles.muted}>{TEXT_ASSIST_FOUNDATION.gateway.detail}</Text>
        <Text style={styles.status}>{TEXT_ASSIST_FOUNDATION.gateway.candidate} · {TEXT_ASSIST_FOUNDATION.gateway.readiness}</Text>
      </Card>

      <Text style={styles.sectionTitle}>TA SECRÉTAIRE PEUT</Text>
      {VIRTUAL_SECRETARY_ACTIONS.map((action) => (
        <Pressable
          key={action.key}
          accessibilityRole="button"
          accessibilityLabel={`${action.entry.label}: ${action.title}`}
          onPress={() => openCapability(action)}
          style={({ pressed }) => [styles.capabilityCard, pressed && styles.pressed]}
        >
          <View style={styles.flex}>
            <Text style={sharedStyles.name}>{action.title}</Text>
            <Text style={sharedStyles.value}>« {action.example} »</Text>
            <Text style={styles.status}>{action.readiness}</Text>
            <View style={styles.actionRow}>
              <Text style={styles.actionLabel}>{action.entry.label}</Text>
              <AppIcon name="arrow" color={colors.accentBright} size={17} />
            </View>
          </View>
        </Pressable>
      ))}

      <Text style={styles.sectionTitle}>COMMENT ÇA MARCHE</Text>
      <Card>
        {TEXT_ASSIST_FOUNDATION.loop.map((step, index) => (
          <View key={step} style={styles.step}>
            <View style={styles.stepNumber}><Text style={styles.stepNumberText}>{index + 1}</Text></View>
            <Text style={styles.stepText}>{step}</Text>
          </View>
        ))}
      </Card>

      <Text style={styles.sectionTitle}>CONNECTE TES OUTILS</Text>
      {TEXT_ASSIST_FOUNDATION.permissions.map((permission) => (
        <Pressable
          key={permission.key}
          accessibilityRole="link"
          accessibilityLabel={`Configurer ${permission.title}`}
          onPress={() => router.push(permission.route as never)}
          style={({ pressed }) => [styles.permission, pressed && styles.pressed]}
        >
          <View style={styles.flex}>
            <Text style={sharedStyles.name}>{permission.title}</Text>
            <Text style={sharedStyles.muted}>{permission.detail}</Text>
          </View>
          <AppIcon name="arrow" color={colors.accentBright} size={18} />
        </Pressable>
      ))}

      <Notice>Chaque permission est demandée seulement au moment de l’utiliser et peut être retirée.</Notice>
    </Screen>
  );
}

const styles = StyleSheet.create({
  heroCard: { borderColor: colors.borderWarm, backgroundColor: colors.panelWarm },
  capabilityCard: { padding: 16, borderRadius: 18, backgroundColor: colors.panel, borderWidth: 1, borderColor: colors.border },
  titleRow: { flexDirection: "row", alignItems: "center", gap: 12 },
  icon: { width: 48, height: 48, borderRadius: 16, alignItems: "center", justifyContent: "center", backgroundColor: colors.accentSoft },
  flex: { flex: 1, gap: 4 },
  status: { color: colors.accentBright, fontSize: 12, lineHeight: 17, fontWeight: "800" },
  actionRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingTop: 6 },
  actionLabel: { color: colors.text, fontSize: 14, lineHeight: 19, fontWeight: "800" },
  sectionTitle: { color: colors.muted, fontSize: 12, lineHeight: 17, fontWeight: "800", letterSpacing: 1.6 },
  step: { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 7 },
  stepNumber: { width: 30, height: 30, borderRadius: 15, alignItems: "center", justifyContent: "center", backgroundColor: colors.accentSoft },
  stepNumberText: { color: colors.accentBright, fontWeight: "900" },
  stepText: { flex: 1, color: colors.text, fontSize: 15, lineHeight: 21, fontWeight: "600" },
  permission: { minHeight: 78, flexDirection: "row", alignItems: "center", gap: 12, padding: 16, borderRadius: 18, backgroundColor: colors.panel, borderWidth: 1, borderColor: colors.border },
  pressed: { opacity: 0.68 },
});
