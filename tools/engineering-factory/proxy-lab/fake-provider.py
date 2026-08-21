#!/usr/bin/python3
"""Local TLS-only fake provider. It never logs headers or bodies."""

import os
import socket
import ssl
import threading
import time

CANARY = open("/run/secrets/fake-canary", "r", encoding="ascii").read()
LISTEN_IP = os.environ.get("EF_PROVIDER_LISTEN_IP", "0.0.0.0")
CERT_ROOT = "/opt/lab/certs"


def read_request(conn: ssl.SSLSocket) -> tuple[str, dict[str, str], bytes]:
    data = b""
    while b"\r\n\r\n" not in data and len(data) <= 64 * 1024:
        chunk = conn.recv(4096)
        if not chunk:
            break
        data += chunk
    if b"\r\n\r\n" not in data:
        raise ValueError("malformed request")
    head, body = data.split(b"\r\n\r\n", 1)
    lines = head.decode("ascii", "strict").split("\r\n")
    method, path, version = lines[0].split(" ")
    if method != "POST" or version != "HTTP/1.1":
        raise ValueError("method")
    headers: dict[str, str] = {}
    for line in lines[1:]:
        name, value = line.split(":", 1)
        headers[name.strip().lower()] = value.strip()
    length = int(headers.get("content-length", "0"))
    while len(body) < length:
        body += conn.recv(length - len(body))
    return path, headers, body[:length]


def reply(conn: ssl.SSLSocket, status: int, body: bytes, extra: list[tuple[str, str]] | None = None) -> None:
    reason = {200: "OK", 302: "Found", 401: "Unauthorized", 500: "Internal Server Error"}.get(status, "Error")
    headers = [("Content-Type", "application/json"), ("Content-Length", str(len(body))), ("Connection", "close")]
    if extra:
        headers.extend(extra)
    head = f"HTTP/1.1 {status} {reason}\r\n" + "".join(f"{name}: {value}\r\n" for name, value in headers) + "\r\n"
    conn.sendall(head.encode("ascii") + body)


def handle(conn: ssl.SSLSocket) -> None:
    with conn:
        try:
            path, headers, _ = read_request(conn)
            if headers.get("authorization") != f"Bearer {CANARY}":
                reply(conn, 401, b'{"error":"generic"}')
                return
            forbidden = ["proxy-authorization", "cookie", "x-api-key", "x-auth-token"]
            if any(name in headers for name in forbidden):
                reply(conn, 500, b'{"error":"candidate-auth-forwarded"}')
                return
            if path == "/v1/fake":
                reply(conn, 200, b'{"ok":true,"syntheticTokens":1,"syntheticSpendMicros":1}')
            elif path == "/v1/redirect":
                reply(conn, 302, b"redirect-body", [("Location", "https://attacker.invalid/steal")])
            elif path == "/v1/oversize":
                reply(conn, 200, b"x" * (2 * 1024 * 1024))
            elif path == "/v1/slow":
                time.sleep(5)
                reply(conn, 200, b'{"ok":true}')
            elif path == "/v1/reflect":
                reply(conn, 200, ("reflection:" + CANARY).encode("ascii"))
            elif path == "/v1/error":
                reply(conn, 500, b"hostile-error:<script>boom</script>:candidate-controlled-body")
            else:
                reply(conn, 500, b'{"error":"generic"}')
        except Exception:
            try:
                reply(conn, 500, b'{"error":"generic"}')
            except Exception:
                pass


def listener(port: int, cert_name: str) -> None:
    context = ssl.SSLContext(ssl.PROTOCOL_TLS_SERVER)
    context.minimum_version = ssl.TLSVersion.TLSv1_2
    context.load_cert_chain(f"{CERT_ROOT}/{cert_name}.crt", f"{CERT_ROOT}/{cert_name}.key")
    sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    sock.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
    sock.bind((LISTEN_IP, port))
    sock.listen(8)
    while True:
        raw, _ = sock.accept()
        try:
            conn = context.wrap_socket(raw, server_side=True)
        except ssl.SSLError:
            raw.close()
            continue
        threading.Thread(target=handle, args=(conn,), daemon=True).start()


for configuration in [(9443, "valid"), (9444, "wrong-san"), (9445, "untrusted"), (9446, "expired")]:
    threading.Thread(target=listener, args=configuration, daemon=True).start()
threading.Event().wait()
