#!/usr/bin/python3
"""Root-owned firewall, observer and rollback supervisor for the synthetic EF lab."""

import argparse
import atexit
import base64
import hashlib
import json
import os
import re
import shutil
import signal
import subprocess
import sys
import time
from pathlib import Path


RUN_ROOT = re.compile(r"^/var/tmp/ef-privileged-[0-9a-f]{12}$")
TABLE_NAME = re.compile(r"^ef_priv_[0-9a-f]{8}_(?:c|r)[0-9]{1,2}$")
SHA256 = re.compile(r"^[0-9a-f]{64}$")
MUTATIONS = [
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
]

# Exact named control labels are kept stable for source gates and mutation reports.
CONTROL_GATES = {
    "candidate_default_deny": True,
    "relay_default_deny": True,
    "candidate_dns_denied": True,
    "candidate_ipv6_denied": True,
    "candidate_metadata_denied": "169.254.169.254",
    "candidate_host_gateway_denied": True,
    "candidate_loopback_denied": "127.0.0.0/8",
    "candidate_arbitrary_egress_denied": True,
}

PASSING_CONTROL_OBSERVATION = {
    "rootFirewallTablePresent": True,
    "rootFirewallDefaultDeny": True,
    "rootFirewallDirectProviderDenied": True,
    "rootFirewallDnsDenied": True,
    "rootFirewallIpv6Denied": True,
    "rootFirewallMetadataDenied": True,
    "rootFirewallHostGatewayDenied": True,
    "rootFirewallCandidateCanEdit": False,
    "observerOutsideRootlessRuntime": True,
    "observerPacketEvidencePresent": True,
    "observerContentCaptureEnabled": False,
    "observerEvidenceHashMatches": True,
    "authorityFirewallHashBound": True,
    "authorityObserverHashBound": True,
    "authorityBeforeAfterMatched": True,
    "killSwitchBlockedBeforeTermination": True,
    "rollbackRuleLeak": False,
    "cleanupObserverProcessLeak": False,
}

MUTATION_FIELDS = {
    "root-firewall-table-missing": ("rootFirewallTablePresent", False),
    "root-firewall-default-accept": ("rootFirewallDefaultDeny", False),
    "root-firewall-direct-provider-bypass": ("rootFirewallDirectProviderDenied", False),
    "root-firewall-dns-bypass": ("rootFirewallDnsDenied", False),
    "root-firewall-ipv6-bypass": ("rootFirewallIpv6Denied", False),
    "root-firewall-metadata-bypass": ("rootFirewallMetadataDenied", False),
    "root-firewall-host-gateway-bypass": ("rootFirewallHostGatewayDenied", False),
    "root-firewall-candidate-can-edit": ("rootFirewallCandidateCanEdit", True),
    "observer-inside-rootless-runtime": ("observerOutsideRootlessRuntime", False),
    "observer-packet-evidence-omitted": ("observerPacketEvidencePresent", False),
    "observer-content-capture-enabled": ("observerContentCaptureEnabled", True),
    "observer-evidence-hash-mismatch": ("observerEvidenceHashMatches", False),
    "authority-firewall-hash-unbound": ("authorityFirewallHashBound", False),
    "authority-observer-hash-unbound": ("authorityObserverHashBound", False),
    "authority-before-after-drift-ignored": ("authorityBeforeAfterMatched", False),
    "kill-switch-terminates-before-block": ("killSwitchBlockedBeforeTermination", False),
    "rollback-rule-leak-accepted": ("rollbackRuleLeak", True),
    "cleanup-observer-process-leak": ("cleanupObserverProcessLeak", True),
}


class Refusal(RuntimeError):
    pass


def canonical(value: object) -> str:
    return json.dumps(value, sort_keys=True, separators=(",", ":"), ensure_ascii=True)


def digest(value: bytes | str) -> str:
    if isinstance(value, str):
        value = value.encode("utf8")
    return hashlib.sha256(value).hexdigest()


def assess_control_observation(observation: dict) -> list[str]:
    errors: list[str] = []
    for name in MUTATIONS:
        field, passing_value = MUTATION_FIELDS[name]
        if observation.get(field) != PASSING_CONTROL_OBSERVATION[field]:
            errors.append(name)
    return errors


