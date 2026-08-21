import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

import {
  AuthorityV3R3StaticRefusal,
  validateAuthorityV3R3DesignBundle,
} from "../src/lib/engineering-factory/authority-v3-r3-static";

const file = resolve(
  process.argv[2] ??
    "docs/engineering-factory/AUTHORITY_V3_CANDIDATE_COMPATIBILITY_SCHEMA_EXAMPLE.json"
);

async function main(): Promise<void> {
  try {
    const report = validateAuthorityV3R3DesignBundle(await readFile(file, "utf8"));
    process.stdout.write(`${JSON.stringify({ file, ...report }, null, 2)}\n`);
  } catch (error) {
    if (error instanceof AuthorityV3R3StaticRefusal) {
      process.stderr.write(`${error.message}\n`);
      process.exitCode = 64;
    } else {
      process.stderr.write("AUTHORITY_V3_R3_STATIC_INTERNAL_FAILURE\n");
      process.exitCode = 70;
    }
  }
}

void main();
