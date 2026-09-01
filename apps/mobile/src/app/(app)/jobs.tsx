import { useEffect } from "react";
import { StyleSheet, Text, View } from "react-native";
import { Button, Card, Empty, Heading, Label, Loading, Notice, Screen, colors, sharedStyles } from "@/components/ui";
import type { MobileJobCommand } from "@/lib/jobs";
import { useMobileSession } from "@/state/mobile-session";

const STATUS_LABEL: Record<string, string> = {
  PROPOSED: "À confirmer",
  SCHEDULED: "Planifié",
  BLOCKED: "Bloqué",
  IN_PROGRESS: "En cours",
  COMPLETED: "Terminé",
  CANCELLED: "Annulé",
};

function nextCommand(input: { workspaceId: string; jobId: string; status: string; version: number }): MobileJobCommand | null {
  const base = {
    schemaVersion: 1 as const,
    commandId: globalThis.crypto.randomUUID(),
    workspaceId: input.workspaceId,
    jobId: input.jobId,
    expectedVersion: input.version,
  };
  if (input.status === "PROPOSED") return { ...base, action: "COMMIT_SCHEDULE" };
  if (input.status === "SCHEDULED") return { ...base, action: "CHANGE_STATUS", status: "IN_PROGRESS" };
  if (input.status === "IN_PROGRESS") return { ...base, action: "CHANGE_STATUS", status: "COMPLETED" };
  if (input.status === "BLOCKED") return { ...base, action: "CHANGE_STATUS", status: "PROPOSED" };
  return null;
}

const NEXT_LABEL: Record<string, string> = {
  PROPOSED: "Vérifier et planifier",
  SCHEDULED: "Marquer en cours",
  IN_PROGRESS: "Marquer terminé",
  BLOCKED: "Retourner à préparer",
};

export default function JobsScreen() {
  const { activeWorkspace, jobSchedule, jobScheduleLoadState, publicError, loadJobSchedule, submitJobCommand } = useMobileSession();

  useEffect(() => {
    if (jobScheduleLoadState === "IDLE") void loadJobSchedule();
  }, [jobScheduleLoadState, loadJobSchedule]);

  return (
    <Screen>
      <Heading
        eyebrow="OPÉRATIONS"
        title="Jobs et équipes"
        body="ENDVERA garde l’horaire réel, les responsables, les dépendances et les conflits dans PostgreSQL."
      />
      {jobScheduleLoadState === "LOADING" ? <Loading label="Horaire en reconstruction…" /> : null}
      {publicError ? <Notice danger>{publicError}</Notice> : null}
      {jobSchedule?.jobs.length ? jobSchedule.jobs.map((job) => {
        const command = activeWorkspace && activeWorkspace.role !== "FIELD_WORKER"
          ? nextCommand({ workspaceId: activeWorkspace.id, jobId: job.id, status: job.status, version: job.version })
          : null;
        const conflicts = "conflicts" in job ? job.conflicts : [];
        const impacts = "impactedJobs" in job ? job.impactedJobs : [];
        return (
          <Card key={job.id}>
            <View style={sharedStyles.row}>
              <Label>{job.projectCode}</Label>
              <Text style={styles.status}>{STATUS_LABEL[job.status] ?? job.status}</Text>
            </View>
            <Text style={sharedStyles.name}>{job.title}</Text>
            <Text style={sharedStyles.muted}>
              {new Date(job.startsAt).toLocaleString("fr-CA")} → {new Date(job.endsAt).toLocaleTimeString("fr-CA")}
            </Text>
            <Text style={sharedStyles.muted}>
              Responsable: {job.assignments.length ? job.assignments.map((assignment) => assignment.displayName).join(", ") : "à choisir"}
            </Text>
            {conflicts.map((conflict) => <Notice key={`${conflict.code}:${conflict.relatedJobId ?? conflict.assigneeId ?? "job"}`} danger>{conflict.detail}</Notice>)}
            {impacts.map((impact) => (
              <Notice key={impact.jobId}>Impact possible: {impact.delayMinutes} minute(s) sur un travail dépendant.</Notice>
            ))}
            {command ? (
              <Button disabled={jobScheduleLoadState === "LOADING" || conflicts.length > 0} onPress={() => void submitJobCommand(command)}>
                {NEXT_LABEL[job.status] ?? "Mettre à jour"}
              </Button>
            ) : null}
          </Card>
        );
      }) : jobScheduleLoadState === "READY" ? <Card><Empty>Aucun travail planifié dans cet espace.</Empty></Card> : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  status: { color: colors.success, fontSize: 13, fontWeight: "800" },
});
