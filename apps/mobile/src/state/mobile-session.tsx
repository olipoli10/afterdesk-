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
  selectWorkspace: (workspaceId: string) => Promise<void>;
  refresh: () => Promise<void>;
  submitAttempt: (attempt: CommandAttempt) => Promise<CommandAttempt>;
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
  const dispatchingRequest = useRef<string | null>(null);
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

  const signOut = useCallback(async () => {
    await authClient.signOut();
    setBootstrap(null);
    setActiveWorkspace(null);
    activeWorkspaceId.current = null;
    setCockpit(null);
    setLatestAttempt(null);
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
      selectWorkspace,
      refresh,
      submitAttempt,
      signOut,
    }),
    [
      activeWorkspace,
      bootstrap,
      cockpit,
      latestAttempt,
      loadState,
      publicError,
      refresh,
      selectWorkspace,
      session.data?.user,
      session.isPending,
      signOut,
      submitAttempt,
    ],
  );

  return <MobileSessionContext.Provider value={value}>{children}</MobileSessionContext.Provider>;
}

export function useMobileSession() {
  const value = useContext(MobileSessionContext);
  if (!value) throw new Error("MobileSessionProvider is required.");
  return value;
}
