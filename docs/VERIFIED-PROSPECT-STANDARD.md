# What Counts as a Verified Prospect

Status: internal working draft. Not client-facing copy. This is the definition the worker checklist, the QC review, and any sales conversation about accuracy should be built from until the founder accepts, rejects, or edits the proposed items in section 5.

Scope: covers the two categories that have a delivery-metrics shape today, research (`prisma/seed.ts` slug `research`) and list-building (`prisma/seed.ts` slug `list-building`). It does not replace either category's `disputeCriteria` string. It operationalizes them into a checklist and flags, explicitly, every place this document asks for more than `disputeCriteria` currently requires.

**What a sales conversation may actually promise today:** only the bar in section 5's "Already true today, unchanged" list, which is what `disputeCriteria` and `qcChecks()` actually enforce and what a delivery can be disputed against. The items in section 5's "Proposed, not yet built" list are targets for the founder to accept or reject, not guarantees, until one of them either ships as a real process change or is explicitly framed to a client as internal practice rather than an audited standard.

## 1. Plain-language definition

**Research.** A "verified" research delivery means: for every record the brief asked for, AfterDesk either ran a real search and recorded what a real source said, saving a link or screenshot when the brief asked for one, or ran a real search, found nothing, and said so plainly instead of guessing. It does not mean every fact is guaranteed accurate today. It means a person did the work and left a trail, or told you honestly where the trail ran out.

**List-building.** A "verified" list-building delivery means: every candidate was checked, one by one, against the specific criteria in the brief, and kept only if it actually met them. For every record kept, each requested field is either filled in from real research or marked missing after that research came up empty. It does not mean every contact detail on the list will work when you use it. It means the list was built by testing each candidate against your stated rules, not assembled by guesswork or dumped from an unfiltered source.

## 2. The checklist a worker runs per record

### 2a. The evidence column: how QC checks this without redoing the research

`delivery-metrics.ts` only ever stores whole-delivery aggregate counts (`recordsComplete`, `recordsWithGap`, and so on). It has no field for which specific contact field had the gap, or which evidence tier applied to a given email or phone number. That is a real gap between what this checklist asks for below and what the stored numbers alone could ever prove, and QC cannot verify a per-field standard by reading a count.

The fix is not a schema change. It is a requirement on the delivered file itself: **every delivery in these two categories must include one evidence note per record**, a short plain-text note next to (or in) the record saying what was checked and how, for example "email: found on staff page" or "phone: switchboard only, no named line found" or "role: LinkedIn only, one source." This is the artifact a reviewer actually reads to spot-check the checklist below in a few minutes, without reopening the original search. It is also what a client sees directly if they open the file, since it travels with the delivery, unlike `Submission.note`, which is deliberately never shown to the client (see the note on that in section 2c).

**Nothing in the codebase validates that this column exists or is filled in today.** No zod schema, no `qcChecks()` flag, checks for it. It is a process requirement for workers and a spot-check habit for QC, not a system-enforced one. Section 5 lists it as proposed, not built.

### 2b. Per-field bar

A record counts toward `recordsComplete` only if every field the brief asked for meets the bar below. If even one field does not, the record counts toward `recordsWithGap` instead (see section 3), and `recordsComplete + recordsWithGap` must still equal `recordsResearched`.

**Already required by `disputeCriteria` today:** the field is populated from an actual search, not invented, and, where the brief asked for sourcing, it is traceable to a source. The task-level `sourceEvidence` value (`link`, `screenshot`, `link_and_screenshot`, or `not_requested`) states what kind of evidence the delivery promises; `findingsWithSavedSource` counts how many researched records actually have it saved. When `sourceEvidence` is `not_requested`, the schema forces `findingsWithSavedSource` to zero, so a fully compliant, "complete" delivery can legally carry no saved link or screenshot at all if the brief never asked for one. That is not a defect; it is what the client's own brief specified. It belongs in section 4's honest limits, not hidden.

**Proposed tightening, not yet required by `disputeCriteria`, not checked by `qcChecks()`, and only checkable via the evidence column in section 2a:**

