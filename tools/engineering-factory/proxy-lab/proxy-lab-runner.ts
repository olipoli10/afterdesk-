import { createHash, createHmac, randomBytes, randomUUID, timingSafeEqual } from "node:crypto";
import { spawn } from "node:child_process";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";

import {
  createProxyLabAuthorityBundle,
  proxyLabCanonicalJson,
  verifyProxyLabAuthorityBundle,
  type ProxyLabManifestV2,
  type ProxyLabPolicyV2,
  type ProxyLabRuntimeChainEntry,
} from "../../../src/lib/engineering-factory/proxy-lab-authority-v2";

const PYTHON_BASE = "localhost/ef-proxy-lab-python";
const CANDIDATE_IP = "10.241.0.10";
const RELAY_CANDIDATE_IP = "10.241.0.2";
const RELAY_PROVIDER_IP = "10.242.0.2";
const PROVIDER_IP = "10.242.0.10";
const DNS_IP = "10.242.0.53";
const RELAY_PORT = 8443;
const SCRIPT_ROOT = resolve(process.cwd(), "tools", "engineering-factory", "proxy-lab");
const RAW_LIMIT = 4 * 1024 * 1024;

type CommandResult = { stdout: Buffer; stderr: Buffer };

export type ProxyLabPrivilegedHooks = {
  onRouteAuthority(args: {
    scenario: string;
    routeId: string;
    providerPort: number;
    bundle: Awaited<ReturnType<typeof createProxyLabAuthorityBundle>>;
    authoritySigningKey: Buffer;
  }): Promise<void>;
  onRelayReady(args: {
    scenario: string;
    routeId: string;
    providerPort: number;
    containerName: string;
    pid: number;
  }): Promise<void>;
  onRelayFinished(args: { scenario: string; containerName: string; pid: number }): Promise<void>;
  onCandidateReady(args: {
    scenario: string;
    mode: "probe" | "single-probe" | "kill-switch-loop";
    containerName: string;
    pid: number;
  }): Promise<void>;
  onCandidateFinished(args: {
    scenario: string;
    mode: "probe" | "single-probe" | "kill-switch-loop";
    containerName: string;
    pid: number;
  }): Promise<void>;
  onKillSwitch(args: { scenario: string; containerName: string; pid: number }): Promise<void>;
  onLabArtifactsRemoved(): Promise<void>;
};

export type ProviderFreeProxyLabEvidence = {
  schemaVersion: 1;
  status: "PROVIDER_FREE_PROXY_LAB_PROVED_WITH_PRIVILEGED_GAP";
  verdict: "NO_GO_ROOT_OWNED_FIREWALL_PROOF_MISSING";
  executionAuthorized: false;
  realCandidateInvocations: 0;
  providerCalls: 0;
  fakeProviderOperations: number;
  runId: string;
  authorityV2Verified: true;
  candidateNetworkInternal: true;
  candidateNetworkDnsDisabled: true;
  candidateNetworkNoDefaultRoute: true;
  candidateIpv6Disabled: true;
  credentialBoundaryProved: true;
  contentFreeAuditVerified: true;
  cleanupVerified: true;
  rootOwnedFirewallProved: false;
  runtimeChain: ProxyLabRuntimeChainEntry[];
  hostileCandidate: Record<string, boolean>;
  adversarialScenarios: Array<{ name: string; refused: boolean; reason: string }>;
  orphanProcessTreeKilled: true;
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

async function runWsl(
  args: readonly string[],
  options: { stdin?: string | Buffer; timeoutMs?: number; rawLimitBytes?: number; label: string }
): Promise<CommandResult> {
  return new Promise((resolveCommand, reject) => {
    const child = spawn("wsl.exe", ["-d", "Debian", "--exec", ...args], {
      env: windowsWslEnvironment(),
      windowsHide: true,
      shell: false,
      stdio: ["pipe", "pipe", "pipe"],
    });
    const stdout: Buffer[] = [];
    const stderr: Buffer[] = [];
    let bytes = 0;
    let overflow = false;
    let settled = false;
    const limit = options.rawLimitBytes ?? RAW_LIMIT;
    const timer = setTimeout(() => {
      child.kill();
      if (!settled) {
        settled = true;
        reject(new Error(`${options.label} timed out and was stopped`));
      }
    }, options.timeoutMs ?? 60_000);
    const collect = (target: Buffer[], chunk: Buffer) => {
      bytes += chunk.byteLength;
      if (bytes > limit) {
        overflow = true;
        child.kill();
        return;
      }
      target.push(chunk);
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
      if (overflow) {
        reject(new Error(`${options.label} exceeded its raw-output limit`));
      } else if (code !== 0) {
        reject(new Error(`${options.label} failed closed with exit ${code ?? "unknown"}`));
      } else {
        resolveCommand({ stdout: Buffer.concat(stdout), stderr: Buffer.concat(stderr) });
      }
    });
    child.stdin.end(options.stdin ?? Buffer.alloc(0));
  });
}

async function wslText(args: readonly string[], label: string, timeoutMs = 60_000): Promise<string> {
  return (await runWsl(args, { label, timeoutMs })).stdout.toString("utf8").trim();
}

function validateWslPath(path: string, runRoot: string): void {
  if (!path.startsWith(`${runRoot}/`) || path.includes("..") || !runRoot.startsWith("/home/efrunner/.local/share/endvera-proxy-lab/run-")) {
    throw new Error("proxy-lab staging path escaped the disposable run root");
  }
}

async function stageFile(runRoot: string, relative: string, bytes: string | Buffer, mode = "0444"): Promise<string> {
  const file = `${runRoot}/${relative}`;
  validateWslPath(file, runRoot);
  await runWsl(
    [
      "sh",
      "-c",
      "umask 077; mkdir -p -- \"$(dirname -- \"$1\")\"; cat > \"$1\"; chmod \"$2\" \"$1\"",
      "sh",
      file,
      mode,
    ],
    { stdin: bytes, label: `stage ${relative}` }
  );
  return file;
}

const BASE_IMAGE_SCRIPT = String.raw`set -eu
ctx="$1"
root="$ctx/rootfs"
mkdir -p "$root/usr/bin" "$root/usr/lib" "$root/etc"
cp -L /usr/bin/python3.13 "$root/usr/bin/python3.13"
ln -s python3.13 "$root/usr/bin/python3"
cp -a /usr/lib/python3.13 "$root/usr/lib/"
deps="$ctx/deps"
{
  ldd /usr/bin/python3.13
  find /usr/lib/python3.13/lib-dynload -type f -name '*.so' -exec ldd {} \;
} | awk '/=> \// {print $3} /^\// {print $1}' | sort -u > "$deps"
while IFS= read -r dep; do
  [ -n "$dep" ] || continue
  mkdir -p "$root$(dirname "$dep")"
  cp -L "$dep" "$root$dep"
done < "$deps"
mkdir -p "$root/lib64"
cp -L /lib64/ld-linux-x86-64.so.2 "$root/lib64/ld-linux-x86-64.so.2"
printf 'root:x:0:0:root:/root:/sbin/nologin\nsynthetic:x:65532:65532:synthetic:/home/synthetic:/sbin/nologin\n' > "$root/etc/passwd"
printf 'root:x:0:\nsynthetic:x:65532:\n' > "$root/etc/group"
printf '%s\n' 'FROM scratch' 'COPY rootfs /' 'ENV PATH=/usr/bin LANG=C.UTF-8' > "$ctx/Containerfile"
`;