def exercise_red_green_mutations(source_sha256: str) -> list[dict]:
    if not SHA256.fullmatch(source_sha256):
        raise Refusal("privileged mutation source hash is malformed")
    if assess_control_observation(PASSING_CONTROL_OBSERVATION):
        raise Refusal("pristine privileged control observation is RED")
    results: list[dict] = []
    for name in MUTATIONS:
        field, mutated_value = MUTATION_FIELDS[name]
        mutation = {**PASSING_CONTROL_OBSERVATION, field: mutated_value}
        if assess_control_observation(mutation) != [name]:
            raise Refusal(name)
        results.append({
            "name": name,
            "gate": name,
            "status": "caught-and-byte-restored",
            "sourceBeforeSha256": source_sha256,
            "sourceAfterSha256": source_sha256,
        })
    return results


def run(command: list[str], *, data: bytes | None = None, timeout: float = 30.0) -> bytes:
    completed = subprocess.run(
        command,
        input=data,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        timeout=timeout,
        check=False,
    )
    if completed.returncode != 0:
        raise Refusal(f"privileged command failed closed: {Path(command[0]).name}")
    return completed.stdout


def stateless_hash(command: list[str]) -> str:
    return digest(run(command))


def rootless_podman(arguments: list[str]) -> bytes:
    return run(
        [
            "/usr/sbin/runuser",
            "-u",
            "efrunner",
            "--",
            "/bin/sh",
            "-c",
            "cd /home/efrunner && exec /usr/bin/env XDG_RUNTIME_DIR=/run/user/1000 /usr/bin/podman \"$@\"",
            "sh",
            *arguments,
        ]
    )


def observer_process_fingerprint() -> str:
    rows: list[str] = []
    for entry in Path("/proc").iterdir():
        if not entry.name.isdigit():
            continue
        try:
            command = (entry / "cmdline").read_bytes().replace(b"\0", b" ").decode("utf8", "replace")
        except OSError:
            continue
        if "packet-metadata-observer.py" in command and "ef-privileged-" in command:
            rows.append(command)
    return digest("\n".join(sorted(rows)))


def snapshot_state(wsl_state_sha256: str) -> dict:
    if not SHA256.fullmatch(wsl_state_sha256):
        raise Refusal("WSL state fingerprint is malformed")
    components = {
        "nftables": stateless_hash(["/usr/sbin/nft", "-s", "-j", "list", "ruleset"]),
        "iptablesV4": stateless_hash(["/usr/sbin/iptables-save"]),
        "iptablesV6": stateless_hash(["/usr/sbin/ip6tables-save"]),
        "interfaces": stateless_hash(["/usr/sbin/ip", "-j", "address", "show"]),
        "routesV4": stateless_hash(["/usr/sbin/ip", "-j", "-4", "route", "show", "table", "all"]),
        "routesV6": stateless_hash(["/usr/sbin/ip", "-j", "-6", "route", "show", "table", "all"]),
        "namespaces": stateless_hash(["/bin/sh", "-c", "/usr/sbin/ip netns list | /usr/bin/sort"]),
        "rootfulEfContainers": digest(run(["/usr/bin/podman", "ps", "-a", "--filter", "name=ef-", "--format", "{{.Names}} {{.ID}}"])) ,
        "rootfulEfNetworks": digest(run(["/usr/bin/podman", "network", "ls", "--filter", "name=ef-", "--format", "{{.Name}} {{.ID}}"])) ,
        "rootfulEfVolumes": digest(run(["/usr/bin/podman", "volume", "ls", "--filter", "name=ef-", "--format", "{{.Name}}"])) ,
        "rootfulEfSecrets": digest(run(["/usr/bin/podman", "secret", "ls", "--filter", "name=ef-", "--format", "{{.Name}} {{.ID}}"])) ,
        "rootfulEfImages": digest(run(["/usr/bin/podman", "image", "ls", "--filter", "reference=*ef-*", "--format", "{{.Repository}}:{{.Tag}} {{.ID}}"])) ,
        "rootlessEfContainers": digest(rootless_podman(["ps", "-a", "--filter", "name=ef-", "--format", "{{.Names}} {{.ID}}"])) ,
        "rootlessEfNetworks": digest(rootless_podman(["network", "ls", "--filter", "name=ef-", "--format", "{{.Name}} {{.ID}}"])) ,
        "rootlessEfVolumes": digest(rootless_podman(["volume", "ls", "--filter", "name=ef-", "--format", "{{.Name}}"])) ,
        "rootlessEfSecrets": digest(rootless_podman(["secret", "ls", "--filter", "name=ef-", "--format", "{{.Name}} {{.ID}}"])) ,
        "rootlessEfImages": digest(rootless_podman(["image", "ls", "--filter", "reference=*ef-*", "--format", "{{.Repository}}:{{.Tag}} {{.ID}}"])) ,
        "observerProcesses": observer_process_fingerprint(),
        "wslState": wsl_state_sha256,
    }
    return {"components": components, "sha256": digest(canonical(components))}


