#!/usr/bin/python3
"""Exact-route, provider-free relay for the local EF proxy lab."""

import calendar
import hashlib
import hmac
import ipaddress
import json
import os
import socket
import ssl
import struct
import threading
import time
from pathlib import Path

BUNDLE = Path("/trusted")
AUDIT_ROOT = Path("/audit")
LISTEN_IP = os.environ.get("EF_RELAY_LISTEN_IP", "0.0.0.0")
LISTEN_PORT = int(os.environ.get("EF_RELAY_LISTEN_PORT", "8443"))
AUTHORITY_KEY = Path("/run/secrets/authority-key").read_bytes()
AUDIT_KEY = Path("/run/secrets/audit-key").read_bytes()
FAKE_CANARY = Path("/run/secrets/fake-canary").read_text("ascii")
CA_FILE = "/opt/lab/certs/lab-ca.crt"


class Refusal(Exception):
    pass


def canonical(value: object) -> bytes:
    return json.dumps(value, sort_keys=True, separators=(",", ":"), ensure_ascii=False).encode("utf-8")


def digest(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def exact_keys(value: dict, names: set[str], label: str) -> None:
    if set(value) != names:
        raise Refusal(f"{label}_shape")


def safe_attestation(reference: dict, expected_kind: str) -> tuple[dict, bytes]:
    exact_keys(reference, {"kind", "sha256", "fileName"}, "attestation")
    if reference["kind"] != expected_kind or reference["fileName"] != f'{reference["sha256"]}.json':
        raise Refusal("attestation_reference")
    if "/" in reference["fileName"] or "\\" in reference["fileName"]:
        raise Refusal("attestation_path")
    file = BUNDLE / reference["fileName"]
    raw = file.read_bytes()
    if digest(raw) != reference["sha256"]:
        raise Refusal(f"{expected_kind}_hash")
    parsed = json.loads(raw)
    if canonical(parsed) != raw:
        raise Refusal(f"{expected_kind}_canonical")
    return parsed, raw


def load_authority() -> tuple[dict, dict, str, str]:
    raw = (BUNDLE / "authority-v2.json").read_bytes()
    authority = json.loads(raw)
    expected_fields = {
        "schemaVersion", "kind", "scope", "executionAuthorized", "realCandidateInvocations",
        "providerCalls", "runId", "runNonce", "issuedAt", "expiresAt", "signerId",
        "policySha256", "manifestSha256", "runtimeChainSha256", "attestations", "hmacSha256",
    }
    exact_keys(authority, expected_fields, "authority")
    if authority["schemaVersion"] != 2 or authority["scope"] != "provider-free-synthetic-proxy-lab":
        raise Refusal("authority_scope")
    if authority["executionAuthorized"] is not False or authority["realCandidateInvocations"] != 0 or authority["providerCalls"] != 0:
        raise Refusal("authority_real_execution")
    unsigned = dict(authority)
    signature = unsigned.pop("hmacSha256")
    expected = hmac.new(AUTHORITY_KEY, canonical(unsigned), hashlib.sha256).hexdigest()
    if not hmac.compare_digest(signature, expected):
        raise Refusal("authority_hmac")
    now = time.time()
    issued = calendar.timegm(time.strptime(authority["issuedAt"], "%Y-%m-%dT%H:%M:%S.000Z"))
    expires = calendar.timegm(time.strptime(authority["expiresAt"], "%Y-%m-%dT%H:%M:%S.000Z"))
    if now < issued or now >= expires or expires - issued > 600:
        raise Refusal("authority_time")
    refs = authority["attestations"]
    exact_keys(refs, {"policy", "manifest", "runtimeChain"}, "attestations")
    policy, policy_raw = safe_attestation(refs["policy"], "policy")
    manifest, manifest_raw = safe_attestation(refs["manifest"], "manifest")
    runtime_chain, runtime_raw = safe_attestation(refs["runtimeChain"], "runtime-chain")
    if digest(policy_raw) != authority["policySha256"] or digest(manifest_raw) != authority["manifestSha256"]:
        raise Refusal("authority_attestation_binding")
    if digest(runtime_raw) != authority["runtimeChainSha256"] or runtime_chain != manifest["runtimeChain"]:
        raise Refusal("authority_runtime_binding")
    if policy["scope"] != "provider-free-synthetic-proxy-lab" or policy["executionAuthorized"] is not False:
        raise Refusal("policy_scope")
    if policy["candidateKind"] != "deterministic-hostile-fixture" or policy["providerKind"] != "local-fake-provider":
        raise Refusal("policy_real_boundary")
    if policy["killSwitch"] != {"armed": True, "tripped": False}:
        raise Refusal("kill_switch")
    route = policy["route"]
    if route["upstreamScheme"] != "https" or route["redirects"] != 0:
        raise Refusal("route_tls_redirect")
    if route["relayMethod"] != "POST" or route["upstreamMethod"] != "POST":
        raise Refusal("route_method")
    nonce_hash = digest(authority["runNonce"].encode("ascii"))
    nonce_file = AUDIT_ROOT / "nonce-ledger"
    prior = nonce_file.read_text("ascii").splitlines() if nonce_file.exists() else []
    if nonce_hash in prior:
        raise Refusal("authority_replay")
    with nonce_file.open("a", encoding="ascii") as handle:
        handle.write(nonce_hash + "\n")
        handle.flush()
        os.fsync(handle.fileno())
    return policy, manifest, authority["runId"], authority["policySha256"]


POLICY, MANIFEST, RUN_ID, POLICY_HASH = load_authority()
ROUTE = POLICY["route"]
LIMITS = POLICY["limits"]
if digest(Path(CA_FILE).read_bytes()) != ROUTE["tlsCaSha256"]:
    raise Refusal("tls_ca_hash")
sequence_lock = threading.Lock()
active_lock = threading.Lock()
active = False
request_count = 0
last_request_at = 0.0
prior_event_hash = "0" * 64
event_sequence = 0


def transient_state(code: str) -> None:
    (AUDIT_ROOT / "state").write_text(code, encoding="ascii")


transient_state("relay_ready")


def audit(decision: str, reason: str, status_class: int, request_bytes: int, response_bytes: int, duration_ms: int, ip_hash: str) -> None:
    global prior_event_hash, event_sequence
    with sequence_lock:
        event_sequence += 1
        event = {
            "runId": RUN_ID,
            "policyHash": POLICY_HASH,
            "routeId": ROUTE["routeId"],
            "approvedFakeFqdn": ROUTE["approvedFakeFqdn"],
            "decision": decision,
            "reason": reason,
            "statusClass": status_class,
            "requestBytes": request_bytes,
            "responseBytes": response_bytes,
            "durationMs": duration_ms,
            "quotaRemaining": max(0, LIMITS["maxRequests"] - request_count),
            "ipResultHash": ip_hash,
            "sequence": event_sequence,
            "priorEventHash": prior_event_hash,
        }
        event_hash = digest(canonical(event))
        event["eventHash"] = event_hash
        event["hmacSha256"] = hmac.new(AUDIT_KEY, canonical(event), hashlib.sha256).hexdigest()
        line = canonical(event) + b"\n"
        descriptor = os.open(AUDIT_ROOT / "events.jsonl", os.O_WRONLY | os.O_CREAT | os.O_APPEND, 0o600)
        try:
            os.write(descriptor, line)
            os.fsync(descriptor)
        finally:
            os.close(descriptor)
        prior_event_hash = event_hash


def encode_name(name: str) -> bytes:
    return b"".join(bytes([len(label)]) + label.encode("ascii") for label in name.split(".")) + b"\x00"


def skip_name(packet: bytes, offset: int) -> int:
    while True:
        if offset >= len(packet):
            raise Refusal("dns_truncated")
        length = packet[offset]
        if length & 0xC0 == 0xC0:
            return offset + 2
        offset += 1
        if length == 0:
            return offset
        if length > 63:
            raise Refusal("dns_label")
        offset += length


def dns_query() -> tuple[list[tuple[int, int, str]], str]:
    request_id = int.from_bytes(os.urandom(2), "big")
    packet = struct.pack("!HHHHHH", request_id, 0x0100, 1, 0, 0, 0) + encode_name(ROUTE["approvedFakeFqdn"]) + struct.pack("!HH", 1, 1)
    sock = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    sock.settimeout(LIMITS["connectTimeoutMs"] / 1000)
    try:
        sock.sendto(packet, (ROUTE["dnsIpv4"], ROUTE["dnsPort"]))
        response, _ = sock.recvfrom(4096)
    finally:
        sock.close()
    if len(response) < 12:
        raise Refusal("dns_truncated")
    returned_id, flags, qdcount, ancount, _, _ = struct.unpack("!HHHHHH", response[:12])
    if returned_id != request_id or not flags & 0x8000 or flags & 0x000F or qdcount != 1:
        raise Refusal("dns_response")
    offset = skip_name(response, 12) + 4
    rows: list[tuple[int, int, str]] = []
    for _ in range(ancount):
        offset = skip_name(response, offset)
        if offset + 10 > len(response):
            raise Refusal("dns_truncated")
        rtype, rclass, ttl, length = struct.unpack("!HHIH", response[offset : offset + 10])
        offset += 10
        data = response[offset : offset + length]
        offset += length
        if rclass != 1:
            raise Refusal("dns_class")
        if rtype == 1 and length == 4:
            value = socket.inet_ntoa(data)
        elif rtype == 28 and length == 16:
            value = str(ipaddress.IPv6Address(data))
        elif rtype == 5:
            value = "cname"
        else:
            value = "unsupported"
        rows.append((rtype, ttl, value))
    ip_hash = digest((POLICY_HASH + ":" + ",".join(row[2] for row in rows)).encode("ascii"))
    return rows, ip_hash


def resolve_pinned() -> tuple[str, str]:
    first, first_hash = dns_query()
    second, second_hash = dns_query()
    if first != second:
        raise Refusal("dns_rebind")
    if len(first) != 1 or first[0][0] != 1:
        raise Refusal("dns_ambiguous_or_ipv6")
    _, ttl, address = first[0]
    if ttl <= 0:
        raise Refusal("dns_ttl_zero")
    if address != ROUTE["upstreamIpv4"]:
        raise Refusal("dns_address_not_signed")
    return address, first_hash if first_hash == second_hash else digest((first_hash + second_hash).encode("ascii"))


def parse_candidate_request(conn: socket.socket) -> tuple[bytes, int]:
    data = b""
    while b"\r\n\r\n" not in data:
        chunk = conn.recv(4096)
        if not chunk:
            raise Refusal("request_incomplete")
        data += chunk
        if len(data) > LIMITS["maxHeaderBytes"]:
            raise Refusal("request_headers_oversize")
    head, body = data.split(b"\r\n\r\n", 1)
    try:
        lines = head.decode("ascii", "strict").split("\r\n")
        method, target, version = lines[0].split(" ")
    except Exception as error:
        raise Refusal("request_line") from error
    if method != ROUTE["relayMethod"] or target != ROUTE["relayPath"] or version != "HTTP/1.1":
        raise Refusal("route_semantics")
    if "://" in target or "@" in target or "?" in target or "#" in target:
        raise Refusal("absolute_or_ambiguous_target")
    headers: dict[str, str] = {}
    for line in lines[1:]:
        if ":" not in line:
            raise Refusal("header_shape")
        name, value = line.split(":", 1)
        name = name.strip().lower()
        if name in headers:
            raise Refusal("duplicate_header")
        headers[name] = value.strip()
    if headers.get("upgrade") or "upgrade" in headers.get("connection", "").lower():
        raise Refusal("upgrade_forbidden")
    try:
        length = int(headers.get("content-length", "0"))
    except ValueError as error:
        raise Refusal("content_length") from error
    if length < 0 or length > LIMITS["maxRequestBodyBytes"]:
        raise Refusal("request_body_oversize")
    while len(body) < length:
        chunk = conn.recv(min(64 * 1024, length - len(body)))
        if not chunk:
            raise Refusal("request_body_incomplete")
        body += chunk
    if len(body) != length:
        raise Refusal("request_body_length")
    return body, len(head) + 4 + len(body)


def upstream_request(body: bytes, address: str) -> tuple[int, bytes]:
    context = ssl.create_default_context(cafile=CA_FILE)
    context.minimum_version = ssl.TLSVersion.TLSv1_2
    context.maximum_version = ssl.TLSVersion.TLSv1_3
    raw = socket.create_connection((address, ROUTE["upstreamPort"]), LIMITS["connectTimeoutMs"] / 1000)
    raw.settimeout(LIMITS["firstByteTimeoutMs"] / 1000)
    conn = context.wrap_socket(raw, server_hostname=ROUTE["approvedFakeFqdn"])
    try:
        request = (
            f'{ROUTE["upstreamMethod"]} {ROUTE["upstreamPath"]} HTTP/1.1\r\n'
            f'Host: {ROUTE["approvedFakeFqdn"]}:{ROUTE["upstreamPort"]}\r\n'
            f'Authorization: Bearer {FAKE_CANARY}\r\n'
            "Content-Type: application/json\r\n"
            f"Content-Length: {len(body)}\r\n"
            "Connection: close\r\n\r\n"
        ).encode("ascii") + body
        conn.sendall(request)
        data = b""
        while b"\r\n\r\n" not in data:
            data += conn.recv(4096)
            if len(data) > 64 * 1024:
                raise Refusal("upstream_headers_oversize")
        head, response_body = data.split(b"\r\n\r\n", 1)
        lines = head.decode("ascii", "strict").split("\r\n")
        version, status_text, _ = lines[0].split(" ", 2)
        status = int(status_text)
        if version != "HTTP/1.1":
            raise Refusal("upstream_version")
        headers: dict[str, str] = {}
        for line in lines[1:]:
            name, value = line.split(":", 1)
            headers[name.strip().lower()] = value.strip()
        if 300 <= status < 400 or "location" in headers:
            raise Refusal("redirect_forbidden")
        length = int(headers.get("content-length", "-1"))
        if length < 0 or length > LIMITS["maxResponseBytes"]:
            raise Refusal("response_oversize")
        while len(response_body) < length:
            chunk = conn.recv(min(64 * 1024, length - len(response_body)))
            if not chunk:
                raise Refusal("response_incomplete")
            response_body += chunk
            if len(response_body) > LIMITS["maxResponseBytes"]:
                raise Refusal("response_oversize")
        response_body = response_body[:length]
        if FAKE_CANARY.encode("ascii") in response_body:
            raise Refusal("credential_reflection")
        if status >= 400:
            raise Refusal("upstream_error_redacted")
        return status, response_body
    finally:
        conn.close()


def send_generic(conn: socket.socket, status: int, body: bytes) -> None:
    reason = "OK" if status == 200 else "Forbidden"
    head = (
        f"HTTP/1.1 {status} {reason}\r\n"
        "Content-Type: application/json\r\n"
        f"Content-Length: {len(body)}\r\n"
        "Connection: close\r\n\r\n"
    ).encode("ascii")
    conn.sendall(head + body)
    conn.shutdown(socket.SHUT_WR)


def handle(conn: socket.socket) -> None:
    global active, request_count, last_request_at
    started = time.monotonic()
    request_bytes = 0
    response_bytes = 0
    ip_hash = digest((POLICY_HASH + ":unresolved").encode("ascii"))
    reason = "internal_refusal"
    decision = "deny"
    status_class = 4
    with conn:
        try:
            with active_lock:
                if active:
                    raise Refusal("concurrency_limit")
                active = True
                now = time.monotonic()
                if request_count >= LIMITS["maxRequests"]:
                    raise Refusal("request_quota")
                if last_request_at and now - last_request_at < 1 / LIMITS["sustainedRequestsPerSecond"]:
                    raise Refusal("rate_limit")
                request_count += 1
                last_request_at = now
            body, request_bytes = parse_candidate_request(conn)
            transient_state("request_parsed")
            address, ip_hash = resolve_pinned()
            transient_state("dns_pinned")
            status, response = upstream_request(body, address)
            transient_state("upstream_complete")
            send_generic(conn, status, response)
            response_bytes = len(response)
            status_class = status // 100
            reason = "exact_route_allowed"
            decision = "allow"
        except (Refusal, OSError, ssl.SSLError, ValueError) as error:
            if isinstance(error, Refusal):
                reason = str(error)
            elif isinstance(error, ssl.SSLCertVerificationError):
                reason = "tls_certificate_verification"
            elif isinstance(error, ssl.SSLError):
                reason = "tls_handshake"
            elif isinstance(error, TimeoutError):
                reason = "transport_timeout"
            else:
                reason = "transport_refusal"
            try:
                response = b'{"error":"synthetic-relay-refused"}'
                send_generic(conn, 403, response)
                response_bytes = len(response)
            except OSError:
                pass
        finally:
            # The exception text is deliberately never persisted or returned.
            with active_lock:
                active = False
            audit(decision, reason, status_class, request_bytes, response_bytes, int((time.monotonic() - started) * 1000), ip_hash)
            transient_state("request_complete")


server = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
server.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
server.bind((LISTEN_IP, LISTEN_PORT))
server.listen(4)
while True:
    candidate, _ = server.accept()
    threading.Thread(target=handle, args=(candidate,), daemon=True).start()
