import * as Network from "expo-network";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type PropsWithChildren,
} from "react";
import { authClient } from "@/lib/auth-client";
import { MobileApi, MobileApiError } from "@/lib/api";
import type { MobileBootstrap, MobileCockpit, MobileWorkspace } from "@/lib/contracts";
import {
  assertCommandAllowed,
  beginAttempt,
  finishAttempt,
  type CommandAttempt,
} from "@/lib/commands";
import {
  beginAssistantAttempt,
  finishAssistantAttempt,
  type AssistantAttempt,
  type MobileAssistantHistory,
} from "@/lib/assistant";
import {
  beginPreparedActionAttempt,
  finishPreparedActionAttempt,
  type PreparedActionAttempt,
} from "@/lib/prepared-actions";
import {
  beginEvidenceAttempt,
  finishEvidenceAttempt,
  type EvidenceAttempt,
} from "@/lib/evidence";
import type { MobileProjectTimeline } from "@/lib/timeline";
import type {
  MobilePermissionCenter,
  MobileRevokePermissionCommand,
} from "@/lib/permissions";
import {
  clearMobileOutbox,
  discardMobileOutboxEntry as discardStoredOutboxEntry,
  enqueueMobileOutbox,
  loadMobileOutbox,
  transitionMobileOutbox,
  type MobileOutboxEntry,
  type MobileOutboxKind,
  type MobileOutboxState,
} from "@/lib/outbox";

type LoadState = "IDLE" | "LOADING" | "READY" | "UNAVAILABLE";

type MobileSessionValue = {
  sessionPending: boolean;
  signedIn: boolean;
  bootstrap: MobileBootstrap | null;
  activeWorkspace: MobileWorkspace | null;
  cockpit: MobileCockpit | null;
  loadState: LoadState;
  publicError: string | null;
  latestAttempt: CommandAttempt | null;
  assistantHistory: MobileAssistantHistory | null;
  assistantLoadState: LoadState;
  latestAssistantAttempt: AssistantAttempt | null;
  latestPreparedActionAttempt: PreparedActionAttempt | null;
  latestEvidenceAttempt: EvidenceAttempt | null;
  timeline: MobileProjectTimeline | null;
  timelineLoadState: LoadState;
  permissionCenter: MobilePermissionCenter | null;
  permissionLoadState: LoadState;
  outboxEntries: MobileOutboxEntry[];
  outboxLoadState: LoadState;
  selectWorkspace: (workspaceId: string) => Promise<void>;
  refresh: () => Promise<void>;
  refreshAssistant: () => Promise<void>;
  submitAttempt: (attempt: CommandAttempt) => Promise<CommandAttempt>;
  submitAssistantAttempt: (attempt: AssistantAttempt) => Promise<AssistantAttempt>;
  submitPreparedActionAttempt: (
    attempt: PreparedActionAttempt,
  ) => Promise<PreparedActionAttempt>;
  submitEvidenceAttempt: (attempt: EvidenceAttempt) => Promise<EvidenceAttempt>;
  loadTimeline: (projectId: string) => Promise<void>;
  loadPermissions: () => Promise<void>;
  revokePermission: (command: MobileRevokePermissionCommand) => Promise<void>;
  retryOutboxEntry: (entryId: string) => Promise<void>;
  discardOutboxEntry: (entryId: string) => Promise<void>;
  signOut: () => Promise<void>;
};

const MobileSessionContext = createContext<MobileSessionValue | null>(null);

function publicMessage(error: unknown) {
  if (!(error instanceof MobileApiError)) return "ENDVERA est temporairement indisponible.";
  switch (error.code) {
    case "UNAUTHENTICATED":
      return "Ta session a expiré. Reconnecte-toi.";
    case "CONFLICT":
      return "L’état a changé. ENDVERA a rechargé la version actuelle.";
    case "RATE_LIMITED":
      return "Trop de demandes. Réessaie dans une minute.";
    case "OUTCOME_UNKNOWN":
      return "Résultat inconnu. Réessaie la même action; ENDVERA empêchera un doublon.";
    case "INVALID_RESPONSE":
      return "Réponse refusée parce qu’elle ne respecte pas le contrat mobile.";
    default:
      return "Cette action a été refusée.";
  }
}