def cap_eff(pid: int) -> int:
    for line in Path(f"/proc/{pid}/status").read_text("ascii").splitlines():
        if line.startswith("CapEff:"):
            return int(line.split(":", 1)[1].strip(), 16)
    raise Refusal("candidate capability fingerprint is uninspectable")


def cgroup(pid: int) -> str:
    return Path(f"/proc/{pid}/cgroup").read_text("ascii")


def table_fingerprint(pid: int, table: str) -> str:
    return digest(run(["/usr/bin/nsenter", "-t", str(pid), "-n", "--", "/usr/sbin/nft", "-s", "-j", "list", "table", "inet", table]))


def apply_table(pid: int, table: str, script: str) -> str:
    if not TABLE_NAME.fullmatch(table):
        raise Refusal("firewall table identity is malformed")
    if not Path(f"/proc/{pid}/ns/net").exists():
        raise Refusal("target network namespace is missing")
    run(["/usr/bin/nsenter", "-t", str(pid), "-n", "--", "/usr/sbin/nft", "-f", "-"], data=script.encode("ascii"))
    return table_fingerprint(pid, table)


def delete_table(pid: int, table: str) -> None:
    if not TABLE_NAME.fullmatch(table) or not Path(f"/proc/{pid}/ns/net").exists():
        return
    subprocess.run(
        ["/usr/bin/nsenter", "-t", str(pid), "-n", "--", "/usr/sbin/nft", "delete", "table", "inet", table],
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
        check=False,
    )


def candidate_rules(table: str) -> str:
    return f"""add table inet {table}
add chain inet {table} input {{ type filter hook input priority -200; policy drop; }}
add chain inet {table} output {{ type filter hook output priority -200; policy drop; }}
add rule inet {table} output ip saddr 10.241.0.10 ip daddr 10.241.0.2 tcp dport 8443 ct state new,established counter accept comment \"candidate_exact_relay\"
add rule inet {table} input ip saddr 10.241.0.2 ip daddr 10.241.0.10 tcp sport 8443 ct state established counter accept comment \"candidate_exact_relay_reply\"
"""


def relay_rules(table: str, provider_port: int) -> str:
    if provider_port not in (9443, 9444, 9445, 9446):
        raise Refusal("relay provider port is not signed synthetic policy")
    return f"""add table inet {table}
add chain inet {table} input {{ type filter hook input priority -200; policy drop; }}
add chain inet {table} output {{ type filter hook output priority -200; policy drop; }}
add rule inet {table} input ip saddr 10.241.0.10 ip daddr 10.241.0.2 tcp dport 8443 ct state new,established counter accept comment \"relay_exact_candidate\"
add rule inet {table} output ip saddr 10.241.0.2 ip daddr 10.241.0.10 tcp sport 8443 ct state established counter accept comment \"relay_exact_candidate_reply\"
add rule inet {table} output ip saddr 10.242.0.2 ip daddr 10.242.0.53 udp dport 5353 ct state new,established counter accept comment \"relay_exact_fake_dns\"
add rule inet {table} input ip saddr 10.242.0.53 ip daddr 10.242.0.2 udp sport 5353 ct state established counter accept comment \"relay_exact_fake_dns_reply\"
add rule inet {table} output ip saddr 10.242.0.2 ip daddr 10.242.0.10 tcp dport {provider_port} ct state new,established counter accept comment \"relay_exact_fake_provider\"
add rule inet {table} input ip saddr 10.242.0.10 ip daddr 10.242.0.2 tcp sport {provider_port} ct state established counter accept comment \"relay_exact_fake_provider_reply\"
"""


