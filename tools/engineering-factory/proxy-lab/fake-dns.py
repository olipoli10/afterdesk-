#!/usr/bin/python3
"""Deterministic provider-free DNS fixture for the EF proxy lab."""

import ipaddress
import os
import socket
import struct
import threading

LISTEN_IP = os.environ.get("EF_DNS_LISTEN_IP", "0.0.0.0")
LISTEN_PORT = int(os.environ.get("EF_DNS_LISTEN_PORT", "5353"))
PROVIDER_IP = os.environ["EF_FAKE_PROVIDER_IP"]
SUFFIX = ".ef-proxy-lab.invalid"
counts: dict[str, int] = {}
lock = threading.Lock()


def decode_name(packet: bytes, offset: int) -> tuple[str, int]:
    labels: list[str] = []
    while True:
        if offset >= len(packet):
            raise ValueError("truncated dns name")
        length = packet[offset]
        offset += 1
        if length == 0:
            return ".".join(labels).lower(), offset
        if length > 63 or offset + length > len(packet):
            raise ValueError("malformed dns label")
        labels.append(packet[offset : offset + length].decode("ascii"))
        offset += length


def encode_name(name: str) -> bytes:
    return b"".join(bytes([len(label)]) + label.encode("ascii") for label in name.split(".")) + b"\x00"


def answer_record(rtype: int, ttl: int, value: str) -> bytes:
    if rtype == 1:
        data = socket.inet_aton(value)
    elif rtype == 28:
        data = ipaddress.IPv6Address(value).packed
    elif rtype == 5:
        data = encode_name(value)
    else:
        raise ValueError("unsupported record type")
    return b"\xc0\x0c" + struct.pack("!HHIH", rtype, 1, ttl, len(data)) + data


def records_for(name: str) -> list[tuple[int, int, str]]:
    if not name.endswith(SUFFIX):
        return []
    profile = name.split(".", 1)[0]
    if profile in {"api", "redirect", "oversize", "slow", "reflect", "error", "expired", "wrong-san", "untrusted"}:
        return [(1, 60, PROVIDER_IP)]
    if profile == "rebind":
        with lock:
            count = counts.get(name, 0)
            counts[name] = count + 1
        return [(1, 60, PROVIDER_IP if count == 0 else "169.254.169.254")]
    if profile == "multi":
        return [(1, 60, PROVIDER_IP), (1, 60, "127.0.0.1")]
    if profile == "private":
        return [(1, 60, "10.0.0.2")]
    if profile == "loopback":
        return [(1, 60, "127.0.0.1")]
    if profile == "linklocal":
        return [(1, 60, "169.254.169.254")]
    if profile == "cname":
        return [(5, 60, "api.synthetic.ef-proxy-lab.invalid"), (1, 60, PROVIDER_IP)]
    if profile == "ttl0":
        return [(1, 0, PROVIDER_IP)]
    if profile == "aaaa":
        return [(28, 60, "2001:db8::1")]
    if profile == "mapped":
        return [(28, 60, "::ffff:169.254.169.254")]
    if profile == "nat64":
        return [(28, 60, "64:ff9b::a9fe:a9fe")]
    return []


def response(packet: bytes) -> bytes:
    if len(packet) < 12:
        raise ValueError("truncated dns query")
    request_id, flags, qdcount, _, _, _ = struct.unpack("!HHHHHH", packet[:12])
    if flags & 0x8000 or qdcount != 1:
        raise ValueError("unsupported dns query")
    name, offset = decode_name(packet, 12)
    if offset + 4 > len(packet):
        raise ValueError("truncated dns question")
    qtype, qclass = struct.unpack("!HH", packet[offset : offset + 4])
    if qclass != 1 or qtype not in (1, 28, 255):
        rows: list[tuple[int, int, str]] = []
    else:
        rows = records_for(name)
    question = packet[12 : offset + 4]
    answers = b"".join(answer_record(*row) for row in rows)
    response_flags = 0x8400 if rows else 0x8403
    return struct.pack("!HHHHHH", request_id, response_flags, 1, len(rows), 0, 0) + question + answers


def udp_server() -> None:
    sock = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    sock.bind((LISTEN_IP, LISTEN_PORT))
    while True:
        packet, peer = sock.recvfrom(4096)
        try:
            sock.sendto(response(packet), peer)
        except Exception:
            continue


def tcp_client(conn: socket.socket) -> None:
    with conn:
        header = conn.recv(2)
        if len(header) != 2:
            return
        length = struct.unpack("!H", header)[0]
        packet = b""
        while len(packet) < length:
            chunk = conn.recv(length - len(packet))
            if not chunk:
                return
            packet += chunk
        try:
            payload = response(packet)
            conn.sendall(struct.pack("!H", len(payload)) + payload)
        except Exception:
            return


def tcp_server() -> None:
    sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    sock.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
    sock.bind((LISTEN_IP, LISTEN_PORT))
    sock.listen(8)
    while True:
        conn, _ = sock.accept()
        threading.Thread(target=tcp_client, args=(conn,), daemon=True).start()


threading.Thread(target=tcp_server, daemon=True).start()
udp_server()
