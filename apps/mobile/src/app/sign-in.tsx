import { useState } from "react";
import { KeyboardAvoidingView, Platform, StyleSheet, Text, TextInput, View } from "react-native";
import { authClient } from "@/lib/auth-client";
import { Button, Card, Heading, Notice, Screen, colors } from "@/components/ui";

export default function SignInScreen() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function signIn() {
    if (!email.trim() || password.length < 10 || busy) return;
    setBusy(true);
    setError(null);
    try {
      const result = await authClient.signIn.email({
        email: email.trim().toLowerCase(),
        password,
      });
      setPassword("");
      if (result.error) setError("Connexion refusée. Vérifie tes informations.");
    } catch {
      setError("Connexion impossible pour le moment.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <KeyboardAvoidingView style={styles.fill} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <Screen>
        <View style={styles.brand}>
          <Text style={styles.brandText}>ENDVERA</Text>
        </View>
        <Heading
          eyebrow="ASSISTANT D’OPÉRATIONS"
          title="Ton chantier dans ta poche."
          body="Connecte-toi au même compte ENDVERA. Ton mot de passe n’est jamais conservé sur l’appareil."
        />
        <Card>
          <Text style={styles.label}>Courriel</Text>
          <TextInput
            value={email}
            onChangeText={setEmail}
            autoCapitalize="none"
            autoComplete="email"
            keyboardType="email-address"
            placeholder="toi@entreprise.ca"
            placeholderTextColor={colors.muted}
            style={styles.input}
          />
          <Text style={styles.label}>Mot de passe</Text>
          <TextInput
            value={password}
            onChangeText={setPassword}
            autoCapitalize="none"
            autoComplete="current-password"
            secureTextEntry
            placeholder="••••••••••"
            placeholderTextColor={colors.muted}
            style={styles.input}
            onSubmitEditing={signIn}
          />
          {error ? <Notice danger>{error}</Notice> : null}
          <Button onPress={signIn} disabled={busy || !email.trim() || password.length < 10}>
            {busy ? "Connexion…" : "Ouvrir ENDVERA"}
          </Button>
        </Card>
      </Screen>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1, backgroundColor: colors.background },
  brand: { alignSelf: "flex-start", borderColor: colors.border, borderWidth: 1, paddingHorizontal: 14, paddingVertical: 10, borderRadius: 12 },
  brandText: { color: colors.text, fontSize: 16, fontWeight: "800", letterSpacing: 3 },
  label: { color: colors.muted, fontSize: 12, fontWeight: "700", textTransform: "uppercase", letterSpacing: 1.2 },
  input: { backgroundColor: colors.panelStrong, color: colors.text, borderWidth: 1, borderColor: colors.border, borderRadius: 12, paddingHorizontal: 14, minHeight: 50, fontSize: 16 },
});
