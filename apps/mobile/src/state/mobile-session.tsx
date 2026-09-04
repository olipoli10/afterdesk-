import * as Network from "expo-network";
import { Platform } from "react-native";
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
import type { MobileProjectProvenance } from "@/lib/provenance";
import type { MobileJobCommand, MobileJobSchedule } from "@/lib/jobs";
import type {
  MobileFollowUpCommand,
  MobileFollowUpQueue,
} from "@/lib/follow-ups";
import type {
  MobileEconomicCockpit,
  MobileEconomicCommand,
} from "@/lib/invoices";
import type {
  MobileHumanEscalationCockpit,
  MobileHumanEscalationCommand,
} from "@/lib/human-escalations";
import type {
  MobileCalendarConnectorCockpit,
  MobileCalendarConnectorCommand,
} from "@/lib/calendar-connectors";
import type {
  MobileMessagingCockpit,
  MobileMessagingCommand,
} from "@/lib/messages";
import {
  beginVoiceNoteAttempt,
  finishVoiceNoteAttempt,
  type MobilePrepareCallWorkCommand,
  type MobileVoiceCallsCockpit,
  type VoiceNoteAttempt,
} from "@/lib/voice-calls";
import type { MobileEmailCockpit, MobileEmailCommand } from "@/lib/email-inbox";
import type { MobileAccountingCockpit, MobileAccountingCommand } from "@/lib/accounting";
import type { MobileAuthorityCockpit, MobileAuthorityCommand } from "@/lib/authority-policies";
import type { MobilePrivacyCockpit, MobilePrivacyCommand } from "@/lib/privacy";
import type { MobileReliabilityCockpit, MobileReliabilityCommand } from "@/lib/reliability";
import type { MobileOnboardingCockpit, MobileOnboardingCommand } from "@/lib/onboarding";
import type { MobileGoldenWorkflow } from "@/lib/golden-workflow";
import type {
  MobileProjectBrainUnderstandingCommand,
  MobileProjectBrainUnderstandingProjection,
} from "@/lib/project-brain-understanding-review";
import type {
  MobileProjectBrainAssistantCommand,
  MobileProjectBrainAssistantMemoryProjection,
  MobileProjectBrainAssistantResult,
} from "@/lib/project-brain-assistant-memory";
import {
  beginProjectBrainSourceAttempt,
  finishProjectBrainSourceAttempt,
  projectBrainFailureStateForApiCode,
  projectBrainIntakeForContext,
  rebaseReadyProjectBrainSourceAttempt,
  removeProjectBrainSourceAttempt,
  stageProjectBrainSourceAttempts,
  type MobileProjectBrainCommand,
  type MobileProjectBrainIntakeProjection,
  type ProjectBrainSourceAttempt,
} from "@/lib/project-brain-intake";
import {
  beginProjectBrainCommandAttempt,
  clearProjectBrainIntents,
  commandIntent,
  createProjectBrainCommandAttempt,
  enqueueProjectBrainIntent,
  finishProjectBrainCommandAttempt,
  hasProjectBrainIntents,
  loadProjectBrainIntentSnapshot,
  projectBrainCommandQueueForContext,
  removeProjectBrainIntent,
  replaceReadyProjectBrainSourceIntent,
  sourceIntent,
  transitionProjectBrainIntent,
  type ProjectBrainCommandAttempt,
  type ProjectBrainIntentState,
} from "@/lib/project-brain-intent-queue";
import {
  reconcileProjectBrainSourceFiles,
  releaseProjectBrainSourceAttempt,
  retainProjectBrainSourceAttempt,
  withProjectBrainSourceLifecycleLock,
} from "@/lib/project-brain-source-files";
import { mobileProductCopy } from "@/lib/product-experience";
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
  provenance: MobileProjectProvenance | null;
  provenanceLoadState: LoadState;
  jobSchedule: MobileJobSchedule | null;
  jobScheduleLoadState: LoadState;
  followUpQueue: MobileFollowUpQueue | null;
  followUpQueueLoadState: LoadState;
  economicCockpit: MobileEconomicCockpit | null;
  economicCockpitLoadState: LoadState;
  humanEscalationCockpit: MobileHumanEscalationCockpit | null;
  humanEscalationLoadState: LoadState;
  calendarConnectorCockpit: MobileCalendarConnectorCockpit | null;
  calendarConnectorLoadState: LoadState;
  messagingCockpit: MobileMessagingCockpit | null;
  messagingLoadState: LoadState;
  voiceCallsCockpit: MobileVoiceCallsCockpit | null;
  voiceCallsLoadState: LoadState;
  latestVoiceNoteAttempt: VoiceNoteAttempt | null;
  emailCockpit: MobileEmailCockpit | null;
  emailLoadState: LoadState;
  accountingCockpit: MobileAccountingCockpit | null;
  accountingLoadState: LoadState;
  authorityCockpit: MobileAuthorityCockpit | null;
  authorityLoadState: LoadState;
  privacyCockpit: MobilePrivacyCockpit | null;
  privacyLoadState: LoadState;
  reliabilityCockpit: MobileReliabilityCockpit | null;
  reliabilityLoadState: LoadState;
  onboardingCockpit: MobileOnboardingCockpit | null;
  onboardingLoadState: LoadState;
  goldenWorkflow: MobileGoldenWorkflow | null;
  goldenWorkflowLoadState: LoadState;
  projectBrainIntake: MobileProjectBrainIntakeProjection | null;
  projectBrainLoadState: LoadState;
  projectBrainCommandQueue: ProjectBrainCommandAttempt[];
  projectBrainSourceQueue: ProjectBrainSourceAttempt[];
  projectBrainUnderstanding: MobileProjectBrainUnderstandingProjection | null;
  projectBrainUnderstandingLoadState: LoadState;
  projectBrainAssistantMemory: MobileProjectBrainAssistantMemoryProjection | null;
  projectBrainAssistantMemoryLoadState: LoadState;
  latestProjectBrainAssistantResult: MobileProjectBrainAssistantResult | null;
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
  loadProvenance: (projectId: string) => Promise<void>;
  loadJobSchedule: (projectId?: string) => Promise<void>;
  submitJobCommand: (command: MobileJobCommand) => Promise<void>;
  loadFollowUpQueue: (projectId?: string) => Promise<void>;
  submitFollowUpCommand: (command: MobileFollowUpCommand) => Promise<void>;
  loadEconomicCockpit: () => Promise<void>;
  submitEconomicCommand: (command: MobileEconomicCommand) => Promise<void>;
  loadHumanEscalations: () => Promise<void>;
  submitHumanEscalationCommand: (command: MobileHumanEscalationCommand) => Promise<void>;
  loadCalendarConnectors: () => Promise<void>;
  submitCalendarConnectorCommand: (command: MobileCalendarConnectorCommand) => Promise<void>;
  loadMessaging: () => Promise<void>;
  submitMessagingCommand: (command: MobileMessagingCommand) => Promise<void>;
  loadVoiceCalls: () => Promise<void>;
  submitPrepareCallWork: (command: MobilePrepareCallWorkCommand) => Promise<void>;
  submitVoiceNoteAttempt: (attempt: VoiceNoteAttempt) => Promise<VoiceNoteAttempt>;
  loadEmail: () => Promise<void>;
  submitEmailCommand: (command: MobileEmailCommand) => Promise<void>;
  loadAccounting: () => Promise<void>;
  submitAccountingCommand: (command: MobileAccountingCommand) => Promise<void>;
  loadAuthority: () => Promise<void>;
  submitAuthorityCommand: (command: MobileAuthorityCommand) => Promise<void>;
  loadPrivacy: () => Promise<void>;
  submitPrivacyCommand: (command: MobilePrivacyCommand) => Promise<void>;
  loadReliability: () => Promise<void>;
  submitReliabilityCommand: (command: MobileReliabilityCommand) => Promise<void>;
  loadOnboarding: (workspaceId?: string) => Promise<void>;
  submitOnboardingCommand: (command: MobileOnboardingCommand) => Promise<void>;
  loadGoldenWorkflow: () => Promise<void>;
  loadProjectBrainIntake: (projectId: string) => Promise<void>;
  submitProjectBrainCommand: (command: MobileProjectBrainCommand) => Promise<ProjectBrainCommandAttempt>;
  retryProjectBrainCommand: (commandId: string) => Promise<ProjectBrainCommandAttempt>;
  stageProjectBrainSources: (attempts: readonly ProjectBrainSourceAttempt[]) => Promise<readonly ProjectBrainSourceAttempt[]>;
  uploadProjectBrainSource: (attempt: ProjectBrainSourceAttempt) => Promise<ProjectBrainSourceAttempt>;
  retryProjectBrainSource: (commandId: string) => Promise<ProjectBrainSourceAttempt>;
  dismissProjectBrainIntent: (commandId: string) => Promise<void>;
  loadProjectBrainUnderstanding: (projectId: string) => Promise<void>;
  submitProjectBrainUnderstandingCommand: (command: MobileProjectBrainUnderstandingCommand) => Promise<void>;
  loadProjectBrainAssistantMemory: (projectId: string) => Promise<void>;
  submitProjectBrainAssistantMemoryCommand: (command: MobileProjectBrainAssistantCommand) => Promise<MobileProjectBrainAssistantResult>;
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

export function projectBrainFailureState(error: unknown): Exclude<ProjectBrainIntentState, "READY" | "SENDING" | "CONFIRMED" | "REPLAYED"> {
  return projectBrainFailureStateForApiCode(
    error instanceof MobileApiError ? error.code : undefined,
  );
}

