import { useEffect, useState } from "react";
import { Pressable, StyleSheet, Text, TextInput } from "react-native";
import { Button, Card, Empty, Heading, Label, Loading, Notice, Screen, colors, sharedStyles } from "@/components/ui";
import {
  ACCOUNTING_POLICY_VERSION,
  createPrepareAccountingAccountCommand,
  createPrepareAccountingInvoiceCommand,
  formatAccountingDraftInspection,
  mobileAccountingDraftCommandSchema,
} from "@/lib/accounting";
import { useMobileSession } from "@/state/mobile-session";

function opaqueRef() {
  const bytes = globalThis.crypto.getRandomValues(new Uint8Array(32));
  return `accounting_${Array.from(bytes,(byte)=>byte.toString(16).padStart(2,"0")).join("")}`;
}

function money(minor:number,currency:string) {
  return new Intl.NumberFormat("fr-CA",{style:"currency",currency}).format(minor/100);
}

export default function AccountingScreen() {
  const {activeWorkspace,accountingCockpit,accountingLoadState,publicError,loadAccounting,submitAccountingCommand} = useMobileSession();
  const [selectedReceivableId,setSelectedReceivableId] = useState<string|null>(null);
  const [description,setDescription] = useState("");
  const [taxCode,setTaxCode] = useState("");
  const [taxMinor,setTaxMinor] = useState("0");
  const [provider,setProvider] = useState<"QUICKBOOKS_ONLINE"|"XERO">("QUICKBOOKS_ONLINE");
  const [busy,setBusy] = useState(false);
  useEffect(()=>{if(accountingLoadState === "IDLE") void loadAccounting();},[accountingLoadState,loadAccounting]);
  const account = accountingCockpit?.accounts.find((candidate)=>candidate.status === "PREPARED_DISABLED");
  const selected = accountingCockpit?.receivables.find(
    (item)=>item.id === (selectedReceivableId ?? accountingCockpit.receivables[0]?.id),
  );
  const field = activeWorkspace?.role === "FIELD_WORKER";
  const run = async (command:Parameters<typeof submitAccountingCommand>[0]) => {setBusy(true);await submitAccountingCommand(command).finally(()=>setBusy(false));};
  const prepareAccount = async () => {
    if (!activeWorkspace) return;
    await run(createPrepareAccountingAccountCommand({workspace:activeWorkspace,commandId:globalThis.crypto.randomUUID(),provider,accountRef:opaqueRef(),tenantRef:opaqueRef()}));
  };
  const prepareInvoice = async () => {
    if (!activeWorkspace || !account || !selected || !description.trim() || !taxCode.trim()) return;
    const tax = Number.parseInt(taxMinor,10);
    if (!Number.isSafeInteger(tax) || tax < 0 || tax > selected.originalAmountMinor) return;
    await run(createPrepareAccountingInvoiceCommand({workspace:activeWorkspace,commandId:globalThis.crypto.randomUUID(),accountId:account.id,
      receivableId:selected.id,expectedReceivableVersion:selected.version,description:description.trim(),
      baseAmountMinor:selected.originalAmountMinor-tax,taxCode:taxCode.trim(),taxAmountMinor:tax}));
  };
  const prepareReconciliation = async (observation:NonNullable<typeof accountingCockpit>["observations"][number]) => {
    if (!activeWorkspace || !account || !observation.receivableId) return;
    const receivable = accountingCockpit?.receivables.find((item)=>item.id === observation.receivableId);
    if (!receivable) return;
    await run(mobileAccountingDraftCommandSchema.parse({schemaVersion:1,action:"PREPARE_ACCOUNTING_RECONCILIATION",
      commandId:globalThis.crypto.randomUUID(),workspaceId:activeWorkspace.id,accountId:account.id,observationId:observation.id,
      receivableId:receivable.id,expectedReceivableVersion:receivable.version,expectedPolicyVersion:ACCOUNTING_POLICY_VERSION}));
  };
  const approve = async (draft:NonNullable<typeof accountingCockpit>["drafts"][number]) => {
    if (!activeWorkspace || !draft.payloadHash) return;
    await run(mobileAccountingDraftCommandSchema.parse({schemaVersion:1,action:"APPROVE_ACCOUNTING_DRAFT",
      commandId:globalThis.crypto.randomUUID(),workspaceId:activeWorkspace.id,draftId:draft.id,
      expectedVersion:draft.version,expectedPayloadHash:draft.payloadHash}));
  };

  return <Screen><Heading eyebrow="COMPTABILITÉ DE CHANTIER" title="Réconcilier avant d’écrire" body="ENDVERA compare les comptes à recevoir et prépare des opérations exactes. Aucun QuickBooks ou Xero réel n’est connecté; aucune écriture n’est publiée."/>
    {accountingLoadState === "LOADING"?<Loading label="Mémoire comptable…"/>:null}{publicError?<Notice danger>{publicError}</Notice>:null}
    {field?<Card><Empty>Les montants et opérations comptables sont réservés au propriétaire et au bureau.</Empty></Card>:<>
      <Card><Label>Connexion</Label>{account?<Notice>{account.provider} · préparation locale · aucun OAuth · aucune écriture externe</Notice>:<><Pressable onPress={()=>setProvider("QUICKBOOKS_ONLINE")} style={[styles.choice,provider==="QUICKBOOKS_ONLINE"&&styles.active]}><Text style={sharedStyles.name}>QuickBooks Online</Text></Pressable><Pressable onPress={()=>setProvider("XERO")} style={[styles.choice,provider==="XERO"&&styles.active]}><Text style={sharedStyles.name}>Xero</Text></Pressable><Button disabled={busy} onPress={prepareAccount}>Préparer l’accès {provider === "XERO"?"Xero":"QuickBooks"} désactivé</Button></>}</Card>
      {account?<Card><Label>Préparer une facture externe</Label>{accountingCockpit?.receivables.length?accountingCockpit.receivables.map((item)=><Pressable key={item.id} onPress={()=>setSelectedReceivableId(item.id)} style={[styles.choice,item.id===selected?.id&&styles.active]}><Text style={sharedStyles.name}>{item.invoiceReference}</Text><Text style={sharedStyles.muted}>{money(item.originalAmountMinor,item.currency)} · solde {money(item.outstandingAmountMinor,item.currency)} · v{item.version}</Text></Pressable>):<Empty>Aucun compte à recevoir canonique.</Empty>}{selected?<><TextInput style={styles.input} value={description} onChangeText={setDescription} placeholder="Description exacte du travail" placeholderTextColor={colors.muted}/><TextInput style={styles.input} value={taxCode} onChangeText={setTaxCode} placeholder="Code de taxe confirmé" placeholderTextColor={colors.muted}/><TextInput style={styles.input} value={taxMinor} onChangeText={setTaxMinor} keyboardType="number-pad" placeholder="Taxe en cents" placeholderTextColor={colors.muted}/><Button disabled={busy||!description.trim()||!taxCode.trim()} onPress={prepareInvoice}>Préparer sans publier</Button></>:null}</Card>:null}
      <Card><Label>Observations à réconcilier</Label>{accountingCockpit?.observations.length?accountingCockpit.observations.map((item)=><Card key={item.id}><Text style={sharedStyles.name}>{item.kind} · {item.amountMinor!==null&&item.currency?money(item.amountMinor,item.currency):"montant masqué"}</Text><Text style={sharedStyles.muted}>{item.matchStatus} · {item.matchReason}</Text>{["EXACT","PARTIAL"].includes(item.matchStatus)&&item.receivableId?<Button disabled={busy} onPress={()=>prepareReconciliation(item)}>Préparer la réconciliation</Button>:<Notice danger>Révision requise; aucun solde modifié.</Notice>}</Card>):<Empty>Aucune observation normalisée.</Empty>}</Card>
      <Card><Label>Opérations préparées</Label>{accountingCockpit?.drafts.length?accountingCockpit.drafts.map((draft)=><Card key={draft.id}><Text style={sharedStyles.name}>{draft.kind} · {draft.provider}</Text><Text style={sharedStyles.muted}>Version {draft.version} · {draft.status}</Text><Label>Détails exacts à approuver</Label><Text selectable style={styles.payload}>{formatAccountingDraftInspection(draft)}</Text>{draft.status === "PREPARED_UNPOSTED"?<Button disabled={busy} onPress={()=>approve(draft)}>Approuver exactement</Button>:<Notice>Approuvé localement; écriture externe bloquée.</Notice>}</Card>):<Empty>Aucune opération préparée.</Empty>}</Card>
    </>}
  </Screen>;
}

const styles = StyleSheet.create({
  choice:{borderWidth:1,borderColor:colors.border,borderRadius:12,padding:12,marginTop:8},
  active:{borderColor:colors.accent,backgroundColor:colors.panel},
  input:{borderWidth:1,borderColor:colors.border,borderRadius:12,color:colors.text,padding:12,marginTop:12},
  payload:{color:colors.muted,fontFamily:"monospace",fontSize:12,lineHeight:18,marginTop:8},
});
