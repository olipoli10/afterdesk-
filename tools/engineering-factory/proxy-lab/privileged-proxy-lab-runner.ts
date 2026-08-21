import { createHash, randomBytes, randomUUID } from "node:crypto";
import { spawn } from "node:child_process";
import {
  copyFile,
  mkdir,
  readFile,
  writeFile,
} from "node:fs/promises";
import { createInterface } from "node:readline";
import { basename, dirname, join, resolve } from "node:path";

import {
  createProxyLabPrivilegedApprovalBundle,
  verifyProxyLabPrivilegedApprovalBundle,
  type ProxyLabPrivilegedBoundaryPayloadV2,
} from "../../../src/lib/engineering-factory/proxy-lab-privileged-authority-v2";
import { proxyLabCanonicalJson } from "../../../src/lib/engineering-factory/proxy-lab-authority-v2";
import {
  runProviderFreeProxyLab,
  type ProviderFreeProxyLabEvidence,
  type ProxyLabPrivilegedHooks,
} from "./proxy-lab-runner";

const SCRIPT_ROOT = resolve(process.cwd(), "tools", "engineering-factory", "proxy-lab");
const RAW_LIMIT = 4 * 1024 * 1024;

type ControllerResult = Record<string, unknown>;

export type PrivilegedProviderFreeProxyLabEvidence = {
  schemaVersion: 2;
  status: "PRIVILEGED_PROVIDER_FREE_PROXY_LAB_PROVED";
  verdict: "GO_NEXT_SYNTHETIC_MILESTONE_ONLY";
  executionAuthorized: false;
  realCandidateInvocations: 0;
  providerCalls: 0;
  rootlessLab: ProviderFreeProxyLabEvidence;
  privilegedApprovalVerified: true;
  rootOwnedFirewallProved: true;
  independentPacketObserverProved: true;
  beforeAfterStateMatched: true;
  cleanupVerified: true;
  killSwitchBlockBeforeTerminationProved: true;
  mutationCount: 18;
  runId: string;
  firewallRulesetSha256: string;
  firewallControllerIdentitySha256: string;
  observerConfigurationSha256: string;
  observerPacketEvidenceSha256: string;
  beforeStateSha256: string;
  afterStateSha256: string;
  cleanupAttestationSha256: string;
  killSwitchProofSha256: string;
  privilegedAuthorityFile: string;
  packetEvidenceFile: string;
  cleanupAttestationFile: string;
  controlEvidenceFile: string;
  evidenceFile: string;
};

function sha256(value: string | Buffer): string {
  return createHash("sha256").update(value).digest("hex");
}

function windowsWslEnvironment(): NodeJS.ProcessEnv {
  const names = ["SystemRoot", "WINDIR", "PATH", "TEMP", "TMP", "USERPROFILE", "LOCALAPPDATA"];
  return {
    NODE_ENV: "production",
    ...Object.fromEntries(names.flatMap((name) => (process.env[name] ? [[name, process.env[name]!]] : []))),
  };
}

async function runWslRoot(
  args: readonly string[],
  options: { stdin?: string | Buffer; timeoutMs?: number; label: string }
): Promise<Buffer> {
  return new Promise((resolveCommand, reject) => {
    const child = spawn("wsl.exe", ["-d", "Debian", "-u", "root", "--exec", ...args], {
      env: windowsWslEnvironment(),
      windowsHide: true,
      shell: false,
      stdio: ["pipe", "pipe", "pipe"],
    });
    const stdout: Buffer[] = [];
    const stderr: Buffer[] = [];
    let bytes = 0;
    let settled = false;
    const timer = setTimeout(() => {
      child.kill();
      if (!settled) {
        settled = true;
        reject(new Error(`${options.label} timed out and was stopped`));
      }
    }, options.timeoutMs ?? 60_000);
    const collect = (target: Buffer[], chunk: Buffer) => {
      bytes += chunk.byteLength;
      if (bytes > RAW_LIMIT) child.kill();
      else target.push(chunk);
    };
    child.stdout.on("data", (chunk: Buffer) => collect(stdout, chunk));
    child.stderr.on("data", (chunk: Buffer) => collect(stderr, chunk));
    child.once("error", () => {
      clearTimeout(timer);
      if (!settled) {
        settled = true;
        reject(new Error(`${options.label} failed to start`));
      }
    });
    child.once("close", (code) => {
      clearTimeout(timer);
      if (settled) return;
      settled = true;
      if (bytes > RAW_LIMIT) reject(new Error(`${options.label} exceeded its raw-output limit`));
      else if (code !== 0) reject(new Error(`${options.label} failed closed with exit ${code ?? "unknown"}`));
      else resolveCommand(Buffer.concat(stdout));
    });
    child.stdin.end(options.stdin ?? Buffer.alloc(0));
  });
}

