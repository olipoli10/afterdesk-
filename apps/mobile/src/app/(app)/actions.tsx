import { useState } from "react";
import { StyleSheet, Text, TextInput, View } from "react-native";
import {
  Button,
  Card,
  Empty,
  Heading,
  Label,
  Notice,
  Screen,
  colors,
  sharedStyles,
} from "@/components/ui";
import {
  createPreparedActionAttempt,
  preparedActionInspections,
  type MobilePreparedActionInspection,
  type PreparedActionAttempt,
} from "@/lib/prepared-actions";
import { useMobileSession } from "@/state/mobile-session";

function stateLabel(attempt: PreparedActionAttempt | null) {
  if (!attempt) return null;
  if (attempt.state === "SENDING") return "Décision en cours…";
  if (attempt.state === "REPLAYED") return "Décision déjà appliquée; aucun doublon.";
  if (attempt.state === "CONFIRMED") return "Décision enregistrée; aucun message envoyé.";
  if (attempt.state === "CONFLICT") return "L’action avait changé; la version actuelle a été rechargée.";
  if (attempt.state === "OUTCOME_UNKNOWN") return "Résultat inconnu — réessaie exactement la même décision.";
  if (attempt.state === "REFUSED") return "Décision refusée sans envoi.";
  return null;
}

function PreparedActionCard({
  action,
  busy,
  onDecision,
}: {
  action: MobilePreparedActionInspection;
  busy: boolean;
  onDecision: (
    action: MobilePreparedActionInspection,
    decision: "APPROVE" | "REJECT" | "REVOKE",
    reason?: string,
  ) => Promise<void>;
}) {
  const [reason, setReason] = useState("");
  const prepared = action.state === "PREPARED_UNSENT";
  return (
    <Card>
      <View style={sharedStyles.row}>
        <Label>{action.state}</Label>
        <Text style={sharedStyles.muted}>Version {action.version}</Text>
      </View>
      <Text style={sharedStyles.name}>{action.project?.name ?? "Action générale"}</Text>
      <Text style={styles.caption}>Destinataire</Text>
      <Text selectable style={sharedStyles.value}>
        {action.contact?.displayName ?? "Contact"} — {action.recipient}
      </Text>
      <Text style={styles.caption}>Canal</Text>
      <Text style={sharedStyles.value}>{action.channel}</Text>
      <Text style={styles.caption}>Texte exact</Text>
      <Text selectable style={styles.body}>{action.body}</Text>
      <Text style={styles.caption}>Preuve de la version</Text>
      <Text selectable style={styles.fingerprint}>{action.fingerprint}</Text>
      <Text style={sharedStyles.muted}>
        Source {action.provenance.channel} · {action.provenance.sourceMessageId}
      </Text>
      {prepared ? (
        <>
          <Button disabled={busy} onPress={() => onDecision(action, "APPROVE")}>
            Approuver exactement ce message
          </Button>
          <TextInput
            style={styles.input}
            value={reason}
            onChangeText={setReason}
            placeholder="Pourquoi refuser?"
            placeholderTextColor={colors.muted}
            maxLength={500}
            editable={!busy}
          />
          <Button
            tone="secondary"
            disabled={busy || !reason.trim()}
            onPress={() => onDecision(action, "REJECT", reason)}
          >
            Refuser ce message
          </Button>
        </>
      ) : (
        <>
          <Notice>Approuvé, mais toujours non envoyé.</Notice>
          <TextInput
            style={styles.input}
            value={reason}
            onChangeText={setReason}
            placeholder="Pourquoi révoquer?"
            placeholderTextColor={colors.muted}
            maxLength={500}
            editable={!busy}
          />
          <Button
            tone="secondary"
            disabled={busy || !reason.trim()}
            onPress={() => onDecision(action, "REVOKE", reason)}
          >
            Révoquer l’approbation
          </Button>
        </>
      )}
    </Card>
  );
}

export default function ActionsScreen() {
  const {
    cockpit,
    activeWorkspace,
    latestPreparedActionAttempt,
    publicError,
    submitPreparedActionAttempt,
  } = useMobileSession();
  const actions = preparedActionInspections(cockpit?.actions ?? []);
  const busy = latestPreparedActionAttempt?.state === "SENDING";
  const label = stateLabel(latestPreparedActionAttempt);

  if (activeWorkspace?.role === "FIELD_WORKER") {
    return (
      <Screen>
        <Heading
          eyebrow="CONTRÔLE HUMAIN"
          title="Actions protégées"
          body="Les destinataires, messages et décisions sont réservés au propriétaire et au gestionnaire de bureau."
        />
        <Card>
          <Empty>Aucune donnée de communication sensible n’est exposée au rôle chantier.</Empty>
        </Card>
      </Screen>
    );
  }

  const decide = async (
    action: MobilePreparedActionInspection,
    decision: "APPROVE" | "REJECT" | "REVOKE",
    reason?: string,
  ) => {
    if (!activeWorkspace) return;
    const attempt = createPreparedActionAttempt({
      workspace: activeWorkspace,
      action,
      decision,
      reason,
    });
    await submitPreparedActionAttempt(attempt);
  };

  const retry = async () => {
    if (latestPreparedActionAttempt?.state !== "OUTCOME_UNKNOWN") return;
    await submitPreparedActionAttempt(latestPreparedActionAttempt);
  };

  return (
    <Screen>
      <Heading
        eyebrow="CONTRÔLE HUMAIN"
        title="Actions préparées"
        body="Vérifie le destinataire, le canal et le texte exact avant de décider. Une approbation n’envoie rien."
      />
      <Card>
        <Label>Sécurité</Label>
        <Text style={sharedStyles.success}>
          Transport externe désactivé — zéro SMS, courriel ou appel.
        </Text>
      </Card>
      {publicError ? <Notice danger>{publicError}</Notice> : null}
      {label ? (
        <Notice
          danger={["CONFLICT", "OUTCOME_UNKNOWN", "REFUSED"].includes(
            latestPreparedActionAttempt?.state ?? "",
          )}
        >
          {label}
        </Notice>
      ) : null}
      {latestPreparedActionAttempt?.state === "OUTCOME_UNKNOWN" ? (
        <Button tone="secondary" onPress={retry}>Réessayer la même décision</Button>
      ) : null}
      {actions.length ? (
        actions.map((action) => (
          <PreparedActionCard
            key={action.actionId}
            action={action}
            busy={busy}
            onDecision={decide}
          />
        ))
      ) : (
        <Card><Empty>Aucune action préparée.</Empty></Card>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  caption: {
    color: colors.muted,
    fontSize: 12,
    fontWeight: "700",
    textTransform: "uppercase",
  },
  body: {
    color: colors.text,
    fontSize: 16,
    lineHeight: 23,
    backgroundColor: colors.panelStrong,
    padding: 14,
    borderRadius: 12,
  },
  fingerprint: { color: colors.muted, fontSize: 11, lineHeight: 16 },
  input: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.panelStrong,
    color: colors.text,
    padding: 12,
    fontSize: 15,
  },
});
