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
  selectWorkspace: (workspaceId: string) => Promise<void>;
  refresh: () => Promise<void>;
  refreshAssistant: () => Promise<void>;
  submitAttempt: (attempt: CommandAttempt) => Promise<CommandAttempt>;
  submitAssistantAttempt: (attempt: AssistantAttempt) => Promise<AssistantAttempt>;
  submitPreparedActionAttempt: (
    attempt: PreparedActionAttempt,
  ) => Promise<PreparedActionAttempt>;
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
  const dispatchingRequest = useRef<string | null>(null);
  const dispatchingAssistantRequest = useRef<string | null>(null);
  const dispatchingPreparedActionRequest = useRef<string | null>(null);
  const activeWorkspaceId = useRef<string | null>(null);

  const loadCockpit = useCallback(
    async (workspace: MobileWorkspace) => {
      await assertNetworkAvailable();
      const next = await api.cockpit(workspace.id);
      if (next.workspace.id !== workspace.id || next.workspace.role !== workspace.role) {
        throw new MobileApiError("INVALID_RESPONSE");
      }
      setCockpit(next);
      setActiveWorkspace(workspace);
      if (activeWorkspaceId.current !== workspace.id) {
        setAssistantHistory(null);
        setAssistantLoadState("IDLE");
        setLatestAssistantAttempt(null);
        setLatestPreparedActionAttempt(null);
      }
      activeWorkspaceId.current = workspace.id;
      return next;
    },
    [api],
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
        await assertNetworkAvailable();
        const result = await api.command(sending.command);
        if (result.requestId !== sending.command.requestId) {
          throw new MobileApiError("INVALID_RESPONSE");
        }
        const completed = finishAttempt(sending, result.replayed ? "REPLAYED" : "CONFIRMED");
        setLatestAttempt(completed);
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
        const failed = finishAttempt(sending, state, publicMessage(error));
        setLatestAttempt(failed);
        setPublicError(failed.publicError);
        if (state === "CONFLICT") await loadCockpit(activeWorkspace).catch(() => undefined);
        return failed;
      } finally {
        dispatchingRequest.current = null;
      }
    },
    [activeWorkspace, api, loadCockpit],
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
        await assertNetworkAvailable();
        const result = await api.assistant(sending.request);
        const completed = finishAssistantAttempt(sending, {
          state: result.replayed ? "REPLAYED" : "CONFIRMED",
          result,
        });
        setLatestAssistantAttempt(completed);
        const [history] = await Promise.all([
          api.assistantHistory(activeWorkspace.id),
          loadCockpit(activeWorkspace),
        ]);
        setAssistantHistory(history);
        setAssistantLoadState("READY");
        setLoadState("READY");
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
        return failed;
      } finally {
        dispatchingAssistantRequest.current = null;
      }
    },
    [activeWorkspace, api, loadCockpit],
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
        await assertNetworkAvailable();
        const result = await api.decidePreparedAction(sending.command);
        const completed = finishPreparedActionAttempt(sending, {
          state: result.replayed ? "REPLAYED" : "CONFIRMED",
          result,
        });
        setLatestPreparedActionAttempt(completed);
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
        const failed = finishPreparedActionAttempt(sending, {
          state,
          publicError: publicMessage(error),
        });
        setLatestPreparedActionAttempt(failed);
        setPublicError(failed.publicError);
        if (state === "CONFLICT") {
          await loadCockpit(activeWorkspace).catch(() => undefined);
        }
        return failed;
      } finally {
        dispatchingPreparedActionRequest.current = null;
      }
    },
    [activeWorkspace, api, loadCockpit],
  );

  const signOut = useCallback(async () => {
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
      selectWorkspace,
      refresh,
      refreshAssistant,
      submitAttempt,
      submitAssistantAttempt,
      submitPreparedActionAttempt,
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
    ],
  );

  return <MobileSessionContext.Provider value={value}>{children}</MobileSessionContext.Provider>;
}

export function useMobileSession() {
  const value = useContext(MobileSessionContext);
  if (!value) throw new Error("MobileSessionProvider is required.");
  return value;
}