async function wslStateSha256(): Promise<string> {
  return new Promise((resolveHash, reject) => {
    const child = spawn("wsl.exe", ["--list", "--verbose"], {
      env: windowsWslEnvironment(),
      windowsHide: true,
      shell: false,
      stdio: ["ignore", "pipe", "pipe"],
    });
    const chunks: Buffer[] = [];
    child.stdout.on("data", (chunk: Buffer) => chunks.push(chunk));
    child.once("error", reject);
    child.once("close", (code) => {
      if (code !== 0) reject(new Error("WSL state fingerprint failed closed"));
      else resolveHash(sha256(Buffer.concat(chunks)));
    });
  });
}

async function stageRootFile(stageRoot: string, name: string, bytes: Buffer): Promise<string> {
  const target = `${stageRoot}/${name}`;
  if (!/^\/var\/tmp\/ef-privileged-stage-[0-9a-f]{12}\/[a-z0-9.-]+$/.test(target)) {
    throw new Error("privileged controller staging path escaped its exact root");
  }
  await runWslRoot(
    ["sh", "-c", "umask 077; mkdir -p -- \"$1\"; cat > \"$2\"; chmod 0500 \"$2\"", "sh", stageRoot, target],
    { stdin: bytes, label: `stage privileged controller ${name}` }
  );
  return target;
}

class PrivilegedSupervisorClient {
  private readonly child: ReturnType<typeof spawn>;
  private readonly pending = new Map<string, { resolve: (value: ControllerResult) => void; reject: (error: Error) => void }>();
  private readonly stderr: Buffer[] = [];
  private closed = false;

  constructor(controllerFile: string, runRoot: string, observerFile: string) {
    this.child = spawn(
      "wsl.exe",
      ["-d", "Debian", "-u", "root", "--exec", "python3", "-I", "-S", controllerFile, "--run-root", runRoot, "--observer", observerFile],
      {
        env: windowsWslEnvironment(),
        windowsHide: true,
        shell: false,
        stdio: ["pipe", "pipe", "pipe"],
      }
    );
    const lines = createInterface({ input: this.child.stdout! });
    lines.on("line", (line) => {
      let response: { requestId?: string; ok?: boolean; result?: ControllerResult; error?: string };
      try {
        response = JSON.parse(line);
      } catch {
        this.failAll(new Error("privileged controller emitted malformed control output"));
        return;
      }
      const request = response.requestId ? this.pending.get(response.requestId) : undefined;
      if (!request || !response.requestId) return;
      this.pending.delete(response.requestId);
      if (response.ok) request.resolve(response.result ?? {});
      else request.reject(new Error(response.error ?? "privileged controller refused without a gate"));
    });
    this.child.stderr!.on("data", (chunk: Buffer) => {
      if (Buffer.concat(this.stderr).byteLength < RAW_LIMIT) this.stderr.push(chunk);
    });
    this.child.once("error", () => this.failAll(new Error("privileged controller failed to start")));
    this.child.once("close", (code) => {
      if (!this.closed && this.pending.size) {
        this.failAll(new Error(`privileged controller exited unexpectedly with ${code ?? "unknown"}`));
      }
    });
  }

  private failAll(error: Error): void {
    for (const request of this.pending.values()) request.reject(error);
    this.pending.clear();
  }

