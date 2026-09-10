import { Fragment, useCallback, useLayoutEffect, useMemo, useSyncExternalStore, type ReactNode } from "react";
import { AppState, Platform } from "react-native";
import { useFocusEffect } from "expo-router";
import { Button, Card, Label, Notice } from "./ui";
import { PersonalCorrelatedCalendarReviewCard } from "./personal-correlated-calendar-review-card";
import { MobileApi, MobileApiError } from "../lib/api";
import { authClient } from "../lib/auth-client";
import { useMobileSession } from "../state/mobile-session";
import { mobileProductLocale } from "../lib/product-experience";
import { correlatedCalendarSessionKey } from "../lib/personal-correlated-calendar-list";
import { createCorrelatedCalendarListLifecycle } from "../lib/personal-correlated-calendar-list-lifecycle";
import type { PersonalCorrelatedCalendarReview } from "../lib/personal-correlated-calendar-review";
type Controls = (review: PersonalCorrelatedCalendarReview) => ReactNode;

function ScopedCorrelatedCalendarList({ workspaceId, locale, renderReviewControls }: { workspaceId: string; locale: "fr-CA" | "en-CA"; renderReviewControls?: Controls }) {
  const api = useMemo(() => new MobileApi({ getCookie: () => authClient.getCookie(), browserManagedCredentials: Platform.OS === "web" }), []);
  const lifecycle = useMemo(() => createCorrelatedCalendarListLifecycle({ workspaceId,
    read: signal => api.personalCorrelatedCalendarReviews(workspaceId, signal),
    isDisabled: error => error instanceof MobileApiError && error.status === 404,
  }), [api, workspaceId]);
  const snapshot = useSyncExternalStore(lifecycle.subscribe, lifecycle.getSnapshot, lifecycle.getSnapshot);
  useLayoutEffect(() => () => lifecycle.pause(), [lifecycle]);
  useFocusEffect(useCallback(() => {
    const change = () => { if (AppState.currentState === "active") lifecycle.activate(); else lifecycle.pause(); };
    // The event's value, not a potentially delayed native currentState snapshot, owns invalidation.
    const sub = AppState.addEventListener("change", state => { if (state === "active") lifecycle.activate(); else lifecycle.pause(); });
    const blur = AppState.addEventListener("blur", () => lifecycle.pause());
    const focus = AppState.addEventListener("focus", change);
    change();
    return () => { sub.remove(); blur.remove(); focus.remove(); lifecycle.pause(); };
  }, [lifecycle]));
  const text = (fr: string, en: string) => locale === "en-CA" ? en : fr;
  const phase = snapshot.phase;
  const messages = {
    PAUSED: text("La lecture reprendra quand cet écran sera actif.", "The review will refresh when this screen is active."),
    LOADING: text("Vérification des rendez-vous précisés par SMS…", "Checking appointments clarified by SMS…"),
    DISABLED: text("Cette lecture n’est pas activée ou n’est pas disponible pour ce compte.", "This review is not enabled or not available for this account."),
    UNAVAILABLE: text("Lecture indisponible. Réessaie pour vérifier l’état; aucune ancienne donnée n’est affichée.", "Review unavailable. Retry to check the state; no previous data is shown."),
    EXPIRED: text("La vérification a expiré. Actualise pour vérifier si une lecture est encore disponible.", "The review has expired. Refresh to check whether it is still available."),
  };
  return <>
    <Card><Label>{text("Rendez-vous précisés par SMS", "Appointments clarified by SMS")}</Label>
      {phase !== "READY" ? <Notice>{messages[phase]}</Notice> : snapshot.data?.reviews.length === 0
        ? <Notice>{text("Aucun rendez-vous précisé à afficher dans cette lecture.", "No clarified appointment to show in this review.")}</Notice> : null}
      {phase === "READY" && snapshot.data?.hasMore ? <Notice>{text("Seuls les cinq plus récents sont affichés. Cette vue n’est pas un historique complet.", "Only the five most recent are shown. This is not a complete history.")}</Notice> : null}
      <Button tone="secondary" disabled={phase === "PAUSED" || phase === "LOADING"} onPress={() => void lifecycle.reload()}>{text("Actualiser cette lecture", "Refresh this review")}</Button>
    </Card>
    {phase === "READY" ? snapshot.data?.reviews.map(review => <Fragment key={review.reviewId}><PersonalCorrelatedCalendarReviewCard entry={review} locale={locale} />{renderReviewControls?.(review)}</Fragment>) : null}
  </>;
}

/** Owner/session binding is local display isolation, not server authorization. */
export function PersonalCorrelatedCalendarReviewList({ workspaceId, renderReviewControls }: { workspaceId: string; renderReviewControls?: Controls }) {
  const { activeWorkspace, signedIn, sessionPending, bootstrap } = useMobileSession();
  const auth: { data: unknown; isPending: boolean } = authClient.useSession();
  const key = correlatedCalendarSessionKey({ identity: auth.data, pending: sessionPending || auth.isPending, signedIn,
    bootstrapUserId: bootstrap?.user.id, workspaceId, activeWorkspaceId: activeWorkspace?.id, role: activeWorkspace?.role });
  if (!key) return null;
  return <ScopedCorrelatedCalendarList key={key} workspaceId={workspaceId} locale={mobileProductLocale(activeWorkspace?.defaultLocale)} renderReviewControls={renderReviewControls} />;
}
