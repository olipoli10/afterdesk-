import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { assertReleaseRegularFile } from "./endvera-release-source-binding.mjs";
import { validateMobileBuildPreparation } from "./endvera-mobile-build-contract.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const readJson = (relativePath) => JSON.parse(readFileSync(assertReleaseRegularFile(root,relativePath), "utf8"));
const app = readJson("apps/mobile/app.json").expo;
const eas = readJson("apps/mobile/eas.json");
const readiness = readJson("release/endvera-construction-v1/mobile-build-readiness.json");
validateMobileBuildPreparation(app,eas,readiness);

process.stdout.write("READY_FOR_SIGNING_AUTHORITY externalEffectCount=0\n");