  request(command: string, fields: Record<string, unknown> = {}, timeoutMs = 60_000): Promise<ControllerResult> {
    if (this.closed) return Promise.reject(new Error("privileged controller is already closed"));
    const requestId = randomUUID();
    return new Promise((resolveRequest, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(requestId);
        reject(new Error(`privileged controller ${command} timed out`));
      }, timeoutMs);
      this.pending.set(requestId, {
        resolve: (value) => {
          clearTimeout(timer);
          resolveRequest(value);
        },
        reject: (error) => {
          clearTimeout(timer);
          reject(error);
        },
      });
      this.child.stdin!.write(`${JSON.stringify({ requestId, command, ...fields })}\n`);
    });
  }

  async close(): Promise<void> {
    if (this.closed) return;
    if (this.child.exitCode === null && !this.child.stdin!.destroyed) {
      await this.request("close", {}, 10_000).catch(() => undefined);
    }
    this.closed = true;
    if (!this.child.stdin!.destroyed) this.child.stdin!.end();
    await new Promise<void>((resolveClose) => {
      if (this.child.exitCode !== null) resolveClose();
      else this.child.once("close", () => resolveClose());
    });
  }

  terminate(): void {
    if (this.child.exitCode === null) this.child.kill();
  }
}

function safeName(value: string): string {
  return value.replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 32);
}

async function copyRouteBundle(
  bundle: Awaited<Parameters<ProxyLabPrivilegedHooks["onRouteAuthority"]>[0]["bundle"]>,
  directory: string
): Promise<void> {
  await mkdir(directory, { recursive: true });
  for (const file of [bundle.authorityFile, bundle.policyFile, bundle.manifestFile, bundle.runtimeChainFile]) {
    const target = resolve(directory, basename(file));
    if (dirname(target) !== resolve(directory)) throw new Error("route authority copy escaped its privileged bundle");
    await copyFile(file, target);
  }
}

async function mutationEvidenceSourceHash(): Promise<string> {
  const files = [
    join(SCRIPT_ROOT, "privileged-firewall-controller.py"),
    join(SCRIPT_ROOT, "packet-metadata-observer.py"),
    join(SCRIPT_ROOT, "privileged-proxy-lab-runner.ts"),
    resolve(process.cwd(), "src", "lib", "engineering-factory", "proxy-lab-privileged-authority-v2.ts"),
  ];
  return sha256(Buffer.concat(await Promise.all(files.map((file) => readFile(file)))));
}

