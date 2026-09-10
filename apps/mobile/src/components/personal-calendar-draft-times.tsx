import { Text, View } from "react-native";
import { Notice, sharedStyles } from "./ui";
import { personalCalendarDisplay, readableCalendarLocalTime } from "../lib/personal-calendar-display";
import { mobileProductLocale } from "../lib/product-experience";
import { useMobileSession } from "../state/mobile-session";

/** Supplemental display only. Approval still binds the existing operation ID and exact request hash. */
export function PersonalCalendarDraftTimes({ workspaceId, draft, showRaw = true }: {
  workspaceId: string; draft: { startsAt?: string; endsAt?: string; timezone?: string }; showRaw?: boolean;
}) {
  const { activeWorkspace } = useMobileSession();
  const locale = activeWorkspace?.id === workspaceId ? activeWorkspace.defaultLocale : undefined;
  const fr = mobileProductLocale(locale) === "fr-CA";
  const text = (french: string, english: string) => fr ? french : english;
  const result = personalCalendarDisplay({ startsAt: draft.startsAt, endsAt: draft.endsAt, timezone: draft.timezone });
  return <View style={{ gap: 4 }}>
    {result.status === "DISPLAYABLE" ? <>
      <Text style={sharedStyles.muted}>{text("Heures locales du brouillon", "Draft local times")} · {result.timezone}</Text>
      <Text selectable style={sharedStyles.value}>{text("Début", "Start")} : {result.start.localDate} · {readableCalendarLocalTime(result.start.localTime)} ({result.start.utcOffset})</Text>
      <Text selectable style={sharedStyles.value}>{text("Fin", "End")} : {result.end.localDate} · {readableCalendarLocalTime(result.end.localTime)} ({result.end.utcOffset})</Text>
      <Text style={sharedStyles.muted}>{text("Le fuseau vient du brouillon, pas du téléphone. Compare aussi les valeurs exactes ci-dessous.", "The timezone comes from the draft, not the phone. Also compare the exact values below.")}</Text>
    </> : <Notice>{text("Heure locale indisponible : la date ou le fuseau ne peut pas être vérifié ici. Aucun fuseau du téléphone n’a été utilisé. Ne confirme pas des heures que tu ne peux pas vérifier.", "Local time unavailable: the date or timezone cannot be verified here. The phone timezone was not used. Do not approve times you cannot verify.")}</Notice>}
    {showRaw ? <>
      <Text selectable style={sharedStyles.muted}>{text("Début exact enregistré", "Exact recorded start")} : {draft.startsAt ?? "—"}</Text>
      <Text selectable style={sharedStyles.muted}>{text("Fin exacte enregistrée", "Exact recorded end")} : {draft.endsAt ?? "—"}</Text>
      <Text selectable style={sharedStyles.muted}>{text("Fuseau exact enregistré", "Exact recorded timezone")} : {draft.timezone ?? "—"}</Text>
    </> : null}
  </View>;
}