const CERTIFICATE_SCRIPT = String.raw`set -eu
dir="$1"
mkdir -p "$dir/newcerts"
touch "$dir/index.txt"
printf '1000\n' > "$dir/serial"
openssl req -x509 -newkey rsa:2048 -nodes -days 2 -subj '/CN=EF Proxy Lab CA' -addext 'basicConstraints=critical,CA:TRUE' -addext 'keyUsage=critical,keyCertSign,cRLSign' -keyout "$dir/lab-ca.key" -out "$dir/lab-ca.crt" >/dev/null 2>&1
valid_sans='DNS:api.synthetic.ef-proxy-lab.invalid,DNS:rebind.synthetic.ef-proxy-lab.invalid,DNS:multi.synthetic.ef-proxy-lab.invalid,DNS:private.synthetic.ef-proxy-lab.invalid,DNS:cname.synthetic.ef-proxy-lab.invalid,DNS:ttl0.synthetic.ef-proxy-lab.invalid,DNS:aaaa.synthetic.ef-proxy-lab.invalid,DNS:mapped.synthetic.ef-proxy-lab.invalid,DNS:nat64.synthetic.ef-proxy-lab.invalid,DNS:redirect.synthetic.ef-proxy-lab.invalid,DNS:oversize.synthetic.ef-proxy-lab.invalid,DNS:slow.synthetic.ef-proxy-lab.invalid,DNS:reflect.synthetic.ef-proxy-lab.invalid,DNS:error.synthetic.ef-proxy-lab.invalid'
openssl req -newkey rsa:2048 -nodes -subj '/CN=api.synthetic.ef-proxy-lab.invalid' -addext "subjectAltName=$valid_sans" -keyout "$dir/valid.key" -out "$dir/valid.csr" >/dev/null 2>&1
printf '[v3]\nbasicConstraints=critical,CA:FALSE\nkeyUsage=critical,digitalSignature,keyEncipherment\nextendedKeyUsage=serverAuth\nsubjectAltName=%s\n' "$valid_sans" > "$dir/valid.ext"
openssl x509 -req -in "$dir/valid.csr" -CA "$dir/lab-ca.crt" -CAkey "$dir/lab-ca.key" -CAcreateserial -days 2 -extfile "$dir/valid.ext" -extensions v3 -out "$dir/valid.crt" >/dev/null 2>&1
openssl req -newkey rsa:2048 -nodes -subj '/CN=wrong.example.invalid' -addext 'subjectAltName=DNS:wrong.example.invalid' -keyout "$dir/wrong-san.key" -out "$dir/wrong-san.csr" >/dev/null 2>&1
printf '[v3]\nbasicConstraints=critical,CA:FALSE\nkeyUsage=critical,digitalSignature,keyEncipherment\nextendedKeyUsage=serverAuth\nsubjectAltName=DNS:wrong.example.invalid\n' > "$dir/wrong-san.ext"
openssl x509 -req -in "$dir/wrong-san.csr" -CA "$dir/lab-ca.crt" -CAkey "$dir/lab-ca.key" -days 2 -extfile "$dir/wrong-san.ext" -extensions v3 -out "$dir/wrong-san.crt" >/dev/null 2>&1
openssl req -x509 -newkey rsa:2048 -nodes -days 2 -subj '/CN=Untrusted EF CA' -addext 'basicConstraints=critical,CA:TRUE' -addext 'keyUsage=critical,keyCertSign,cRLSign' -keyout "$dir/untrusted-ca.key" -out "$dir/untrusted-ca.crt" >/dev/null 2>&1
openssl req -newkey rsa:2048 -nodes -subj '/CN=untrusted.synthetic.ef-proxy-lab.invalid' -addext 'subjectAltName=DNS:untrusted.synthetic.ef-proxy-lab.invalid' -keyout "$dir/untrusted.key" -out "$dir/untrusted.csr" >/dev/null 2>&1
printf '[v3]\nbasicConstraints=critical,CA:FALSE\nkeyUsage=critical,digitalSignature,keyEncipherment\nextendedKeyUsage=serverAuth\nsubjectAltName=DNS:untrusted.synthetic.ef-proxy-lab.invalid\n' > "$dir/untrusted.ext"
openssl x509 -req -in "$dir/untrusted.csr" -CA "$dir/untrusted-ca.crt" -CAkey "$dir/untrusted-ca.key" -CAcreateserial -days 2 -extfile "$dir/untrusted.ext" -extensions v3 -out "$dir/untrusted.crt" >/dev/null 2>&1
openssl req -newkey rsa:2048 -nodes -subj '/CN=expired.synthetic.ef-proxy-lab.invalid' -keyout "$dir/expired.key" -out "$dir/expired.csr" >/dev/null 2>&1
cat > "$dir/ca.cnf" <<EOF
[ca]
default_ca=local
[local]
database=$dir/index.txt
new_certs_dir=$dir/newcerts
certificate=$dir/lab-ca.crt
private_key=$dir/lab-ca.key
serial=$dir/serial
default_md=sha256
policy=policy_any
[policy_any]
commonName=supplied
EOF
printf '[v3]\nbasicConstraints=critical,CA:FALSE\nkeyUsage=critical,digitalSignature,keyEncipherment\nextendedKeyUsage=serverAuth\nsubjectAltName=DNS:expired.synthetic.ef-proxy-lab.invalid\n' > "$dir/expired.ext"
openssl ca -batch -notext -config "$dir/ca.cnf" -in "$dir/expired.csr" -out "$dir/expired.crt" -startdate 20200101000000Z -enddate 20200102000000Z -extfile "$dir/expired.ext" -extensions v3 >/dev/null 2>&1
chmod 0444 "$dir"/*.crt
chmod 0400 "$dir"/*.key
`;

async function buildImage(tag: string, context: string): Promise<void> {
  await runWsl(["podman", "build", "--pull=never", "--network=none", "--format", "oci", "-t", tag, context], {
    label: `build image ${tag}`,
    timeoutMs: 120_000,
  });
}

