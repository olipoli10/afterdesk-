import { useMemo, useState } from "react";
import { StyleSheet, Text, TextInput, View } from "react-native";
import { Button, Card, Label, Notice, colors, sharedStyles } from "@/components/ui";
import {
  createFollowUpAttempt,
  createPaymentAttempt,
  createReceivableAttempt,
} from "@/lib/commands";
import { useMobileSession } from "@/state/mobile-session";

function dateInputToIso(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new Error("DATE_INVALID");
  const date = new Date(`${value}T17:00:00.000Z`);
  if (Number.isNaN(date.getTime())) throw new Error("DATE_INVALID");
  return date.toISOString();
}

function dollarsToMinor(value: string) {
  const normalized = value.trim().replace(",", ".");
  if (!/^\d+(?:\.\d{1,2})?$/.test(normalized)) throw new Error("AMOUNT_INVALID");
  const minor = Math.round(Number(normalized) * 100);
  if (!Number.isSafeInteger(minor) || minor <= 0) throw new Error("AMOUNT_INVALID");
  return minor;
}

function todayInput() {
  return new Date().toISOString().slice(0, 10);
}

function futureInput(days: number) {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

export function NewReceivableForm() {
  const { cockpit, activeWorkspace, latestAttempt, submitAttempt } = useMobileSession();
  const project = cockpit?.projects[0];
  const [reference, setReference] = useState("");
  const [amount, setAmount] = useState("");
  const [issuedAt, setIssuedAt] = useState(todayInput());
  const [dueAt, setDueAt] = useState(futureInput(30));
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    if (!activeWorkspace || !project) return;
    setError(null);
    try {
      const issued = dateInputToIso(issuedAt);
      const due = dateInputToIso(dueAt);
      if (due < issued) throw new Error("DATE_INVALID");
      await submitAttempt(
        createReceivableAttempt({
          workspaceId: activeWorkspace.id,
          projectId: project.id,
          contactId: null,
          invoiceReference: reference,
          amountMinor: dollarsToMinor(amount),
          currency: "CAD",
          issuedAt: issued,
          dueAt: due,
          sourceRef: "mobile:user-entered-receivable",
        }),
      );
      setReference("");
      setAmount("");
    } catch {
      setError("Vérifie la référence, le montant et les dates.");
    }
  }

  return (
    <Card>
      <Label>Ajouter un compte à recevoir</Label>
      <Text style={sharedStyles.muted}>Chantier: {project?.name ?? "aucun chantier"}</Text>
      <TextInput value={reference} onChangeText={setReference} placeholder="Référence de facture" placeholderTextColor={colors.muted} style={styles.input} />
      <TextInput value={amount} onChangeText={setAmount} placeholder="Montant en dollars" placeholderTextColor={colors.muted} keyboardType="decimal-pad" style={styles.input} />
      <View style={sharedStyles.row}>
        <TextInput value={issuedAt} onChangeText={setIssuedAt} placeholder="AAAA-MM-JJ" placeholderTextColor={colors.muted} style={[styles.input, styles.half]} />
        <TextInput value={dueAt} onChangeText={setDueAt} placeholder="Échéance" placeholderTextColor={colors.muted} style={[styles.input, styles.half]} />
      </View>
      {error ? <Notice danger>{error}</Notice> : null}
      {latestAttempt?.command.type === "RECORD_RECEIVABLE" ? <Notice>{latestAttempt.state}</Notice> : null}
      <Button onPress={submit} disabled={!project || !reference.trim() || !amount.trim() || latestAttempt?.state === "SENDING"}>Enregistrer dans ENDVERA</Button>
    </Card>
  );
}

export function PaymentForm({
  receivable,
}: {
  receivable: { id: string; version: number; outstandingAmountMinor: number; invoiceReference: string };
}) {
  const { activeWorkspace, latestAttempt, submitAttempt } = useMobileSession();
  const [amount, setAmount] = useState("");
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    if (!activeWorkspace) return;
    setError(null);
    try {
      const amountMinor = dollarsToMinor(amount);
      if (amountMinor > receivable.outstandingAmountMinor) throw new Error("AMOUNT_INVALID");
      await submitAttempt(
        createPaymentAttempt({
          workspaceId: activeWorkspace.id,
          receivableId: receivable.id,
          expectedVersion: receivable.version,
          amountMinor,
          receivedAt: new Date().toISOString(),
          sourceRef: "mobile:user-confirmed-payment",
          note: "Paiement confirmé dans l’application mobile.",
        }),
      );
      setAmount("");
    } catch {
      setError("Le montant doit être positif et ne pas dépasser le solde.");
    }
  }

  return (
    <View style={styles.formSection}>
      <TextInput value={amount} onChangeText={setAmount} placeholder="Paiement reçu ($)" placeholderTextColor={colors.muted} keyboardType="decimal-pad" style={styles.input} />
      {error ? <Notice danger>{error}</Notice> : null}
      <Button tone="secondary" onPress={submit} disabled={!amount.trim() || latestAttempt?.state === "SENDING"}>Confirmer le paiement</Button>
    </View>
  );
}

export function FollowUpForm({
  receivable,
  projectId,
}: {
  receivable: { id: string; invoiceReference: string; contact: { id: string; displayName: string } | null };
  projectId: string | undefined;
}) {
  const { activeWorkspace, latestAttempt, submitAttempt } = useMobileSession();
  const defaultBody = useMemo(
    () => `Bonjour ${receivable.contact?.displayName ?? ""}, rappel concernant la facture ${receivable.invoiceReference}.`,
    [receivable.contact?.displayName, receivable.invoiceReference],
  );
  const [body, setBody] = useState(defaultBody);
  const [dueAt, setDueAt] = useState(futureInput(1));
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    if (!activeWorkspace || !projectId || !receivable.contact) return;
    setError(null);
    try {
      await submitAttempt(
        createFollowUpAttempt({
          workspaceId: activeWorkspace.id,
          projectId,
          contactId: receivable.contact.id,
          target: { kind: "RECEIVABLE_PAYMENT", receivableId: receivable.id },
          dueAt: dateInputToIso(dueAt),
          channel: "SMS",
          body,
        }),
      );
    } catch {
      setError("Le suivi doit avoir une date, un contact et un texte clair.");
    }
  }

  if (!receivable.contact) return null;
  return (
    <View style={styles.formSection}>
      <Text style={sharedStyles.muted}>Suivi destiné à {receivable.contact.displayName}. Aucun SMS n’est envoyé.</Text>
      <TextInput value={body} onChangeText={setBody} multiline placeholderTextColor={colors.muted} style={[styles.input, styles.multiline]} />
      <TextInput value={dueAt} onChangeText={setDueAt} placeholder="AAAA-MM-JJ" placeholderTextColor={colors.muted} style={styles.input} />
      {error ? <Notice danger>{error}</Notice> : null}
      <Button tone="secondary" onPress={submit} disabled={!body.trim() || latestAttempt?.state === "SENDING"}>Planifier sans envoyer</Button>
    </View>
  );
}

const styles = StyleSheet.create({
  input: { flexGrow: 1, backgroundColor: colors.panelStrong, color: colors.text, borderWidth: 1, borderColor: colors.border, borderRadius: 12, paddingHorizontal: 13, minHeight: 46, fontSize: 15 },
  half: { flexBasis: 0 },
  multiline: { minHeight: 92, paddingTop: 12, textAlignVertical: "top" },
  formSection: { gap: 10, paddingTop: 8, borderTopWidth: 1, borderTopColor: colors.border },
});
