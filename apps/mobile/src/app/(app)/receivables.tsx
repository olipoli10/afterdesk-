import { Text, View } from "react-native";
import { FollowUpForm, NewReceivableForm, PaymentForm } from "@/components/receivable-forms";
import { Card, Empty, Heading, Label, Notice, Screen, sharedStyles } from "@/components/ui";
import { useMobileSession } from "@/state/mobile-session";

type OwnerReceivable = {
  id: string;
  invoiceReference: string;
  outstandingAmountMinor: number;
  currency: "CAD";
  version: number;
  status: string;
  dueAt: string;
  project: { code: string; name: string };
  contact: { id: string; displayName: string } | null;
};

function isOwnerReceivable(value: unknown): value is OwnerReceivable {
  return Boolean(
    value &&
      typeof value === "object" &&
      "outstandingAmountMinor" in value &&
      "invoiceReference" in value,
  );
}

function money(minor: number) {
  return new Intl.NumberFormat("fr-CA", { style: "currency", currency: "CAD" }).format(minor / 100);
}

export default function ReceivablesScreen() {
  const { cockpit, activeWorkspace, publicError } = useMobileSession();
  const canManage = activeWorkspace?.permissions.canManageReceivables ?? false;

  return (
    <Screen>
      <Heading
        eyebrow="ARGENT À ENCAISSER"
        title="Comptes à recevoir"
        body={canManage ? "Les montants viennent de PostgreSQL, jamais de la mémoire du téléphone." : "Ta vue terrain masque volontairement toute information financière."}
      />
      {publicError ? <Notice danger>{publicError}</Notice> : null}
      {canManage ? <NewReceivableForm /> : (
        <Card>
          <Label>Vue terrain</Label>
          <Text style={sharedStyles.success}>Montants, références et preuves financières masqués.</Text>
        </Card>
      )}
      {cockpit?.receivables.length ? cockpit.receivables.map((receivable) => {
        if (!isOwnerReceivable(receivable)) {
          return (
            <Card key={receivable.id}>
              <Label>{receivable.status}</Label>
              <Text style={sharedStyles.name}>{receivable.project.name}</Text>
              <Text style={sharedStyles.muted}>Échéance: {new Date(receivable.dueAt).toLocaleDateString("fr-CA")}</Text>
            </Card>
          );
        }
        const projectId = cockpit.projects.find((project) => project.code === receivable.project.code)?.id;
        return (
          <Card key={receivable.id}>
            <View style={sharedStyles.row}>
              <Label>{receivable.invoiceReference}</Label>
              <Text style={sharedStyles.value}>{money(receivable.outstandingAmountMinor)}</Text>
            </View>
            <Text style={sharedStyles.name}>{receivable.project.name}</Text>
            <Text style={sharedStyles.muted}>Statut: {receivable.status}</Text>
            <PaymentForm receivable={receivable} />
            <FollowUpForm receivable={receivable} projectId={projectId} />
          </Card>
        );
      }) : <Card><Empty>Aucun compte à recevoir.</Empty></Card>}
    </Screen>
  );
}
