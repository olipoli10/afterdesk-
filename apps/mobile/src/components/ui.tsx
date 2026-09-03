import type { PropsWithChildren, ReactNode } from "react";
import {
  ActivityIndicator,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  View,
  type PressableProps,
} from "react-native";
import { MINIMUM_TOUCH_TARGET } from "@/lib/accessibility";

export const colors = {
  background: "#09090b",
  panel: "#151518",
  panelStrong: "#1d1d21",
  border: "#353137",
  text: "#f5f5f4",
  muted: "#a1a1aa",
  accent: "#d68a42",
  accentSoft: "#352418",
  danger: "#ff9b87",
  success: "#78d7a2",
};

export function Screen({ children }: PropsWithChildren) {
  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView contentContainerStyle={styles.screen} keyboardShouldPersistTaps="handled">
        {children}
      </ScrollView>
    </SafeAreaView>
  );
}

export function Heading({ eyebrow, title, body }: { eyebrow?: string; title: string; body?: string }) {
  return (
    <View style={styles.heading}>
      {eyebrow ? <Text style={styles.eyebrow}>{eyebrow}</Text> : null}
      <Text style={styles.title}>{title}</Text>
      {body ? <Text style={styles.body}>{body}</Text> : null}
    </View>
  );
}

export function Card({ children }: PropsWithChildren) {
  return <View style={styles.card}>{children}</View>;
}

export function Label({ children }: PropsWithChildren) {
  return <Text style={styles.label}>{children}</Text>;
}

export function Empty({ children }: PropsWithChildren) {
  return <Text style={styles.empty}>{children}</Text>;
}

export function Notice({ children, danger = false }: PropsWithChildren<{ danger?: boolean }>) {
  return <Text style={[styles.notice, danger && styles.noticeDanger]}>{children}</Text>;
}

export function Button({
  children,
  disabled,
  tone = "primary",
  ...props
}: PressableProps & { children: ReactNode; tone?: "primary" | "secondary" }) {
  return (
    <Pressable
      {...props}
      disabled={disabled}
      style={({ pressed }) => [
        styles.button,
        tone === "secondary" && styles.buttonSecondary,
        pressed && styles.buttonPressed,
        disabled && styles.buttonDisabled,
      ]}
    >
      <Text style={[styles.buttonText, tone === "secondary" && styles.buttonTextSecondary]}>
        {children}
      </Text>
    </Pressable>
  );
}

export function MobileRecoveryNotice({
  message,
  hint,
  actionLabel,
  busy = false,
  onRetry,
}: {
  message: string;
  hint: string;
  actionLabel: string;
  busy?: boolean;
  onRetry: () => void;
}) {
  return (
    <View accessibilityRole="alert" style={styles.recovery}>
      <Notice danger>{message}</Notice>
      <Text style={styles.body}>{hint}</Text>
      <Button
        tone="secondary"
        accessibilityRole="button"
        accessibilityLabel={actionLabel}
        accessibilityState={{ busy, disabled: busy }}
        disabled={busy}
        onPress={onRetry}
      >
        {actionLabel}
      </Button>
    </View>
  );
}

export function Loading({ label = "ENDVERA se synchronise…" }: { label?: string }) {
  return (
    <View style={styles.loading}>
      <ActivityIndicator color={colors.accent} />
      <Text style={styles.body}>{label}</Text>
    </View>
  );
}

export const sharedStyles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12 },
  stack: { gap: 12 },
  name: { color: colors.text, fontSize: 18, fontWeight: "700" },
  value: { color: colors.text, fontSize: 16 },
  muted: { color: colors.muted, fontSize: 14, lineHeight: 20 },
  success: { color: colors.success, fontSize: 14, fontWeight: "700" },
});

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  screen: { padding: 20, paddingBottom: 48, gap: 16 },
  heading: { gap: 7, marginBottom: 4 },
  eyebrow: { color: colors.accent, fontSize: 12, letterSpacing: 2, fontWeight: "700" },
  title: { color: colors.text, fontSize: 30, lineHeight: 36, fontWeight: "800" },
  body: { color: colors.muted, fontSize: 15, lineHeight: 22 },
  card: { backgroundColor: colors.panel, borderColor: colors.border, borderWidth: 1, borderRadius: 18, padding: 18, gap: 10 },
  label: { color: colors.accent, fontSize: 12, letterSpacing: 1.5, fontWeight: "700", textTransform: "uppercase" },
  empty: { color: colors.muted, fontSize: 15, paddingVertical: 6 },
  notice: { color: colors.success, fontSize: 14, lineHeight: 20 },
  noticeDanger: { color: colors.danger },
  button: { backgroundColor: colors.accent, borderRadius: 14, minHeight: MINIMUM_TOUCH_TARGET, alignItems: "center", justifyContent: "center", paddingHorizontal: 18 },
  buttonSecondary: { backgroundColor: colors.panelStrong, borderWidth: 1, borderColor: colors.border },
  buttonPressed: { opacity: 0.78 },
  buttonDisabled: { opacity: 0.4 },
  buttonText: { color: "#160e08", fontSize: 16, fontWeight: "800" },
  buttonTextSecondary: { color: colors.text },
  loading: { minHeight: 180, alignItems: "center", justifyContent: "center", gap: 12 },
  recovery: { gap: 10, borderColor: colors.danger, borderWidth: 1, borderRadius: 14, padding: 14 },
});