async function prepareImages(runRoot: string, short: string): Promise<{
  base: string;
  candidate: string;
  relay: string;
  provider: string;
  dns: string;
  certRoot: string;
}> {
  const base = `${PYTHON_BASE}:${short}`;
  const baseContext = `${runRoot}/images/base`;
  await stageFile(runRoot, "images/base/prepare.sh", BASE_IMAGE_SCRIPT, "0500");
  await runWsl(["sh", `${baseContext}/prepare.sh`, baseContext], { label: "prepare local Python runtime image", timeoutMs: 120_000 });
  await buildImage(base, baseContext);
  await runWsl(
    ["podman", "run", "--rm", "--pull=never", "--network=none", "--read-only", base, "python3", "-I", "-S", "-c", "import hashlib,json,socket,ssl;print('ok')"],
    { label: "verify local Python runtime image" }
  );

  const certRoot = `${runRoot}/certs`;
  await stageFile(runRoot, "certs/generate.sh", CERTIFICATE_SCRIPT, "0500");
  await runWsl(["sh", `${certRoot}/generate.sh`, certRoot], { label: "generate local fake TLS certificates", timeoutMs: 60_000 });
  await runWsl(
    [
      "sh",
      "-c",
      "openssl verify -CAfile \"$1/lab-ca.crt\" -verify_hostname api.synthetic.ef-proxy-lab.invalid \"$1/valid.crt\" >/dev/null; ! openssl verify -CAfile \"$1/lab-ca.crt\" -verify_hostname wrong-san.synthetic.ef-proxy-lab.invalid \"$1/wrong-san.crt\" >/dev/null 2>&1; ! openssl verify -CAfile \"$1/lab-ca.crt\" -verify_hostname expired.synthetic.ef-proxy-lab.invalid \"$1/expired.crt\" >/dev/null 2>&1",
      "sh",
      certRoot,
    ],
    { label: "verify fake TLS certificate profiles" }
  );

  const scripts = {
    candidate: await readFile(join(SCRIPT_ROOT, "hostile-candidate.py")),
    relay: await readFile(join(SCRIPT_ROOT, "relay.py")),
    provider: await readFile(join(SCRIPT_ROOT, "fake-provider.py")),
    dns: await readFile(join(SCRIPT_ROOT, "fake-dns.py")),
  };
  const tags = {
    candidate: `localhost/ef-proxy-lab-candidate:${short}`,
    relay: `localhost/ef-proxy-lab-relay:${short}`,
    provider: `localhost/ef-proxy-lab-provider:${short}`,
    dns: `localhost/ef-proxy-lab-dns:${short}`,
  };
  for (const [role, source] of Object.entries(scripts)) {
    const context = `${runRoot}/images/${role}`;
    await stageFile(runRoot, `images/${role}/app.py`, source, "0444");
    const extra = role === "relay" ? "COPY certs/lab-ca.crt /opt/lab/certs/lab-ca.crt\n" : role === "provider" ? "COPY certs /opt/lab/certs\n" : "";
    if (role === "relay") {
      await runWsl(["sh", "-c", "mkdir -p \"$1/certs\"; cp \"$2/lab-ca.crt\" \"$1/certs/lab-ca.crt\"; chmod 0444 \"$1/certs/lab-ca.crt\"", "sh", context, certRoot], { label: "stage relay CA" });
    }
    if (role === "provider") {
      await runWsl(["sh", "-c", "mkdir -p \"$1/certs\"; cp \"$2\"/*.crt \"$2\"/*.key \"$1/certs/\"; chmod 0444 \"$1/certs\"/*.crt \"$1/certs\"/*.key", "sh", context, certRoot], { label: "stage fake provider certificates" });
    }
    const containerfile = `FROM ${base}\nCOPY app.py /opt/lab/app.py\n${extra}ENTRYPOINT [\"/usr/bin/python3\",\"-I\",\"-S\",\"/opt/lab/app.py\"]\n`;
    await stageFile(runRoot, `images/${role}/Containerfile`, containerfile, "0444");
    await buildImage(tags[role as keyof typeof tags], context);
  }
  return { base, ...tags, certRoot };
}

async function localFileHash(file: string): Promise<string> {
  return sha256(await readFile(file));
}

async function runtimeChain(candidateImage: string): Promise<ProxyLabRuntimeChainEntry[]> {
  const systemRoot = process.env.SystemRoot ?? "C:\\Windows";
  const wslSha = await localFileHash(join(systemRoot, "System32", "wsl.exe"));
  const values = (await wslText(
    [
      "sh",
      "-c",
      "printf 'podman=%s\\ncrun=%s\\nseccomp=%s\\nkernel=%s\\nimage=%s\\n' \"$(sha256sum /usr/bin/podman | awk '{print $1}')\" \"$(sha256sum /usr/bin/crun | awk '{print $1}')\" \"$(sha256sum /usr/share/containers/seccomp.json | awk '{print $1}')\" \"$(uname -a | sha256sum | awk '{print $1}')\" \"$(podman image inspect --format '{{.Id}}' \"$1\" | sed 's/^sha256://')\"",
      "sh",
      candidateImage,
    ],
    "fingerprint runtime chain"
  ))
    .split(/\r?\n/)
    .map((line) => line.split("="))
    .reduce<Record<string, string>>((accumulator, [name, value]) => ({ ...accumulator, [name]: value }), {});
  for (const value of Object.values(values)) {
    if (!/^[0-9a-f]{64}$/.test(value)) throw new Error("runtime chain contains a malformed hash");
  }
  return [
    { name: "wsl.exe", sha256: wslSha },
    { name: "podman", sha256: values.podman },
    { name: "crun", sha256: values.crun },
    { name: "seccomp", sha256: values.seccomp },
    { name: "kernel", sha256: values.kernel },
    { name: "image", sha256: values.image },
  ];
}

function manifest(chain: ProxyLabRuntimeChainEntry[], hashes: Record<string, string>): ProxyLabManifestV2 {
  return {
    schemaVersion: 2,
    scope: "provider-free-synthetic-proxy-lab",
    executionAuthorized: false,
    artifactHashes: {
      hostileCandidateSha256: hashes.candidate,
      relaySha256: hashes.relay,
      fakeDnsSha256: hashes.dns,
      fakeProviderSha256: hashes.provider,
    },
    runtimeChain: chain,
    topology: {
      candidateNetworkInternal: true,
      candidateNetworkDnsDisabled: true,
      candidateNetworkNoDefaultRoute: true,
      candidateIpv6Disabled: true,
      candidateHostsFileMinimal: true,
      candidateHttpProxyInheritanceDisabled: true,
      runtimePullPolicy: "never",
      candidateMounts: [],
    },
  };
}

type Scenario = { name: string; hostPrefix: string; port: number; path: string; expectedReason: string };