export async function runPrivilegedProviderFreeProxyLab({
  evidenceDirectory,
}: {
  evidenceDirectory: string;
}): Promise<PrivilegedProviderFreeProxyLabEvidence> {
  const root = resolve(evidenceDirectory);
  await mkdir(root, { recursive: true });
  const runId = randomUUID();
  const short = runId.replaceAll("-", "").slice(0, 12);
  const tableShort = short.slice(0, 8);
  const stageRoot = `/var/tmp/ef-privileged-stage-${short}`;
  const runRoot = `/var/tmp/ef-privileged-${short}`;
  const controllerFile = await stageRootFile(stageRoot, "privileged-firewall-controller.py", await readFile(join(SCRIPT_ROOT, "privileged-firewall-controller.py")));
  const observerFile = await stageRootFile(stageRoot, "packet-metadata-observer.py", await readFile(join(SCRIPT_ROOT, "packet-metadata-observer.py")));
  const supervisor = new PrivilegedSupervisorClient(controllerFile, runRoot, observerFile);
  const relayState = new Map<string, { table: string; observers: string[]; pid: number }>();
  const candidateState = new Map<string, { table: string; observer: string; pid: number }>();
  let authoritySigningKey: Buffer | undefined;
  let mainRouteAuthorityFile: string | undefined;
  let mainRouteAuthorityVerifiedAt: string | undefined;
  let rootlessArtifactsRemoved = false;
  let finalized = false;
  try {
    await supervisor.request("initialize", { wslStateSha256: await wslStateSha256() });
    let scenarioIndex = 0;
    const hooks: ProxyLabPrivilegedHooks = {
      async onRouteAuthority(args) {
        if (args.scenario === "main") {
          await copyRouteBundle(args.bundle, root);
          mainRouteAuthorityFile = resolve(root, "authority-v2.json");
          authoritySigningKey = Buffer.from(args.authoritySigningKey);
          mainRouteAuthorityVerifiedAt = new Date(Date.parse(args.bundle.authority.issuedAt) + 1_000).toISOString();
        }
      },
      async onRelayReady(args) {
        const index = scenarioIndex++;
        const table = `ef_priv_${tableShort}_r${index}`;
        await supervisor.request("applyRelay", {
          pid: args.pid,
          table,
          scenario: args.scenario,
          providerPort: args.providerPort,
        });
        const name = safeName(args.scenario);
        const candidateObserver = `relay-candidate-${name}`;
        const providerObserver = `relay-provider-${name}`;
        await supervisor.request("startObserver", {
          observerId: candidateObserver,
          pid: args.pid,
          role: "relay",
          address: "10.241.0.2",
          namespaceId: `${args.containerName}:candidate-side`,
        });
        await supervisor.request("startObserver", {
          observerId: providerObserver,
          pid: args.pid,
          role: "relay",
          address: "10.242.0.2",
          namespaceId: `${args.containerName}:provider-side`,
        });
        relayState.set(args.containerName, { table, observers: [candidateObserver, providerObserver], pid: args.pid });
      },
      async onRelayFinished(args) {
        const state = relayState.get(args.containerName);
        if (!state) throw new Error("privileged relay state is missing");
        for (const observerId of state.observers) await supervisor.request("stopObserver", { observerId });
        await supervisor.request("removeFirewall", { pid: state.pid, table: state.table });
        relayState.delete(args.containerName);
      },
      async onCandidateReady(args) {
        const table = `ef_priv_${tableShort}_c${candidateState.size}`;
        await supervisor.request("applyCandidate", {
          pid: args.pid,
          table,
          scenario: `${args.scenario}:${args.mode}`,
        });
        const observer = `candidate-${safeName(args.scenario)}-${safeName(args.mode)}`;
        await supervisor.request("startObserver", {
          observerId: observer,
          pid: args.pid,
          role: "candidate",
          namespaceId: args.containerName,
        });
        candidateState.set(args.containerName, { table, observer, pid: args.pid });
      },
      async onCandidateFinished(args) {
        const state = candidateState.get(args.containerName);
        if (!state) return;
        await supervisor.request("stopObserver", { observerId: state.observer });
        await supervisor.request("removeFirewall", { pid: state.pid, table: state.table });
        candidateState.delete(args.containerName);
      },
      async onKillSwitch(args) {
        const state = candidateState.get(args.containerName);
        if (!state) throw new Error("kill-switch candidate state is missing");
        await supervisor.request("applyKillSwitchBlock", { pid: state.pid, table: state.table }, 10_000);
        await supervisor.request("terminateCandidateAfterBlock", { pid: state.pid, containerName: args.containerName });
      },
      async onLabArtifactsRemoved() {
        rootlessArtifactsRemoved = true;
      },
    };

    const rootlessDirectory = resolve(root, "rootless-control");
    const rootlessLab = await runProviderFreeProxyLab({ evidenceDirectory: rootlessDirectory, privilegedHooks: hooks });
    if (!rootlessArtifactsRemoved || !mainRouteAuthorityFile || !authoritySigningKey || !mainRouteAuthorityVerifiedAt) {
      throw new Error("privileged proof did not retain its exact route authority or cleanup boundary");
    }
    const routeAuthoritySha256 = sha256(await readFile(mainRouteAuthorityFile));
    const sourceHash = await mutationEvidenceSourceHash();
    const issuedAt = new Date();
    const expiresAt = new Date(issuedAt.getTime() + 5 * 60_000);
    const finalizedProof = await supervisor.request(
      "finalize",
      {
        wslStateSha256: await wslStateSha256(),
        runId,
        runNonce: randomBytes(32).toString("hex"),
        issuedAt: issuedAt.toISOString(),
        expiresAt: expiresAt.toISOString(),
        routeAuthoritySha256,
        routeAuthorityVerifiedAt: mainRouteAuthorityVerifiedAt,
        sourceSha256: sourceHash,
      },
      120_000
    );
    finalized = true;
    const payload = finalizedProof.payload as ProxyLabPrivilegedBoundaryPayloadV2;
    const packetEvidence = finalizedProof.packetEvidence as Record<string, unknown>;
    const cleanupAttestation = finalizedProof.cleanupAttestation as Record<string, unknown>;
    const controlEvidence = finalizedProof.controlEvidence as Record<string, unknown>;
    const approval = await createProxyLabPrivilegedApprovalBundle({
      directory: root,
      routeAuthorityFile: mainRouteAuthorityFile,
      payload,
      controllerPublicKeyPem: finalizedProof.controllerPublicKeyPem as string,
      controllerSignature: Buffer.from(finalizedProof.controllerSignatureBase64 as string, "base64"),
      authoritySigningKey,
    });
    const verified = await verifyProxyLabPrivilegedApprovalBundle({
      directory: root,
      authorityFile: approval.authorityFile,
      authoritySigningKey,
      now: new Date(issuedAt.getTime() + 1_000),
      routeReplayLedger: new Set(),
      privilegedReplayLedger: new Set(),
    });
    if (verified.status !== "SYNTHETIC_PRIVILEGED_PROXY_LAB_APPROVED") {
      throw new Error("privileged Authority V2 approval did not verify");
    }

    const packetEvidenceFile = resolve(root, `${payload.observer.packetEvidenceSha256}.packet-evidence.json`);
    const cleanupAttestationFile = resolve(root, `${payload.cleanup.attestationSha256}.cleanup-attestation.json`);
    const controlEvidenceBytes = proxyLabCanonicalJson(controlEvidence);
    const controlEvidenceFile = resolve(root, `${sha256(controlEvidenceBytes)}.control-evidence.json`);
    for (const file of [packetEvidenceFile, cleanupAttestationFile, controlEvidenceFile]) {
      if (dirname(file) !== root) throw new Error("privileged evidence path escaped its exact directory");
    }
    await writeFile(packetEvidenceFile, proxyLabCanonicalJson(packetEvidence), { encoding: "utf8", flag: "wx" });
    await writeFile(cleanupAttestationFile, proxyLabCanonicalJson(cleanupAttestation), { encoding: "utf8", flag: "wx" });
    await writeFile(controlEvidenceFile, controlEvidenceBytes, { encoding: "utf8", flag: "wx" });

    const evidenceWithoutFile: Omit<PrivilegedProviderFreeProxyLabEvidence, "evidenceFile"> = {
      schemaVersion: 2,
      status: "PRIVILEGED_PROVIDER_FREE_PROXY_LAB_PROVED",
      verdict: "GO_NEXT_SYNTHETIC_MILESTONE_ONLY",
      executionAuthorized: false,
      realCandidateInvocations: 0,
      providerCalls: 0,
      rootlessLab,
      privilegedApprovalVerified: true,
      rootOwnedFirewallProved: true,
      independentPacketObserverProved: true,
      beforeAfterStateMatched: true,
      cleanupVerified: true,
      killSwitchBlockBeforeTerminationProved: true,
      mutationCount: 18,
      runId,
      firewallRulesetSha256: payload.firewall.rulesetSha256,
      firewallControllerIdentitySha256: payload.firewall.controllerIdentitySha256,
      observerConfigurationSha256: payload.observer.configurationSha256,
      observerPacketEvidenceSha256: payload.observer.packetEvidenceSha256,
      beforeStateSha256: payload.state.beforeSha256,
      afterStateSha256: payload.state.afterSha256,
      cleanupAttestationSha256: payload.cleanup.attestationSha256,
      killSwitchProofSha256: payload.killSwitch.proofSha256,
      privilegedAuthorityFile: approval.authorityFile,
      packetEvidenceFile,
      cleanupAttestationFile,
      controlEvidenceFile,
    };
    const evidenceFile = resolve(root, "privileged-provider-free-proxy-lab-evidence-v2.json");
    const serialized = proxyLabCanonicalJson(evidenceWithoutFile);
    await writeFile(
      evidenceFile,
      `${proxyLabCanonicalJson({ schemaVersion: 2, integritySha256: sha256(serialized), evidence: evidenceWithoutFile })}\n`,
      { encoding: "utf8", flag: "wx" }
    );
    return { ...evidenceWithoutFile, evidenceFile };
  } finally {
    await supervisor.close().catch(() => undefined);
    if (!finalized) supervisor.terminate();
    await runWslRoot(
      ["sh", "-c", "case \"$1\" in /var/tmp/ef-privileged-stage-????????????) rm -rf -- \"$1\";; *) exit 91;; esac", "sh", stageRoot],
      { label: "remove exact privileged controller staging root" }
    ).catch(() => undefined);
    await runWslRoot(
      ["sh", "-c", "test ! -e \"$1\" && test ! -e \"$2\"", "sh", stageRoot, runRoot],
      { label: "verify privileged controller roots are gone" }
    );
  }
}
