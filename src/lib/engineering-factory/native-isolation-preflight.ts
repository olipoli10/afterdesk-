export type NativeIsolationInventory = {
  osCaption: string;
  osVersion: string;
  osBuild: string;
  architecture: string;
  hypervisorPresent: boolean;
  totalPhysicalMemoryBytes: number;
  commands: {
    docker: boolean;
    podman: boolean;
    wslPodman?: boolean;
    wsl: boolean;
    windowsSandbox: boolean;
    vmconnect: boolean;
    getVm: boolean;
  };
  services: {
    vmcompute: string;
    hns: string;
    vmms: string;
  };
  wslStatusExitCode: number | null;
};

export type NativeIsolationPreflightReport = {
  schemaVersion: 1;
  status:
    | "NATIVE_ISOLATION_SETUP_REQUIRED"
    | "NATIVE_ISOLATION_CONTROL_REVIEW_REQUIRED";
  recommendedBackendCandidate: "wsl2-hardened-linux-container";
  decisionStatus: "PROPOSED_FOR_SETUP_REVIEW";
  realCandidateInvocations: 0;
  providerCalls: 0;
  osMutationPerformed: false;
  elevationRequested: false;
  executionAuthorized: false;
  inventory: NativeIsolationInventory;
  blockers: string[];
  rejectedBackends: Array<{ backend: string; reason: string }>;
  requiredControls: string[];
};

const REQUIRED_CONTROLS = [
  "isolated_bundle_without_git_metadata",
  "no_host_mounts_or_container_socket",
  "read_only_root_with_ephemeral_tmpfs",
  "non_root_user_and_all_capabilities_dropped",
  "no_new_privileges_and_default_seccomp",
  "cpu_memory_pid_and_wall_clock_limits",
  "network_none_for_synthetic_runs",
  "proxy_only_egress_for_separately_authorized_provider_runs",
  "stdin_or_protected_pipe_input_only",
  "allowlisted_environment_only",
  "raw_streams_destroyed_before_metadata_persistence",
  "separate_control_evidence_and_mutation_review",
] as const;

function isWindowsHome(caption: string): boolean {
  return /\bHome\b/i.test(caption);
}

function hasInstalledWsl(inventory: NativeIsolationInventory): boolean {
  return inventory.commands.wsl && inventory.wslStatusExitCode === 0;
}

function hasContainerRuntime(inventory: NativeIsolationInventory): boolean {
  return inventory.commands.docker || inventory.commands.podman || inventory.commands.wslPodman === true;
}

export function assessNativeIsolationBackend(
  inventory: NativeIsolationInventory
): NativeIsolationPreflightReport {
  const blockers: string[] = [];

  if (!hasInstalledWsl(inventory)) {
    blockers.push("wsl_not_installed");
  }
  if (!hasContainerRuntime(inventory)) {
    blockers.push("container_runtime_not_installed");
  }
  blockers.push("control_evidence_not_reviewed");

  const setupComplete = hasInstalledWsl(inventory) && hasContainerRuntime(inventory);
  const homeEdition = isWindowsHome(inventory.osCaption);

  return {
    schemaVersion: 1,
    status: setupComplete
      ? "NATIVE_ISOLATION_CONTROL_REVIEW_REQUIRED"
      : "NATIVE_ISOLATION_SETUP_REQUIRED",
    recommendedBackendCandidate: "wsl2-hardened-linux-container",
    decisionStatus: "PROPOSED_FOR_SETUP_REVIEW",
    realCandidateInvocations: 0,
    providerCalls: 0,
    osMutationPerformed: false,
    elevationRequested: false,
    executionAuthorized: false,
    inventory,
    blockers,
    rejectedBackends: [
      {
        backend: "hyper-v-dedicated-vm",
        reason: homeEdition
          ? "windows_home_has_no_supported_hyper_v_role"
          : "requires_separate_admin_setup_and_control_review",
      },
      {
        backend: "windows-sandbox",
        reason: homeEdition
          ? "unsupported_edition_and_insufficient_egress_policy"
          : "insufficient_egress_policy_for_provider_runs",
      },
      {
        backend: "bare-wsl2",
        reason: "host_filesystem_interop_is_not_a_hostile_code_boundary",
      },
      {
        backend: "node-permission-model",
        reason: "defense_in_depth_only_not_a_malicious_code_boundary",
      },
    ],
    requiredControls: [...REQUIRED_CONTROLS],
  };
}