const SCENARIOS: Scenario[] = [
  { name: "dns-rebind", hostPrefix: "rebind", port: 9443, path: "/v1/fake", expectedReason: "dns_rebind" },
  { name: "dns-multi-private", hostPrefix: "multi", port: 9443, path: "/v1/fake", expectedReason: "dns_ambiguous_or_ipv6" },
  { name: "dns-private-address", hostPrefix: "private", port: 9443, path: "/v1/fake", expectedReason: "dns_address_not_signed" },
  { name: "dns-cname", hostPrefix: "cname", port: 9443, path: "/v1/fake", expectedReason: "dns_ambiguous_or_ipv6" },
  { name: "dns-ttl-zero", hostPrefix: "ttl0", port: 9443, path: "/v1/fake", expectedReason: "dns_ttl_zero" },
  { name: "dns-aaaa", hostPrefix: "aaaa", port: 9443, path: "/v1/fake", expectedReason: "dns_ambiguous_or_ipv6" },
  { name: "dns-ipv4-mapped-ipv6", hostPrefix: "mapped", port: 9443, path: "/v1/fake", expectedReason: "dns_ambiguous_or_ipv6" },
  { name: "dns-nat64-metadata", hostPrefix: "nat64", port: 9443, path: "/v1/fake", expectedReason: "dns_ambiguous_or_ipv6" },
  { name: "tls-wrong-san", hostPrefix: "wrong-san", port: 9444, path: "/v1/fake", expectedReason: "tls_certificate_verification" },
  { name: "tls-untrusted-ca", hostPrefix: "untrusted", port: 9445, path: "/v1/fake", expectedReason: "tls_certificate_verification" },
  { name: "tls-expired", hostPrefix: "expired", port: 9446, path: "/v1/fake", expectedReason: "tls_certificate_verification" },
  { name: "http-redirect", hostPrefix: "redirect", port: 9443, path: "/v1/redirect", expectedReason: "redirect_forbidden" },
  { name: "response-oversize", hostPrefix: "oversize", port: 9443, path: "/v1/oversize", expectedReason: "response_oversize" },
  { name: "response-slow", hostPrefix: "slow", port: 9443, path: "/v1/slow", expectedReason: "transport_timeout" },
  { name: "credential-reflection", hostPrefix: "reflect", port: 9443, path: "/v1/reflect", expectedReason: "credential_reflection" },
  { name: "hostile-error-body", hostPrefix: "error", port: 9443, path: "/v1/error", expectedReason: "upstream_error_redacted" },
];

function policy(scenario: { hostPrefix: string; port: number; path: string }, caSha256: string, routeId: string): ProxyLabPolicyV2 {
  return {
    schemaVersion: 2,
    scope: "provider-free-synthetic-proxy-lab",
    executionAuthorized: false,
    candidateKind: "deterministic-hostile-fixture",
    providerKind: "local-fake-provider",
    killSwitch: { armed: true, tripped: false },
    route: {
      routeId,
      approvedFakeFqdn: `${scenario.hostPrefix}.synthetic.ef-proxy-lab.invalid`,
      relayMethod: "POST",
      relayPath: `/v1/routes/${routeId}`,
      upstreamScheme: "https",
      upstreamPort: scenario.port,
      upstreamMethod: "POST",
      upstreamPath: scenario.path,
      upstreamIpv4: PROVIDER_IP,
      dnsIpv4: DNS_IP,
      dnsPort: 5353,
      tlsCaSha256: caSha256,
      redirects: 0,
    },
    limits: {
      concurrentConnections: 1,
      burstRequests: 2,
      sustainedRequestsPerSecond: 1,
      maxRequests: 30,
      maxHeaderBytes: 32 * 1024,
      maxRequestBodyBytes: 64 * 1024,
      maxResponseBytes: 64 * 1024,
      connectTimeoutMs: 1_000,
      tlsHandshakeTimeoutMs: 1_000,
      firstByteTimeoutMs: 1_000,
      totalRequestTimeoutMs: 3_000,
      syntheticSpendCeilingMicros: 1,
      syntheticTokenCeiling: 1,
    },
  };
}

async function createNetwork(name: string, subnet: string): Promise<void> {
  await runWsl(["podman", "network", "create", "--internal", "--disable-dns", "--subnet", subnet, "-o", "no_default_route=1", name], {
    label: `create network ${name}`,
  });
}

async function startTrustedServices(args: {
  label: string;
  providerNetwork: string;
  dnsName: string;
  providerName: string;
  dnsImage: string;
  providerImage: string;
  fakeCanarySecret: string;
}): Promise<void> {
  const common = [
    "--pull=never", "--network", args.providerNetwork, "--http-proxy=false", "--no-hosts", "--dns", "none",
    "--read-only", "--tmpfs", "/tmp:rw,noexec,nosuid,nodev,size=16777216", "--user", "65532:65532",
    "--cap-drop=ALL", "--security-opt=no-new-privileges", "--security-opt=seccomp=/usr/share/containers/seccomp.json",
    "--memory=256m", "--cpus=0.5", "--pids-limit=64", "--log-driver=none", "--label", args.label,
  ];
  await runWsl(["podman", "run", "-d", "--name", args.dnsName, "--ip", DNS_IP, ...common, "--env", `EF_FAKE_PROVIDER_IP=${PROVIDER_IP}`, args.dnsImage], { label: "start fake DNS" });
  await runWsl(["podman", "run", "-d", "--name", args.providerName, "--ip", PROVIDER_IP, ...common, "--secret", `${args.fakeCanarySecret},type=mount,target=fake-canary,uid=65532,gid=65532,mode=0400`, args.providerImage], { label: "start fake provider" });
}

async function populateAuthorityVolume(runRoot: string, short: string, scenarioIndex: number, volume: string, files: string[]): Promise<void> {
  const staged = `${runRoot}/authority-${scenarioIndex}`;
  for (const file of files) {
    await stageFile(runRoot, `authority-${scenarioIndex}/${file.split(/[\\/]/).pop()!}`, await readFile(file), "0444");
  }
  const loader = `ef-auth-loader-${short}-${scenarioIndex}`;
  await runWsl(["podman", "create", "--name", loader, "-v", `${volume}:/trusted:rw`, `${PYTHON_BASE}:${short}`, "python3", "-c", "pass"], { label: "create authority volume loader" });
  try {
    await runWsl(["podman", "cp", `${staged}/.`, `${loader}:/trusted`], { label: "copy authority attestations into trusted volume" });
  } finally {
    await runWsl(["podman", "rm", loader], { label: "remove authority volume loader" });
  }
}

