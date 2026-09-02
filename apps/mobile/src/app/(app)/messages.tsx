import { useEffect, useMemo, useState } from "react";
import { StyleSheet, Text, TextInput, View } from "react-native";
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
import {
  createConsentAttestationCommand,
  createConsentWithdrawalCommand,
  createPolicyBoundSmsCommand,
  type MobileMessagingPolicy,
} from "@/lib/messages";
import { preparedActionInspections } from "@/lib/prepared-actions";
import { useMobileSession } from "@/state/mobile-session";

type Purpose = "service" | "commercial";

function policyLabel(policy: MobileMessagingPolicy | undefined) {
  if (!policy) return "Consentement non vérifié";
  if (policy.suppressionStatus === "suppressed") return "Messages bloqués";
  if (policy.suppressionStatus === "review_required") return "Révision requise";
  return policy.consentStatus === "granted" ? "Consentement enregistré" : "Consentement non vérifié";
}

function ConsentControl({
  contact,
  purpose,
}: {
  contact: { id: string; displayName: string };
  purpose: Purpose;
}) {
  const {
    activeWorkspace,
    messagingCockpit,
    submitMessagingCommand,
  } = useMobileSession();
  const [reason, setReason] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const policy = messagingCockpit?.policies.find(
    (item) => item.contactId === contact.id && item.purpose === purpose,
  );
  const granted = policy?.consentStatus === "granted" && policy.suppressionStatus === "allowed";

  const record = () => {
    if (!activeWorkspace) return;
    const command = createConsentAttestationCommand({
      workspace: activeWorkspace,
      commandId: globalThis.crypto.randomUUID(),
      contactId: contact.id,
      purpose,
      expectedStateVersion: policy?.stateVersion ?? 0,
    });
    setSubmitting(true);
    void submitMessagingCommand(command).finally(() => setSubmitting(false));
  };

  const withdraw = () => {
    if (!activeWorkspace || !reason.trim()) return;
    const command = createConsentWithdrawalCommand({
      workspace: activeWorkspace,
      commandId: globalThis.crypto.randomUUID(),
      contactId: contact.id,
      purpose,
      expectedStateVersion: policy?.stateVersion ?? 0,
      reason,
    });
    setSubmitting(true);
    void submitMessagingCommand(command).finally(() => {
      setReason("");
      setSubmitting(false);
    });
  };

  return (
    <View style={styles.policyBlock}>
      <View style={sharedStyles.row}>
        <Text style={styles.caption}>{purpose === "service" ? "Service" : "Commercial"}</Text>
        <Text style={granted ? sharedStyles.success : sharedStyles.muted}>
          {policyLabel(policy)}
        </Text>
      </View>
      {policy?.evidencePresent ? (
        <Text style={sharedStyles.muted}>Attestation liée et historique conservé.</Text>
      ) : null}
      {!granted ? (
        <Button disabled={submitting} onPress={record}>
          J’atteste avoir reçu ce consentement
        </Button>
      ) : (
        <>
          <TextInput
            style={styles.input}
            value={reason}
            onChangeText={setReason}
            placeholder="Raison du retrait"
            placeholderTextColor={colors.muted}
            maxLength={240}
            editable={!submitting}
          />
          <Button tone="secondary" disabled={submitting || !reason.trim()} onPress={withdraw}>
            Retirer le consentement et bloquer
          </Button>
        </>
      )}
    </View>
  );
}

