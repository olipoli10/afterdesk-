import { StyleSheet, Text, View } from "react-native";
import { Button, Card, Empty, Heading, Label, Notice, Screen, sharedStyles } from "@/components/ui";
import { mobileOutboxLabel } from "@/lib/outbox";
import { useMobileSession } from "@/state/mobile-session";

const STATE_LABEL = {
  QUEUED: "En attente — jamais envoyée automatiquement",
  SENDING: "Tentative en cours",
  CONFIRMED: "Confirmée",
  REPLAYED: "Déjà appliquée — aucun doublon",
  CONFLICT: "Conflit — une nouvelle décision est requise",
  REFUSED: "Refusée — aucune action appliquée",
  OUTCOME_UNKNOWN: "Résultat inconnu — même commande prête à réessayer",
} as const;

export default function OutboxScreen() {
  const {
    outboxEntries,
    outboxLoadState,
    publicError,
    retryOutboxEntry,
    discardOutboxEntry,
  } = useMobileSession();
  return (
    <Screen>
      <Heading
        eyebrow="RÉCUPÉRATION"
        title="Commandes locales"
        body="Les commandes survivent à une panne ou un redémarrage. ENDVERA ne les renvoie jamais automatiquement."
      />
      <Card>
        <Label>Règle</Label>
        <Text style={sharedStyles.success}>Chaque reprise conserve exactement le même identifiant anti-doublon.</Text>
      </Card>
      {publicError ? <Notice danger>{publicError}</Notice> : null}
      {outboxLoadState === "UNAVAILABLE" ? <Notice danger>La boîte locale chiffrée est indisponible.</Notice> : null}
      {outboxEntries.length === 0 ? <Card><Empty>Aucune commande locale.</Empty></Card> : null}
      {outboxEntries.map((entry) => {
        const retryable = entry.state === "QUEUED" || entry.state === "OUTCOME_UNKNOWN";
        return (
          <Card key={entry.entryId}>
            <View style={styles.row}>
              <Text style={sharedStyles.name}>{mobileOutboxLabel(entry)}</Text>
              <Text style={styles.state}>{entry.state}</Text>
            </View>
            <Text style={sharedStyles.muted}>{STATE_LABEL[entry.state]}</Text>
            <Text style={sharedStyles.muted}>{new Date(entry.updatedAt).toLocaleString("fr-CA")}</Text>
            {retryable ? (
              <Button onPress={() => void retryOutboxEntry(entry.entryId)}>
                Réessayer exactement cette commande
              </Button>
            ) : null}
            <Button tone="secondary" onPress={() => void discardOutboxEntry(entry.entryId)}>
              Retirer de cet appareil
            </Button>
          </Card>
        );
      })}
    </Screen>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: 10 },
  state: { color: "#d68a42", fontFamily: "monospace", fontSize: 11 },
});