async function assertNetworkAvailable() {
  if (Platform.OS === "web") {
    if (typeof navigator !== "undefined" && navigator.onLine === false) {
      throw new MobileApiError("OUTCOME_UNKNOWN");
    }
    return;
  }
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
  const api = useMemo(
    () =>
      new MobileApi({
        browserManagedCredentials: Platform.OS === "web",
        getCookie: () => {
          try {
            return typeof authClient.getCookie === "function" ? authClient.getCookie() : "";
          } catch {
            return "";
          }
        },
      }),
    [],
  );
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
  const [provenance, setProvenance] = useState<MobileProjectProvenance | null>(null);
  const [provenanceLoadState, setProvenanceLoadState] = useState<LoadState>("IDLE");
  const [jobSchedule, setJobSchedule] = useState<MobileJobSchedule | null>(null);
  const [jobScheduleLoadState, setJobScheduleLoadState] = useState<LoadState>("IDLE");
  const [followUpQueue, setFollowUpQueue] = useState<MobileFollowUpQueue | null>(null);
  const [followUpQueueLoadState, setFollowUpQueueLoadState] = useState<LoadState>("IDLE");
  const [economicCockpit, setEconomicCockpit] = useState<MobileEconomicCockpit | null>(null);
  const [economicCockpitLoadState, setEconomicCockpitLoadState] = useState<LoadState>("IDLE");
  const [humanEscalationCockpit, setHumanEscalationCockpit] =
    useState<MobileHumanEscalationCockpit | null>(null);
  const [humanEscalationLoadState, setHumanEscalationLoadState] =
    useState<LoadState>("IDLE");
  const [calendarConnectorCockpit, setCalendarConnectorCockpit] =
    useState<MobileCalendarConnectorCockpit | null>(null);
  const [calendarConnectorLoadState, setCalendarConnectorLoadState] =
    useState<LoadState>("IDLE");
  const [messagingCockpit, setMessagingCockpit] = useState<MobileMessagingCockpit | null>(null);
  const [messagingLoadState, setMessagingLoadState] = useState<LoadState>("IDLE");
  const [voiceCallsCockpit, setVoiceCallsCockpit] = useState<MobileVoiceCallsCockpit | null>(null);
  const [voiceCallsLoadState, setVoiceCallsLoadState] = useState<LoadState>("IDLE");
  const [latestVoiceNoteAttempt, setLatestVoiceNoteAttempt] = useState<VoiceNoteAttempt | null>(null);
  const [projectBrainIntake, setProjectBrainIntake] = useState<MobileProjectBrainIntakeProjection | null>(null);
  const [projectBrainLoadState, setProjectBrainLoadState] = useState<LoadState>("IDLE");
  const [projectBrainCommandQueue, setProjectBrainCommandQueue] = useState<ProjectBrainCommandAttempt[]>([]);
  const [projectBrainSourceQueue, setProjectBrainSourceQueue] = useState<ProjectBrainSourceAttempt[]>([]);
  const [projectBrainUnderstanding, setProjectBrainUnderstanding] = useState<MobileProjectBrainUnderstandingProjection | null>(null);
  const [projectBrainUnderstandingLoadState, setProjectBrainUnderstandingLoadState] = useState<LoadState>("IDLE");
  const [projectBrainAssistantMemory, setProjectBrainAssistantMemory] = useState<MobileProjectBrainAssistantMemoryProjection | null>(null);
  const [projectBrainAssistantMemoryLoadState, setProjectBrainAssistantMemoryLoadState] = useState<LoadState>("IDLE");
  const [latestProjectBrainAssistantResult, setLatestProjectBrainAssistantResult] = useState<MobileProjectBrainAssistantResult | null>(null);
  const [emailCockpit, setEmailCockpit] = useState<MobileEmailCockpit | null>(null);
  const [emailLoadState, setEmailLoadState] = useState<LoadState>("IDLE");
  const [accountingCockpit, setAccountingCockpit] = useState<MobileAccountingCockpit | null>(null);
  const [accountingLoadState, setAccountingLoadState] = useState<LoadState>("IDLE");
  const [authorityCockpit, setAuthorityCockpit] = useState<MobileAuthorityCockpit | null>(null);
  const [authorityLoadState, setAuthorityLoadState] = useState<LoadState>("IDLE");
  const [privacyCockpit, setPrivacyCockpit] = useState<MobilePrivacyCockpit | null>(null);
  const [privacyLoadState, setPrivacyLoadState] = useState<LoadState>("IDLE");
  const [reliabilityCockpit, setReliabilityCockpit] = useState<MobileReliabilityCockpit | null>(null);
  const [reliabilityLoadState, setReliabilityLoadState] = useState<LoadState>("IDLE");
  const [onboardingCockpit, setOnboardingCockpit] = useState<MobileOnboardingCockpit | null>(null);
  const [onboardingLoadState, setOnboardingLoadState] = useState<LoadState>("IDLE");
  const [goldenWorkflow, setGoldenWorkflow] = useState<MobileGoldenWorkflow | null>(null);
  const [goldenWorkflowLoadState, setGoldenWorkflowLoadState] = useState<LoadState>("IDLE");
  const [permissionCenter, setPermissionCenter] = useState<MobilePermissionCenter | null>(null);
  const [permissionLoadState, setPermissionLoadState] = useState<LoadState>("IDLE");
  const [outboxEntries, setOutboxEntries] = useState<MobileOutboxEntry[]>([]);
  const [outboxLoadState, setOutboxLoadState] = useState<LoadState>("IDLE");
  const dispatchingRequest = useRef<string | null>(null);
  const dispatchingAssistantRequest = useRef<string | null>(null);
  const dispatchingPreparedActionRequest = useRef<string | null>(null);
  const dispatchingEvidenceRequest = useRef<string | null>(null);
  const dispatchingPermissionRequest = useRef<string | null>(null);
  const dispatchingJobRequest = useRef<string | null>(null);
  const dispatchingFollowUpRequest = useRef<string | null>(null);
  const dispatchingEconomicRequest = useRef<string | null>(null);
  const dispatchingHumanEscalationRequest = useRef<string | null>(null);
  const dispatchingCalendarConnectorRequest = useRef<string | null>(null);
  const dispatchingMessagingRequest = useRef<string | null>(null);
  const dispatchingVoiceCallRequest = useRef<string | null>(null);
  const dispatchingVoiceNoteRequest = useRef<string | null>(null);
  const dispatchingProjectBrainCommand = useRef<string | null>(null);
  const dispatchingProjectBrainSources = useRef(new Set<string>());
  const projectBrainContext = useRef<{ workspaceId: string; projectId: string } | null>(null);
  const dispatchingEmailRequest = useRef<string | null>(null);
  const dispatchingAccountingRequest = useRef<string | null>(null);
  const dispatchingAuthorityRequest = useRef<string | null>(null);
  const dispatchingPrivacyRequest = useRef<string | null>(null);
  const dispatchingReliabilityRequest = useRef<string | null>(null);
  const dispatchingOnboardingRequest = useRef<string | null>(null);
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
      setProvenance(null);
      setProvenanceLoadState("IDLE");
      setJobSchedule(null);
      setJobScheduleLoadState("IDLE");
      setFollowUpQueue(null);
      setFollowUpQueueLoadState("IDLE");
      setEconomicCockpit(null);
      setEconomicCockpitLoadState("IDLE");
      setHumanEscalationCockpit(null);
      setHumanEscalationLoadState("IDLE");
      setCalendarConnectorCockpit(null);
      setCalendarConnectorLoadState("IDLE");
      setMessagingCockpit(null);
      setMessagingLoadState("IDLE");
      setVoiceCallsCockpit(null);
      setVoiceCallsLoadState("IDLE");
      setEmailCockpit(null);
      setEmailLoadState("IDLE");
      setAccountingCockpit(null);
      setAccountingLoadState("IDLE");
      if (activeWorkspaceId.current !== workspace.id) {
        setOutboxEntries([]);
        setOutboxLoadState("LOADING");
        setAssistantHistory(null);
        setAssistantLoadState("IDLE");
        setLatestAssistantAttempt(null);
        setLatestPreparedActionAttempt(null);
        setLatestEvidenceAttempt(null);
        setLatestVoiceNoteAttempt(null);
        setAuthorityCockpit(null);
        setAuthorityLoadState("IDLE");
        setPrivacyCockpit(null);
        setPrivacyLoadState("IDLE");
        setReliabilityCockpit(null);
        setReliabilityLoadState("IDLE");
        setOnboardingCockpit(null);
        setOnboardingLoadState("IDLE");
        setPermissionCenter(null);
        setPermissionLoadState("IDLE");
        setProjectBrainIntake(null);
        setProjectBrainLoadState("IDLE");
        setProjectBrainCommandQueue([]);
        setProjectBrainSourceQueue([]);
        projectBrainContext.current = null;
        dispatchingProjectBrainCommand.current = null;
        dispatchingProjectBrainSources.current.clear();
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
        setProjectBrainIntake(null);
        setProjectBrainLoadState("IDLE");
        setProjectBrainCommandQueue([]);
        setProjectBrainSourceQueue([]);
        projectBrainContext.current = null;
        dispatchingProjectBrainCommand.current = null;
        dispatchingProjectBrainSources.current.clear();
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

  const loadProvenance = useCallback(
    async (projectId: string) => {
      if (!activeWorkspace) throw new Error("MOBILE_WORKSPACE_REQUIRED");
      if (!cockpit?.projects.some((project) => project.id === projectId)) {
        throw new Error("MOBILE_PROVENANCE_PROJECT_REFUSED");
      }
      setProvenanceLoadState("LOADING");
      setPublicError(null);
      try {
        await assertNetworkAvailable();
        const result = await api.projectProvenance(activeWorkspace.id, projectId);
        const fieldMismatch = (activeWorkspace.role === "FIELD_WORKER") !== (result.role === "FIELD_WORKER");
        if (fieldMismatch) throw new MobileApiError("INVALID_RESPONSE");
        setProvenance(result);
        setProvenanceLoadState("READY");
      } catch (error) {
        setProvenance(null);
        setProvenanceLoadState("UNAVAILABLE");
        setPublicError(publicMessage(error));
      }
    },
    [activeWorkspace, api, cockpit?.projects],
  );

  const loadJobSchedule = useCallback(async (projectId?: string) => {
    if (!activeWorkspace) throw new Error("MOBILE_WORKSPACE_REQUIRED");
    if (projectId && !cockpit?.projects.some((project) => project.id === projectId)) {
      throw new Error("MOBILE_JOB_PROJECT_REFUSED");
    }
    setJobScheduleLoadState("LOADING");
    setPublicError(null);
    try {
      await assertNetworkAvailable();
      const result = await api.jobSchedule(activeWorkspace.id, projectId);
      if (result.role !== activeWorkspace.role) throw new MobileApiError("INVALID_RESPONSE");
      setJobSchedule(result);
      setJobScheduleLoadState("READY");
    } catch (error) {
      setJobSchedule(null);
      setJobScheduleLoadState("UNAVAILABLE");
      setPublicError(publicMessage(error));
    }
  }, [activeWorkspace, api, cockpit?.projects]);

  const submitJobCommand = useCallback(async (command: MobileJobCommand) => {
    if (!activeWorkspace || activeWorkspace.role === "FIELD_WORKER") {
      throw new Error("MOBILE_JOB_COMMAND_PERMISSION_REFUSED");
    }
    if (command.workspaceId !== activeWorkspace.id) throw new Error("MOBILE_JOB_WORKSPACE_REFUSED");
    if (dispatchingJobRequest.current) throw new Error("MOBILE_JOB_COMMAND_ALREADY_DISPATCHED");
    dispatchingJobRequest.current = command.commandId;
    setJobScheduleLoadState("LOADING");
    setPublicError(null);
    try {
      await prepareOutboxEntry("JOB_COMMAND", command, activeWorkspace.id);
      await assertNetworkAvailable();
      const result = await api.jobCommand(command);
      await settleOutboxEntry(
        command.commandId,
        result.replayed ? "REPLAYED" : "CONFIRMED",
        activeWorkspace.id,
      );
      const refreshed = await api.jobSchedule(activeWorkspace.id);
      setJobSchedule(refreshed);
      setJobScheduleLoadState("READY");
    } catch (error) {
      setJobScheduleLoadState("UNAVAILABLE");
      setPublicError(publicMessage(error));
      const state =
        error instanceof MobileApiError && error.code === "CONFLICT"
          ? "CONFLICT"
          : error instanceof MobileApiError && error.code === "OUTCOME_UNKNOWN"
            ? "OUTCOME_UNKNOWN"
            : "REFUSED";
      await settleOutboxEntry(command.commandId, state, activeWorkspace.id, publicMessage(error));
      if (error instanceof MobileApiError && error.code === "CONFLICT") {
        const refreshed = await api.jobSchedule(activeWorkspace.id).catch(() => null);
        if (refreshed) {
          setJobSchedule(refreshed);
          setJobScheduleLoadState("READY");
        }
      }
    } finally {
      dispatchingJobRequest.current = null;
    }
  }, [activeWorkspace, api, prepareOutboxEntry, settleOutboxEntry]);

  const loadFollowUpQueue = useCallback(async (projectId?: string) => {
    if (!activeWorkspace) throw new Error("MOBILE_WORKSPACE_REQUIRED");
    if (projectId && !cockpit?.projects.some((project) => project.id === projectId)) {
      throw new Error("MOBILE_FOLLOW_UP_PROJECT_REFUSED");
    }
    setFollowUpQueueLoadState("LOADING");
    setPublicError(null);
    try {
      await assertNetworkAvailable();
      const result = await api.followUpQueue(activeWorkspace.id, projectId);
      if (result.role !== activeWorkspace.role) throw new MobileApiError("INVALID_RESPONSE");
      setFollowUpQueue(result);
      setFollowUpQueueLoadState("READY");
    } catch (error) {
      setFollowUpQueue(null);
      setFollowUpQueueLoadState("UNAVAILABLE");
      setPublicError(publicMessage(error));
    }
  }, [activeWorkspace, api, cockpit?.projects]);

  const submitFollowUpCommand = useCallback(async (command: MobileFollowUpCommand) => {
    if (!activeWorkspace || activeWorkspace.role === "FIELD_WORKER") {
      throw new Error("MOBILE_FOLLOW_UP_COMMAND_PERMISSION_REFUSED");
    }
    if (command.workspaceId !== activeWorkspace.id) {
      throw new Error("MOBILE_FOLLOW_UP_WORKSPACE_REFUSED");
    }
    if (dispatchingFollowUpRequest.current) {
      throw new Error("MOBILE_FOLLOW_UP_COMMAND_ALREADY_DISPATCHED");
    }
    dispatchingFollowUpRequest.current = command.commandId;
    setFollowUpQueueLoadState("LOADING");
    setPublicError(null);
    try {
      await prepareOutboxEntry("FOLLOW_UP_COMMAND", command, activeWorkspace.id);
      await assertNetworkAvailable();
      const result = await api.followUpCommand(command);
      await settleOutboxEntry(
        command.commandId,
        result.replayed ? "REPLAYED" : "CONFIRMED",
        activeWorkspace.id,
      );
      const refreshed = await api.followUpQueue(activeWorkspace.id);
      setFollowUpQueue(refreshed);
      setFollowUpQueueLoadState("READY");
    } catch (error) {
      const state =
        error instanceof MobileApiError && error.code === "CONFLICT"
          ? "CONFLICT"
          : error instanceof MobileApiError && error.code === "OUTCOME_UNKNOWN"
            ? "OUTCOME_UNKNOWN"
            : "REFUSED";
      setFollowUpQueueLoadState("UNAVAILABLE");
      setPublicError(publicMessage(error));
      await settleOutboxEntry(command.commandId, state, activeWorkspace.id, publicMessage(error));
      if (error instanceof MobileApiError && error.code === "CONFLICT") {
        const refreshed = await api.followUpQueue(activeWorkspace.id).catch(() => null);
        if (refreshed) {
          setFollowUpQueue(refreshed);
          setFollowUpQueueLoadState("READY");
        }
      }
    } finally {
      dispatchingFollowUpRequest.current = null;
    }
  }, [activeWorkspace, api, prepareOutboxEntry, settleOutboxEntry]);

  const loadEconomicCockpit = useCallback(async () => {
    if (!activeWorkspace) throw new Error("MOBILE_WORKSPACE_REQUIRED");
    setEconomicCockpitLoadState("LOADING");
    setPublicError(null);
    try {
      await assertNetworkAvailable();
      const result = await api.economicCockpit(activeWorkspace.id);
      if (result.role !== activeWorkspace.role) throw new MobileApiError("INVALID_RESPONSE");
      setEconomicCockpit(result);
      setEconomicCockpitLoadState("READY");
    } catch (error) {
      setEconomicCockpit(null);
      setEconomicCockpitLoadState("UNAVAILABLE");
      setPublicError(publicMessage(error));
    }
  }, [activeWorkspace, api]);

  const submitEconomicCommand = useCallback(async (command: MobileEconomicCommand) => {
    if (!activeWorkspace || activeWorkspace.role === "FIELD_WORKER") {
      throw new Error("MOBILE_INVOICE_COMMAND_PERMISSION_REFUSED");
    }
    if (command.workspaceId !== activeWorkspace.id) {
      throw new Error("MOBILE_INVOICE_WORKSPACE_REFUSED");
    }
    if (dispatchingEconomicRequest.current) {
      throw new Error("MOBILE_INVOICE_COMMAND_ALREADY_DISPATCHED");
    }
    dispatchingEconomicRequest.current = command.commandId;
    setEconomicCockpitLoadState("LOADING");
    setPublicError(null);
    try {
      await prepareOutboxEntry("ECONOMIC_COMMAND", command, activeWorkspace.id);
      await assertNetworkAvailable();
      const result = await api.economicCommand(command);
      await settleOutboxEntry(
        command.commandId,
        result.replayed ? "REPLAYED" : "CONFIRMED",
        activeWorkspace.id,
      );
      const refreshed = await api.economicCockpit(activeWorkspace.id);
      setEconomicCockpit(refreshed);
      setEconomicCockpitLoadState("READY");
    } catch (error) {
      const state =
        error instanceof MobileApiError && error.code === "CONFLICT"
          ? "CONFLICT"
          : error instanceof MobileApiError && error.code === "OUTCOME_UNKNOWN"
            ? "OUTCOME_UNKNOWN"
            : "REFUSED";
      setEconomicCockpitLoadState("UNAVAILABLE");
      setPublicError(publicMessage(error));
      await settleOutboxEntry(command.commandId, state, activeWorkspace.id, publicMessage(error));
      if (error instanceof MobileApiError && error.code === "CONFLICT") {
        const refreshed = await api.economicCockpit(activeWorkspace.id).catch(() => null);
        if (refreshed) {
          setEconomicCockpit(refreshed);
          setEconomicCockpitLoadState("READY");
        }
      }
    } finally {
      dispatchingEconomicRequest.current = null;
    }
  }, [activeWorkspace, api, prepareOutboxEntry, settleOutboxEntry]);

  const loadHumanEscalations = useCallback(async () => {
    if (!activeWorkspace) throw new Error("MOBILE_WORKSPACE_REQUIRED");
    setHumanEscalationLoadState("LOADING");
    setPublicError(null);
    try {
      await assertNetworkAvailable();
      const result = await api.humanEscalationCockpit(activeWorkspace.id);
      if (result.role !== activeWorkspace.role) {
        throw new MobileApiError("INVALID_RESPONSE");
      }
      setHumanEscalationCockpit(result);
      setHumanEscalationLoadState("READY");
    } catch (error) {
      setHumanEscalationCockpit(null);
      setHumanEscalationLoadState("UNAVAILABLE");
      setPublicError(publicMessage(error));
    }
  }, [activeWorkspace, api]);

  const submitHumanEscalationCommand = useCallback(async (
    command: MobileHumanEscalationCommand,
  ) => {
    if (!activeWorkspace || activeWorkspace.role === "FIELD_WORKER") {
      throw new Error("MOBILE_HUMAN_SUPPORT_PERMISSION_REFUSED");
    }
    if (command.workspaceId !== activeWorkspace.id) {
      throw new Error("MOBILE_HUMAN_SUPPORT_WORKSPACE_REFUSED");
    }
    if (dispatchingHumanEscalationRequest.current) {
      throw new Error("MOBILE_HUMAN_SUPPORT_ALREADY_DISPATCHED");
    }
    dispatchingHumanEscalationRequest.current = command.commandId;
    setHumanEscalationLoadState("LOADING");
    setPublicError(null);
    try {
      await prepareOutboxEntry(
        "HUMAN_ESCALATION_COMMAND",
        command,
        activeWorkspace.id,
      );
      await assertNetworkAvailable();
      const result = await api.humanEscalationCommand(command);
      await settleOutboxEntry(
        command.commandId,
        result.replayed ? "REPLAYED" : "CONFIRMED",
        activeWorkspace.id,
      );
      const refreshed = await api.humanEscalationCockpit(activeWorkspace.id);
      setHumanEscalationCockpit(refreshed);
      setHumanEscalationLoadState("READY");
    } catch (error) {
      const state =
        error instanceof MobileApiError && error.code === "CONFLICT"
          ? "CONFLICT"
          : error instanceof MobileApiError && error.code === "OUTCOME_UNKNOWN"
            ? "OUTCOME_UNKNOWN"
            : "REFUSED";
      setHumanEscalationLoadState("UNAVAILABLE");
      setPublicError(publicMessage(error));
      await settleOutboxEntry(
        command.commandId,
        state,
        activeWorkspace.id,
        publicMessage(error),
      );
      if (error instanceof MobileApiError && error.code === "CONFLICT") {
        const refreshed = await api.humanEscalationCockpit(activeWorkspace.id).catch(() => null);
        if (refreshed) {
          setHumanEscalationCockpit(refreshed);
          setHumanEscalationLoadState("READY");
        }
      }
    } finally {
      dispatchingHumanEscalationRequest.current = null;
    }
  }, [activeWorkspace, api, prepareOutboxEntry, settleOutboxEntry]);

  const loadCalendarConnectors = useCallback(async () => {
    if (!activeWorkspace) throw new Error("MOBILE_WORKSPACE_REQUIRED");
    setCalendarConnectorLoadState("LOADING");
    setPublicError(null);
    try {
      await assertNetworkAvailable();
      const result = await api.calendarConnectorCockpit(activeWorkspace.id);
      const fieldMismatch =
        (activeWorkspace.role === "FIELD_WORKER") !== (result.role === "field_worker");
      if (fieldMismatch) throw new MobileApiError("INVALID_RESPONSE");
      setCalendarConnectorCockpit(result);
      setCalendarConnectorLoadState("READY");
    } catch (error) {
      setCalendarConnectorCockpit(null);
      setCalendarConnectorLoadState("UNAVAILABLE");
      setPublicError(publicMessage(error));
    }
  }, [activeWorkspace, api]);

  const submitCalendarConnectorCommand = useCallback(async (
    command: MobileCalendarConnectorCommand,
  ) => {
    if (!activeWorkspace || activeWorkspace.role === "FIELD_WORKER") {
      throw new Error("MOBILE_CALENDAR_CONNECTOR_PERMISSION_REFUSED");
    }
    if (command.workspaceId !== activeWorkspace.id) {
      throw new Error("MOBILE_CALENDAR_CONNECTOR_WORKSPACE_REFUSED");
    }
    if (dispatchingCalendarConnectorRequest.current) {
      throw new Error("MOBILE_CALENDAR_CONNECTOR_ALREADY_DISPATCHED");
    }
    dispatchingCalendarConnectorRequest.current = command.commandId;
    setCalendarConnectorLoadState("LOADING");
    setPublicError(null);
    try {
      await prepareOutboxEntry("CALENDAR_CONNECTOR_COMMAND", command, activeWorkspace.id);
      await assertNetworkAvailable();
      const result = await api.calendarConnectorCommand(command);
      await settleOutboxEntry(
        command.commandId,
        result.replayed ? "REPLAYED" : "CONFIRMED",
        activeWorkspace.id,
      );
      const refreshed = await api.calendarConnectorCockpit(activeWorkspace.id);
      setCalendarConnectorCockpit(refreshed);
      setCalendarConnectorLoadState("READY");
    } catch (error) {
      const state =
        error instanceof MobileApiError && error.code === "CONFLICT"
          ? "CONFLICT"
          : error instanceof MobileApiError && error.code === "OUTCOME_UNKNOWN"
            ? "OUTCOME_UNKNOWN"
            : "REFUSED";
      setCalendarConnectorLoadState("UNAVAILABLE");
      setPublicError(publicMessage(error));
      await settleOutboxEntry(
        command.commandId,
        state,
        activeWorkspace.id,
        publicMessage(error),
      );
      if (error instanceof MobileApiError && error.code === "CONFLICT") {
        const refreshed = await api.calendarConnectorCockpit(activeWorkspace.id).catch(() => null);
        if (refreshed) {
          setCalendarConnectorCockpit(refreshed);
          setCalendarConnectorLoadState("READY");
        }
      }
    } finally {
      dispatchingCalendarConnectorRequest.current = null;
    }
  }, [activeWorkspace, api, prepareOutboxEntry, settleOutboxEntry]);

  const loadMessaging = useCallback(async () => {
    if (!activeWorkspace) throw new Error("MOBILE_WORKSPACE_REQUIRED");
    setMessagingLoadState("LOADING");
    setPublicError(null);
    try {
      await assertNetworkAvailable();
      const result = await api.messagingCockpit(activeWorkspace.id);
      const fieldMismatch =
        (activeWorkspace.role === "FIELD_WORKER") !== (result.role === "field_worker");
      if (fieldMismatch) throw new MobileApiError("INVALID_RESPONSE");
      setMessagingCockpit(result);
      setMessagingLoadState("READY");
    } catch (error) {
      setMessagingCockpit(null);
      setMessagingLoadState("UNAVAILABLE");
      setPublicError(publicMessage(error));
    }
  }, [activeWorkspace, api]);

  const submitMessagingCommand = useCallback(async (command: MobileMessagingCommand) => {
    if (!activeWorkspace || activeWorkspace.role === "FIELD_WORKER") {
      throw new Error("MOBILE_MESSAGING_PERMISSION_REFUSED");
    }
    if (command.workspaceId !== activeWorkspace.id) {
      throw new Error("MOBILE_MESSAGING_WORKSPACE_REFUSED");
    }
    if (dispatchingMessagingRequest.current) {
      throw new Error("MOBILE_MESSAGING_ALREADY_DISPATCHED");
    }
    dispatchingMessagingRequest.current = command.commandId;
    setMessagingLoadState("LOADING");
    setPublicError(null);
    try {
      await prepareOutboxEntry("MESSAGING_COMMAND", command, activeWorkspace.id);
      await assertNetworkAvailable();
      const result = await api.messagingCommand(command);
      await settleOutboxEntry(
        command.commandId,
        result.replayed ? "REPLAYED" : "CONFIRMED",
        activeWorkspace.id,
      );
      const refreshed = await api.messagingCockpit(activeWorkspace.id);
      setMessagingCockpit(refreshed);
      setMessagingLoadState("READY");
      const refreshedCockpit = await api.cockpit(activeWorkspace.id).catch(() => null);
      if (refreshedCockpit) setCockpit(refreshedCockpit);
    } catch (error) {
      const state =
        error instanceof MobileApiError && error.code === "CONFLICT"
          ? "CONFLICT"
          : error instanceof MobileApiError && error.code === "OUTCOME_UNKNOWN"
            ? "OUTCOME_UNKNOWN"
            : "REFUSED";
      setMessagingLoadState("UNAVAILABLE");
      setPublicError(publicMessage(error));
      await settleOutboxEntry(
        command.commandId,
        state,
        activeWorkspace.id,
        publicMessage(error),
      );
      if (error instanceof MobileApiError && error.code === "CONFLICT") {
        const refreshed = await api.messagingCockpit(activeWorkspace.id).catch(() => null);
        if (refreshed) {
          setMessagingCockpit(refreshed);
          setMessagingLoadState("READY");
        }
      }
    } finally {
      dispatchingMessagingRequest.current = null;
    }
  }, [activeWorkspace, api, prepareOutboxEntry, settleOutboxEntry]);

  const loadVoiceCalls = useCallback(async () => {
    if (!activeWorkspace) throw new Error("MOBILE_WORKSPACE_REQUIRED");
    setVoiceCallsLoadState("LOADING");
    setPublicError(null);
    try {
      await assertNetworkAvailable();
      const result = await api.voiceCallsCockpit(activeWorkspace.id);
      const fieldMismatch =
        (activeWorkspace.role === "FIELD_WORKER") !== (result.role === "field_worker");
      if (fieldMismatch) throw new MobileApiError("INVALID_RESPONSE");
      setVoiceCallsCockpit(result);
      setVoiceCallsLoadState("READY");
    } catch (error) {
      setVoiceCallsCockpit(null);
      setVoiceCallsLoadState("UNAVAILABLE");
      setPublicError(publicMessage(error));
    }
  }, [activeWorkspace, api]);

  const submitPrepareCallWork = useCallback(async (command: MobilePrepareCallWorkCommand) => {
    if (!activeWorkspace || activeWorkspace.role === "FIELD_WORKER") {
      throw new Error("MOBILE_VOICE_MANAGEMENT_REFUSED");
    }
    if (command.workspaceId !== activeWorkspace.id) {
      throw new Error("MOBILE_VOICE_WORKSPACE_REFUSED");
    }
    if (dispatchingVoiceCallRequest.current) {
      throw new Error("MOBILE_VOICE_CALL_ALREADY_DISPATCHED");
    }
    dispatchingVoiceCallRequest.current = command.commandId;
    setVoiceCallsLoadState("LOADING");
    setPublicError(null);
    try {
      await prepareOutboxEntry("VOICE_CALL_COMMAND", command, activeWorkspace.id);
      await assertNetworkAvailable();
      const result = await api.prepareCallWork(command);
      await settleOutboxEntry(
        command.commandId,
        result.replayed ? "REPLAYED" : "CONFIRMED",
        activeWorkspace.id,
      );
      const refreshed = await api.voiceCallsCockpit(activeWorkspace.id);
      setVoiceCallsCockpit(refreshed);
      setVoiceCallsLoadState("READY");
    } catch (error) {
      const state =
        error instanceof MobileApiError && error.code === "CONFLICT"
          ? "CONFLICT"
          : error instanceof MobileApiError && error.code === "OUTCOME_UNKNOWN"
            ? "OUTCOME_UNKNOWN"
            : "REFUSED";
      setVoiceCallsLoadState("UNAVAILABLE");
      setPublicError(publicMessage(error));
      await settleOutboxEntry(command.commandId, state, activeWorkspace.id, publicMessage(error));
      if (state === "CONFLICT") {
        const refreshed = await api.voiceCallsCockpit(activeWorkspace.id).catch(() => null);
        if (refreshed) {
          setVoiceCallsCockpit(refreshed);
          setVoiceCallsLoadState("READY");
        }
      }
    } finally {
      dispatchingVoiceCallRequest.current = null;
    }
  }, [activeWorkspace, api, prepareOutboxEntry, settleOutboxEntry]);

  const submitVoiceNoteAttempt = useCallback(async (value: VoiceNoteAttempt) => {
    if (!activeWorkspace?.permissions.canAddEvidence) {
      throw new Error("MOBILE_VOICE_NOTE_PERMISSION_REFUSED");
    }
    if (value.command.workspaceId !== activeWorkspace.id) {
      throw new Error("MOBILE_VOICE_NOTE_WORKSPACE_REFUSED");
    }
    if (dispatchingVoiceNoteRequest.current) {
      throw new Error("MOBILE_VOICE_NOTE_ALREADY_DISPATCHED");
    }
    const sending = beginVoiceNoteAttempt(value);
    dispatchingVoiceNoteRequest.current = sending.command.commandId;
    setLatestVoiceNoteAttempt(sending);
    setPublicError(null);
    try {
      await assertNetworkAvailable();
      const result = await api.uploadVoiceNote(sending.command);
      const completed = finishVoiceNoteAttempt(sending, {
        state: result.replayed ? "REPLAYED" : "CONFIRMED",
        result,
      });
      setLatestVoiceNoteAttempt(completed);
      const refreshed = await api.voiceCallsCockpit(activeWorkspace.id);
      setVoiceCallsCockpit(refreshed);
      setVoiceCallsLoadState("READY");
      return completed;
    } catch (error) {
      const state =
        error instanceof MobileApiError && error.code === "CONFLICT"
          ? "CONFLICT"
          : error instanceof MobileApiError && error.code === "OUTCOME_UNKNOWN"
            ? "OUTCOME_UNKNOWN"
            : "REFUSED";
      const failed = finishVoiceNoteAttempt(sending, {
        state,
        publicError: publicMessage(error),
      });
      setLatestVoiceNoteAttempt(failed);
      setPublicError(failed.publicError);
      return failed;
    } finally {
      dispatchingVoiceNoteRequest.current = null;
    }
  }, [activeWorkspace, api]);

  const loadProjectBrainIntake = useCallback(async (projectId: string) => {
    if (!activeWorkspace) throw new Error("MOBILE_WORKSPACE_REQUIRED");
    const context = { workspaceId: activeWorkspace.id, projectId };
    projectBrainContext.current = context;
    dispatchingProjectBrainCommand.current = null;
    dispatchingProjectBrainSources.current.clear();
    setProjectBrainIntake(null);
    setProjectBrainCommandQueue([]);
    setProjectBrainSourceQueue([]);
    setProjectBrainUnderstanding(null);
    setProjectBrainUnderstandingLoadState("IDLE");
    setProjectBrainAssistantMemory(null);
    setProjectBrainAssistantMemoryLoadState("IDLE");
    setLatestProjectBrainAssistantResult(null);
    setProjectBrainLoadState("LOADING");
    setPublicError(null);
    try {
      const localSnapshot = await withProjectBrainSourceLifecycleLock(async () => {
        const snapshot = await loadProjectBrainIntentSnapshot({
          ...context,
          interruptedPublicError: mobileProductCopy(activeWorkspace.defaultLocale).projectBrain.interrupted,
        });
        if (projectBrainContext.current !== context) return null;
        const visibleIntents = [] as typeof snapshot.contextIntents;
        const cleanedSourceIds = new Set<string>();
        let sourceCleanupFailed = false;
        for (const intent of snapshot.contextIntents) {
          if (
            intent.kind === "SOURCE"
            && (intent.attempt.state === "CONFIRMED" || intent.attempt.state === "REPLAYED")
            && intent.attempt.result
          ) {
            try {
              await releaseProjectBrainSourceAttempt(intent.attempt, { reason: "CANONICAL_RECEIPT" });
              await removeProjectBrainIntent({ commandId: intent.attempt.command.commandId });
              cleanedSourceIds.add(intent.attempt.command.commandId);
              continue;
            } catch {
              sourceCleanupFailed = true;
            }
          }
          visibleIntents.push(intent);
        }
        const visibleSources = visibleIntents.flatMap((intent) => intent.kind === "SOURCE" ? [intent.attempt] : []);
        const globallyRetainedSources = snapshot.allIntents.flatMap((intent) =>
          intent.kind === "SOURCE" && !cleanedSourceIds.has(intent.attempt.command.commandId)
            ? [intent.attempt]
            : []);
        await reconcileProjectBrainSourceFiles({
          retainedAttempts: globallyRetainedSources,
          requiredAttempts: visibleSources,
        });
        return { sourceCleanupFailed, visibleIntents, visibleSources };
      });
      if (!localSnapshot || projectBrainContext.current !== context) return;
      setProjectBrainCommandQueue(localSnapshot.visibleIntents.flatMap((intent) => intent.kind === "COMMAND" ? [intent.attempt] : []));
      setProjectBrainSourceQueue(localSnapshot.visibleSources);
      const projection = await api.projectBrainIntake(context.workspaceId, context.projectId);
      if (projectBrainContext.current !== context) return;
      setProjectBrainIntake(projection);
      setProjectBrainLoadState("READY");
      if (localSnapshot.sourceCleanupFailed) {
        setPublicError(mobileProductCopy(activeWorkspace.defaultLocale).projectBrain.localQueueUnavailable);
      }
    } catch (error) {
      if (projectBrainContext.current !== context) return;
      setProjectBrainIntake(null);
      setProjectBrainLoadState("UNAVAILABLE");
      setPublicError(publicMessage(error));
    }
  }, [activeWorkspace, api]);

  const dispatchProjectBrainCommandAttempt = useCallback(async (value: ProjectBrainCommandAttempt) => {
    const context = projectBrainContext.current;
    if (!activeWorkspace || value.command.workspaceId !== activeWorkspace.id || context?.workspaceId !== value.command.workspaceId || context.projectId !== value.command.projectId) {
      throw new Error("MOBILE_PROJECT_BRAIN_WORKSPACE_REFUSED");
    }
    if (dispatchingProjectBrainCommand.current) {
      throw new Error("MOBILE_PROJECT_BRAIN_COMMAND_ALREADY_DISPATCHED");
    }
    const sending = beginProjectBrainCommandAttempt(value);
    dispatchingProjectBrainCommand.current = sending.command.commandId;
    try {
      await transitionProjectBrainIntent({ commandId: sending.command.commandId, state: "SENDING" });
    } catch (error) {
      dispatchingProjectBrainCommand.current = null;
      throw error;
    }
    setProjectBrainCommandQueue((queue) => [
      ...queue.filter((attempt) => attempt.command.commandId !== sending.command.commandId),
      sending,
    ]);
    setProjectBrainLoadState("LOADING");
    setPublicError(null);

    let result;
    try {
      await assertNetworkAvailable();
      result = await api.projectBrainCommand(sending.command);
    } catch (error) {
      const state = projectBrainFailureState(error);
      const failed = finishProjectBrainCommandAttempt(sending, {
        state,
        publicError: publicMessage(error),
      });
      await transitionProjectBrainIntent({
        commandId: failed.command.commandId,
        state,
        publicError: failed.publicError,
      }).catch(() => undefined);
      if (projectBrainContext.current?.workspaceId === failed.command.workspaceId && projectBrainContext.current.projectId === failed.command.projectId) {
        setProjectBrainCommandQueue((queue) => [
          ...queue.filter((attempt) => attempt.command.commandId !== failed.command.commandId),
          failed,
        ]);
        setProjectBrainLoadState("UNAVAILABLE");
        setPublicError(failed.publicError);
        if (state === "CONFLICT") {
          const projection = await api.projectBrainIntake(failed.command.workspaceId, failed.command.projectId).catch(() => null);
          if (projection && projectBrainContext.current?.workspaceId === failed.command.workspaceId && projectBrainContext.current.projectId === failed.command.projectId) {
            setProjectBrainIntake(projection);
            setProjectBrainLoadState("READY");
          }
        }
      }
      dispatchingProjectBrainCommand.current = null;
      return failed;
    }

    const completed = finishProjectBrainCommandAttempt(sending, {
      state: result.replayed ? "REPLAYED" : "CONFIRMED",
      result,
    });
    await transitionProjectBrainIntent({
      commandId: completed.command.commandId,
      state: completed.state,
      result,
    }).then(() => removeProjectBrainIntent({ commandId: completed.command.commandId })).catch(() => undefined);
    if (projectBrainContext.current?.workspaceId === completed.command.workspaceId && projectBrainContext.current.projectId === completed.command.projectId) {
      setProjectBrainCommandQueue((queue) => queue.filter((attempt) => attempt.command.commandId !== completed.command.commandId));
      try {
        const projection = await api.projectBrainIntake(completed.command.workspaceId, completed.command.projectId);
        if (projectBrainContext.current?.workspaceId === completed.command.workspaceId && projectBrainContext.current.projectId === completed.command.projectId) {
          setProjectBrainIntake(projection);
          setProjectBrainLoadState("READY");
        }
      } catch (refreshError) {
        setProjectBrainLoadState("UNAVAILABLE");
        setPublicError(publicMessage(refreshError));
      }
    }
    dispatchingProjectBrainCommand.current = null;
    return completed;
  }, [activeWorkspace, api]);

  const submitProjectBrainCommand = useCallback(async (command: MobileProjectBrainCommand) => {
    const context = projectBrainContext.current;
    if (!activeWorkspace || command.workspaceId !== activeWorkspace.id || context?.workspaceId !== command.workspaceId || context.projectId !== command.projectId) {
      throw new Error("MOBILE_PROJECT_BRAIN_WORKSPACE_REFUSED");
    }
    const ready = createProjectBrainCommandAttempt(command);
    const stored = await enqueueProjectBrainIntent({ intent: commandIntent(ready) });
    if (stored.kind !== "COMMAND") throw new Error("MOBILE_PROJECT_BRAIN_INTENT_KIND_MISMATCH");
    setProjectBrainCommandQueue((queue) => [
      ...queue.filter((attempt) => attempt.command.commandId !== stored.attempt.command.commandId),
      stored.attempt,
    ]);
    return dispatchProjectBrainCommandAttempt(stored.attempt);
  }, [activeWorkspace, dispatchProjectBrainCommandAttempt]);

  const retryProjectBrainCommand = useCallback(async (commandId: string) => {
    const context = projectBrainContext.current;
    const attempt = projectBrainCommandQueueForContext(projectBrainCommandQueue, context?.workspaceId, context?.projectId)
      .find((item) => item.command.commandId === commandId);
    if (!attempt || (attempt.state !== "READY" && attempt.state !== "OUTCOME_UNKNOWN")) {
      throw new Error("MOBILE_PROJECT_BRAIN_COMMAND_RETRY_REFUSED");
    }
    return dispatchProjectBrainCommandAttempt(attempt);
  }, [dispatchProjectBrainCommandAttempt, projectBrainCommandQueue]);

  const stageProjectBrainSources = useCallback(async (attempts: readonly ProjectBrainSourceAttempt[]) => {
    const context = projectBrainContext.current;
    if (!context || attempts.some((attempt) =>
      attempt.state !== "READY"
      || attempt.command.workspaceId !== context.workspaceId
      || attempt.command.projectId !== context.projectId
    )) {
      throw new Error("MOBILE_PROJECT_BRAIN_SOURCE_CONTEXT_REFUSED");
    }
    const durableAttempts: ProjectBrainSourceAttempt[] = [];
    for (const attempt of attempts) {
      const storedAttempt = await withProjectBrainSourceLifecycleLock(async () => {
        const retained = await retainProjectBrainSourceAttempt(attempt);
        try {
          const stored = await enqueueProjectBrainIntent({ intent: sourceIntent(retained.attempt) });
          if (stored.kind !== "SOURCE") throw new Error("MOBILE_PROJECT_BRAIN_INTENT_KIND_MISMATCH");
          return stored.attempt;
        } catch (error) {
          if (retained.created) {
            await releaseProjectBrainSourceAttempt(retained.attempt, { reason: "UNQUEUED_ROLLBACK" }).catch(() => undefined);
          }
          throw error;
        }
      });
      durableAttempts.push(storedAttempt);
      setProjectBrainSourceQueue((queue) => stageProjectBrainSourceAttempts(queue, [storedAttempt]));
    }
    return durableAttempts;
  }, []);

  const uploadProjectBrainSource = useCallback(async (value: ProjectBrainSourceAttempt) => {
    const context = projectBrainContext.current;
    if (!activeWorkspace || value.command.workspaceId !== activeWorkspace.id || context?.workspaceId !== value.command.workspaceId || context.projectId !== value.command.projectId) {
      throw new Error("MOBILE_PROJECT_BRAIN_WORKSPACE_REFUSED");
    }
    if (dispatchingProjectBrainSources.current.has(value.command.commandId)) {
      throw new Error("MOBILE_PROJECT_BRAIN_SOURCE_ALREADY_DISPATCHED");
    }
    const sending = beginProjectBrainSourceAttempt(value);
    dispatchingProjectBrainSources.current.add(sending.command.commandId);
    try {
      await transitionProjectBrainIntent({ commandId: sending.command.commandId, state: "SENDING" });
    } catch (error) {
      dispatchingProjectBrainSources.current.delete(sending.command.commandId);
      throw error;
    }
    setProjectBrainSourceQueue((queue) => stageProjectBrainSourceAttempts(queue, [sending]));

    let result;
    try {
      await assertNetworkAvailable();
      result = await api.uploadProjectBrainSource(sending.command);
    } catch (error) {
      const state = projectBrainFailureState(error);
      const failed = finishProjectBrainSourceAttempt(sending, { state, publicError: publicMessage(error) });
      await transitionProjectBrainIntent({
        commandId: failed.command.commandId,
        state,
        publicError: failed.publicError,
      }).catch(() => undefined);
      if (projectBrainContext.current?.workspaceId === sending.command.workspaceId && projectBrainContext.current.projectId === sending.command.projectId) {
        setProjectBrainSourceQueue((queue) => stageProjectBrainSourceAttempts(queue, [failed]));
        setPublicError(failed.publicError);
        if (state === "CONFLICT") {
          const projection = await api.projectBrainIntake(sending.command.workspaceId, sending.command.projectId).catch(() => null);
          if (projection && projectBrainContext.current?.workspaceId === sending.command.workspaceId && projectBrainContext.current.projectId === sending.command.projectId) {
            setProjectBrainIntake(projection);
            setProjectBrainLoadState("READY");
          }
        }
      }
      dispatchingProjectBrainSources.current.delete(sending.command.commandId);
      return failed;
    }

    const completed = finishProjectBrainSourceAttempt(sending, {
      state: result.replayed ? "REPLAYED" : "CONFIRMED",
      result,
    });
    let localCleanupComplete = false;
    try {
      await withProjectBrainSourceLifecycleLock(async () => {
        await transitionProjectBrainIntent({
          commandId: completed.command.commandId,
          state: completed.state,
          result,
        });
        await releaseProjectBrainSourceAttempt(completed, { reason: "CANONICAL_RECEIPT" });
        await removeProjectBrainIntent({ commandId: completed.command.commandId });
      });
      localCleanupComplete = true;
    } catch {
      setPublicError(mobileProductCopy(activeWorkspace.defaultLocale).projectBrain.localQueueUnavailable);
    }
    setProjectBrainSourceQueue((queue) => localCleanupComplete
      ? removeProjectBrainSourceAttempt(queue, completed.command.commandId)
      : stageProjectBrainSourceAttempts(queue, [completed]));
    try {
      const projection = await api.projectBrainIntake(activeWorkspace.id, sending.command.projectId);
      if (projectBrainContext.current?.workspaceId === sending.command.workspaceId && projectBrainContext.current.projectId === sending.command.projectId) {
        setProjectBrainIntake(projection);
        setProjectBrainLoadState("READY");
      }
    } catch (refreshError) {
      if (projectBrainContext.current?.workspaceId === sending.command.workspaceId && projectBrainContext.current.projectId === sending.command.projectId) {
        setProjectBrainLoadState("UNAVAILABLE");
        setPublicError(publicMessage(refreshError));
      }
    }
    dispatchingProjectBrainSources.current.delete(sending.command.commandId);
    return completed;
  }, [activeWorkspace, api]);

  const retryProjectBrainSource = useCallback(async (commandId: string) => {
    const attempt = projectBrainSourceQueue.find((item) => item.command.commandId === commandId);
    const context = projectBrainContext.current;
    if (!attempt || (attempt.state !== "READY" && attempt.state !== "OUTCOME_UNKNOWN")
      || context?.workspaceId !== attempt.command.workspaceId || context.projectId !== attempt.command.projectId) {
      throw new Error("MOBILE_PROJECT_BRAIN_SOURCE_RETRY_REFUSED");
    }
    const dispatchAttempt = attempt.state === "READY"
      ? rebaseReadyProjectBrainSourceAttempt(
        attempt,
        projectBrainIntakeForContext(projectBrainIntake, context.workspaceId, context.projectId)?.stateVersion
          ?? attempt.command.expectedStateVersion,
      )
      : attempt;
    if (dispatchAttempt !== attempt) {
      const replaced = await replaceReadyProjectBrainSourceIntent({ expected: attempt, replacement: dispatchAttempt });
      setProjectBrainSourceQueue((queue) => stageProjectBrainSourceAttempts(queue, [replaced]));
      return uploadProjectBrainSource(replaced);
    }
    return uploadProjectBrainSource(dispatchAttempt);
  }, [projectBrainIntake, projectBrainSourceQueue, uploadProjectBrainSource]);

  const dismissProjectBrainIntent = useCallback(async (commandId: string) => {
    const command = projectBrainCommandQueue.find((attempt) => attempt.command.commandId === commandId);
    const source = projectBrainSourceQueue.find((attempt) => attempt.command.commandId === commandId);
    const state = command?.state ?? source?.state;
    if (state !== "CONFLICT" && state !== "REFUSED") {
      throw new Error("MOBILE_PROJECT_BRAIN_INTENT_DISMISS_REFUSED");
    }
    await withProjectBrainSourceLifecycleLock(async () => {
      if (source) await releaseProjectBrainSourceAttempt(source, { reason: "TERMINAL_DISMISS" });
      await removeProjectBrainIntent({ commandId });
    });
    setProjectBrainCommandQueue((queue) => queue.filter((attempt) => attempt.command.commandId !== commandId));
    setProjectBrainSourceQueue((queue) => queue.filter((attempt) => attempt.command.commandId !== commandId));
  }, [projectBrainCommandQueue, projectBrainSourceQueue]);

  const loadProjectBrainUnderstanding = useCallback(async (projectId: string) => {
    if (!activeWorkspace) throw new Error("MOBILE_WORKSPACE_REQUIRED");
    setProjectBrainUnderstandingLoadState("LOADING");
    setPublicError(null);
    try {
      await assertNetworkAvailable();
      const next = await api.projectBrainUnderstanding(activeWorkspace.id, projectId);
      setProjectBrainUnderstanding(next);
      setProjectBrainUnderstandingLoadState("READY");
    } catch (error) {
      setProjectBrainUnderstanding(null);
      setProjectBrainUnderstandingLoadState("UNAVAILABLE");
      setPublicError(publicMessage(error));
    }
  }, [activeWorkspace, api]);

  const submitProjectBrainUnderstandingCommand = useCallback(async (command: MobileProjectBrainUnderstandingCommand) => {
    if (!activeWorkspace || activeWorkspace.id !== command.workspaceId) throw new Error("MOBILE_PROJECT_BRAIN_UNDERSTANDING_WORKSPACE_REFUSED");
    setProjectBrainUnderstandingLoadState("LOADING");
    setPublicError(null);
    try {
      await assertNetworkAvailable();
      await api.projectBrainUnderstandingCommand(command);
      const next = await api.projectBrainUnderstanding(command.workspaceId, command.projectId);
      setProjectBrainUnderstanding(next);
      setProjectBrainUnderstandingLoadState("READY");
    } catch (error) {
      setProjectBrainUnderstandingLoadState("UNAVAILABLE");
      setPublicError(publicMessage(error));
      if (error instanceof MobileApiError && error.code === "CONFLICT") {
        const current = await api.projectBrainUnderstanding(command.workspaceId, command.projectId).catch(() => null);
        if (current) { setProjectBrainUnderstanding(current); setProjectBrainUnderstandingLoadState("READY"); }
      }
      throw error;
    }
  }, [activeWorkspace, api]);

  const loadProjectBrainAssistantMemory = useCallback(async (projectId: string) => {
    if (!activeWorkspace) throw new Error("MOBILE_WORKSPACE_REQUIRED");
    setProjectBrainAssistantMemoryLoadState("LOADING");
    setPublicError(null);
    try {
      await assertNetworkAvailable();
      const next = await api.projectBrainAssistantMemory(activeWorkspace.id, projectId);
      setProjectBrainAssistantMemory(next);
      setProjectBrainAssistantMemoryLoadState("READY");
    } catch (error) {
      setProjectBrainAssistantMemory(null);
      setProjectBrainAssistantMemoryLoadState("UNAVAILABLE");
      setPublicError(publicMessage(error));
    }
  }, [activeWorkspace, api]);

  const submitProjectBrainAssistantMemoryCommand = useCallback(async (command: MobileProjectBrainAssistantCommand) => {
    if (!activeWorkspace || activeWorkspace.id !== command.workspaceId) {
      throw new Error("MOBILE_PROJECT_BRAIN_ASSISTANT_WORKSPACE_REFUSED");
    }
    setProjectBrainAssistantMemoryLoadState("LOADING");
    setPublicError(null);
    try {
      await assertNetworkAvailable();
      const result = await api.projectBrainAssistantMemoryCommand(command);
      const next = await api.projectBrainAssistantMemory(command.workspaceId, command.projectId);
      setLatestProjectBrainAssistantResult(result);
      setProjectBrainAssistantMemory(next);
      setProjectBrainAssistantMemoryLoadState("READY");
      return result;
    } catch (error) {
      setProjectBrainAssistantMemoryLoadState("UNAVAILABLE");
      setPublicError(publicMessage(error));
      if (error instanceof MobileApiError && error.code === "CONFLICT") {
        const current = await api.projectBrainAssistantMemory(command.workspaceId, command.projectId).catch(() => null);
        if (current) {
          setProjectBrainAssistantMemory(current);
          setProjectBrainAssistantMemoryLoadState("READY");
        }
      }
      throw error;
    }
  }, [activeWorkspace, api]);

  const loadEmail = useCallback(async () => {
    if (!activeWorkspace) throw new Error("MOBILE_WORKSPACE_REQUIRED");
    setEmailLoadState("LOADING");
    setPublicError(null);
    try {
      await assertNetworkAvailable();
      const result = await api.emailCockpit(activeWorkspace.id);
      const fieldMismatch =
        (activeWorkspace.role === "FIELD_WORKER") !== (result.role === "field_worker");
      if (fieldMismatch) throw new MobileApiError("INVALID_RESPONSE");
      setEmailCockpit(result);
      setEmailLoadState("READY");
    } catch (error) {
      setEmailCockpit(null);
      setEmailLoadState("UNAVAILABLE");
      setPublicError(publicMessage(error));
    }
  }, [activeWorkspace, api]);

  const submitEmailCommand = useCallback(async (command: MobileEmailCommand) => {
    if (!activeWorkspace || activeWorkspace.role === "FIELD_WORKER") {
      throw new Error("MOBILE_EMAIL_MANAGEMENT_REFUSED");
    }
    if (command.workspaceId !== activeWorkspace.id) throw new Error("MOBILE_EMAIL_WORKSPACE_REFUSED");
    if (dispatchingEmailRequest.current) throw new Error("MOBILE_EMAIL_ALREADY_DISPATCHED");
    dispatchingEmailRequest.current = command.commandId;
    setEmailLoadState("LOADING");
    setPublicError(null);
    const kind = command.action === "PREPARE_EMAIL_ACCOUNT" || command.action === "REVOKE_EMAIL_ACCOUNT"
      ? "EMAIL_ACCOUNT_COMMAND"
      : "EMAIL_DRAFT_COMMAND";
    try {
      await prepareOutboxEntry(kind, command, activeWorkspace.id);
      await assertNetworkAvailable();
      const result = await api.emailCommand(command) as { replayed?: boolean };
      await settleOutboxEntry(command.commandId, result.replayed ? "REPLAYED" : "CONFIRMED", activeWorkspace.id);
      const refreshed = await api.emailCockpit(activeWorkspace.id);
      setEmailCockpit(refreshed);
      setEmailLoadState("READY");
    } catch (error) {
      const state = error instanceof MobileApiError && error.code === "CONFLICT"
        ? "CONFLICT"
        : error instanceof MobileApiError && error.code === "OUTCOME_UNKNOWN"
          ? "OUTCOME_UNKNOWN"
          : "REFUSED";
      setEmailLoadState("UNAVAILABLE");
      setPublicError(publicMessage(error));
      await settleOutboxEntry(command.commandId, state, activeWorkspace.id, publicMessage(error));
      if (state === "CONFLICT") await loadEmail();
    } finally {
      dispatchingEmailRequest.current = null;
    }
  }, [activeWorkspace, api, loadEmail, prepareOutboxEntry, settleOutboxEntry]);

  const loadAccounting = useCallback(async () => {
    if (!activeWorkspace) throw new Error("MOBILE_WORKSPACE_REQUIRED");
    setAccountingLoadState("LOADING");
    setPublicError(null);
    try {
      await assertNetworkAvailable();
      const result = await api.accountingCockpit(activeWorkspace.id);
      const fieldMismatch =
        (activeWorkspace.role === "FIELD_WORKER") !== (result.role === "field_worker");
      if (fieldMismatch) throw new MobileApiError("INVALID_RESPONSE");
      setAccountingCockpit(result);
      setAccountingLoadState("READY");
    } catch (error) {
      setAccountingCockpit(null);
      setAccountingLoadState("UNAVAILABLE");
      setPublicError(publicMessage(error));
    }
  }, [activeWorkspace, api]);

  const submitAccountingCommand = useCallback(async (command: MobileAccountingCommand) => {
    if (!activeWorkspace || activeWorkspace.role === "FIELD_WORKER") {
      throw new Error("MOBILE_ACCOUNTING_MANAGEMENT_REFUSED");
    }
    if (command.workspaceId !== activeWorkspace.id) throw new Error("MOBILE_ACCOUNTING_WORKSPACE_REFUSED");
    if (dispatchingAccountingRequest.current) throw new Error("MOBILE_ACCOUNTING_ALREADY_DISPATCHED");
    dispatchingAccountingRequest.current = command.commandId;
    setAccountingLoadState("LOADING");
    setPublicError(null);
    const kind = command.action === "PREPARE_ACCOUNTING_ACCOUNT" || command.action === "REVOKE_ACCOUNTING_ACCOUNT"
      ? "ACCOUNTING_ACCOUNT_COMMAND"
      : "ACCOUNTING_DRAFT_COMMAND";
    try {
      await prepareOutboxEntry(kind, command, activeWorkspace.id);
      await assertNetworkAvailable();
      const result = await api.accountingCommand(command) as { replayed?: boolean };
      await settleOutboxEntry(command.commandId, result.replayed ? "REPLAYED" : "CONFIRMED", activeWorkspace.id);
      const refreshed = await api.accountingCockpit(activeWorkspace.id);
      setAccountingCockpit(refreshed);
      setAccountingLoadState("READY");
    } catch (error) {
      const state = error instanceof MobileApiError && error.code === "CONFLICT"
        ? "CONFLICT"
        : error instanceof MobileApiError && error.code === "OUTCOME_UNKNOWN"
          ? "OUTCOME_UNKNOWN"
          : "REFUSED";
      setAccountingLoadState("UNAVAILABLE");
      setPublicError(publicMessage(error));
      await settleOutboxEntry(command.commandId, state, activeWorkspace.id, publicMessage(error));
      if (state === "CONFLICT") await loadAccounting();
    } finally {
      dispatchingAccountingRequest.current = null;
    }
  }, [activeWorkspace, api, loadAccounting, prepareOutboxEntry, settleOutboxEntry]);

  const loadAuthority = useCallback(async () => {
    if (!activeWorkspace) throw new Error("MOBILE_WORKSPACE_REQUIRED");
    setAuthorityLoadState("LOADING");
    setPublicError(null);
    try {
      await assertNetworkAvailable();
      const result = await api.authorityCockpit(activeWorkspace.id);
      const expectedRole = activeWorkspace.role === "OWNER"
        ? "owner"
        : activeWorkspace.role === "OFFICE_MANAGER"
          ? "admin"
          : "field_worker";
      if (result.role !== expectedRole) throw new MobileApiError("INVALID_RESPONSE");
      setAuthorityCockpit(result);
      setAuthorityLoadState("READY");
    } catch (error) {
      setAuthorityCockpit(null);
      setAuthorityLoadState("UNAVAILABLE");
      setPublicError(publicMessage(error));
    }
  }, [activeWorkspace, api]);

  const submitAuthorityCommand = useCallback(async (command: MobileAuthorityCommand) => {
    if (!activeWorkspace || command.workspaceId !== activeWorkspace.id) {
      throw new Error("MOBILE_AUTHORITY_WORKSPACE_REFUSED");
    }
    const isPolicy = ["CREATE_POLICY_DRAFT", "SET_POLICY_RULE", "ACTIVATE_POLICY_SET", "REVOKE_POLICY_SET"].includes(command.action);
    const isDecision = command.action === "DECIDE_AUTHORITY_EVALUATION";
    if ((isPolicy && activeWorkspace.role !== "OWNER") || (isDecision && activeWorkspace.role === "FIELD_WORKER")) {
      throw new Error("MOBILE_AUTHORITY_MANAGEMENT_REFUSED");
    }
    if (dispatchingAuthorityRequest.current) throw new Error("MOBILE_AUTHORITY_ALREADY_DISPATCHED");
    dispatchingAuthorityRequest.current = command.commandId;
    setAuthorityLoadState("LOADING");
    setPublicError(null);
    const kind: MobileOutboxKind = isPolicy
      ? "AUTHORITY_POLICY_COMMAND"
      : isDecision
        ? "AUTHORITY_DECIDE"
        : "AUTHORITY_EVALUATE";
    try {
      await prepareOutboxEntry(kind, command, activeWorkspace.id);
      await assertNetworkAvailable();
      const result = await api.authorityCommand(command);
      await settleOutboxEntry(command.commandId, result.replayed ? "REPLAYED" : "CONFIRMED", activeWorkspace.id);
      const refreshed = await api.authorityCockpit(activeWorkspace.id);
      setAuthorityCockpit(refreshed);
      setAuthorityLoadState("READY");
    } catch (error) {
      const state = error instanceof MobileApiError && error.code === "CONFLICT"
        ? "CONFLICT"
        : error instanceof MobileApiError && error.code === "OUTCOME_UNKNOWN"
          ? "OUTCOME_UNKNOWN"
          : "REFUSED";
      setAuthorityLoadState("UNAVAILABLE");
      setPublicError(publicMessage(error));
      await settleOutboxEntry(command.commandId, state, activeWorkspace.id, publicMessage(error));
      if (state === "CONFLICT") await loadAuthority();
    } finally {
      dispatchingAuthorityRequest.current = null;
    }
  }, [activeWorkspace, api, loadAuthority, prepareOutboxEntry, settleOutboxEntry]);

  const loadPrivacy = useCallback(async () => {
    if (!activeWorkspace) throw new Error("MOBILE_WORKSPACE_REQUIRED");
    setPrivacyLoadState("LOADING");
    setPublicError(null);
    try {
      await assertNetworkAvailable();
      const result = await api.privacyCockpit(activeWorkspace.id);
      if (result.role !== activeWorkspace.role) throw new MobileApiError("INVALID_RESPONSE");
      setPrivacyCockpit(result);
      setPrivacyLoadState("READY");
    } catch (error) {
      setPrivacyCockpit(null);
      setPrivacyLoadState("UNAVAILABLE");
      setPublicError(publicMessage(error));
    }
  }, [activeWorkspace, api]);

  const submitPrivacyCommand = useCallback(async (command: MobilePrivacyCommand) => {
    if (!activeWorkspace || command.workspaceId !== activeWorkspace.id) throw new Error("MOBILE_PRIVACY_WORKSPACE_REFUSED");
    if (activeWorkspace.role !== "OWNER") throw new Error("MOBILE_PRIVACY_MANAGEMENT_REFUSED");
    if (dispatchingPrivacyRequest.current) throw new Error("MOBILE_PRIVACY_ALREADY_DISPATCHED");
    dispatchingPrivacyRequest.current = command.commandId;
    setPrivacyLoadState("LOADING");
    setPublicError(null);
    try {
      await prepareOutboxEntry("PRIVACY_COMMAND", command, activeWorkspace.id);
      await assertNetworkAvailable();
      const result = await api.privacyCommand(command);
      await settleOutboxEntry(command.commandId, result.replayed ? "REPLAYED" : "CONFIRMED", activeWorkspace.id);
      setPrivacyCockpit(await api.privacyCockpit(activeWorkspace.id));
      setPrivacyLoadState("READY");
    } catch (error) {
      const state = error instanceof MobileApiError && error.code === "CONFLICT" ? "CONFLICT" : error instanceof MobileApiError && error.code === "OUTCOME_UNKNOWN" ? "OUTCOME_UNKNOWN" : "REFUSED";
      setPrivacyLoadState("UNAVAILABLE");
      setPublicError(publicMessage(error));
      await settleOutboxEntry(command.commandId, state, activeWorkspace.id, publicMessage(error));
      if (state === "CONFLICT") await loadPrivacy();
    } finally {
      dispatchingPrivacyRequest.current = null;
    }
  }, [activeWorkspace, api, loadPrivacy, prepareOutboxEntry, settleOutboxEntry]);

  const loadReliability = useCallback(async () => {
    if (!activeWorkspace) throw new Error("MOBILE_WORKSPACE_REQUIRED");
    setReliabilityLoadState("LOADING");
    setPublicError(null);
    try {
      await assertNetworkAvailable();
      const result = await api.reliabilityCockpit(activeWorkspace.id);
      if (result.role !== activeWorkspace.role) throw new MobileApiError("INVALID_RESPONSE");
      setReliabilityCockpit(result);
      setReliabilityLoadState("READY");
    } catch (error) {
      setReliabilityCockpit(null);
      setReliabilityLoadState("UNAVAILABLE");
      setPublicError(publicMessage(error));
    }
  }, [activeWorkspace, api]);

  const submitReliabilityCommand = useCallback(async (command: MobileReliabilityCommand) => {
    if (!activeWorkspace || command.workspaceId !== activeWorkspace.id) throw new Error("MOBILE_RELIABILITY_WORKSPACE_REFUSED");
    if (activeWorkspace.role === "FIELD_WORKER") throw new Error("MOBILE_RELIABILITY_MANAGEMENT_REFUSED");
    if (dispatchingReliabilityRequest.current) throw new Error("MOBILE_RELIABILITY_ALREADY_DISPATCHED");
    dispatchingReliabilityRequest.current = command.commandId;
    setReliabilityLoadState("LOADING");
    setPublicError(null);
    try {
      await assertNetworkAvailable();
      await api.reliabilityCommand(command);
      setReliabilityCockpit(await api.reliabilityCockpit(activeWorkspace.id));
      setReliabilityLoadState("READY");
    } catch (error) {
      setReliabilityLoadState("UNAVAILABLE");
      setPublicError(publicMessage(error));
      if (error instanceof MobileApiError && error.code === "CONFLICT") await loadReliability();
    } finally {
      dispatchingReliabilityRequest.current = null;
    }
  }, [activeWorkspace, api, loadReliability]);

  const loadOnboarding = useCallback(async (workspaceId?: string) => {
    const targetWorkspaceId = workspaceId ?? activeWorkspace?.id;
    setOnboardingLoadState("LOADING");
    setPublicError(null);
    try {
      await assertNetworkAvailable();
      const result = await api.onboardingCockpit(targetWorkspaceId);
      if (targetWorkspaceId && result.workspace?.id !== targetWorkspaceId) throw new MobileApiError("INVALID_RESPONSE");
      setOnboardingCockpit(result);
      setOnboardingLoadState("READY");
    } catch (error) {
      setOnboardingCockpit(null);
      setOnboardingLoadState("UNAVAILABLE");
      setPublicError(publicMessage(error));
    }
  }, [activeWorkspace?.id, api]);

  const submitOnboardingCommand = useCallback(async (command: MobileOnboardingCommand) => {
    if (dispatchingOnboardingRequest.current) throw new Error("MOBILE_ONBOARDING_ALREADY_DISPATCHED");
    if (activeWorkspace?.role === "FIELD_WORKER") throw new Error("MOBILE_ONBOARDING_MANAGEMENT_REFUSED");
    if ("workspaceId" in command && onboardingCockpit?.workspace?.id && command.workspaceId !== onboardingCockpit.workspace.id) throw new Error("MOBILE_ONBOARDING_WORKSPACE_REFUSED");
    dispatchingOnboardingRequest.current = command.commandId;
    setOnboardingLoadState("LOADING");
    setPublicError(null);
    try {
      await assertNetworkAvailable();
      const result = await api.onboardingCommand(command);
      if (!activeWorkspace || activeWorkspace.id !== result.workspaceId) await loadBootstrap();
      setOnboardingCockpit(await api.onboardingCockpit(result.workspaceId));
      setOnboardingLoadState("READY");
    } catch (error) {
      setOnboardingLoadState("UNAVAILABLE");
      setPublicError(publicMessage(error));
      if (error instanceof MobileApiError && error.code === "CONFLICT") await loadOnboarding("workspaceId" in command ? command.workspaceId : undefined);
    } finally {
      dispatchingOnboardingRequest.current = null;
    }
  }, [activeWorkspace, api, loadBootstrap, loadOnboarding, onboardingCockpit]);

  const loadGoldenWorkflow = useCallback(async () => {
    if (!activeWorkspace) {
      setGoldenWorkflow(null);
      setGoldenWorkflowLoadState("UNAVAILABLE");
      return;
    }
    setGoldenWorkflowLoadState("LOADING");
    setPublicError(null);
    try {
      await assertNetworkAvailable();
      setGoldenWorkflow(await api.goldenWorkflow(activeWorkspace.id));
      setGoldenWorkflowLoadState("READY");
    } catch (error) {
      setGoldenWorkflowLoadState("UNAVAILABLE");
      setPublicError(publicMessage(error));
    }
  }, [activeWorkspace, api]);

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
    } else if (entry.kind === "PERMISSION_REVOCATION") {
      await revokePermission(entry.command);
    } else if (entry.kind === "JOB_COMMAND") {
      await submitJobCommand(entry.command);
    } else if (entry.kind === "ECONOMIC_COMMAND") {
      await submitEconomicCommand(entry.command);
    } else if (entry.kind === "HUMAN_ESCALATION_COMMAND") {
      await submitHumanEscalationCommand(entry.command);
    } else if (entry.kind === "CALENDAR_CONNECTOR_COMMAND") {
      await submitCalendarConnectorCommand(entry.command);
    } else if (entry.kind === "MESSAGING_COMMAND") {
      await submitMessagingCommand(entry.command);
    } else if (entry.kind === "VOICE_CALL_COMMAND") {
      await submitPrepareCallWork(entry.command);
    } else if (entry.kind === "EMAIL_ACCOUNT_COMMAND" || entry.kind === "EMAIL_DRAFT_COMMAND") {
      await submitEmailCommand(entry.command);
    } else if (entry.kind === "ACCOUNTING_ACCOUNT_COMMAND" || entry.kind === "ACCOUNTING_DRAFT_COMMAND") {
      await submitAccountingCommand(entry.command);
    } else if (entry.kind === "AUTHORITY_POLICY_COMMAND" || entry.kind === "AUTHORITY_EVALUATE" || entry.kind === "AUTHORITY_DECIDE") {
      await submitAuthorityCommand(entry.command);
    } else if (entry.kind === "PRIVACY_COMMAND") {
      await submitPrivacyCommand(entry.command);
    } else {
      await submitFollowUpCommand(entry.command);
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
    submitJobCommand,
    submitEconomicCommand,
    submitHumanEscalationCommand,
    submitCalendarConnectorCommand,
    submitMessagingCommand,
    submitPrepareCallWork,
    submitEmailCommand,
    submitAccountingCommand,
    submitAuthorityCommand,
    submitPrivacyCommand,
    submitFollowUpCommand,
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
      if (await hasProjectBrainIntents()) {
        setPublicError(mobileProductCopy(activeWorkspace?.defaultLocale).projectBrain.pendingSignOut);
        return;
      }
      await clearMobileOutbox();
      await clearProjectBrainIntents();
    } catch {
      setOutboxLoadState("UNAVAILABLE");
      setPublicError("La déconnexion est bloquée tant que les commandes locales chiffrées ne peuvent pas être effacées.");
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
    setProvenance(null);
    setProvenanceLoadState("IDLE");
    setJobSchedule(null);
    setJobScheduleLoadState("IDLE");
    setFollowUpQueue(null);
    setFollowUpQueueLoadState("IDLE");
    setEconomicCockpit(null);
    setEconomicCockpitLoadState("IDLE");
    setHumanEscalationCockpit(null);
    setHumanEscalationLoadState("IDLE");
    setCalendarConnectorCockpit(null);
    setCalendarConnectorLoadState("IDLE");
    setMessagingCockpit(null);
    setMessagingLoadState("IDLE");
    setVoiceCallsCockpit(null);
    setVoiceCallsLoadState("IDLE");
    setLatestVoiceNoteAttempt(null);
    setEmailCockpit(null);
    setEmailLoadState("IDLE");
    setAccountingCockpit(null);
    setAccountingLoadState("IDLE");
    setAuthorityCockpit(null);
    setAuthorityLoadState("IDLE");
    setPrivacyCockpit(null);
    setPrivacyLoadState("IDLE");
    setReliabilityCockpit(null);
    setReliabilityLoadState("IDLE");
    setOnboardingCockpit(null);
    setOnboardingLoadState("IDLE");
    setProjectBrainIntake(null);
    setProjectBrainLoadState("IDLE");
    setProjectBrainCommandQueue([]);
    setProjectBrainSourceQueue([]);
    projectBrainContext.current = null;
    dispatchingProjectBrainCommand.current = null;
    dispatchingProjectBrainSources.current.clear();
    setPermissionCenter(null);
    setPermissionLoadState("IDLE");
    setOutboxEntries([]);
    setOutboxLoadState("IDLE");
    setLoadState("IDLE");
  }, [activeWorkspace]);

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
      provenance,
      provenanceLoadState,
      jobSchedule,
      jobScheduleLoadState,
      followUpQueue,
      followUpQueueLoadState,
      economicCockpit,
      economicCockpitLoadState,
      humanEscalationCockpit,
      humanEscalationLoadState,
      calendarConnectorCockpit,
      calendarConnectorLoadState,
      messagingCockpit,
      messagingLoadState,
      voiceCallsCockpit,
      voiceCallsLoadState,
      latestVoiceNoteAttempt,
      emailCockpit,
      emailLoadState,
      accountingCockpit,
      accountingLoadState,
      authorityCockpit,
      authorityLoadState,
      privacyCockpit,
      privacyLoadState,
      reliabilityCockpit,
      reliabilityLoadState,
      onboardingCockpit,
      onboardingLoadState,
      goldenWorkflow,
      goldenWorkflowLoadState,
      projectBrainIntake,
      projectBrainLoadState,
      projectBrainCommandQueue,
      projectBrainSourceQueue,
      projectBrainUnderstanding,
      projectBrainUnderstandingLoadState,
      projectBrainAssistantMemory,
      projectBrainAssistantMemoryLoadState,
      latestProjectBrainAssistantResult,
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
      loadProvenance,
      loadJobSchedule,
      submitJobCommand,
      loadFollowUpQueue,
      submitFollowUpCommand,
      loadEconomicCockpit,
      submitEconomicCommand,
      loadHumanEscalations,
      submitHumanEscalationCommand,
      loadCalendarConnectors,
      submitCalendarConnectorCommand,
      loadMessaging,
      submitMessagingCommand,
      loadVoiceCalls,
      submitPrepareCallWork,
      submitVoiceNoteAttempt,
      loadEmail,
      submitEmailCommand,
      loadAccounting,
      submitAccountingCommand,
      loadAuthority,
      submitAuthorityCommand,
      loadPrivacy,
      submitPrivacyCommand,
      loadReliability,
      submitReliabilityCommand,
      loadOnboarding,
      submitOnboardingCommand,
      loadGoldenWorkflow,
      loadProjectBrainIntake,
      submitProjectBrainCommand,
      retryProjectBrainCommand,
      stageProjectBrainSources,
      uploadProjectBrainSource,
      retryProjectBrainSource,
      dismissProjectBrainIntent,
      loadProjectBrainUnderstanding,
      submitProjectBrainUnderstandingCommand,
      loadProjectBrainAssistantMemory,
      submitProjectBrainAssistantMemoryCommand,
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
      provenance,
      provenanceLoadState,
      jobSchedule,
      jobScheduleLoadState,
      followUpQueue,
      followUpQueueLoadState,
      economicCockpit,
      economicCockpitLoadState,
      humanEscalationCockpit,
      humanEscalationLoadState,
      calendarConnectorCockpit,
      calendarConnectorLoadState,
      messagingCockpit,
      messagingLoadState,
      voiceCallsCockpit,
      voiceCallsLoadState,
      latestVoiceNoteAttempt,
      emailCockpit,
      emailLoadState,
      accountingCockpit,
      accountingLoadState,
      authorityCockpit,
      authorityLoadState,
      privacyCockpit,
      privacyLoadState,
      reliabilityCockpit,
      reliabilityLoadState,
      onboardingCockpit,
      onboardingLoadState,
      goldenWorkflow,
      goldenWorkflowLoadState,
      projectBrainIntake,
      projectBrainLoadState,
      projectBrainCommandQueue,
      projectBrainSourceQueue,
      projectBrainUnderstanding,
      projectBrainUnderstandingLoadState,
      projectBrainAssistantMemory,
      projectBrainAssistantMemoryLoadState,
      latestProjectBrainAssistantResult,
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
      loadProvenance,
      loadJobSchedule,
      submitJobCommand,
      loadFollowUpQueue,
      submitFollowUpCommand,
      loadEconomicCockpit,
      submitEconomicCommand,
      loadHumanEscalations,
      submitHumanEscalationCommand,
      loadCalendarConnectors,
      submitCalendarConnectorCommand,
      loadMessaging,
      submitMessagingCommand,
      loadVoiceCalls,
      submitPrepareCallWork,
      submitVoiceNoteAttempt,
      loadEmail,
      submitEmailCommand,
      loadAccounting,
      submitAccountingCommand,
      loadAuthority,
      submitAuthorityCommand,
      loadPrivacy,
      submitPrivacyCommand,
      loadReliability,
      submitReliabilityCommand,
      loadOnboarding,
      submitOnboardingCommand,
      loadGoldenWorkflow,
      loadProjectBrainIntake,
      submitProjectBrainCommand,
      retryProjectBrainCommand,
      stageProjectBrainSources,
      uploadProjectBrainSource,
      retryProjectBrainSource,
      dismissProjectBrainIntent,
      loadProjectBrainUnderstanding,
      submitProjectBrainUnderstandingCommand,
      loadProjectBrainAssistantMemory,
      submitProjectBrainAssistantMemoryCommand,
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