function validateAudit(raw: string, auditKey: Buffer, expectedReason?: string): { events: number; reasons: string[] } {
  const allowed = new Set([
    "runId", "policyHash", "routeId", "approvedFakeFqdn", "decision", "reason", "statusClass", "requestBytes",
    "responseBytes", "durationMs", "quotaRemaining", "ipResultHash", "sequence", "priorEventHash", "eventHash", "hmacSha256",
  ]);
  let prior = "0".repeat(64);
  let sequence = 0;
  const reasons: string[] = [];
  const lines = raw.trim().split(/\r?\n/).filter(Boolean);
  for (const line of lines) {
    const event = JSON.parse(line) as Record<string, unknown>;
    if (Object.keys(event).some((name) => !allowed.has(name)) || Object.keys(event).length !== allowed.size) {
      throw new Error("audit event contains forbidden or missing fields");
    }
    sequence += 1;
    if (event.sequence !== sequence || event.priorEventHash !== prior) throw new Error("audit sequence or hash chain is broken");
    const signature = event.hmacSha256;
    const eventHash = event.eventHash;
    delete event.hmacSha256;
    const expectedSignature = createHmac("sha256", auditKey).update(proxyLabCanonicalJson(event), "utf8").digest("hex");
    if (typeof signature !== "string" || !timingSafeEqual(Buffer.from(signature, "hex"), Buffer.from(expectedSignature, "hex"))) {
      throw new Error("audit HMAC is invalid");
    }
    delete event.eventHash;
    if (eventHash !== sha256(proxyLabCanonicalJson(event))) throw new Error("audit event hash is invalid");
    prior = eventHash as string;
    reasons.push(event.reason as string);
  }
  if (expectedReason && !reasons.includes(expectedReason)) throw new Error(`audit did not contain expected refusal ${expectedReason}`);
  return { events: lines.length, reasons };
}

async function readAudit(baseImage: string, volume: string): Promise<string> {
  return (
    await runWsl(
      ["podman", "run", "--rm", "--pull=never", "--network=none", "--read-only", "-v", `${volume}:/audit:ro`, baseImage, "python3", "-c", "import pathlib,sys;sys.stdout.buffer.write(pathlib.Path('/audit/events.jsonl').read_bytes())"],
      { label: "read content-free audit", rawLimitBytes: 1024 * 1024 }
    )
  ).stdout.toString("utf8");
}

async function readTransientState(baseImage: string, volume: string): Promise<string> {
  return (
    await runWsl(
      ["podman", "run", "--rm", "--pull=never", "--network=none", "--read-only", "-v", `${volume}:/audit:ro`, baseImage, "python3", "-c", "import pathlib,sys;p=pathlib.Path('/audit/state');sys.stdout.write(p.read_text('ascii') if p.exists() else 'absent')"],
      { label: "read transient relay state" }
    )
  ).stdout.toString("ascii");
}

async function waitForRelay(name: string): Promise<void> {
  for (let attempt = 0; attempt < 30; attempt += 1) {
    try {
      await runWsl(["podman", "exec", name, "python3", "-c", `import pathlib;port=':${RELAY_PORT.toString(16).toUpperCase().padStart(4, "0")}';assert any(port in line and line.split()[3]=='0A' for line in pathlib.Path('/proc/net/tcp').read_text().splitlines())`], { label: "probe relay readiness", timeoutMs: 2_000 });
      return;
    } catch {
      await new Promise((resolveWait) => setTimeout(resolveWait, 100));
    }
  }
  throw new Error("relay did not become ready");
}

async function waitForTrustedServices(relayName: string, providerName: string, dnsName: string): Promise<void> {
  for (let attempt = 0; attempt < 40; attempt += 1) {
    try {
      await runWsl(
        [
          "podman",
          "exec",
          relayName,
          "python3",
          "-c",
          `import socket;[(lambda s:(s.close()))(socket.create_connection(pair,.2)) for pair in [('${PROVIDER_IP}',9443),('${DNS_IP}',5353)]]`,
        ],
        { label: "probe fake DNS and provider readiness", timeoutMs: 2_000 }
      );
      return;
    } catch {
      await new Promise((resolveWait) => setTimeout(resolveWait, 100));
    }
  }
  const providerState = await wslText(["podman", "inspect", "--format", "{{.State.Status}}/{{.State.ExitCode}}", providerName], "inspect fake provider state").catch(() => "missing");
  const dnsState = await wslText(["podman", "inspect", "--format", "{{.State.Status}}/{{.State.ExitCode}}", dnsName], "inspect fake DNS state").catch(() => "missing");
  throw new Error(`trusted lab services not ready; provider ${providerState}; dns ${dnsState}`);
}

async function runCandidate(args: {
  name: string;
  image: string;
  network: string;
  routeId: string;
  mode: "probe" | "single-probe";
  label: string;
  scenario: string;
  privilegedHooks?: ProxyLabPrivilegedHooks;
}): Promise<CommandResult> {
  const command = [
    "podman", args.privilegedHooks ? "create" : "run", "--name", args.name, "--pull=never", "--network", args.network, "--ip", CANDIDATE_IP,
    "--http-proxy=false", "--no-hosts", "--dns", "none", "--sysctl", "net.ipv6.conf.all.disable_ipv6=1",
    "--sysctl", "net.ipv6.conf.default.disable_ipv6=1", "--read-only", "--tmpfs", "/tmp:rw,noexec,nosuid,nodev,size=16777216",
    "--tmpfs", "/home/synthetic:rw,noexec,nosuid,nodev,size=16777216", "--user", "65532:65532", "--cap-drop=ALL",
    "--security-opt=no-new-privileges", "--security-opt=seccomp=/usr/share/containers/seccomp.json", "--memory=256m",
    "--cpus=0.5", "--pids-limit=64", "--log-driver=none", "--label", args.label,
    "--env", `EF_RELAY_IP=${RELAY_CANDIDATE_IP}`, "--env", `EF_RELAY_PORT=${RELAY_PORT}`, "--env", `EF_ROUTE_ID=${args.routeId}`,
    "--env", `EF_CANDIDATE_MODE=${args.mode}`, "--env", "HOME=/home/synthetic", "--env", "PATH=/usr/bin", "--env", "LANG=C.UTF-8",
    ...(args.privilegedHooks ? ["--env", "EF_PRIVILEGED_START_BARRIER=/tmp/ef-privileged-ready"] : []),
    args.image,
  ];
  let pid = 0;
  try {
    if (!args.privilegedHooks) {
      return await runWsl(command, { label: `run hostile synthetic candidate ${args.mode}`, timeoutMs: 30_000, rawLimitBytes: 1024 * 1024 });
    }
    await runWsl(command, { label: `create hostile synthetic candidate ${args.mode}` });
    await runWsl(["podman", "start", args.name], { label: `start barriered hostile synthetic candidate ${args.mode}` });
    pid = Number(await wslText(["podman", "inspect", "--format", "{{.State.Pid}}", args.name], "inspect hostile synthetic candidate PID"));
    if (!Number.isSafeInteger(pid) || pid <= 1) throw new Error("hostile synthetic candidate PID is malformed");
    await args.privilegedHooks.onCandidateReady({ scenario: args.scenario, mode: args.mode, containerName: args.name, pid });
    const attached = runWsl(["podman", "attach", "--no-stdin", args.name], {
      label: `attach hostile synthetic candidate ${args.mode}`,
      timeoutMs: 30_000,
      rawLimitBytes: 1024 * 1024,
    });
    await new Promise((resolveWait) => setTimeout(resolveWait, 100));
    await runWsl(
      ["podman", "exec", args.name, "python3", "-I", "-S", "-c", "import pathlib;pathlib.Path('/tmp/ef-privileged-ready').touch(mode=0o600)"],
      { label: "release root-owned candidate start barrier" }
    );
    return await attached;
  } finally {
    if (args.privilegedHooks && pid > 1) {
      await args.privilegedHooks.onCandidateFinished({ scenario: args.scenario, mode: args.mode, containerName: args.name, pid }).catch(() => undefined);
    }
    await runWsl(["podman", "rm", "-f", "--time", "0", args.name], { label: "remove synthetic candidate container" }).catch(() => undefined);
  }
}

