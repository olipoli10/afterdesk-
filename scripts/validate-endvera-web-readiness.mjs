import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

export const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function object(value, error) {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error(error);
  return value;
}

function hasValueField(value) {
  if (!value || typeof value !== "object") return false;
  if (Array.isArray(value)) return value.some(hasValueField);
  return Object.entries(value).some(([key, child]) => key === "value" || key === "values" || hasValueField(child));
}

export function validateWebProductionReadiness({ readiness, environment, root = repositoryRoot }) {
  readiness = object(readiness, "WEB_READINESS_INVALID");
  environment = object(environment, "WEB_READINESS_ENVIRONMENT_INVALID");
  if (
    readiness.schemaVersion !== 1 ||
    readiness.readiness !== "READY_FOR_DEPLOYMENT_AUTHORITY" ||
    readiness.publicOriginSelected !== false ||
    readiness.deployed !== false ||
    readiness.published !== false ||
    readiness.providerObserved !== false ||
    readiness.externalEffectCount !== 0
  ) throw new Error("WEB_READINESS_CLAIM_INFLATION_REFUSED");
  if (environment.schemaVersion !== 2 || environment.artifactValuePolicy !== "NAMES_AND_REQUIREMENT_STATES_ONLY" || environment.secretValuesSerializable !== false || environment.externalReleaseAuthorized !== false || hasValueField(environment)) throw new Error("WEB_READINESS_VALUE_MATERIAL_REFUSED");

  const variables = Array.isArray(environment.variables) ? environment.variables : [];
  if (variables.length !== 24 || new Set(variables.map((entry) => entry.name)).size !== variables.length) throw new Error("WEB_READINESS_ENVIRONMENT_INCOMPLETE");
  for (const entry of variables) {
    if (!entry.name || !entry.runtime || !entry.classification || !entry.production) throw new Error("WEB_READINESS_ENVIRONMENT_INCOMPLETE");
  }

  const routes = Array.isArray(readiness.routes) ? readiness.routes : [];
  if (routes.length !== 11 || new Set(routes.map((route) => route.path)).size !== routes.length) throw new Error("WEB_READINESS_ROUTE_SET_MISMATCH");
  for (const route of routes) {
    if (typeof route.sourcePath !== "string" || path.isAbsolute(route.sourcePath) || route.sourcePath.split(/[\\/]/u).includes("..") || !existsSync(path.resolve(root, route.sourcePath))) throw new Error("WEB_READINESS_ROUTE_MISSING");
  }

  const blockers = Array.isArray(readiness.deploymentBlockers) ? readiness.deploymentBlockers : [];
  if (blockers.length !== 6 || blockers.some((entry) => !entry.code || !entry.ownerClass || !entry.evidenceRequired || "value" in entry)) throw new Error("WEB_READINESS_BLOCKERS_INCOMPLETE");
  if (!readiness.smokeContract?.beforePromotion?.includes("/api/health") || !readiness.smokeContract?.rollbackTriggers?.includes("EXTERNAL_EFFECT_WITHOUT_AUTHORITY")) throw new Error("WEB_READINESS_ROLLBACK_INCOMPLETE");
  return { status: readiness.readiness, routesChecked: routes.length, variablesChecked: variables.length, externalEffectCount: 0 };
}

function readJson(relativePath) {
  return JSON.parse(readFileSync(path.resolve(repositoryRoot, relativePath), "utf8"));
}

if (process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url) {
  const readiness = readJson("release/endvera-construction-v1/web-production-readiness.json");
  const environment = readJson(readiness.environmentContractPath);
  const result = validateWebProductionReadiness({ readiness, environment });
  process.stdout.write(`${result.status} routes=${result.routesChecked} variables=${result.variablesChecked} externalEffectCount=0\n`);
}
