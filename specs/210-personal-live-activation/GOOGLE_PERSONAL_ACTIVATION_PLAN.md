# Personal Calendar-only activation continuation

Same mandate ENDVERA-PERSONAL-20260910-100CAD, same queue, not a new goal.
No old R37 budget. No public Afterdesk deployment or extra Android build.

## Current prerequisites and next actions

1. Dedicated Google project/client, owner-only Testing audience and three scope
   declarations are saved. Secret keys exist in dedicated Vercel Production,
   never in mobile or Git. Existing connector encryption/auth secrets preserved.
2. Author reproduced Calendar credentials accidentally enabling social login.
   Explicit `ENDVERA_GOOGLE_SIGN_IN_ENABLED=ENABLED` gate separates those uses;
   absent/DISABLED stays off. Author66/peer69 and full root7086 pass. Wait for
   local build, preserve user-owned tsconfig/drafts, commit only reviewed files.
3. Configure only `ENDVERA_GOOGLE_OAUTH_ENABLED=ENABLED` plus existing global
   transport for the next dedicated publication. Keep SMS, voice, AI, email,
   personal workers, automatic replies, recovery and social login off. Recheck
   exact callback, owner/authority references and pilot expiry first. These are
   developer enablement settings, not owner OAuth consent or action approval.
4. Publish exact reviewed source in the dedicated backend only, using its
   guarded build command with no migration. Preserve public root vercel.json;
   its inherited cron definition is known. Require actual project scheduler
   DISABLED before and immediately after publication. Do not rely on local
   crons:[] or skip-domain as isolation guarantees. Retain prior READY deployment.
5. Verify deployment READY/source/origin, anonymous login/session/guarded routes,
   absence of Google social sign-in, and disabled provider routes. Do not assert
   authenticated Google readiness without an owner session. Stop/contain a gate
   mismatch before permitting a provider attempt; no automatic paid retries.
6. Make the Calendar connection surface available to Olivier for his own sign-in
   and consent. Do not accept Google consent for him or fabricate a verified
   phone/session. Continue independent Twilio/OpenRouter preparation if blocked.

## Completion boundary

This slice finishes at reviewed, safely configured/deployed Calendar connection
availability, or a precise access/configuration blocker. The overall campaign
does not finish: Samsung login, Google read/write, verified SMS pairing and
approved self-only SMS/voice still require actual observed outcomes. No metrics
change from configuration, tests or an APK. Existing heartbeat stays ACTIVE.
