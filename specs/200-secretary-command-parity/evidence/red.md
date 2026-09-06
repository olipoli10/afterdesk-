# RED evidence — 2026-09-05

A direct probe of `interpretOperatingAssistantCommand` with synthetic Laval and Marc context returned:

- schedule example: `AGENDA_QUERY` — correct;
- appointment example: `UNSUPPORTED` — mismatch;
- completed-work example: `UNSUPPORTED` — mismatch;
- one-recipient SMS example: `CLARIFICATION_REQUIRED` because no exact body followed `que` — mismatch;
- broadcast example: `UNSUPPORTED` — no conversational batch integration.

No database, provider or external effect was used.
