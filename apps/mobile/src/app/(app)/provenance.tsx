import { useEffect, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { Card, Empty, Heading, Label, Loading, Notice, Screen, colors, sharedStyles } from "@/components/ui";
import { useMobileSession } from "@/state/mobile-session";

const KIND_LABEL = {
  FACT: "Fait",
  INFERENCE: "Interprétation",
  DECISION: "Décision",
  ACTION: "Action",
  HUMAN_RESULT: "Résultat humain",
  VERIFIED_STATE: "État vérifié",
} as const;

export default function ProvenanceScreen() {
  const { cockpit, provenance, provenanceLoadState, publicError, loadProvenance } = useMobileSession();
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null);
  const selectedId = selectedProjectId ?? provenance?.project.id ?? cockpit?.projects[0]?.id ?? null;

  useEffect(() => {
    if (!selectedId || provenanceLoadState !== "IDLE") return;
    void loadProvenance(selectedId);
  }, [loadProvenance, provenanceLoadState, selectedId]);

  const choose = (projectId: string) => {
    setSelectedProjectId(projectId);
    void loadProvenance(projectId);
  };

  return (
    <Screen>
      <Heading eyebrow="CONFIANCE" title="Pourquoi ENDVERA croit ça" body="Faits, interprétations, décisions, actions, appui humain et état vérifié — reconstruits depuis la base canonique." />
      <Card>
        <Label>Chantier</Label>
        {cockpit?.projects.length ? cockpit.projects.map((project) => (
          <Pressable key={project.id} accessibilityRole="button" accessibilityState={{ selected: selectedId === project.id }} onPress={() => choose(project.id)} style={[styles.choice, selectedId === project.id && styles.choiceActive]}>
            <Text style={sharedStyles.name}>{project.name}</Text>
            <Text style={sharedStyles.muted}>{project.code}</Text>
          </Pressable>
        )) : <Empty>Aucun chantier actif.</Empty>}
      </Card>
      {provenanceLoadState === "LOADING" ? <Loading label="Historique de confiance en préparation…" /> : null}
      {publicError ? <Notice danger>{publicError}</Notice> : null}
      {provenance && provenance.project.id === selectedId ? (
        <>
          <Card>
            <Label>Résumé</Label>
            <View style={styles.summary}>
              <Text style={sharedStyles.muted}>{provenance.summary.verified} état(s) vérifié(s)</Text>
              <Text style={sharedStyles.muted}>{provenance.summary.proposed} proposition(s)</Text>
              <Text style={provenance.summary.contradicted ? styles.warning : sharedStyles.muted}>{provenance.summary.contradicted} contradiction(s)</Text>
              <Text style={sharedStyles.muted}>{provenance.summary.humanAssisted} intervention(s) humaine(s)</Text>
            </View>
          </Card>
          <Label>Chaîne reconstruite</Label>
          {provenance.entries.length ? provenance.entries.map((entry) => (
            <Card key={entry.id}>
              <View style={sharedStyles.row}>
                <Label>{KIND_LABEL[entry.kind]}</Label>
                <Text style={sharedStyles.muted}>{new Date(entry.recordedAt).toLocaleString("fr-CA")}</Text>
              </View>
              <Text style={sharedStyles.name}>{entry.statement}</Text>
              <Text style={entry.stateLabel.includes("CONTRADICTION") ? styles.warning : sharedStyles.muted}>État: {entry.stateLabel}</Text>
              <Text style={styles.source}>Source: {entry.source.label}</Text>
              {entry.kind === "VERIFIED_STATE" && "nextResponsibleRole" in entry.details && entry.details.nextResponsibleRole ? <Text style={sharedStyles.success}>Prochain responsable: {entry.details.nextResponsibleRole}</Text> : null}
            </Card>
          )) : <Card><Empty>Aucune provenance pour ce chantier.</Empty></Card>}
        </>
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  choice: { borderRadius: 12, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.panelStrong, padding: 13, gap: 4 },
  choiceActive: { borderColor: colors.accent, backgroundColor: colors.accentSoft },
  summary: { gap: 5 },
  warning: { color: colors.danger, fontSize: 13 },
  source: { color: colors.muted, fontSize: 11 },
});
