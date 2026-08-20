import { readFile } from "node:fs/promises";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import {
  assessNativeIsolationBackend,
  type NativeIsolationInventory,
} from "../src/lib/engineering-factory/native-isolation-preflight";

const WINDOWS_HOME_WITHOUT_BACKEND: NativeIsolationInventory = {
  osCaption: "Microsoft Windows 11 Home",
  osVersion: "10.0.26200",
  osBuild: "26200",
  architecture: "64-bit",
  hypervisorPresent: true,
  totalPhysicalMemoryBytes: 33_400_000_000,
  commands: {
    docker: false,
    podman: false,
    wsl: true,
    windowsSandbox: false,
    vmconnect: false,
    getVm: false,
  },
  services: {
    vmcompute: "Running",
    hns: "Running",
    vmms: "Missing",
  },
  wslStatusExitCode: 50,
};

describe("Engineering Factory native isolation preflight", () => {
  it("fails closed on the current Windows Home host without an installed backend", () => {
    const report = assessNativeIsolationBackend(WINDOWS_HOME_WITHOUT_BACKEND);

    expect(report).toMatchObject({
      schemaVersion: 1,
      status: "NATIVE_ISOLATION_SETUP_REQUIRED",
      recommendedBackendCandidate: "wsl2-hardened-linux-container",
      decisionStatus: "PROPOSED_FOR_SETUP_REVIEW",
      realCandidateInvocations: 0,
      providerCalls: 0,
      osMutationPerformed: false,
      elevationRequested: false,
      executionAuthorized: false,
    });
    expect(report.blockers).toEqual(
      expect.arrayContaining([
        "wsl_not_installed",
        "container_runtime_not_installed",
        "control_evidence_not_reviewed",
      ])
    );
  });

  it("does not treat a present hypervisor as usable Hyper-V on Windows Home", () => {
    const report = assessNativeIsolationBackend(WINDOWS_HOME_WITHOUT_BACKEND);

    expect(report.rejectedBackends).toContainEqual({
      backend: "hyper-v-dedicated-vm",
      reason: "windows_home_has_no_supported_hyper_v_role",
    });
    expect(report.executionAuthorized).toBe(false);
  });

  it("never admits bare WSL without a hardened container runtime", () => {
    const report = assessNativeIsolationBackend({
      ...WINDOWS_HOME_WITHOUT_BACKEND,
      wslStatusExitCode: 0,
    });

    expect(report.status).toBe("NATIVE_ISOLATION_SETUP_REQUIRED");
    expect(report.blockers).toContain("container_runtime_not_installed");
    expect(report.executionAuthorized).toBe(false);
  });

  it("requires a separate control review even when WSL and Docker are installed", () => {
    const report = assessNativeIsolationBackend({
      ...WINDOWS_HOME_WITHOUT_BACKEND,
      commands: { ...WINDOWS_HOME_WITHOUT_BACKEND.commands, docker: true },
      wslStatusExitCode: 0,
    });

    expect(report.status).toBe("NATIVE_ISOLATION_CONTROL_REVIEW_REQUIRED");
    expect(report.blockers).toEqual(["control_evidence_not_reviewed"]);
    expect(report.executionAuthorized).toBe(false);
  });

  it("rejects Windows Sandbox as the selected backend on this host", () => {
    const report = assessNativeIsolationBackend(WINDOWS_HOME_WITHOUT_BACKEND);

    expect(report.rejectedBackends).toEqual(
      expect.arrayContaining([
        {
          backend: "windows-sandbox",
          reason: "unsupported_edition_and_insufficient_egress_policy",
        },
        {
          backend: "bare-wsl2",
          reason: "host_filesystem_interop_is_not_a_hostile_code_boundary",
        },
        {
          backend: "node-permission-model",
          reason: "defense_in_depth_only_not_a_malicious_code_boundary",
        },
      ])
    );
  });

  it("defines the controls that a later setup review must prove", () => {
    const report = assessNativeIsolationBackend(WINDOWS_HOME_WITHOUT_BACKEND);

    expect(report.requiredControls).toEqual([
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
    ]);
  });

  it("keeps the preflight read-only and free of candidate or provider launch commands", async () => {
    const source = await readFile(
      join(process.cwd(), "scripts", "preflight-engineering-native-isolation.ts"),
      "utf8"
    );

    expect(source).not.toMatch(/wsl(?:\.exe)?\s+--install/i);
    expect(source).not.toMatch(/Enable-WindowsOptionalFeature/i);
    expect(source).not.toMatch(/dism(?:\.exe)?\s+\/enable-feature/i);
    expect(source).not.toMatch(/Start-Process[\s\S]*-Verb\s+RunAs/i);
    expect(source).not.toMatch(/docker\s+(?:container\s+)?run/i);
    expect(source).not.toMatch(/codex\s+exec/i);
    expect(source).not.toMatch(/claude\s+-p/i);
    expect(source).not.toMatch(/api\.anthropic\.com|api\.openai\.com/i);
  });
});
