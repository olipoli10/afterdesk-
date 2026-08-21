#!/usr/bin/python3
"""Root-controlled EF packet metadata observer."""

import argparse
import ipaddress
import json
import os
import socket
import struct
import time
from pathlib import Path


CLASSES = {
    "candidate": {"10.241.0.10"},
    "relay": {"10.241.0.2", "10.242.0.2"},
    "fake-dns": {"10.242.0.53"},
    "fake-provider": {"10.242.0.10"},
    "loopback": {"127.0.0.1", "::1"},
    "metadata": {"169.254.169.254"},
}


def classify(address: str) -> str:
    for name, values in CLASSES.items():
        if address in values:
            return name
    try:
        parsed = ipaddress.ip_address(address)
        if parsed.is_link_local:
            return "link-local"
        if parsed.is_private:
            return "private-other"
        if parsed.version == 6:
            return "ipv6-other"
    except ValueError:
        pass
    return "arbitrary-other"


def ports(data: bytes, offset: int, protocol: int) -> tuple[int | None, int | None]:
    if protocol not in (6, 17) or len(data) < offset + 4:
        return None, None
    return struct.unpack("!HH", data[offset : offset + 4])


def parse_frame(data: bytes) -> dict | None:
    if len(data) < 14:
        return None
    ether_type = struct.unpack("!H", data[12:14])[0]
    if ether_type == 0x0800 and len(data) >= 34:
        version_length = data[14]
        if version_length >> 4 != 4:
            return None
        ip_length = (version_length & 0x0F) * 4
        protocol = data[23]
        source = socket.inet_ntop(socket.AF_INET, data[26:30])
        destination = socket.inet_ntop(socket.AF_INET, data[30:34])
        source_port, destination_port = ports(data, 14 + ip_length, protocol)
        protocol_name = {1: "icmp", 6: "tcp", 17: "udp"}.get(protocol, f"ip-{protocol}")
    elif ether_type == 0x86DD and len(data) >= 54:
        protocol = data[20]
        source = socket.inet_ntop(socket.AF_INET6, data[22:38])
        destination = socket.inet_ntop(socket.AF_INET6, data[38:54])
        source_port, destination_port = ports(data, 54, protocol)
        protocol_name = {6: "tcp", 17: "udp", 58: "icmpv6"}.get(protocol, f"ipv6-{protocol}")
    else:
        return None
    return {
        "protocol": protocol_name,
        "source_class": classify(source),
        "destination_class": classify(destination),
        "source_port": source_port,
        "destination_port": destination_port,
    }


def disposition(role: str, direction: str, item: dict) -> str:
    source = item["source_class"]
    destination = item["destination_class"]
    destination_port = item["destination_port"]
    if role == "candidate" and direction == "out" and destination == "relay" and destination_port == 8443:
        return "candidate-exact-relay-attempt"
    if role == "candidate" and direction == "out":
        return "candidate-denied-attempt"
    if role == "relay" and direction == "in" and source == "candidate" and destination_port == 8443:
        return "candidate-exact-relay-arrival"
    if role == "relay" and direction == "out" and destination == "fake-dns" and destination_port == 5353:
        return "relay-exact-dns-egress"
    if role == "relay" and direction == "out" and destination == "fake-provider" and destination_port in (9443, 9444, 9445, 9446):
        return "relay-exact-provider-egress"
    return "unexpected-observation"


def canonical(value: object) -> str:
    return json.dumps(value, sort_keys=True, separators=(",", ":"), ensure_ascii=True)


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--interface", required=True)
    parser.add_argument("--namespace-role", choices=("candidate", "relay"), required=True)
    parser.add_argument("--namespace-id", required=True)
    parser.add_argument("--output", required=True)
    parser.add_argument("--stop-file", required=True)
    parser.add_argument("--kill-switch-file", required=True)
    arguments = parser.parse_args()

    output = Path(arguments.output)
    stop_file = Path(arguments.stop_file)
    kill_switch_file = Path(arguments.kill_switch_file)
    output.parent.mkdir(parents=True, exist_ok=True)
    descriptor = os.open(output, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
    capture = socket.socket(socket.AF_PACKET, socket.SOCK_RAW, socket.htons(0x0003))
    capture.bind((arguments.interface, 0))
    capture.settimeout(0.1)
    sequence = 0
    try:
        while not stop_file.exists():
            try:
                data, address = capture.recvfrom(65535)
            except TimeoutError:
                continue
            item = parse_frame(data)
            if item is None:
                continue
            sequence += 1
            direction = "out" if address[2] == socket.PACKET_OUTGOING else "in"
            event = {
                "schemaVersion": 1,
                "sequence": sequence,
                "timeClass": "post-kill-switch" if kill_switch_file.exists() else "pre-kill-switch",
                "direction": direction,
                "interface": arguments.interface,
                "namespaceRole": arguments.namespace_role,
                "namespaceId": arguments.namespace_id,
                "protocol": item["protocol"],
                "sourceClass": item["source_class"],
                "destinationClass": item["destination_class"],
                "sourcePort": item["source_port"],
                "destinationPort": item["destination_port"],
                "packetLength": len(data),
                "disposition": disposition(arguments.namespace_role, direction, item),
            }
            os.write(descriptor, (canonical(event) + "\n").encode("ascii"))
    finally:
        capture.close()
        os.close(descriptor)


if __name__ == "__main__":
    main()
