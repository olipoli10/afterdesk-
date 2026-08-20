# Pre-production checklist — provider spend safety

Two INDEPENDENT controls. Neither replaces the other, and they are measured on
different clocks:

| | AfterDesk's circuit breaker (R5/R5.1/R5.2) | Anthropic's own cap |
|---|---|---|
| Where | this application, `src/server/account-spend.ts` | the provider account |
| Window | **UTC calendar day** | **calendar month** |
| Granularity | per call, reserved before dispatch | aggregate, after the spend |
| Can it demote a step to a human? | yes | no |
| Can it be asserted from CI? | yes | no (Console-only on Claude Platform) |

Because the windows differ, **never copy one value into the other**. Mirroring a
daily figure into a monthly cap wedges production for the rest of the month
after roughly one day; conversely the application ceiling only bounds monthly
provider exposure at about **31×** its configured value.

---

## 1. ANTHROPIC HARD MONTHLY SPEND LIMIT VERIFIED

Manual, in the Anthropic Console. Do not automate; there is no API for this on a
Claude Platform organisation.

- [ ] **Production key lives in a DEDICATED, non-Default workspace.**
      Limits cannot be set on the Default Workspace, so a key minted there can
      never be capped.
      _Evidence to record:_ workspace name, and the date the production
      `ANTHROPIC_API_KEY` was minted inside it.
- [ ] **Workspace monthly spend limit is set**, sized to the maximum monthly
      provider loss the pilot tolerates (≥ ~31× the daily app ceiling if the
      application is to be the first brake).
      _Evidence:_ the limit value and a screenshot/date.
- [ ] **Organisation spend limit is set below the tier cap**, covering the
      production workspace **plus** the auto-created Claude Code workspace
      **plus** Console/Workbench usage.
      _Evidence:_ org limit value, current tier, and that tier's cap.
- [ ] **Credit auto-reload is OFF** (or set to a small reload amount).
      With auto-reload on, the prepaid balance stops being a hard stop.
      _Evidence:_ auto-reload state and date checked.
- [ ] **Notifications added at ~50% / 80%** — recorded explicitly as ALERTS,
      not stops, so nobody later mistakes them for a cap.

Tier caps for reference (per calendar month, service-set): Start $500,
Build $1,000, Scale $200,000; Custom has none.

## 2. APPLICATION CEILING CONFIGURED

- [ ] `ACCOUNT_PROVIDER_SPEND_CEILING_ANTHROPIC_MICROS` set (or the legacy
      un-suffixed `ACCOUNT_PROVIDER_SPEND_CEILING_MICROS`).
      **Unset in production = every billable Anthropic call is refused** and
      automated steps demote to human work. That is deliberate; it is not a
      silent "unlimited".
- [ ] `ACCOUNT_PROVIDER_SPEND_CEILING_VOYAGE_MICROS` set **if** embeddings are
      enabled. Ceilings are per provider on purpose: one shared value would
      permit its full amount to EACH provider independently.
- [ ] `VOYAGE_EMBEDDING_MICROS_PER_MILLION_TOKENS` set from Voyage's current
      published pricing **if** `VOYAGE_API_KEY` is set.
      This repository contains no Voyage rate by design — inventing one would
      put a fabricated number in the ledger. **Unset in production = the
      embedding call is not made**, the task still submits, and the admin prices
      it manually.
      _Evidence:_ the rate used, the Voyage pricing page it came from, and the
      date read.

## 3. FIRST-DAY OBSERVATION

- [ ] `/admin/reliability` shows a per-provider row, and "committed" is read as
      *settled + reserved worst case*, not as money already spent.
- [ ] "N calls blocked today" is 0, or its non-zero value is understood.
      A high count usually means the ceiling is too low for real volume — check
      it against actual settled spend before raising it, since the headline
      includes worst-case padding.

---

**Reminder for whoever raises a ceiling later:** the number on the card is
committed exposure, not spend. Raising a ceiling because the headline looks
close to it is a spend-increasing decision made against a deliberately
pessimistic figure. Compare `settled` alone first.
