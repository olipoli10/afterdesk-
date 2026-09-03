import { useState } from "react";
import { router } from "expo-router";
import { Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { AppIcon } from "@/components/app-icon";
import {
  BrandHeader,
  Button,
  Card,
  Empty,
  Heading,
  Notice,
  Screen,
  StatusPill,
  colors,
  sharedStyles,
} from "@/components/ui";
import {
  createPreparedActionAttempt,
  preparedActionInspections,
  type MobilePreparedActionInspection,
  type PreparedActionAttempt,
} from "@/lib/prepared-actions";
import { mobileProductCopy, type MobileProductCopy } from "@/lib/product-experience";
import { useMobileSession } from "@/state/mobile-session";

function stateLabel(attempt: PreparedActionAttempt | null, copy: MobileProductCopy) {
  if (!attempt) return null;
  if (attempt.state === "SENDING") return copy.reviewScreen.processing;
  if (attempt.state === "REPLAYED") return copy.reviewScreen.replayed;
  if (attempt.state === "CONFIRMED") return copy.reviewScreen.confirmed;
  if (attempt.state === "CONFLICT") return copy.reviewScreen.conflict;
  if (attempt.state === "OUTCOME_UNKNOWN") return copy.reviewScreen.unknown;
  if (attempt.state === "REFUSED") return copy.reviewScreen.refused;
  return null;
}

function PreparedActionCard({
  action,
  busy,
  copy,
  onDecision,
}: {
  action: MobilePreparedActionInspection;
  busy: boolean;
  copy: MobileProductCopy;
  onDecision: (action: MobilePreparedActionInspection, decision: "APPROVE" | "REJECT" | "REVOKE", reason?: string) => Promise<void>;
}) {
  const [reason, setReason] = useState("");
  const [showReject, setShowReject] = useState(false);
  const [showDetails, setShowDetails] = useState(false);
  const prepared = action.state === "PREPARED_UNSENT";

  return (
    <Card style={styles.actionCard}>
      <View style={styles.actionTop}>
        <StatusPill tone={prepared ? "warning" : "success"}>{prepared ? copy.reviewScreen.prepared : copy.reviewScreen.approved}</StatusPill>
        <Text style={styles.projectCode}>{action.project?.code ?? "ENDVERA"}</Text>
      </View>
      <Text style={styles.projectName}>{action.project?.name ?? copy.reviewScreen.generalAction}</Text>

      <View style={styles.deliveryGrid}>
        <View style={styles.deliveryItem}>
          <View style={styles.deliveryIcon}><AppIcon name="contact" color={colors.accentBright} size={18} /></View>
          <View style={styles.deliveryCopy}>
            <Text style={styles.caption}>{copy.reviewScreen.recipient}</Text>
            <Text selectable style={styles.deliveryValue}>{action.contact?.displayName ?? action.recipient}</Text>
            {action.contact ? <Text selectable style={styles.deliveryMeta}>{action.recipient}</Text> : null}
          </View>
        </View>
        <View style={styles.deliveryItem}>
          <View style={styles.deliveryIcon}><AppIcon name="assistant" color={colors.accentBright} size={18} /></View>
          <View style={styles.deliveryCopy}>
            <Text style={styles.caption}>{copy.reviewScreen.channel}</Text>
            <Text style={styles.deliveryValue}>{action.channel === "SMS" ? "SMS" : "Email"}</Text>
          </View>
        </View>
      </View>

      <Text style={styles.caption}>{copy.reviewScreen.exactMessage}</Text>
      <View style={styles.messagePreview}>
        <View style={styles.messageHeader}>
          <View style={styles.messageAvatar}><Text style={styles.messageAvatarText}>N</Text></View>
          <Text style={styles.messageSender}>ENDVERA</Text>
        </View>
        <Text selectable style={styles.messageBody}>{action.body}</Text>
      </View>

      {prepared ? (
        <View style={styles.decisionStack}>
          <Button icon="check" disabled={busy} accessibilityRole="button" accessibilityLabel={copy.reviewScreen.approve} onPress={() => onDecision(action, "APPROVE")}>
            {copy.reviewScreen.approve}
          </Button>
          {!showReject ? (
            <Button tone="ghost" disabled={busy} accessibilityRole="button" accessibilityLabel={copy.reviewScreen.reject} onPress={() => setShowReject(true)}>
              {copy.reviewScreen.reject}
            </Button>
          ) : (
            <View style={styles.reasonBox}>
              <TextInput
                accessibilityLabel={copy.reviewScreen.rejectWhy}
                style={styles.input}
                value={reason}
                onChangeText={setReason}
                placeholder={copy.reviewScreen.rejectWhy}
                placeholderTextColor={colors.subtle}
                maxLength={500}
                editable={!busy}
              />
              <Button tone="danger" disabled={busy || !reason.trim()} onPress={() => onDecision(action, "REJECT", reason)}>{copy.reviewScreen.reject}</Button>
            </View>
          )}
        </View>
      ) : (
        <View style={styles.decisionStack}>
          <Notice>{copy.reviewScreen.approved}</Notice>
          {!showReject ? (
            <Button tone="ghost" disabled={busy} onPress={() => setShowReject(true)}>{copy.reviewScreen.revoke}</Button>
          ) : (
            <View style={styles.reasonBox}>
              <TextInput
                accessibilityLabel={copy.reviewScreen.revokeWhy}
                style={styles.input}
                value={reason}
                onChangeText={setReason}
                placeholder={copy.reviewScreen.revokeWhy}
                placeholderTextColor={colors.subtle}
                maxLength={500}
                editable={!busy}
              />
              <Button tone="danger" disabled={busy || !reason.trim()} onPress={() => onDecision(action, "REVOKE", reason)}>{copy.reviewScreen.revoke}</Button>
            </View>
          )}
        </View>
      )}

      <Pressable
        accessibilityRole="button"
        accessibilityLabel={copy.reviewScreen.technicalDetails}
        accessibilityState={{ expanded: showDetails }}
        onPress={() => setShowDetails((value) => !value)}
        style={({ pressed }) => [styles.detailsToggle, pressed && styles.pressed]}
      >
        <Text style={styles.detailsLabel}>{copy.reviewScreen.technicalDetails}</Text>
        <AppIcon name={showDetails ? "check" : "arrow"} color={colors.subtle} size={17} />
      </Pressable>
      {showDetails ? (
        <View style={styles.technicalDetails}>
          <Text style={styles.detailLine}>{copy.reviewScreen.version} {action.version}</Text>
          <Text selectable style={styles.fingerprint}>{action.fingerprint}</Text>
          <Text style={styles.detailLine}>Source {action.provenance.channel} · {action.provenance.sourceMessageId}</Text>
        </View>
      ) : null}
    </Card>
  );
}

export default function ActionsScreen() {
  const {
    cockpit,
    activeWorkspace,
    latestPreparedActionAttempt,
    publicError,
    submitPreparedActionAttempt,
  } = useMobileSession();
  const copy = mobileProductCopy(activeWorkspace?.defaultLocale);
  const actions = preparedActionInspections(cockpit?.actions ?? []);
  const busy = latestPreparedActionAttempt?.state === "SENDING";
  const label = stateLabel(latestPreparedActionAttempt, copy);

  if (activeWorkspace?.role === "FIELD_WORKER") {
    return (
      <Screen>
        <BrandHeader workspace={activeWorkspace.name} onMore={() => router.push("/more")} moreLabel={copy.tabs.more} />
        <Heading eyebrow={copy.reviewScreen.eyebrow} title={copy.reviewScreen.protectedTitle} body={copy.reviewScreen.protectedBody} />
        <Card><Empty>{copy.reviewScreen.protectedEmpty}</Empty></Card>
      </Screen>
    );
  }

  const decide = async (action: MobilePreparedActionInspection, decision: "APPROVE" | "REJECT" | "REVOKE", reason?: string) => {
    if (!activeWorkspace) return;
    const attempt = createPreparedActionAttempt({ workspace: activeWorkspace, action, decision, reason });
    await submitPreparedActionAttempt(attempt);
  };

  const retry = async () => {
    if (latestPreparedActionAttempt?.state !== "OUTCOME_UNKNOWN") return;
    await submitPreparedActionAttempt(latestPreparedActionAttempt);
  };

  return (
    <Screen>
      <BrandHeader workspace={activeWorkspace?.name} onMore={() => router.push("/more")} moreLabel={copy.tabs.more} />
      <Heading eyebrow={copy.reviewScreen.eyebrow} title={copy.reviewScreen.title} body={copy.reviewScreen.body} />

      <Card tone="warm" style={styles.safetyCard}>
        <View style={styles.safetyIcon}><AppIcon name="shield" color={colors.success} size={22} /></View>
        <View style={styles.safetyCopy}>
          <Text style={styles.safetyTitle}>{copy.reviewScreen.safety}</Text>
          <Text style={sharedStyles.muted}>{copy.reviewScreen.safetyBody}</Text>
        </View>
      </Card>

      {publicError ? <Notice danger>{publicError}</Notice> : null}
      {label ? <Notice danger={["CONFLICT", "OUTCOME_UNKNOWN", "REFUSED"].includes(latestPreparedActionAttempt?.state ?? "")}>{label}</Notice> : null}
      {latestPreparedActionAttempt?.state === "OUTCOME_UNKNOWN" ? (
        <Button tone="secondary" icon="sync" onPress={retry}>{copy.reviewScreen.retry}</Button>
      ) : null}

      {actions.length ? actions.map((action) => (
        <PreparedActionCard key={action.actionId} action={action} busy={busy} copy={copy} onDecision={decide} />
      )) : (
        <Card style={styles.emptyCard}>
          <View style={styles.emptyIcon}><AppIcon name="review" color={colors.success} size={29} /></View>
          <Empty>{copy.reviewScreen.empty}</Empty>
        </Card>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  safetyCard: { flexDirection: "row", alignItems: "flex-start", gap: 12 },
  safetyIcon: { width: 42, height: 42, borderRadius: 14, alignItems: "center", justifyContent: "center", backgroundColor: "#10271E" },
  safetyCopy: { flex: 1, gap: 4 },
  safetyTitle: { color: colors.text, fontSize: 16, fontWeight: "800" },
  actionCard: { gap: 15 },
  actionTop: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 10 },
  projectCode: { color: colors.accentBright, fontSize: 11, letterSpacing: 1.1, fontWeight: "800" },
  projectName: { color: colors.text, fontSize: 21, lineHeight: 26, fontWeight: "800" },
  deliveryGrid: { gap: 11, paddingVertical: 2 },
  deliveryItem: { flexDirection: "row", alignItems: "center", gap: 11 },
  deliveryIcon: { width: 38, height: 38, borderRadius: 13, alignItems: "center", justifyContent: "center", backgroundColor: colors.accentSoft },
  deliveryCopy: { flex: 1, minWidth: 0 },
  caption: { color: colors.subtle, fontSize: 10, fontWeight: "800", textTransform: "uppercase", letterSpacing: 1.1 },
  deliveryValue: { color: colors.text, fontSize: 15, lineHeight: 20, fontWeight: "700", marginTop: 2 },
  deliveryMeta: { color: colors.muted, fontSize: 12, marginTop: 1 },
  messagePreview: { gap: 10, padding: 14, borderRadius: 18, borderBottomRightRadius: 6, backgroundColor: colors.panelStrong, borderWidth: 1, borderColor: colors.border },
  messageHeader: { flexDirection: "row", alignItems: "center", gap: 8 },
  messageAvatar: { width: 27, height: 27, borderRadius: 9, alignItems: "center", justifyContent: "center", backgroundColor: colors.accent },
  messageAvatarText: { color: "#160C05", fontSize: 12, fontWeight: "900" },
  messageSender: { color: colors.accentBright, fontSize: 11, fontWeight: "800", letterSpacing: 1 },
  messageBody: { color: colors.text, fontSize: 16, lineHeight: 24 },
  decisionStack: { gap: 10 },
  reasonBox: { gap: 9 },
  input: { minHeight: 48, borderRadius: 14, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.panelStrong, color: colors.text, paddingHorizontal: 13, paddingVertical: 10, fontSize: 15 },
  detailsToggle: { minHeight: 44, flexDirection: "row", alignItems: "center", justifyContent: "space-between", borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border, marginTop: 2, paddingTop: 10 },
  detailsLabel: { color: colors.subtle, fontSize: 12, fontWeight: "700" },
  technicalDetails: { gap: 5, padding: 11, borderRadius: 12, backgroundColor: colors.backgroundRaised },
  detailLine: { color: colors.subtle, fontSize: 11, lineHeight: 16 },
  fingerprint: { color: colors.subtle, fontSize: 10, lineHeight: 15 },
  emptyCard: { minHeight: 170, alignItems: "center", justifyContent: "center" },
  emptyIcon: { width: 58, height: 58, borderRadius: 20, alignItems: "center", justifyContent: "center", backgroundColor: "#10271E", marginBottom: 3 },
  pressed: { opacity: 0.72 },
});
