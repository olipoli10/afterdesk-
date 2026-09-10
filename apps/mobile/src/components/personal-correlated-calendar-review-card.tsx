import { Text, View } from "react-native";
import { Card, Label, Notice, sharedStyles } from "./ui";
import { parsePersonalCorrelatedCalendarReview } from "../lib/personal-correlated-calendar-review";
import { personalCalendarDisplay, readableCalendarLocalTime } from "../lib/personal-calendar-display";

/** Read-only card used by the scope-bound owner list. No action props,
 * API, permission or workspace hooks; the authenticated list owns reads. */
export function PersonalCorrelatedCalendarReviewCard({ entry, locale = "fr-CA" }: {
  entry: unknown; locale?: "fr-CA" | "en-CA";
}) {
  const text = (fr: string, en: string) => locale === "en-CA" ? en : fr;
  let review;
  try { review = parsePersonalCorrelatedCalendarReview(entry); }
  catch { return <Card><Notice>{text("Lecture du rendez-vous indisponible : les données ne peuvent pas être vérifiées ici.", "Calendar review unavailable: the data cannot be checked here.")}</Notice></Card>; }
  const evidence = review.evidence;
  const times = personalCalendarDisplay({
    startsAt: evidence.draft.startsAt, endsAt: evidence.draft.endsAt, timezone: evidence.draft.timezone,
  });
  const states = {
    pending: text("Brouillon en attente — pas encore ajouté.", "Draft pending — not yet added."),
    processing: text("Traitement en cours — résultat non confirmé.", "Processing — result not confirmed."),
    completed: text("Traitement marqué terminé. Cette vue ne confirme pas l’ajout à Google Agenda.", "Processing marked complete. This view does not confirm an addition to Google Calendar."),
    uncertain: text("Résultat incertain. Aucun nouvel essai n’est lancé ici.", "Outcome uncertain. No new attempt is started here."),
    refused: text("Demande refusée. Aucun nouvel essai n’est lancé ici.", "Request refused. No new attempt is started here."),
  };
  return <Card>
    <Label>{text("Rendez-vous proposé · lecture seulement", "Proposed appointment · read only")}</Label>
    <Notice>{text("Aucune approbation ni action n’est disponible dans cette carte.", "No approval or action is available in this card.")}</Notice>
    <Text style={sharedStyles.muted}>{evidence.provenance === "SYNTHETIC_LOCAL"
      ? text("Exemple de test — données synthétiques", "Test example — synthetic data")
      : text("Origine non vérifiée", "Origin not verified")}</Text>
    {evidence.sources.map((source, index) => <View key={source.operationId} style={{ gap: 4 }}>
      <Label>{index === 0 ? text("Ta demande initiale", "Your original request") : text("Ta précision", "Your clarification")}</Label>
      <Text selectable style={sharedStyles.value}>{source.text}</Text>
      <Text selectable style={sharedStyles.muted}>{text("Réception enregistrée (UTC)", "Recorded receipt time (UTC)")} : {source.receivedAt}</Text>
    </View>)}
    <Text style={sharedStyles.muted}>{evidence.clarifiedSlot === "START"
      ? text("La précision porte sur l’heure de début.", "The clarification concerns the start time.")
      : text("La précision porte sur l’heure de fin.", "The clarification concerns the end time.")}</Text>
    <Label>{text("Valeurs exactes du rendez-vous proposé", "Exact proposed appointment values")}</Label>
    <Text selectable style={sharedStyles.value}>{evidence.draft.title}</Text>
    {evidence.citations.title.quote !== evidence.draft.title ? <Text selectable style={sharedStyles.muted}>
      {text("Titre dans le SMS (seuls les espaces aux extrémités ont été retirés du brouillon)", "Title in the SMS (only surrounding whitespace was removed from the draft)")} : {evidence.citations.title.quote}
    </Text> : null}
    {times.status === "DISPLAYABLE" ? <View style={{ gap: 4 }}>
      <Text style={sharedStyles.muted}>{text("Heures locales dans le fuseau du brouillon, pas du téléphone", "Local times in the draft timezone, not the phone timezone")} : {times.timezone}</Text>
      <Text selectable style={sharedStyles.value}>{text("Début", "Start")} : {times.start.localDate} · {readableCalendarLocalTime(times.start.localTime)} ({times.start.utcOffset})</Text>
      <Text selectable style={sharedStyles.value}>{text("Fin", "End")} : {times.end.localDate} · {readableCalendarLocalTime(times.end.localTime)} ({times.end.utcOffset})</Text>
    </View> : <Notice>{text("Heures locales indisponibles. Les valeurs exactes restent ci-dessous; aucun fuseau du téléphone n’a été utilisé.", "Local times unavailable. Exact values remain below; the phone timezone was not used.")}</Notice>}
    <Text selectable style={sharedStyles.muted}>{text("Début exact (UTC)", "Exact start (UTC)")} : {evidence.draft.startsAt}</Text>
    <Text selectable style={sharedStyles.muted}>{text("Fin exacte (UTC)", "Exact end (UTC)")} : {evidence.draft.endsAt}</Text>
    <Text selectable style={sharedStyles.muted}>{text("Fuseau exact", "Exact timezone")} : {evidence.draft.timezone}</Text>
    <Label>{text("État au moment de la vérification", "State at the recorded inspection")}</Label>
    <Text style={sharedStyles.value}>{states[review.currentStatus]}</Text>
    <View style={{ gap: 4 }}>
      <Text selectable style={sharedStyles.muted}>{text("Préparé le (UTC)", "Prepared (UTC)")} : {review.preparedAt}</Text>
      <Text selectable style={sharedStyles.muted}>{text("Vérifié le (UTC)", "Inspected (UTC)")} : {review.inspectedAt}</Text>
      <Text selectable style={sharedStyles.muted}>{text("Fenêtre de préparation jusqu’au (UTC)", "Preparation window ends (UTC)")} : {review.preparationExpiresAt}</Text>
    </View>
    <Text style={sharedStyles.muted}>{text("Compare les deux SMS aux valeurs proposées.", "Compare both SMS messages with the proposed values.")}</Text>
  </Card>;
}
