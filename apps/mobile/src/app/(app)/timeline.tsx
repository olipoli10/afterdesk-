import { useEffect } from "react";
import { router, useLocalSearchParams } from "expo-router";
import { Pressable, StyleSheet, Text, View } from "react-native";
import {
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
import { useMobileSession } from "@/state/mobile-session";

const KIND_LABEL = {
  CALENDAR: "Calendrier",
  OPEN_LOOP: "Dossier ouvert",
  EVIDENCE: "Preuve",
  ACTION: "Action",
  RECEIVABLE: "Compte à recevoir",
} as const;

const NEXT_DECISION_LABEL: Record<string, string> = {
  OPEN_LOOP_ACTION: "Résoudre le prochain blocage du dossier.",
  REVIEW_PREPARED_ACTION: "Vérifier l’action préparée avant de décider.",
  FOLLOW_UP_RECEIVABLE: "Faire le prochain suivi de paiement.",
  ATTEND_APPOINTMENT: "Préparer le prochain rendez-vous d’aujourd’hui.",
  CHECK_ASSIGNED_WORK: "Vérifier le travail de chantier qui t’est assigné.",
  NO_ACTION: "Aucune décision urgente pour ce chantier.",
};

function money(amountMinor: number) {
  return new Intl.NumberFormat("fr-CA", {
    style: "currency",
    currency: "CAD",
  }).format(amountMinor / 100);
}

export default function TimelineScreen() {
  const {
    cockpit,
    timeline,
    timelineLoadState,
    publicError,
    loadTimeline,
  } = useMobileSession();
  const params = useLocalSearchParams<{ projectId?: string | string[] }>();
  const routeProjectId = typeof params.projectId === "string" ? params.projectId : null;
  const routeProjectIsVisible = Boolean(
    routeProjectId && cockpit?.projects.some((project) => project.id === routeProjectId),
  );
  const selectedId =
    (routeProjectIsVisible ? routeProjectId : null) ??
    (timeline && cockpit?.projects.some((project) => project.id === timeline.project.id)
      ? timeline.project.id
      : null) ??
    cockpit?.projects[0]?.id ??
    null;

  useEffect(() => {
    if (!selectedId || timelineLoadState === "LOADING" || timeline?.project.id === selectedId) return;
    void loadTimeline(selectedId);
  }, [loadTimeline, selectedId, timeline?.project.id, timelineLoadState]);

  const selectProject = (projectId: string) => {
    router.setParams({ projectId });
  };

  return (
    <Screen>
      <Heading
        eyebrow="CHANTIER"
        title="Timeline et briefing"
        body="Une seule vue reconstruite depuis PostgreSQL: rendez-vous, blocages, preuves, actions et paiements selon ton rôle."
      />
      <Card>
        <Label>Chantier</Label>
        {cockpit?.projects.length ? (
          cockpit.projects.map((project) => (
            <Pressable
              key={project.id}
              accessibilityRole="button"
              accessibilityState={{ selected: selectedId === project.id }}
              onPress={() => selectProject(project.id)}
              style={[styles.choice, selectedId === project.id && styles.choiceActive]}
            >
              <Text style={sharedStyles.name}>{project.name}</Text>
              <Text style={sharedStyles.muted}>{project.code}</Text>
            </Pressable>
          ))
        ) : (
          <Empty>Aucun chantier actif.</Empty>
        )}
      </Card>
      {timelineLoadState === "LOADING" ? <Loading label="Briefing en préparation…" /> : null}
      {publicError ? <Notice danger>{publicError}</Notice> : null}
      {timeline && timeline.project.id === selectedId ? (
        <>
          <Card>
            <Label>Briefing du {timeline.localDate}</Label>
            <Text style={styles.decision}>
              {NEXT_DECISION_LABEL[timeline.brief.nextDecision] ?? timeline.brief.nextDecision}
            </Text>
            <View style={styles.metrics}>
              <Text style={sharedStyles.muted}>{timeline.brief.appointmentsToday} rendez-vous aujourd’hui</Text>
              <Text style={sharedStyles.muted}>{timeline.brief.openLoops} dossier(s) ouvert(s)</Text>
              <Text style={sharedStyles.muted}>{timeline.brief.evidencePendingVerification} preuve(s) à vérifier</Text>
              <Text style={sharedStyles.muted}>{timeline.brief.preparedActions} action(s) préparée(s)</Text>
              {"openReceivables" in timeline.brief ? (
                <Text style={sharedStyles.muted}>
                  {timeline.brief.openReceivables} compte(s) ouvert(s) · {money(timeline.brief.outstandingAmountMinor)}
                </Text>
              ) : null}
            </View>
            {timeline.brief.nextResponsibleRoles.length ? (
              <Text style={sharedStyles.success}>
                Prochain responsable: {timeline.brief.nextResponsibleRoles.join(", ")}
              </Text>
            ) : null}
          </Card>
          <Label>Historique canonique</Label>
          {timeline.events.length ? (
            timeline.events.map((event) => (
              <Card key={event.id}>
                <View style={sharedStyles.row}>
                  <Label>{KIND_LABEL[event.kind]}</Label>
                  <Text style={sharedStyles.muted}>
                    {new Date(event.occurredAt).toLocaleString("fr-CA")}
                  </Text>
                </View>
                <Text style={sharedStyles.name}>{event.summary}</Text>
                {event.detail ? <Text style={sharedStyles.muted}>{event.detail}</Text> : null}
                <Text style={sharedStyles.muted}>État: {event.status}</Text>
                {"financial" in event && event.financial ? (
                  <Text style={styles.money}>{money(event.financial.outstandingAmountMinor)}</Text>
                ) : null}
                <Text style={styles.provenance}>
                  Source: base canonique · {event.provenance.entityType}
                </Text>
              </Card>
            ))
          ) : (
            <Card><Empty>Aucun événement canonique pour ce chantier.</Empty></Card>
          )}
        </>
      ) : null}
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
  decision: { color: colors.text, fontSize: 19, lineHeight: 26, fontWeight: "800" },
  metrics: { gap: 5 },
  money: { color: colors.accent, fontSize: 18, fontWeight: "800" },
  provenance: { color: colors.muted, fontSize: 11 },
});
