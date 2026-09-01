import * as DocumentPicker from "expo-document-picker";
import { useMemo, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
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
  createEvidenceAttempt,
  type EvidenceAttempt,
  type EvidenceKind,
} from "@/lib/evidence";
import { useMobileSession } from "@/state/mobile-session";

const PICKER_TYPES = [
  "image/jpeg",
  "image/png",
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
];

const KIND_LABELS: Record<EvidenceKind, string> = {
  WRITTEN_APPROVAL: "Approbation écrite",
  PHOTO: "Photo du travail",
  DOCUMENT: "Autre document",
};

function knownMime(name: string, reported: string | null | undefined) {
  if (reported && PICKER_TYPES.includes(reported)) return reported;
  const extension = name.split(".").pop()?.toLowerCase();
  return {
    jpg: "image/jpeg",
    jpeg: "image/jpeg",
    png: "image/png",
    pdf: "application/pdf",
    docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  }[extension ?? ""] ?? null;
}

function attemptLabel(attempt: EvidenceAttempt | null) {
  if (!attempt) return null;
  if (attempt.state === "SENDING") return "Preuve en cours de vérification…";
  if (attempt.state === "CONFIRMED") return "Preuve ajoutée comme présente, mais encore non vérifiée.";
  if (attempt.state === "REPLAYED") return "Cette preuve était déjà enregistrée; aucun doublon.";
  if (attempt.state === "CONFLICT") return "Le dossier a changé. Recharge sa version actuelle avant de réessayer.";
  if (attempt.state === "OUTCOME_UNKNOWN") return "Résultat inconnu — réessaie exactement le même ajout.";
  if (attempt.state === "REFUSED") return "Fichier refusé; aucun effet sur le dossier.";
  return null;
}

export default function EvidenceScreen() {
  const {
    activeWorkspace,
    cockpit,
    latestEvidenceAttempt,
    publicError,
    submitEvidenceAttempt,
  } = useMobileSession();
  const loops = useMemo(
    () =>
      (cockpit?.openLoops ?? []).filter(
        (loop) => loop.project && loop.status !== "closed" && loop.status !== "revoked",
      ),
    [cockpit?.openLoops],
  );
  const [selectedLoopId, setSelectedLoopId] = useState<string | null>(null);
  const [kind, setKind] = useState<EvidenceKind>("PHOTO");
  const [selectionError, setSelectionError] = useState<string | null>(null);
  const selected = loops.find((loop) => loop.id === selectedLoopId) ?? loops[0] ?? null;
  const busy = latestEvidenceAttempt?.state === "SENDING";
  const status = attemptLabel(latestEvidenceAttempt);

  const selectAndUpload = async () => {
    if (!activeWorkspace || !selected?.project) return;
    setSelectionError(null);
    const picked = await DocumentPicker.getDocumentAsync({
      type: kind === "PHOTO" ? ["image/jpeg", "image/png"] : PICKER_TYPES,
      multiple: false,
      copyToCacheDirectory: true,
    });
    if (picked.canceled) return;
    const asset = picked.assets[0];
    if (!asset) return;
    const mimeType = knownMime(asset.name, asset.mimeType);
    if (!mimeType || !asset.size) {
      setSelectionError("ENDVERA ne peut pas vérifier ce type ou la taille de ce fichier.");
      return;
    }
    try {
      const attempt = createEvidenceAttempt({
        workspace: activeWorkspace,
        projectId: selected.project.id,
        loopId: selected.id,
        expectedStateVersion: selected.stateVersion,
        kind,
        file: {
          uri: asset.uri,
          name: asset.name,
          mimeType,
          size: asset.size,
        },
      });
      await submitEvidenceAttempt(attempt);
    } catch {
      setSelectionError("Ce fichier ne respecte pas les règles de preuve ENDVERA.");
    }
  };

  const retry = async () => {
    if (latestEvidenceAttempt?.state !== "OUTCOME_UNKNOWN") return;
    await submitEvidenceAttempt(latestEvidenceAttempt);
  };

  return (
    <Screen>
      <Heading
        eyebrow="PREUVES"
        title="Ajouter au bon dossier"
        body="Choisis le dossier, le type de preuve et le fichier. ENDVERA conserve la source sans déclarer la preuve vérifiée."
      />
      <Card>
        <Label>Dossier ouvert</Label>
        {loops.length ? (
          loops.map((loop) => {
            const active = selected?.id === loop.id;
            return (
              <Pressable
                key={loop.id}
                accessibilityRole="button"
                accessibilityState={{ selected: active }}
                onPress={() => setSelectedLoopId(loop.id)}
                style={[styles.choice, active && styles.choiceActive]}
              >
                <Text style={sharedStyles.name}>{loop.project?.name}</Text>
                <Text style={sharedStyles.muted}>
                  {loop.status} · responsable: {loop.nextResponsibleRole}
                </Text>
              </Pressable>
            );
          })
        ) : (
          <Empty>Aucun dossier ouvert ne demande de preuve.</Empty>
        )}
      </Card>
      {selected ? (
        <Card>
          <Label>Type de preuve</Label>
          <View style={styles.kindRow}>
            {(Object.keys(KIND_LABELS) as EvidenceKind[]).map((value) => (
              <Pressable
                key={value}
                accessibilityRole="button"
                accessibilityState={{ selected: value === kind }}
                onPress={() => setKind(value)}
                style={[styles.kind, value === kind && styles.choiceActive]}
              >
                <Text style={styles.kindText}>{KIND_LABELS[value]}</Text>
              </Pressable>
            ))}
          </View>
          <Button disabled={busy} onPress={selectAndUpload}>
            Choisir le fichier et l’ajouter
          </Button>
          <Text style={sharedStyles.muted}>
            JPEG, PNG, PDF ou DOCX · maximum 10 Mo · fichier choisi seulement
          </Text>
        </Card>
      ) : null}
      {publicError ? <Notice danger>{publicError}</Notice> : null}
      {selectionError ? <Notice danger>{selectionError}</Notice> : null}
      {status ? (
        <Notice
          danger={["CONFLICT", "OUTCOME_UNKNOWN", "REFUSED"].includes(
            latestEvidenceAttempt?.state ?? "",
          )}
        >
          {status}
        </Notice>
      ) : null}
      {latestEvidenceAttempt?.state === "OUTCOME_UNKNOWN" ? (
        <Button tone="secondary" onPress={retry}>Réessayer exactement le même ajout</Button>
      ) : null}
      <Card>
        <Label>Sécurité</Label>
        <Text style={sharedStyles.success}>Aucun SMS, courriel ou provider n’est appelé.</Text>
      </Card>
    </Screen>
  );
}

const styles = StyleSheet.create({
  choice: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.panelStrong,
    padding: 13,
    gap: 4,
  },
  choiceActive: { borderColor: colors.accent, backgroundColor: colors.accentSoft },
  kindRow: { gap: 8 },
  kind: {
    minHeight: 44,
    justifyContent: "center",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: 13,
  },
  kindText: { color: colors.text, fontSize: 15, fontWeight: "700" },
});
