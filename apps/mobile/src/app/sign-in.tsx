import { useState } from "react";
import { Image, KeyboardAvoidingView, Platform, StyleSheet, Text, TextInput, View } from "react-native";
import { AppIcon } from "@/components/app-icon";
import { authClient } from "@/lib/auth-client";
import { mobileProductCopy } from "@/lib/product-experience";
import { Button, Card, Heading, Notice, Screen, colors, sharedStyles } from "@/components/ui";

export default function SignInScreen() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const locale = Intl.DateTimeFormat().resolvedOptions().locale.toLowerCase().startsWith("en") ? "en-CA" : "fr-CA";
  const copy = mobileProductCopy(locale);

  async function signIn() {
    if (!email.trim() || password.length < 10 || busy) return;
    setBusy(true);
    setError(null);
    try {
      const result = await authClient.signIn.email({ email: email.trim().toLowerCase(), password });
      setPassword("");
      if (result.error) setError(copy.auth.refused);
    } catch {
      setError(copy.auth.unavailable);
    } finally {
      setBusy(false);
    }
  }

  return (
    <KeyboardAvoidingView style={styles.fill} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <Screen contentContainerStyle={styles.screen}>
        <View style={styles.brandBlock}>
          <Image source={require("../../assets/images/icon.png")} style={styles.logo} />
          <Text style={styles.brand}>ENDVERA</Text>
        </View>

        <Heading eyebrow={copy.auth.eyebrow} title={copy.auth.title} body={copy.auth.body} />

        <View style={styles.trustRow}>
          <View style={styles.trustIcon}><AppIcon name="shield" color={colors.success} size={19} /></View>
          <Text style={sharedStyles.muted}>{copy.auth.trust}</Text>
        </View>

        <Card style={styles.formCard}>
          <View style={styles.field}>
            <Text style={styles.label}>{copy.auth.email}</Text>
            <TextInput
              accessibilityLabel={copy.auth.email}
              value={email}
              onChangeText={setEmail}
              autoCapitalize="none"
              autoComplete="email"
              keyboardType="email-address"
              placeholder="toi@entreprise.ca"
              placeholderTextColor={colors.subtle}
              style={styles.input}
            />
          </View>
          <View style={styles.field}>
            <Text style={styles.label}>{copy.auth.password}</Text>
            <TextInput
              accessibilityLabel={copy.auth.password}
              value={password}
              onChangeText={setPassword}
              autoCapitalize="none"
              autoComplete="current-password"
              secureTextEntry
              placeholder="••••••••••"
              placeholderTextColor={colors.subtle}
              style={styles.input}
              onSubmitEditing={signIn}
            />
          </View>
          {error ? <Notice danger>{error}</Notice> : null}
          <Button icon="arrow" accessibilityRole="button" accessibilityLabel={copy.auth.submit} accessibilityState={{ busy, disabled: busy || !email.trim() || password.length < 10 }} onPress={signIn} disabled={busy || !email.trim() || password.length < 10}>
            {busy ? copy.auth.submitting : copy.auth.submit}
          </Button>
        </Card>
      </Screen>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1, backgroundColor: colors.background },
  screen: { flexGrow: 1, justifyContent: "center", paddingTop: 48 },
  brandBlock: { alignSelf: "flex-start", flexDirection: "row", alignItems: "center", gap: 12, marginBottom: 8 },
  logo: { width: 52, height: 52, borderRadius: 15 },
  brand: { color: colors.text, fontSize: 17, fontWeight: "900", letterSpacing: 3.2 },
  trustRow: { flexDirection: "row", alignItems: "center", gap: 10 },
  trustIcon: { width: 38, height: 38, borderRadius: 13, alignItems: "center", justifyContent: "center", backgroundColor: "#10271E" },
  formCard: { marginTop: 2, gap: 18 },
  field: { gap: 8 },
  label: { color: colors.muted, fontSize: 11, fontWeight: "800", textTransform: "uppercase", letterSpacing: 1.2 },
  input: { backgroundColor: colors.panelStrong, color: colors.text, borderWidth: 1, borderColor: colors.border, borderRadius: 15, paddingHorizontal: 14, minHeight: 52, fontSize: 16 },
});
