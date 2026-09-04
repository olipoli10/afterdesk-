import "server-only";

import { randomUUID } from "node:crypto";
import { link, mkdir, opendir, readFile, readdir, stat, unlink, writeFile } from "node:fs/promises";
import path from "node:path";

const LOCAL_STORAGE_KEY =
  /^[A-Za-z0-9][A-Za-z0-9._-]*(?:\/[A-Za-z0-9][A-Za-z0-9._-]*)*$/u;

export class LocalStorageKeyError extends Error {
  constructor() {
    super("The local storage key is invalid.");
    this.name = "LocalStorageKeyError";
  }
}

export class LocalObjectStorageError extends Error {
  constructor(operation: "put" | "read" | "exists" | "delete" | "list", cause?: unknown) {
    super(`Local object storage ${operation} failed.`, { cause });
    this.name = "LocalObjectStorageError";
  }
}

export type LocalObjectStorage = Readonly<{
  put: (key: string, data: Buffer) => Promise<void>;
  read: (key: string) => Promise<Buffer>;
  exists: (key: string) => Promise<boolean>;
  delete: (key: string) => Promise<void>;
  list: (prefix: string) => Promise<readonly LocalObjectEntry[]>;
  scan: (
    prefix: string,
    input: LocalObjectScanInput,
  ) => Promise<LocalObjectScanBatch>;
}>;

export type LocalObjectEntry = Readonly<{
  key: string;
  modifiedAtMs: number;
}>;

export type LocalObjectScanInput = Readonly<{
  maxScannedEntries: number;
  maxResults: number;
  modifiedBeforeMs?: number;
}>;

export type LocalObjectScanBatch = Readonly<{
  entries: readonly LocalObjectEntry[];
  scannedEntries: number;
  cycleComplete: boolean;
}>;

export const LOCAL_OBJECT_SCAN_MAX_ENTRIES = 256;

type LocalObjectScanVisit = LocalObjectEntry | null;

/**
 * Creates a filesystem-only object store rooted at an explicit directory.
 *
 * Backend selection is deliberately absent. Callers cannot turn this store
 * into a remote store through runtime configuration, and opaque keys are
 * restricted to canonical slash-separated path segments.
 */
