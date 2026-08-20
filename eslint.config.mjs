import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    ".prisma-client/**",
    "next-env.d.ts",
    ".tmp-voice-*/**",
    "docs/evidence/endvera-portal-voice/**/chrome-profile-*/**",
  ]),
  {
    // The AI assistant's isolation from task/client data (see the doc
    // comment on askAssistant in src/lib/assistant-ai.ts) is a real
    // guarantee only as long as these two files never import a
    // content-bearing task query. Today they simply don't — this rule is
    // what stops that from silently changing in a future PR: a violation
    // fails the build instead of depending on a reviewer noticing.
    files: ["src/lib/assistant-ai.ts", "src/server/actions/va-assistant.ts"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          paths: [
            {
              name: "@/lib/queries/tasks",
              message:
                "The AI assistant must never import task-content queries (vaTaskSelect, taskForVa, etc.) — it only knows what the worker explicitly types. If you need a status check, write a minimal inline prisma.task.findFirst selecting only id/claimedById/status.",
            },
          ],
        },
      ],
    },
  },
]);

export default eslintConfig;