export default function MessagesScreen() {
  const {
    activeWorkspace,
    cockpit,
    messagingCockpit,
    messagingLoadState,
    publicError,
    loadMessaging,
    submitMessagingCommand,
  } = useMobileSession();
  const [preparingActionId, setPreparingActionId] = useState<string | null>(null);

  useEffect(() => {
    if (messagingLoadState === "IDLE") void loadMessaging();
  }, [loadMessaging, messagingLoadState]);

  const actions = useMemo(
    () => preparedActionInspections(cockpit?.actions ?? []).filter((action) => action.channel === "SMS"),
    [cockpit?.actions],
  );

  if (activeWorkspace?.role === "FIELD_WORKER") {
    return (
      <Screen>
        <Heading
          eyebrow="MESSAGERIE"
          title="Communications protégées"
          body="La vue chantier confirme seulement les volumes utiles. Les contacts, messages, consentements et destinataires restent privés."
        />
        <Card>
          <Text style={sharedStyles.value}>Messages suivis: {messagingCockpit?.counts.messages ?? 0}</Text>
          <Text style={sharedStyles.value}>Contacts bloqués: {messagingCockpit?.counts.suppressedContacts ?? 0}</Text>
          <Text style={sharedStyles.success}>Aucun montant, numéro ou texte de message n’est visible.</Text>
        </Card>
      </Screen>
    );
  }

  const prepare = (action: (typeof actions)[number]) => {
    if (!activeWorkspace) return;
    const command = createPolicyBoundSmsCommand({
      workspace: activeWorkspace,
      commandId: globalThis.crypto.randomUUID(),
      action,
      purpose: "service",
    });
    setPreparingActionId(action.actionId);
    void submitMessagingCommand(command).finally(() => setPreparingActionId(null));
  };

  return (
    <Screen>
      <Heading
        eyebrow="SMS / MMS"
        title="Messages ENDVERA"
        body="Gère les permissions, inspecte les messages et prépare une communication approuvée sans jamais l’envoyer automatiquement."
      />
      {messagingLoadState === "LOADING" ? <Loading label="Messages en reconstruction…" /> : null}
      {publicError ? <Notice danger>{publicError}</Notice> : null}
      <Card>
        <Label>Sécurité actuelle</Label>
        <Text style={sharedStyles.success}>Transport externe désactivé — zéro SMS ou MMS réel.</Text>
        <Text style={sharedStyles.muted}>
          Une attestation de consentement vient du propriétaire; elle n’est pas présentée comme une preuve indépendante.
        </Text>
      </Card>

      <Heading
        eyebrow="PERMISSIONS"
        title="Qui peut recevoir quoi"
        body="Le consentement de service et le consentement commercial sont séparés. STOP bloque les deux. START exige une nouvelle révision."
      />
      {cockpit?.contacts.length ? cockpit.contacts.map((contact) => (
        <Card key={contact.id}>
          <Text style={sharedStyles.name}>{contact.displayName}</Text>
          <Text style={sharedStyles.muted}>{contact.companyName ?? contact.role ?? "Contact"}</Text>
          <ConsentControl contact={contact} purpose="service" />
          <ConsentControl contact={contact} purpose="commercial" />
        </Card>
      )) : <Card><Empty>Aucun contact disponible.</Empty></Card>}

      <Heading
        eyebrow="ACTIONS APPROUVÉES"
        title="Préparer, sans envoyer"
        body="Le destinataire, le canal et le texte exact restent visibles avant la préparation finale."
      />
      {actions.length ? actions.map((action) => (
        <Card key={action.actionId}>
          <View style={sharedStyles.row}>
            <Label>{action.state}</Label>
            <Text style={sharedStyles.muted}>{action.contact?.displayName ?? "Contact"}</Text>
          </View>
          <Text style={styles.caption}>Destinataire</Text>
          <Text selectable style={sharedStyles.value}>{action.recipient}</Text>
          <Text style={styles.caption}>Canal</Text>
          <Text style={sharedStyles.value}>{action.channel}</Text>
          <Text style={styles.caption}>Texte exact</Text>
          <Text selectable style={styles.messageBody}>{action.body}</Text>
          {action.state === "APPROVED_UNSENT" ? (
            <Button
              disabled={preparingActionId !== null}
              onPress={() => prepare(action)}
            >
              {preparingActionId === action.actionId ? "Préparation…" : "Préparer localement — ne pas envoyer"}
            </Button>
          ) : (
            <Notice>Approuve d’abord ce texte exact dans Actions. Cette étape n’envoie rien.</Notice>
          )}
        </Card>
      )) : <Card><Empty>Aucun SMS préparé.</Empty></Card>}

      <Heading eyebrow="HISTORIQUE" title="État reconstruit" body="Chaque entrée garde son état et sa provenance locale." />
      <Card>
        <View style={sharedStyles.row}>
          <Text style={sharedStyles.value}>Messages: {messagingCockpit?.counts.messages ?? 0}</Text>
          <Text style={sharedStyles.value}>Préparés: {messagingCockpit?.counts.preparedUnsent ?? 0}</Text>
        </View>
        {messagingCockpit?.timeline.length ? messagingCockpit.timeline.map((item) => (
          <View key={item.id} style={styles.timelineItem}>
            <Text style={styles.caption}>{item.direction} · {item.kind} · {item.status}</Text>
            <Text selectable style={sharedStyles.value}>{item.body || "Média sans texte"}</Text>
            <Text style={sharedStyles.muted}>
              {item.mediaReferenceCount} média · {new Date(item.createdAt).toLocaleString("fr-CA")}
            </Text>
          </View>
        )) : <Empty>Aucun message dans l’historique.</Empty>}
      </Card>
      {messagingCockpit?.deliveries.length ? (
        <Notice>
          Les statuts de livraison affichés ici sont uniquement des preuves SYNTHETIC_LOCAL. Aucun fournisseur réel n’a été observé.
        </Notice>
      ) : null}
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
  input: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.panelStrong,
    color: colors.text,
    padding: 12,
    fontSize: 15,
  },
  policyBlock: {
    gap: 10,
    borderTopColor: colors.border,
    borderTopWidth: 1,
    paddingTop: 12,
  },
  messageBody: {
    color: colors.text,
    fontSize: 16,
    lineHeight: 23,
    backgroundColor: colors.panelStrong,
    padding: 14,
    borderRadius: 12,
  },
  timelineItem: {
    gap: 6,
    borderTopColor: colors.border,
    borderTopWidth: 1,
    paddingTop: 12,
  },
});