export function createLocalObjectStorage(rootDirectory: string): LocalObjectStorage {
  if (!rootDirectory.trim() || rootDirectory.includes("\0")) {
    throw new LocalStorageKeyError();
  }
  const root = path.resolve(rootDirectory);
  const scanners = new Map<string, AsyncGenerator<LocalObjectScanVisit>>();
  const scanTails = new Map<string, Promise<void>>();

  async function withScanSerialization<T>(key: string, operation: () => Promise<T>): Promise<T> {
    const previous = scanTails.get(key) ?? Promise.resolve();
    let release: () => void = () => undefined;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const tail = previous.then(() => gate);
    scanTails.set(key, tail);
    await previous;
    try {
      return await operation();
    } finally {
      release();
      if (scanTails.get(key) === tail) scanTails.delete(key);
    }
  }

  function resolveKey(key: string) {
    const segments = key.split("/");
    if (
      key.length > 1_024 ||
      !LOCAL_STORAGE_KEY.test(key) ||
      segments.some((segment) => segment === "." || segment === "..") ||
      path.isAbsolute(key)
    ) {
      throw new LocalStorageKeyError();
    }
    const resolved = path.resolve(root, key);
    const relative = path.relative(root, resolved);
    if (
      relative === "" ||
      relative === ".." ||
      relative.startsWith(`..${path.sep}`) ||
      path.isAbsolute(relative)
    ) {
      throw new LocalStorageKeyError();
    }
    return resolved;
  }

  return Object.freeze({
    async put(key, data) {
      const destination = resolveKey(key);
      const temporary = `${destination}.${randomUUID()}.tmp`;
      try {
        await mkdir(path.dirname(destination), { recursive: true });
        // Publish only complete bytes. A hard link is atomic and refuses to
        // replace an existing object, while still permitting exact concurrent
        // retries to converge on the same content-addressed key.
        await writeFile(temporary, data, { flag: "wx" });
        try {
          await link(temporary, destination);
        } catch (error) {
          if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
          const existing = await readFile(destination);
          if (!existing.equals(data)) {
            throw new Error("LOCAL_OBJECT_IMMUTABILITY_CONFLICT");
          }
        }
      } catch (error) {
        if (error instanceof LocalObjectStorageError) throw error;
        throw new LocalObjectStorageError("put", error);
      } finally {
        try {
          await unlink(temporary);
        } catch (error) {
          if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
            // Never turn a successfully published immutable object into an
            // ambiguous failure. A cleanup failure can leave only an
            // unreferenced temp hard link; the canonical object remains valid.
          }
        }
      }
    },

    async read(key) {
      const source = resolveKey(key);
      try {
        return await readFile(source);
      } catch (error) {
        throw new LocalObjectStorageError("read", error);
      }
    },

    async exists(key) {
      const source = resolveKey(key);
      try {
        return (await stat(source)).isFile();
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === "ENOENT") return false;
        throw new LocalObjectStorageError("exists", error);
      }
    },

    async delete(key) {
      const source = resolveKey(key);
      try {
        await unlink(source);
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
          throw new LocalObjectStorageError("delete", error);
        }
      }
    },

    async list(prefix) {
      const source = resolveKey(prefix);
      const entries: LocalObjectEntry[] = [];
      const walk = async (directory: string, segments: string[]): Promise<void> => {
        const children = await readdir(directory, { withFileTypes: true });
        for (const child of children) {
          if (child.isSymbolicLink()) {
            throw new Error("LOCAL_OBJECT_SYMLINK_REFUSED");
          }
          const childPath = path.join(directory, child.name);
          const childSegments = [...segments, child.name];
          if (child.isDirectory()) {
            await walk(childPath, childSegments);
          } else if (child.isFile()) {
            const metadata = await stat(childPath);
            entries.push({
              key: childSegments.join("/"),
              modifiedAtMs: metadata.mtimeMs,
            });
          }
        }
      };
      try {
        await walk(source, prefix.split("/"));
        return entries.sort((left, right) => left.key.localeCompare(right.key));
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
        throw new LocalObjectStorageError("list", error);
      }
    },

    async scan(prefix, input) {
      const source = resolveKey(prefix);
      if (
        !Number.isSafeInteger(input.maxScannedEntries)
        || input.maxScannedEntries <= 0
        || input.maxScannedEntries > LOCAL_OBJECT_SCAN_MAX_ENTRIES
        || !Number.isSafeInteger(input.maxResults)
        || input.maxResults <= 0
        || input.maxResults > input.maxScannedEntries
        || (
          input.modifiedBeforeMs !== undefined
          && !Number.isFinite(input.modifiedBeforeMs)
        )
      ) {
        throw new LocalStorageKeyError();
      }
      return withScanSerialization(prefix, async () => {
        async function* walk(
          directory: string,
          segments: string[],
        ): AsyncGenerator<LocalObjectScanVisit> {
          const handle = await opendir(directory);
          for await (const child of handle) {
            if (child.isSymbolicLink()) {
              throw new Error("LOCAL_OBJECT_SYMLINK_REFUSED");
            }
            const childPath = path.join(directory, child.name);
            const childSegments = [...segments, child.name];
            if (child.isDirectory()) {
              yield null;
              try {
                yield* walk(childPath, childSegments);
              } catch (error) {
                if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
              }
            } else if (child.isFile()) {
              try {
                const metadata = await stat(childPath);
                yield {
                  key: childSegments.join("/"),
                  modifiedAtMs: metadata.mtimeMs,
                };
              } catch (error) {
                if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
                yield null;
              }
            } else {
              yield null;
            }
          }
        }

        let scanner = scanners.get(prefix);
        if (!scanner) {
          scanner = walk(source, prefix.split("/"));
          scanners.set(prefix, scanner);
        }
        const entries: LocalObjectEntry[] = [];
        let scannedEntries = 0;
        let cycleComplete = false;
        try {
          while (
            scannedEntries < input.maxScannedEntries
            && entries.length < input.maxResults
          ) {
            const visit = await scanner.next();
            if (visit.done) {
              cycleComplete = true;
              scanners.delete(prefix);
              break;
            }
            scannedEntries += 1;
            if (
              visit.value !== null
              && (
                input.modifiedBeforeMs === undefined
                || visit.value.modifiedAtMs < input.modifiedBeforeMs
              )
            ) {
              entries.push(visit.value);
            }
          }
          return Object.freeze({
            entries: Object.freeze(entries),
            scannedEntries,
            cycleComplete,
          });
        } catch (error) {
          scanners.delete(prefix);
          await scanner.return(undefined).catch(() => undefined);
          if ((error as NodeJS.ErrnoException).code === "ENOENT") {
            return Object.freeze({
              entries: Object.freeze([]),
              scannedEntries,
              cycleComplete: true,
            });
          }
          throw new LocalObjectStorageError("list", error);
        }
      });
    },
  });
}

const defaultLocalObjectStorage = createLocalObjectStorage(
  path.join(process.cwd(), "storage"),
);

export function putLocalObject(key: string, data: Buffer): Promise<void> {
  return defaultLocalObjectStorage.put(key, data);
}

export function readLocalObject(key: string): Promise<Buffer> {
  return defaultLocalObjectStorage.read(key);
}

export function localObjectExists(key: string): Promise<boolean> {
  return defaultLocalObjectStorage.exists(key);
}

export function deleteLocalObject(key: string): Promise<void> {
  return defaultLocalObjectStorage.delete(key);
}

export function listLocalObjects(prefix: string): Promise<readonly LocalObjectEntry[]> {
  return defaultLocalObjectStorage.list(prefix);
}

export function scanLocalObjects(
  prefix: string,
  input: LocalObjectScanInput,
): Promise<LocalObjectScanBatch> {
  return defaultLocalObjectStorage.scan(prefix, input);
}
