import { useMemo, useState } from "react";
import { StyleSheet, Text, TextInput, View } from "react-native";
import { Button, Card, Label, Notice, colors, sharedStyles } from "@/components/ui";
import {
  createFollowUpAttempt,
  createPaymentAttempt,
  createReceivableAttempt,
} from "@/lib/commands";
import type { MobileEconomicCommand } from "@/lib/invoices";
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
  const { activeWorkspace, latestAttempt, submitAttempt, loadEconomicCockpit } = useMobileSession();
  const [amount, setAmount] = useState("");
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    if (!activeWorkspace) return;
    setError(null);
    try {
      const amountMinor = dollarsToMinor(amount);
      if (amountMinor > receivable.outstandingAmountMinor) throw new Error("AMOUNT_INVALID");
      const result = await submitAttempt(
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
      if (result.state === "CONFIRMED" || result.state === "REPLAYED") {
        await loadEconomicCockpit();
      }
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

type Readiness = {
  loopId: string;
  projectId: string;
  projectCode: string;
  projectName: string;
  stateVersion: number;
  status: "WAITING_FOR_EVIDENCE" | "WAITING_FOR_VERIFICATION" | "READY_TO_INVOICE";
  amountMinor: number | null;
};

export function IssueReadyInvoiceForm({ readiness }: { readiness: Readiness }) {
  const {
    activeWorkspace,
    cockpit,
    economicCockpitLoadState,
    submitEconomicCommand,
  } = useMobileSession();
  const contact = cockpit?.contacts.find((candidate) => candidate.project?.id === readiness.projectId);
  const [reference, setReference] = useState(`${readiness.projectCode}-${todayInput().replaceAll("-", "")}`);
  const [issuedAt, setIssuedAt] = useState(todayInput());
  const [dueAt, setDueAt] = useState(futureInput(30));
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    if (!activeWorkspace || !contact || readiness.status !== "READY_TO_INVOICE") return;
    setError(null);
    try {
      const issued = dateInputToIso(issuedAt);
      const due = dateInputToIso(dueAt);
      if (due < issued) throw new Error("DATE_INVALID");
      const command: MobileEconomicCommand = {
        schemaVersion: 1,
        commandId: globalThis.crypto.randomUUID(),
        workspaceId: activeWorkspace.id,
        action: "ISSUE_READY_INVOICE",
        openLoopId: readiness.loopId,
        expectedLoopVersion: readiness.stateVersion,
        contactId: contact.id,
        invoiceReference: reference,
        issuedAt: issued,
        dueAt: due,
      };
      await submitEconomicCommand(command);
    } catch {
      setError("La facture doit garder le bon chantier, le bon contact et des dates valides.");
    }
  }

  if (readiness.status !== "READY_TO_INVOICE") return null;
  return (
    <View style={styles.formSection}>
      <Text style={sharedStyles.success}>Dossier prêt: {readiness.projectName}</Text>
      <Text style={sharedStyles.muted}>
        Montant canonique: {readiness.amountMinor === null ? "inconnu" : `${(readiness.amountMinor / 100).toFixed(2)} $ CAD`}
      </Text>
      <Text style={sharedStyles.muted}>Destinataire: {contact?.displayName ?? "contact du chantier requis"}</Text>
      <TextInput value={reference} onChangeText={setReference} placeholder="Référence" placeholderTextColor={colors.muted} style={styles.input} />
      <View style={sharedStyles.row}>
        <TextInput value={issuedAt} onChangeText={setIssuedAt} placeholder="Émission" placeholderTextColor={colors.muted} style={[styles.input, styles.half]} />
        <TextInput value={dueAt} onChangeText={setDueAt} placeholder="Échéance" placeholderTextColor={colors.muted} style={[styles.input, styles.half]} />
      </View>
      {error ? <Notice danger>{error}</Notice> : null}
      <Button
        onPress={submit}
        disabled={!contact || !reference.trim() || economicCockpitLoadState === "LOADING"}
      >
        Enregistrer la facture prête
      </Button>
    </View>
  );
}

type EconomicReceivable = {
  id: string;
  version: number;
  outstandingAmountMinor: number;
  activePromise: {
    id: string;
    version: number;
    promisedAmountMinor: number;
    promisedFor: string;
  } | null;
};

export function PaymentPromiseForm({ receivable }: { receivable: EconomicReceivable }) {
  const { activeWorkspace, economicCockpitLoadState, submitEconomicCommand } = useMobileSession();
  const [amount, setAmount] = useState("");
  const [promisedFor, setPromisedFor] = useState(futureInput(7));
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    if (!activeWorkspace || receivable.activePromise) return;
    setError(null);
    try {
      const amountMinor = dollarsToMinor(amount);
      if (amountMinor > receivable.outstandingAmountMinor) throw new Error("AMOUNT_INVALID");
      await submitEconomicCommand({
        schemaVersion: 1,
        commandId: globalThis.crypto.randomUUID(),
        workspaceId: activeWorkspace.id,
        action: "RECORD_PAYMENT_PROMISE",
        receivableId: receivable.id,
        expectedReceivableVersion: receivable.version,
        promisedAmountMinor: amountMinor,
        currency: "CAD",
        promisedFor: dateInputToIso(promisedFor),
        sourceRef: "mobile:user-recorded-payment-promise",
      });
      setAmount("");
    } catch {
      setError("La promesse doit avoir un montant inférieur ou égal au solde et une date valide.");
    }
  }

  if (receivable.activePromise) return null;
  return (
    <View style={styles.formSection}>
      <Label>Promesse de paiement</Label>
      <TextInput value={amount} onChangeText={setAmount} placeholder="Montant promis ($)" placeholderTextColor={colors.muted} keyboardType="decimal-pad" style={styles.input} />
      <TextInput value={promisedFor} onChangeText={setPromisedFor} placeholder="AAAA-MM-JJ" placeholderTextColor={colors.muted} style={styles.input} />
      {error ? <Notice danger>{error}</Notice> : null}
      <Button tone="secondary" onPress={submit} disabled={!amount.trim() || economicCockpitLoadState === "LOADING"}>Enregistrer la promesse</Button>
    </View>
  );
}

