/**
 * Worker training guides — one per task category, keyed by the category's
 * slug (TaskCategory.slug). Authored content, versioned in code on purpose:
 * the operator edits it through a commit, and a database reset can never
 * wipe it.
 *
 * GENERATED from the training-guides authoring run — edit by hand freely
 * (this header is provenance, not a "do not edit" marker).
 *
 * Voice: AfterDesk speaks as "we", the worker is "you". Plain strings
 * only — no markdown; structure lives in the fields, rendering in the
 * training pages.
 */

export type TrainingGuide = {
  slug: string;
  /** One line for the hub card. */
  tagline: string;
  /** What this category covers here, 2-3 sentences. */
  intro: string;
  /** What "done" means — agrees with the category's dispute criteria. */
  delivered: string;
  /** The working method, in order, brief-to-upload. */
  method: { step: string; detail: string }[];
  /** Free tools only. */
  tools: { name: string; use: string }[];
  mistakes: { mistake: string; why: string }[];
  /** Pre-delivery checks. */
  checklist: string[];
  /** A short worked micro-example. */
  example: string;
};

export const TRAINING_GUIDES: Record<string, TrainingGuide> = {
  "data-cleanup": {
    "slug": "data-cleanup",
    "tagline": "Messy exports in, clean files out, every row accounted for",
    "intro": "Data cleanup tasks hand you a messy spreadsheet and a target: duplicates removed, formats normalized, or two overlapping exports reconciled into one. The client's file is your raw material; your delivery is a clean version plus a record of what changed. Typical jobs run from a few hundred rows to several thousand.",
    "delivered": "Done means the operator can trace every source row into your delivery: it was kept, merged into another row, or dropped for a reason you wrote down. The file must match the format and column order the brief asked for. A row that silently disappears is a defect; so is a reordered column. A preference like Title Case names or a different date separator is not, unless the brief specified one.",
    "method": [
      {
        "step": "Read the brief twice",
        "detail": "Note the requested output format, the exact column order, and any rules for duplicates or merges before you open the data. Download every file on the claimed task; sometimes the second file is the template."
      },
      {
        "step": "Copy and count the source",
        "detail": "Record the source row count first; it is the number your whole delivery must reconcile to. Work on a copy of the data, never the only version."
      },
      {
        "step": "Sort to surface problems",
        "detail": "Sort by the key column, email for contacts, SKU for inventory, then eyeball the collisions. Filters and COUNTIF find blanks, duplicates, and format outliers faster than scrolling."
      },
      {
        "step": "Fix in passes",
        "detail": "One pass per problem: dedupe, then normalize formats, then handle blanks. Log every merged or dropped row with its reason as you go, not from memory afterward."
      },
      {
        "step": "Reconcile the counts",
        "detail": "Kept plus merged plus dropped must equal the source count. If it does not, rows leaked somewhere; find them before you build the delivery."
      },
      {
        "step": "Build the delivery file",
        "detail": "Match the requested format and exact column order. Put your change log on a second sheet or a separate file, and reopen the export to check nothing got mangled."
      },
      {
        "step": "Upload with a clear note",
        "detail": "State your counts, where your log is, and any assumption you made where the brief was silent. Flagging uncertainty in the note beats a silent guess; rejections are recorded."
      }
    ],
    "tools": [
      {
        "name": "Google Sheets or LibreOffice Calc",
        "use": "All the core work: sorting, filtering, remove-duplicates, TRIM, and conditional formatting to spot collisions."
      },
      {
        "name": "COUNTIF flagging",
        "use": "Add a column counting each key's occurrences so duplicates are visible before you delete anything."
      },
      {
        "name": "Plain text editor",
        "use": "Open the raw CSV to check delimiters and encoding when a file imports garbled."
      },
      {
        "name": "Change log sheet",
        "use": "A second sheet listing row, action, and reason for every merge or drop; the operator checks your counts against it."
      }
    ],
    "mistakes": [
      {
        "mistake": "Deleting duplicates without logging them",
        "why": "Unexplained missing rows break the every-row-accounted-for standard; that is a rejection, and rejections are recorded."
      },
      {
        "mistake": "Opening CSVs without importing as text",
        "why": "Spreadsheets strip leading zeros from SKUs and phone numbers and rewrite dates; the damage is silent until the operator compares files."
      },
      {
        "mistake": "Guessing rules the brief left open",
        "why": "A silent wrong guess costs a revision; the same assumption stated in your delivery note usually passes."
      },
      {
        "mistake": "Reordering or renaming columns to taste",
        "why": "Column order is part of the standard; your preference is not, and the mismatch takes the operator seconds to spot."
      },
      {
        "mistake": "Skipping the final count reconciliation",
        "why": "Kept plus merged plus dropped must equal the source count; a mismatch is the first thing the operator checks."
      }
    ],
    "checklist": [
      "Does kept plus merged plus dropped equal the source row count?",
      "Is every merged or dropped row logged with a reason?",
      "Do columns match the requested order and names exactly?",
      "Is the file in the exact format the brief asked for?",
      "Reopen your exported file: leading zeros, dates, and special characters intact?",
      "Does your delivery note state counts, log location, and any assumptions?"
    ],
    "example": "The brief: deduplicate a 4,000-contact CRM export, keeping the most complete record per person. You note 4,012 source rows, copy them to a working sheet, sort by email, and flag collisions with COUNTIF. For each collision you keep the row with the most filled fields and log the losing row with the reason merged, duplicate email; a second pass on name plus phone catches duplicates that have no email. Final count: 3,584 kept, 428 merged, 0 dropped, which sums to 4,012. You export in the original column order, attach the log, and state the counts and your keep rule in the delivery note."
  },
  "data-entry": {
    "slug": "data-entry",
    "tagline": "Keying source documents and audio into templates, exactly as written or spoken",
    "intro": "This category covers keying and transcribing: PDF invoices into supplier templates, handwritten forms into spreadsheets, interview audio into tagging sheets. The source is the truth and the template is the contract. A typical task is 40 invoices, 120 forms, or several hours of recorded speech, with a template attached to the claimed task.",
    "delivered": "Done means the delivery matches the source at normal accuracy for the language and the quality of the material, in the exact template or timestamp scheme the brief asks for. The odd typo in a messy source is normal; a wrong column, an invented value, or a reformatted template is a defect. Anything you could not read or hear must be flagged, never filled in. A guessed value is a dispute ground; a flagged one is not.",
    "method": [
      {
        "step": "Open the brief and template",
        "detail": "Download all files on the claimed task. Read every column header, format rule, and any timestamp scheme before touching the source; the template is what your delivery is judged against."
      },
      {
        "step": "Key a ten-item test batch",
        "detail": "Enter the first ten documents or minutes, then check them against the template rules. Catching a wrong date format here costs minutes; catching it at QC costs a revision."
      },
      {
        "step": "Work in source order",
        "detail": "Key exactly what is there, including odd spellings, abbreviations, and the source's own errors. Do not correct, translate, or tidy anything the brief does not tell you to."
      },
      {
        "step": "Flag what you cannot read",
        "detail": "Use the brief's flag if one is given, otherwise a clear placeholder such as [illegible] or [inaudible 00:14:32]. Keep a running list of every flag and its location."
      },
      {
        "step": "Check a sample before delivery",
        "detail": "Recheck about ten percent of entries against the source and re-listen to flagged timestamps. Sort each column to surface outliers like malformed dates or stray characters."
      },
      {
        "step": "Upload with a precise note",
        "detail": "Deliver the file in the requested format. In the note to the operator, state the count completed and list every flagged item with its form number or timestamp."
      }
    ],
    "tools": [
      {
        "name": "Google Sheets or LibreOffice Calc",
        "use": "Keying into the template, sorting columns to spot outliers, and counting rows against the brief's total."
      },
      {
        "name": "VLC media player",
        "use": "Free playback with speed control and short skip-back, so you can slow difficult audio and read exact timestamps."
      },
      {
        "name": "PDF and image viewer zoom",
        "use": "Zoom scans to 300 percent or more before deciding a character is illegible; most hard handwriting resolves at high zoom."
      },
      {
        "name": "Plain text editor",
        "use": "Drafting long transcription passages without a spreadsheet cell fighting you, then pasting into the template."
      }
    ],
    "mistakes": [
      {
        "mistake": "Guessing an unreadable or inaudible value",
        "why": "A guessed value is a dispute ground by itself; a flagged one never is, and QC rejections are recorded."
      },
      {
        "mistake": "Correcting errors you see in the source",
        "why": "The client wants what the source says. Silent fixes read as mismatches at QC and can break the client's own reconciliation."
      },
      {
        "mistake": "Adding, renaming, or reordering template columns",
        "why": "The template check fails even when every value is right, and the whole delivery comes back for revision."
      },
      {
        "mistake": "Paraphrasing audio instead of transcribing it",
        "why": "A summary in a transcription cell does not match the source; enter what was said in the form the brief asks for."
      },
      {
        "mistake": "Skipping your own sample check",
        "why": "Your typos should surface in your check, not in QC review; a rejection costs you more time than the check does."
      }
    ],
    "checklist": [
      "Do headers, column order, and formats match the template exactly?",
      "Is every unreadable or inaudible value flagged, with none guessed?",
      "Are all timestamps in the exact scheme the brief specifies?",
      "Did you recheck a sample of entries against the source?",
      "Does your delivered count match the count in the brief?",
      "Are the source's spellings and numbers untouched, not corrected?",
      "Does your delivery note list every flag with its location?"
    ],
    "example": "The brief is 120 handwritten intake forms keyed into a nine-column spreadsheet template. You key ten forms, check them against the template, and catch that dates must be YYYY-MM-DD, so you fix those ten before continuing. You work in form order, zooming scans to 300 percent on rough handwriting; four fields stay unreadable, so you enter [illegible] and note their form numbers. After form 120 you sort the date and phone columns to catch stray characters, then recheck twelve forms against their scans. You upload with a note: 120 of 120 entered, four illegible fields flagged on forms 18, 44, 71, and 102."
  },
  "list-building": {
    "slug": "list-building",
    "tagline": "Real companies and contacts that match a spec, one verified row at a time",
    "intro": "List building tasks ask you to find real companies or people that match a client's criteria and put them in a clean spreadsheet. A typical brief: 200 Montreal accounting firms, 80 podcast contacts in home services, or a supplier shortlist for packaging materials. The client uses the list for outreach or purchasing, so every row has to hold up when they act on it.",
    "delivered": "Done means every row is a real entity you actually found and checked against the brief's criteria, with every requested field either filled or marked unavailable after you genuinely looked. If a company moved or a contact changed jobs since the source was published, that is normal and will not count against you. What fails QC is a pattern: rows that do not match the criteria, guessed emails, or fields filled from imagination instead of a search. Flag anything uncertain in your delivery note rather than papering over it.",
    "method": [
      {
        "step": "Read the brief twice",
        "detail": "Download any attached files. Note the target count, the exact fields requested, and the sourcing criteria word for word. If a criterion is ambiguous, pick the strictest reasonable reading and say so in your delivery note."
      },
      {
        "step": "Set up the sheet first",
        "detail": "One column per requested field, one row per record, plus a Source column for the URL where you found each record. Build the skeleton before you search so no field gets forgotten mid-task."
      },
      {
        "step": "Source in passes",
        "detail": "Run one search strategy at a time: a maps search for local firms, a directory, an association member list, podcast platforms. Pull every match from one source before moving to the next. Log the source URL as you go."
      },
      {
        "step": "Fill fields from the entity itself",
        "detail": "Confirm each row on its own website or profile, not just the directory. Copy names and emails exactly as published. If a field is not published anywhere you can find, write Unavailable, never a guess."
      },
      {
        "step": "Dedupe and sanity-check",
        "detail": "Sort by name, then by email or domain, and eyeball the collisions. Check the count against the brief. Scan for rows that drifted off-criteria, like a bookkeeper in a list of accounting firms."
      },
      {
        "step": "Deliver with an honest note",
        "detail": "Upload the sheet as CSV or XLSX. In the note to the operator, state the sources you used, the final count, any Unavailable fields, and any criteria you had to interpret. Uncertainty flagged now beats a revision later."
      }
    ],
    "tools": [
      {
        "name": "Google Sheets or LibreOffice Calc",
        "use": "Build the deliverable, dedupe by sorting, and export to CSV or XLSX for upload."
      },
      {
        "name": "Google Maps",
        "use": "Find and confirm local businesses, addresses, and phone numbers on geographic briefs like the Montreal firms task."
      },
      {
        "name": "Browser search operators",
        "use": "Quotes, site:, and niche-plus-city queries to reach directories, association member lists, and official contact pages fast."
      },
      {
        "name": "Podcast directory websites",
        "use": "Free web search on Apple Podcasts or Spotify to find shows in a niche, then follow through to their sites."
      }
    ],
    "mistakes": [
      {
        "mistake": "Guessing email addresses from name patterns",
        "why": "A guessed email is a fabricated entry; a pattern of them fails the dispute criteria and sinks the whole delivery."
      },
      {
        "mistake": "Padding the count with off-criteria rows",
        "why": "The operator spot-checks against the brief; bookkeepers in an accounting-firm list read as unresearched entries, not honest misses."
      },
      {
        "mistake": "Copying a directory wholesale without verification",
        "why": "Directories go stale and overlap; straight copy-paste ships duplicates and dead rows that one QC spot-check will catch."
      },
      {
        "mistake": "Leaving fields blank instead of marking Unavailable",
        "why": "A blank reads as unfinished work; Unavailable after a real search is an acceptable answer under the criteria."
      },
      {
        "mistake": "Hiding a shortfall to hit the number",
        "why": "Sixty-two honest rows with a flagged note beats eighty the operator cannot trust; rejections and releases are recorded."
      }
    ],
    "checklist": [
      "Does the row count match the brief, with no padding?",
      "Does every row match the sourcing criteria on a strict reading?",
      "Is every requested field filled or marked Unavailable, never blank?",
      "Spot-check ten random rows against their own website or profile.",
      "Sort and scan for duplicate names, emails, and domains.",
      "Is every email copied from a published source, never guessed?",
      "Does your delivery note list sources, final count, and anything uncertain?"
    ],
    "example": "The brief asks for 80 podcast contacts in the home-services niche with show name, host name, email, and website. You build those four columns plus a Source column, then search podcast directories for plumbing, HVAC, roofing, and contracting shows, pulling every active match before switching terms. For each show you open its website, copy the host name and the published contact email, and write Unavailable where no email exists anywhere you can find. You sort by show name and by email to catch duplicates, land at 74 real contacts after cutting six dead shows, and keep searching adjacent terms like landscaping until you reach 80. Your note lists the directories used and flags anything uncertain."
  },
  "research": {
    "slug": "research",
    "tagline": "Hunting down names, emails, and prices, and proving where each one came from",
    "intro": "Research tasks ask you to find specific facts on the open web and land them in a sheet: owner emails for a list of clinics, competitor pricing pages, whether 150 LinkedIn profiles still match their listed roles. The brief defines the fields; your job is to fill every one or prove you tried. Most tasks are volume work against a fixed payout, so speed and honesty both matter.",
    "delivered": "Done means every field the brief asks for is either filled or marked not found after a genuine search, not a blank and not a guess. Where the brief asks for sourcing, each figure links back to where you found it. We expect some publicly sourced data to be slightly off; that is normal variance and will not fail QC on its own. Inventing a plausible email or title will, and a fabrication rejection is recorded.",
    "method": [
      {
        "step": "Read the brief before claiming",
        "detail": "Count the rows, list the requested fields, and check whether sourcing is required. Only claim if the payout and deadline fit the volume; a release after claiming is recorded."
      },
      {
        "step": "Build the sheet first",
        "detail": "Create one column per requested field, plus a source column and a status column. Match the brief's column names exactly so the operator can check your work fast."
      },
      {
        "step": "Time a ten-row sample",
        "detail": "Research ten rows and time them, then multiply by the total count. If the math does not fit the deadline, releasing now is better than rushing; a release is recorded, but a fabricated rush is worse."
      },
      {
        "step": "Work in two passes",
        "detail": "First pass, take the easy finds: about pages, team pages, obvious listings. Second pass, use search operators on the leftovers, like the person's name in quotes plus the company. Do not burn twenty minutes on one row."
      },
      {
        "step": "Mark dead ends honestly",
        "detail": "After a real search with no result, write not found in the status column and briefly note what you tried. Never fill the gap with a pattern guess like a probable email address."
      },
      {
        "step": "Spot-check before upload",
        "detail": "Reopen ten random rows and confirm the data holds: emails match the source page, URLs load, roles are current. Fix formats so one column means one thing everywhere."
      },
      {
        "step": "Upload with a plain note",
        "detail": "State how many rows are complete, how not-found rows are marked, and any pattern the operator should know, like many clinics sharing one booking-service address."
      }
    ],
    "tools": [
      {
        "name": "Google Sheets or LibreOffice Calc",
        "use": "Your deliverable lives here; use filters, duplicate highlighting, and a status column to track progress across hundreds of rows."
      },
      {
        "name": "Search engine operators",
        "use": "site:company.com and exact-phrase quotes find owner names and buried contact pages faster than plain queries."
      },
      {
        "name": "Private browsing window",
        "use": "View pages the way the client would: no personalization, no cached logins skewing prices or profiles."
      },
      {
        "name": "Wayback Machine",
        "use": "When a page is down or recently changed, an archived copy shows what was there; note the archive date in your source column."
      }
    ],
    "mistakes": [
      {
        "mistake": "Guessing an email from a pattern",
        "why": "A plausible address that bounces is fabrication, and one fabricated row can get the whole delivery rejected."
      },
      {
        "mistake": "Leaving cells blank",
        "why": "QC cannot tell a blank you searched from a blank you skipped; blanks read as unfinished work."
      },
      {
        "mistake": "Skipping source URLs when the brief asks",
        "why": "Untraceable figures fail the standard even when they are right, and re-finding sources later takes longer than pasting them as you go."
      },
      {
        "mistake": "Claiming volume work without timing a sample",
        "why": "You discover at row 80 that the deadline is impossible, and a late release hurts more than never claiming."
      },
      {
        "mistake": "Recording stale profile data as verified",
        "why": "Verification tasks judge whether the role is current now; copying the listed title without opening the profile defeats the task."
      }
    ],
    "checklist": [
      "Every requested column present, named as the brief names it?",
      "Every cell filled or marked not found, no blanks?",
      "Source URL beside every figure the brief asked you to source?",
      "Ten random rows spot-checked against their sources?",
      "All emails formatted correctly and all URLs load?",
      "Delivery note states completion count and explains not-found rows?",
      "No guessed values anywhere, removed or clearly flagged?"
    ],
    "example": "The brief asks for owner name and email for 300 dental clinics in an attached sheet. You download the file, add owner name, owner email, source URL, and status columns, then time ten clinics: about four minutes each, roughly 20 hours, which fits the window. For each clinic you check the site's about and team pages, then search the dentist's name in quotes with the clinic name. Forty-one clinics only expose a generic front-desk address, so you mark them not found and note what you tried. You spot-check ten rows, then upload with a note: 259 of 300 found, not-found rows marked in the status column."
  },
  "analysis": {
    "slug": "analysis",
    "tagline": "Client data in, verified figures and a readable summary out",
    "intro": "Analysis tasks give you a client's raw data and a specific question to answer with it. You might summarize three years of sales into a trend sheet, compare shipping costs against three carriers, or categorize 500 support tickets by root cause. The client wants figures they can trust and a summary they can read in two minutes.",
    "delivered": "The operator checks two things before the client sees anything: your figures reconcile to the source data, and you followed the method the brief stated. A total that cannot be traced to the raw file, or an average where the brief said sum, is a defect and gets rejected. A conclusion the client dislikes is not a defect; an arithmetic or method error is. Show your working so the operator can verify it quickly.",
    "method": [
      {
        "step": "Read the brief twice",
        "detail": "Find the question, the stated method, and the output format. If the brief names a method, that method is binding; substituting your own is a QC failure even when your numbers are right."
      },
      {
        "step": "Inspect the data first",
        "detail": "Download the files and look before calculating. Check row counts, date ranges, duplicates, blanks, and mixed formats. Sort by the key column and eyeball the collisions. If the data is beyond you, release now."
      },
      {
        "step": "Work on a copy",
        "detail": "Keep the raw data untouched on its own tab. Do all cleaning and categorizing on a working copy, so the operator can trace any figure back to the source."
      },
      {
        "step": "Compute with formulas only",
        "detail": "Every number in your output comes from a formula that reaches back to the raw tab. Never type a figure by hand. A typed number cannot be reconciled."
      },
      {
        "step": "Reconcile every total",
        "detail": "Before writing anything up, check that summary totals match totals computed straight from the raw data. Rows in equal rows out. If categories should sum to 500 tickets, prove they do."
      },
      {
        "step": "Write a short summary",
        "detail": "Answer the brief's question in plain sentences on the first sheet. State the method you followed and any assumption you made. Do not soften a finding the client may dislike."
      },
      {
        "step": "Upload with a clear note",
        "detail": "Deliver the workbook, not a screenshot. In the note to the operator, state the method, source row counts, and anything ambiguous you decided or flagged. Flagging beats guessing, every time."
      }
    ],
    "tools": [
      {
        "name": "Google Sheets or LibreOffice Calc",
        "use": "The workbook you build and deliver; both handle the pivot tables and formulas this work needs."
      },
      {
        "name": "Pivot tables",
        "use": "Summarize by month, carrier, or category fast, and recompute totals a second way when reconciling."
      },
      {
        "name": "SUMIFS and COUNTIFS",
        "use": "Tie every summary figure to raw rows by formula so the operator can trace it."
      },
      {
        "name": "Conditional formatting",
        "use": "Surface duplicates, blanks, and outliers in the raw data before you calculate anything."
      }
    ],
    "mistakes": [
      {
        "mistake": "Typing figures by hand instead of computing them",
        "why": "Hardcoded numbers cannot be traced to the source, so the operator cannot reconcile them, and an untraceable figure is treated as an error."
      },
      {
        "mistake": "Substituting your own method for the brief's",
        "why": "The standard is the stated method; a better method you were not asked for is still a method error and gets rejected."
      },
      {
        "mistake": "Cleaning or sorting the raw file directly",
        "why": "Reconciliation needs the source intact; if QC cannot check your figures against it, the whole delivery fails."
      },
      {
        "mistake": "Guessing on ambiguous rows instead of flagging them",
        "why": "A wrong guess is an error on your record; an assumption flagged in the delivery note is not."
      },
      {
        "mistake": "Softening numbers because the finding looks bad",
        "why": "An unwelcome conclusion is never a defect, but bending figures toward one is, and QC checks the figures."
      },
      {
        "mistake": "Holding a task you cannot actually do",
        "why": "A release is recorded, but so is a rejection, and a rejection after hours of guessing costs you more."
      }
    ],
    "checklist": [
      "Does every summary figure trace by formula to the raw tab?",
      "Did you follow the stated method exactly, including units and date ranges?",
      "Do category counts and totals reconcile to the source row count?",
      "Is the raw data untouched on its own tab?",
      "Are assumptions and flagged rows stated in both the summary and delivery note?",
      "Spot-check three figures by recomputing them a different way.",
      "Can a stranger read the first sheet in two minutes?"
    ],
    "example": "The brief: categorize 500 support tickets by root cause using the six categories the client supplied. You download the export and confirm 500 rows, noting 14 tickets with empty descriptions. On a working tab you add a category column and tag every ticket, marking the 14 as unclear instead of guessing a cause. A COUNTIFS table totals each category, and you verify the counts sum to exactly 500. The first sheet shows the counts, the leading root cause, and one line on how the 14 were handled. Your delivery note states: 500 rows in, 500 categorized, 14 flagged unclear rather than guessed."
  },
  "writing": {
    "slug": "writing",
    "tagline": "Copy built to spec from the client's own files: descriptions, emails, rewrites",
    "intro": "Writing tasks ask you to produce copy from material the client supplies: spec sheets, an old FAQ page, notes from a sales team. Typical tasks come in batches, like 12 product descriptions or 6 email templates. The files attached to the task are your only source of facts.",
    "delivered": "Approved work matches the numbers and words in the brief: the piece count, the length per piece, the tone the client named, and the requested format. Every factual claim in your copy traces back to the brief or its attached files; you never invent a spec, price, feature, or company detail. If the operator would simply have phrased something differently, that is not a rejection ground. A missed length, a wrong tone, or an unsupported claim is.",
    "method": [
      {
        "step": "Read the brief twice",
        "detail": "First pass for the scope, second pass to write down the hard numbers: piece count, length per piece, tone words, and delivery format. These four are what QC checks first."
      },
      {
        "step": "Open every attached file",
        "detail": "Download every file on the task before writing. The spec sheets, old page, or sales notes are your only source of facts. Never work around a missing or unreadable file by guessing."
      },
      {
        "step": "Build a fact list",
        "detail": "Pull the facts you are allowed to use into a scratch spreadsheet, one row per piece. Anything not on that list stays out of the copy."
      },
      {
        "step": "Draft one piece, then check",
        "detail": "Write the first piece and measure it against the brief: length, tone, format. Fix the pattern now, then produce the rest to match it. One correction beats twelve."
      },
      {
        "step": "Verify counts, lengths, and facts",
        "detail": "Reread the brief. Confirm the piece count, run a word count on every piece, and trace each name, number, and claim back to a source file."
      },
      {
        "step": "Deliver in the requested format",
        "detail": "Package exactly as asked, each piece labeled to its source. In the delivery note, state anything you were unsure about and the reading you chose. That note is your only channel to the operator."
      }
    ],
    "tools": [
      {
        "name": "Google Docs or LibreOffice Writer",
        "use": "Drafting, spell check, and word counts; run the built-in word count on every piece before you upload."
      },
      {
        "name": "Google Sheets or LibreOffice Calc",
        "use": "Fact lists and batch deliveries; one row per piece keeps counts, sources, and lengths easy to verify."
      },
      {
        "name": "Ctrl+F in any editor or browser",
        "use": "Trace every name, number, and claim in your draft back to the source file it came from."
      },
      {
        "name": "A plain text editor",
        "use": "Paste copy through it to strip hidden formatting when the brief asks for plain text."
      }
    ],
    "mistakes": [
      {
        "mistake": "Filling gaps in the source with plausible details",
        "why": "One invented price or spec is an unsupported claim and can sink the whole batch at QC."
      },
      {
        "mistake": "Writing the full batch before checking one piece",
        "why": "A wrong length or tone repeated twelve times means a full revision instead of a two-minute fix."
      },
      {
        "mistake": "Delivering good copy in the wrong format",
        "why": "Format is part of the standard; the operator checks it before reading a word."
      },
      {
        "mistake": "Polishing style instead of hitting the numbers",
        "why": "QC judges length, tone, format, and facts; style preference alone is not a dispute ground either way."
      },
      {
        "mistake": "Guessing at an ambiguous brief instead of noting it",
        "why": "A delivery note stating your reading costs nothing; a silent wrong guess costs a revision, and rejections are recorded."
      }
    ],
    "checklist": [
      "Does the piece count match the brief exactly?",
      "Is every piece within the requested length?",
      "Can every name, number, and claim be traced to a source file?",
      "Does the tone match the words the brief used?",
      "Is the delivery in the exact format and file type requested?",
      "Did you run spell check and read each piece end to end?",
      "Did your delivery note list anything you were unsure about?"
    ],
    "example": "The task is 12 product descriptions, 80 to 100 words each, friendly tone, from attached spec sheets. You download the sheets and build a spreadsheet: one row per product, columns for the specs you may use. You draft the first description, run a word count, and check it reads friendly, not formal. Satisfied, you write the other eleven to the same pattern, then trace every number in the copy back to its sheet; one wattage figure does not match, so you correct it. You deliver a single document, one labeled description per product, with a note that product 7's sheet listed no material, so you left material out rather than guess."
  },
  "document-production": {
    "slug": "document-production",
    "tagline": "Rebuilding documents in a new template without changing a single word",
    "intro": "Document production is rebuilding or reformatting client documents in the requested template. You take a proposal, price sheet, or board packet built in an old layout and produce the same content in the client's current one. A typical task is one long document, a batch of short ones, or several sources assembled into one packet.",
    "delivered": "Every word, number, and table cell from the source appears in your delivery, unchanged, in the template the brief names. Formatting is consistent from first page to last: the same heading styles, fonts, and spacing throughout. You are not an editor here. Fixing a typo, rewording a sentence, or cutting a paragraph is a dispute ground exactly as much as losing content by accident; if something in the source looks wrong, reproduce it and flag it in your note.",
    "method": [
      {
        "step": "Size the job before claiming",
        "detail": "Weigh the payout against the real page and file counts before claiming. After claiming, download every file and confirm each one opens; a file that will not open belongs in your delivery note, not in a guess."
      },
      {
        "step": "Inventory the source",
        "detail": "Before touching the template, list every section, table, figure, footnote, and appendix; for batches, count files and pages per file. This list is what you check the finished delivery against."
      },
      {
        "step": "Work in a template copy",
        "detail": "Never restyle the source file in place. Make a copy of the template and learn its styles first: heading levels, body text, table format, page numbering."
      },
      {
        "step": "Move content in blocks",
        "detail": "Paste as unformatted text, then apply the template's styles. Pasting with source formatting drags the old fonts and spacing in, and that inconsistency is what QC sees first."
      },
      {
        "step": "Rebuild tables and images",
        "detail": "Tables often break on paste. Rebuild them in the template's table style, check every row and column made it, and reinsert images at readable size with their captions."
      },
      {
        "step": "Verify against your inventory",
        "detail": "Walk the inventory item by item through the finished file, then scroll source and delivery side by side. Missing content and added content are both rejection grounds."
      },
      {
        "step": "Deliver with a precise note",
        "detail": "Export in the requested format, name the file as instructed, and upload. In the note, list anything unresolved: an unreadable page, a table that would not fit, a source contradiction."
      }
    ],
    "tools": [
      {
        "name": "LibreOffice Writer",
        "use": "Free document suite that opens docx templates, applies styles, and exports pdf for most rebuild tasks."
      },
      {
        "name": "Google Docs and Sheets",
        "use": "Browser fallback when a file behaves badly locally; version history lets you undo a bad paste."
      },
      {
        "name": "Browser PDF viewer",
        "use": "Keeps a pdf source open beside your build for page-by-page, side-by-side checking."
      },
      {
        "name": "Word count comparison",
        "use": "Compare source and delivery word counts; a meaningful gap means content was lost or added somewhere."
      }
    ],
    "mistakes": [
      {
        "mistake": "Fixing typos or rewording sentences from the source",
        "why": "Content changes are a dispute ground even when they are improvements; flag a bad typo in your note and leave the text as written."
      },
      {
        "mistake": "Pasting with source formatting",
        "why": "It carries old fonts and spacing into the template, and inconsistent formatting is the most common QC rejection in this category."
      },
      {
        "mistake": "Restyling the source file instead of filling the template",
        "why": "The client asked for their template; a restyled source never matches it exactly, and the mismatch shows on page one."
      },
      {
        "mistake": "Skipping headers, footers, and footnotes",
        "why": "They are content too; missing page numbers, legal footers, or footnotes count as lost content at QC."
      },
      {
        "mistake": "Trusting the paste for tables",
        "why": "Merged cells and long tables drop rows silently, and every dropped price row is missing content the operator will find."
      },
      {
        "mistake": "Delivering without a source comparison pass",
        "why": "You cannot see your own gaps from memory; the operator compares against the source, so compare first yourself."
      }
    ],
    "checklist": [
      "Does every section, table, figure, and footnote from the source appear in the delivery?",
      "Did you change zero words, including typos and errors left as written?",
      "Do headings, body text, and tables use the template's styles throughout?",
      "Are headers, footers, page numbers, and captions present and correct?",
      "Do the file format and file name match the brief?",
      "For batches, does the delivered file count match the source count?",
      "Is every unresolved issue listed in your delivery note?"
    ],
    "example": "Brief: convert 25 legacy price sheets to the current layout, template attached. You download all 25, confirm each opens, and log the row count of every sheet in a scratch list. You rebuild the first sheet in a copy of the template, pasting values without formatting and applying the template's table style, then check its row count and totals against the source before repeating the pattern across the other 24, ticking each sheet off the list. Sheet 14 has one smudged, unreadable price in the source scan; you leave that cell blank and name it in your delivery note rather than guessing a number. You deliver 25 files named exactly as the brief asks."
  },
  "admin-coordination": {
    "slug": "admin-coordination",
    "tagline": "Checklist work in a client's systems, done exactly as the brief says",
    "intro": "Admin and coordination tasks are checklist work inside a client's systems: scheduling calls, chasing documents, setting up accounts, moving data between tools. A typical brief gives you explicit steps, a list of items to work through, and often asks for a log of what you did. Nothing here is creative; the value is that it gets done exactly as written.",
    "delivered": "Done means every explicit step in the brief was carried out, and where the brief asked for a log, the log shows each action you actually took. Where the brief was silent or unclear, you noted it in your delivery instead of picking an interpretation. A flagged question is never a defect; a wrong guess is. Missing log entries, skipped steps, or silent gaps in the item count are defects.",
    "method": [
      {
        "step": "Read the brief before claiming",
        "detail": "Read every step and requirement in the pool listing. If you cannot picture doing each step, or the deadline will not fit your shift, do not claim. Releases are recorded."
      },
      {
        "step": "Build a tracker first",
        "detail": "Download the files, then make a spreadsheet with one row per item and columns for status, timestamp, and notes. This becomes the log you deliver."
      },
      {
        "step": "Run a small test batch",
        "detail": "Do the first two or three items end to end before committing to the rest. Access problems and unclear steps show up here, while there is still time to note them."
      },
      {
        "step": "Work the list, log live",
        "detail": "Update the tracker the moment you finish each item, not from memory at the end. Record what you did, where, and when."
      },
      {
        "step": "Note ambiguity, never guess",
        "detail": "When the brief does not say, mark the item in your tracker, write exactly what is unclear, and move on. Do not pick an interpretation and hope."
      },
      {
        "step": "Verify against the brief",
        "detail": "Reread the brief's steps line by line and check each one against your tracker. Every item should read done, blocked, or flagged, with no blanks."
      },
      {
        "step": "Upload with a clear note",
        "detail": "Attach the tracker, state the totals in your note, and list every flagged question. The operator resolves ambiguities with the client; you never contact anyone yourself."
      }
    ],
    "tools": [
      {
        "name": "Google Sheets or LibreOffice Calc",
        "use": "Your tracker and action log; one row per item, timestamped as you go."
      },
      {
        "name": "Separate browser profiles",
        "use": "One profile per client account, so an action never lands in the wrong calendar or tool."
      },
      {
        "name": "Plain text editor",
        "use": "Draft entries and messages here first, then paste into the live system once they are right."
      },
      {
        "name": "timeanddate.com",
        "use": "Convert time zones before booking anything; scheduling tasks often span three or more zones."
      }
    ],
    "mistakes": [
      {
        "mistake": "Reconstructing the log at the end",
        "why": "Entries drift from what actually happened, and one wrong timestamp makes the whole log look invented at QC."
      },
      {
        "mistake": "Guessing when the brief is silent",
        "why": "A wrong guess is a QC rejection on record; a flagged note never is."
      },
      {
        "mistake": "Improving on the brief's steps",
        "why": "QC judges against the explicit steps, not your better method; a smarter shortcut still fails."
      },
      {
        "mistake": "Working in the wrong account",
        "why": "Actions in a client's live systems are not always reversible; check which account you are in before every batch."
      },
      {
        "mistake": "Skipping items without a note",
        "why": "A silent gap in the count reads as carelessness; every item needs a status."
      }
    ],
    "checklist": [
      "Did you complete every explicit step in the brief?",
      "If a log was requested, does it show every action with a timestamp?",
      "Is every item marked done, blocked, or flagged, with no blanks?",
      "Did you note every ambiguity instead of guessing?",
      "Did you recheck names, emails, and time zones against the source files?",
      "Does your delivery note state totals and list open questions?"
    ],
    "example": "The brief: set up 20 new users in the client's project tool from the attached roster, logging each account created. You claim, download the roster, and build a tracker with a row per user. Creating the first three accounts, you notice one entry has no role assigned. You set up the 19 complete users, logging each with a timestamp and the email used, and mark the incomplete entry blocked with a note quoting what is missing. Your delivery note reads: 19 created, 1 blocked pending a role, question attached for the operator."
  }
};

export function guideFor(slug: string): TrainingGuide | null {
  return TRAINING_GUIDES[slug] ?? null;
}

export function hasGuide(slug: string): boolean {
  return slug in TRAINING_GUIDES;
}
