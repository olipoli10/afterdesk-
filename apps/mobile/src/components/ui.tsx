import type { PropsWithChildren, ReactNode } from "react";
import {
  ActivityIndicator,
  Image,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  View,
  type PressableProps,
  type StyleProp,
  type ViewStyle,
} from "react-native";
import { MINIMUM_TOUCH_TARGET } from "@/lib/accessibility";
import { AppIcon, type AppIconName } from "@/components/app-icon";

export const colors = {
  background: "#09090B",
  backgroundRaised: "#0D0F12",
  panel: "#131519",
  panelStrong: "#1A1D22",
  panelWarm: "#21170F",
  border: "#2A2E35",
  borderWarm: "#5B351B",
  text: "#F7F3EB",
  muted: "#A8AEB8",
  subtle: "#858D99",
  accent: "#D87526",
  accentBright: "#F0A354",
  accentSoft: "#382114",
  danger: "#FF8A75",
  success: "#69D39C",
  warning: "#E8B65C",
  info: "#82B8FF",
};

export function Screen({
  children,
  contentContainerStyle,
}: PropsWithChildren<{ contentContainerStyle?: StyleProp<ViewStyle> }>) {
  return (
    <SafeAreaView style={styles.safe}>
      <View pointerEvents="none" style={styles.ambientTop} />
      <ScrollView
        contentContainerStyle={[styles.screen, contentContainerStyle]}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {children}
      </ScrollView>
    </SafeAreaView>
  );
}