async function assertNetworkAvailable() {
  const state = await Network.getNetworkStateAsync();
  if (state.isConnected === false || state.isInternetReachable === false) {
    throw new MobileApiError("OUTCOME_UNKNOWN");
  }
}

export function MobileSessionProvider({ children }: PropsWithChildren) {
  const session = authClient.useSession() as unknown as {
    data: { user: { id: string; name: string; email: string } } | null;
    isPending: boolean;
  };
  const signedInUserId = session.data?.user.id;
  const api = useMemo(() => new MobileApi({ getCookie: () => authClient.getCookie() }), []);
  const [bootstrap, setBootstrap] = useState<MobileBootstrap | null>(null);
  const [activeWorkspace, setActiveWorkspace] = useState<MobileWorkspace | null>(null);
  const [cockpit, setCockpit] = useState<MobileCockpit | null>(null);
  const [loadState, setLoadState] = useState<LoadState>("IDLE");
  const [publicError, setPublicError] = useState<string | null>(null);
  const [latestAttempt, setLatestAttempt] = useState<CommandAttempt | null>(null);
  const [assistantHistory, setAssistantHistory] = useState<MobileAssistantHistory | null>(null);
  const [assistantLoadState, setAssistantLoadState] = useState<LoadState>("IDLE");
  const [latestAssistantAttempt, setLatestAssistantAttempt] = useState<AssistantAttempt | null>(null);
  const [latestPreparedActionAttempt, setLatestPreparedActionAttempt] =
    useState<PreparedActionAttempt | null>(null);
  const [latestEvidenceAttempt, setLatestEvidenceAttempt] =
    useState<EvidenceAttempt | null>(null);
  const [timeline, setTimeline] = useState<MobileProjectTimeline | null>(null);
  const [timelineLoadState, setTimelineLoadState] = useState<LoadState>("IDLE");
  const [permissionCenter, setPermissionCenter] = useState<MobilePermissionCenter | null>(null);
  const [permissionLoadState, setPermissionLoadState] = useState<LoadState>("IDLE");
  const [outboxEntries, setOutboxEntries] = useState<MobileOutboxEntry[]>([]);
  const [outboxLoadState, setOutboxLoadState] = useState<LoadState>("IDLE");
  const dispatchingRequest = useRef<string | null>(null);
  const dispatchingAssistantRequest = useRef<string | null>(null);
  const dispatchingPreparedActionRequest = useRef<string | null>(null);
  const dispatchingEvidenceRequest = useRef<string | null>(null);
  const dispatchingPermissionRequest = useRef<string | null>(null);
  const activeWorkspaceId = useRef<string | null>(null);

  const refreshOutbox = useCallback(async (workspaceId: string) => {
    setOutboxLoadState("LOADING");
    try {
      const entries = await loadMobileOutbox({ workspaceId });
      setOutboxEntries(entries);
      setOutboxLoadState("READY");
    } catch {
      setOutboxEntries([]);
      setOutboxLoadState("UNAVAILABLE");
    }
  }, []);

  const prepareOutboxEntry = useCallback(async (
    kind: MobileOutboxKind,
    command: unknown,
    workspaceId: string,
  ) => {
    const entry = await enqueueMobileOutbox({ kind, command });
    await transitionMobileOutbox({ entryId: entry.entryId, state: "SENDING" });
    await refreshOutbox(workspaceId);
    return entry;
  }, [refreshOutbox]);

  const settleOutboxEntry = useCallback(async (
    entryId: string,
    state: Exclude<MobileOutboxState, "QUEUED" | "SENDING">,
    workspaceId: string,
    error: string | null = null,
  ) => {
    try {
      await transitionMobileOutbox({ entryId, state, publicError: error });
      await refreshOutbox(workspaceId);
    } catch {
      setOutboxLoadState("UNAVAILABLE");
    }
  }, [refreshOutbox]);

  const loadCockpit = useCallback(
    async (workspace: MobileWorkspace) => {
      await assertNetworkAvailable();
      const next = await api.cockpit(workspace.id);
      if (next.workspace.id !== workspace.id || next.workspace.role !== workspace.role) {
        throw new MobileApiError("INVALID_RESPONSE");
      }
      setCockpit(next);
      setActiveWorkspace(workspace);
      setTimeline(null);
      setTimelineLoadState("IDLE");
      if (activeWorkspaceId.current !== workspace.id) {
        setOutboxEntries([]);
        setOutboxLoadState("LOADING");
        setAssistantHistory(null);
        setAssistantLoadState("IDLE");
        setLatestAssistantAttempt(null);
        setLatestPreparedActionAttempt(null);
        setLatestEvidenceAttempt(null);
        setPermissionCenter(null);
        setPermissionLoadState("IDLE");
      }
      activeWorkspaceId.current = workspace.id;
      await refreshOutbox(workspace.id);
      return next;
    },
    [api, refreshOutbox],
  );

  const loadBootstrap = useCallback(async () => {
    setLoadState("LOADING");
    setPublicError(null);
    try {
      await assertNetworkAvailable();
      const nextBootstrap = await api.bootstrap();
      setBootstrap(nextBootstrap);
      const preferred =
        nextBootstrap.workspaces.find((workspace) => workspace.id === activeWorkspaceId.current) ??
        nextBootstrap.workspaces[0] ??
        null;
      if (preferred) await loadCockpit(preferred);
      else {
        setActiveWorkspace(null);
        activeWorkspaceId.current = null;
        setCockpit(null);
        setOutboxEntries([]);
        setOutboxLoadState("IDLE");
      }
      setLoadState("READY");
    } catch (error) {
      setLoadState("UNAVAILABLE");
      setPublicError(publicMessage(error));
      setCockpit(null);
    }
  }, [api, loadCockpit]);

  useEffect(() => {
    if (session.isPending || !signedInUserId) return;
    const timer = setTimeout(() => void loadBootstrap(), 0);
    return () => clearTimeout(timer);
  }, [loadBootstrap, session.isPending, signedInUserId]);

  const selectWorkspace = useCallback(
    async (workspaceId: string) => {
      const workspace = bootstrap?.workspaces.find((item) => item.id === workspaceId);
      if (!workspace) throw new Error("MOBILE_WORKSPACE_REFUSED");
      setLoadState("LOADING");
      setPublicError(null);
      try {
        await loadCockpit(workspace);
        setLoadState("READY");
      } catch (error) {
        setLoadState("UNAVAILABLE");
        setPublicError(publicMessage(error));
      }
    },
    [bootstrap?.workspaces, loadCockpit],
  );

  const refresh = useCallback(async () => {
    if (!activeWorkspace) return loadBootstrap();
    setLoadState("LOADING");
    setPublicError(null);
    try {
      await loadCockpit(activeWorkspace);
      setLoadState("READY");
    } catch (error) {
      setLoadState("UNAVAILABLE");
      setPublicError(publicMessage(error));
    }
  }, [activeWorkspace, loadBootstrap, loadCockpit]);

  const refreshAssistant = useCallback(async () => {
    if (!activeWorkspace || activeWorkspace.role === "FIELD_WORKER") {
      setAssistantHistory(null);
      setAssistantLoadState("IDLE");
      return;
    }
    setAssistantLoadState("LOADING");
    setPublicError(null);
    try {
      await assertNetworkAvailable();
      const history = await api.assistantHistory(activeWorkspace.id);
      setAssistantHistory(history);
      setAssistantLoadState("READY");
    } catch (error) {
      setAssistantHistory(null);
      setAssistantLoadState("UNAVAILABLE");
      setPublicError(publicMessage(error));
    }
  }, [activeWorkspace, api]);

  const submitAttempt = useCallback(
    async (value: CommandAttempt) => {
      if (!activeWorkspace) throw new Error("MOBILE_WORKSPACE_REQUIRED");
      assertCommandAllowed(activeWorkspace, value.command);
      if (dispatchingRequest.current) throw new Error("MOBILE_COMMAND_ALREADY_DISPATCHED");

      const sending = beginAttempt(value);
      dispatchingRequest.current = sending.command.requestId;
      setLatestAttempt(sending);
      setPublicError(null);
      try {
        await prepareOutboxEntry("OPERATING_COMMAND", sending.command, activeWorkspace.id);
        await assertNetworkAvailable();
        const result = await api.command(sending.command);
        if (result.requestId !== sending.command.requestId) {
          throw new MobileApiError("INVALID_RESPONSE");
        }
        const completed = finishAttempt(sending, result.replayed ? "REPLAYED" : "CONFIRMED");
        setLatestAttempt(completed);
        await settleOutboxEntry(
          sending.command.requestId,
          result.replayed ? "REPLAYED" : "CONFIRMED",
          activeWorkspace.id,
        );
        await loadCockpit(activeWorkspace)
          .then(() => setLoadState("READY"))
          .catch(() => setLoadState("UNAVAILABLE"));
        return completed;
      } catch (error) {
        const state =
          error instanceof MobileApiError && error.code === "CONFLICT"
            ? "CONFLICT"
            : error instanceof MobileApiError && error.code === "OUTCOME_UNKNOWN"
              ? "OUTCOME_UNKNOWN"
              : "REFUSED";
        const failed = finishAttempt(sending, state, publicMessage(error));
        setLatestAttempt(failed);
        setPublicError(failed.publicError);
        await settleOutboxEntry(
          sending.command.requestId,
          state,
          activeWorkspace.id,
          failed.publicError,
        );
        if (state === "CONFLICT") await loadCockpit(activeWorkspace).catch(() => undefined);
        return failed;
      } finally {
        dispatchingRequest.current = null;
      }
    },
    [activeWorkspace, api, loadCockpit, prepareOutboxEntry, settleOutboxEntry],
  );

  const submitAssistantAttempt = useCallback(
    async (value: AssistantAttempt) => {
      if (!activeWorkspace || activeWorkspace.role === "FIELD_WORKER") {
        throw new Error("MOBILE_ASSISTANT_PERMISSION_REFUSED");
      }
      if (value.request.workspaceId !== activeWorkspace.id) {
        throw new Error("MOBILE_ASSISTANT_WORKSPACE_REFUSED");
      }
      if (dispatchingAssistantRequest.current) {
        throw new Error("MOBILE_ASSISTANT_ALREADY_DISPATCHED");
      }
      const sending = beginAssistantAttempt(value);
      dispatchingAssistantRequest.current = sending.request.requestId;
      setLatestAssistantAttempt(sending);
      setPublicError(null);
      try {
        await prepareOutboxEntry("ASSISTANT_REQUEST", sending.request, activeWorkspace.id);
        await assertNetworkAvailable();
        const result = await api.assistant(sending.request);
        const completed = finishAssistantAttempt(sending, {
          state: result.replayed ? "REPLAYED" : "CONFIRMED",
          result,
        });
        setLatestAssistantAttempt(completed);
        await settleOutboxEntry(
          sending.request.requestId,
          result.replayed ? "REPLAYED" : "CONFIRMED",
          activeWorkspace.id,
        );
        const history = await api.assistantHistory(activeWorkspace.id).catch(() => null);
        if (history) {
          setAssistantHistory(history);
          setAssistantLoadState("READY");
        } else {
          setAssistantLoadState("UNAVAILABLE");
        }
        await loadCockpit(activeWorkspace)
          .then(() => setLoadState("READY"))
          .catch(() => setLoadState("UNAVAILABLE"));
        return completed;
      } catch (error) {
        const state =
          error instanceof MobileApiError && error.code === "OUTCOME_UNKNOWN"
            ? "OUTCOME_UNKNOWN"
            : "REFUSED";
        const failed = finishAssistantAttempt(sending, {
          state,
          publicError: publicMessage(error),
        });
        setLatestAssistantAttempt(failed);
        setPublicError(failed.publicError);
        await settleOutboxEntry(
          sending.request.requestId,
          state,
          activeWorkspace.id,
          failed.publicError,
        );
        return failed;
      } finally {
        dispatchingAssistantRequest.current = null;
      }
    },
    [activeWorkspace, api, loadCockpit, prepareOutboxEntry, settleOutboxEntry],
  );

  const submitPreparedActionAttempt = useCallback(
    async (value: PreparedActionAttempt) => {
      if (!activeWorkspace || activeWorkspace.role === "FIELD_WORKER") {
        throw new Error("MOBILE_PREPARED_ACTION_PERMISSION_REFUSED");
      }
      if (value.command.workspaceId !== activeWorkspace.id) {
        throw new Error("MOBILE_PREPARED_ACTION_WORKSPACE_REFUSED");
      }
      if (dispatchingPreparedActionRequest.current) {
        throw new Error("MOBILE_PREPARED_ACTION_ALREADY_DISPATCHED");
      }
      const sending = beginPreparedActionAttempt(value);
      dispatchingPreparedActionRequest.current = sending.command.commandId;
      setLatestPreparedActionAttempt(sending);
      setPublicError(null);
      try {
        await prepareOutboxEntry(
          "PREPARED_ACTION_DECISION",
          sending.command,
          activeWorkspace.id,
        );
        await assertNetworkAvailable();
        const result = await api.decidePreparedAction(sending.command);
        const completed = finishPreparedActionAttempt(sending, {
          state: result.replayed ? "REPLAYED" : "CONFIRMED",
          result,
        });
        setLatestPreparedActionAttempt(completed);
        await settleOutboxEntry(
          sending.command.commandId,
          result.replayed ? "REPLAYED" : "CONFIRMED",
          activeWorkspace.id,
        );
        await loadCockpit(activeWorkspace)
          .then(() => setLoadState("READY"))
          .catch(() => setLoadState("UNAVAILABLE"));
        return completed;
      } catch (error) {
        const state =
          error instanceof MobileApiError && error.code === "CONFLICT"
            ? "CONFLICT"
            : error instanceof MobileApiError && error.code === "OUTCOME_UNKNOWN"
              ? "OUTCOME_UNKNOWN"
              : "REFUSED";
        const failed = finishPreparedActionAttempt(sending, {
          state,
          publicError: publicMessage(error),
        });
        setLatestPreparedActionAttempt(failed);
        setPublicError(failed.publicError);
        await settleOutboxEntry(
          sending.command.commandId,
          state,
          activeWorkspace.id,
          failed.publicError,
        );
        if (state === "CONFLICT") {
          await loadCockpit(activeWorkspace).catch(() => undefined);
        }
        return failed;
      } finally {
        dispatchingPreparedActionRequest.current = null;
      }
    },
    [activeWorkspace, api, loadCockpit, prepareOutboxEntry, settleOutboxEntry],
  );

  const submitEvidenceAttempt = useCallback(
    async (value: EvidenceAttempt) => {
      if (!activeWorkspace?.permissions.canAddEvidence) {
        throw new Error("MOBILE_EVIDENCE_PERMISSION_REFUSED");
      }
      if (value.command.workspaceId !== activeWorkspace.id) {
        throw new Error("MOBILE_EVIDENCE_WORKSPACE_REFUSED");
      }
      if (dispatchingEvidenceRequest.current) {
        throw new Error("MOBILE_EVIDENCE_ALREADY_DISPATCHED");
      }
      const sending = beginEvidenceAttempt(value);
      dispatchingEvidenceRequest.current = sending.command.commandId;
      setLatestEvidenceAttempt(sending);
      setPublicError(null);
      try {
        await assertNetworkAvailable();
        const result = await api.uploadEvidence(sending.command);
        const completed = finishEvidenceAttempt(sending, {
          state: result.replayed ? "REPLAYED" : "CONFIRMED",
          result,
        });
        setLatestEvidenceAttempt(completed);
        await loadCockpit(activeWorkspace);
        setLoadState("READY");
        return completed;
      } catch (error) {
        const state =
          error instanceof MobileApiError && error.code === "CONFLICT"
            ? "CONFLICT"
            : error instanceof MobileApiError && error.code === "OUTCOME_UNKNOWN"
              ? "OUTCOME_UNKNOWN"
              : "REFUSED";
        const failed = finishEvidenceAttempt(sending, {
          state,
          publicError: publicMessage(error),
        });
        setLatestEvidenceAttempt(failed);
        setPublicError(failed.publicError);
        if (state === "CONFLICT") {
          await loadCockpit(activeWorkspace).catch(() => undefined);
        }
        return failed;
      } finally {
        dispatchingEvidenceRequest.current = null;
      }
    },
    [activeWorkspace, api, loadCockpit],
  );

  const loadTimeline = useCallback(
    async (projectId: string) => {
      if (!activeWorkspace) throw new Error("MOBILE_WORKSPACE_REQUIRED");
      if (!cockpit?.projects.some((project) => project.id === projectId)) {
        throw new Error("MOBILE_TIMELINE_PROJECT_REFUSED");
      }
      setTimelineLoadState("LOADING");
      setPublicError(null);
      try {
        await assertNetworkAvailable();
        const result = await api.projectTimeline(activeWorkspace.id, projectId);
        setTimeline(result);
        setTimelineLoadState("READY");
      } catch (error) {
        setTimeline(null);
        setTimelineLoadState("UNAVAILABLE");
        setPublicError(publicMessage(error));
      }
    },
    [activeWorkspace, api, cockpit?.projects],
  );

  const loadPermissions = useCallback(async () => {
    if (!activeWorkspace) throw new Error("MOBILE_WORKSPACE_REQUIRED");
    setPermissionLoadState("LOADING");
    setPublicError(null);
    try {
      await assertNetworkAvailable();
      const result = await api.permissionCenter(activeWorkspace.id);
      if (result.currentUser.role !== activeWorkspace.role) {
        throw new MobileApiError("INVALID_RESPONSE");
      }
      setPermissionCenter(result);
      setPermissionLoadState("READY");
    } catch (error) {
      setPermissionCenter(null);
      setPermissionLoadState("UNAVAILABLE");
      setPublicError(publicMessage(error));
    }
  }, [activeWorkspace, api]);

  const revokePermission = useCallback(async (command: MobileRevokePermissionCommand) => {
    if (!activeWorkspace || activeWorkspace.role === "FIELD_WORKER") {
      throw new Error("MOBILE_PERMISSION_MANAGEMENT_REFUSED");
    }
    if (command.workspaceId !== activeWorkspace.id) {
      throw new Error("MOBILE_PERMISSION_WORKSPACE_REFUSED");
    }
    if (dispatchingPermissionRequest.current) {
      throw new Error("MOBILE_PERMISSION_ALREADY_DISPATCHED");
    }
    dispatchingPermissionRequest.current = command.commandId;
    setPermissionLoadState("LOADING");
    setPublicError(null);
    try {
      await prepareOutboxEntry("PERMISSION_REVOCATION", command, activeWorkspace.id);
      await assertNetworkAvailable();
      const result = await api.revokePermission(command);
      await settleOutboxEntry(
        command.commandId,
        result.replayed ? "REPLAYED" : "CONFIRMED",
        activeWorkspace.id,
      );
      const refreshed = await api.permissionCenter(activeWorkspace.id).catch(() => null);
      if (refreshed) {
        setPermissionCenter(refreshed);
        setPermissionLoadState("READY");
      } else {
        setPermissionLoadState("UNAVAILABLE");
      }
    } catch (error) {
      const state =
        error instanceof MobileApiError && error.code === "CONFLICT"
          ? "CONFLICT"
          : error instanceof MobileApiError && error.code === "OUTCOME_UNKNOWN"
            ? "OUTCOME_UNKNOWN"
            : "REFUSED";
      setPermissionLoadState("UNAVAILABLE");
      setPublicError(publicMessage(error));
      await settleOutboxEntry(
        command.commandId,
        state,
        activeWorkspace.id,
        publicMessage(error),
      );
    } finally {
      dispatchingPermissionRequest.current = null;
    }
  }, [activeWorkspace, api, prepareOutboxEntry, settleOutboxEntry]);

  const retryOutboxEntry = useCallback(async (entryId: string) => {
    if (!activeWorkspace) throw new Error("MOBILE_WORKSPACE_REQUIRED");
    const entry = outboxEntries.find((candidate) => candidate.entryId === entryId);
    if (!entry || entry.workspaceId !== activeWorkspace.id) {
      throw new Error("MOBILE_OUTBOX_WORKSPACE_REFUSED");
    }
    if (entry.state !== "QUEUED" && entry.state !== "OUTCOME_UNKNOWN") {
      throw new Error("MOBILE_OUTBOX_RETRY_REFUSED");
    }
    const attemptState = entry.state === "OUTCOME_UNKNOWN" ? "OUTCOME_UNKNOWN" : "READY";
    if (entry.kind === "OPERATING_COMMAND") {
      await submitAttempt({ command: entry.command, state: attemptState, publicError: null });
    } else if (entry.kind === "ASSISTANT_REQUEST") {
      await submitAssistantAttempt({
        request: entry.command,
        state: attemptState,
        result: null,
        publicError: null,
      });
    } else if (entry.kind === "PREPARED_ACTION_DECISION") {
      await submitPreparedActionAttempt({
        command: entry.command,
        state: attemptState,
        result: null,
        publicError: null,
      });
    } else {
      await revokePermission(entry.command);
    }
    await refreshOutbox(activeWorkspace.id);
  }, [
    activeWorkspace,
    outboxEntries,
    refreshOutbox,
    revokePermission,
    submitAssistantAttempt,
    submitAttempt,
    submitPreparedActionAttempt,
  ]);

  const discardOutboxEntry = useCallback(async (entryId: string) => {
    if (!activeWorkspace) throw new Error("MOBILE_WORKSPACE_REQUIRED");
    const entry = outboxEntries.find((candidate) => candidate.entryId === entryId);
    if (!entry || entry.workspaceId !== activeWorkspace.id) {
      throw new Error("MOBILE_OUTBOX_WORKSPACE_REFUSED");
    }
    await discardStoredOutboxEntry({ entryId });
    await refreshOutbox(activeWorkspace.id);
  }, [activeWorkspace, outboxEntries, refreshOutbox]);

  const signOut = useCallback(async () => {
    try {
      await clearMobileOutbox();
    } catch {
      setOutboxLoadState("UNAVAILABLE");
      setPublicError("La déconnexion est bloquée tant que la boîte locale chiffrée ne peut pas être effacée.");
      return;
    }
    await authClient.signOut();
    setBootstrap(null);
    setActiveWorkspace(null);
    activeWorkspaceId.current = null;
    setCockpit(null);
    setLatestAttempt(null);
    setAssistantHistory(null);
    setAssistantLoadState("IDLE");
    setLatestAssistantAttempt(null);
    setLatestPreparedActionAttempt(null);
    setLatestEvidenceAttempt(null);
    setTimeline(null);
    setTimelineLoadState("IDLE");
    setPermissionCenter(null);
    setPermissionLoadState("IDLE");
    setOutboxEntries([]);
    setOutboxLoadState("IDLE");
    setLoadState("IDLE");
  }, []);

  const value = useMemo<MobileSessionValue>(
    () => ({
      sessionPending: session.isPending,
      signedIn: Boolean(session.data?.user),
      bootstrap,
      activeWorkspace,
      cockpit,
      loadState,
      publicError,
      latestAttempt,
      assistantHistory,
      assistantLoadState,
      latestAssistantAttempt,
      latestPreparedActionAttempt,
      latestEvidenceAttempt,
      timeline,
      timelineLoadState,
      permissionCenter,
      permissionLoadState,
      outboxEntries,
      outboxLoadState,
      selectWorkspace,
      refresh,
      refreshAssistant,
      submitAttempt,
      submitAssistantAttempt,
      submitPreparedActionAttempt,
      submitEvidenceAttempt,
      loadTimeline,
      loadPermissions,
      revokePermission,
      retryOutboxEntry,
      discardOutboxEntry,
      signOut,
    }),
    [
      activeWorkspace,
      assistantHistory,
      assistantLoadState,
      bootstrap,
      cockpit,
      latestAttempt,
      latestAssistantAttempt,
      latestPreparedActionAttempt,
      latestEvidenceAttempt,
      timeline,
      timelineLoadState,
      permissionCenter,
      permissionLoadState,
      outboxEntries,
      outboxLoadState,
      loadState,
      publicError,
      refresh,
      refreshAssistant,
      selectWorkspace,
      session.data?.user,
      session.isPending,
      signOut,
      submitAttempt,
      submitAssistantAttempt,
      submitPreparedActionAttempt,
      submitEvidenceAttempt,
      loadTimeline,
      loadPermissions,
      revokePermission,
      retryOutboxEntry,
      discardOutboxEntry,
    ],
  );

  return <MobileSessionContext.Provider value={value}>{children}</MobileSessionContext.Provider>;
}

export function useMobileSession() {
  const value = useContext(MobileSessionContext);
  if (!value) throw new Error("MobileSessionProvider is required.");
  return value;
}
