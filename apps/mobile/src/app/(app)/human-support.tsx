import { useEffect, useState } from "react";
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
import type { MobileHumanEscalationCockpit } from "@/lib/human-escalations";
import { useMobileSession } from "@/state/mobile-session";

type OwnerCockpit = Extract<
  MobileHumanEscalationCockpit,
  { role: "OWNER" | "OFFICE_MANAGER" }
>;

function ownerCockpit(value: MobileHumanEscalationCockpit | null): OwnerCockpit | null {
  if (!value || value.role === "FIELD_WORKER") return null;
  return value;
}

function dollarsToMinor(value: string) {
  const parsed = Number(value.replace(",", "."));
  return Number.isFinite(parsed) && parsed > 0 ? Math.round(parsed * 100) : null;
}

function PrepareHumanSupport({ loop }: { loop: OwnerCockpit["eligibleLoops"][number] }) {
  const { activeWorkspace, submitHumanEscalationCommand } = useMobileSession();
  const [clientPrice, setClientPrice] = useState("");
  const [workerPayout, setWorkerPayout] = useState("");
  const [minutes, setMinutes] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const priceMinor = dollarsToMinor(clientPrice);
  const payoutMinor = dollarsToMinor(workerPayout);
  const estimatedMinutes = Number(minutes);
  const valid = Boolean(
    activeWorkspace &&
    priceMinor &&
    payoutMinor &&
    payoutMinor <= priceMinor &&
    Number.isInteger(estimatedMinutes) &&
    estimatedMinutes > 0 &&
    estimatedMinutes <= 480,
  );
  const evidenceKind = loop.missingEvidenceKinds.includes("WRITTEN_APPROVAL")
    ? "WRITTEN_APPROVAL" as const
    : "PHOTO" as const;

  return (
    <View style={styles.stack}>
      <TextInput
        value={clientPrice}
        onChangeText={setClientPrice}
        placeholder="Prix client ($)"
        placeholderTextColor={colors.muted}
        keyboardType="decimal-pad"
        style={styles.input}
      />
      <TextInput
        value={workerPayout}
        onChangeText={setWorkerPayout}
        placeholder="Paiement humain maximal ($)"
        placeholderTextColor={colors.muted}
        keyboardType="decimal-pad"
        style={styles.input}
      />
      <TextInput
        value={minutes}
        onChangeText={setMinutes}
        placeholder="Minutes estimées"
        placeholderTextColor={colors.muted}
        keyboardType="number-pad"
        style={styles.input}
      />
      <Notice>
        Préparation seulement. Le mandat demeure non publié tant que son budget n’est pas autorisé.
      </Notice>
      <Button
        disabled={!valid || submitting}
        onPress={() => {
          if (!activeWorkspace || !priceMinor || !payoutMinor || !valid) return;
          const commandId = globalThis.crypto.randomUUID();
          setSubmitting(true);
          void submitHumanEscalationCommand({
            schemaVersion: 1,
            commandId,
            requestId: commandId,
            idempotencyKey: commandId,
            workspaceId: activeWorkspace.id,
            action: "PREPARE",
            projectId: loop.projectId,
            openLoopId: loop.loopId,
            expectedStateVersion: loop.stateVersion,
            purpose: "OBTAIN_MISSING_EVIDENCE",
            evidenceKind,
            acceptedClientPriceCents: priceMinor,
            acceptedWorkerPayoutCents: payoutMinor,
            acceptedEstimatedMinutes: estimatedMinutes,
            acceptedCurrency: "CAD",
          }).finally(() => setSubmitting(false));
        }}
      >
        Préparer l’appui humain
      </Button>
    </View>
  );
}