async function runPrivilegedKillSwitchProof(args: {
  name: string;
  image: string;
  network: string;
  routeId: string;
  label: string;
  scenario: string;
  privilegedHooks: ProxyLabPrivilegedHooks;
}): Promise<void> {
  const command = [
    "podman", "create", "--name", args.name, "--pull=never", "--network", args.network, "--ip", CANDIDATE_IP,
    "--http-proxy=false", "--no-hosts", "--dns", "none", "--sysctl", "net.ipv6.conf.all.disable_ipv6=1",
    "--sysctl", "net.ipv6.conf.default.disable_ipv6=1", "--read-only", "--tmpfs", "/tmp:rw,noexec,nosuid,nodev,size=16777216",
    "--tmpfs", "/home/synthetic:rw,noexec,nosuid,nodev,size=16777216", "--user", "65532:65532", "--cap-drop=ALL",
    "--security-opt=no-new-privileges", "--security-opt=seccomp=/usr/share/containers/seccomp.json", "--memory=256m",
    "--cpus=0.5", "--pids-limit=64", "--log-driver=none", "--label", args.label,
    "--env", `EF_RELAY_IP=${RELAY_CANDIDATE_IP}`, "--env", `EF_RELAY_PORT=${RELAY_PORT}`, "--env", `EF_ROUTE_ID=${args.routeId}`,
    "--env", "EF_CANDIDATE_MODE=kill-switch-loop", "--env", "EF_PRIVILEGED_START_BARRIER=/tmp/ef-privileged-ready",
    "--env", "HOME=/home/synthetic", "--env", "PATH=/usr/bin", "--env", "LANG=C.UTF-8", args.image,
  ];
  let pid = 0;
  try {
    await runWsl(command, { label: "create kill-switch hostile fixture" });
    await runWsl(["podman", "start", args.name], { label: "start barriered kill-switch hostile fixture" });
    pid = Number(await wslText(["podman", "inspect", "--format", "{{.State.Pid}}", args.name], "inspect kill-switch fixture PID"));
    if (!Number.isSafeInteger(pid) || pid <= 1) throw new Error("kill-switch fixture PID is malformed");
    await args.privilegedHooks.onCandidateReady({ scenario: args.scenario, mode: "kill-switch-loop", containerName: args.name, pid });
    await runWsl(
      ["podman", "exec", args.name, "python3", "-I", "-S", "-c", "import pathlib;pathlib.Path('/tmp/ef-privileged-ready').touch(mode=0o600)"],
      { label: "release kill-switch fixture start barrier" }
    );
    await new Promise((resolveWait) => setTimeout(resolveWait, 350));
    await args.privilegedHooks.onKillSwitch({ scenario: args.scenario, containerName: args.name, pid });
    await runWsl(["podman", "wait", args.name], { label: "wait for post-block candidate termination", timeoutMs: 10_000 });
  } finally {
    if (pid > 1) {
      await args.privilegedHooks.onCandidateFinished({ scenario: args.scenario, mode: "kill-switch-loop", containerName: args.name, pid }).catch(() => undefined);
    }
    await runWsl(["podman", "rm", "-f", "--time", "0", args.name], { label: "remove kill-switch hostile fixture" }).catch(() => undefined);
  }
}

async function runOrphanKillProof(args: { image: string; network: string; short: string; label: string }): Promise<void> {
  const name = `ef-orphan-${args.short}`;
  await runWsl([
    "podman", "run", "-d", "--name", name, "--pull=never", "--network", args.network, "--ip", CANDIDATE_IP,
    "--http-proxy=false", "--no-hosts", "--dns", "none", "--read-only", "--tmpfs", "/tmp:rw,noexec,nosuid,nodev,size=16777216",
    "--user", "65532:65532", "--cap-drop=ALL", "--security-opt=no-new-privileges", "--memory=256m", "--cpus=0.5",
    "--pids-limit=64", "--log-driver=none", "--label", args.label, "--env", `EF_RELAY_IP=${RELAY_CANDIDATE_IP}`,
    "--env", `EF_RELAY_PORT=${RELAY_PORT}`, "--env", "EF_ROUTE_ID=route-orphan", "--env", "EF_CANDIDATE_MODE=orphan-timeout",
    "--env", "HOME=/home/synthetic", "--env", "PATH=/usr/bin", "--env", "LANG=C.UTF-8", args.image,
  ], { label: "start orphan-process hostile fixture" });
  await new Promise((resolveWait) => setTimeout(resolveWait, 500));
  const pids = (await wslText(["podman", "top", name, "pid"], "capture hostile fixture process tree"))
    .split(/\r?\n/)
    .filter((line) => /^\d+$/.test(line.trim()))
    .map(Number);
  if (pids.length < 2) throw new Error("hostile orphan fixture did not create a process tree");
  await runWsl(["podman", "kill", "--signal", "KILL", name], { label: "kill hostile fixture cgroup" });
  await runWsl(["podman", "wait", name], { label: "wait for hostile fixture cgroup exit" });
  await runWsl(["podman", "rm", name], { label: "remove hostile fixture container" });
  const survivors = await wslText(["sh", "-c", "for pid in \"$@\"; do kill -0 \"$pid\" 2>/dev/null && printf '%s\\n' \"$pid\" || true; done", "sh", ...pids.map(String)], "verify hostile fixture PIDs are gone");
  if (survivors) throw new Error("hostile candidate process survived cgroup kill");
}

async function removeIfExists(kind: "container" | "network" | "volume" | "image" | "secret", names: string[]): Promise<void> {
  for (const name of names.reverse()) {
    const command =
      kind === "container"
        ? ["podman", "rm", "-f", "--time", "0", name]
        : kind === "network"
          ? ["podman", "network", "rm", name]
          : kind === "volume"
            ? ["podman", "volume", "rm", name]
            : kind === "secret"
              ? ["podman", "secret", "rm", name]
              : ["podman", "image", "rm", name];
    await runWsl(command, { label: `cleanup ${kind} ${name}`, timeoutMs: 30_000 }).catch(() => undefined);
  }
}

