/* Versioned build pipeline (Phase 1.4B.1).

   The old `prisma migrate deploy && next build` ran migrations in EVERY
   environment, which is exactly how a preview build ended up demanding the
   production DIRECT_URL. This script computes an explicit plan from
   VERCEL_ENV and fails closed on anything it does not recognize:

     preview      -> next build only. No migration, no DIRECT_URL, no
                     database writes at build time, ever.
     production   -> verify DIRECT_URL is present, then
                     prisma migrate deploy && next build.
     development  -> next build only (local checks; migrations stay a
                     deliberate `npm run db:migrate`).
     anything else (including unset) -> fail closed.

   computePlan and resolveCommands are exported so the test suite (and its
   mutations) can prove the preview path can never reach a migration and CLI
   bundler selection cannot become shell injection. */

import { execSync } from "node:child_process";

export function computePlan(env) {
  const target = env.VERCEL_ENV;
  if (target === "preview") {
    return { env: "preview", requires: [], commands: ["next build"] };
  }
  if (target === "development") {
    return { env: "development", requires: [], commands: ["next build"] };
  }
  if (target === "production") {
    if (!env.DIRECT_URL) {
      throw new Error(
        "production build requires DIRECT_URL for prisma migrate deploy; refusing to guess",
      );
    }
    return {
      env: "production",
      requires: ["DIRECT_URL"],
      commands: ["prisma migrate deploy", "next build"],
    };
  }
  throw new Error(
    `unknown VERCEL_ENV ${JSON.stringify(target)} - failing closed (set VERCEL_ENV to preview, development or production)`,
  );
}

const ALLOWED_BUILD_ARGUMENTS = new Set(["--webpack", "--turbopack"]);

export function resolveCommands(plan, cliArguments = []) {
  for (const argument of cliArguments) {
    if (!ALLOWED_BUILD_ARGUMENTS.has(argument)) {
      throw new Error(`unsupported build argument ${JSON.stringify(argument)} - failing closed`);
    }
  }
  if (cliArguments.includes("--webpack") && cliArguments.includes("--turbopack")) {
    throw new Error("conflicting build arguments --webpack and --turbopack - failing closed");
  }
  const suffix = cliArguments.length > 0 ? ` ${cliArguments.join(" ")}` : "";
  return plan.commands.map((command) => (command === "next build" ? `${command}${suffix}` : command));
}

const invokedDirectly =
  process.argv[1] && import.meta.url.endsWith(process.argv[1].replace(/\\/g, "/").split("/").pop());

if (invokedDirectly) {
  const plan = computePlan(process.env);
  const commands = resolveCommands(plan, process.argv.slice(2));
  console.log(`[vercel-build] env=${plan.env} plan=${commands.join(" && ")}`);
  for (const cmd of commands) {
    execSync(cmd, { stdio: "inherit", env: process.env });
  }
}
