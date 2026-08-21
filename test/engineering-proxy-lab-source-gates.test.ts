import { readFile } from "node:fs/promises";
import { join } from "node:path";

import { beforeAll, describe, expect, it } from "vitest";

const root = join(process.cwd(), "tools", "engineering-factory", "proxy-lab");
let runner = "";
let relay = "";
let candidate = "";
let fakeDns = "";
let fakeProvider = "";

beforeAll(async () => {
  [runner, relay, candidate, fakeDns, fakeProvider] = await Promise.all(
    ["proxy-lab-runner.ts", "relay.py", "hostile-candidate.py", "fake-dns.py", "fake-provider.py"].map((file) =>
      readFile(join(root, file), "utf8")
    )
  );
});

describe("Engineering Factory proxy-lab source gates R1-R8", () => {
  it("R1 rejects host mounts, WSL surfaces, runtime sockets and symlink escapes", () => {
    const candidateInvocation = runner.slice(runner.indexOf("async function runCandidate"), runner.indexOf("async function runOrphanKillProof"));
    expect(candidateInvocation).not.toContain('"-v"');
    expect(candidateInvocation).toContain('"--no-hosts"');
    expect(candidateInvocation).toContain('"--read-only"');
    expect(candidate).toMatch(/\/run\/WSL\/2_interop|\/mnt\/wsl|\/mnt\/wslg/);
    expect(candidate).toContain('Path("/tmp/escape").symlink_to("/mnt/c")');
    expect(candidate).toContain('"forbiddenMountsAbsent"');
  });

  it("R2 enforces non-root privilege controls and kill-wait-reap proof", () => {
    const candidateInvocation = runner.slice(runner.indexOf("async function runCandidate"), runner.indexOf("async function runOrphanKillProof"));
    expect(candidateInvocation).toContain('"--user", "65532:65532"');
    expect(candidateInvocation).toContain('"--cap-drop=ALL"');
    expect(candidateInvocation).not.toContain('"--cap-add=NET_RAW"');
    expect(candidateInvocation).toContain('"--security-opt=no-new-privileges"');
    expect(candidateInvocation).toContain('"--pids-limit=64"');
    expect(runner).toContain('["podman", "kill", "--signal", "KILL", name]');
    expect(runner).toContain('["podman", "wait", name]');
    expect(runner).toContain("hostile candidate process survived cgroup kill");
    expect(candidate).toContain("SOCK_RAW");
  });

  it("R3 builds two internal no-default-route networks and probes direct bypasses", () => {
    expect(runner).toContain('"--internal", "--disable-dns"');
    expect(runner).toContain('"no_default_route=1"');
    expect(runner).toContain('"--network", candidateNetwork');
    expect(runner).toContain('"connect", "--ip", RELAY_PROVIDER_IP, providerNetwork');
    expect(candidate).toContain('"directInternetDenied"');
    expect(candidate).toContain('"directProviderIpDenied"');
    expect(candidate).toContain('"hostGatewayDenied"');
    expect(candidate).toContain('"subprocessDirectSocketDenied"');
  });

  it("R4 disables candidate DNS and IPv6 while exercising hostile DNS answers", () => {
    expect(runner).toContain('"--dns", "none"');
    expect(runner).toContain('"net.ipv6.conf.all.disable_ipv6=1"');
    expect(runner).toContain('"net.ipv6.conf.default.disable_ipv6=1"');
    for (const profile of ["rebind", "multi", "private", "cname", "ttl0", "aaaa", "mapped", "nat64"]) {
      expect(fakeDns).toContain(`profile == "${profile}"`);
    }
    expect(candidate).toContain('"alternateDnsUdp53Denied"');
    expect(candidate).toContain('"alternateDnsTcp53Denied"');
  });

  it("R5 keeps exact HTTPS/SNI/TLS semantics and zero redirects or upgrades", () => {
    expect(relay).toContain('context.minimum_version = ssl.TLSVersion.TLSv1_2');
    expect(relay).toContain('server_hostname=ROUTE["approvedFakeFqdn"]');
    expect(relay).toContain('raise Refusal("redirect_forbidden")');
    expect(relay).toContain('raise Refusal("upgrade_forbidden")');
    expect(relay).toContain('raise Refusal("absolute_or_ambiguous_target")');
    expect(runner).toContain('"tls-wrong-san"');
    expect(runner).toContain('"tls-untrusted-ca"');
    expect(runner).toContain('"tls-expired"');
  });

  it("R6 keeps the fake credential in trusted secret mounts and reconstructs auth headers", () => {
    expect(relay).toContain('Path("/run/secrets/fake-canary")');
    expect(fakeProvider).toContain('open("/run/secrets/fake-canary"');
    expect(runner).toContain('type=mount,target=fake-canary');
    expect(runner).not.toMatch(/--env.*EF_FAKE_CANARY/);
    expect(relay).toContain('f\'Authorization: Bearer {FAKE_CANARY}\\r\\n\'');
    expect(relay).toContain('"Content-Type: application/json\\r\\n"');
    expect(relay).toContain('"Connection: close\\r\\n\\r\\n"');
    expect(relay).toContain('raise Refusal("credential_reflection")');
    expect(fakeProvider).toContain('"proxy-authorization", "cookie", "x-api-key", "x-auth-token"');
  });

  it("R7 forbids inherited proxy/bootstrap/update paths and runtime pulls", () => {
    const candidateInvocation = runner.slice(runner.indexOf("async function runCandidate"), runner.indexOf("async function runOrphanKillProof"));
    expect(runner.match(/"--pull=never"/g)?.length).toBeGreaterThan(5);
    expect(runner.match(/"--http-proxy=false"/g)?.length).toBeGreaterThan(3);
    expect(candidateInvocation).toContain('"--pull=never"');
    expect(candidateInvocation).toContain('"--http-proxy=false"');
    expect(candidateInvocation).not.toContain('"--http-proxy=true"');
    expect(runner).toContain('"--network=none"');
    expect(candidate).toContain('"proxyEnvironmentAbsent"');
    expect(candidate).toContain('"packageBootstrapUnavailable"');
    expect(candidate).toContain('"dohDenied"');
    expect(candidate).toContain('"dotDenied"');
  });

  it("R8 signs a fixed content-free audit and quarantines incomplete cleanup", () => {
    expect(relay).toContain('os.O_WRONLY | os.O_CREAT | os.O_APPEND');
    expect(relay).toContain('"priorEventHash": prior_event_hash');
    expect(relay).toContain('event["hmacSha256"]');
    expect(relay).not.toMatch(/event\[.*(?:body|header|query|cookie|credential|stdout|stderr)/i);
    expect(runner).toContain("audit sequence or hash chain is broken");
    expect(runner).toContain("audit HMAC is invalid");
    expect(runner).toContain("proxy-lab cleanup failed; PASS evidence is quarantined");
    expect(relay).toContain('policy["killSwitch"] != {"armed": True, "tripped": False}');
  });
});
