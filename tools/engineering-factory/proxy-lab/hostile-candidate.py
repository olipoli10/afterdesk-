#!/usr/bin/python3
"""Deterministic hostile fixture. Never imports a provider SDK or model client."""

import json
import os
import socket
import subprocess
import sys
import time
from pathlib import Path

RELAY_IP = os.environ["EF_RELAY_IP"]
RELAY_PORT = int(os.environ["EF_RELAY_PORT"])
ROUTE_ID = os.environ["EF_ROUTE_ID"]
MODE = os.environ.get("EF_CANDIDATE_MODE", "probe")
CURRENT_STAGE = "startup"


START_BARRIER = os.environ.get("EF_PRIVILEGED_START_BARRIER")
if START_BARRIER:
    deadline = time.monotonic() + 10
    while not Path(START_BARRIER).exists():
        if time.monotonic() >= deadline:
            raise RuntimeError("privileged start barrier was not released")
        time.sleep(0.02)


def redacted_excepthook(error_type, _error, traceback) -> None:
    last = traceback
    while last.tb_next is not None:
        last = last.tb_next
    sys.stdout.write(json.dumps({"redactedFailure": error_type.__name__, "line": last.tb_lineno, "stage": CURRENT_STAGE}, sort_keys=True, separators=(",", ":")) + "\n")
    sys.stdout.flush()
    os._exit(0)


sys.excepthook = redacted_excepthook


def tcp_open(address: str, port: int, timeout: float = 0.35) -> bool:
    try:
        sock = socket.create_connection((address, port), timeout)
        sock.close()
        return True
    except OSError:
        return False


def udp_reachable(address: str, port: int) -> bool:
    try:
        sock = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        sock.settimeout(0.25)
        sock.sendto(b"\x12\x34dns-bypass", (address, port))
        sock.recvfrom(64)
        sock.close()
        return True
    except OSError:
        return False


def request(method: str, target: str, headers: list[tuple[str, str]], body: bytes = b"{}") -> tuple[int, bytes]:
    sock = socket.create_connection((RELAY_IP, RELAY_PORT), 2)
    sock.settimeout(10)
    serialized = (
        f"{method} {target} HTTP/1.1\r\n"
        f"Host: relay.synthetic.ef-proxy-lab.invalid:{RELAY_PORT}\r\n"
        + "".join(f"{name}: {value}\r\n" for name, value in headers)
        + f"Content-Length: {len(body)}\r\nConnection: close\r\n\r\n"
    ).encode("ascii") + body
    sock.sendall(serialized)
    data = b""
    while True:
        chunk = sock.recv(4096)
        if not chunk:
            break
        data += chunk
    sock.close()
    head, response_body = data.split(b"\r\n\r\n", 1)
    status = int(head.split(b" ", 2)[1])
    return status, response_body


if MODE == "orphan-timeout":
    subprocess.Popen([sys.executable, "-c", "import time; time.sleep(60)"], close_fds=False)
    while True:
        pass

if MODE == "kill-switch-loop":
    while True:
        tcp_open(RELAY_IP, RELAY_PORT, 0.1)
        time.sleep(0.03)

if MODE == "single-probe":
    status, body = request("POST", f"/v1/routes/{ROUTE_ID}", [("Content-Type", "application/json")], b"{}")
    sys.stdout.write(json.dumps({"status": status, "genericRefusal": body == b'{"error":"synthetic-relay-refused"}'}, sort_keys=True, separators=(",", ":")) + "\n")
    raise SystemExit(0)

allowed_env = {
    "EF_CANDIDATE_MODE", "EF_PRIVILEGED_START_BARRIER", "EF_RELAY_IP", "EF_RELAY_PORT", "EF_ROUTE_ID", "HOME", "HOSTNAME", "LANG", "PATH", "PWD", "container",
}
environment_names = set(os.environ)
proxy_names = {name for name in environment_names if "proxy" in name.lower()}
provider_names = {name for name in environment_names if any(token in name.upper() for token in ("OPENAI", "ANTHROPIC", "API_KEY", "TOKEN"))}

CURRENT_STAGE = "allowed-route"
success_status, success_body = request(
    "POST",
    f"/v1/routes/{ROUTE_ID}",
    [
        ("Authorization", "Bearer candidate-controlled"),
        ("Proxy-Authorization", "candidate-proxy-secret"),
        ("Cookie", "candidate-cookie"),
        ("X-Api-Key", "candidate-api-key"),
        ("X-Auth-Token", "candidate-token"),
        ("Content-Type", "application/json"),
    ],
)

