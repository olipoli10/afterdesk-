import { posix } from "node:path";

import {
  inspectProviderRuntimeSource,
  inspectPublicEntrySource,
} from "@/lib/construction-operating-assistant-r37k/provider-boundary";
import {
  findDynamicCodeExecutionReachability,
  findProviderExecutionReachability,
  findUnresolvedDynamicModuleReachability,
} from "@/lib/construction-operating-assistant-r37l/provider-reachability";

export type ProviderBoundaryReleaseViolation = Readonly<{
  code: string;
  path: string;
  detail?: string;
}>;

const PUBLIC_ROOTS = ["src/app/", "src/server/actions/", "src/jobs/", "src/workers/"] as const;
const PROVIDER_RUNTIME = /^src\/(?:lib|server)\/construction-operating-assistant-r37[a-j]\//u;

function normalizeRepositoryPath(path: string) {
  return posix.normalize(path.replaceAll("\\", "/")).replace(/^\.\//u, "");
}

function isPublicEntrypoint(path: string) {
  return PUBLIC_ROOTS.some((root) => path.startsWith(root));
}

function stable(
  violations: readonly ProviderBoundaryReleaseViolation[],
): ProviderBoundaryReleaseViolation[] {
  return [...violations].sort((left, right) =>
    `${left.path}\u0000${left.detail ?? ""}`.localeCompare(
      `${right.path}\u0000${right.detail ?? ""}`,
    ),
  );
}

export function validateProviderBoundaryModules(
  sourceModules: ReadonlyMap<string, string>,
): ProviderBoundaryReleaseViolation[] {
  const modules = new Map(
    [...sourceModules.entries()].map(([path, source]) => [
      normalizeRepositoryPath(path),
      source,
    ]),
  );

  const direct = stable(
    [...modules.entries()]
      .filter(([path]) => isPublicEntrypoint(path))
      .flatMap(([path, source]) =>
        inspectPublicEntrySource(path, source).map(() => ({
          code: "R37O_DIRECT_PROVIDER_EXECUTION_EXPOSED",
          path,
        })),
      ),
  );

  const runtime = stable(
    [...modules.entries()]
      .filter(([path]) => PROVIDER_RUNTIME.test(path))
      .flatMap(([path, source]) =>
        inspectProviderRuntimeSource(path, source).map((item) => ({
          code: item.code.replace(/^R37K_/u, "R37O_"),
          path,
        })),
      ),
  );

  const transitive = stable(
    findProviderExecutionReachability(modules).map((item) => ({
      code: "R37O_TRANSITIVE_PROVIDER_EXECUTION_EXPOSED",
      path: item.entrypoint,
      detail: item.path.join(" -> "),
    })),
  );

  const unresolved = stable(
    findUnresolvedDynamicModuleReachability(modules).map((item) => ({
      code: "R37O_UNRESOLVED_DYNAMIC_MODULE",
      path: item.entrypoint,
      detail: `${item.callKind}:${item.path.join(" -> ")}`,
    })),
  );

  const dynamicCode = stable(
    findDynamicCodeExecutionReachability(modules).map((item) => ({
      code: "R37O_DYNAMIC_CODE_EXECUTION",
      path: item.entrypoint,
      detail: `${item.executionKind}:${item.path.join(" -> ")}`,
    })),
  );

  return [...direct, ...runtime, ...transitive, ...unresolved, ...dynamicCode];
}
