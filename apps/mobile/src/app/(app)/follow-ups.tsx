import { useEffect } from "react";
import { StyleSheet, Text, View } from "react-native";
import {
  Button,
  Card,
  Empty,
  Heading,
  Label,
  Loading,
  Notice,
  Screen,
  colors,
  sharedStyles,
} from "@/components/ui";
import type { MobileFollowUpCommand, MobileFollowUpQueue } from "@/lib/follow-ups";
import { useMobileSession } from "@/state/mobile-session";

type OwnerQueue = Extract<MobileFollowUpQueue, { role: "OWNER" | "OFFICE_MANAGER" }>;
type OwnerFollowUp = OwnerQueue["followUps"][number];

const STATUS_LABEL: Record<string, string> = {
  SCHEDULED: "Planifié",
  PREPARED_UNSENT: "Préparé, non envoyé",
  READY_FOR_REVIEW: "À vérifier",
  AWAITING_RESPONSE: "Réponse attendue",
  ESCALATED: "Escaladé",
  DECISION_REQUIRED: "Décision requise",
  COMPLETED: "Terminé",
  CANCELLED: "Annulé",
};

function dueLabel(value: string) {
  return new Intl.DateTimeFormat("fr-CA", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

function outcomeCommand(
  workspaceId: string,
  followUp: OwnerFollowUp,
  outcome: "RESOLVED" | "NO_RESPONSE",
): MobileFollowUpCommand | null {
  const attempt = [...followUp.attempts]
    .reverse()
    .find((candidate) => candidate.resolvedAt === null);
  if (!attempt) return null;
  return {
    schemaVersion: 1,
    commandId: globalThis.crypto.randomUUID(),
    workspaceId,
    followUpId: followUp.id,
    expectedVersion: followUp.version,
    action: "RECORD_OUTCOME",
    attemptId: attempt.id,
    outcome,
    occurredAt: new Date().toISOString(),
  };
}

export default function FollowUpsScreen() {
  const {
    activeWorkspace,
    followUpQueue,
    followUpQueueLoadState,
    publicError,
    loadFollowUpQueue,
    submitFollowUpCommand,
  } = useMobileSession();

  useEffect(() => {
    if (followUpQueueLoadState === "IDLE") void loadFollowUpQueue();
  }, [followUpQueueLoadState, loadFollowUpQueue]);

  return (
    <Screen>
      <Heading
        eyebrow="RESPONSABILITÉ"
        title="Suivis"
        body="ENDVERA garde le prochain responsable, prépare l’action et escalade les silences. Rien n’est envoyé à l’extérieur depuis cet écran."
      />
      {followUpQueueLoadState === "LOADING" ? <Loading label="Suivis en reconstruction…" /> : null}
      {publicError ? <Notice danger>{publicError}</Notice> : null}
      {followUpQueue?.followUps.length ? followUpQueue.followUps.map((followUp) => {
        if (!("target" in followUp)) {
          return (
            <Card key={followUp.id}>
              <View style={sharedStyles.row}>
                <Label>{followUp.projectCode}</Label>
                <Text style={styles.status}>{STATUS_LABEL[followUp.status] ?? followUp.status}</Text>
              </View>
              <Text style={sharedStyles.name}>{followUp.projectName}</Text>
              <Text style={sharedStyles.muted}>{followUp.contactName}</Text>
              <Text style={sharedStyles.value}>{followUp.nextDecision}</Text>
              <Text style={sharedStyles.muted}>Échéance: {dueLabel(followUp.dueAt)}</Text>
              <Notice>Vue terrain: détails financiers et contenu du message masqués.</Notice>
            </Card>
          );
        }

        const resolved = activeWorkspace
          ? outcomeCommand(activeWorkspace.id, followUp, "RESOLVED")
          : null;
        const noResponse = activeWorkspace
          ? outcomeCommand(activeWorkspace.id, followUp, "NO_RESPONSE")
          : null;
        return (
          <Card key={followUp.id}>
            <View style={sharedStyles.row}>
              <Label>{followUp.projectCode}</Label>
              <Text style={styles.status}>{STATUS_LABEL[followUp.status] ?? followUp.status}</Text>
            </View>
            <Text style={sharedStyles.name}>{followUp.target.label}</Text>
            <Text style={sharedStyles.muted}>{followUp.projectName} · {followUp.contactName}</Text>
            <Text style={sharedStyles.value}>{followUp.nextDecision}</Text>
            <Text style={sharedStyles.muted}>
              Responsable: {followUp.owner.displayName} · Échéance: {dueLabel(followUp.dueAt)}
            </Text>
            <Text style={sharedStyles.muted}>
              Tentative {followUp.attempt}/{followUp.policy.maxAttempts} · {followUp.channel}
            </Text>
            {followUp.status === "DECISION_REQUIRED" ? (
              <Notice danger>Les tentatives prévues sont épuisées. Une décision humaine est requise.</Notice>
            ) : null}
            {resolved && noResponse ? (
              <View style={styles.actions}>
                <Button
                  disabled={followUpQueueLoadState === "LOADING"}
                  onPress={() => void submitFollowUpCommand(resolved)}
                >
                  Réponse obtenue
                </Button>
                <Button
                  tone="secondary"
                  disabled={followUpQueueLoadState === "LOADING"}
                  onPress={() => void submitFollowUpCommand(noResponse)}
                >
                  Aucune réponse
                </Button>
              </View>
            ) : null}
            <Notice>Aucun envoi externe.</Notice>
          </Card>
        );
      }) : followUpQueueLoadState === "READY" ? (
        <Card><Empty>Aucun suivi actif dans cet espace.</Empty></Card>
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  status: { color: colors.success, fontSize: 13, fontWeight: "800" },
  actions: { gap: 10 },
});
