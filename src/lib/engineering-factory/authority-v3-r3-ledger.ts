import { createHash, randomUUID } from "node:crypto";
import { createRequire } from "node:module";
import {
  closeSync,
  existsSync,
  fsyncSync,
  mkdirSync,
  openSync,
  readFileSync,
  renameSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, relative, resolve, sep } from "node:path";

type SqlValue = string | number | bigint | null;
type SqlRow = Record<string, SqlValue>;
type SqlRunResult = { changes: number | bigint; lastInsertRowid: number | bigint };
type SqlStatement = {
  run(...values: SqlValue[]): SqlRunResult;
  get(...values: SqlValue[]): SqlRow | undefined;
  all(...values: SqlValue[]): SqlRow[];
};
type SqlDatabase = {
  exec(sql: string): void;
  prepare(sql: string): SqlStatement;
  close(): void;
};
type DatabaseConstructor = new (path: string) => SqlDatabase;

const { DatabaseSync } = createRequire(import.meta.url)("node:sqlite") as {
  DatabaseSync: DatabaseConstructor;
};

const APPLICATION_ID = 0x45565233;
const ZERO_HASH = "0".repeat(64);
const HASH = /^[0-9a-f]{64}$/;
const TERMINAL = new Set(["CONSUMED_PASS", "CONSUMED_FAIL", "EXPIRED_UNUSED"]);
const ALLOWED_TRANSITIONS = new Set([
  "ISSUED->RESERVED",
  "ISSUED->EXPIRED_UNUSED",
  "RESERVED->ACTIVE",
  "RESERVED->CONSUMED_FAIL",
  "ACTIVE->TEARDOWN",
  "ACTIVE->CONSUMED_FAIL",
  "TEARDOWN->SEALED_PENDING_REVIEW",
  "TEARDOWN->CONSUMED_FAIL",
  "SEALED_PENDING_REVIEW->CONSUMED_PASS",
  "SEALED_PENDING_REVIEW->CONSUMED_FAIL",
]);

type Anchor = {
  schemaVersion: "3.3.0";
  ledgerId: string;
  machineIdSha256: string;
  ledgerKeyNameSha256: string;
  registryHash: string;
  generation: number;
  eventHeadSha256: string;
  lastBootBindingHash: string;
};

type LedgerOptions = {
  directory: string;
  ledgerId: string;
  machineIdSha256: string;
  ledgerKeyNameSha256: string;
  registryHash: string;
  windowsBootId: string;
  wslBootId: string;
};

type Reservation = {
  nonceHash: string;
  authorityGeneration: number;
  runId: string;
  leaseId: string;
  concurrencyDomain: string;
  ownerIdentity: string;
  acquiredAt: number;
  expiresAt: number;
};

type CrashPoint = "T1_COMMITTED" | "DURABILITY_PROVEN" | "ANCHOR_ADVANCED";

type Receipt = {
  transactionId: string;
  nonceHash: string;
  authorityGeneration: number;
  state: string;
  generation: number;
  eventHash: string;
};

type Prepared = {
  transactionId: string;
  expectedGeneration: number;
  preparedEventHash: string;
  diskFsyncReceiptHash: string | null;
  nonceHash: string;
  authorityGeneration: number;
  transition: string;
  priorEventHash: string;
};

export class AuthorityV3R3LedgerRefusal extends Error {
  constructor(errorId: string) {
    super(errorId);
    this.name = "AuthorityV3R3LedgerRefusal";
  }
}

export class SimulatedLedgerCrash extends Error {
  constructor(point: CrashPoint) {
    super(`SIMULATED_LEDGER_CRASH_${point}`);
    this.name = "SimulatedLedgerCrash";
  }
}

function refuse(errorId: string): never {
  throw new AuthorityV3R3LedgerRefusal(errorId);
}

function assertHash(value: string, errorId: string): void {
  if (!HASH.test(value)) refuse(errorId);
}

function canonical(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  return `{${Object.entries(value as Record<string, unknown>)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, item]) => `${JSON.stringify(key)}:${canonical(item)}`)
    .join(",")}}`;
}