export function ResolvePaymentPromiseForm({ receivable }: { receivable: EconomicReceivable }) {
  const { activeWorkspace, economicCockpitLoadState, submitEconomicCommand } = useMobileSession();
  const [error, setError] = useState<string | null>(null);
  const promise = receivable.activePromise;

  async function resolve(outcome: "KEPT" | "BROKEN" | "REVOKED") {
    if (!activeWorkspace || !promise) return;
    setError(null);
    try {
      await submitEconomicCommand({
        schemaVersion: 1,
        commandId: globalThis.crypto.randomUUID(),
        workspaceId: activeWorkspace.id,
        action: "RESOLVE_PAYMENT_PROMISE",
        receivableId: receivable.id,
        promiseId: promise.id,
        expectedReceivableVersion: receivable.version,
        expectedPromiseVersion: promise.version,
        outcome,
        occurredAt: new Date().toISOString(),
        reason: outcome === "KEPT"
          ? "Paiement correspondant enregistré."
          : outcome === "BROKEN"
            ? "Date promise dépassée sans paiement correspondant."
            : "Promesse révoquée par un utilisateur autorisé.",
      });
    } catch {
      setError("ENDVERA refuse ce résultat tant que les faits de paiement et la date ne le prouvent pas.");
    }
  }

  if (!promise) return null;
  return (
    <View style={styles.formSection}>
      <Label>Promesse active</Label>
      <Text style={sharedStyles.muted}>
        {(promise.promisedAmountMinor / 100).toFixed(2)} $ prévu le {new Date(promise.promisedFor).toLocaleDateString("fr-CA")}
      </Text>
      {error ? <Notice danger>{error}</Notice> : null}
      <Button disabled={economicCockpitLoadState === "LOADING"} onPress={() => void resolve("KEPT")}>Confirmer tenue</Button>
      <Button tone="secondary" disabled={economicCockpitLoadState === "LOADING"} onPress={() => void resolve("BROKEN")}>Marquer non tenue</Button>
      <Button tone="secondary" disabled={economicCockpitLoadState === "LOADING"} onPress={() => void resolve("REVOKED")}>Révoquer</Button>
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
