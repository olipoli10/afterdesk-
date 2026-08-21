import { readFile } from "node:fs/promises";
import { join } from "node:path";

import { beforeAll, describe, expect, it } from "vitest";

const root = join(process.cwd(), "tools", "engineering-factory", "proxy-lab");
let controller = "";
let observer = "";
let runner = "";

beforeAll(async () => {
  [controller, observer, runner] = await Promise.all(
    ["privileged-firewall-controller.py", "packet-metadata-observer.py", "privileged-proxy-lab-runner.ts"].map((file) =>
      readFile(join(root, file), "utf8")
    )
  );
});

describe("Engineering Factory privileged firewall and observer source gates", () => {
  it("uses unique root-owned tables with explicit scoped default deny and exact relay/provider routes", () => {
    expect(controller).toContain("ef_priv_");
    expect(controller).toContain("owner_uid == 0");
    expect(controller).toContain("candidate_default_deny");
    expect(controller).toContain("relay_default_deny");
    expect(controller).toContain("10.241.0.2");
    expect(controller).toContain("8443");
    expect(controller).toContain("10.242.0.53");
    expect(controller).toContain("5353");
    expect(controller).toContain("10.242.0.10");
    expect(controller).not.toMatch(/flush\s+ruleset|iptables\s+-F|nft\s+flush\s+ruleset/i);
  });

  it("blocks DNS, IPv6, metadata, host gateway, loopback and all non-relay candidate traffic", () => {
    for (const gate of [
      "candidate_dns_denied",
      "candidate_ipv6_denied",
      "candidate_metadata_denied",
      "candidate_host_gateway_denied",
      "candidate_loopback_denied",
      "candidate_arbitrary_egress_denied",
    ]) {
      expect(controller).toContain(gate);
    }
    expect(controller).toContain("ip6");
    expect(controller).toContain("169.254.169.254");
    expect(controller).toContain("127.0.0.0/8");
  });

  it("keeps the observer outside the rootless runtime and persists metadata only", () => {
    expect(runner).toContain('"-u", "root"');
    expect(`${runner}\n${controller}`).toContain("controlledOutsideRootlessRuntime");
    expect(observer).toContain("socket.AF_PACKET");
    expect(observer).toContain("packetLength");
    expect(observer).toContain("source_class");
    expect(observer).toContain("destination_class");
    expect(observer).not.toMatch(/payload|body|header|query|stringData|cookie|credential/i);
    expect(observer).not.toContain("packet.hex");
    expect(observer).not.toContain("packet.decode");
  });

  it("snapshots before state, traps rollback, deletes only exact lab resources and compares after state", () => {
    expect(controller).toContain("snapshot_state");
    expect(controller).toContain("rollback");
    expect(controller).toContain("signal.SIGTERM");
    expect(controller).toContain("signal.SIGINT");
    expect(controller).toContain("atexit.register");
    expect(controller).toContain('self.before["sha256"]');
    expect(controller).toContain('after["sha256"]');
    expect(controller).toContain("before/after privileged host state drift");
    expect(controller).not.toMatch(/podman\s+(?:system\s+reset|rm\s+-a)|ip\s+-all\s+netns\s+delete/i);
  });

  it("blocks first and only then terminates the candidate", () => {
    const block = controller.indexOf("apply_kill_switch_block");
    const terminate = controller.indexOf("terminate_candidate_after_block");
    expect(block).toBeGreaterThan(0);
    expect(terminate).toBeGreaterThan(block);
    expect(controller).toContain("successful_packets_after_block != 0");
    expect(controller).toContain("candidate_alive_after_block");
  });

  it("contains every mandated named mutation gate", () => {
    for (const name of [
      "root-firewall-table-missing",
      "root-firewall-default-accept",
      "root-firewall-direct-provider-bypass",
      "root-firewall-dns-bypass",
      "root-firewall-ipv6-bypass",
      "root-firewall-metadata-bypass",
      "root-firewall-host-gateway-bypass",
      "root-firewall-candidate-can-edit",
      "observer-inside-rootless-runtime",
      "observer-packet-evidence-omitted",
      "observer-content-capture-enabled",
      "observer-evidence-hash-mismatch",
      "authority-firewall-hash-unbound",
      "authority-observer-hash-unbound",
      "authority-before-after-drift-ignored",
      "kill-switch-terminates-before-block",
      "rollback-rule-leak-accepted",
      "cleanup-observer-process-leak",
    ]) {
      expect(`${controller}\n${runner}`).toContain(name);
    }
  });
});
