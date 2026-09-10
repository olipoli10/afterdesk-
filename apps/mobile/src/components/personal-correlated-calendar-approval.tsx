import { useCallback, useLayoutEffect, useMemo, useSyncExternalStore } from "react";
import { AppState, Platform, Text, View } from "react-native";
import { useFocusEffect } from "expo-router";
import { Button, Card, Label, Notice, sharedStyles } from "./ui";
import { PersonalCorrelatedCalendarReviewList } from "./personal-correlated-calendar-review-list";
import { PersonalCorrelatedCalendarReviewCard } from "./personal-correlated-calendar-review-card";
import { createCorrelatedCalendarApprovalLifecycle } from "../lib/personal-correlated-calendar-approval-lifecycle";
import { createCorrelatedCalendarApprovalAttempts } from "../lib/personal-correlated-calendar-approval-attempts";
import { correlatedApprovalId } from "../lib/personal-correlated-calendar-approval";
import { correlatedCalendarSessionKey } from "../lib/personal-correlated-calendar-list";
import { MobileApi } from "../lib/api";
import { mobileApiBaseUrl } from "../lib/config";
import { authClient } from "../lib/auth-client";
import { mobileProductLocale } from "../lib/product-experience";
import { useMobileSession } from "../state/mobile-session";

function scopeFence() {
  let value: string | null = null;
  return { set(next: string | null) { value = next; }, matches(expected: string | null) { return expected !== null && value === expected; } };
}

function ScopedCorrelatedCalendarApproval({ ownerId, workspaceId, apiOrigin, locale, isCurrentScope }: {
  ownerId: string; workspaceId: string; apiOrigin: string; locale: "fr-CA" | "en-CA"; isCurrentScope: () => boolean;
}) {
  const foreground = useMemo(() => scopeFence(), []);
  const api = useMemo(() => new MobileApi({ baseUrl: apiOrigin, getCookie: () => authClient.getCookie(), browserManagedCredentials: Platform.OS === "web" }), [apiOrigin]);
  const attempts = useMemo(() => createCorrelatedCalendarApprovalAttempts({ ownerId, apiOrigin }), [ownerId, apiOrigin]);
  const lifecycle = useMemo(() => createCorrelatedCalendarApprovalLifecycle({ workspaceId, attempts, isCurrentScope: () => foreground.matches("active") && isCurrentScope(),
    readOffer: (reviewId, signal) => api.personalCorrelatedCalendarApprovalOffer(workspaceId, reviewId, signal),
    readResult: (reviewId, signal) => api.personalCorrelatedCalendarApprovalResult(workspaceId, reviewId, signal),
    approve: (command, signal) => api.approvePersonalCorrelatedCalendar(command, signal),
  }), [workspaceId, attempts, api, foreground, isCurrentScope]);
  const snapshot = useSyncExternalStore(lifecycle.subscribe, lifecycle.getSnapshot, lifecycle.getSnapshot);
  useLayoutEffect(() => () => { foreground.set(null); lifecycle.pause(); }, [foreground, lifecycle]);
  useFocusEffect(useCallback(() => {
    const active = (value: boolean) => { foreground.set(value ? "active" : null); if (value) lifecycle.activate(); else lifecycle.pause(); };
    const change = AppState.addEventListener("change", state => active(state === "active"));
    const blur = AppState.addEventListener("blur", () => active(false));
    const focus = AppState.addEventListener("focus", () => active(AppState.currentState === "active"));
    active(AppState.currentState === "active");
    return () => { change.remove(); blur.remove(); focus.remove(); active(false); };
  }, [foreground, lifecycle]));
  const text = (fr: string, en: string) => locale === "en-CA" ? en : fr;
  const busy = snapshot.phase === "LOADING" || snapshot.phase === "SENDING" || snapshot.phase === "PAUSED";
  const result = snapshot.result;
  const history = result && "status" in result ? result.status === "ALREADY_ATTEMPTED" ? result.result : null : result;
  const confirmed = result && ("status" in result ? result.status === "CONFIRMED" || history?.outcome === "CONFIRMED" : result.outcome === "CONFIRMED");
  return <>
    <PersonalCorrelatedCalendarReviewList workspaceId={workspaceId} renderReviewControls={review => <Button tone="secondary"
      disabled={busy || snapshot.capacityBlocked} onPress={() => void lifecycle.select(review.reviewId)}>{text("Vérifier cet ajout", "Check this addition")}</Button>} />
    <Card><Label>{text("Ajout à Google Agenda", "Add to Google Calendar")}</Label>
      {snapshot.phase === "PAUSED" ? <Notice>{text("Reviens dans cet écran pour consulter le suivi.", "Return to this screen to view the result.")}</Notice> : null}
      {snapshot.phase === "LOADING" ? <Notice>{text("Vérification en cours…", "Checking…")}</Notice> : null}
      {snapshot.phase === "IDLE" ? <Notice>{text("Choisis « Vérifier cet ajout » sous le rendez-vous voulu. Rien n’est ajouté à cette étape.", "Choose “Check this addition” below the appointment you want. Nothing is added at that step.")}</Notice> : null}
      {snapshot.phase === "SENDING" ? <Notice>{text("Approbation en cours. Ne répète pas la demande.", "Approval in progress. Do not repeat the request.")}</Notice> : null}
      {snapshot.phase === "EXPIRED" ? <Notice>{text("La vérification a expiré. Aucun bouton d’ajout n’est réactivé par ce suivi.", "The review expired. This result panel does not re-enable approval.")}</Notice> : null}
      {snapshot.phase === "UNKNOWN" || snapshot.phase === "UNAVAILABLE" ? <Notice>{text("Ajout non confirmé ou vérification indisponible. Consulte le résultat enregistré; ne renvoie pas la demande.", "Addition unconfirmed or review unavailable. Check the recorded result; do not resend.")}</Notice> : null}
      {snapshot.capacityBlocked ? <Notice>{text("Le registre local est indisponible ou plein. Aucun nouvel ajout n’est permis. Le suivi reste accessible.", "Local attempt storage is unavailable or full. New approvals are disabled; result checks remain available.")}</Notice> : null}
      {confirmed ? <Notice>{text("Une confirmation de cet ajout est enregistrée. Ce suivi ne vérifie pas l’état actuel de Google Agenda.", "A confirmation of this addition is recorded. This view does not verify Google Calendar’s current state.")}</Notice> : history?.outcome === "PENDING_RESULT" ? <Notice>{text("Traitement enregistré, résultat encore non confirmé. Ne répète pas l’ajout.", "Processing recorded; result not confirmed yet. Do not repeat the addition.")}</Notice> : history?.outcome === "UNKNOWN" ? <Notice>{text("Résultat incertain. Vérifie ton agenda; aucun nouvel essai automatique.", "Outcome uncertain. Check your calendar; there is no automatic retry.")}</Notice> : history?.outcome === "NOT_ATTEMPTED" ? <Notice>{text("Aucune approbation enregistrée à cette lecture. Une tentative locale reste bloquée si son résultat est inconnu.", "No approval recorded at this read. An unknown local attempt stays blocked.")}</Notice> : null}
      {snapshot.selectedReviewId ? <Button tone="secondary" disabled={busy} onPress={() => void lifecycle.history(snapshot.selectedReviewId!)}>{text("Vérifier le résultat enregistré", "Check the recorded result")}</Button> : null}
      {history?.outcome === "CONFIRMED" && snapshot.selectedReviewId ? <Button tone="secondary" disabled={busy} onPress={() => void lifecycle.dismiss(snapshot.selectedReviewId!)}>{text("Retirer ce suivi local confirmé", "Dismiss this confirmed local entry")}</Button> : null}
    </Card>
    {snapshot.offer ? <View style={{ gap: 12 }}><Label>{text("Version exacte à approuver ci-dessous", "Exact version to approve below")}</Label>
      <PersonalCorrelatedCalendarReviewCard entry={snapshot.offer.review} locale={locale} />
      <Notice>{text("Compare les deux SMS, le titre, les heures et le fuseau ci-dessus. Le bouton suivant approuve seulement cette version.", "Compare both texts, title, times and time zone above. The following button approves only this version.")}</Notice>
      <Button disabled={snapshot.phase !== "OFFER"} onPress={() => void lifecycle.send()}>{text("Ajouter cet événement exact à Google Agenda", "Add this exact event to Google Calendar")}</Button>
    </View> : null}
    {snapshot.markers.length ? <Card><Label>{text("Tentatives conservées sur cet appareil", "Attempts retained on this device")}</Label>
      <Text style={sharedStyles.muted}>{text("Ce suivi reste disponible après l’expiration des textos. Il ne relance jamais un ajout. La capacité locale est limitée et peut être atteinte avant 20 entrées.", "This result history remains available after the texts expire. It never repeats an addition. Local capacity is limited and may be reached before 20 entries.")}</Text>
      {snapshot.markers.map((marker, index) => <Button key={marker.reviewId} tone="secondary" disabled={busy} onPress={() => void lifecycle.history(marker.reviewId)}>{text(`Vérifier la tentative enregistrée ${index + 1}`, `Check retained attempt ${index + 1}`)}</Button>)}
    </Card> : null}
  </>;
}

