# Environment and local build runbook

1. Work from an exact clean local commit and record HEAD/TREE.
2. Validate environment variable names and presence in memory only. Never print
   values or store a presence report containing values.
3. For local Web build, use a disposable PostgreSQL database and process-local
   synthetic authentication/storage values. `VERCEL_ENV=development` is the
   only authorized R35 build target.
4. For local mobile export, use a loopback/private reachable API origin and
   process-local synthetic values.
5. Run root and mobile lint, TypeScript, tests, Expo Doctor, all-platform local
   export and Next.js Webpack build.
6. Generate the release manifest only after the package payload is committed.

STOP if a credential, external provider, public host, signing identity, EAS,
store, Vercel, Preview, Production, push or deployment becomes necessary.
