import { useEffect } from "react";
import { Text, View } from "react-native";
import {
  IssueReadyInvoiceForm,
  PaymentForm,
  PaymentPromiseForm,
  ResolvePaymentPromiseForm,
} from "@/components/receivable-forms";
import {
  Card,
  Empty,
  Heading,
  Label,
  Loading,
  Notice,
  Screen,
  sharedStyles,
} from "@/components/ui";
import type { MobileEconomicCockpit } from "@/lib/invoices";
import { useMobileSession } from "@/state/mobile-session";

type OwnerCockpit = Extract<MobileEconomicCockpit, { role: "OWNER" | "OFFICE_MANAGER" }>;

const NEXT_DECISION: Record<string, string> = {
  WAIT_UNTIL_DUE: "Attendre l’échéance",
  WAIT_FOR_PROMISE: "Attendre la promesse",
  REVIEW_PAYMENT_PROMISE: "Vérifier la promesse",
  COLLECT_OVERDUE_INVOICE: "Relancer la facture échue",
  COLLECT_BROKEN_PROMISE: "Relancer la promesse non tenue",
  NO_ACTION: "Aucune action",
};

function money(minor: number) {
  return new Intl.NumberFormat("fr-CA", { style: "currency", currency: "CAD" }).format(minor / 100);
}

function ownerCockpit(value: MobileEconomicCockpit | null): OwnerCockpit | null {
  if (!value || value.role === "FIELD_WORKER") return null;
  return value;
}

export default function ReceivablesScreen() {
  const {
    activeWorkspace,
    economicCockpit,
    economicCockpitLoadState,
    publicError,
    loadEconomicCockpit,
  } = useMobileSession();
  const canManage = activeWorkspace?.permissions.canManageReceivables ?? false;
  const office = ownerCockpit(economicCockpit);

  useEffect(() => {
    if (economicCockpitLoadState === "IDLE") void loadEconomicCockpit();
  }, [economicCockpitLoadState, loadEconomicCockpit]);

  return (
    <Screen>
      <Heading
        eyebrow="TRAVAIL → FACTURE → PAIEMENT"
        title="Facturation et comptes à recevoir"
        body={canManage
          ? "ENDVERA relie le dossier prêt, la facture, le solde, les promesses et la prochaine décision."
          : "Ta vue terrain est volontairement vide de toute information financière."}
      />
      {economicCockpitLoadState === "LOADING" ? <Loading label="État financier en reconstruction…" /> : null}
      {publicError ? <Notice danger>{publicError}</Notice> : null}
      {!canManage ? (
        <Card>
          <Label>Vue terrain</Label>
          <Text style={sharedStyles.success}>Aucun montant, facture, solde ou promesse n’est visible.</Text>
        </Card>
      ) : null}

      {office ? (
        <>
          <Heading
            eyebrow="PRÊT À FACTURER"
            title="Dossiers de travaux"
            body="Une facture ne peut être enregistrée ici que si le dossier canonique est réellement prêt."
          />
          {office.invoiceReadiness.length ? office.invoiceReadiness.map((readiness) => {
            const alreadyIssued = office.receivables.some((item) => item.openLoopId === readiness.loopId);
            return (
              <Card key={readiness.loopId}>
                <View style={sharedStyles.row}>
                  <Label>{readiness.projectCode}</Label>
                  <Text style={readiness.status === "READY_TO_INVOICE" ? sharedStyles.success : sharedStyles.muted}>
                    {readiness.status}
                  </Text>
                </View>
                <Text style={sharedStyles.name}>{readiness.projectName}</Text>
                <Text style={sharedStyles.value}>{readiness.nextAction}</Text>
                {readiness.missing.length ? <Notice danger>Manque: {readiness.missing.join(", ")}</Notice> : null}
                {readiness.verificationRequired.length ? <Notice>À vérifier: {readiness.verificationRequired.join(", ")}</Notice> : null}
                {readiness.contradictionCount > 0 ? <Notice danger>{readiness.contradictionCount} contradiction(s) conservée(s).</Notice> : null}
                {alreadyIssued ? <Notice>Facture déjà liée à ce dossier.</Notice> : <IssueReadyInvoiceForm readiness={readiness} />}
              </Card>
            );
          }) : <Card><Empty>Aucun dossier de travail actif.</Empty></Card>}

          <Heading
            eyebrow="À ENCAISSER"
            title="Soldes et promesses"
            body="Une promesse n’est jamais traitée comme un paiement."
          />
          {office.receivables.length ? office.receivables.map((receivable) => (
            <Card key={receivable.id}>
              <View style={sharedStyles.row}>
                <Label>{receivable.invoiceReference}</Label>
                <Text style={sharedStyles.value}>{money(receivable.outstandingAmountMinor)}</Text>
              </View>
              <Text style={sharedStyles.name}>{receivable.projectName}</Text>
              <Text style={sharedStyles.muted}>
                {receivable.contactName ?? "Contact manquant"} · échéance {new Date(receivable.dueAt).toLocaleDateString("fr-CA")}
              </Text>
              <Notice>{NEXT_DECISION[receivable.nextDecision] ?? receivable.nextDecision}</Notice>
              <PaymentForm receivable={receivable} />
              <PaymentPromiseForm receivable={receivable} />
              <ResolvePaymentPromiseForm receivable={receivable} />
              {receivable.promises.length ? (
                <Text style={sharedStyles.muted}>
                  Historique: {receivable.promises.map((promise) => promise.status).join(" · ")}
                </Text>
              ) : null}
            </Card>
          )) : <Card><Empty>Aucun compte à recevoir émis.</Empty></Card>}
        </>
      ) : null}
      {economicCockpit ? <Notice>Aucun transport externe effectué.</Notice> : null}
    </Screen>
  );
}
