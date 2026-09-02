import { useEffect, useState } from "react";
import { Text, View } from "react-native";
import {
  Button,
  Card,
  Heading,
  Label,
  Loading,
  Notice,
  Screen,
  sharedStyles,
} from "@/components/ui";
import type { MobileCalendarProviderStatus } from "@/lib/calendar-connectors";
import { useMobileSession } from "@/state/mobile-session";

function ProviderCard({ provider }: { provider: MobileCalendarProviderStatus }) {
  const { activeWorkspace, submitCalendarConnectorCommand } = useMobileSession();
  const [submitting, setSubmitting] = useState(false);
  const mayPrepare = ["NOT_CONFIGURED", "REVOKED", "ERROR"].includes(provider.status);
  const mayRevoke = provider.status === "PREPARED" || provider.status === "CONNECTED";

  const submit = (action: "PREPARE_CONNECTION" | "REVOKE_LOCAL", mode?: "READ_ONLY" | "READ_WRITE") => {
    if (!activeWorkspace) return;
    const commandId = globalThis.crypto.randomUUID();
    const base = {
      schemaVersion: 1 as const,
      commandId,
      requestId: commandId,
      idempotencyKey: commandId,
      workspaceId: activeWorkspace.id,
      provider: provider.provider,
      expectedStateVersion: provider.stateVersion,
    };
    const command = action === "PREPARE_CONNECTION"
      ? { ...base, action, mode: mode! }
      : { ...base, action };
    setSubmitting(true);
    void submitCalendarConnectorCommand(command).finally(() => setSubmitting(false));
  };

  return (
    <Card>
      <View style={sharedStyles.row}>
        <Label>{provider.label}</Label>
        <Text style={provider.status === "CONNECTED" ? sharedStyles.success : sharedStyles.muted}>
          {provider.status}
        </Text>
      </View>
      <Text style={sharedStyles.value}>{provider.nextAction}</Text>
      <Text style={sharedStyles.muted}>
        Lecture: {provider.readEnabled ? "oui" : "non"} · écriture: {provider.writeEnabled ? "oui" : "non"}
      </Text>
      <Text style={sharedStyles.muted}>
        Portées demandées: {provider.requestedScopes.length ? provider.requestedScopes.join(", ") : "aucune"}
      </Text>
      <Text style={sharedStyles.muted}>
        Portées accordées: {provider.grantedScopes.length ? provider.grantedScopes.join(", ") : "aucune"}
      </Text>
      {provider.missingConfiguration.length ? (
        <Notice danger>
          Configuration locale manquante: {provider.missingConfiguration.join(", ")}
        </Notice>
      ) : null}
      {mayPrepare ? (
        <View style={sharedStyles.stack}>
          <Button disabled={submitting} onPress={() => submit("PREPARE_CONNECTION", "READ_ONLY")}>
            Préparer l’accès lecture seulement
          </Button>
          <Button
            disabled={submitting}
            tone="secondary"
            onPress={() => submit("PREPARE_CONNECTION", "READ_WRITE")}
          >
            Préparer l’accès lecture et écriture
          </Button>
        </View>
      ) : null}
      {mayRevoke ? (
        <Button disabled={submitting} tone="secondary" onPress={() => submit("REVOKE_LOCAL")}>
          Révoquer l’accès local
        </Button>
      ) : null}
    </Card>
  );
}

export default function CalendarConnectionsScreen() {
  const {
    activeWorkspace,
    calendarConnectorCockpit,
    calendarConnectorLoadState,
    publicError,
    loadCalendarConnectors,
  } = useMobileSession();

  useEffect(() => {
    if (calendarConnectorLoadState === "IDLE") void loadCalendarConnectors();
  }, [calendarConnectorLoadState, loadCalendarConnectors]);

  return (
    <Screen>
      <Heading
        eyebrow="CALENDRIERS EXTERNES"
        title="Connexions calendrier"
        body="Prépare séparément Google Calendar ou Microsoft Outlook avec le minimum d’accès requis."
      />
      {calendarConnectorLoadState === "LOADING" ? (
        <Loading label="Connexions calendrier en reconstruction…" />
      ) : null}
      {publicError ? <Notice danger>{publicError}</Notice> : null}
      {activeWorkspace?.role === "FIELD_WORKER" ? (
        <Card>
          <Label>Vue terrain</Label>
          <Text style={sharedStyles.success}>
            Aucun compte, identifiant externe, secret ou contrôle de connexion n’est visible.
          </Text>
        </Card>
      ) : null}
      {calendarConnectorCockpit?.providers.map((provider) => (
        <ProviderCard key={provider.provider} provider={provider} />
      ))}
      <Notice>
        Cette étape prépare ou révoque uniquement l’autorité locale. Aucun OAuth, appel fournisseur ou transport externe n’est exécuté.
      </Notice>
    </Screen>
  );
}