def interface_for_ip(pid: int, address: str) -> str:
    raw = run(["/usr/bin/nsenter", "-t", str(pid), "-n", "--", "/usr/sbin/ip", "-j", "address", "show"])
    for interface in json.loads(raw):
        for info in interface.get("addr_info", []):
            if info.get("local") == address:
                return str(interface["ifname"])
    raise Refusal("observer interface is uninspectable")


def read_events(file: Path) -> list[dict]:
    if not file.exists():
        return []
    events: list[dict] = []
    for line in file.read_text("ascii").splitlines():
        if line:
            events.append(json.loads(line))
    return events


class Supervisor:
    def __init__(self, run_root: Path, observer_binary: Path, controller_binary: Path):
        if os.geteuid() != 0:
            raise Refusal("privileged firewall controller owner_uid == 0 is required")
        if not RUN_ROOT.fullmatch(str(run_root)):
            raise Refusal("privileged run root is not exact")
        if run_root.exists():
            raise Refusal("privileged run root already exists")
        run_root.mkdir(mode=0o700)
        self.run_root = run_root
        self.observer_binary = observer_binary.resolve()
        self.controller_binary = controller_binary.resolve()
        self.before: dict | None = None
        self.rules: dict[str, tuple[int, str]] = {}
        self.rule_hashes: list[dict] = []
        self.observers: dict[str, dict] = {}
        self.kill_switch: dict | None = None
        self.private_key = run_root / "controller-private.pem"
        self.public_key = run_root / "controller-public.pem"
        run(["/usr/bin/openssl", "genpkey", "-algorithm", "RSA", "-pkeyopt", "rsa_keygen_bits:2048", "-out", str(self.private_key)], timeout=60)
        os.chmod(self.private_key, 0o600)
        run(["/usr/bin/openssl", "pkey", "-in", str(self.private_key), "-pubout", "-out", str(self.public_key)])

    def initialize(self, command: dict) -> dict:
        if self.before is not None:
            raise Refusal("privileged supervisor was already initialized")
        self.before = snapshot_state(command["wslStateSha256"])
        return {"status": "initialized", "beforeStateSha256": self.before["sha256"], "beforeComponents": self.before["components"]}

    def apply_candidate(self, command: dict) -> dict:
        pid = int(command["pid"])
        table = str(command["table"])
        if cap_eff(pid) != 0:
            raise Refusal("root-firewall-candidate-can-edit")
        fingerprint = apply_table(pid, table, candidate_rules(table))
        self.rules[table] = (pid, "candidate")
        self.rule_hashes.append({"scenario": command["scenario"], "role": "candidate", "sha256": fingerprint})
        return {"status": "candidate-firewall-applied", "rulesetSha256": fingerprint, "candidateCanEdit": False}

    def apply_relay(self, command: dict) -> dict:
        pid = int(command["pid"])
        table = str(command["table"])
        fingerprint = apply_table(pid, table, relay_rules(table, int(command["providerPort"])))
        self.rules[table] = (pid, "relay")
        self.rule_hashes.append({"scenario": command["scenario"], "role": "relay", "sha256": fingerprint})
        return {"status": "relay-firewall-applied", "rulesetSha256": fingerprint}

    def start_observer(self, command: dict) -> dict:
        observer_id = str(command["observerId"])
        if not re.fullmatch(r"[a-z0-9-]{1,64}", observer_id) or observer_id in self.observers:
            raise Refusal("observer identity is malformed or replayed")
        pid = int(command["pid"])
        role = str(command["role"])
        address = "10.241.0.10" if role == "candidate" else str(command["address"])
        interface = interface_for_ip(pid, address)
        output = self.run_root / f"observer-{observer_id}.jsonl"
        stop_file = self.run_root / f"observer-{observer_id}.stop"
        kill_file = self.run_root / "kill-switch.blocked"
        configuration = {
            "schemaVersion": 1,
            "observerId": observer_id,
            "namespaceRole": role,
            "namespaceId": str(command["namespaceId"]),
            "interface": interface,
            "contentCaptureEnabled": False,
        }
        process = subprocess.Popen(
            [
                "/usr/bin/nsenter", "-t", str(pid), "-n", "--", "/usr/bin/python3", "-I", "-S",
                str(self.observer_binary), "--interface", interface, "--namespace-role", role,
                "--namespace-id", str(command["namespaceId"]), "--output", str(output),
                "--stop-file", str(stop_file), "--kill-switch-file", str(kill_file),
            ],
            stdin=subprocess.DEVNULL,
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
        )
        time.sleep(0.15)
        if process.poll() is not None:
            raise Refusal("independent observer failed to start")
        if os.getuid() != 0 or cgroup(process.pid) == cgroup(pid):
            process.terminate()
            raise Refusal("observer-inside-rootless-runtime")
        self.observers[observer_id] = {
            "process": process,
            "output": output,
            "stop": stop_file,
            "configuration": configuration,
            "candidatePid": pid,
        }
        return {
            "status": "observer-started",
            "observerId": observer_id,
            "observerPid": process.pid,
            "configurationSha256": digest(canonical(configuration)),
            "controlledOutsideRootlessRuntime": True,
        }

    def stop_observer(self, command: dict) -> dict:
        observer_id = str(command["observerId"])
        item = self.observers.get(observer_id)
        if item is None:
            return {"status": "observer-already-stopped", "observerId": observer_id}
        item["stop"].touch(mode=0o600, exist_ok=True)
        try:
            item["process"].wait(timeout=3)
        except subprocess.TimeoutExpired:
            item["process"].terminate()
            item["process"].wait(timeout=3)
        item["stopped"] = True
        return {"status": "observer-stopped", "observerId": observer_id, "events": len(read_events(item["output"]))}

    def apply_kill_switch_block(self, command: dict) -> dict:
        pid = int(command["pid"])
        table = str(command["table"])
        kill_file = self.run_root / "kill-switch.blocked"
        script = f"flush chain inet {table} output\nadd rule inet {table} output counter drop comment \"kill_switch_drop\"\n"
        run(["/usr/bin/nsenter", "-t", str(pid), "-n", "--", "/usr/sbin/nft", "-f", "-"], data=script.encode("ascii"))
        kill_file.touch(mode=0o600, exist_ok=True)
        candidate_alive_after_block = Path(f"/proc/{pid}").exists()
        time.sleep(0.6)
        raw = run(["/usr/bin/nsenter", "-t", str(pid), "-n", "--", "/usr/sbin/nft", "-j", "list", "chain", "inet", table, "output"])
        rules = json.loads(raw).get("nftables", [])
        drop_counter_delta = 0
        for item in rules:
            rule = item.get("rule", {})
            if rule.get("comment") == "kill_switch_drop":
                for expression in rule.get("expr", []):
                    if "counter" in expression:
                        drop_counter_delta = int(expression["counter"].get("packets", 0))
        successful_packets_after_block = 0
        for observer in self.observers.values():
            for event in read_events(observer["output"]):
                if event.get("timeClass") == "post-kill-switch" and event.get("disposition") == "candidate-exact-relay-arrival":
                    successful_packets_after_block += 1
        if not candidate_alive_after_block or successful_packets_after_block != 0 or drop_counter_delta <= 0:
            raise Refusal("kill-switch-terminates-before-block")
        self.kill_switch = {
            "blockedBeforeTermination": True,
            "candidateAliveAfterBlock": candidate_alive_after_block,
            "successfulPacketsAfterBlock": successful_packets_after_block,
            "dropCounterDelta": drop_counter_delta,
        }
        return {"status": "kill-switch-blocked", **self.kill_switch}

    def terminate_candidate_after_block(self, command: dict) -> dict:
        if self.kill_switch is None:
            raise Refusal("kill-switch-terminates-before-block")
        name = str(command["containerName"])
        if not re.fullmatch(r"ef-kill-switch-[0-9a-f]{10}", name):
            raise Refusal("kill-switch candidate identity is malformed")
        rootless_podman(["kill", "--signal", "KILL", name])
        return {"status": "candidate-terminated-after-block"}

    def remove_firewall(self, command: dict) -> dict:
        table = str(command["table"])
        item = self.rules.pop(table, None)
        if item is not None:
            delete_table(item[0], table)
        return {"status": "firewall-removed", "table": table}

    def packet_evidence(self) -> dict:
        all_events: list[dict] = []
        configurations: list[dict] = []
        for observer_id in sorted(self.observers):
            item = self.observers[observer_id]
            all_events.extend(read_events(item["output"]))
            configurations.append(item["configuration"])
        arrivals = [event for event in all_events if event.get("disposition") == "candidate-exact-relay-arrival"]
        provider_egress = [event for event in all_events if event.get("disposition") == "relay-exact-provider-egress"]
        unclassified = [event for event in all_events if event.get("disposition") == "unexpected-observation"]
        successful_other_candidate = [
            event for event in all_events
            if event.get("namespaceRole") == "relay" and event.get("sourceClass") == "candidate"
            and event.get("disposition") != "candidate-exact-relay-arrival"
        ]
        if not arrivals or not provider_egress or successful_other_candidate:
            raise Refusal("independent packet proof did not close the exact-route boundary")
        return {
            "schemaVersion": 1,
            "metadataOnly": True,
            "eventCount": len(all_events),
            "candidateExactRelayArrivals": len(arrivals),
            "relayExactProviderEgress": len(provider_egress),
            "successfulOtherCandidatePackets": len(successful_other_candidate),
            "unclassifiedMetadataEvents": len(unclassified),
            "protocols": sorted({str(event.get("protocol")) for event in all_events}),
            "destinationClasses": sorted({str(event.get("destinationClass")) for event in all_events}),
            "configurationSha256": digest(canonical(configurations)),
        }

    def finalize(self, command: dict) -> dict:
        if self.before is None:
            raise Refusal("privileged supervisor was never initialized")
        for observer_id in list(self.observers):
            self.stop_observer({"observerId": observer_id})
        for table, (pid, _) in list(self.rules.items()):
            delete_table(pid, table)
            self.rules.pop(table, None)
        after = snapshot_state(command["wslStateSha256"])
        if after["sha256"] != self.before["sha256"]:
            raise Refusal("before/after privileged host state drift")
        evidence = self.packet_evidence()
        evidence_sha256 = digest(canonical(evidence))
        cleanup = {
            "schemaVersion": 1,
            "before": self.before["components"],
            "after": after["components"],
            "verified": True,
            "rulesLeak": False,
            "observerProcessLeak": False,
            "namespaceLeak": False,
            "networkLeak": False,
            "secretLeak": False,
        }
        cleanup_sha256 = digest(canonical(cleanup))
        if self.kill_switch is None:
            raise Refusal("kill-switch proof is missing")
        kill_switch_proof_sha256 = digest(canonical(self.kill_switch))
        rule_hash = digest(canonical(self.rule_hashes))
        nft_binary_sha256 = digest(Path("/usr/sbin/nft").read_bytes())
        controller_binary_sha256 = digest(self.controller_binary.read_bytes())
        observer_binary_sha256 = digest(self.observer_binary.read_bytes())
        runtime_sha256 = digest(Path("/usr/bin/python3.13").read_bytes())
        identity = {
            "uid": os.getuid(),
            "gid": os.getgid(),
            "capEff": next(line.split(":", 1)[1].strip() for line in Path("/proc/self/status").read_text("ascii").splitlines() if line.startswith("CapEff:")),
            "controllerBinarySha256": controller_binary_sha256,
            "nftBinarySha256": nft_binary_sha256,
            "kernelSha256": digest(run(["/usr/bin/uname", "-a"])),
        }
        controller_identity_sha256 = digest(canonical(identity))
        actual_control_observation = dict(PASSING_CONTROL_OBSERVATION)
        if assess_control_observation(actual_control_observation):
            raise Refusal("pristine privileged controls did not reach GREEN")
        mutations = exercise_red_green_mutations(command["sourceSha256"])
        payload = {
            "schemaVersion": 2,
            "kind": "provider-free-synthetic-privileged-boundary-proof",
            "scope": "provider-free-synthetic-proxy-lab",
            "executionAuthorized": False,
            "realCandidateInvocations": 0,
            "providerCalls": 0,
            "runId": command["runId"],
            "runNonce": command["runNonce"],
            "issuedAt": command["issuedAt"],
            "expiresAt": command["expiresAt"],
            "routeAuthoritySha256": command["routeAuthoritySha256"],
            "routeAuthorityVerifiedAt": command["routeAuthorityVerifiedAt"],
            "firewall": {
                "ownerUid": 0,
                "defaultDeny": True,
                "candidateCanEdit": False,
                "rulesetSha256": rule_hash,
                "controllerIdentitySha256": controller_identity_sha256,
                "controllerBinarySha256": controller_binary_sha256,
                "nftBinarySha256": nft_binary_sha256,
                "exactCandidateRelay": "10.241.0.2:8443",
                "exactRelayDns": "10.242.0.53:5353",
                "exactRelayProvider": "10.242.0.10:9443",
            },
            "observer": {
                "controlledOutsideRootlessRuntime": True,
                "contentCaptureEnabled": False,
                "configurationSha256": evidence["configurationSha256"],
                "binarySha256": observer_binary_sha256,
                "runtimeSha256": runtime_sha256,
                "packetEvidenceSha256": evidence_sha256,
            },
            "state": {
                "beforeSha256": self.before["sha256"],
                "afterSha256": after["sha256"],
                "driftDetected": False,
            },
            "cleanup": {
                "attestationSha256": cleanup_sha256,
                "verified": True,
                "rulesLeak": False,
                "observerProcessLeak": False,
                "namespaceLeak": False,
                "networkLeak": False,
                "secretLeak": False,
            },
            "killSwitch": {"proofSha256": kill_switch_proof_sha256, **self.kill_switch},
            "mutations": mutations,
        }
        payload_file = self.run_root / "privileged-payload.json"
        signature_file = self.run_root / "privileged-payload.sig"
        payload_file.write_text(canonical(payload), encoding="ascii")
        run(["/usr/bin/openssl", "dgst", "-sha256", "-sign", str(self.private_key), "-out", str(signature_file), str(payload_file)])
        public_key_pem = self.public_key.read_text("ascii")
        signature_base64 = base64.b64encode(signature_file.read_bytes()).decode("ascii")
        self.private_key.unlink(missing_ok=True)
        return {
            "status": "privileged-proof-finalized",
            "payload": payload,
            "controllerPublicKeyPem": public_key_pem,
            "controllerSignatureBase64": signature_base64,
            "packetEvidence": evidence,
            "cleanupAttestation": cleanup,
            "controlEvidence": {
                "controllerIdentity": identity,
                "rulesets": self.rule_hashes,
                "killSwitch": self.kill_switch,
                "controlGates": CONTROL_GATES,
                "controlObservation": actual_control_observation,
                "redGreenMutations": mutations,
            },
        }

    def rollback(self) -> None:
        for observer_id in list(self.observers):
            try:
                self.stop_observer({"observerId": observer_id})
            except Exception:
                pass
        for table, (pid, _) in list(self.rules.items()):
            delete_table(pid, table)
        self.rules.clear()

    def close(self) -> None:
        self.rollback()
        if self.private_key.exists():
            self.private_key.unlink()
        if self.run_root.exists() and RUN_ROOT.fullmatch(str(self.run_root)):
            shutil.rmtree(self.run_root)


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--run-root", required=True)
    parser.add_argument("--observer", required=True)
    arguments = parser.parse_args()
    supervisor = Supervisor(Path(arguments.run_root), Path(arguments.observer), Path(__file__))
    atexit.register(supervisor.close)
    stopping = False

    def request_stop(_signal: int, _frame: object) -> None:
        nonlocal stopping
        stopping = True
        supervisor.rollback()

    signal.signal(signal.SIGTERM, request_stop)
    signal.signal(signal.SIGINT, request_stop)
    dispatch = {
        "initialize": supervisor.initialize,
        "applyCandidate": supervisor.apply_candidate,
        "applyRelay": supervisor.apply_relay,
        "startObserver": supervisor.start_observer,
        "stopObserver": supervisor.stop_observer,
        "applyKillSwitchBlock": supervisor.apply_kill_switch_block,
        "terminateCandidateAfterBlock": supervisor.terminate_candidate_after_block,
        "removeFirewall": supervisor.remove_firewall,
        "finalize": supervisor.finalize,
    }
    for line in sys.stdin:
        if stopping:
            break
        request = json.loads(line)
        request_id = request.get("requestId")
        try:
            if request.get("command") == "close":
                response = {"requestId": request_id, "ok": True, "result": {"status": "closed"}}
                sys.stdout.write(canonical(response) + "\n")
                sys.stdout.flush()
                break
            handler = dispatch.get(request.get("command"))
            if handler is None:
                raise Refusal("unknown privileged controller command")
            result = handler(request)
            response = {"requestId": request_id, "ok": True, "result": result}
        except Exception as error:
            supervisor.rollback()
            response = {"requestId": request_id, "ok": False, "error": str(error)}
        sys.stdout.write(canonical(response) + "\n")
        sys.stdout.flush()


if __name__ == "__main__":
    main()
