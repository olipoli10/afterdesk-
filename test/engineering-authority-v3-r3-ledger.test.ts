import { cpSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import {
  AuthorityV3R3LedgerRefusal,
  DisposableAuthorityV3Ledger,
  SimulatedLedgerCrash,
} from "@/lib/engineering-factory/authority-v3-r3-ledger";

const roots: string[] = [];
const hash = (digit: string) => digit.repeat(64);
const { DatabaseSync } = createRequire(import.meta.url)("node:sqlite") as {
  DatabaseSync: new (path: string) => { exec(sql: string): void; close(): void };
};

function root(label: string): string {
  const value = mkdtempSync(join(tmpdir(), `ef-r3-${label}-`));
  roots.push(value);
  return value;
}

function ledger(directory = root("ledger"), machineIdSha256 = hash("a")) {
  return new DisposableAuthorityV3Ledger({
    directory,
    ledgerId: "ledger-r3-test",
    machineIdSha256,
    ledgerKeyNameSha256: hash("b"),
    registryHash: hash("c"),
    windowsBootId: "windows-boot-1",
    wslBootId: "wsl-boot-1",
  });
}

const reservation = {
  nonceHash: hash("d"),
  authorityGeneration: 1,
  runId: "123e4567-e89b-42d3-a456-426614174000",
  leaseId: "lease-1",
  concurrencyDomain: "authority-v3-r3",
  ownerIdentity: "replay-ledger-anchor",
  acquiredAt: 100,
  expiresAt: 1_000,
};

afterEach(() => {
  for (const directory of roots.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

describe("Authority V3 R3 disposable replay ledger", () => {
  it("reserves and consumes atomically with an externally anchored head", () => {
    const instance = ledger();
    const receipt = instance.reserve(reservation);
    expect(receipt).toMatchObject({ state: "RESERVED", generation: 1 });
    expect(instance.inspectNonce(reservation.nonceHash, 1)).toMatchObject({ state: "RESERVED" });

    instance.transition(reservation.nonceHash, 1, "ACTIVE");
    instance.transition(reservation.nonceHash, 1, "TEARDOWN");
    instance.transition(reservation.nonceHash, 1, "SEALED_PENDING_REVIEW");
    const terminal = instance.transition(reservation.nonceHash, 1, "CONSUMED_PASS", {
      approvedReviewRootSha256: hash("e"),
      cleanupVerified: true,
      passedGateCount: 23,
    });
    expect(terminal).toMatchObject({ state: "CONSUMED_PASS", generation: 5 });
    expect(instance.inspectLease("authority-v3-r3")).toMatchObject({ state: "RELEASED" });
    instance.close();
  });

  it("rejects replay and a second held lease in the same concurrency domain", () => {
    const instance = ledger();
    instance.reserve(reservation);
    expect(() => instance.reserve(reservation)).toThrow("E_LEDGER_LEASE_OR_NONCE_CONFLICT");
    expect(() => instance.reserve({
      ...reservation,
      nonceHash: hash("e"),
      authorityGeneration: 2,
      runId: "123e4567-e89b-42d3-a456-426614174001",
      leaseId: "lease-2",
    })).toThrow("E_LEDGER_LEASE_OR_NONCE_CONFLICT");
    instance.close();
  });

  it("recovers an anchored torn transition exactly once and consumes it as failed", () => {
    const directory = root("torn");
    const instance = ledger(directory);
    expect(() => instance.reserve(reservation, { crashAfter: "ANCHOR_ADVANCED" })).toThrow(
      SimulatedLedgerCrash
    );
    instance.close();

    const reopened = ledger(directory);
    expect(reopened.recover({ now: 200 })).toEqual({ recovered: 1, consumedFail: 1 });
    expect(reopened.inspectNonce(reservation.nonceHash, 1)).toMatchObject({ state: "CONSUMED_FAIL" });
    expect(reopened.recover({ now: 201 })).toEqual({ recovered: 0, consumedFail: 0 });
    reopened.close();
  });

  it.each(["T1_COMMITTED", "DURABILITY_PROVEN"] as const)(
    "recovers a %s reservation crash exactly once and consumes it as failed",
    (crashAfter) => {
      const directory = root(crashAfter.toLowerCase());
      const instance = ledger(directory);
      expect(() => instance.reserve(reservation, { crashAfter })).toThrow(SimulatedLedgerCrash);
      instance.close();

      const reopened = ledger(directory);
      expect(reopened.recover({ now: 200 })).toEqual({ recovered: 1, consumedFail: 1 });
      expect(reopened.inspectNonce(reservation.nonceHash, 1)).toMatchObject({ state: "CONSUMED_FAIL" });
      expect(reopened.recover({ now: 201 })).toEqual({ recovered: 0, consumedFail: 0 });
      reopened.close();
    }
  );

  it("rejects a valid but stale disk backup and a cross-machine copy", () => {
    const original = root("original");
    const backup = root("backup");
    const instance = ledger(original);
    instance.reserve(reservation);
    instance.checkpoint();
    cpSync(instance.databasePath, join(backup, "ledger.sqlite"));
    instance.transition(reservation.nonceHash, 1, "ACTIVE");
    instance.checkpoint();
    cpSync(instance.anchorPath, join(backup, "anchor.json"));
    instance.close();

    expect(() => ledger(backup)).toThrow("E_LEDGER_BACKUP_RESTORE");
    expect(() => ledger(original, hash("f"))).toThrow("E_LEDGER_CROSS_MACHINE_COPY");
  });

  it("opens an exact database and anchor backup on the bound machine", () => {
    const original = root("valid-original");
    const backup = root("valid-backup");
    const instance = ledger(original);
    instance.reserve(reservation);
    instance.checkpoint();
    cpSync(instance.databasePath, join(backup, "ledger.sqlite"));
    cpSync(instance.anchorPath, join(backup, "anchor.json"));
    instance.close();

    const restored = ledger(backup);
    expect(restored.inspectNonce(reservation.nonceHash, 1)).toMatchObject({ state: "RESERVED" });
    restored.close();
  });

  it("fails closed outside an explicitly disposable operating-system temp path", () => {
    expect(() => ledger(join(process.cwd(), "authority-v3-r3-not-disposable"))).toThrow(
      "E_LEDGER_DISPOSABLE_PATH_REQUIRED"
    );
  });

  it("requires the complete approval proof and rejects every terminal replay", () => {
    const instance = ledger();
    instance.reserve(reservation);
    instance.transition(reservation.nonceHash, 1, "ACTIVE");
    instance.transition(reservation.nonceHash, 1, "TEARDOWN");
    instance.transition(reservation.nonceHash, 1, "SEALED_PENDING_REVIEW");

    expect(() => instance.transition(reservation.nonceHash, 1, "CONSUMED_PASS")).toThrow(
      "E_LEDGER_FINALIZATION_INVALID"
    );
    expect(() => instance.transition(reservation.nonceHash, 1, "CONSUMED_PASS", {
      approvedReviewRootSha256: hash("e"),
      cleanupVerified: true,
      passedGateCount: 22,
    })).toThrow("E_LEDGER_FINALIZATION_INVALID");

    instance.transition(reservation.nonceHash, 1, "CONSUMED_PASS", {
      approvedReviewRootSha256: hash("e"),
      cleanupVerified: true,
      passedGateCount: 23,
    });
    expect(() => instance.transition(reservation.nonceHash, 1, "CONSUMED_FAIL")).toThrow(
      "E_LEDGER_TERMINAL_TRANSITION_DUPLICATE"
    );
    instance.close();
  });

  it("enforces one held concurrency-domain lease across independent handles", () => {
    const directory = root("parallel-handles");
    const first = ledger(directory);
    const second = ledger(directory);
    first.reserve(reservation);
    expect(() => second.reserve({
      ...reservation,
      nonceHash: hash("e"),
      authorityGeneration: 2,
      runId: "123e4567-e89b-42d3-a456-426614174002",
      leaseId: "lease-2",
    })).toThrow("E_LEDGER_LEASE_OR_NONCE_CONFLICT");
    first.close();
    second.close();
  });

  it("reuses a released concurrency domain without reusing its nonce or lease", () => {
    const instance = ledger();
    instance.reserve(reservation);
    instance.transition(reservation.nonceHash, 1, "CONSUMED_FAIL");
    const next = {
      ...reservation,
      nonceHash: hash("e"),
      authorityGeneration: 2,
      runId: "123e4567-e89b-42d3-a456-426614174003",
      leaseId: "lease-2",
    };
    expect(instance.reserve(next)).toMatchObject({ state: "RESERVED", generation: 3 });
    expect(instance.inspectLease("authority-v3-r3")).toMatchObject({
      lease_id: "lease-2",
      nonce_hash: hash("e"),
      state: "HELD",
    });
    instance.close();
  });

  it("rechecks the SQLite application identity before every transition", () => {
    const directory = root("application-id");
    const instance = ledger(directory);
    instance.reserve(reservation);
    instance.close();
    const raw = new DatabaseSync(join(directory, "ledger.sqlite"));
    raw.exec("PRAGMA application_id=0");
    raw.close();

    expect(() => ledger(directory)).toThrow("E_LEDGER_CORRUPT_AT_RESERVATION");
  });

  it("turns boot drift and approver timeout into anchored CONSUMED_FAIL", () => {
    const bootRoot = root("boot");
    const first = ledger(bootRoot);
    first.reserve(reservation);
    first.close();
    const changedBoot = new DisposableAuthorityV3Ledger({
      directory: bootRoot,
      ledgerId: "ledger-r3-test",
      machineIdSha256: hash("a"),
      ledgerKeyNameSha256: hash("b"),
      registryHash: hash("c"),
      windowsBootId: "windows-boot-2",
      wslBootId: "wsl-boot-1",
    });
    expect(changedBoot.recover({ now: 200 })).toEqual({ recovered: 0, consumedFail: 1 });
    expect(changedBoot.inspectNonce(reservation.nonceHash, 1)).toMatchObject({ state: "CONSUMED_FAIL" });
    changedBoot.close();

    const timeout = ledger();
    timeout.reserve(reservation);
    timeout.transition(reservation.nonceHash, 1, "ACTIVE");
    timeout.transition(reservation.nonceHash, 1, "TEARDOWN");
    timeout.transition(reservation.nonceHash, 1, "SEALED_PENDING_REVIEW");
    expect(timeout.recover({ now: 1_001 })).toEqual({ recovered: 0, consumedFail: 1 });
    expect(timeout.inspectNonce(reservation.nonceHash, 1)).toMatchObject({ state: "CONSUMED_FAIL" });
    timeout.close();
  });

  it("fails closed when the durable database is corrupt", () => {
    const directory = root("corrupt");
    const instance = ledger(directory);
    instance.reserve(reservation);
    instance.close();
    writeFileSync(join(directory, "ledger.sqlite"), "not a sqlite database");
    expect(() => ledger(directory)).toThrow(
      new AuthorityV3R3LedgerRefusal("E_LEDGER_CORRUPT_AT_RESERVATION")
    );
  });
});