export function BrandHeader({
  workspace,
  onMore,
  moreLabel = "Plus",
}: {
  workspace?: string | null;
  onMore?: () => void;
  moreLabel?: string;
}) {
  return (
    <View style={styles.brandHeader}>
      <View style={styles.brandIdentity}>
        <Image source={require("../../assets/images/icon.png")} style={styles.brandIcon} />
        <View>
          <Text style={styles.brandName}>ENDVERA</Text>
          {workspace ? <Text numberOfLines={1} style={styles.workspace}>{workspace}</Text> : null}
        </View>
      </View>
      {onMore ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={moreLabel}
          hitSlop={8}
          onPress={onMore}
          style={({ pressed }) => [styles.iconButton, pressed && styles.pressed]}
        >
          <AppIcon name="more" color={colors.text} size={24} />
        </Pressable>
      ) : null}
    </View>
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

export function SectionHeader({
  title,
  action,
  onAction,
}: {
  title: string;
  action?: string;
  onAction?: () => void;
}) {
  return (
    <View style={styles.sectionHeader}>
      <Text style={styles.sectionTitle}>{title}</Text>
      {action && onAction ? (
        <Pressable accessibilityRole="button" accessibilityLabel={action} onPress={onAction} hitSlop={8}>
          <Text style={styles.sectionAction}>{action}</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

export function Card({
  children,
  tone = "default",
  style,
}: PropsWithChildren<{ tone?: "default" | "warm" | "flat"; style?: StyleProp<ViewStyle> }>) {
  return (
    <View style={[styles.card, tone === "warm" && styles.cardWarm, tone === "flat" && styles.cardFlat, style]}>
      {children}
    </View>
  );
}

export function Label({ children }: PropsWithChildren) {
  return <Text style={styles.label}>{children}</Text>;
}

export function StatusPill({
  children,
  tone = "neutral",
}: PropsWithChildren<{ tone?: "neutral" | "accent" | "success" | "warning" | "danger" }>) {
  const toneStyle = {
    neutral: styles.pillNeutral,
    accent: styles.pillAccent,
    success: styles.pillSuccess,
    warning: styles.pillWarning,
    danger: styles.pillDanger,
  }[tone];
  return (
    <View style={[styles.pill, toneStyle]}>
      <Text style={[styles.pillText, tone !== "neutral" && styles.pillTextBright]}>{children}</Text>
    </View>
  );
}

export function MetricPill({
  icon,
  value,
  label,
}: {
  icon: AppIconName;
  value: string | number;
  label: string;
}) {
  return (
    <View style={styles.metricPill} accessible accessibilityRole="summary" accessibilityLabel={`${label}: ${value}`}>
      <View style={styles.metricIcon}><AppIcon name={icon} color={colors.accentBright} size={18} /></View>
      <View style={styles.metricCopy}>
        <Text style={styles.metricValue}>{value}</Text>
        <Text numberOfLines={1} style={styles.metricLabel}>{label}</Text>
      </View>
    </View>
  );
}

export function Empty({ children }: PropsWithChildren) {
  return <Text style={styles.empty}>{children}</Text>;
}

export function Notice({ children, danger = false }: PropsWithChildren<{ danger?: boolean }>) {
  return (
    <View accessibilityRole="alert" style={[styles.noticeBox, danger && styles.noticeBoxDanger]}>
      <AppIcon name={danger ? "warning" : "check"} color={danger ? colors.danger : colors.success} size={17} />
      <Text style={[styles.notice, danger && styles.noticeDanger]}>{children}</Text>
    </View>
  );
}

export function Button({
  children,
  disabled,
  tone = "primary",
  icon,
  ...props
}: PressableProps & { children: ReactNode; tone?: "primary" | "secondary" | "ghost" | "danger"; icon?: AppIconName }) {
  return (
    <Pressable
      {...props}
      disabled={disabled}
      style={({ pressed }) => [
        styles.button,
        tone === "secondary" && styles.buttonSecondary,
        tone === "ghost" && styles.buttonGhost,
        tone === "danger" && styles.buttonDanger,
        pressed && styles.buttonPressed,
        disabled && styles.buttonDisabled,
      ]}
    >
      {icon ? <AppIcon name={icon} color={tone === "primary" ? "#140B05" : colors.text} size={19} /> : null}
      <Text style={[styles.buttonText, tone !== "primary" && styles.buttonTextSecondary]}>{children}</Text>
    </Pressable>
  );
}

export function IconButton({
  icon,
  label,
  onPress,
  filled = false,
  disabled = false,
}: {
  icon: AppIconName;
  label: string;
  onPress: () => void;
  filled?: boolean;
  disabled?: boolean;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [styles.roundButton, filled && styles.roundButtonFilled, pressed && styles.pressed, disabled && styles.buttonDisabled]}
    >
      <AppIcon name={icon} color={filled ? "#140B05" : colors.text} size={21} />
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
        icon="sync"
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
      <ActivityIndicator color={colors.accent} size="small" />
      <Text style={styles.body}>{label}</Text>
    </View>
  );
}

export const sharedStyles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12 },
  stack: { gap: 12 },
  name: { color: colors.text, fontSize: 18, lineHeight: 24, fontWeight: "700" },
  value: { color: colors.text, fontSize: 16, lineHeight: 22 },
  muted: { color: colors.muted, fontSize: 14, lineHeight: 20 },
  subtle: { color: colors.subtle, fontSize: 13, lineHeight: 18 },
  success: { color: colors.success, fontSize: 14, fontWeight: "700" },
});

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background, overflow: "hidden" },
  ambientTop: {
    position: "absolute",
    top: -170,
    right: -120,
    width: 360,
    height: 360,
    borderRadius: 180,
    backgroundColor: "#22160D",
    opacity: 0.72,
  },
  screen: { paddingHorizontal: 20, paddingTop: 12, paddingBottom: 148, gap: 18 },
  brandHeader: { minHeight: 48, flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  brandIdentity: { minWidth: 0, flex: 1, flexDirection: "row", alignItems: "center", gap: 11 },
  brandIcon: { width: 38, height: 38, borderRadius: 11 },
  brandName: { color: colors.text, fontSize: 14, fontWeight: "900", letterSpacing: 2.4 },
  workspace: { color: colors.muted, fontSize: 11, marginTop: 2, maxWidth: 220 },
  iconButton: { width: MINIMUM_TOUCH_TARGET, height: MINIMUM_TOUCH_TARGET, borderRadius: 22, alignItems: "center", justifyContent: "center", backgroundColor: colors.panelStrong, borderWidth: 1, borderColor: colors.border },
  heading: { gap: 6, marginTop: 4, marginBottom: 2 },
  eyebrow: { color: colors.accentBright, fontSize: 11, letterSpacing: 1.8, fontWeight: "800", textTransform: "uppercase" },
  title: { color: colors.text, fontSize: 31, lineHeight: 37, letterSpacing: -0.7, fontWeight: "800" },
  body: { color: colors.muted, fontSize: 15, lineHeight: 22 },
  sectionHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12, marginTop: 2 },
  sectionTitle: { color: colors.text, fontSize: 18, fontWeight: "800" },
  sectionAction: { color: colors.accentBright, fontSize: 14, fontWeight: "700" },
  card: { backgroundColor: colors.panel, borderColor: colors.border, borderWidth: 1, borderRadius: 22, padding: 18, gap: 12 },
  cardWarm: { backgroundColor: colors.panelWarm, borderColor: colors.borderWarm },
  cardFlat: { backgroundColor: colors.backgroundRaised, borderColor: "transparent" },
  label: { color: colors.accentBright, fontSize: 11, letterSpacing: 1.35, fontWeight: "800", textTransform: "uppercase" },
  pill: { alignSelf: "flex-start", minHeight: 28, borderRadius: 14, paddingHorizontal: 10, alignItems: "center", justifyContent: "center", borderWidth: 1 },
  pillNeutral: { backgroundColor: colors.panelStrong, borderColor: colors.border },
  pillAccent: { backgroundColor: colors.accentSoft, borderColor: colors.borderWarm },
  pillSuccess: { backgroundColor: "#10291F", borderColor: "#24573F" },
  pillWarning: { backgroundColor: "#2C2415", borderColor: "#60491D" },
  pillDanger: { backgroundColor: "#321B18", borderColor: "#66322A" },
  pillText: { color: colors.muted, fontSize: 12, fontWeight: "700" },
  pillTextBright: { color: colors.text },
  metricPill: { minWidth: 0, flex: 1, flexDirection: "row", alignItems: "center", gap: 10, padding: 12, borderRadius: 17, backgroundColor: colors.panel, borderWidth: 1, borderColor: colors.border },
  metricIcon: { width: 34, height: 34, alignItems: "center", justifyContent: "center", borderRadius: 11, backgroundColor: colors.accentSoft },
  metricCopy: { flex: 1, minWidth: 0 },
  metricValue: { color: colors.text, fontSize: 18, fontWeight: "800" },
  metricLabel: { color: colors.muted, fontSize: 11, marginTop: 1 },
  empty: { color: colors.muted, fontSize: 15, lineHeight: 22, paddingVertical: 4 },
  noticeBox: { flexDirection: "row", alignItems: "flex-start", gap: 9, padding: 12, borderRadius: 14, backgroundColor: "#11241C", borderWidth: 1, borderColor: "#234735" },
  noticeBoxDanger: { backgroundColor: "#2C1816", borderColor: "#613029" },
  notice: { flex: 1, color: colors.success, fontSize: 14, lineHeight: 20 },
  noticeDanger: { color: colors.danger },
  button: { flexDirection: "row", gap: 9, backgroundColor: colors.accent, borderRadius: 16, minHeight: MINIMUM_TOUCH_TARGET, alignItems: "center", justifyContent: "center", paddingHorizontal: 18, paddingVertical: 11 },
  buttonSecondary: { backgroundColor: colors.panelStrong, borderWidth: 1, borderColor: colors.border },
  buttonGhost: { backgroundColor: "transparent", borderWidth: 1, borderColor: colors.border },
  buttonDanger: { backgroundColor: "#351A17", borderWidth: 1, borderColor: "#673028" },
  buttonPressed: { opacity: 0.78, transform: [{ scale: 0.99 }] },
  pressed: { opacity: 0.72 },
  buttonDisabled: { opacity: 0.4 },
  buttonText: { color: "#140B05", fontSize: 15, fontWeight: "800" },
  buttonTextSecondary: { color: colors.text },
  roundButton: { width: MINIMUM_TOUCH_TARGET, height: MINIMUM_TOUCH_TARGET, borderRadius: 22, backgroundColor: colors.panelStrong, borderWidth: 1, borderColor: colors.border, alignItems: "center", justifyContent: "center" },
  roundButtonFilled: { backgroundColor: colors.accent, borderColor: colors.accent },
  loading: { minHeight: 180, alignItems: "center", justifyContent: "center", gap: 12 },
  recovery: { gap: 10, borderColor: "#613029", backgroundColor: "#1D1211", borderWidth: 1, borderRadius: 18, padding: 14 },
});
