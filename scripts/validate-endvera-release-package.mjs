import { readFileSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import {
  buildReleaseManifest,
  canonicalJson,
  defaultRepositoryRoot,
  manifestRelativePath,
  sha256,
} from "./generate-endvera-release-package.mjs";

export function validateReleaseManifest({ repositoryRoot = defaultRepositoryRoot, manifest, readFile = readFileSync }) {
  if (!manifest || typeof manifest !== "object") throw new Error("RELEASE_MANIFEST_INVALID");
  const { manifestHash, ...base } = manifest;
  if (manifestHash !== sha256(canonicalJson(base))) throw new Error("RELEASE_MANIFEST_HASH_MISMATCH");
  const rebuilt = buildReleaseManifest({ repositoryRoot, sourceHead: manifest.source?.head, sourceTree: manifest.source?.tree, readFile });
  if (canonicalJson(rebuilt) !== canonicalJson(manifest)) throw new Error("RELEASE_INPUT_HASH_MISMATCH");
  return rebuilt;
}

if (process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url) {
  const manifestPath = path.resolve(defaultRepositoryRoot, manifestRelativePath);
  const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
  const validated = validateReleaseManifest({ manifest });
  process.stdout.write(`LOCAL_PACKAGE_VALID ${validated.manifestHash}\n`);
}