function sha256(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

function bootHash(windowsBootId: string, wslBootId: string): string {
  return sha256(canonical({ windowsBootId, wslBootId }));
}

function number(value: SqlValue | undefined, errorId: string): number {
  if (typeof value !== "number" && typeof value !== "bigint") refuse(errorId);
  const converted = Number(value);
  if (!Number.isSafeInteger(converted)) refuse(errorId);
  return converted;
}

function string(value: SqlValue | undefined, errorId: string): string {
  if (typeof value !== "string") refuse(errorId);
  return value;
}

function assertDisposableDirectory(directory: string): string {
  const resolved = resolve(directory);
  const temporaryRoot = resolve(tmpdir());
  const pathFromTemp = relative(temporaryRoot, resolved);
  if (!pathFromTemp || pathFromTemp.startsWith(`..${sep}`) || pathFromTemp === "..") {
    refuse("E_LEDGER_DISPOSABLE_PATH_REQUIRED");
  }
  return resolved;
}

function syncFile(path: string): void {
  const descriptor = openSync(path, "r+");
  try {
    fsyncSync(descriptor);
  } finally {
    closeSync(descriptor);
  }
}

export class DisposableAuthorityV3Ledger {
  readonly directory: string;
  readonly databasePath: string;
  readonly anchorPath: string;

  private readonly options: LedgerOptions;
  private db!: SqlDatabase;
  private closed = false;

  constructor(options: LedgerOptions) {
    this.options = { ...options };
    this.directory = assertDisposableDirectory(options.directory);
    this.databasePath = join(this.directory, "ledger.sqlite");
    this.anchorPath = join(this.directory, "anchor.json");
    for (const value of [options.machineIdSha256, options.ledgerKeyNameSha256, options.registryHash]) {
      assertHash(value, "E_LEDGER_ANCHOR_MISMATCH");
    }
    mkdirSync(this.directory, { recursive: true });
    const creating = !existsSync(this.databasePath);
    try {
      this.db = new DatabaseSync(this.databasePath);
      this.configure(creating);
      if (creating) this.initialize();
      else this.verifyOpenState();
    } catch (error) {
      try {
        this.db?.close();
      } catch {
        // Preserve the original fail-closed refusal while releasing any opened handle.
      }
      if (error instanceof AuthorityV3R3LedgerRefusal) throw error;
      refuse("E_LEDGER_CORRUPT_AT_RESERVATION");
    }
  }

  reserve(input: Reservation, options?: { crashAfter?: CrashPoint }): Receipt {
    this.assertOpen();
    assertHash(input.nonceHash, "E_LEDGER_LEASE_OR_NONCE_CONFLICT");
    if (!Number.isInteger(input.authorityGeneration) || input.authorityGeneration < 0) {
      refuse("E_LEDGER_LEASE_OR_NONCE_CONFLICT");
    }
    if (input.expiresAt <= input.acquiredAt) refuse("E_LEDGER_LEASE_OR_NONCE_CONFLICT");
    if (this.nonce(input.nonceHash, input.authorityGeneration)) {
      refuse("E_LEDGER_LEASE_OR_NONCE_CONFLICT");
    }
    if (this.db.prepare("SELECT 1 AS found FROM run_leases WHERE concurrency_domain=? AND state='HELD'")
      .get(input.concurrencyDomain)) {
      refuse("E_LEDGER_LEASE_OR_NONCE_CONFLICT");
    }

    const prepared = this.prepare({
      nonceHash: input.nonceHash,
      authorityGeneration: input.authorityGeneration,
      fromState: "ISSUED",
      toState: "RESERVED",
      reservation: input,
    });
    return this.completePrepared(prepared, options?.crashAfter);
  }

  transition(
    nonceHash: string,
    authorityGeneration: number,
    toState: string,
    passEvidence?: {
      approvedReviewRootSha256: string;
      cleanupVerified: boolean;
      passedGateCount: number;
    },
    options?: { crashAfter?: CrashPoint }
  ): Receipt {
    this.assertOpen();
    const current = this.nonce(nonceHash, authorityGeneration);
    if (!current) refuse("E_LEDGER_ANCHOR_MISMATCH");
    const fromState = string(current.state, "E_LEDGER_ANCHOR_MISMATCH");
    if (!ALLOWED_TRANSITIONS.has(`${fromState}->${toState}`)) {
      refuse("E_LEDGER_TERMINAL_TRANSITION_DUPLICATE");
    }
    if (toState === "CONSUMED_PASS") {
      if (
        !passEvidence ||
        !HASH.test(passEvidence.approvedReviewRootSha256) ||
        passEvidence.cleanupVerified !== true ||
        passEvidence.passedGateCount !== 23
      ) {
        refuse("E_LEDGER_FINALIZATION_INVALID");
      }
    }
    const prepared = this.prepare({
      nonceHash,
      authorityGeneration,
      fromState,
      toState,
      passEvidence: passEvidence ?? null,
    });
    return this.completePrepared(prepared, options?.crashAfter);
  }

  recover({ now }: { now: number }): { recovered: number; consumedFail: number } {
    this.assertOpen();
    this.verifyStorageConfiguration();
    this.verifyLogicalSchema();
    let recovered = 0;
    let consumedFail = 0;
    const prepared = this.readPrepared();
    if (prepared) {
      const meta = this.meta();
      const anchor = this.readAnchor();
      let durablePrepared = prepared;
      if (anchor.generation === number(meta.disk_generation, "E_LEDGER_ANCHOR_MISMATCH")) {
        durablePrepared = this.proveDurability(prepared);
        this.advanceAnchor(durablePrepared);
      } else if (
        anchor.generation !== prepared.expectedGeneration ||
        anchor.eventHeadSha256 !== prepared.preparedEventHash
      ) {
        refuse("E_LEDGER_TORN_WRITE_UNRECOVERABLE");
      }
      this.finalize(durablePrepared);
      recovered += 1;
      const current = this.nonce(prepared.nonceHash, prepared.authorityGeneration);
      if (current && !TERMINAL.has(string(current.state, "E_LEDGER_ANCHOR_MISMATCH"))) {
        this.transition(prepared.nonceHash, prepared.authorityGeneration, "CONSUMED_FAIL");
        consumedFail += 1;
      }
    }

    const rows = this.db.prepare(
      "SELECT nonce_hash, authority_generation, state, windows_boot_id, wsl_boot_id, expires_at " +
      "FROM nonce_current WHERE state NOT IN ('CONSUMED_PASS','CONSUMED_FAIL','EXPIRED_UNUSED')"
    ).all();
    for (const row of rows) {
      const bootChanged =
        row.windows_boot_id !== this.options.windowsBootId || row.wsl_boot_id !== this.options.wslBootId;
      const expired = number(row.expires_at, "E_LEDGER_ANCHOR_MISMATCH") < now;
      if (bootChanged || expired) {
        this.transition(
          string(row.nonce_hash, "E_LEDGER_ANCHOR_MISMATCH"),
          number(row.authority_generation, "E_LEDGER_ANCHOR_MISMATCH"),
          "CONSUMED_FAIL"
        );
        consumedFail += 1;
      }
    }
    return { recovered, consumedFail };
  }

  inspectNonce(nonceHash: string, authorityGeneration: number): SqlRow | undefined {
    return this.nonce(nonceHash, authorityGeneration);
  }

  inspectLease(concurrencyDomain: string): SqlRow | undefined {
    this.assertOpen();
    return this.db.prepare("SELECT * FROM run_leases WHERE concurrency_domain=?").get(concurrencyDomain);
  }

  checkpoint(): void {
    this.assertOpen();
    const result = this.db.prepare("PRAGMA wal_checkpoint(FULL)").get();
    if (result && number(result.busy, "E_LEDGER_PREPARE_NOT_DURABLE") !== 0) {
      refuse("E_LEDGER_PREPARE_NOT_DURABLE");
    }
    syncFile(this.databasePath);
    const wal = `${this.databasePath}-wal`;
    if (existsSync(wal)) syncFile(wal);
  }

  close(): void {
    if (!this.closed) {
      this.db.close();
      this.closed = true;
    }
  }

  private configure(creating: boolean): void {
    if (creating) {
      this.db.exec(`PRAGMA page_size=4096; PRAGMA application_id=${APPLICATION_ID};`);
    }
    this.db.exec("PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL; PRAGMA foreign_keys=ON;");
    this.verifyStorageConfiguration();
  }

  private verifyStorageConfiguration(): void {
    const application = this.db.prepare("PRAGMA application_id").get();
    const pageSize = this.db.prepare("PRAGMA page_size").get();
    const synchronous = this.db.prepare("PRAGMA synchronous").get();
    const journal = this.db.prepare("PRAGMA journal_mode").get();
    if (
      number(application?.application_id, "E_LEDGER_CORRUPT_AT_RESERVATION") !== APPLICATION_ID ||
      number(pageSize?.page_size, "E_LEDGER_CORRUPT_AT_RESERVATION") !== 4096 ||
      number(synchronous?.synchronous, "E_LEDGER_CORRUPT_AT_RESERVATION") !== 2 ||
      string(journal?.journal_mode, "E_LEDGER_CORRUPT_AT_RESERVATION").toLowerCase() !== "wal"
    ) {
      refuse("E_LEDGER_CORRUPT_AT_RESERVATION");
    }
  }

  private initialize(): void {
    this.db.exec(`
      CREATE TABLE ledger_meta(
        ledger_id TEXT PRIMARY KEY,
        schema_version TEXT NOT NULL,
        disk_generation INTEGER NOT NULL,
        disk_head_hash TEXT NOT NULL,
        machine_id_hash TEXT NOT NULL,
        ledger_key_name_hash TEXT NOT NULL
      );
      CREATE TABLE nonce_current(
        nonce_hash TEXT NOT NULL,
        authority_generation INTEGER NOT NULL,
        state TEXT NOT NULL,
        run_id TEXT NOT NULL,
        lease_id TEXT NOT NULL,
        windows_boot_id TEXT NOT NULL,
        wsl_boot_id TEXT NOT NULL,
        expires_at INTEGER NOT NULL,
        final_event_sequence INTEGER,
        PRIMARY KEY(nonce_hash, authority_generation)
      );
      CREATE TABLE nonce_events(
        event_sequence INTEGER PRIMARY KEY,
        nonce_hash TEXT NOT NULL,
        authority_generation INTEGER NOT NULL,
        prior_event_hash TEXT NOT NULL,
        event_hash TEXT NOT NULL UNIQUE,
        transition TEXT NOT NULL,
        transaction_id TEXT NOT NULL UNIQUE,
        anchor_generation INTEGER NOT NULL UNIQUE,
        anchor_quote_hash TEXT,
        commit_state TEXT NOT NULL
      );
      CREATE TABLE run_leases(
        concurrency_domain TEXT PRIMARY KEY,
        lease_id TEXT NOT NULL UNIQUE,
        nonce_hash TEXT NOT NULL,
        authority_generation INTEGER NOT NULL,
        owner_identity TEXT NOT NULL,
        acquired_at INTEGER NOT NULL,
        expires_at INTEGER NOT NULL,
        state TEXT NOT NULL CHECK(state IN ('HELD','RELEASED'))
      );
      CREATE TABLE anchor_prepared(
        transaction_id TEXT PRIMARY KEY,
        expected_generation INTEGER NOT NULL UNIQUE,
        prepared_event_hash TEXT NOT NULL UNIQUE,
        disk_fsync_receipt_hash TEXT,
        state TEXT NOT NULL
      );
      CREATE UNIQUE INDEX one_prepared_anchor ON anchor_prepared((1)) WHERE state='PREPARED';
      CREATE UNIQUE INDEX one_terminal_event ON nonce_events(nonce_hash, authority_generation)
        WHERE transition LIKE '%->CONSUMED_%' OR transition LIKE '%->EXPIRED_UNUSED';
      CREATE TRIGGER committed_event_no_update BEFORE UPDATE ON nonce_events
        WHEN OLD.commit_state='COMMITTED' BEGIN SELECT RAISE(ABORT, 'COMMITTED_EVENT_IMMUTABLE'); END;
      CREATE TRIGGER committed_event_no_delete BEFORE DELETE ON nonce_events
        WHEN OLD.commit_state='COMMITTED' BEGIN SELECT RAISE(ABORT, 'COMMITTED_EVENT_IMMUTABLE'); END;
      CREATE TRIGGER exact_nonce_state_transition BEFORE UPDATE OF state ON nonce_current
        WHEN NOT (
          (OLD.state='RESERVED' AND NEW.state IN ('ACTIVE','CONSUMED_FAIL')) OR
          (OLD.state='ACTIVE' AND NEW.state IN ('TEARDOWN','CONSUMED_FAIL')) OR
          (OLD.state='TEARDOWN' AND NEW.state IN ('SEALED_PENDING_REVIEW','CONSUMED_FAIL')) OR
          (OLD.state='SEALED_PENDING_REVIEW' AND NEW.state IN ('CONSUMED_PASS','CONSUMED_FAIL'))
        ) BEGIN SELECT RAISE(ABORT, 'INVALID_LEDGER_TRANSITION'); END;
      CREATE TRIGGER terminal_event_required_for_lease_release BEFORE UPDATE OF state ON run_leases
        WHEN OLD.state='HELD' AND NEW.state='RELEASED' AND NOT EXISTS (
          SELECT 1 FROM nonce_events
          WHERE nonce_hash=OLD.nonce_hash AND authority_generation=OLD.authority_generation
            AND commit_state='COMMITTED'
            AND (transition LIKE '%->CONSUMED_%' OR transition LIKE '%->EXPIRED_UNUSED')
        ) BEGIN SELECT RAISE(ABORT, 'TERMINAL_EVENT_REQUIRED'); END;
    `);
    this.db.prepare(
      "INSERT INTO ledger_meta VALUES(?, '3.3.0', 0, ?, ?, ?)"
    ).run(
      this.options.ledgerId,
      ZERO_HASH,
      this.options.machineIdSha256,
      this.options.ledgerKeyNameSha256
    );
    this.writeAnchor({
      schemaVersion: "3.3.0",
      ledgerId: this.options.ledgerId,
      machineIdSha256: this.options.machineIdSha256,
      ledgerKeyNameSha256: this.options.ledgerKeyNameSha256,
      registryHash: this.options.registryHash,
      generation: 0,
      eventHeadSha256: ZERO_HASH,
      lastBootBindingHash: bootHash(this.options.windowsBootId, this.options.wslBootId),
    });
    this.checkpoint();
    this.verifyLogicalSchema();
  }

  private verifyOpenState(): void {
    const meta = this.meta();
    const anchor = this.readAnchor();
    if (
      meta.ledger_id !== this.options.ledgerId ||
      meta.schema_version !== "3.3.0" ||
      anchor.ledgerId !== this.options.ledgerId ||
      meta.ledger_key_name_hash !== this.options.ledgerKeyNameSha256 ||
      anchor.ledgerKeyNameSha256 !== this.options.ledgerKeyNameSha256 ||
      anchor.registryHash !== this.options.registryHash
    ) {
      refuse("E_LEDGER_ANCHOR_MISMATCH");
    }
    this.verifyLogicalSchema();
    if (meta.machine_id_hash !== this.options.machineIdSha256 || anchor.machineIdSha256 !== this.options.machineIdSha256) {
      refuse("E_LEDGER_CROSS_MACHINE_COPY");
    }
    const diskGeneration = number(meta.disk_generation, "E_LEDGER_ANCHOR_MISMATCH");
    if (diskGeneration > anchor.generation) refuse("E_LEDGER_ANCHOR_MISMATCH");
    if (diskGeneration < anchor.generation && !this.readPrepared()) refuse("E_LEDGER_BACKUP_RESTORE");
    if (diskGeneration === anchor.generation && meta.disk_head_hash !== anchor.eventHeadSha256) {
      refuse("E_LEDGER_ANCHOR_MISMATCH");
    }
  }

  private prepare(input: {
    nonceHash: string;
    authorityGeneration: number;
    fromState: string;
    toState: string;
    reservation?: Reservation;
    passEvidence?: unknown;
  }): Prepared {
    this.verifyStorageConfiguration();
    this.verifyLogicalSchema();
    const meta = this.meta();
    const anchor = this.readAnchor();
    const diskGeneration = number(meta.disk_generation, "E_LEDGER_ANCHOR_MISMATCH");
    if (anchor.generation !== diskGeneration || anchor.eventHeadSha256 !== meta.disk_head_hash) {
      refuse("E_LEDGER_ANCHOR_MISMATCH");
    }
    if (this.readPrepared()) refuse("E_LEDGER_LEASE_OR_NONCE_CONFLICT");
    const eventSequence = number(
      this.db.prepare("SELECT COALESCE(MAX(event_sequence),0)+1 AS next FROM nonce_events").get()?.next,
      "E_LEDGER_CORRUPT_AT_RESERVATION"
    );
    const transactionId = randomUUID();
    const expectedGeneration = diskGeneration + 1;
    const transition = `${input.fromState}->${input.toState}`;
    const priorEventHash = string(meta.disk_head_hash, "E_LEDGER_ANCHOR_MISMATCH");
    const eventHash = sha256(canonical({
      ledgerId: this.options.ledgerId,
      nonceHash: input.nonceHash,
      authorityGeneration: input.authorityGeneration,
      transactionId,
      expectedGeneration,
      eventSequence,
      priorEventHash,
      transition,
      passEvidence: input.passEvidence ?? null,
    }));

    this.transaction(() => {
      if (input.reservation) {
        this.db.prepare(
          "INSERT INTO nonce_current VALUES(?,?,?,?,?,?,?,?,?)"
        ).run(
          input.nonceHash,
          input.authorityGeneration,
          input.toState,
          input.reservation.runId,
          input.reservation.leaseId,
          this.options.windowsBootId,
          this.options.wslBootId,
          input.reservation.expiresAt,
          eventSequence
        );
        const priorLease = this.db.prepare(
          "SELECT state FROM run_leases WHERE concurrency_domain=?"
        ).get(input.reservation.concurrencyDomain);
        if (priorLease?.state === "HELD") refuse("E_LEDGER_LEASE_OR_NONCE_CONFLICT");
        if (priorLease) {
          const replaced = this.db.prepare(
            "UPDATE run_leases SET lease_id=?, nonce_hash=?, authority_generation=?, owner_identity=?, " +
            "acquired_at=?, expires_at=?, state='HELD' WHERE concurrency_domain=? AND state='RELEASED'"
          ).run(
            input.reservation.leaseId,
            input.nonceHash,
            input.authorityGeneration,
            input.reservation.ownerIdentity,
            input.reservation.acquiredAt,
            input.reservation.expiresAt,
            input.reservation.concurrencyDomain
          );
          if (Number(replaced.changes) !== 1) refuse("E_LEDGER_LEASE_OR_NONCE_CONFLICT");
        } else {
          this.db.prepare(
            "INSERT INTO run_leases VALUES(?,?,?,?,?,?,?, 'HELD')"
          ).run(
            input.reservation.concurrencyDomain,
            input.reservation.leaseId,
            input.nonceHash,
            input.authorityGeneration,
            input.reservation.ownerIdentity,
            input.reservation.acquiredAt,
            input.reservation.expiresAt
          );
        }
      } else {
        const updated = this.db.prepare(
          "UPDATE nonce_current SET state=?, final_event_sequence=? WHERE nonce_hash=? AND authority_generation=? AND state=?"
        ).run(input.toState, eventSequence, input.nonceHash, input.authorityGeneration, input.fromState);
        if (Number(updated.changes) !== 1) refuse("E_LEDGER_ANCHOR_MISMATCH");
      }
      this.db.prepare(
        "INSERT INTO nonce_events VALUES(?,?,?,?,?,?,?,?,NULL,'PREPARED')"
      ).run(
        eventSequence,
        input.nonceHash,
        input.authorityGeneration,
        priorEventHash,
        eventHash,
        transition,
        transactionId,
        expectedGeneration
      );
      this.db.prepare(
        "INSERT INTO anchor_prepared VALUES(?,?,?,NULL,'PREPARED')"
      ).run(transactionId, expectedGeneration, eventHash);
    });
    return {
      transactionId,
      expectedGeneration,
      preparedEventHash: eventHash,
      diskFsyncReceiptHash: null,
      nonceHash: input.nonceHash,
      authorityGeneration: input.authorityGeneration,
      transition,
      priorEventHash,
    };
  }

  private completePrepared(prepared: Prepared, crashAfter?: CrashPoint): Receipt {
    if (crashAfter === "T1_COMMITTED") throw new SimulatedLedgerCrash(crashAfter);
    const proven = this.proveDurability(prepared);
    if (crashAfter === "DURABILITY_PROVEN") throw new SimulatedLedgerCrash(crashAfter);
    this.advanceAnchor(proven);
    if (crashAfter === "ANCHOR_ADVANCED") throw new SimulatedLedgerCrash(crashAfter);
    return this.finalize(proven);
  }

  private proveDurability(prepared: Prepared): Prepared {
    this.checkpoint();
    const receipt = sha256(canonical({
      databasePath: this.databasePath,
      transactionId: prepared.transactionId,
      expectedGeneration: prepared.expectedGeneration,
      preparedEventHash: prepared.preparedEventHash,
      checkpointMode: "FULL",
      synchronousMode: "FULL",
      databaseFileFsync: true,
      directoryFsync: "SIMULATED_DISPOSABLE_WITNESS_ONLY",
    }));
    this.transaction(() => {
      const result = this.db.prepare(
        "UPDATE anchor_prepared SET disk_fsync_receipt_hash=? WHERE transaction_id=? AND state='PREPARED' " +
        "AND prepared_event_hash=? AND expected_generation=?"
      ).run(receipt, prepared.transactionId, prepared.preparedEventHash, prepared.expectedGeneration);
      if (Number(result.changes) !== 1) refuse("E_LEDGER_PREPARE_NOT_DURABLE");
    });
    this.checkpoint();
    const readback = this.readPrepared();
    if (!readback || readback.transactionId !== prepared.transactionId || readback.diskFsyncReceiptHash !== receipt) {
      refuse("E_LEDGER_PREPARE_NOT_DURABLE");
    }
    this.verifyIndependentReadback(readback);
    return readback;
  }

  private advanceAnchor(prepared: Prepared): void {
    if (!prepared.diskFsyncReceiptHash) refuse("E_LEDGER_PREPARE_NOT_DURABLE");
    const anchor = this.readAnchor();
    if (anchor.generation !== prepared.expectedGeneration - 1) refuse("E_LEDGER_ANCHOR_MISMATCH");
    this.writeAnchor({
      ...anchor,
      generation: prepared.expectedGeneration,
      eventHeadSha256: prepared.preparedEventHash,
      lastBootBindingHash: bootHash(this.options.windowsBootId, this.options.wslBootId),
    });
  }

  private finalize(prepared: Prepared): Receipt {
    const anchor = this.readAnchor();
    if (
      anchor.generation !== prepared.expectedGeneration ||
      anchor.eventHeadSha256 !== prepared.preparedEventHash
    ) {
      refuse("E_LEDGER_ANCHOR_MISMATCH");
    }
    const anchorQuoteHash = sha256(canonical(anchor));
    let resultingState = "";
    this.transaction(() => {
      const meta = this.meta();
      if (
        number(meta.disk_generation, "E_LEDGER_ANCHOR_MISMATCH") !== prepared.expectedGeneration - 1 ||
        meta.disk_head_hash !== prepared.priorEventHash
      ) {
        refuse("E_LEDGER_ANCHOR_MISMATCH");
      }
      const event = this.db.prepare(
        "SELECT transition FROM nonce_events WHERE transaction_id=? AND commit_state='PREPARED' AND event_hash=?"
      ).get(prepared.transactionId, prepared.preparedEventHash);
      if (!event) refuse("E_LEDGER_ANCHOR_MISMATCH");
      resultingState = string(event.transition, "E_LEDGER_ANCHOR_MISMATCH").split("->")[1] ?? "";
      const eventUpdate = this.db.prepare(
        "UPDATE nonce_events SET anchor_quote_hash=?, commit_state='COMMITTED' " +
        "WHERE transaction_id=? AND commit_state='PREPARED'"
      ).run(anchorQuoteHash, prepared.transactionId);
      if (Number(eventUpdate.changes) !== 1) refuse("E_LEDGER_ANCHOR_MISMATCH");
      const preparedUpdate = this.db.prepare(
        "UPDATE anchor_prepared SET state='COMMITTED' WHERE transaction_id=? AND state='PREPARED'"
      ).run(prepared.transactionId);
      if (Number(preparedUpdate.changes) !== 1) refuse("E_LEDGER_ANCHOR_MISMATCH");
      this.db.prepare(
        "UPDATE ledger_meta SET disk_generation=?, disk_head_hash=? WHERE ledger_id=?"
      ).run(prepared.expectedGeneration, prepared.preparedEventHash, this.options.ledgerId);
      if (TERMINAL.has(resultingState)) {
        this.db.prepare(
          "UPDATE run_leases SET state='RELEASED' WHERE nonce_hash=? AND authority_generation=? AND state='HELD'"
        ).run(prepared.nonceHash, prepared.authorityGeneration);
      }
    });
    this.checkpoint();
    return {
      transactionId: prepared.transactionId,
      nonceHash: prepared.nonceHash,
      authorityGeneration: prepared.authorityGeneration,
      state: resultingState,
      generation: prepared.expectedGeneration,
      eventHash: prepared.preparedEventHash,
    };
  }

  private readPrepared(): Prepared | null {
    const rows = this.db.prepare(
      "SELECT ap.transaction_id, ap.expected_generation, ap.prepared_event_hash, ap.disk_fsync_receipt_hash, " +
      "ne.nonce_hash, ne.authority_generation, ne.transition, ne.prior_event_hash " +
      "FROM anchor_prepared ap JOIN nonce_events ne ON ne.transaction_id=ap.transaction_id " +
      "WHERE ap.state='PREPARED' AND ne.commit_state='PREPARED'"
    ).all();
    if (rows.length > 1) refuse("E_LEDGER_CORRUPT_AT_RESERVATION");
    if (rows.length === 0) return null;
    const row = rows[0];
    return {
      transactionId: string(row.transaction_id, "E_LEDGER_CORRUPT_AT_RESERVATION"),
      expectedGeneration: number(row.expected_generation, "E_LEDGER_CORRUPT_AT_RESERVATION"),
      preparedEventHash: string(row.prepared_event_hash, "E_LEDGER_CORRUPT_AT_RESERVATION"),
      diskFsyncReceiptHash: row.disk_fsync_receipt_hash === null
        ? null
        : string(row.disk_fsync_receipt_hash, "E_LEDGER_CORRUPT_AT_RESERVATION"),
      nonceHash: string(row.nonce_hash, "E_LEDGER_CORRUPT_AT_RESERVATION"),
      authorityGeneration: number(row.authority_generation, "E_LEDGER_CORRUPT_AT_RESERVATION"),
      transition: string(row.transition, "E_LEDGER_CORRUPT_AT_RESERVATION"),
      priorEventHash: string(row.prior_event_hash, "E_LEDGER_CORRUPT_AT_RESERVATION"),
    };
  }

  private nonce(nonceHash: string, authorityGeneration: number): SqlRow | undefined {
    this.assertOpen();
    return this.db.prepare(
      "SELECT * FROM nonce_current WHERE nonce_hash=? AND authority_generation=?"
    ).get(nonceHash, authorityGeneration);
  }

  private meta(): SqlRow {
    const row = this.db.prepare("SELECT * FROM ledger_meta").get();
    if (!row) refuse("E_LEDGER_CORRUPT_AT_RESERVATION");
    return row;
  }

  private verifyLogicalSchema(): void {
    const tables = this.db.prepare(
      "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name"
    ).all().map((row) => string(row.name, "E_LEDGER_CORRUPT_AT_RESERVATION"));
    const expected = ["anchor_prepared", "ledger_meta", "nonce_current", "nonce_events", "run_leases"];
    if (canonical(tables) !== canonical(expected)) refuse("E_LEDGER_CORRUPT_AT_RESERVATION");
  }

  private verifyIndependentReadback(expected: Prepared): void {
    const verifier = new DatabaseSync(this.databasePath);
    try {
      const row = verifier.prepare(
        "SELECT ap.transaction_id, ap.expected_generation, ap.prepared_event_hash, " +
        "ap.disk_fsync_receipt_hash, ne.nonce_hash, ne.authority_generation, ne.transition, " +
        "ne.prior_event_hash FROM anchor_prepared ap JOIN nonce_events ne " +
        "ON ne.transaction_id=ap.transaction_id WHERE ap.state='PREPARED' " +
        "AND ne.commit_state='PREPARED' AND ap.transaction_id=?"
      ).get(expected.transactionId);
      if (
        !row ||
        row.expected_generation !== expected.expectedGeneration ||
        row.prepared_event_hash !== expected.preparedEventHash ||
        row.disk_fsync_receipt_hash !== expected.diskFsyncReceiptHash ||
        row.nonce_hash !== expected.nonceHash ||
        row.authority_generation !== expected.authorityGeneration ||
        row.transition !== expected.transition ||
        row.prior_event_hash !== expected.priorEventHash
      ) {
        refuse("E_LEDGER_PREPARE_NOT_DURABLE");
      }
    } catch (error) {
      if (error instanceof AuthorityV3R3LedgerRefusal) throw error;
      refuse("E_LEDGER_PREPARE_NOT_DURABLE");
    } finally {
      verifier.close();
    }
  }

  private readAnchor(): Anchor {
    try {
      const parsed = JSON.parse(readFileSync(this.anchorPath, "utf8")) as Partial<Anchor>;
      if (
        parsed.schemaVersion !== "3.3.0" ||
        typeof parsed.ledgerId !== "string" ||
        typeof parsed.machineIdSha256 !== "string" ||
        typeof parsed.ledgerKeyNameSha256 !== "string" ||
        typeof parsed.registryHash !== "string" ||
        !Number.isSafeInteger(parsed.generation) ||
        Number(parsed.generation) < 0 ||
        typeof parsed.eventHeadSha256 !== "string" ||
        typeof parsed.lastBootBindingHash !== "string" ||
        !HASH.test(parsed.machineIdSha256) ||
        !HASH.test(parsed.ledgerKeyNameSha256) ||
        !HASH.test(parsed.registryHash) ||
        !HASH.test(parsed.eventHeadSha256) ||
        !HASH.test(parsed.lastBootBindingHash)
      ) {
        refuse("E_LEDGER_ANCHOR_MISMATCH");
      }
      return parsed as Anchor;
    } catch (error) {
      if (error instanceof AuthorityV3R3LedgerRefusal) throw error;
      refuse("E_LEDGER_ANCHOR_MISMATCH");
    }
  }

  private writeAnchor(anchor: Anchor): void {
    const temporary = join(dirname(this.anchorPath), `.anchor-${randomUUID()}.tmp`);
    writeFileSync(temporary, canonical(anchor), { encoding: "utf8", flag: "wx" });
    syncFile(temporary);
    renameSync(temporary, this.anchorPath);
    if (existsSync(temporary)) unlinkSync(temporary);
  }

  private transaction(action: () => void): void {
    this.db.exec("BEGIN IMMEDIATE");
    try {
      action();
      this.db.exec("COMMIT");
    } catch (error) {
      try {
        this.db.exec("ROLLBACK");
      } catch {
        // Preserve the original fail-closed error.
      }
      if (error instanceof AuthorityV3R3LedgerRefusal) throw error;
      const message = error instanceof Error ? error.message : "";
      if (message.includes("UNIQUE") || message.includes("constraint")) {
        refuse("E_LEDGER_LEASE_OR_NONCE_CONFLICT");
      }
      refuse("E_LEDGER_CORRUPT_AT_RESERVATION");
    }
  }

  private assertOpen(): void {
    if (this.closed) refuse("E_LEDGER_UNAVAILABLE");
  }
}