- **Email.** Counts as populated only if it clears one of: (a) the exact address found published at an authoritative source (company staff page, press byline, filing, the person's own shared LinkedIn contact field), which on its own is strong enough corroboration; or (b) the domain confirmed to match the company's real website plus the name fitting a pattern confirmed from at least one other known address at that company; or (c) a naming pattern confirmed from three or more known addresses at the company, plus the domain's MX records resolving to a real mail provider. A bare syntax check or an MX lookup alone never clears the bar. No SMTP handshake or send-based check is performed as part of this process; see section 4. Whichever of (a), (b), or (c) applied goes in the evidence note.
- **Phone.** Counts as populated only if it appears on the company's own official contact page or Google Business Profile. If the brief asked for a named person's direct line, note plainly whether what was found is that person's direct line, tied to them in a source such as a staff directory or a signature capture, or only the company's general switchboard number. A switchboard number can still count as populated for a phone field, but the evidence note must say which kind it is. A client reading the file can then see for themselves that "phone: found" does not always mean "reaches this person directly."
- **Company identity.** Counts as populated only if the official website is live with real content, not parked, and at least one more independent source agrees: a business registry showing active status, a Google Business or Maps listing, or a LinkedIn company page consistent with the claimed size. Which second source was used goes in the evidence note.
- **Name, role, title.** Counts as populated only if the person's role as of the verification date is confirmed against at least one source, LinkedIn or the company's own team page, matching both the claimed title and company at that time. Roles change after verification and nothing in this process re-checks that automatically; see section 4. If only one source was found, say so in the evidence note rather than presenting it as solidly cross-checked.

### 2c. List-building

`candidatesScreened` must include every candidate actually looked at, including the obvious rejects, because `recordsQualified + recordsRejected` must equal `candidatesScreened`.

A candidate counts toward `recordsQualified` only if it explicitly meets every criterion stated in the brief, checked criterion by criterion. A candidate that is ambiguous or only partially matches defaults to `recordsRejected`, not `recordsQualified`, unless the brief itself defines how to treat borderline cases. This is already what `disputeCriteria` requires ("records match the stated sourcing criteria"), not a new bar.

For a qualified record to count toward `recordsComplete`, every field the brief requested on that record needs to meet the same population bar as research, section 2b, using the same evidence column. Note: the list-building schema has no `sourceEvidence` or `findingsWithSavedSource` field, and today's list-building `disputeCriteria` does not mention traceability to a source at all, unlike research's. Applying the same field bar here is a QC judgment call, not something the schema currently records or enforces field by field. See section 5.

`Submission.note`, separately, stays what it already is: a free-text channel from the worker to the operator, used for delivery-level context (assumptions made, rows that could not be resolved). It is deliberately never shown to the client, because free text can carry a name or an invitation to contact the worker directly. It is not the place for per-record evidence; the evidence column in section 2a is.

## 3. What "marked unavailable" means, and why it is a good answer

`disputeCriteria` already draws this line for both categories: a field explicitly marked unavailable after a real search is compliant; a fabricated or unresearched one is not. This document sharpens what "a real search" has to mean before "unavailable" is honest, not what "unavailable" itself means.

A real search means at least two different attempts using different approaches, not one failed query: try the company's own site and a general search engine, or a general search and a LinkedIn people search, or vary the search terms (a title like "purchasing manager" and a plausible synonym like "procurement lead") before deciding nothing is there.

**This is worker training and a QC spot-check habit, not a system-verified standard.** Neither `disputeCriteria` nor `qcChecks()` requires or counts search attempts, and nothing in the schema logs how many were made; the aggregate `recordsWithGap`/`findingsWithSavedSource` numbers are the only thing `qcChecks()` can actually check after the fact. It is listed as proposed, not built, in section 5.

Marking a field unavailable is a good answer, not a failed one, because it costs the client one blank cell and nothing else. A confident guess costs the client a decision made on false confidence, and once one invented value is found in a delivery, every other row in it becomes suspect, because the operator cannot tell the real findings from the invented ones just by looking. `qcChecks()` already treats a delivery with zero gaps on public data as something to double-check rather than celebrate (`recordsWithGap === 0` raises the flag "Nothing was marked unavailable. Confirm that is real."), which is the schema-level version of the same idea, and this document does not change that check.

## 4. The honest limits

Say these plainly to a client, before the first pilot is sold:

- **Not a deliverability test.** "Verified" here means a person corroborated identity, role, and contact details against public sources. It is not the same claim as a paid deliverability tool (Hunter, ZeroBounce, NeverBounce, or similar) makes, because no such tool is integrated into this platform today and no live send or SMTP-level check is performed as standard process. An email can clear every check in section 2b and still bounce.
- **No guarantee the mailbox is read.** An address can exist and still be dead, forwarded, or ignored. That is outside what desk research can confirm.
- **A snapshot, not a live feed.** Every record reflects what was true when it was researched. The person may change roles or companies, the number may be reassigned, the company may close, after that date, and nothing in this process re-checks it automatically. Every delivery should be understood as accurate as of its research date, not evergreen.
- **No accuracy percentage.** No specific number like "98 percent accurate" can be honestly claimed, because no bounce or return-rate data is currently tracked back to deliveries. A number without that backing would be fabricated precision.
- **"Verified" does not always mean a saved source.** Source evidence, a link or a screenshot, is only required and saved when the brief asks for it. A delivery can be fully compliant and carry no saved documentation at all if the client's own brief never requested it.
- **Not consent or opt-in data.** This is researched prospecting information, not a list of people who agreed to be contacted. It should never be described in a way that implies otherwise.
- **Not a legal compliance check.** Data-accuracy verification and a client's own legal basis for contacting someone (GDPR legitimate interest, CAN-SPAM, CASL, TCPA for phone) are different questions. This standard addresses the former only; the client is responsible for the latter.
- **Isolated inaccuracy or staleness is expected, not a defect.** Research's `disputeCriteria` treats an isolated inaccuracy in publicly-sourced data as normal variance; list-building's treats isolated staleness the same way. Neither is a failed delivery. A sales conversation should set that expectation up front rather than let a client discover it at the first bounced email.

## 5. What this changes, and what it does not

**Already true today, unchanged by this document:**

- Both `disputeCriteria` strings, verbatim, for research and list-building. This document operationalizes them; it does not amend them.
- The delivery-metrics schema and its existing constraints: `recordsComplete + recordsWithGap` must equal `recordsResearched` (research) or `recordsQualified` (list-building); `recordsQualified + recordsRejected` must equal `candidatesScreened`; `findingsWithSavedSource` cannot exceed `recordsResearched` and must be zero when `sourceEvidence` is `not_requested`. No field in this document is new to that schema.
- `qcChecks()`, unchanged: zero gaps flagged for both categories, unresearched records flagged for research, missing saved sources flagged for research, zero rejections flagged for list-building.

**Proposed, not yet built or required, for the founder to decide:**

1. The two-independent-signal floor for email and phone fields, and the matching per-field evidence column that makes it checkable (section 2a and 2b). Today, `disputeCriteria` and the schema only check that a field is populated and, for research, sourced when asked; neither distinguishes a weakly-supported guess from a well-corroborated value at the field level, and nothing enforces that a delivered file even carries the evidence column. This can start as a worker-training and QC spot-check practice with zero code change, since the evidence column lives in the delivered file, not in the JSON schema. A later, stronger version would capture it structurally, one confidence-tier label per contact field in `delivery-metrics.ts`, so it is aggregable and auditable rather than living only in free-form file notes; that is a real schema and `METRIC_ENUM_LABELS` change and is not built.
2. The two-attempt definition of "a real search" (section 3). Neither `disputeCriteria` string defines what a real search is, and nothing counts search attempts. Recommend adopting it as a worker-training and QC-judgment standard now, with no schema change, since there is nowhere to log an attempt count without adding a field nobody has asked for yet.
3. A defined "verified as of" convention with a re-verification window, for example 60 to 90 days, before a delivery's contact data is treated as current. Nothing in the schema stores a per-record research date today; this would either lean on existing task or submission timestamps already in Prisma, or require a new field if per-record dating is wanted. Flagged as a proposal, not a current guarantee.
4. Applying the same field-population floor to list-building even though its schema has no `sourceEvidence` or `findingsWithSavedSource` equivalent, and its `disputeCriteria` does not mention source traceability at all. Recommend treating this as a QC practice for now, backed by the same evidence-column requirement. Adding matching fields to `listBuildingShape` would be a schema change and is a separate decision, not assumed here.