export async function runProviderFreeProxyLab({
  evidenceDirectory,
  privilegedHooks,
}: {
  evidenceDirectory: string;
  privilegedHooks?: ProxyLabPrivilegedHooks;
}): Promise<ProviderFreeProxyLabEvidence> {
  const runId = randomUUID();
  const short = runId.replaceAll("-", "").slice(0, 10);
  const label = `ef.proxy.lab.run=${runId}`;
  const runRoot = `/home/efrunner/.local/share/endvera-proxy-lab/run-${runId}`;
  const candidateNetwork = `ef-candidate-${short}`;
  const providerNetwork = `ef-provider-${short}`;
  const dnsName = `ef-dns-${short}`;
  const providerName = `ef-provider-${short}`;
  const createdContainers: string[] = [];
  const createdVolumes: string[] = [];
  const createdNetworks: string[] = [];
  const createdImages: string[] = [];
  const createdSecrets: string[] = [];
  const authorityKey = randomBytes(32);
  const auditKey = randomBytes(32);
  const fakeCanary = `EF_FAKE_CANARY_${randomBytes(18).toString("hex")}`;
  const replayLedger = new Set<string>();
  let cleanupVerified = false;
  let images: Awaited<ReturnType<typeof prepareImages>> | undefined;
  let evidenceWithoutFile: Omit<ProviderFreeProxyLabEvidence, "evidenceFile"> | undefined;

  try {
    await runWsl(["sh", "-c", "umask 077; mkdir -p -- \"$1\"", "sh", runRoot], { label: "create disposable proxy-lab root" });
    images = await prepareImages(runRoot, short);
    createdImages.push(images.base, images.candidate, images.relay, images.provider, images.dns);
    const chain = await runtimeChain(images.candidate);
    const hashes = {
      candidate: await localFileHash(join(SCRIPT_ROOT, "hostile-candidate.py")),
      relay: await localFileHash(join(SCRIPT_ROOT, "relay.py")),
      dns: await localFileHash(join(SCRIPT_ROOT, "fake-dns.py")),
      provider: await localFileHash(join(SCRIPT_ROOT, "fake-provider.py")),
    };
    const caSha256 = await wslText(["sha256sum", `${images.certRoot}/lab-ca.crt`], "hash local lab CA").then((value) => value.split(/\s+/)[0]);
    const boundManifest = manifest(chain, hashes);
    await createNetwork(candidateNetwork, "10.241.0.0/24");
    createdNetworks.push(candidateNetwork);
    await createNetwork(providerNetwork, "10.242.0.0/24");
    createdNetworks.push(providerNetwork);
    const authoritySecret = `ef-authority-key-${short}`;
    const auditSecret = `ef-audit-key-${short}`;
    const canarySecret = `ef-fake-canary-${short}`;
    await runWsl(["podman", "secret", "create", authoritySecret, "-"], { stdin: authorityKey, label: "create trusted authority key secret" });
    await runWsl(["podman", "secret", "create", auditSecret, "-"], { stdin: auditKey, label: "create trusted audit key secret" });
    await runWsl(["podman", "secret", "create", canarySecret, "-"], { stdin: fakeCanary, label: "create trusted fake-canary secret" });
    createdSecrets.push(authoritySecret, auditSecret, canarySecret);
    await startTrustedServices({ label, providerNetwork, dnsName, providerName, dnsImage: images.dns, providerImage: images.provider, fakeCanarySecret: canarySecret });
    createdContainers.push(dnsName, providerName);

    const scenarios = [{ name: "main", hostPrefix: "api", port: 9443, path: "/v1/fake", expectedReason: "exact_route_allowed" }, ...SCENARIOS];
    const adversarial: Array<{ name: string; refused: boolean; reason: string }> = [];
    let hostileCandidate: Record<string, boolean> = {};
    let totalAuditEvents = 0;

    for (let index = 0; index < scenarios.length; index += 1) {
      const scenario = scenarios[index];
      const routeId = `route-${scenario.name.replace(/[^a-z0-9]+/g, "-")}-${index}`;
      const scenarioDirectory = await mkdtemp(join(tmpdir(), `ef-proxy-authority-${short}-${index}-`));
      const issuedAt = new Date(Math.floor((Date.now() - 5_000) / 1_000) * 1_000);
      const expiresAt = new Date(issuedAt.getTime() + 5 * 60_000);
      const bundle = await createProxyLabAuthorityBundle({
        directory: scenarioDirectory,
        policy: policy(scenario, caSha256, routeId),
        manifest: boundManifest,
        signingKey: authorityKey,
        runId: randomUUID(),
        runNonce: randomBytes(32).toString("hex"),
        issuedAt,
        expiresAt,
      });
      await verifyProxyLabAuthorityBundle({
        directory: scenarioDirectory,
        authorityFile: bundle.authorityFile,
        signingKey: authorityKey,
        now: new Date(issuedAt.getTime() + 1_000),
        replayLedger,
      });
      await privilegedHooks?.onRouteAuthority({
        scenario: scenario.name,
        routeId,
        providerPort: scenario.port,
        bundle,
        authoritySigningKey: authorityKey,
      });
      const authorityVolume = `ef-authority-${short}-${index}`;
      const auditVolume = `ef-audit-${short}-${index}`;
      await runWsl(["podman", "volume", "create", authorityVolume], { label: "create trusted authority volume" });
      await runWsl(["podman", "volume", "create", auditVolume], { label: "create trusted audit volume" });
      createdVolumes.push(authorityVolume, auditVolume);
      await populateAuthorityVolume(runRoot, short, index, authorityVolume, [bundle.authorityFile, bundle.policyFile, bundle.manifestFile, bundle.runtimeChainFile]);
      await rm(scenarioDirectory, { recursive: true, force: true });

      const relayName = `ef-relay-${short}-${index}`;
      const relayCommon = [
        "podman", "create", "--name", relayName, "--pull=never", "--network", candidateNetwork, "--ip", RELAY_CANDIDATE_IP,
        "--http-proxy=false", "--no-hosts", "--dns", "none", "--read-only", "--tmpfs", "/tmp:rw,noexec,nosuid,nodev,size=16777216",
        "--user", "65532:65532", "--cap-drop=ALL", "--security-opt=no-new-privileges", "--memory=256m", "--cpus=0.5",
        "--pids-limit=64", "--log-driver=none", "--label", label, "-v", `${authorityVolume}:/trusted:ro`, "-v", `${auditVolume}:/audit:rw,U`,
        "--secret", `${authoritySecret},type=mount,target=authority-key,uid=65532,gid=65532,mode=0400`,
        "--secret", `${auditSecret},type=mount,target=audit-key,uid=65532,gid=65532,mode=0400`,
        "--secret", `${canarySecret},type=mount,target=fake-canary,uid=65532,gid=65532,mode=0400`, images.relay,
      ];
      await runWsl(relayCommon, { label: `create relay for ${scenario.name}` });
      createdContainers.push(relayName);
      await runWsl(["podman", "network", "connect", "--ip", RELAY_PROVIDER_IP, providerNetwork, relayName], { label: "connect relay to fake-provider network" });
      await runWsl(["podman", "start", relayName], { label: `start relay for ${scenario.name}` });
      await waitForRelay(relayName);
      await waitForTrustedServices(relayName, providerName, dnsName);
      const relayPid = Number(await wslText(["podman", "inspect", "--format", "{{.State.Pid}}", relayName], "inspect relay PID"));
      if (!Number.isSafeInteger(relayPid) || relayPid <= 1) throw new Error("relay PID is malformed");
      await privilegedHooks?.onRelayReady({
        scenario: scenario.name,
        routeId,
        providerPort: scenario.port,
        containerName: relayName,
        pid: relayPid,
      });

      if (index === 0) {
        const candidateName = `ef-candidate-${short}`;
        const result = await runCandidate({
          name: candidateName,
          image: images.candidate,
          network: candidateNetwork,
          routeId,
          mode: "probe",
          label,
          scenario: scenario.name,
          privilegedHooks,
        });
        const parsed = JSON.parse(result.stdout.toString("utf8")) as Record<string, unknown>;
        if (parsed.redactedFailure) {
          const relayState = await readTransientState(images.base, auditVolume);
          const debugAudit = await readAudit(images.base, auditVolume);
          const lastReason = debugAudit.trim() ? (JSON.parse(debugAudit.trim().split(/\r?\n/).at(-1)!) as { reason: string }).reason : "absent";
          throw new Error(`hostile candidate failed at ${parsed.stage} fixture line ${parsed.line}; relay state ${relayState}; audit reason ${lastReason}`);
        }
        const ignored = new Set(["schemaVersion", "syntheticCandidate", "realCandidateInvocations", "providerCalls"]);
        hostileCandidate = Object.fromEntries(Object.entries(parsed).filter(([name, value]) => !ignored.has(name) && typeof value === "boolean")) as Record<string, boolean>;
        const failedBoundaries = Object.entries(hostileCandidate).filter(([, value]) => !value).map(([name]) => name);
        if (failedBoundaries.length) {
          const debugAudit = await readAudit(images.base, auditVolume);
          const lastReason = debugAudit.trim() ? (JSON.parse(debugAudit.trim().split(/\r?\n/)[0]) as { reason: string }).reason : "absent";
          throw new Error(`hostile candidate found unclosed boundaries: ${failedBoundaries.join(",")}; first audit reason ${lastReason}`);
        }
        if (privilegedHooks) {
          await runPrivilegedKillSwitchProof({
            name: `ef-kill-switch-${short}`,
            image: images.candidate,
            network: candidateNetwork,
            routeId,
            label,
            scenario: scenario.name,
            privilegedHooks,
          });
        }
      } else {
        const candidateName = `ef-probe-${short}-${index}`;
        const result = await runCandidate({
          name: candidateName,
          image: images.candidate,
          network: candidateNetwork,
          routeId,
          mode: "single-probe",
          label,
          scenario: scenario.name,
          privilegedHooks,
        });
        const parsed = JSON.parse(result.stdout.toString("utf8")) as { status: number; genericRefusal: boolean };
        if (parsed.status !== 403 || !parsed.genericRefusal) throw new Error(`adversarial scenario ${scenario.name} did not fail closed`);
      }
      await privilegedHooks?.onRelayFinished({ scenario: scenario.name, containerName: relayName, pid: relayPid });
      await runWsl(["podman", "rm", "-f", "--time", "0", relayName], { label: `stop and remove relay for ${scenario.name}` });
      createdContainers.splice(createdContainers.indexOf(relayName), 1);
      const auditRaw = await readAudit(images.base, auditVolume);
      const validation = validateAudit(auditRaw, auditKey, scenario.expectedReason);
      totalAuditEvents += validation.events;
      if (index > 0) adversarial.push({ name: scenario.name, refused: true, reason: scenario.expectedReason });
      await removeIfExists("volume", [authorityVolume, auditVolume]);
      createdVolumes.splice(createdVolumes.indexOf(authorityVolume), 1);
      createdVolumes.splice(createdVolumes.indexOf(auditVolume), 1);
    }

    await runOrphanKillProof({ image: images.candidate, network: candidateNetwork, short, label });
    if (totalAuditEvents < scenarios.length) throw new Error("content-free audit did not record every scenario");
    evidenceWithoutFile = {
      schemaVersion: 1,
      status: "PROVIDER_FREE_PROXY_LAB_PROVED_WITH_PRIVILEGED_GAP",
      verdict: "NO_GO_ROOT_OWNED_FIREWALL_PROOF_MISSING",
      executionAuthorized: false,
      realCandidateInvocations: 0,
      providerCalls: 0,
      fakeProviderOperations: 6,
      runId,
      authorityV2Verified: true,
      candidateNetworkInternal: true,
      candidateNetworkDnsDisabled: true,
      candidateNetworkNoDefaultRoute: true,
      candidateIpv6Disabled: true,
      credentialBoundaryProved: true,
      contentFreeAuditVerified: true,
      cleanupVerified: true,
      rootOwnedFirewallProved: false,
      runtimeChain: chain,
      hostileCandidate,
      adversarialScenarios: adversarial,
      orphanProcessTreeKilled: true,
    };
  } finally {
    await removeIfExists("container", createdContainers);
    await removeIfExists("network", createdNetworks);
    await removeIfExists("volume", createdVolumes);
    await removeIfExists("image", createdImages);
    await removeIfExists("secret", createdSecrets);
    await runWsl(["sh", "-c", "case \"$1\" in /home/efrunner/.local/share/endvera-proxy-lab/run-*) rm -rf -- \"$1\";; *) exit 91;; esac", "sh", runRoot], { label: "remove disposable proxy-lab root" }).catch(() => undefined);
    const leftovers = await wslText(["podman", "ps", "-a", "--filter", `label=${label}`, "--format", "{{.Names}}"], "verify proxy-lab containers are gone").catch(() => "unknown");
    const rootGone = await wslText(["sh", "-c", "test ! -e \"$1\" && printf gone", "sh", runRoot], "verify disposable proxy-lab root is gone").catch(() => "missing");
    cleanupVerified = leftovers === "" && rootGone === "gone";
    await privilegedHooks?.onLabArtifactsRemoved();
  }

  if (!evidenceWithoutFile || !cleanupVerified) throw new Error("proxy-lab cleanup failed; PASS evidence is quarantined");
  await mkdir(resolve(evidenceDirectory), { recursive: true });
  const evidenceFile = resolve(evidenceDirectory, "provider-free-proxy-lab-evidence-v1.json");
  if (dirname(evidenceFile) !== resolve(evidenceDirectory)) throw new Error("proxy-lab evidence path escaped its directory");
  const evidence: ProviderFreeProxyLabEvidence = { ...evidenceWithoutFile, cleanupVerified: true, evidenceFile };
  const serialized = proxyLabCanonicalJson(evidenceWithoutFile);
  await writeFile(evidenceFile, `${proxyLabCanonicalJson({ schemaVersion: 1, integritySha256: sha256(serialized), evidence: evidenceWithoutFile })}\n`, {
    encoding: "utf8",
    flag: "wx",
  });
  return evidence;
}
