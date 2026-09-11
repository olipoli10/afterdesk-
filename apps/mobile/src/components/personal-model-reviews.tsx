import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AppState, Platform, Text, View } from "react-native";
import { Button, Card, Label, Notice, sharedStyles } from "@/components/ui";
import { MobileApi } from "@/lib/api";
import { authClient } from "@/lib/auth-client";
import { PersonalCalendarDraftTimes } from "@/components/personal-calendar-draft-times";
import { createPersonalCalendarApprovalFence, loadPersonalModelReviews, personalCalendarApprovalReceiptSchema, personalModelActionLabel, personalModelActionStatus, personalModelCalendarApproval, personalModelDraftFields, personalModelNextDecision, type PersonalModelReviewAction, type PersonalModelReviews } from "@/lib/personal-model-reviews";

/** Read-only projection; calendar additions use the existing separate explicit approval API. */
export function PersonalModelReviewList({ workspaceId }: { workspaceId: string }) {
  const api = useMemo(() => new MobileApi({ getCookie: () => authClient.getCookie(), browserManagedCredentials: Platform.OS === "web" }), []);
  const [data, setData] = useState<PersonalModelReviews | null>(null); const [unavailable, setUnavailable] = useState(false); const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false); const [approvalMessage, setApprovalMessage] = useState<string | null>(null);
  const [fence] = useState(createPersonalCalendarApprovalFence);
  const mounted = useRef(false); const version = useRef(0); const lifecycle = useRef(0); const busyRef = useRef(false); const loadingRef = useRef(true);
  const reload = useCallback(async () => {
    const current = ++version.current; loadingRef.current = true; if (mounted.current) setLoading(true);
    const result = await loadPersonalModelReviews(() => api.personalModelReviews(workspaceId));
    if (!mounted.current || current !== version.current) return;
    setData(result.data); setUnavailable(result.unavailable); setLoading(false); loadingRef.current = false;
  }, [api, workspaceId]);
  useEffect(() => {
    mounted.current = true; void reload(); const sub = AppState.addEventListener("change", state => { if (state === "active") void reload(); });
    return () => { mounted.current = false; version.current += 1; lifecycle.current += 1; sub.remove(); };
  }, [reload]);
  async function approveCalendar(action: PersonalModelReviewAction) {
    if (!mounted.current || busyRef.current || loadingRef.current) return;
    const approval = fence.begin(action); if (!approval) return;
    const epoch = lifecycle.current; const current = () => mounted.current && epoch === lifecycle.current;
    busyRef.current = true; setBusy(true); setApprovalMessage("Approbation transmise — attends la confirmation, sans répéter.");
    try {
      const receipt = action.executionRoute === "ANDROID_DEVICE"
        ? await api.approvePersonalDeviceCalendar(workspaceId, approval.operationId, approval.expectedRequestHash)
        : await api.approvePersonalCalendar(workspaceId, approval.operationId, approval.expectedRequestHash);
      if (!current()) return;
      if (action.executionRoute === "ANDROID_DEVICE") {
        setApprovalMessage("Action autorisée. Le téléphone va la réclamer une seule fois et retourner un reçu.");
      } else {
        personalCalendarApprovalReceiptSchema.parse(receipt);
        setApprovalMessage("Le serveur a reçu la confirmation de Google pour cet ajout. L’état est actualisé ci-dessous.");
      }
    } catch { if (current()) setApprovalMessage("Ajout non confirmé. Aucune relance automatique : vérifie l’état et ton agenda avant toute autre demande."); }
    finally { if (current()) await reload(); if (current()) { busyRef.current = false; setBusy(false); } }
  }
  return <>
    <Card>
      <Label>Ce qu’ENDVERA a compris de tes SMS</Label>
      <Text style={sharedStyles.muted}>Compare tes mots originaux aux propositions. L’interprétation de l’IA n’est pas vérifiée. Aucun calendrier n’est lu ici; tout ajout exige ton approbation explicite du brouillon exact.</Text>
      {loading ? <Notice>Actualisation des demandes…</Notice> : unavailable ? <Notice>Demandes indisponibles. Aucun ancien état n’est présenté comme actuel.</Notice>
        : data?.reviews.length === 0 ? <Notice>Aucune demande interprétée à afficher. Cela ne prouve pas que la connexion IA fonctionne déjà.</Notice> : null}
      {!loading && data?.unavailableCount ? <Notice>{data.unavailableCount} demande(s) ne peuvent pas être vérifiées et ne sont pas affichées.</Notice> : null}
      {approvalMessage ? <Notice>{approvalMessage}</Notice> : null}
      <Button tone="secondary" disabled={loading || busy} onPress={() => void reload()}>Actualiser les demandes</Button>
    </Card>
    {!loading && !unavailable ? data?.reviews.map(review => <Card key={review.sourceOperationId}>
      <Label>Ton SMS original — intégral</Label>
      <Text selectable style={sharedStyles.value}>{review.source.text}</Text>
      <Text style={sharedStyles.muted}>Reçu : {review.source.receivedAt} · Fuseau de référence : {review.source.timezone}</Text>
      <Notice>Prochaine décision : toi, comme propriétaire. Les coûts ne sont pas encore rapprochés avec une facture fournisseur.</Notice>
      {review.actions.map((action, index) => <View key={action.actionId} style={{ gap: 8, paddingVertical: 12 }}>
        <Label>{index + 1} · {personalModelActionLabel(action)}</Label>
        <Notice>{personalModelActionStatus(action)}</Notice>
        {action.question ? <Text selectable style={sharedStyles.value}>{action.question}</Text> : null}
        {action.draft ? <Text style={sharedStyles.muted}>{action.currentStatus === "UNAVAILABLE_OR_CHANGED" ? "Ancienne proposition enregistrée — à revérifier, pas un brouillon actuel" : "Proposition exacte enregistrée"}</Text> : null}
        {action.kind === "PREPARE_CALENDAR_EVENT" && action.draft ? <PersonalCalendarDraftTimes workspaceId={workspaceId} draft={action.draft} showRaw={false} /> : null}
        {personalModelDraftFields(action).map(field => <View key={field.key} style={{ gap: 4 }}><Text style={sharedStyles.muted}>{field.label}</Text><Text selectable style={sharedStyles.value}>{field.value}</Text></View>)}
        <Text style={sharedStyles.muted}>{personalModelNextDecision(action)}</Text>
        {personalModelCalendarApproval(action) ? <>
          {fence.attempted(action.operationId!) ? <Notice>Une approbation a déjà été tentée dans cet écran. Ne la répète pas si le résultat est encore inconnu.</Notice> : null}
          <Button disabled={busy || loading || fence.attempted(action.operationId!)} onPress={() => void approveCalendar(action)}>
            {action.executionRoute === "ANDROID_DEVICE" ? "Approuver et ajouter au calendrier de ce téléphone" : "Approuver cet événement exact et l’ajouter à Google Agenda"}
          </Button>
        </> : null}
      </View>)}
    </Card>) : null}
  </>;
}