export default function HumanSupportScreen() {
  const {
    activeWorkspace,
    humanEscalationCockpit,
    humanEscalationLoadState,
    publicError,
    loadHumanEscalations,
    submitHumanEscalationCommand,
  } = useMobileSession();
  const office = ownerCockpit(humanEscalationCockpit);

  useEffect(() => {
    if (humanEscalationLoadState === "IDLE") void loadHumanEscalations();
  }, [humanEscalationLoadState, loadHumanEscalations]);

  return (
    <Screen>
      <Heading
        eyebrow="EXCEPTION → HUMAIN → REPRISE"
        title="Appui humain"
        body="Quand ENDVERA ne peut pas vérifier une preuve, il prépare un mandat borné, suit sa révision et reprend le chantier après acceptation."
      />
      {humanEscalationLoadState === "LOADING" ? (
        <Loading label="Appui humain en reconstruction…" />
      ) : null}
      {publicError ? <Notice danger>{publicError}</Notice> : null}
      {activeWorkspace?.role === "FIELD_WORKER" ? (
        <Card>
          <Label>Vue terrain</Label>
          <Text style={sharedStyles.success}>
            Aucun prix client, paiement humain ou détail de révision n’est visible.
          </Text>
        </Card>
      ) : null}

      {office ? (
        <>
          <Heading
            eyebrow="BLOQUÉ"
            title="Interventions admissibles"
            body="Tu fixes les limites économiques; ENDVERA ne publie rien et n’envoie rien depuis cet écran."
          />
          {office.eligibleLoops.length ? office.eligibleLoops.map((loop) => (
            <Card key={loop.loopId}>
              <View style={sharedStyles.row}>
                <Label>{loop.projectCode}</Label>
                <Text style={sharedStyles.muted}>v{loop.stateVersion}</Text>
              </View>
              <Text style={sharedStyles.name}>{loop.projectName}</Text>
              <Notice danger>Manque: {loop.missingEvidenceKinds.join(", ")}</Notice>
              <Text style={sharedStyles.value}>{loop.nextAction}</Text>
              <PrepareHumanSupport loop={loop} />
            </Card>
          )) : <Card><Empty>Aucun loop admissible à un appui humain.</Empty></Card>}

          <Heading
            eyebrow="EN COURS"
            title="Mandats et prochaine responsabilité"
            body="Chaque état indique qui doit agir et ce qu’ENDVERA fera ensuite."
          />
          {office.escalations.length ? office.escalations.map((item) => (
            <Card key={item.escalationId}>
              <View style={sharedStyles.row}>
                <Label>{item.projectCode}</Label>
                <Text style={sharedStyles.success}>{item.state}</Text>
              </View>
              <Text style={sharedStyles.name}>{item.projectName}</Text>
              <Text style={sharedStyles.value}>{item.nextAction}</Text>
              <Text style={sharedStyles.muted}>
                Responsable: {item.nextResponsibleRole} · preuve: {item.evidenceKind}
              </Text>
              <Text style={sharedStyles.muted}>
                Prix client gelé: {(item.acceptedClientPriceCents / 100).toFixed(2)} $ CAD
              </Text>
              {item.fundingRequired ? (
                <Notice danger>Budget requis avant toute publication.</Notice>
              ) : null}
              {["PREPARED", "WAITING_FOR_WORKER", "WORK_IN_PROGRESS"].includes(item.state) ? (
                <Button
                  tone="secondary"
                  onPress={() => {
                    if (!activeWorkspace) return;
                    const commandId = globalThis.crypto.randomUUID();
                    void submitHumanEscalationCommand({
                      schemaVersion: 1,
                      commandId,
                      requestId: commandId,
                      idempotencyKey: commandId,
                      workspaceId: activeWorkspace.id,
                      action: "WITHDRAW",
                      escalationId: item.escalationId,
                      reason: "Retrait demandé dans le cockpit propriétaire.",
                    });
                  }}
                >
                  Retirer le mandat
                </Button>
              ) : null}
            </Card>
          )) : <Card><Empty>Aucun mandat humain préparé.</Empty></Card>}
          <Notice>Aucun transport externe effectué.</Notice>
        </>
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  stack: { gap: 10 },
  input: {
    minHeight: 48,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    paddingHorizontal: 14,
    color: colors.text,
    backgroundColor: colors.panelStrong,
  },
});