/** Current identity isolation is a display fence, never server authorization. */
export function PersonalCorrelatedCalendarApproval({ workspaceId }: { workspaceId: string }) {
  const { activeWorkspace, signedIn, sessionPending, bootstrap } = useMobileSession();
  const auth: { data: unknown; isPending: boolean } = authClient.useSession();
  const sessionKey = correlatedCalendarSessionKey({ identity: auth.data, pending: sessionPending || auth.isPending, signedIn,
    bootstrapUserId: bootstrap?.user.id, workspaceId, activeWorkspaceId: activeWorkspace?.id, role: activeWorkspace?.role });
  let apiOrigin: string | null = null; try { apiOrigin = mobileApiBaseUrl(); } catch { /* no configured origin, no approval */ }
  const key = sessionKey && apiOrigin ? JSON.stringify([sessionKey, apiOrigin]) : null;
  const currentScope = useMemo(() => scopeFence(), []);
  useLayoutEffect(() => { currentScope.set(key); return () => currentScope.set(null); }, [currentScope, key]);
  const isCurrentScope = useCallback(() => currentScope.matches(key), [currentScope, key]);
  if (!sessionKey || !correlatedApprovalId.safeParse(bootstrap?.user.id).success) return null;
  if (!key || !apiOrigin) return <PersonalCorrelatedCalendarReviewList workspaceId={workspaceId} />;
  return <ScopedCorrelatedCalendarApproval key={key} workspaceId={workspaceId} ownerId={bootstrap!.user.id} apiOrigin={apiOrigin}
    locale={mobileProductLocale(activeWorkspace?.defaultLocale)} isCurrentScope={isCurrentScope} />;
}
