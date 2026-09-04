import { router, useLocalSearchParams } from "expo-router";
import { useEffect, useMemo, useState } from "react";
import { Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { Button, Card, Heading, Label, Loading, Notice, Screen, colors, sharedStyles } from "@/components/ui";
import { selectedContradictionCandidates, type MobileProjectBrainUnderstandingCommand } from "@/lib/project-brain-understanding-review";
import { mobileProductCopy } from "@/lib/product-experience";
import { useMobileSession } from "@/state/mobile-session";

export default function ProjectBrainUnderstandingReviewScreen() {
  const { projectId } = useLocalSearchParams<{ projectId: string }>();
  const { activeWorkspace, projectBrainUnderstanding, projectBrainUnderstandingLoadState, publicError, loadProjectBrainUnderstanding, submitProjectBrainUnderstandingCommand } = useMobileSession();
  const copy = mobileProductCopy(activeWorkspace?.defaultLocale).projectBrainReview;
  const review = projectBrainUnderstanding?.review?.projectId === projectId ? projectBrainUnderstanding.review : null;
  const [selected, setSelected] = useState<string[]>([]);
  const [ownerText, setOwnerText] = useState<Record<string, string>>({});
  const [localError, setLocalError] = useState<string | null>(null);
  const canManage = activeWorkspace?.role === "OWNER" || activeWorkspace?.role === "OFFICE_MANAGER";
  const busy = projectBrainUnderstandingLoadState === "LOADING";
  useEffect(() => { if (projectId) void loadProjectBrainUnderstanding(projectId); }, [loadProjectBrainUnderstanding, projectId]);
  const currentDispositions = useMemo(() => new Map((review?.candidates ?? []).map((candidate) => [candidate.id, [...candidate.dispositions].sort((a, b) => b.nextStateVersion - a.nextStateVersion)[0]?.disposition] as const)), [review]);
  const currentResolutions = useMemo(() => new Map((review?.contradictions ?? []).map((item) => [item.id, [...item.resolutions].sort((a, b) => b.nextStateVersion - a.nextStateVersion)[0]?.resolution] as const)), [review]);
  const base = () => ({ schemaVersion: 1 as const, commandId: globalThis.crypto.randomUUID(), workspaceId: activeWorkspace!.id, projectId: projectId! });
  const run = async (command: MobileProjectBrainUnderstandingCommand) => { setLocalError(null); try { await submitProjectBrainUnderstandingCommand(command); } catch { setLocalError(copy.unavailable); } };
  const create = () => run({ ...base(), action: "CREATE_PROJECT_BRAIN_UNDERSTANDING_REVIEW" });
  const disposition = (candidateId: string, value: "ACCEPT_AS_REVIEWED" | "REJECT_AS_UNSUPPORTED" | "RETAIN_FOR_CONTRADICTION") => review && run({ ...base(), action: "DISPOSITION_PROJECT_BRAIN_CANDIDATE", reviewId: review.id, expectedStateVersion: review.stateVersion, candidateId, disposition: value });
  const declare = async () => { if (!review || selected.length < 2) return; await run({ ...base(), action: "DECLARE_PROJECT_BRAIN_CONTRADICTION", reviewId: review.id, expectedStateVersion: review.stateVersion, candidateIds: selected }); setSelected([]); };
  const resolve = (contradictionId: string, resolution: { mode: "SELECT_SUPPORTED_CANDIDATES"; selectedCandidateIds: string[] } | { mode: "REJECT_ALL_UNSUPPORTED" } | { mode: "OWNER_RESOLUTION"; ownerResolutionText: string }) => review && run({ ...base(), action: "RESOLVE_PROJECT_BRAIN_CONTRADICTION", reviewId: review.id, expectedStateVersion: review.stateVersion, contradictionId, resolution });
  const prepare = () => review && run({ ...base(), action: "PREPARE_PROJECT_BRAIN_UNDERSTANDING", reviewId: review.id, expectedStateVersion: review.stateVersion });
  const confirm = () => review?.reviewFingerprint && run({ ...base(), action: "CONFIRM_PROJECT_BRAIN_UNDERSTANDING", reviewId: review.id, expectedStateVersion: review.stateVersion, reviewFingerprint: review.reviewFingerprint });
  return <Screen>
    <Heading eyebrow={copy.eyebrow} title={copy.title} body={copy.body} />
    <Button tone="ghost" accessibilityRole="button" accessibilityLabel={copy.back} onPress={() => router.back()}>{copy.back}</Button>
    {!canManage ? <Notice danger>{copy.protected}</Notice> : null}{busy ? <Loading label={copy.loading} /> : null}
    {projectBrainUnderstandingLoadState === "UNAVAILABLE" ? <Notice danger>{copy.unavailable}</Notice> : null}{publicError ? <Notice danger>{publicError}</Notice> : null}{localError ? <Notice danger>{localError}</Notice> : null}
    {!review ? <Card><Notice>{copy.localOnly}</Notice><Button disabled={!canManage || busy || !projectId} accessibilityRole="button" accessibilityLabel={copy.create} onPress={create}>{copy.create}</Button></Card> : <>
      <Card><Label>{copy.sources}</Label>{review.sources.length ? review.sources.map((source) => <View key={source.id} style={styles.row}><Text style={sharedStyles.name}>{source.displayName}</Text><Text style={sharedStyles.muted}>{source.kind} · {Math.ceil(source.sizeBytes / 1024)} Ko</Text></View>) : <Text style={sharedStyles.muted}>{copy.noSources}</Text>}</Card>
      <Card><Label>{copy.candidates}</Label><Notice>{copy.completeEach}</Notice>{review.candidates.map((candidate) => <View key={candidate.id} style={styles.candidate}>
        <Pressable accessibilityRole="checkbox" accessibilityState={{ checked: selected.includes(candidate.id) }} accessibilityLabel={`${copy.contradiction}: ${candidate.value}`} onPress={() => setSelected((items) => selectedContradictionCandidates(items, candidate.id))}><Text style={styles.value}>{selected.includes(candidate.id) ? "☑" : "☐"} {candidate.value}</Text></Pressable>
        <Text style={sharedStyles.muted}>{candidate.confidenceClass} · {currentDispositions.get(candidate.id) ?? "—"}</Text>
        <View style={styles.actions}><Button disabled={busy || review.status === "CONFIRMED"} accessibilityRole="button" accessibilityLabel={`${copy.accept}: ${candidate.value}`} onPress={() => disposition(candidate.id, "ACCEPT_AS_REVIEWED")}>{copy.accept}</Button><Button tone="danger" disabled={busy || review.status === "CONFIRMED"} accessibilityRole="button" accessibilityLabel={`${copy.reject}: ${candidate.value}`} onPress={() => disposition(candidate.id, "REJECT_AS_UNSUPPORTED")}>{copy.reject}</Button><Button tone="secondary" disabled={busy || review.status === "CONFIRMED"} accessibilityRole="button" accessibilityLabel={`${copy.contradiction}: ${candidate.value}`} onPress={() => disposition(candidate.id, "RETAIN_FOR_CONTRADICTION")}>{copy.contradiction}</Button></View>
      </View>)}<Button disabled={busy || review.status === "CONFIRMED" || selected.length < 2} accessibilityRole="button" accessibilityLabel={copy.declare} onPress={declare}>{copy.declare} ({selected.length} {copy.selected})</Button></Card>
      {review.contradictions.length ? <Card><Label>{copy.contradictions}</Label>{review.contradictions.map((contradiction) => { const selectedMembers = selected.filter((id) => contradiction.memberCandidateIds.includes(id)); return <View key={contradiction.id} style={styles.candidate}>
        {contradiction.memberCandidateIds.map((id) => <Text key={id} style={sharedStyles.muted}>• {review.candidates.find((candidate) => candidate.id === id)?.value}</Text>)}<Text style={styles.status}>{currentResolutions.get(contradiction.id)?.mode ?? "—"}</Text>
        <Button disabled={busy || review.status === "CONFIRMED" || selectedMembers.length < 1} accessibilityRole="button" accessibilityLabel={copy.chooseSupported} onPress={() => resolve(contradiction.id, { mode: "SELECT_SUPPORTED_CANDIDATES", selectedCandidateIds: selectedMembers })}>{copy.chooseSupported}</Button><Button tone="danger" disabled={busy || review.status === "CONFIRMED"} accessibilityRole="button" accessibilityLabel={copy.rejectAll} onPress={() => resolve(contradiction.id, { mode: "REJECT_ALL_UNSUPPORTED" })}>{copy.rejectAll}</Button>
        <TextInput accessibilityLabel={copy.ownerResolution} editable={!busy && review.status !== "CONFIRMED"} value={ownerText[contradiction.id] ?? ""} onChangeText={(text) => setOwnerText((all) => ({ ...all, [contradiction.id]: text }))} placeholder={copy.ownerResolution} placeholderTextColor={colors.muted} style={styles.input} multiline /><Button tone="secondary" disabled={busy || review.status === "CONFIRMED" || !(ownerText[contradiction.id] ?? "").trim()} accessibilityRole="button" accessibilityLabel={copy.saveResolution} onPress={() => resolve(contradiction.id, { mode: "OWNER_RESOLUTION", ownerResolutionText: ownerText[contradiction.id].trim() })}>{copy.saveResolution}</Button>
      </View>; })}</Card> : null}
      <Card><Text style={sharedStyles.muted}>{copy.version} {review.stateVersion} · {review.status}</Text><Notice>{copy.localOnly}</Notice>{review.status === "DRAFT" ? <Button disabled={busy} accessibilityRole="button" accessibilityLabel={copy.prepare} onPress={prepare}>{copy.prepare}</Button> : null}{review.status === "READY_FOR_CONFIRMATION" ? <Button disabled={busy || !review.reviewFingerprint} accessibilityRole="button" accessibilityLabel={copy.confirm} onPress={confirm}>{copy.confirm}</Button> : null}{review.status === "CONFIRMED" ? <Text style={sharedStyles.success}>{copy.confirmed}</Text> : null}</Card>
    </>}
  </Screen>;
}

const styles = StyleSheet.create({ row: { gap: 4, paddingVertical: 8, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border }, candidate: { gap: 10, paddingVertical: 14, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border }, value: { color: colors.text, fontSize: 16, lineHeight: 23, fontWeight: "700" }, actions: { gap: 8 }, status: { color: colors.accentBright, fontWeight: "800" }, input: { minHeight: 82, borderWidth: 1, borderColor: colors.border, borderRadius: 12, color: colors.text, padding: 12, textAlignVertical: "top" } });
