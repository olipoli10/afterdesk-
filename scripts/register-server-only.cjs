/**
 * The `server-only` package resolves exclusively under React's server
 * conditions, so any script (tsx/node) importing a module that begins with
 * `import "server-only"` dies with MODULE_NOT_FOUND. Vitest solves this with
 * an alias; this is the same shim for plain scripts:
 *
 *   npx tsx --require ./scripts/register-server-only.cjs scripts/<file>.ts

 * CJS by necessity: it is loaded via --require before any ESM/TS transform
 * exists, so require() IS the module system here.
 */
/* eslint-disable @typescript-eslint/no-require-imports */
const Module = require("module");
const path = require("path");
const orig = Module._resolveFilename;
Module._resolveFilename = function (request, ...args) {
  if (request === "server-only") {
    return path.join(__dirname, "server-only-noop.cjs");
  }
  return orig.call(this, request, ...args);
};