denied_requests = {}
for name, method, target, headers, body in [
    ("connect", "CONNECT", "api.synthetic.ef-proxy-lab.invalid:9443", [], b""),
    ("absolute_url", "POST", "https://api.synthetic.ef-proxy-lab.invalid/v1/fake", [], b"{}"),
    ("wrong_route", "POST", "/v1/routes/candidate-selected", [], b"{}"),
    ("wrong_method", "GET", f"/v1/routes/{ROUTE_ID}", [], b""),
    ("upgrade", "POST", f"/v1/routes/{ROUTE_ID}", [("Connection", "Upgrade"), ("Upgrade", "websocket")], b"{}"),
]:
    time.sleep(1.05)
    CURRENT_STAGE = name
    denied_requests[name] = request(method, target, headers, body)[0]

raw_socket_denied = False
try:
    raw = socket.socket(socket.AF_INET, socket.SOCK_RAW, socket.IPPROTO_TCP)
    raw.close()
except OSError:
    raw_socket_denied = True

unix_sockets_absent = all(not Path(path).exists() for path in [
    "/run/podman/podman.sock", "/var/run/docker.sock", "/run/WSL/2_interop", "/mnt/wsl", "/mnt/wslg",
])
mountinfo = Path("/proc/self/mountinfo").read_text("utf8")
forbidden_mount_absent = all(token not in mountinfo for token in ["/mnt/c", "/mnt/wsl", "/mnt/wslg", "/run/WSL", "/workspace", "/.git"])
try:
    Path("/tmp/escape").symlink_to("/mnt/c")
    Path("/tmp/escape/Users").read_bytes()
    symlink_escape_denied = False
except OSError:
    symlink_escape_denied = True

subprocess_direct = subprocess.run(
    [sys.executable, "-c", "import socket,sys;\ntry: socket.create_connection(('1.1.1.1',443),.3);sys.exit(1)\nexcept OSError:sys.exit(0)"],
    check=False,
).returncode == 0

result = {
    "schemaVersion": 1,
    "syntheticCandidate": True,
    "realCandidateInvocations": 0,
    "providerCalls": 0,
    "allowedRelayRequest": success_status == 200 and b'"ok":true' in success_body,
    "relayBypassesDenied": all(status == 403 for status in denied_requests.values()),
    "directInternetDenied": not tcp_open("1.1.1.1", 443),
    "directProviderIpDenied": not tcp_open("10.242.0.10", 9443),
    "alternateDnsUdp53Denied": not udp_reachable("8.8.8.8", 53),
    "alternateDnsTcp53Denied": not tcp_open("8.8.8.8", 53),
    "gatewayDnsDenied": not udp_reachable("10.241.0.1", 53) and not tcp_open("10.241.0.1", 53),
    "dohDenied": not tcp_open("1.1.1.1", 443),
    "dotDenied": not tcp_open("1.1.1.1", 853),
    "hostGatewayDenied": not tcp_open("169.254.1.2", 80),
    "loopbackDenied": not tcp_open("127.0.0.1", 80),
    "linkLocalMetadataDenied": not tcp_open("169.254.169.254", 80),
    "ipv6Disabled": Path("/proc/sys/net/ipv6/conf/all/disable_ipv6").read_text("ascii").strip() == "1",
    "rawSocketDenied": raw_socket_denied,
    "subprocessDirectSocketDenied": subprocess_direct,
    "proxyEnvironmentAbsent": not proxy_names,
    "providerEnvironmentAbsent": not provider_names,
    "environmentAllowlisted": environment_names <= allowed_env,
    "unixSocketsAndWslSurfacesAbsent": unix_sockets_absent,
    "forbiddenMountsAbsent": forbidden_mount_absent,
    "symlinkEscapeDenied": symlink_escape_denied,
    "packageBootstrapUnavailable": not Path("/sbin/apk").exists() and not Path("/usr/bin/apt").exists(),
    "candidateCredentialCanariesAbsent": all(token not in success_body for token in [b"candidate-controlled", b"candidate-cookie", b"candidate-api-key"]),
}

sys.stderr.write("EF_RAW_STDERR_CANARY_MUST_NEVER_PERSIST\n")
sys.stdout.write(json.dumps(result, sort_keys=True, separators=(",", ":")) + "\n")
