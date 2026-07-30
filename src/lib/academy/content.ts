import "server-only";
import type { Course } from "./types";

/**
 * THE CURRICULUM — 12 courses: 4 foundations + one per task category.
 * GENERATED from the academy-courses authoring run, then validated
 * (12 questions per exam, 4 options each, exactly one correct, no markdown).
 * Edit by hand freely — this header is provenance, not a lock.
 *
 * server-only: every course carries its exam's ANSWER KEY. This module must
 * never be imported by a client component; the exam page strips questions to
 * their public projection before render, and grading happens in the
 * submitExam server action.
 */
export const COURSES: Record<string, Course> = {
  "va-foundations": {
    "slug": "va-foundations",
    "title": "Working on Second Shift",
    "track": "foundations",
    "tagline": "How Second Shift works end to end, and the stance that keeps you earning.",
    "summary": "This is the course every worker should take first. It walks the full path of a task, from the moment a client posts it to the moment your payout is released, and explains the rules that hold the platform together: fixed payouts, first-come claiming, the wall between you and the client, and what QC and your record mean for the work you see. Finish it and you will know exactly what a claim commits you to.",
    "outcomes": [
      "You can trace a task from client brief to released payout.",
      "You can judge a brief and decide whether to claim before committing.",
      "You can explain why you never contact or identify a client.",
      "You can write a delivery note and a flag the operator can act on.",
      "You can respond to a QC rejection without damaging your record.",
      "You can plan a night of claims around deadlines shown in your local time."
    ],
    "lessons": [
      {
        "title": "How Second Shift Works",
        "minutes": 4,
        "sections": [
          {
            "heading": "The path of every task",
            "body": "Every task follows the same path. A client describes what they need. One of our operators reads it, prices it, and sets a fixed payout. The task then enters the pool, where approved workers can see it. When you claim it, it is yours: you download the files, do the work, and upload your delivery with a note to the operator. The operator reviews it before the client ever sees it. If it passes, the client receives it and your payout is released. If it does not, it comes back to you for revision. That is the whole machine. Everything else in this course explains one part of it in detail."
          },
          {
            "heading": "The operator in the middle",
            "body": "You will never talk to the client. The operator sits between you and them, and that is deliberate: it protects you from scope creep and unpaid extras, and it protects the client's identity and data. The operator prices the task, writes or curates the brief, reviews your delivery, and decides when it is good enough to pass on. Your work is judged by one person, against the brief, every time. This also means the brief has to carry everything you need. If it does not, the gap is real and worth flagging, not something to paper over with guesses. We cover how to flag later in this course."
          },
          {
            "heading": "Fixed payout, decided before you claim",
            "body": "The payout on a task is fixed before you ever see it. The operator sets it when pricing the task, and the number shown in the pool is the number you receive when your delivery is approved. It does not change if the work takes longer than you expected, and you cannot negotiate it after claiming. This cuts both ways. If you work efficiently, your effective hourly rate goes up. If you misjudge a task and it takes twice as long, the payout stays the same. That is why reading the brief before claiming matters so much: the claim is the moment you accept the price. After that, the only variable is your own speed and quality."
          }
        ],
        "keyPoints": [
          "Every task follows one path: brief, price, pool, claim, deliver, QC, payout.",
          "The operator is the only human between you and the client.",
          "The payout shown in the pool is fixed. Claiming means accepting it."
        ]
      },
      {
        "title": "The Claim Is a Commitment",
        "minutes": 4,
        "sections": [
          {
            "heading": "First come, first served",
            "body": "Tasks in the pool go to whoever claims them first. There is no bidding and no proposal to write: if the task is open and you claim it, it is yours. This rewards workers who check the pool regularly and can decide quickly. But speed is only an advantage if your decision is sound. A task claimed in ten seconds and released an hour later is worse for you than a task you passed on, because releases are recorded on your record. The skill we want you to build is not clicking fast. It is reading fast, judging honestly whether the task fits your skills and your night, and only then claiming."
          },
          {
            "heading": "What claiming commits you to",
            "body": "When you claim a task, you commit to three things: the deliverable described in the brief, the deadline shown in the app, and the payout as priced. If you realize after claiming that you cannot deliver, releasing the task early is better than delivering something wrong or missing the deadline, because it puts the task back in the pool while there is still time for someone else. But a release is still recorded on your record, and a pattern of releases tells us you are claiming carelessly. The cheapest release is the one you never needed, because you read the brief properly first. Claim what you can finish. Release early when you truly cannot."
          },
          {
            "heading": "Deciding in the pool",
            "body": "Before claiming, answer four questions. Do I understand exactly what the finished work looks like? Can I do it with the skills and free tools I have tonight? Does the deadline fit inside the hours I actually have available? Am I satisfied with the payout for the effort involved? If any answer is no, let the task go. Another one will appear, and passing on a task costs you nothing, while a bad claim costs you time and a mark on your record. There is no penalty for being selective. The workers who last on our platform are not the ones who claim the most tasks. They are the ones whose claims almost always end in an approval."
          }
        ],
        "keyPoints": [
          "Claiming is instant and binding: deliverable, deadline, and payout, all accepted at once.",
          "Passing on a task costs nothing. A release is recorded.",
          "If you truly cannot deliver, release early so someone else still has time.",
          "Ask four questions before claiming: deliverable, skills, deadline, payout."
        ]
      },
      {
        "title": "Reading a Brief Properly",
        "minutes": 5,
        "sections": [
          {
            "heading": "What a brief contains",
            "body": "A brief tells you what to produce, in what format, from which files, by when, and for how much. Read it in that order. First pin down the deliverable: what exact file or result does the operator expect back? Then, once you have claimed, download the files and check they match what the brief describes. Then note the constraints: naming, format, length, anything the brief says must or must not happen. A brief is short by design, so every sentence in it is load-bearing. If a sentence seems unnecessary, read it again. It is usually the one that decides whether your delivery passes QC."
          },
          {
            "heading": "Reading before claiming",
            "body": "In the pool you see the brief and the payout, but files only become available after you claim. So your claiming decision rests on the text alone. Read all of it, not just the title. Check that the deliverable is concrete, that the deadline is realistic in your own hours, and that nothing in it requires tools or skills you do not have. If the brief is too vague for you to picture the finished work, treat that as real information: a vague brief means more judgment calls, more chances of a revision, and more time for the same payout. Some workers thrive on those. If you are new, prefer briefs that leave no room for doubt."
          },
          {
            "heading": "When the files surprise you",
            "body": "Sometimes you claim a task, download the files, and something is off. A file the brief mentions is missing. A spreadsheet has forty columns where the brief implies ten. The data is in a different language. Do not silently improvise. If the gap makes the task impossible, release it early so it returns to the pool with time to spare. If you can still deliver something useful, do the parts that are clear and state the gap plainly in your delivery note: what you found, what you assumed, what you left out and why. An operator can fix a flagged gap in minutes. A hidden one surfaces at QC or, worse, in front of the client."
          }
        ],
        "keyPoints": [
          "Pin down the deliverable first: what exact file goes back.",
          "You claim on brief text alone. Files unlock after claiming.",
          "A vague brief means more judgment calls for the same payout.",
          "When files do not match the brief, flag or release early. Never improvise silently."
        ]
      },
      {
        "title": "You Never Meet the Client",
        "minutes": 5,
        "sections": [
          {
            "heading": "Why the wall exists",
            "body": "The wall between you and the client is not a technical limitation. It is the product. Clients hand work to us because they get one accountable counterpart, the operator, instead of managing a stranger overnight. You get the same protection in reverse: no client can pressure you at three in the morning, add unpaid extras, or take a dispute to you directly. Everything flows through the operator, both ways. For that reason, attempting to contact a client, on any channel, for any reason, ends your work with us. There is no version of it that is innocent. If something about a task makes you want to reach the client, that impulse is exactly what the delivery note is for."
          },
          {
            "heading": "What you see stays in the task",
            "body": "Client files will sometimes tell you more than you need. An invoice shows a company name. A calendar export shows real names and addresses. A photo shows a storefront. Treat all of it as confidential the moment you see it. Do not search for the company, do not look up the people, do not mention what you saw to anyone, and do not try to work out who the client is. You do not need to know, and knowing helps you with nothing. The details exist inside the task so you can do the work, and they stop existing for you when the task is delivered."
          },
          {
            "heading": "Where client data can and cannot go",
            "body": "Three rules cover every situation. First, client files never leave the task: do not upload them to converters, cloud drives, AI tools, or any third-party service unless the brief explicitly tells you to. Second, keep no copies: when your delivery is approved, delete anything task-related from your machine, including exports, drafts, and downloads. Third, never share samples: work you did for a client is not portfolio material, not a screenshot for a friend, and not an example in a forum post. If a tool you rely on requires uploading the file somewhere, that tool is unavailable for this task. Work with what runs on your own machine, or flag that you cannot proceed."
          }
        ],
        "keyPoints": [
          "The wall is the product. Contacting a client ends your work with us.",
          "Never try to identify a client from what their files reveal.",
          "Client files never leave the task: no third-party services or AI tools unless the brief says so.",
          "Delete everything after approval. Client work is never portfolio material."
        ]
      },
      {
        "title": "Delivery and the Note",
        "minutes": 5,
        "sections": [
          {
            "heading": "Before you upload",
            "body": "Delivery starts before the upload. Reread the brief from the top and check your work against every sentence of it, in order. Confirm the format is exactly what was asked: file type, naming, structure. Then close everything and open your deliverable the way the operator will, in a fresh window, and look at it cold. Broken formulas, an unsorted column, a missing page: most QC rejections are things a two-minute cold read would have caught. The payout is the same whether you spend those two minutes or not, but a rejection costs you a revision cycle in hours you may no longer have."
          },
          {
            "heading": "The note is your only channel",
            "body": "The note you attach to your delivery is the only channel you have to the operator, so make it carry weight. State what you delivered and confirm it matches the brief. List any decision you had to make that the brief did not settle, and what you chose. Flag anything the operator should check before the client sees the work. Keep it factual and short: three to six plain sentences is usually right. Do not use it for small talk, apologies, or negotiation. A good note lets the operator review your work in half the time, and operators remember whose deliveries are easy to review."
          },
          {
            "heading": "Writing a flag that works",
            "body": "A useful flag has three parts: what you found, what you did about it, and what, if anything, you need. Compare two notes. First: some rows had problems so I skipped them. Second: rows 214 to 260 have dates in two different formats and the brief does not say which is correct, so I standardized to the format used in the rest of the file and listed the affected rows on a separate tab. The first note creates work and doubt. The second lets the operator decide in thirty seconds and shows exactly the judgment we pay for. Flagging is not admitting weakness. Written well, it is the most professional sentence in your delivery."
          }
        ],
        "keyPoints": [
          "Reread the brief and cold-open your deliverable before uploading.",
          "The note is your only channel to the operator. Keep it factual and short.",
          "A flag has three parts: what you found, what you did, what you need."
        ]
      },
      {
        "title": "QC, Rejection, and Your Record",
        "minutes": 5,
        "sections": [
          {
            "heading": "What QC checks",
            "body": "QC is the operator reading your delivery against the brief before the client sees it. The questions are concrete. Is everything the brief asked for present? Is it correct, as far as the operator can verify? Is the format, naming, and structure exactly as specified? Does the note explain any decisions or flags? QC is not a judgment of you and it is not about taste. The operator's own name is on the work when it reaches the client, so they check what the client will check. If you reviewed your own work against the brief before uploading, QC should find nothing you did not already know about."
          },
          {
            "heading": "Rejection and revision",
            "body": "When QC rejects a delivery, the task comes back to you with the operator's reason, and your payout waits until the revision is approved. Treat a rejection as a work order, not an argument. Fix exactly what was named. Then recheck the rest of the delivery, because a missed requirement often travels in groups. In your new note, state what you changed and confirm you rechecked the whole deliverable. Do not defend the first version, and do not fix unmentioned things silently without saying so. A clean, fast, complete revision is noticed. So is a revision that comes back with the same problem."
          },
          {
            "heading": "What your record shows",
            "body": "Your record with us tracks two things: claims you released and deliveries QC rejected. We use it to decide what work you see, because a worker whose claims reliably end in approval can be trusted with better tasks and tighter deadlines. The record is not a punishment system, and a single release or rejection does not define you. Patterns do. The way to keep it clean is everything this course has covered: claim only what you can finish, flag instead of guessing, and review your own work before you upload. Notice one thing the record does not track: flags. Flagging a problem in your note never counts against you. Guessing wrong does."
          }
        ],
        "keyPoints": [
          "QC checks your delivery against the brief, nothing more and nothing less.",
          "A rejection is a work order: fix what was named, recheck everything else.",
          "Your record tracks releases and rejections, and shapes the work you see.",
          "Flags are never held against you. Wrong guesses are."
        ]
      },
      {
        "title": "Working the Overnight Rhythm",
        "minutes": 3,
        "sections": [
          {
            "heading": "Your day, their night",
            "body": "Most of our clients post tasks at the end of their business day and expect results waiting when they return in the morning. Their night is your day, and that is the whole reason the platform works: while they sleep, you are in your best hours. You never need to do timezone arithmetic, because every deadline in the app is shown in your own local time. If a task says 14:00 for you, it means 14:00 on your clock, and the app has already accounted for whatever morning that is for the client. Plan against the number you see, not against a guess about where the client lives, which you should not be trying to work out anyway."
          },
          {
            "heading": "Planning a realistic shift",
            "body": "A deadline here is harder than most, because behind it is a client walking into their office. Late delivery is the one failure the operator cannot fix for you. So plan with margin. Estimate how long a task will take, then check that the deadline leaves room beyond that estimate for a cold review of your work and, ideally, a revision cycle if QC finds something. Be honest about your own hours: claiming three tasks that each fit individually but not together is the most common way good workers end up releasing. Your capacity for tonight is a fixed number. Spend it as carefully as you would spend the payout."
          }
        ],
        "keyPoints": [
          "Deadlines in the app are already in your local time.",
          "Behind every deadline is a client walking into their morning.",
          "Leave margin for a cold review and a possible revision.",
          "Claim for the hours you actually have, not the hours you hope for."
        ]
      }
    ],
    "exam": {
      "questions": [
        {
          "prompt": "A task in the pool pays 18 dollars. You claim it. Halfway through, you realize it will take twice as long as you estimated. What is true about the payout?",
          "options": [
            "It stays 18 dollars; the payout was fixed when the operator priced the task.",
            "You can ask the operator for an increase in your delivery note.",
            "The operator will adjust it at QC if the work clearly took longer.",
            "It increases automatically if you log the extra hours in the app."
          ],
          "correct": 0,
          "explain": "The payout is set by the operator before the task enters the pool. Claiming means accepting it, and effort after that does not change it."
        },
        {
          "prompt": "You spot a well-paid task the moment it appears in the pool. The brief is two lines and you cannot picture the finished deliverable, but tasks like this get claimed fast. What do you do?",
          "options": [
            "Claim it now and work out the details from the files.",
            "Claim it, then release it if the files do not clarify things.",
            "Let it go; a brief too vague to judge is a real reason to pass.",
            "Claim it and deliver your best interpretation with a note."
          ],
          "correct": 2,
          "explain": "You claim on brief text alone. If you cannot picture the deliverable, you cannot judge the commitment. Passing costs nothing, while a release after claiming is recorded."
        },
        {
          "prompt": "The brief says the attached spreadsheet has one tab of contacts to clean. After claiming, you find three tabs with different formats, and the brief does not say which to use. The deadline is nine hours away. What do you do?",
          "options": [
            "Clean all three tabs to be safe and deliver everything.",
            "Clean the tab that best matches the brief, and state in your note what you found and chose.",
            "Clean the first tab only, since the brief said one tab.",
            "Release the task immediately; the brief does not match the files."
          ],
          "correct": 1,
          "explain": "The task is still deliverable, so do the part that best fits the brief and flag your choice. The operator can settle the ambiguity in seconds."
        },
        {
          "prompt": "A client file contains an email signature with the company's name and a support address. Your task is data entry, and you have a question the brief does not answer. What is the correct channel?",
          "options": [
            "The support address in the file, since it is meant for questions.",
            "A quick search for the company's public FAQ, without contacting anyone.",
            "No channel; deliver your best guess and stay silent to save time.",
            "Your delivery note to the operator, with the question flagged clearly."
          ],
          "correct": 3,
          "explain": "You never contact or research the client. The delivery note is your only channel to the operator, so put the question there instead of guessing."
        },
        {
          "prompt": "While formatting a presentation, you recognize the client's storefront in a photo; it looks like a shop in a city you know. You are curious whether you are right. What do you do?",
          "options": [
            "Nothing; treat what you saw as confidential and finish the task.",
            "Look it up on a map just to confirm, without contacting anyone.",
            "Mention it in your delivery note so the operator knows you noticed.",
            "Ask a friend from that city whether they know the shop."
          ],
          "correct": 0,
          "explain": "Never try to identify a client, even passively. What you see in the files stays in the task and stops mattering after delivery."
        },
        {
          "prompt": "A brief asks you to summarize 40 pages of client meeting notes. A free AI chatbot would do it in minutes. The brief does not mention AI tools. What do you do?",
          "options": [
            "Use the chatbot but delete the conversation afterward.",
            "Use the chatbot only for pages with no names in them.",
            "Paste small chunks so no single upload contains the whole document.",
            "Summarize it yourself; client files never go to third-party tools unless the brief says so."
          ],
          "correct": 3,
          "explain": "Uploading client files to any outside service, including AI tools, is banned unless the brief explicitly allows it. Chunking or deleting afterward does not change that."
        },
        {
          "prompt": "Your delivery was approved an hour ago and the payout released. On your desktop you still have the client's files and your draft versions. What do you do?",
          "options": [
            "Keep them for a week in case the client asks for changes.",
            "Delete everything task-related now; keeping copies after approval is not allowed.",
            "Keep only your drafts, since you made those yourself.",
            "Move them to a personal cloud folder as a private backup."
          ],
          "correct": 1,
          "explain": "Keep no copies after approval. Drafts and exports made from client files count as client data, and anything further would come back through the platform with the files."
        },
        {
          "prompt": "You finished a product list task. Two hundred entries were fine; twelve had prices in the wrong currency, so you converted them using the rate implied elsewhere in the file. Which delivery note is best?",
          "options": [
            "All done, thanks for the task, hoping for approval.",
            "Delivered the list. Twelve prices were in another currency; converted at the file's implied rate, marked in column F.",
            "Some prices looked wrong so I fixed them the best I could.",
            "A full page explaining your method, your doubts, and your working conditions."
          ],
          "correct": 1,
          "explain": "A good note states what you delivered, the decision you made, and where to check it. Factual and short, it lets the operator verify in seconds."
        },
        {
          "prompt": "QC rejects your delivery: the operator says the column headers do not match the template in the brief. While fixing them, you notice a date typo the operator did not mention. What do you do?",
          "options": [
            "Fix only the headers; changing unmentioned things risks new problems.",
            "Fix the headers and the typo silently; the note should stay short.",
            "Fix both, and state in your note everything you changed, including the typo.",
            "Fix the typo only if it sits in the columns the operator named."
          ],
          "correct": 2,
          "explain": "Fix what was named, recheck the rest, and report every change. Silent fixes and ignored defects both erode trust, while a stated fix builds it."
        },
        {
          "prompt": "You claimed a task with a deadline eight hours away. Two hours in, your electricity fails and will not return until morning. What is the best move?",
          "options": [
            "Wait for the power and deliver late with an apology in your note.",
            "Deliver whatever you can from your phone so something arrives on time.",
            "Do nothing; the claim will expire on its own at the deadline.",
            "Release the task now so it returns to the pool with six hours left."
          ],
          "correct": 3,
          "explain": "You truly cannot deliver, so an early release gives the task its best chance with another worker. A late or partial delivery hurts the client and your record more."
        },
        {
          "prompt": "The brief asks you to transcribe a 30-minute recording. At minute 22, two minutes are inaudible no matter what you try. Delivery is due soon. What do you do?",
          "options": [
            "Write what the speakers most likely said, based on context.",
            "Skip the inaudible part without mentioning it; two minutes is minor.",
            "Transcribe the rest and mark the inaudible span with timestamps, explaining it in your note.",
            "Release the task; a transcript with gaps is not a real deliverable."
          ],
          "correct": 2,
          "explain": "Flag, never guess. Invented dialogue is a wrong guess the client may act on, while a marked gap with timestamps is honest and still useful."
        },
        {
          "prompt": "A task deadline shows 13:00 in your app. You believe the client is probably twelve hours behind you. When is the work due?",
          "options": [
            "13:00 on your clock; the app already shows deadlines in your local time.",
            "01:00 your time, after converting for the client's likely timezone.",
            "Whenever the client's morning starts, which you should estimate.",
            "13:00 in the client's timezone, so about a day later for you."
          ],
          "correct": 0,
          "explain": "Deadlines are always displayed in your own local time, so no conversion is needed. Estimating the client's location is something you should not be doing anyway."
        }
      ]
    }
  },
  "business-english": {
    "slug": "business-english",
    "title": "Business English for deliverables",
    "track": "foundations",
    "tagline": "Plain, confident written English that gets deliveries approved the first time.",
    "summary": "Writing is part of every deliverable you send, and clear writing gets approved faster. This course teaches plain professional English for written work and delivery notes: short sentences, a neutral confident tone, the four-part delivery note, the grammar slips North American readers notice first, and proofreading passes that catch real errors. You finish able to write deliverables that pass QC without a second read.",
    "outcomes": [
      "You can write short, active sentences that carry one idea each.",
      "You can write a four-part delivery note with counts, flags, and assumptions.",
      "You can replace over-formal phrases like kindly revert with plain modern English.",
      "You can catch article, tense, and agreement slips before the operator does.",
      "You can proofread in focused passes that catch errors spellcheck misses.",
      "You can keep every factual claim inside what the brief supplied."
    ],
    "lessons": [
      {
        "title": "Writing that gets approved",
        "minutes": 5,
        "sections": [
          {
            "heading": "Your writing is part of the deliverable",
            "body": "Every task you deliver passes through QC before the client sees it. The operator reads your work and your delivery note at night, often between other tasks. Clear writing gets approved fast. Confusing writing gets reread, questioned, or sent back for revision, and revisions cost time you are not paid extra for. We wrote this course as polish, not remedial English. You already write well. What we teach is the specific style North American businesses expect in written deliverables: plain, short, direct. It is a learnable skill, and it applies to every task you claim, because even a spreadsheet ships with a delivery note."
          },
          {
            "heading": "One idea per sentence",
            "body": "A plain sentence carries one idea. When a sentence carries two, split it. Compare these. 'I cleaned the file and I noticed some rows were missing dates which I left blank for now.' That is three ideas crammed together. Split: 'I cleaned the file. Forty rows were missing dates. I left those cells blank.' Three sentences, three ideas, nothing lost. Aim for sentences under 20 words. You do not need to count every time. When a sentence feels long, it is. Read it again and find the second idea hiding inside. Give that idea its own sentence."
          },
          {
            "heading": "Active voice and concrete verbs",
            "body": "Active voice names who did what. 'The file was updated' hides the actor. 'I updated the file' is shorter and clearer, and in a delivery note the actor matters, because the operator needs to know what you did versus what was already there. Concrete verbs beat vague ones. 'I dealt with the duplicates' says little. 'I deleted 12 duplicate rows' says everything. Prefer verbs like deleted, merged, renamed, flagged, and skipped over handled, processed, and addressed. Vague verbs feel safe. They are not. They force the operator to ask what you actually did, and questions slow down approval."
          }
        ],
        "keyPoints": [
          "Clear writing gets approved faster; confusing writing gets reread or sent back.",
          "One idea per sentence; split any sentence carrying two.",
          "Active voice names who did what; the operator needs to know it was you.",
          "Concrete verbs like deleted and merged beat vague verbs like handled and processed."
        ]
      },
      {
        "title": "Tone: neutral, confident, never sorry",
        "minutes": 5,
        "sections": [
          {
            "heading": "What business-neutral sounds like",
            "body": "Business writing in North America is flat on purpose. No warm openings, no decorated closings, no compliments. A delivery note that starts 'I hope this message finds you well' reads as padding, because the operator is scanning dozens of notes and wants the facts. Neutral does not mean cold or rude. It means the words carry information and nothing else. 'Cleaned 480 rows. Two flags below.' is a perfectly polite note. If you were taught to open with courtesy phrases, this will feel abrupt at first. It is not abrupt to the reader. It respects the reader's time, and in this business, respecting the reader's time is the courtesy."
          },
          {
            "heading": "Confident, not apologetic",
            "body": "Do not apologize for doing your job. 'Sorry for the trouble, but I was not able to open sheet two' buries the fact under an apology you do not owe. Write 'Sheet two would not open. I completed sheets one and three and explained it in my delivery note.' Apologetic writing makes solid work sound like a failure, and the operator reviewing it may trust the work less than it deserves. Save 'sorry' for actual mistakes, and even then, one short sentence is enough. State the error, state the fix, move on. Confidence in writing is not boasting. It is stating what happened without hedging or flinching."
          },
          {
            "heading": "Never flowery",
            "body": "Flowery writing tries to impress. Business writing tries to inform. 'I have meticulously and thoroughly examined each and every record' says less than 'I checked all 300 records.' Adverbs like meticulously, kindly, and humbly add no information, and stacked adjectives slow the reader down. The same goes for long words where short ones exist. Use 'use' instead of 'utilize', 'help' instead of 'facilitate', 'send' instead of 'transmit'. This is not dumbing down. Plain words are what senior people in North American companies actually write. The more responsibility a person has, the shorter their sentences tend to get. Write like the work speaks for itself, because after QC, it will."
          }
        ],
        "keyPoints": [
          "Neutral tone means the words carry information and nothing else.",
          "Skip warm openings and courtesy padding; facts first is the polite version.",
          "Apologize only for real mistakes, in one sentence, then state the fix.",
          "Short plain words beat long formal ones; senior people write plainly."
        ]
      },
      {
        "title": "The delivery note formula",
        "minutes": 6,
        "sections": [
          {
            "heading": "Four parts, every time",
            "body": "Every delivery note has the same four parts, in the same order. What you did. The counts. What you flagged. What you assumed. A complete example: 'Cleaned the contact list per the brief. Processed 1,240 rows, removed 85 duplicates, standardized all phone numbers to the US format. Flagged 12 rows with emails that look invalid; they are marked in column H. Assumed the two Toronto entries keep their existing format since the brief only specified US numbers.' Four parts, five sentences, and the operator knows everything needed to approve the work. Write the note in this order before you attach the files. It takes three minutes and prevents most revision requests."
          },
          {
            "heading": "Counts prove the work",
            "body": "Numbers are the fastest way to show what happened. 'Removed duplicates' is a claim. 'Removed 85 duplicates' is a fact the operator can verify against the file. Count what you processed, what you changed, what you skipped, and what you flagged. If the brief said 1,200 rows and you found 1,240, say so, because a mismatch you report is information and a mismatch the operator discovers is a doubt. Rounding is fine for large numbers, but exact counts are better when the number is small enough to matter. If you flag 12 problem rows, the operator needs to find exactly 12, so say where they are."
          },
          {
            "heading": "Flags and assumptions are professionalism",
            "body": "Flagging is not admitting weakness. It is often the most valuable sentence in your note. When you hit something the brief does not cover, be honest about it in writing. Either make a reasonable assumption, continue, and state the assumption in your note, or complete what you can and flag the gap clearly. What you may never do is guess silently. A silent guess that turns out wrong becomes a QC rejection on your record. A stated assumption that turns out wrong becomes a quick revision, with your reasoning on file. Write flags plainly: what you found, where it is, what you did about it. Write assumptions the same way: what was unclear, what you chose, and why."
          }
        ],
        "keyPoints": [
          "Every note has four parts: did, counts, flagged, assumed, in that order.",
          "Exact counts turn claims into facts the operator can verify.",
          "A mismatch you report is information; one the operator finds is doubt.",
          "Never guess silently; state the assumption or flag the gap."
        ]
      },
      {
        "title": "Articles, tense, and agreement",
        "minutes": 6,
        "sections": [
          {
            "heading": "A, an, and the",
            "body": "Philippine English handles articles differently from North American English in places, and article slips are the first thing many American readers notice. The core rule: use 'the' when the reader already knows which one you mean, use 'a' or 'an' when introducing something new, and use no article for plurals and general concepts. 'I cleaned the file' works because the brief named the file. 'I found a duplicate' introduces it. 'Duplicates are marked in red' is general, so no article. Once the brief establishes them, it is 'the client', 'the brief', and 'the file'. And two common nouns never take a plural s in this register: it is 'feedback' and 'information', never 'feedbacks' or 'informations'."
          },
          {
            "heading": "Keep tense consistent",
            "body": "A delivery note describes finished work, so use simple past throughout. 'I cleaned the file, removed duplicates, and flagged three rows.' Watch for drift into present or future midway. 'I cleaned the file and I will flag three rows' mixes done with not done, and the operator cannot tell whether the flagging happened. If something is genuinely not done, say so directly in its own sentence: 'Sheet two is not included; it would not open.' Tense drift usually comes from writing the note while you are still working. Write it after you finish instead. Then everything really is past tense, and the note describes what the files actually contain."
          },
          {
            "heading": "Subject-verb agreement under pressure",
            "body": "Agreement errors appear when words come between the subject and the verb. 'The list of contacts were cleaned' is wrong because the subject is 'list', not 'contacts', so it takes 'was'. Strip the middle phrase to check: the list was cleaned. Common traps: 'each' and 'every' take singular verbs, so 'each row was checked'. 'Data' is treated as singular in business writing: 'the data is clean'. 'One of the files was corrupted', because 'one' is the subject. These errors do not make your work wrong, but they make careful work look careless, and QC judges the whole package."
          }
        ],
        "keyPoints": [
          "Use 'the' for established things like the brief and the file.",
          "'Feedback' and 'information' never take a plural s.",
          "Write the note after finishing so everything stays in past tense.",
          "Strip the middle phrase to find the real subject before choosing the verb."
        ]
      },
      {
        "title": "Comma splices and over-formal habits",
        "minutes": 5,
        "sections": [
          {
            "heading": "The comma splice",
            "body": "A comma splice joins two complete sentences with only a comma. 'I finished the file, it is attached' contains two sentences, so the comma is not enough. Three fixes work. Use a period: 'I finished the file. It is attached.' Use a connecting word: 'I finished the file, and it is attached.' Or split the ideas apart entirely if they are unrelated. The period is almost always the best fix in a deliverable, because short separate sentences are the style you want anyway. To spot splices, look at each comma and ask whether the words on both sides could stand alone as sentences. If both could, the comma needs help."
          },
          {
            "heading": "Retire the over-formal phrases",
            "body": "Some phrases common in Philippine business English read as outdated to North American clients. 'Kindly revert' means nothing to them; write 'please reply' or drop it. 'As per the brief' becomes 'per the brief' or 'the brief says'. 'The same' used as a noun, as in 'please review the same', becomes 'please review it'. 'Herewith attached' becomes 'attached'. 'For your perusal' becomes 'for your review' or nothing at all. 'Awaiting your feedbacks' becomes 'let me know if anything needs revision'. None of these older phrases are wrong English. They belong to a different formal tradition, and in a North American deliverable they pull attention away from the work itself."
          },
          {
            "heading": "The plain replacement habit",
            "body": "The pattern behind all these swaps is the same. When two phrasings carry the same meaning, choose the shorter and more common one. 'In order to' becomes 'to'. 'At this point in time' becomes 'now'. 'Due to the fact that' becomes 'because'. 'Please be advised that the file is ready' becomes 'the file is ready'. You do not need to memorize a list. When you finish a note, reread it and cut every word whose removal changes nothing. Most notes lose a quarter of their length this way and read better for it. Shorter is not lazier. Shorter means every remaining word was chosen."
          }
        ],
        "keyPoints": [
          "If both sides of a comma could stand alone, use a period instead.",
          "Replace 'kindly revert', 'the same', and 'as per' with plain modern phrasing.",
          "Cut every word whose removal changes nothing.",
          "The old formal phrases are not wrong, just wrong for this audience."
        ]
      },
      {
        "title": "Facts, proofreading, and the final pass",
        "minutes": 6,
        "sections": [
          {
            "heading": "No facts the brief did not supply",
            "body": "Written deliverables may not contain factual claims the brief did not give you. If you are drafting product descriptions and the brief lists dimensions for nine products but not the tenth, you do not estimate the tenth from a photo. You flag it. This is not only about accuracy. Client-facing text with an invented fact can reach a customer, and the client owns the consequences. The rule covers numbers, dates, names, prices, features, and claims like 'best' or 'fastest'. If it is not in the brief or the task files, it does not go in the deliverable. The confidentiality rule is the other half: never paste client text into outside tools or AI services to check or rewrite it, unless the brief says to."
          },
          {
            "heading": "Three passes, one job each",
            "body": "Proofreading fails when you look for everything at once, so give each pass one job. Pass one: read the text aloud, or mouth it slowly. Your ear catches missing words, tense drift, and sentences that run too long, because you hear the stumble. Pass two: check the numbers. Every count in the note against the file, every figure in the deliverable against the brief. Pass three: spelling, reading backwards from the last word to the first. Backwards reading stops your brain from autocorrecting, which is how 'form' survives when you meant 'from'. Spellcheck will not catch that one; it is a real word. Three focused passes take ten minutes and catch what one general pass misses."
          },
          {
            "heading": "The last five minutes",
            "body": "Before you upload, run the final check. Open the deliverable the way the operator will see it, not in your working copy. Read the delivery note once more and confirm it has all four parts: did, counts, flagged, assumed. Confirm every flag in the note points to a real place in the file. Confirm the file names match what the brief asked for. Then deliver. After the task is approved, delete your local copies, because client files never stay with you. A worker who delivers clean writing, honest flags, and verified counts, task after task, becomes a worker whose deliveries get approved quickly. That reputation is built five minutes at a time."
          }
        ],
        "keyPoints": [
          "If a fact is not in the brief or task files, it stays out.",
          "Never paste client text into outside tools unless the brief says to.",
          "One proofreading pass per error type: ear, numbers, backwards spelling.",
          "Reading backwards catches real-word typos that spellcheck misses.",
          "Delete local copies after approval; client files never stay with you."
        ]
      }
    ],
    "exam": {
      "questions": [
        {
          "prompt": "Your draft delivery note says: 'I cleaned the file and I noticed 40 rows had no dates which I left blank and also flagged them.' What is the best revision?",
          "options": [
            "I cleaned the file. Forty rows had no dates. I left those cells blank and flagged them in my note.",
            "The file was cleaned and the rows without dates were left blank and flagged accordingly.",
            "I have meticulously cleaned the entire file and handled the rows which were missing their dates.",
            "Kindly note the file is now cleaned, the dateless rows are blank, the same have been flagged."
          ],
          "correct": 0,
          "explain": "Short sentences with one idea each, active voice, and a real count. The others use passive voice, vague verbs, filler adverbs, or over-formal phrasing."
        },
        {
          "prompt": "Sheet two of a client workbook will not open. You finished sheets one and three. How do you report this in your delivery note?",
          "options": [
            "I sincerely apologize for the inconvenience; unfortunately I experienced difficulties with sheet two despite my best efforts.",
            "Sheet two would not open. I completed sheets one and three and explained the issue in this note.",
            "Everything is mostly done. There was a small issue, but the important sheets are complete.",
            "I completed the workbook. Sheet two had some minor problems."
          ],
          "correct": 1,
          "explain": "State the fact plainly and flag it; no apology is owed for a broken file. Minimizing or hiding the problem misleads the operator."
        },
        {
          "prompt": "You finished a data-cleaning task and are writing the delivery note. Which note follows the four-part formula?",
          "options": [
            "Task complete. Please review and let me know your feedbacks at the soonest possible time.",
            "Everything went well. The file was processed and all issues were handled. Thank you for the opportunity.",
            "Cleaned the list. Processed 900 rows, removed 61 duplicates. Flagged 8 suspect emails in column F. Assumed UK numbers keep their format.",
            "Cleaned 900 rows. I hope this note finds you well. Looking forward to more tasks like this one."
          ],
          "correct": 2,
          "explain": "What you did, the counts, what you flagged, what you assumed, in that order. The others offer padding and vague claims with no verifiable facts."
        },
        {
          "prompt": "The brief says the file has 1,200 rows. You open it and find 1,246, and the extra rows look like valid data. What do you do?",
          "options": [
            "Process only the first 1,200 rows so the delivery matches the brief.",
            "Say nothing; the client probably updated the file after writing the brief.",
            "Delete 46 rows so the totals match the brief exactly.",
            "Process all 1,246 rows and report the count difference in your delivery note."
          ],
          "correct": 3,
          "explain": "A mismatch you report is information; one the operator discovers is doubt. Silently trimming, deleting, or ignoring rows hides a real discrepancy."
        },
        {
          "prompt": "You are writing product descriptions. The brief gives dimensions for nine products but not the tenth, and the tenth product's photo shows a ruler beside it. What do you do?",
          "options": [
            "Estimate the dimensions from the photo, since the ruler makes it reasonably accurate.",
            "Write the tenth description without dimensions and flag the missing data in your delivery note.",
            "Copy the dimensions of the most similar product so the format stays consistent.",
            "Search for the product online and use the manufacturer's published dimensions."
          ],
          "correct": 1,
          "explain": "Deliverables make no factual claim the brief did not supply. Estimating, copying, or researching invents a fact the client never approved; flag the gap instead."
        },
        {
          "prompt": "Which sentence handles articles correctly for a North American business reader?",
          "options": [
            "I reviewed brief and cleaned a file as instructed.",
            "The feedbacks from client are addressed in a same file.",
            "I reviewed the brief and cleaned the file. Duplicates are marked in red.",
            "I reviewed a brief and cleaned file. The duplicates data are marked in the red."
          ],
          "correct": 2,
          "explain": "The brief and the file are already established, so they take 'the'. General plurals like duplicates take no article, and 'feedback' never takes an s."
        },
        {
          "prompt": "Your draft note reads: 'I cleaned the file and I will flag three rows with bad emails.' You already marked those rows before uploading. What is the problem?",
          "options": [
            "The tense mixes past and future, so the operator cannot tell what is done. Rewrite it all in past tense.",
            "The note is too short; add a courtesy opening before the facts.",
            "Nothing is wrong; the operator will understand the flags were completed.",
            "It should use passive voice so it sounds more professional."
          ],
          "correct": 0,
          "explain": "A delivery note describes finished work in simple past. Mixed tense leaves the operator unsure whether the flagging actually happened. Write the note after you finish."
        },
        {
          "prompt": "Which sentence is grammatically correct?",
          "options": [
            "The list of contacts were cleaned, and each rows were checked.",
            "The list of contacts was cleaned, and each row was checked.",
            "The list of contacts were cleaned, and each row was checked.",
            "The lists of contact was cleaned, and every rows was checked."
          ],
          "correct": 1,
          "explain": "The subject is 'list', which is singular, so it takes 'was'. 'Each' also takes a singular verb. Strip the middle phrase to find the true subject."
        },
        {
          "prompt": "Your note reads: 'I finished the file, it is attached.' What is wrong, and what is the best fix?",
          "options": [
            "It is too informal; write 'Herewith attached please find the finished file for your perusal.'",
            "Nothing is wrong; a comma can join any two related statements.",
            "It needs 'kindly revert' at the end so the reader knows to respond.",
            "It is a comma splice; write 'I finished the file. It is attached.'"
          ],
          "correct": 3,
          "explain": "Both halves stand alone as complete sentences, so a comma alone cannot join them. A period is the cleanest fix and matches the plain style."
        },
        {
          "prompt": "Your draft says: 'As per the brief, kindly find attached the report for your perusal, and revert with your feedbacks.' Which rewrite fits a North American deliverable?",
          "options": [
            "Per the brief, the report is attached. Let me know if anything needs revision.",
            "As per the aforementioned brief, please peruse the same and kindly revert soonest.",
            "Attached herewith is the report as per your instructions, awaiting your kind feedbacks.",
            "I am pleased to humbly submit the attached report for your most kind consideration and review."
          ],
          "correct": 0,
          "explain": "Plain modern phrasing replaces 'as per', 'kindly', 'perusal', 'revert', and 'feedbacks'. The other options keep or add over-formal constructions that read as dated."
        },
        {
          "prompt": "You typed 'form' where you meant 'from' in a client-facing document, and spellcheck shows no errors. Which proofreading pass is designed to catch this?",
          "options": [
            "Running spellcheck a second time with a stricter dictionary.",
            "A quick general read-through looking for anything that seems off.",
            "A backwards spelling pass, reading word by word from the end, so your brain cannot autocorrect.",
            "Reading the document aloud at normal speed, which reliably catches every typo."
          ],
          "correct": 2,
          "explain": "'Form' is a real word, so spellcheck accepts it. Reading backwards breaks the flow that lets your brain see what you meant instead of what you typed."
        },
        {
          "prompt": "Before delivering, you want to polish your written descriptions. You consider pasting the client's product text into a free online AI rewriting tool. The brief says nothing about outside tools. What do you do?",
          "options": [
            "Paste it in; the tool is free, and free tools are allowed.",
            "Paste only half the text at a time so the full document is never exposed.",
            "Ask a friend who writes strong English to review the document for you.",
            "Proofread it yourself with the focused passes; client text stays inside the task."
          ],
          "correct": 3,
          "explain": "Client files never leave the task. Unless the brief says otherwise, no outside services, AI tools, or other people see client content, free or not."
        }
      ]
    }
  },
  "spreadsheet-essentials": {
    "slug": "spreadsheet-essentials",
    "title": "Spreadsheet essentials",
    "track": "foundations",
    "tagline": "Sort, clean, match, and survive CSVs without ever breaking the original file.",
    "summary": "Most overnight tasks pass through a spreadsheet at some point: a list to clean, two exports to reconcile, a CSV that arrives broken. This course teaches the tool as we actually use it, in Google Sheets and LibreOffice Calc, both free. You finish able to protect the original file, find problems you cannot see, match data across sheets, survive the CSV traps, and deliver work an operator can approve on the first pass.",
    "outcomes": [
      "You can clean a client file without ever putting the original version at risk.",
      "You can surface duplicates, collisions, and invisible whitespace before QC finds them.",
      "You can reconcile two sheets with lookups and account for every mismatch.",
      "You can import and export CSVs without losing zeros, dates, or accented names.",
      "You can write a delivery note that tells the operator what you changed and flagged."
    ],
    "lessons": [
      {
        "title": "Never touch the only version",
        "minutes": 4,
        "sections": [
          {
            "heading": "The first move on any file",
            "body": "When you claim a task, the files you download may be the only copy of the client's data that exists. Treat the download as evidence, not as a workspace. Before you change a single cell, make a duplicate and do all your work in the duplicate. If a formula goes wrong, a sort scrambles rows, or the operator sends the task back for revision, the untouched original is your restart point. Without it, a mistake can be permanent, and permanent mistakes on client data are how tasks get rejected. This habit costs ten seconds. Every other technique in this course assumes you have done it."
          },
          {
            "heading": "Name the working copy clearly",
            "body": "Keep the original file exactly as it arrived, name and all. Save your duplicate with the original name plus a suffix that says what it is, such as orders_working or orders_clean_v1. If the task runs long, save a new version at each major stage instead of overwriting: v1 after import, v2 after de-duplication, v3 ready to deliver. Versions cost nothing and let you step back one stage instead of starting over. When you deliver, send only the finished file, with a name the client will recognize, unless the brief asks for something else. A folder that reads original, working, delivered tells its own story if you ever need to retrace a step."
          },
          {
            "heading": "Freeze the header row",
            "body": "Before you scroll anywhere in a big sheet, lock the header row so column names stay visible. In Google Sheets, use View, then Freeze, then 1 row. In LibreOffice Calc, click the cell below and to the right of what you want locked, then View, then Freeze Rows and Columns. Without frozen headers, row 4,000 is a wall of unlabeled numbers, and entering data one column off is a quiet, serious error. If the sheet is wide, freeze the first column too, so the ID or name that identifies each row travels with you. Widen cramped columns while you are at it. Seeing the data clearly is not cosmetic. Most spreadsheet mistakes start with misreading what a cell belongs to."
          }
        ],
        "keyPoints": [
          "The download is evidence. Duplicate it, name the copy, and edit only the copy.",
          "Save a new version at each major stage instead of overwriting.",
          "Freeze headers before you scroll. Many errors start with misreading which column a cell belongs to."
        ]
      },
      {
        "title": "Sort and filter are investigation tools",
        "minutes": 4,
        "sections": [
          {
            "heading": "Sorting shows you the edges",
            "body": "Sorting is the fastest way to meet a dataset. Sort a numeric column and the extremes surface: blanks and zeros at one end, suspicious outliers at the other, and any text trapped among the numbers grouped by itself. Sort a name column and near-duplicates land next to each other where you can see them. Before you clean anything, sort each important column once and skim both ends. Two minutes of this tells you what kind of trouble the file holds: missing values, impossible amounts, dates typed as text. We treat sorting as a diagnostic, not just a way to arrange the final file. The problems you find here decide what the rest of the task looks like."
          },
          {
            "heading": "Sort whole rows or scramble the file",
            "body": "The most destructive spreadsheet mistake is sorting one column by itself. If only the Amount column moves, every amount detaches from its row and reattaches to the wrong customer, and there is no way to see it happened. Every value still looks valid. Protect yourself two ways. First, select the entire table before sorting, or use Data, then Sort range in Google Sheets with the header option ticked. Second, when LibreOffice Calc asks whether to extend the selection, always say yes. If you ever suspect a partial sort happened, stop and go back to your untouched original. This is the single strongest reason the working copy exists."
          },
          {
            "heading": "Filters isolate one question at a time",
            "body": "A filter hides every row except the ones that answer your current question. Filter Status to a single value and the row count in the corner tells you how many there are without counting. The filter dropdown itself is a finding: it lists every distinct value in the column, so typos like Shipped, shipped, and Shiped stand out immediately, and a blank entry in the list means missing data. Two warnings. Rows hidden by a filter are still in the file, so clear every filter before you export or deliver, or you will misjudge what you are sending. And when you delete filtered rows, check the visible row numbers first so you know exactly what is going."
          }
        ],
        "keyPoints": [
          "Sort each key column and skim both ends before cleaning anything.",
          "Never sort a single column alone. Whole rows move, or nothing moves.",
          "The filter dropdown lists every distinct value, exposing typos and blanks at a glance.",
          "Clear all filters before exporting or delivering."
        ]
      },
      {
        "title": "The dirt you cannot see",
        "minutes": 5,
        "sections": [
          {
            "heading": "Invisible whitespace",
            "body": "Two cells can look identical and still not match, because one carries a trailing space, a doubled space, or a non-breaking space pasted in from a web page or PDF. This invisible dirt is why lookups fail, why filters show the same name twice, and why counts come out wrong. To test whether two suspicious cells really match, type an equals formula comparing them, such as =A2=B2, or compare their lengths with LEN. To clean a column, add a helper column with =TRIM(A2) and fill it down. TRIM removes leading, trailing, and repeated spaces. Wrap it as =TRIM(CLEAN(A2)) to also strip non-printing characters that arrive in exported files. Clean the helper, then move the clean values back, as the last section shows."
          },
          {
            "heading": "Numbers stored as text",
            "body": "A column can look numeric while some cells are actually text, usually after a CSV import or a paste from another system. The signs: those cells hug the left edge while real numbers sit right, SUM returns far less than the visible values suggest, and sorting puts them in a strange order. Do not retype them. In a helper column, multiply each by 1, as =A2*1, or use =VALUE(A2); either forces text into a real number. In LibreOffice Calc, Data, then Text to Columns on the selected column also converts in place. Dates stored as text behave the same way and break date sorting, so check them too. A total that is too low is almost never missing data. It is text pretending."
          },
          {
            "heading": "Paste values, then remove the scaffolding",
            "body": "Helper columns are scaffolding, and scaffolding comes down before delivery. Once a helper column holds clean values, copy it, then paste it over the original column as values only: Edit, then Paste special, then Values only in Google Sheets, or Paste Special in Calc with only numbers and text ticked. Then delete the helper column. If you skip the values-only step, you paste formulas that still point at the helper column, and they all break the moment you delete it. Make this a reflex: formulas are for working, values are for delivering. A delivered file should contain no helper columns, no leftover formulas referencing deleted ranges, and no error cells, because the client sees exactly what you leave behind."
          }
        ],
        "keyPoints": [
          "Cells that look identical but will not match usually differ by invisible spaces.",
          "TRIM and CLEAN in a helper column fix a whole column at once.",
          "Left-aligned numbers and a too-low SUM mean text pretending to be numbers.",
          "Paste values over the original, then delete the helper column."
        ]
      },
      {
        "title": "Flag duplicates before you delete them",
        "minutes": 5,
        "sections": [
          {
            "heading": "COUNTIF exposes every collision",
            "body": "Before touching duplicates, see all of them. Add a helper column beside the column that should be unique, such as order ID or email, and enter =COUNTIF(A:A,A2), then fill down. Every row now shows how many times its value appears in the whole column. Filter the helper for values greater than 1 and every collision is in front of you at once, with its full row visible. This beats scrolling a sorted column, because your eyes miss repeats that a count cannot. It also beats running a removal tool blind, because you see what would be affected before anything changes. Counting first, acting second is the pattern for every destructive operation in this course."
          },
          {
            "heading": "A match is a claim, not a fact",
            "body": "Two rows sharing an email are not automatically the same person. It could be one customer entered twice, a couple sharing an address, or a data-entry error that borrowed the wrong email. Built-in Remove Duplicates tools make this worse in two ways: they compare only the columns you tick, and they keep the first row and silently discard the rest, without ever showing you what was thrown away. If the discarded row held the correct phone number and the kept row held an old one, the tool just destroyed the better data. Reserve Remove Duplicates for rows that are identical in every column. Anything less than a full-row match is a judgement, and judgements about client data are not yours to make silently."
          },
          {
            "heading": "Flag first, delete only on instruction",
            "body": "Unless the brief explicitly says to delete duplicates, mark them and report them. Note in your delivery how many collisions you found and where they are, and leave the rows in place or in a clearly marked state, whichever the brief supports. If the brief does say to remove duplicates, remove only exact full-row matches and state the count you removed. When two rows collide but conflict, like one email carrying two different names, that is exactly the kind of uncertainty we want flagged, not resolved by guessing. A note that says you found 32 collisions and left 2 conflicting pairs for a decision reads as careful work. A silent deletion that later proves wrong reads as damage."
          }
        ],
        "keyPoints": [
          "COUNTIF greater than 1 in a helper column shows every collision before you act.",
          "Remove Duplicates keeps the first row and silently discards the rest.",
          "Only exact full-row matches are safe to remove, and only when the brief says so.",
          "Conflicting rows are a flag for the operator, not a coin flip."
        ]
      },
      {
        "title": "Reconcile two sheets with lookups",
        "minutes": 5,
        "sections": [
          {
            "heading": "The reconciling job",
            "body": "A common overnight task hands you two lists that should agree and asks whether they do: an order export against a fulfillment report, a member list against payments received, last month's inventory against this month's. The question is always the same. Which rows appear in both, which are missing from one side, and where do the details disagree. Doing this by eye across thousands of rows is guesswork. A lookup formula does it exactly: for each row in the first sheet, it reaches into the second sheet, finds the matching key, and brings back a value you can compare. Master one lookup pattern and this entire family of tasks becomes routine."
          },
          {
            "heading": "VLOOKUP and XLOOKUP, exact match only",
            "body": "The workhorse is =VLOOKUP(A2, Sheet2!A:C, 3, FALSE). Read it as: take the key in A2, find it in the first column of Sheet2 columns A to C, and return the value from the third column of that range. The FALSE at the end forces an exact match, and for reconciling it is not optional. Without it, the formula returns the nearest value it can find and you get confident wrong answers. Google Sheets and newer LibreOffice Calc versions also offer XLOOKUP, which is easier to read: =XLOOKUP(A2, Sheet2!A:A, Sheet2!C:C, \"missing\"). It looks in one range, returns from another, and shows your own message when there is no match. Use whichever your tool has, and always demand the exact match."
          },
          {
            "heading": "An #N/A is a finding, not a nuisance",
            "body": "When a lookup returns #N/A, it is telling you no exact match exists. Before you believe it, rule out the dirt from the previous lesson: TRIM both key columns, and make sure one side does not hold real numbers while the other holds the same digits stored as text, because those will not match either. After cleaning, run the lookup again. The #N/A rows that remain are the real answer to the task: these rows exist on one side only. Count them and report them in your delivery note. Never blank out or delete #N/A cells to make the sheet look tidy. The mismatches are what the client is paying to learn."
          }
        ],
        "keyPoints": [
          "The FALSE fourth argument forces exact match. For reconciling it is never optional.",
          "TRIM both key columns and fix text-numbers before trusting any lookup result.",
          "The #N/A rows that survive cleaning are the finding. Report them, never hide them."
        ]
      },
      {
        "title": "The CSV minefield",
        "minutes": 6,
        "sections": [
          {
            "heading": "Opening is not importing",
            "body": "A CSV file is plain text, and something has to decide how to slice it into columns, what encoding the characters use, and whether a value is a number, a date, or text. Double-click a CSV and your spreadsheet makes all of those decisions silently, by guessing. Importing means you make them. In Google Sheets, use File, then Import, and review the options. LibreOffice Calc shows an import dialog every time it opens a CSV; read it instead of clicking through, because that preview is where every trap in this lesson gets disarmed. The rule: never let a client CSV be opened by guesswork. Import it, look at the preview, and set the columns yourself."
          },
          {
            "heading": "Leading zeros and long numbers die",
            "body": "Open a CSV of phone numbers by double-click and 09171234567 becomes 9171234567, because the tool decided it was a number and numbers do not start with zero. Long IDs suffer worse: a 16-digit tracking number becomes scientific notation like 9.3E+15, and the trailing digits are rounded away for good. If you save over the file in that state, the damage becomes permanent. The defense happens at import: in the preview, set every ID-like column, phone, tracking, SKU, postal code, to Text. Text columns keep exactly what the file contains. If the zeros are already gone in a sheet you were given, do not pad them back by formula, because you would be guessing which values ever had one. Flag it."
          },
          {
            "heading": "Dates and accents get mangled",
            "body": "The date 03/04/2026 is March 4 in one convention and April 3 in another, and an import can silently swap every day and month in the file. Watch the sample values in the import preview, and if the source format is ambiguous and the brief does not settle it, flag it rather than guess: a wrong assumption corrupts every date at once. Accents break differently. When names arrive as garbled sequences like JosÃ©, the file was decoded with the wrong character encoding. Reimport and set the encoding to UTF-8, which fixes most files; if it still looks wrong, try Windows-1252, common in files from older systems. Never repair mangled names by hand, because you will miss some and invent others."
          },
          {
            "heading": "Delimiter surprises",
            "body": "Not every CSV uses commas. Files from European systems often use semicolons, and some exports use tabs or pipes. The symptom is unmistakable: the import preview shows every value crammed into one giant column. The fix is one click, changing the delimiter in the import dialog until the preview snaps into clean columns. The subtler trap is a comma inside a value, like Smith, John, in a file that does not quote its fields properly, which shifts everything after it one column right for that row. Skim the last column after import; stray values there usually mean a shifted row. Fix a handful by hand and note it, but if the file is riddled with them, flag it to the operator."
          }
        ],
        "keyPoints": [
          "Never open a client CSV by double-click. Import it and read the preview.",
          "Set phone, ID, and postal-code columns to Text at import, or zeros and digits die.",
          "Ambiguous dates corrupt silently. If the brief does not settle the format, flag it.",
          "Garbled accents mean wrong encoding. Reimport as UTF-8; never fix names by hand.",
          "One giant column means the wrong delimiter. Change it in the import dialog."
        ]
      },
      {
        "title": "Deliver without undoing your work",
        "minutes": 5,
        "sections": [
          {
            "heading": "Exporting back to CSV",
            "body": "If the brief asks for CSV back, export it deliberately. In Google Sheets, use File, then Download, then Comma Separated Values. In LibreOffice Calc, use Save As with Text CSV, keep UTF-8 as the character set, and use the delimiter the brief asks for. Two things to know before you click. CSV holds values only: formulas, colors, notes, and frozen panes do not survive, so paste everything as values first, as the earlier lesson showed. And CSV exports only the active sheet, so if your workbook has helper tabs, make sure the sheet on screen is the finished one. If the brief does not name a format, deliver the format the client sent, because they chose it for a reason."
          },
          {
            "heading": "Verify in a text editor, not by reopening",
            "body": "Here is the trap that catches careful workers. You protected the leading zeros, exported the CSV, and double-clicked it to check your work. The zeros look gone again. They are not. Reopening a CSV in a spreadsheet reruns the same guessing that stripped them the first time; you are looking at the display, not the file. The honest check is a plain text editor, Notepad on Windows or any equivalent, which shows the file's actual contents. If the zeros, dates, and accents are right there, the file is right, and that is what the client's system will read. Verify every export this way before uploading your delivery. It takes thirty seconds and it is the difference between knowing and hoping."
          },
          {
            "heading": "Confidentiality and the delivery note",
            "body": "Client files never leave the task. That means no uploading the file to an online converter, no pasting rows into an AI tool to fix a delimiter, no keeping a sample for your portfolio, unless the brief itself says to. When a file defeats your tools, that is a flag to the operator, never a reason to move data somewhere else. After the task is approved, delete the original, your working copies, and anything left in your downloads folder. Then write the delivery note like a map of your work: rows in and rows out, what you changed, what you flagged, and any counts that matter, such as collisions found or mismatches remaining. The note is what lets the operator approve your work on the first read."
          }
        ],
        "keyPoints": [
          "CSV keeps values only and exports only the active sheet. Paste values first.",
          "Verify exports in a text editor. Reopening the CSV repeats the guessing that broke it.",
          "A stuck file is a flag to the operator, never a reason to upload client data elsewhere.",
          "The delivery note maps your work: rows in, rows out, changes, flags, counts."
        ]
      }
    ],
    "exam": {
      "questions": [
        {
          "prompt": "A client list has 900 rows. You click one cell in the Amount column and sort it to find outliers. LibreOffice Calc asks whether to extend the selection. What do you do?",
          "options": [
            "Keep the current selection, since only the Amount column needs sorting.",
            "Cancel the sort and use a filter instead, since sorting is too risky on client data.",
            "Extend the selection so every full row moves as one unit.",
            "Copy the Amount column to a blank sheet and sort it there."
          ],
          "correct": 2,
          "explain": "Sorting one column alone detaches values from their rows and scrambles the file invisibly. Extending keeps rows intact. A sorted copy is safe but shows values without their rows."
        },
        {
          "prompt": "The brief asks you to clean a CSV of Philippine mobile numbers. You double-click it open and every number has lost its leading zero. What do you do?",
          "options": [
            "Close without saving, then import the CSV with the phone column set to Text.",
            "Add the zero back to every number with a formula that prepends it.",
            "Apply a number format with a forced leading zero, then continue cleaning.",
            "Continue cleaning and mention the missing zeros in your delivery note."
          ],
          "correct": 0,
          "explain": "The zeros still exist in the CSV; only the opened view dropped them. Importing with the column as Text keeps them. Padding or formatting guesses and only masks the display."
        },
        {
          "prompt": "The brief says clean this contact list. You find 32 rows whose email appears more than once. Two of them share an email but have different names and phones. What do you do?",
          "options": [
            "Delete all 32; a repeated email is a duplicate by definition.",
            "Remove only exact full-row duplicates, keep the conflicting pair, and flag it in your delivery note.",
            "Keep whichever conflicting row looks more complete and delete the other.",
            "Merge the conflicting pair into one row that carries both phone numbers."
          ],
          "correct": 1,
          "explain": "A repeated email proves a collision, not a duplicate. Rows that conflict need a decision only the client can make, so you flag them instead of deciding silently."
        },
        {
          "prompt": "A task asks you to confirm that no order ID appears twice in a 5,000-row sheet before the client imports it into their system. What is the reliable check?",
          "options": [
            "Sort by order ID and scroll through, watching for repeats.",
            "Run Remove Duplicates and see whether the row count drops.",
            "Open the ID column's filter dropdown and look for repeated entries.",
            "Add a COUNTIF helper column over the ID column and filter it for values above 1."
          ],
          "correct": 3,
          "explain": "COUNTIF shows every collision without changing the data. Remove Duplicates deletes rows on a task that asked you only to check, and eyes miss repeats across thousands of rows."
        },
        {
          "prompt": "You are matching names across two sheets with VLOOKUP set to exact match. Forty rows return #N/A, yet several of those names clearly appear in both sheets. What do you check first?",
          "options": [
            "Invisible spaces: TRIM both key columns and run the lookup again.",
            "The column index number, in case it points one column off.",
            "The fourth argument: switch it to TRUE so near matches are accepted.",
            "The failing names themselves: retype them by hand until the lookups resolve."
          ],
          "correct": 0,
          "explain": "Names that look identical but fail an exact match almost always differ by hidden whitespace. TRUE invites wrong approximate matches, and a wrong index would break every row, not forty."
        },
        {
          "prompt": "A revenue column should total around 800,000, but SUM returns 4,120. Most cells in the column sit against the left edge. What happened?",
          "options": [
            "The SUM range is too short; extend it to cover the full column.",
            "A filter is hiding rows; clear all filters and total again.",
            "Most values are text; convert them with VALUE or by multiplying by 1.",
            "The file is corrupted; flag it and request a fresh copy."
          ],
          "correct": 2,
          "explain": "Left-aligned values that SUM ignores are numbers stored as text. Converting them in a helper column fixes the whole column at once, without retyping anything."
        },
        {
          "prompt": "A client CSV has dates like 03/04/2026. The brief says standardize dates to YYYY-MM-DD but never says whether the source is day-first or month-first, and every date in the file is ambiguous. What do you do?",
          "options": [
            "Convert as month-first, since the client appears to be a US company.",
            "Convert as day-first, since most of the world writes dates that way.",
            "Convert as month-first, and note in your delivery that day-first was also possible.",
            "Do not convert. Flag the ambiguity to the operator instead of guessing."
          ],
          "correct": 3,
          "explain": "When every date is ambiguous, any conversion is a coin flip that could corrupt the entire file. Flagging costs a short delay; a wrong guess hands the client wrong data."
        },
        {
          "prompt": "You open a client CSV and names appear garbled, such as JosÃ© throughout the file. The brief says names must be preserved exactly. What do you do?",
          "options": [
            "Fix the damaged characters with Find and Replace, working through each pattern.",
            "Reimport the file with the character encoding set to UTF-8.",
            "Deliver as is and note that the characters arrived broken in the source file.",
            "Paste the affected names into an online encoding-repair tool."
          ],
          "correct": 1,
          "explain": "That pattern means the text was decoded with the wrong encoding. Reimporting as UTF-8 fixes every name at once. Hand edits miss some, and client data never goes to outside tools."
        },
        {
          "prompt": "You claim a task and download the client's spreadsheet, the only copy of their data. The brief lists nine cleaning steps. What do you do before starting step one?",
          "options": [
            "Freeze the header row so you can scroll the sheet safely.",
            "Save a duplicate with a clear working name and do all work in the duplicate.",
            "Sort the main column to get a first look at the data.",
            "Read all nine steps again so you can plan the fastest order."
          ],
          "correct": 1,
          "explain": "Every safe habit in this work assumes an untouched original exists to fall back on. If any step goes wrong, or a revision comes back, the clean download is your restart point."
        },
        {
          "prompt": "A client CSV will not import cleanly in Calc; the delimiter seems nonstandard and the preview is a mess. A free website promises to auto-detect and convert any CSV. What do you do?",
          "options": [
            "Upload the file; reputable conversion sites process files automatically and keep nothing.",
            "Upload only the first fifty rows so most of the data stays private.",
            "Paste the file into an AI chat tool and ask it to identify the delimiter.",
            "Keep the file local, try other delimiter and encoding settings, and flag it if it still fails."
          ],
          "correct": 3,
          "explain": "Client files never leave the task, whatever an outside site promises, and a partial upload is still a leak. A file that defeats your tools is a flag, not an excuse."
        },
        {
          "prompt": "You imported ID columns as Text to protect leading zeros, finished cleaning, and exported to CSV. To check, you double-click the exported file and the zeros look gone again. What is true?",
          "options": [
            "The zeros are likely still in the file; check it in a plain text editor.",
            "The export dropped the Text setting; redo the delivery in XLSX format instead.",
            "The zeros were lost at export; reimport your working copy and export again.",
            "Spreadsheets cannot export leading zeros to CSV; flag the task as impossible."
          ],
          "correct": 0,
          "explain": "Double-clicking a CSV reruns the same guessing that stripped the zeros the first time. A text editor shows the file's real contents, which is what the client's system will read."
        },
        {
          "prompt": "The brief says remove all rows where Status is cancelled. Your filter shows 214 cancelled rows, and also 9 rows where Status is blank. What do you do with the 9 blank rows?",
          "options": [
            "Remove them; a blank status means the order never really existed.",
            "Leave them and say nothing; the brief only mentioned cancelled.",
            "Leave them in place and flag the 9 blank rows in your delivery note.",
            "Set the blanks to cancelled for consistency, then remove them with the rest."
          ],
          "correct": 2,
          "explain": "Blank is not cancelled, so removing them exceeds the brief, but staying silent hides a gap you noticed. Flagging lets the operator decide with full information."
        }
      ]
    }
  },
  "professional-habits": {
    "slug": "professional-habits",
    "title": "Professional habits & security",
    "track": "foundations",
    "tagline": "The habits that keep your record clean and your work trusted.",
    "summary": "Skill gets you your first task. Habits get you the next hundred. This course covers the six practices that keep a worker trusted and durable here: honest deadlines, clean files, strict confidentiality, a secure account, sustainable night work, and a record that compounds. Finish it and you will know exactly what builds trust on this platform, and what quietly destroys it.",
    "outcomes": [
      "You can judge before claiming whether a task truly fits the hours you have.",
      "You can deliver files with the exact name, version, and format the brief asks for.",
      "You can handle client files so nothing ever leaves the task.",
      "You can secure your account with a unique password kept strictly to one person.",
      "You can plan overnight work that protects your sleep and your error rate.",
      "You can build a record that compounds into steadier, better work."
    ],
    "lessons": [
      {
        "title": "Deadline honesty",
        "minutes": 3,
        "sections": [
          {
            "heading": "A claim is a promise",
            "body": "When you claim a task, you see the payout and the deadline before anything is locked in. Claiming means you are telling us, and the client behind us, that this work will be done on time. Nobody assigns tasks to you here. You choose. That choice is the whole promise, so make it with honest numbers, not hope. A task that pays well but that you cannot finish is not an opportunity. It is a missed deadline you have not had yet."
          },
          {
            "heading": "Do the math before you claim",
            "body": "Estimate the hours the task will actually take, then add a buffer for problems, because there are always problems. A file opens slower than expected. A brief takes two readings. Compare that total to the hours you genuinely have tonight, after dinner, after the baby, after everything real. If the task needs five hours and you have four, do not claim it. The pool refills. Another task will come that fits. The worst reason to claim a task is that the payout looks good, because the payout only exists if you deliver on time."
          },
          {
            "heading": "Release early, not late",
            "body": "Sometimes life breaks a good plan. The power goes out, a child gets sick, or the task turns out harder than the brief suggested. The moment you know you cannot finish on time, release the task. An early release puts it back in the pool while there is still time for someone else to do it, and the client never feels a thing. Releases are recorded on your record, and that is fair. But a release three hours before the deadline costs you far less than a delivery that never arrives. Late is the one thing we cannot fix for you."
          }
        ],
        "keyPoints": [
          "Claim only what you can finish with a buffer, not what pays best.",
          "Estimate hours honestly, then compare to the hours you really have tonight.",
          "The moment you know you will be late, release the task.",
          "An early release costs little; a blown deadline costs trust."
        ]
      },
      {
        "title": "File hygiene",
        "minutes": 3,
        "sections": [
          {
            "heading": "The name is part of the work",
            "body": "If the brief asks for a file named inventory_march.xlsx, deliver a file named exactly inventory_march.xlsx. Not final_v3.xlsx, not inventory_march_DONE.xlsx. The client's systems, or their own habits, may depend on that exact name. If the brief does not specify a name, choose one that explains itself: what the file is and which task it belongs to, in plain words. A stranger should be able to read the filename and know what is inside without opening it. A name like final_final_REAL2 tells the operator one thing only, which is that your process is chaotic."
          },
          {
            "heading": "One file, the right one",
            "body": "Keep as many working versions on your own computer as you like while the task is open. That is your kitchen. But deliver one file, the finished one, unless the brief asks for more. Uploading three versions and letting the operator pick is not thoroughness, it is passing your confusion to someone else. Before you upload, close the file and reopen it. Check that it opens cleanly, that it is the final version and not an older one, and that the name matches the brief. Delivering an old version is one of the most common and most avoidable rejections."
          },
          {
            "heading": "The format is the format",
            "body": "If the brief says CSV, deliver CSV. If it says PDF, deliver PDF. The requested format is a requirement, not a suggestion, because it has to fit into whatever the client does next. Sometimes the requested format loses something, for example a CSV cannot hold multiple sheets or formulas. Do not silently decide what to sacrifice. Deliver in the requested format and use your delivery note to say exactly what changed and why. If you genuinely cannot produce the format with free tools, say so in the note rather than substituting something else and hoping."
          }
        ],
        "keyPoints": [
          "Deliver the exact filename the brief asks for, character for character.",
          "One finished file, reopened and checked before you upload.",
          "The requested format is a requirement; flag anything the format loses in your note."
        ]
      },
      {
        "title": "Confidentiality is a hard rule",
        "minutes": 4,
        "sections": [
          {
            "heading": "Client files never leave the task",
            "body": "You download client files to do the work. That is the only journey those files ever make. Do not upload them to online converters, AI tools, translation sites, cloud drives, or anywhere else, unless the brief itself tells you to use a specific tool. Do not email them to yourself to work on another device. It does not matter that a site promises to delete uploads, or that the file looks harmless. A plain-looking spreadsheet can be someone's payroll, someone's patient list, someone's unreleased product. The client trusts us with it, and we trust you. That chain only works if it never grows extra links."
          },
          {
            "heading": "Nothing kept after delivery",
            "body": "When your delivery is approved, delete your local copies. All of them, including the working versions, the downloads folder, and the recycle bin. Keeping a copy just in case feels harmless, but there is no case. If a revision is requested, the files are still available on the task. A copy sitting on your laptop is a risk with no benefit: if your machine is lost, stolen, or infected, that client's data goes with it, under your name."
          },
          {
            "heading": "No samples, no stories",
            "body": "Client work is never portfolio material. No screenshots, not even blurred ones, and no before-and-after examples, no matter how proud of the work you are. You also do not describe the details to friends or post about an interesting task online. What you can show is yours: your certificates from this academy and your delivery record. Those prove your skill without spending someone else's trust. If you are ever unsure whether something counts as confidential, treat it as confidential. That default has never hurt anyone."
          }
        ],
        "keyPoints": [
          "Client files travel one way: from the task to your computer and back.",
          "No AI tools, converters, or cloud uploads unless the brief says so.",
          "Delete every local copy after approval, including the recycle bin.",
          "Client work is never portfolio material; your certificates and record are."
        ]
      },
      {
        "title": "Account security",
        "minutes": 3,
        "sections": [
          {
            "heading": "One person, one account",
            "body": "Your account is you. Never share the login with anyone: not a sibling who wants to try a task, not a friend covering your shift while you sleep. Your record shows every claim, delivery, and QC result under your name, and it only means something if every one of those was actually your work. If someone else works under your login, we can no longer trust the record, which means we can no longer trust the account. Sharing an account is one of the few mistakes here that working harder cannot repair."
          },
          {
            "heading": "A password that exists nowhere else",
            "body": "Use a password for this account that you use on no other site. Password leaks happen constantly across the internet, and attackers take leaked passwords and try them everywhere. If your password here also opens your email, or was used on some forum years ago, one stranger's breach becomes your problem, and your clients' problem, because your account can download task files. Your browser's built-in password manager is free and will generate and remember a strong password for you. And on any shared or public computer, do not stay signed in, ever."
          }
        ],
        "keyPoints": [
          "One person per account, no exceptions, not even family.",
          "Your password here should exist on no other site.",
          "A free browser password manager sets this up in minutes.",
          "Never stay signed in on a shared computer."
        ]
      },
      {
        "title": "Working nights without burning out",
        "minutes": 4,
        "sections": [
          {
            "heading": "Sleep is part of the job",
            "body": "Working nights means working against your own body, and your body usually wins. Sleep debt is not just tiredness, it is an error rate multiplier: a worker on four hours of sleep misreads briefs, transposes numbers, and skips checks they would normally never skip. Treat sleep like a shift. Give it fixed hours, protect those hours, darken the room, and tell the people you live with that daytime sleep is work. The math is simple: one extra task claimed on a wrecked night, followed by a QC rejection, earns less than the one task you did carefully after real sleep."
          },
          {
            "heading": "Batch similar tasks",
            "body": "Every time you switch between different kinds of work, you pay a startup cost: reloading the rules, the tools, the mindset. At night that cost is higher, because your reserves are lower. When you have a choice, claim and work tasks of the same kind together. Three data entry tasks in a row go faster and cleaner than data entry, then transcription, then data entry again. Batching is not about working more. It is about spending your limited night focus on the work instead of on the switching."
          },
          {
            "heading": "Take the break before the mistake",
            "body": "Fatigue announces itself before it costs you. You reread the same line twice. Typos appear where they never used to. You catch yourself about to skip a check because it feels fine. Those are not signs to push harder, they are the last exit before an error. Stand up, stretch, drink water, five minutes away from the screen roughly every ninety minutes. And if the quality is genuinely slipping while tasks are still open, release the ones you have not started. Delivering tired, sloppy work damages your record in a way an early release never will."
          }
        ],
        "keyPoints": [
          "Sleep debt multiplies errors; schedule sleep like a shift and protect it.",
          "Batch similar tasks to spend focus on work, not on switching.",
          "Rereading lines and rising typos are the signal to break now.",
          "Tired delivery hurts your record more than an early release ever will."
        ]
      },
      {
        "title": "The long game",
        "minutes": 3,
        "sections": [
          {
            "heading": "Your record is your resume",
            "body": "Everything you do here is written down: tasks delivered, deadlines met, QC results, releases. That record is the only thing that speaks for you, because clients never meet you and never will. This is not a threat, it is an opportunity. In most work, reputation depends on charm, luck, and who happened to notice you. Here it depends on things you fully control: claim honestly, deliver cleanly, flag what you are unsure of. A record built that way compounds. Reliable workers keep finding work, and the work gets better."
          },
          {
            "heading": "When in doubt, flag it",
            "body": "The single habit that protects a record best is flagging instead of guessing. If a source document is unreadable, say so in your delivery note instead of inventing a value. If a brief can be read two ways and you had to pick one, name the choice you made. A flagged uncertainty costs you nothing; the operator resolves it and the work moves on. A hidden guess that turns out wrong costs a rejection, and a pattern of hidden guesses costs the one thing you cannot buy back, which is trust. We would always rather read one honest sentence of doubt than find one confident error."
          },
          {
            "heading": "Boring reliability wins",
            "body": "The workers who build a real income here are rarely the fastest or the flashiest. They are the ones who deliver exactly what was asked, on time, every time, with clean files and honest notes, for months. Each habit in this course is small on its own. Renaming a file takes ten seconds. Releasing a task early takes one click and some humility. But stacked over a hundred tasks, those small habits become the difference between a worker we hesitate over and a worker we are glad to see in the pool. Be the second one. It pays better."
          }
        ],
        "keyPoints": [
          "Your record is the only thing clients and operators can judge you by.",
          "Flagging uncertainty is free; a hidden wrong guess is expensive.",
          "Small habits stacked over a hundred tasks become a reputation."
        ]
      }
    ],
    "exam": {
      "questions": [
        {
          "prompt": "You claimed a task due in six hours. Two hours in, a power outage hits your area and your laptop battery will last one more hour. The task needs at least three more hours of work. What do you do?",
          "options": [
            "Keep working on battery and hope the power comes back in time",
            "Release the task now so someone else can claim it with time to spare",
            "Wait until after the deadline, then explain the outage to the operator",
            "Rush a partial delivery in the hour you have left"
          ],
          "correct": 1,
          "explain": "You already know you cannot finish on time. An immediate release puts the task back in the pool while it can still be done; waiting or delivering fragments helps no one."
        },
        {
          "prompt": "A well-paying task appears in the pool. The deadline leaves four hours, and your honest estimate for the work is five. What do you do?",
          "options": [
            "Claim it and plan to work faster than usual",
            "Claim it and deliver an hour late with an apology in your note",
            "Claim it and skip your final quality check to save time",
            "Let it go and claim a task that fits the hours you actually have"
          ],
          "correct": 3,
          "explain": "A payout only exists if you deliver on time. Claiming a task your own estimate says you cannot finish is scheduling a missed deadline."
        },
        {
          "prompt": "The brief asks for a single file named exactly inventory_march.xlsx. Your finished working file is named final_v3_REAL.xlsx. What do you deliver?",
          "options": [
            "Rename your finished file to inventory_march.xlsx and deliver only that",
            "Deliver final_v3_REAL.xlsx, since the content is what matters",
            "Deliver both files so the operator can pick the right one",
            "Deliver inventory_march_v3.xlsx so your version history stays visible"
          ],
          "correct": 0,
          "explain": "The requested filename is part of the brief; the client's systems or habits may depend on it. One file, exactly the name asked for."
        },
        {
          "prompt": "The brief asks for a CSV delivery. Your finished spreadsheet has three sheets of work, and a CSV file can only hold one sheet. What do you do?",
          "options": [
            "Deliver the spreadsheet as xlsx, since it keeps all three sheets intact",
            "Deliver only the first sheet as CSV and leave it at that",
            "Export each sheet as its own CSV and explain the split in your delivery note",
            "Combine all three sheets into one and deliver a single CSV without comment"
          ],
          "correct": 2,
          "explain": "The requested format is a requirement. When the format forces a change, deliver in that format and flag exactly what you did in your note instead of deciding silently."
        },
        {
          "prompt": "Your task is proofreading a client's contract. A free online AI grammar tool would speed this up considerably. The brief says nothing about tools. What do you do?",
          "options": [
            "Paste the contract into the tool, then delete it from the site afterward",
            "Use the tool, since the brief does not forbid it",
            "Paste only short sections at a time to limit exposure",
            "Do the proofreading yourself; client files never leave the task"
          ],
          "correct": 3,
          "explain": "Uploading client files to any outside service is barred unless the brief explicitly says to. Silence in the brief means no, not yes."
        },
        {
          "prompt": "You just delivered a slide deck redesign you are proud of, and you want future proof of your skills. What is the right move?",
          "options": [
            "Delete your local copies; client work is never portfolio material",
            "Keep a blurred screenshot that hides the client's name",
            "Keep the file privately and never share it with anyone",
            "Save a version with the client's logo and data removed"
          ],
          "correct": 0,
          "explain": "No copies survive delivery and no samples ever come from client tasks, blurred or stripped. Your certificates and delivery record are the proof of skill you can show."
        },
        {
          "prompt": "A task asks you to turn a client's scanned PDF into editable text. A popular free converter website would do it in seconds. What do you do?",
          "options": [
            "Upload the PDF to the site, since conversion is exactly what the task asks for",
            "Do the conversion with tools on your own computer, or retype it yourself",
            "Upload only the pages that contain no names or numbers",
            "Use the site in a private browsing window so nothing is saved"
          ],
          "correct": 1,
          "explain": "The task asks for a conversion, not an upload. Client files stay on your machine; a converter website is a third-party service the brief never approved."
        },
        {
          "prompt": "Your cousin is waiting for her own account to be approved and asks to take a few small tasks on yours in the meantime. She is careful and you would check her work. What do you tell her?",
          "options": [
            "Yes, but only for small tasks you review before delivery",
            "Yes, if she works beside you so you can supervise everything",
            "No; one person per account, with no exceptions",
            "Yes, but you change your password as soon as her account is approved"
          ],
          "correct": 2,
          "explain": "Your record only means something if every delivery on it is your own work. Sharing an account breaks that permanently, no matter how careful the arrangement is."
        },
        {
          "prompt": "You use one strong password for your email, your bank, and your Second Shift account. Is that acceptable?",
          "options": [
            "Yes; one strong password is safer than several weak ones",
            "Yes, as long as you never write it down anywhere",
            "No; you should rotate that shared password every month instead",
            "No; each account needs its own password so one leak cannot open the others"
          ],
          "correct": 3,
          "explain": "Leaked passwords get tried everywhere. A breach on any site that shares your password would hand a stranger your payouts and your clients' files."
        },
        {
          "prompt": "You have slept about four hours a night for two weeks. Tonight the pool has three well-paying tasks you could technically claim. What do you do?",
          "options": [
            "Claim one task, finish it carefully, and protect your sleep",
            "Claim all three; a strong earning night is worth one more short sleep",
            "Claim two and rely on coffee to hold your focus",
            "Claim all three and accept slightly rougher quality this once"
          ],
          "correct": 0,
          "explain": "Sleep debt multiplies errors. On a wrecked schedule, one careful task earns more than three risky ones, because rejections cost money and mark your record."
        },
        {
          "prompt": "A data entry task includes a scanned receipt whose total is unreadable. It could be 80.00 or 30.00. What do you do?",
          "options": [
            "Enter 80.00, since it looks slightly more likely",
            "Skip that row quietly and deliver the rest",
            "Mark the value as unreadable and explain it in your delivery note",
            "Enter your best guess so the file arrives complete"
          ],
          "correct": 2,
          "explain": "A flagged uncertainty costs nothing; the operator resolves it. A wrong guess buried in a clean-looking file is far worse than an honest gap."
        },
        {
          "prompt": "You are about to upload your delivery, due in twenty minutes. You suddenly doubt one section, and verifying it properly would take an hour. What do you do?",
          "options": [
            "Deliver it as is and hope the section is right",
            "Deliver on time and use your note to flag exactly which section you could not verify",
            "Miss the deadline and deliver an hour late, fully verified",
            "Remove the doubtful section so nothing possibly wrong is delivered"
          ],
          "correct": 1,
          "explain": "On time with an honest flag beats late, and beats silent hope. The operator can check one named section far faster than they can recover a blown deadline."
        }
      ]
    }
  },
  "data-cleanup": {
    "slug": "data-cleanup",
    "title": "Data cleanup",
    "track": "category",
    "tagline": "The judgement behind clean data: what to merge, what to drop, what to flag.",
    "summary": "Data cleanup tasks are judged on one standard: every source row accounted for and the delivered file matching the requested shape. This course teaches the decisions above the mechanics — when differing rows are the same person, which record survives a merge, when to state an assumption instead of guessing, and how two overlapping exports become one defensible file. You finish able to deliver work an operator can verify in minutes.",
    "outcomes": [
      "You can decide whether two differing records are the same person, and defend the call.",
      "You can account for every source row as kept, merged, or dropped with a reason.",
      "You can choose a survivor record by a rule a stranger could reapply.",
      "You can state assumptions in your delivery note instead of guessing on ambiguous data.",
      "You can reconcile overlapping exports with a source-of-truth rule and visible conflict columns.",
      "You can write a change log the operator can audit in two minutes."
    ],
    "lessons": [
      {
        "title": "The accounting mindset",
        "minutes": 5,
        "sections": [
          {
            "heading": "One equation governs every task",
            "body": "Start every data cleanup task with one equation: kept plus merged plus dropped equals source. If the source file has 4,000 rows, your delivery must explain all 4,000. Some survive as they are. Some are merged into another row. Some are dropped, each with a stated reason. The moment those numbers stop adding up, you have lost rows you cannot explain, and no amount of neat formatting will cover for that. Before you touch anything, record the source row count. Before you deliver, check that your kept, merged, and dropped counts sum back to it exactly. This is not paperwork for its own sake. It is the difference between a delivery the operator can trust and one they have to re-check row by row."
          },
          {
            "heading": "The standard you are judged against",
            "body": "When a client disputes a data cleanup delivery, the operator judges it against one written standard: every row from the source is accounted for — kept, merged, or dropped with a stated reason — and the delivered file matches the requested format and column order. Minor formatting preferences are not grounds for a dispute. Read that twice. It tells you exactly where the risk sits. Row accounting and requested format are hard requirements. Whether you used title case or a slightly different date style, when the brief did not specify, is a preference, and preferences cannot sink your delivery. Your protection is built in the same order: account for everything, match what was requested, and state the choices the brief left open."
          },
          {
            "heading": "Where rows silently die",
            "body": "Rows rarely disappear because you decided to delete them. They disappear through side effects. A filter left on while you delete visible rows. A sort applied to one column instead of the whole table, which quietly scrambles rows instead of removing them but corrupts just as surely. A paste that overwrites a block you never checked. Copying to a new sheet and losing the last hundred rows to a lazy selection. The defense is the same in every case: know your row count at the start, check it after every destructive step, and investigate immediately when it moves in a way you did not intend. A three-row discrepancy found at 2 a.m. takes ten minutes to trace. Found by the operator, it costs you the delivery."
          },
          {
            "heading": "The data never leaves the task",
            "body": "The file you download is a client's customer list, supplier base, or inventory. It never leaves the task. Work on it in a local spreadsheet on your own machine. Do not paste it into online duplicate finders, format converters, or AI tools, no matter how much time that would save, unless the brief explicitly tells you to. A free web tool that cleans 4,000 contacts also now has 4,000 contacts. After your delivery is approved, delete every local copy, including working versions and exports. Do not keep samples for a portfolio. On this platform the client never knows who you are; the trade for that anonymity is that their data is handled as if it were radioactive."
          }
        ],
        "keyPoints": [
          "Kept plus merged plus dropped must equal the source row count, every task, no exceptions.",
          "Record the source row count before touching anything; verify the equation before delivering.",
          "Row accounting and requested format are hard requirements; minor formatting preferences are not.",
          "Client files stay local and in the task; no online tools or AI unless the brief says so."
        ]
      },
      {
        "title": "What counts as a duplicate",
        "minutes": 5,
        "sections": [
          {
            "heading": "Match people, not strings",
            "body": "A spreadsheet's duplicate finder matches identical text. Real duplicates are rarely identical. In a 4,000-contact CRM export you will meet maria.santos@acmecorp.com and msantos@acmecorp.com, both named Maria Santos, both at Acme Corp. The strings differ; the person is the same. That is one contact, and delivering her twice means the client emails her twice. Your job is to decide identity, not string equality. Compare across signals: name, company, email domain, phone, job title. Two or three independent signals agreeing is how you conclude two rows are one person. An exact email match is near-certain identity. A shared company plus a matching name is strong. Treat the built-in duplicate remover as a first pass that catches the easy cases, never as the whole job."
          },
          {
            "heading": "The false positive is worse",
            "body": "Merging two rows that are actually different people destroys a record the client paid to keep. Two rows named John Smith, one at a logistics firm in Cebu with a gmail address, one at a bank in Manila with a corporate address, are two people. A name alone is never identity; common names guarantee collisions in any list of a few thousand. Leaving a real duplicate in the file is a visible flaw the client can point at. Merging two distinct customers is an invisible one they discover months later, when a paying customer stopped receiving invoices. When your signals genuinely conflict, one matching and one contradicting, do not merge. Keep both rows, mark them in a flag column, and raise them in your delivery note."
          },
          {
            "heading": "Write the rule before you apply it",
            "body": "Before you merge anything, write down the rule you will use, in one or two lines. For example: rows are duplicates when emails match exactly, or when name and company both match after trimming spaces and ignoring case. Then apply that rule to the whole file, uniformly. A rule decided in advance keeps you honest when you are tired at row 3,100 and a borderline pair tempts you to wave it through. It also gives the operator something to audit: they can take your rule, test five of your merges, and confirm each one follows it. Judgement that cannot be written down is not judgement. It is mood, and mood does not survive QC."
          }
        ],
        "keyPoints": [
          "Duplicates are decided by identity signals agreeing, not by identical text.",
          "An exact email match is near-certain; a name alone is never enough.",
          "Merging two different people is worse than leaving a duplicate; flag borderline pairs instead.",
          "Write your matching rule down first, then apply it to the whole file uniformly."
        ]
      },
      {
        "title": "Choosing the survivor",
        "minutes": 4,
        "sections": [
          {
            "heading": "One record leaves the merge",
            "body": "When two rows are the same person, one row survives and carries the best of both. Picking the survivor is a decision with a rule behind it, not a coin flip. The usual candidates, in the order most clients would want: the row from the more authoritative source, the row more recently updated, then the more complete row with fewer blanks. Pick the ordering that fits the task, and use the same ordering for every merge in the file. If the brief names a preference, that overrides everything. What you may not do is choose row by row on feel, keeping whichever happened to look nicer. Two hundred merges made by feel produce a file nobody can verify, including you."
          },
          {
            "heading": "Merging fields without losing data",
            "body": "The survivor keeps its values, then takes from the losing row anything it lacks. A blank phone on the survivor gets filled from the loser. That direction is safe: you are adding information, not choosing between versions. The dangerous case is two non-blank values that disagree, one row saying one phone number, the other saying another. Your survivor ordering usually settles it, since the more recent or more authoritative value wins. When it does not, when neither value has better evidence, do not silently discard one. Keep the chosen value in the main column and the other in a conflict column the client can review. Losing a duplicate row should never mean losing data. That is the entire point of merging instead of deleting."
          },
          {
            "heading": "Defend the rule in writing",
            "body": "Your change log states the survivor rule in one line, the same way it states the matching rule. Something like: survivor is the row from the March export; ties broken by most recent activity date; blanks filled from the dropped row. Written this way, the operator can pull any merged pair from your log, apply the rule, and land on your result. That is what defensible means: reproducible by a stranger. It also protects you when a client questions a merge, because the operator can show the merge followed a stated rule rather than a guess. If you find yourself unable to state the rule you used, stop and find out what you were actually doing, because QC will ask the same question."
          }
        ],
        "keyPoints": [
          "Pick one survivor rule — source authority, recency, completeness — and apply it to every merge.",
          "Fill survivor blanks from the dropped row; merging must never lose data.",
          "Conflicting non-blank values with no better evidence go in a conflict column, not the trash.",
          "A defensible rule is one a stranger can reapply and reach your result."
        ]
      },
      {
        "title": "Normalization without guessing",
        "minutes": 5,
        "sections": [
          {
            "heading": "The decisions hiding in clean-up",
            "body": "A brief that says normalize supplier addresses to a single format contains a dozen unstated decisions. Which format. What casing. Whether phone numbers keep country codes. How to write dates. Whether unit numbers come before or after street names. Every one of those is a choice you will make 4,000 times, so make each one once, deliberately, and write it down. The habit to build: before editing, scan the column and list the variants you see. Ten minutes of listing tells you exactly which decisions the task requires and which values will not fit any rule. Workers who skip this discover the hard cases at row 2,800, with half the file already normalized to a convention that cannot handle them."
          },
          {
            "heading": "State assumptions instead of guessing",
            "body": "You cannot message the client, and you do not need to. The delivery note to the operator is where open choices get closed. The test is reversibility. If a wrong choice is cheap to reverse, choose sensibly, apply it consistently, and state it: addresses were formatted as street, city, province, postal code; phones as +63 917 555 0143. A client who wanted something else requests a cheap revision. But when a wrong choice corrupts meaning, do not choose at all. The classic is 03/04/2025: March 4th in one convention, April 3rd in another, and once converted, the error is invisible. Leave genuinely ambiguous values unconverted, mark them in a flag column, and say exactly that in the note."
          },
          {
            "heading": "Respect country conventions",
            "body": "A single format does not mean forcing every country's data into one country's habits. German addresses put the house number after the street name. Philippine addresses often carry a barangay that has no US equivalent. Many countries write postal codes before the city. Flattening these into a US template does not normalize the data; it breaks it for anyone who needs to mail something. Normalize the structure, meaning the same columns in the same order with consistent casing and separators, while letting each address stay correct for its own country. If the brief truly wants one country's convention forced onto all rows, it will say so. When it does not say, structural consistency plus local correctness is the assumption to state."
          }
        ],
        "keyPoints": [
          "List the variants in a column before editing; the hard cases surface early.",
          "Reversible choices: pick one, apply consistently, state it in the delivery note.",
          "Irreversible ambiguity, like 03/04 dates, gets flagged and left unconverted, never guessed.",
          "Normalize structure across countries; keep each address correct for its own country."
        ]
      },
      {
        "title": "Reconciling two overlapping exports",
        "minutes": 5,
        "sections": [
          {
            "heading": "Decide the source of truth",
            "body": "Two exports of the same customers will disagree, and reconciliation means deciding which one to believe. Look for evidence before you look at rows. Which system do people actually work in: a billing system updated with every invoice usually beats a CRM nobody has touched since 2023. Which export is newer. Which has more complete, more consistent fields. Sometimes the brief settles it by naming a primary file. When the evidence points one way, declare that file the source of truth, take its value wherever the two disagree, and state the choice in your change log. When the evidence is genuinely balanced, say so in your delivery note and let the conflict columns carry the disagreements instead of your guesses."
          },
          {
            "heading": "Conflict columns carry the disagreements",
            "body": "For each field that can disagree, the merged file carries the chosen value in the main column and, when the sources differed, the other value in a conflict column beside it, such as phone_conflict. Empty means the sources agreed. Filled means the client has a decision to make, with both candidates preserved. This is what honest reconciliation looks like in a deliverable: your source-of-truth rule resolved most rows, and the rows it could not resolve are visible instead of quietly settled. A file with a modest number of flagged conflicts reads as careful work. A file with zero conflicts out of two disagreeing systems reads as a worker who guessed 4,000 times and showed nothing."
          },
          {
            "heading": "Every row from both files",
            "body": "The accounting equation now covers two sources. Every row from file A and every row from file B must land somewhere: matched and merged, present only in A and kept, present only in B and kept, or dropped with a stated reason. Unmatched rows are the trap. Twenty-five customers who appear only in the older export might be churned accounts, or a region the newer system has not imported yet. You cannot know, so you do not decide. Keep them, mark the origin in a source column, flag them, and count them in your delivery note. Dropping unmatched rows because they are inconvenient is precisely the silent data loss the dispute standard exists to catch."
          }
        ],
        "keyPoints": [
          "Choose the source of truth on evidence: system role, recency, completeness.",
          "Disagreements the rule cannot settle stay visible in conflict columns, both values preserved.",
          "Zero conflicts from two disagreeing systems signals guessing, not quality.",
          "Unmatched rows are kept and flagged with their origin, never silently dropped."
        ]
      },
      {
        "title": "The two-minute change log",
        "minutes": 5,
        "sections": [
          {
            "heading": "What the operator needs to see",
            "body": "The operator reviews your delivery before the client sees it, often between a dozen other reviews. Your change log has to answer three questions in about two minutes. Do the numbers reconcile: source count, kept, merged, dropped, and the equation balancing. What rules were applied: matching rule, survivor rule, normalization conventions, source of truth, each in one line. Where did the removed rows go: a list of dropped and merged-away rows the operator can spot-check. If finding any of those takes scrolling through prose or opening five tabs, the log has failed even if the work was perfect. Slow-to-verify work gets extra scrutiny, and extra scrutiny finds problems. Fast-to-verify work builds the record that gets you the better-paying tasks."
          },
          {
            "heading": "A shape that works",
            "body": "Summary first, detail behind it. On the first tab or at the top: source 4,000; kept 3,712; merged away 214; dropped 74, of which 61 exact duplicates and 13 marked closed in both systems; equation checked. Then the one-line rules. On a second tab, the row-level detail: each dropped row with its reason, each merged pair with survivor and loser identified. The client receives the clean file in exactly the requested format and column order; the log rides alongside it, matching whatever the brief asked for. Resist the two failure modes. A vague note saying cleaned and deduplicated verifies nothing. A raw dump of every edit with no summary buries the three answers the operator came for."
          },
          {
            "heading": "The delivery note closes the loop",
            "body": "The note you attach at upload is short and carries exactly three things. Assumptions: the conventions you chose where the brief was silent. Flags: ambiguous dates left unconverted, borderline duplicate pairs kept, unmatched rows, conflicts awaiting a decision, each with a count. Anything broken: a corrupt source file, a column that did not match the brief's description. Everything else lives in the change log. A worker who flags eleven ambiguous rows looks better on the record than one who delivers a spotless-looking file hiding eleven guesses, because the guesses surface eventually and the flags never have to. When your accounting balances, your rules are stated, and your uncertainty is flagged, a QC rejection has almost nowhere left to come from."
          }
        ],
        "keyPoints": [
          "The log answers three questions fast: numbers reconcile, rules applied, where removed rows went.",
          "Summary counts and one-line rules first; row-level detail on a second tab.",
          "The delivery note carries assumptions, flags with counts, and anything broken. Nothing else.",
          "Flagged uncertainty beats hidden guesses on your record, every time."
        ]
      }
    ],
    "exam": {
      "questions": [
        {
          "prompt": "You are deduplicating a 4,000-contact CRM export. Two rows: Maria Santos, maria.santos@acmecorp.com, and Maria Santos, msantos@acmecorp.com, both listed at Acme Corp with the same job title. The brief says remove duplicate contacts. What do you do?",
          "options": [
            "Keep both rows, because the email addresses are different strings and therefore not true duplicates.",
            "Delete whichever row appears second in the file so the count drops cleanly.",
            "Treat them as one person, merge under your survivor rule, and record the pair in your change log.",
            "Move both rows to a separate tab and let the operator decide every duplicate pair."
          ],
          "correct": 2,
          "explain": "Name, company, and title agree and the emails share a domain and pattern. Multiple independent signals establish identity; identical strings are not required."
        },
        {
          "prompt": "The source file had 4,000 rows. Before delivering, you total your work: 3,742 kept, 181 merged away, 74 dropped. That sums to 3,997. Three rows are unaccounted for. The deadline is close. What do you do?",
          "options": [
            "Trace the three rows before delivering, even if it costs time; the equation must balance exactly.",
            "Deliver and mention a minor three-row discrepancy in your delivery note for the operator to review.",
            "Deliver as is; three rows out of 4,000 is within any reasonable tolerance.",
            "Adjust the dropped count to 77 so the totals reconcile on paper."
          ],
          "correct": 0,
          "explain": "Kept plus merged plus dropped must equal the source with no tolerance. A discrepancy is your own error to fix, not an ambiguity to flag."
        },
        {
          "prompt": "The brief says normalize supplier addresses to a single format but never specifies the format. The addresses span the Philippines, the US, and Germany. What do you do?",
          "options": [
            "Release the claim; the brief is missing information you need.",
            "Normalize everything to the US convention, since most clients are American.",
            "Leave the addresses untouched and ask about the format in your delivery note.",
            "Standardize columns, order, and casing, keep each address correct for its country, and state that assumption in your delivery note."
          ],
          "correct": 3,
          "explain": "Format choice here is reversible, so you choose sensibly, apply it consistently, and state it. Forcing one country's habits corrupts foreign addresses; doing nothing delivers the task incomplete."
        },
        {
          "prompt": "You are reconciling two customer exports. A customer's phone differs between them. Export A comes from the billing system, updated with every invoice. Export B comes from a CRM last modified two years ago. The brief names no primary file. What do you do?",
          "options": [
            "Keep both rows in the delivery so the client can pick the right phone.",
            "Take the billing system's value, apply that source-of-truth rule to every conflict, and state it in your change log.",
            "Leave the phone blank, since you cannot be certain either value is correct.",
            "Compare each conflicting customer individually and keep whichever phone looks more plausible."
          ],
          "correct": 1,
          "explain": "The evidence clearly favors the actively maintained system. Declare it the source of truth, apply the rule uniformly, and document it so the operator can verify."
        },
        {
          "prompt": "Same reconciliation. For 30 customers, the two exports show different email addresses, and nothing — no dates, no completeness difference, no system evidence — favors either file. What do you do with those 30?",
          "options": [
            "Pick the email from the file with more total rows and move on.",
            "Drop those 30 customers; unresolvable records should not reach the client.",
            "Keep one value per your stated rule, put the other in a conflict column, and flag the 30 in your delivery note.",
            "Email both addresses to check which bounces, then keep the working one."
          ],
          "correct": 2,
          "explain": "When evidence settles nothing, preserve both values and make the conflict visible. Guessing hides the decision; dropping the rows loses paying customers."
        },
        {
          "prompt": "Three hours into an inventory SKU task, you realize a find-and-replace early on overwrote part of the original SKU column, and your working file is the only copy you have. What do you do?",
          "options": [
            "Download the source file again from the claimed task and rebuild the damaged column from it.",
            "Reconstruct the overwritten SKUs from memory and the surrounding rows as accurately as you can.",
            "Deliver the file and note that some SKUs may differ slightly from the source.",
            "Release the claim, since the source data is damaged beyond recovery."
          ],
          "correct": 0,
          "explain": "The original files stay attached to the claimed task; you can always re-download a clean copy. Reconstructing from memory replaces client data with guesses."
        },
        {
          "prompt": "A 4,000-contact deduplication is going slowly in your spreadsheet. A free website promises one-click duplicate removal if you paste in the contact list. The brief says nothing about tools. What do you do?",
          "options": [
            "Paste only the email column; a single column is not really the client's data.",
            "Use the website, then clear its input box and delete your browser history afterward.",
            "Use the website but ask the operator for permission in your delivery note afterward.",
            "Keep working locally with spreadsheet functions; client data does not leave the task unless the brief says so."
          ],
          "correct": 3,
          "explain": "Uploading client data to any third-party service is a confidentiality breach unless the brief explicitly allows it. One column of 4,000 emails is still client data."
        },
        {
          "prompt": "The brief says product SKUs must match the pattern ABC-1234. You fix 310 that clearly map to it. Fifteen more, like 78-B, could map to several valid SKUs and nothing in the sheet settles which. What do you do with the fifteen?",
          "options": [
            "Choose the most likely mapping for each so the delivery arrives fully fixed.",
            "Leave the fifteen unchanged, mark them in a flag column, and list them with a count in your delivery note.",
            "Drop the fifteen rows with dropped reason unfixable so the accounting still balances.",
            "Deliver the file with all SKUs untouched, since the pattern cannot be applied to every row."
          ],
          "correct": 1,
          "explain": "An invented SKU is invisible corruption in an inventory system. Flagged uncertainty is always better than a guess, and flagged rows still count as kept."
        },
        {
          "prompt": "Which change log best survives the operator's two-minute audit on a deduplication task?",
          "options": [
            "A paragraph describing the steps you took through the night, in order.",
            "One line: removed duplicates and cleaned formatting per the brief.",
            "Summary counts proving the equation balances, one-line rules, and a second tab listing every merged and dropped row.",
            "A full export of all 4,000 rows with every edited cell highlighted for review."
          ],
          "correct": 2,
          "explain": "The operator needs three answers fast: numbers reconcile, rules applied, where removed rows went. Prose hides the numbers; a raw highlighted dump buries them."
        },
        {
          "prompt": "The brief requests a CSV with columns ordered name, email, company, phone. You believe company reads better before email, and a spreadsheet file would preserve your formatting. How do you deliver?",
          "options": [
            "A CSV with the columns exactly in the requested order, nothing changed.",
            "Your improved column order, with a delivery note explaining why it is clearer.",
            "Both versions, letting the operator forward whichever the client prefers.",
            "A spreadsheet file in the requested column order, since it holds formatting the CSV loses."
          ],
          "correct": 0,
          "explain": "Matching the requested format and column order is half the dispute standard. The requested shape usually feeds another system, where a clearer order simply breaks the import."
        },
        {
          "prompt": "The brief never specified phone formatting. You chose +63 917 555 0143, applied it to every row, and stated the assumption in your delivery note. QC returns a revision: the client wants hyphens instead. What is true?",
          "options": [
            "This should count as a rejection on your record, because your guess was wrong.",
            "You can decline the revision, since minor formatting preferences are not grounds for a dispute.",
            "You should have left phone numbers untouched whenever the brief is silent.",
            "It is a preference revision, not a dispute; you reformat and redeliver, and your stated assumption protected your record."
          ],
          "correct": 3,
          "explain": "The standard shields you from disputes over preferences, not from doing reasonable revisions. A stated, consistent assumption is correct work; the revision is a cheap format swap."
        },
        {
          "prompt": "Reconciling two exports, you finish matching at 4 a.m. Twenty-five rows from the older export match nothing in the newer one, and you cannot tell if they are churned customers or missing imports. The payout releases once QC approves. What do you do?",
          "options": [
            "Drop the twenty-five with reason unmatched; under one percent will not matter.",
            "Keep them, mark their origin in a source column, and report the count and the open question in your delivery note.",
            "Merge each into its closest near-match in the newer export so every row pairs up.",
            "Deliver only the matched rows now and mention the leftovers if the operator asks."
          ],
          "correct": 1,
          "explain": "You cannot know what the unmatched rows are, so you do not decide. Kept and flagged keeps the accounting honest; every other option silently loses or corrupts data."
        }
      ]
    }
  },
  "data-entry": {
    "slug": "data-entry",
    "title": "Data entry & transcription",
    "track": "category",
    "tagline": "Source is truth, template is contract, and a flag always beats a guess.",
    "summary": "Data entry and transcription pay for one skill above all: moving information without changing it. This course teaches the judgement layer above the method: what normal accuracy means on messy sources, when to flag instead of guess, how to read a brief for verbatim versus clean-read, and how to check your own work before QC does. You finish able to deliver work the operator can defend and your record can build on.",
    "outcomes": [
      "You can deliver keying and transcription that meets the standard operators judge against.",
      "You can apply the illegible and inaudible flag protocols instead of guessing.",
      "You can tell verbatim from clean-read and choose correctly from the brief's purpose.",
      "You can run a 10 percent self-check that catches error patterns before QC.",
      "You can protect your payout and record by engineering speed instead of hurrying."
    ],
    "lessons": [
      {
        "title": "Source Is Truth, Template Is Contract",
        "minutes": 4,
        "sections": [
          {
            "heading": "Two things you answer to",
            "body": "In data entry and transcription, every delivery answers to two masters. The source decides what the content is. The template decides what the content looks like. A perfect delivery reproduces the source exactly, arranged exactly the way the template asks. Notice what is missing from that sentence: your opinion. You are not hired to improve the source, tidy its grammar, or fix what looks like a mistake. You are hired to move information from one place to another without changing it. That sounds simple. Most disputes in this category come from workers who quietly broke it."
          },
          {
            "heading": "Never correct the source",
            "body": "A supplier invoice says 1,200 pesos where the line items clearly add to 1,100. An intake form spells a name two different ways on the same page. An interview subject states the wrong year for a well-known event. Your instinct is to fix it. Do not. Key what the source says. You do not know the context: the invoice may be under audit, the misspelling may be the legal spelling, the wrong year may be exactly what the client is studying. If an error seems worth knowing about, mention it in your delivery note to the operator and key it as written. Silently correcting the source changes the data, and changed data is a dispute."
          },
          {
            "heading": "The template is not a suggestion",
            "body": "The template is the client's system speaking to you. Date formats, column order, units, codes, how empty fields are marked: each choice usually exists because software downstream will read your file. If the template writes dates as 2026-03-14 and you key 14/03/2026, every date may import as garbage even though a human reads it fine. Follow the template exactly, including the parts that seem arbitrary. When the source contains something the template has no place for, do not invent a column or a format to hold it. Key what fits, and describe the leftover in your delivery note so the operator can decide what the client wants done with it."
          }
        ],
        "keyPoints": [
          "The source decides content, the template decides form, and your opinion decides nothing.",
          "Key source errors as written and mention them in your delivery note.",
          "Template formats often feed software; follow them exactly, even the arbitrary parts.",
          "Never invent columns or formats; describe leftovers in your delivery note."
        ]
      },
      {
        "title": "What Normal Accuracy Actually Means",
        "minutes": 4,
        "sections": [
          {
            "heading": "The sentence you are judged against",
            "body": "Every delivery in this category is judged against one sentence. Keyed or transcribed content matches the source at normal accuracy for the stated language and source quality, and follows the requested template or timestamp scheme. Illegible or inaudible source material must be flagged, never guessed — a guessed value is a dispute ground, a flagged one is not. Read it twice. It contains three tests: does the content match the source, does the layout match the template, and did you flag what you could not read or hear. Meet all three and a delivery is defensible even when the client is difficult. Miss any one and the operator has grounds to reject."
          },
          {
            "heading": "Accuracy scales with source quality",
            "body": "Normal accuracy is not one fixed number. It means the accuracy a careful worker reaches on that source. On clean typed PDFs, near-perfect is normal, and a scatter of typos is a QC problem. On 120 handwritten intake forms, some letters are genuinely ambiguous, and normal means you got the readable parts right and flagged the rest. On muffled interview audio with crosstalk, normal means the clear speech is faithful and the buried words are marked, not imagined. The standard rises and falls with the source, but one part never moves: whatever you did key must match what you keyed it from. Bad handwriting excuses a flag. It never excuses a guess."
          },
          {
            "heading": "The stated language sets the scope",
            "body": "Accuracy is judged for the language the brief states. If the brief says English audio and a speaker switches into another language for a sentence, you are not expected to transcribe it. Mark it, for example [non-English 00:22:10], and move on unless the brief says otherwise. The same logic covers heavy accents and technical vocabulary: you are expected to handle normal difficulty, not to be a universal expert. When a specialized term is unclear, you may check its spelling in a free reference, but never paste client text or audio into outside tools to decode it. Client files never leave the task. If the term still will not resolve, flag it rather than presenting a guess with a straight face."
          }
        ],
        "keyPoints": [
          "Three tests: match the source, match the template, flag what you could not read or hear.",
          "Normal accuracy rises and falls with source quality; the duty to flag never moves.",
          "Mark other-language passages instead of translating or guessing.",
          "Check spellings in free references, but never paste client material into outside tools."
        ]
      },
      {
        "title": "Flag, Never Guess",
        "minutes": 5,
        "sections": [
          {
            "heading": "Why flags win and guesses lose",
            "body": "A flag tells the operator exactly where the source failed and lets the client decide what to do. A guess hides the failure inside data that now looks trustworthy. Downstream, someone pays an invoice, calls a number, or quotes a figure that you invented. That is why the standard is written the way it is: a guessed value is a dispute ground, a flagged one is not. The math is entirely on your side. A flag costs you nothing on a fair review. One confident guess that turns out wrong can cost the whole delivery, and QC rejections sit on your record. Here, honesty is not just ethics. It is the profitable strategy."
          },
          {
            "heading": "The illegible protocol",
            "body": "For keying work, when a value cannot be read with confidence, enter [illegible] in that field, exactly like that, unless the brief gives its own marker. If part of a value is readable, keep what you can read: 09[illegible]7 tells the client more than a blank. Do not leave the field empty, because an empty field says the source was empty, which is different information. When you can read a value only at maybe-probably confidence, treat that as illegible too. The line is confidence, not effort. Zoom in, adjust contrast in a free viewer, compare the same handwriting elsewhere on the page, and if you are still not sure, flag it."
          },
          {
            "heading": "The inaudible protocol",
            "body": "For audio, mark what you cannot hear with a timestamp: [inaudible 00:14:32]. The timestamp lets anyone with the file jump straight to the spot and try again with better speakers. Use the same shape for overlapping speech, for example [crosstalk 00:41:07], and for words you hear but cannot confidently identify. Before flagging, do what a careful listener does: replay the passage, slow the playback in a free player, and wear headphones. If a stretch is so bad that flags would outnumber words, that is no longer a transcription problem but a source problem. Transcribe what is real, flag the rest honestly, and make the file's condition unmissable in your delivery note so the operator can take it up with the client."
          },
          {
            "heading": "Flags belong in the note too",
            "body": "Flags inside the file do their job at the point of use. Your delivery note to the operator does a different job: it gives the count and the cause. Something like: 4 of 120 forms had illegible phone fields, all from the same scanner batch, marked [illegible] in place. Now the operator can explain the delivery to the client instead of discovering surprises during QC. A delivery with honest flags and a clear note reads as careful work. The same delivery with silent gaps reads as sloppy work, even when the underlying accuracy is identical. When the volume of flags feels unusual, say so plainly rather than hoping nobody counts."
          }
        ],
        "keyPoints": [
          "A flag costs nothing on fair review; a wrong guess can cost the delivery.",
          "Use [illegible] in place, keeping any characters you can actually read.",
          "Use [inaudible 00:14:32] so anyone can jump to the spot and recheck.",
          "Count and explain your flags in the delivery note."
        ]
      },
      {
        "title": "Verbatim, Clean-Read, Timestamps, and Speakers",
        "minutes": 5,
        "sections": [
          {
            "heading": "Verbatim or clean-read",
            "body": "Verbatim transcription captures speech exactly as spoken: false starts, repeated words, fillers like um and ah, self-corrections. Clean-read removes those stumbles and delivers what the speaker meant to say, in their own words, without changing meaning. These are different products. Legal and research clients often need verbatim because how something was said is evidence. Business clients usually want clean-read because they need the content, not the stutters. Delivering the wrong one is a revision at best. Neither style ever licenses you to paraphrase: clean-read cuts fillers, it does not rewrite sentences. If you find yourself summarizing what a speaker said, you have left transcription and entered fiction."
          },
          {
            "heading": "Reading the brief for the style",
            "body": "Some briefs say verbatim or clean-read outright. When they do not, read for purpose. Words like exact, word-for-word, legal, compliance, and research coding point to verbatim. Words like readable, notes, summary sheet, and internal use point to clean-read. A tagging sheet that codes interview answers usually wants clean, faithful sentences a tagger can process quickly. If the brief truly gives no signal, deliver the style the purpose points to and state your assumption plainly in the delivery note. An assumption declared up front costs at most one revision. An assumption hidden inside eight hours of audio costs the operator's trust along with the redo."
          },
          {
            "heading": "Timestamp schemes",
            "body": "A timestamp scheme tells you when to write the time into the transcript. Common schemes: a stamp at every speaker change, a stamp at fixed intervals such as every 30 or 60 seconds, or stamps only on flagged moments. The brief or the template decides which; the tagging sheet for 8 hours of interview audio may simply have a start-time column per row. Follow the requested scheme exactly, in the format shown, usually HH:MM:SS. Consistency is the whole point: a client scanning for minute 47 relies on your stamps being where the scheme promised. And every inaudible flag carries its own timestamp regardless of scheme, because that stamp is what makes the flag checkable."
          },
          {
            "heading": "Speaker labels",
            "body": "Label speakers the way the brief asks. If it names them, use the names given, spelled the way the brief spells them. If not, use consistent neutral labels such as Speaker 1 and Speaker 2, assigned in order of first appearance, and never switch mid-file. When you cannot tell voices apart, that is an honesty problem like any other: use your best consistent assignment, mark the doubtful turns, for example [Speaker 1 or 2], and mention the stretch in your delivery note. Guessing silently corrupts every line attributed to the wrong person. Wrong attribution reads as fluent and confident, which is exactly what makes it dangerous."
          }
        ],
        "keyPoints": [
          "Verbatim keeps every stumble; clean-read cuts fillers but never rewrites sentences.",
          "Legal, compliance, and coding signals point verbatim; readability signals point clean-read.",
          "Follow the requested timestamp scheme exactly; flags always carry their own stamp.",
          "Keep speaker labels consistent all file long and mark uncertain attributions."
        ]
      },
      {
        "title": "Check Your Work Before QC Does",
        "minutes": 4,
        "sections": [
          {
            "heading": "The 10 percent recheck",
            "body": "Before you deliver, recheck a sample of your own work against the source: about 10 percent, chosen to be representative. For 40 invoices, that is 4 full invoices re-read field by field against the PDFs. For 120 forms, 12 forms. For 8 hours of audio, pick scattered passages totaling roughly 45 minutes and listen while reading your transcript. Do not sample only the beginning; your early work was your freshest and your late work was your most tired, so include the end. If the sample is clean, deliver. If you find errors, do not just fix the ones you found; treat them as evidence of a pattern and widen the check."
          },
          {
            "heading": "Errors come in patterns",
            "body": "Keying errors are rarely random. Transposed digits, the same misread letter every time one clerk's handwriting appears, a column shifted by one on every form after a break, a date format that drifted halfway through. When your sample catches an error, ask what kind it is. A one-off typo means fix it and move on. A systematic error means every row produced under the same conditions is suspect, and you check them all. This is why the sample is cheap insurance: an hour of self-checking can catch a pattern that would otherwise fail the whole delivery at QC. The operator samples your work the same way. Find the pattern before they do."
          },
          {
            "heading": "A final pass on form",
            "body": "Content accuracy is only part of the standard. Before delivering, make one pass purely on form: columns in the template's order, dates and numbers in the template's format, empty fields marked the template's way, flags written in the agreed markers, the file named and saved as the brief requires. Then confirm your delivery note covers what QC will meet: how many flags, where, why, and any assumption you made. This pass takes minutes because you are reading shape, not content. It catches the failures that feel smallest and read worst, because a template mistake repeats on every row you delivered."
          }
        ],
        "keyPoints": [
          "Recheck about 10 percent of your work against the source before delivering.",
          "Sample your late work too; fatigue writes errors near the end.",
          "One repeated error means a pattern; widen the check to everything produced under those conditions.",
          "Finish with a form-only pass: template, formats, file naming, flags, note."
        ]
      },
      {
        "title": "Fixed Payouts and the Speed Trap",
        "minutes": 4,
        "sections": [
          {
            "heading": "Run the numbers on rushing",
            "body": "The payout is fixed and shown before you claim, so every hour you save raises your effective rate. That fact tempts every worker toward speed, and speed is fine right up until it costs accuracy. Run the numbers on rushing. Skipping the recheck on a 4-hour keying task saves maybe 25 minutes. If QC then finds a pattern error, the revision costs an hour or more of unpaid work, and the rejection is recorded. If the delivery is rejected outright, the whole 4 hours earned nothing. The minute you save by not verifying a doubtful field is the most expensive minute in this category. Sustainable speed comes from method, never from skipped checks."
          },
          {
            "heading": "Where real speed comes from",
            "body": "Fast careful workers are not braver, they are better organized. They set up the template and source side by side so their eyes travel a short, fixed path. They learn their spreadsheet's keyboard shortcuts so their hands never leave the keys. They batch similar work, keying the same field down all 40 invoices instead of jumping around, because repeating one pattern is faster and more accurate than switching. They take short breaks before fatigue starts writing errors for them. Each of these compounds across a task, and none of them trades accuracy away. That is the difference between speed and hurry. Speed is engineered. Hurry is just borrowing time from QC."
          },
          {
            "heading": "Claim what you can deliver",
            "body": "The payout screen before you claim is also an accuracy decision. Read the task honestly against your own speed. If 8 hours of interview audio takes a first-time transcriber 24 hours of work, the payout might be fair for someone experienced and poor for you today, and the pressure of a bad claim is exactly what produces guessing. Claim releases and QC rejections are both recorded, so the cheapest moment to protect your record is before you claim. Build your rate on tasks you can do at the standard, let the standard raise your speed, and the harder, better-paying work follows. A record of clean deliveries is the asset."
          }
        ],
        "keyPoints": [
          "An error found at QC costs more than the minutes that rushing saved.",
          "Real speed comes from setup, shortcuts, and batching, never from skipped checks.",
          "Releases and rejections are recorded; the cheapest protection happens before you claim."
        ]
      }
    ],
    "exam": {
      "questions": [
        {
          "prompt": "The brief says key 40 supplier invoices into the client template. On invoice 17, the line items add to 1,100 but the printed total says 1,200. What do you enter in the total field?",
          "options": [
            "1,100, because the arithmetic proves the printed total is a typo.",
            "1,200 as printed, with a mention of the mismatch in your delivery note.",
            "Both values, so the client can choose the right one.",
            "Nothing; skip the invoice and report that it contained an error."
          ],
          "correct": 1,
          "explain": "The source is truth even when it looks wrong. You key what it says and surface the anomaly in your note instead of silently changing data."
        },
        {
          "prompt": "You are keying 120 handwritten intake forms. On one form, the middle digits of a phone number stay unreadable after zooming and adjusting contrast. The first and last digits are clear. What goes in the field?",
          "options": [
            "Leave it blank so no wrong data enters the system.",
            "Your best reading of the digits; phone numbers are easy to verify later.",
            "The readable digits, with [illegible] replacing the unreadable ones.",
            "[illegible] alone, since a partial phone number is useless."
          ],
          "correct": 2,
          "explain": "Partial data plus a flag preserves everything real. A blank falsely says the field was empty, and a guessed digit is a dispute ground."
        },
        {
          "prompt": "You are 90 percent sure a handwritten surname reads Reyes, but it could be Ramos. Comparing the writer's letters elsewhere on the form does not settle it. The task is otherwise finished. What do you do?",
          "options": [
            "Key Reyes; 90 percent confidence is above normal accuracy for handwriting.",
            "Key Reyes, and list the form in your delivery note as a possible error.",
            "Release the claim, since this form cannot be completed to the standard.",
            "Mark the name as uncertain in the flag format and explain it in your delivery note."
          ],
          "correct": 3,
          "explain": "Maybe-probably confidence is below the line. A flagged value is defensible; a keyed guess is a dispute ground even when a note mentions it."
        },
        {
          "prompt": "At 00:14:32 in interview audio, two people talk over each other for several seconds. After replays with headphones and slowed playback you catch only fragments. The brief asks for a full transcript. What do you write there?",
          "options": [
            "[crosstalk 00:14:32], keeping any words around it that you heard clearly.",
            "Your best reconstruction of both speakers, built from the fragments.",
            "The fragments run together as one sentence, with no marker.",
            "Nothing; resume at the next clear speech so the transcript stays readable."
          ],
          "correct": 0,
          "explain": "Unresolvable overlap gets a timestamped flag so anyone can recheck that exact moment. Reconstruction is guessing, and a silent skip hides the gap."
        },
        {
          "prompt": "A brief reads: transcribe these customer interviews for our research team, we will code the answers word by word for a compliance study. It never uses the word verbatim. Which style do you deliver?",
          "options": [
            "Clean-read, since research teams need readable text.",
            "Verbatim, because word-by-word coding for compliance signals that exact speech is the data.",
            "A tight summary of each answer, since coders only need the meaning.",
            "Verbatim for the questions, clean-read for the answers, to balance both needs."
          ],
          "correct": 1,
          "explain": "When the brief omits the word, purpose decides. Coding word by word for a compliance study means how things were said is evidence, which points verbatim."
        },
        {
          "prompt": "The brief asks for clean-read. A speaker says: We launched in, um, I think it was March, no wait, April, yeah April 2024. What do you deliver?",
          "options": [
            "We launched in April 2024.",
            "The company launched its product in April 2024, rewritten for smoothness.",
            "We launched in, um, I think it was March, no wait, April, yeah April 2024.",
            "We launched in April 2024 [corrected from March]."
          ],
          "correct": 0,
          "explain": "Clean-read cuts fillers and false starts while keeping the speaker's own words and final meaning. Rewriting is paraphrase; keeping every stumble is verbatim."
        },
        {
          "prompt": "The brief for 8 hours of interview audio says stamp every speaker change. Halfway in, you realize the stamping is slowing you badly and a fixed 60-second interval would be faster. What do you do?",
          "options": [
            "Switch to 60-second intervals; it is a recognized professional scheme.",
            "Stamp only the speaker changes that seem important, to save time.",
            "Keep stamping every speaker change; the scheme is part of what the delivery is judged against.",
            "Finish without stamps and add them only if a revision asks."
          ],
          "correct": 2,
          "explain": "The requested timestamp scheme is part of the standard, equal to accuracy. Substituting your own scheme fails the delivery even if every word is right."
        },
        {
          "prompt": "The supplier template shows dates as 2026-03-14. The invoices print dates as 14/03/2026, and keying them exactly as printed feels truer to the source. Which do you enter?",
          "options": [
            "As printed; source is truth, and that includes format.",
            "In the template's format; the source decides the date's value, the template decides its shape.",
            "As printed, with the template format added in parentheses.",
            "Whichever is faster, with the choice explained in your delivery note."
          ],
          "correct": 1,
          "explain": "Source truth covers content, not formatting. The template's format is the contract, often because software downstream will read the file, so values convert to its shape."
        },
        {
          "prompt": "Your 10 percent recheck on 120 forms finds two errors, both the same field shifted one column, both on forms keyed after your break. What do you do?",
          "options": [
            "Fix the two and deliver; two errors in twelve forms is close to normal accuracy.",
            "Fix the two and recheck two extra forms as a safety margin.",
            "Treat it as systematic and recheck every form keyed after the break.",
            "Deliver and note that a few column shifts may remain."
          ],
          "correct": 2,
          "explain": "Identical errors under identical conditions are a pattern, not bad luck. Every form from that stretch is suspect, and the sample exists to catch this before QC."
        },
        {
          "prompt": "A 4-hour keying task is nearly done. Skipping the recheck and the template pass would save about 25 minutes, and QC has approved your recent deliveries without comment. What is the sound choice?",
          "options": [
            "Skip both; your recent record shows your raw accuracy is high.",
            "Skip the content sample but keep the template pass.",
            "Deliver now, recheck on your own time, and flag anything you find afterward.",
            "Run both; a pattern found at QC costs an unpaid revision and a recorded rejection, far more than 25 minutes."
          ],
          "correct": 3,
          "explain": "On a fixed payout, minutes saved by skipping verification are the most expensive minutes. One QC-found error pattern erases the saving and marks your record."
        },
        {
          "prompt": "A scanned invoice field is blurry. A free online AI tool claims it can sharpen text in uploaded images. The brief says nothing about outside tools. What do you do?",
          "options": [
            "Upload only a cropped corner showing the blurry field; a fragment is harmless.",
            "Upload the page; better accuracy for the client justifies it.",
            "Upload it, then delete it from the tool's site afterward.",
            "Stay in viewers on your own machine, and key [illegible] if it remains unreadable."
          ],
          "correct": 3,
          "explain": "Client files never leave the task unless the brief says so. Any upload, cropped or deleted later, is a breach, while an honest flag meets the standard."
        },
        {
          "prompt": "Two interview voices sound nearly identical, and for one 5-minute stretch you cannot tell who is speaking. The rest of the file is clear. How do you attribute that stretch?",
          "options": [
            "Mark the doubtful turns as uncertain, for example [Speaker 1 or 2], and explain the stretch in your delivery note.",
            "Assign the turns to the speaker who talks most; it is probably them.",
            "Merge the stretch under one speaker so the labels look clean.",
            "Leave labels off in that stretch and let the client sort it out."
          ],
          "correct": 0,
          "explain": "Wrong attribution reads as confident and corrupts every line it touches. A marked uncertainty plus a note keeps the transcript honest and checkable."
        }
      ]
    }
  },
  "list-building": {
    "slug": "list-building",
    "title": "List building",
    "track": "category",
    "tagline": "Build lists that pass QC: hard filters, real searches, honest gaps.",
    "summary": "List building tasks are judged on one standard: every record matches the stated criteria, and every field is either filled or honestly marked unavailable after a real search. This course teaches the judgement behind that standard. You learn to read criteria as hard filters, search past page one, decide whether a listing is stale or a company is dead, keep duplicates out of your list, and pace a 200-record task so it lands on time.",
    "outcomes": [
      "You can test a candidate against every inclusion criterion before it enters your list.",
      "You can run a real search before marking any field unavailable.",
      "You can tell a stale listing from a dead company and decide which to include.",
      "You can catch duplicates hiding behind name variations within your own list.",
      "You can budget time per record so a 200-record task lands without quality collapse.",
      "You can explain why one fabricated entry can void an entire delivery."
    ],
    "lessons": [
      {
        "title": "The Standard Your List Is Judged Against",
        "minutes": 5,
        "sections": [
          {
            "heading": "One sentence decides approval",
            "body": "Every list you deliver is judged against one written standard. Here it is in full: records match the stated sourcing criteria and every requested field is populated or explicitly marked unavailable after a real search. Isolated staleness in public data is normal variance; a pattern of fabricated or unresearched entries is not. Read it twice, because every word carries weight. Records must match the criteria, not almost match them. Fields must be filled or honestly marked, not left vague. And the standard separates two kinds of imperfection: staleness you could not have caught, which is forgiven, and entries you invented or never checked, which are not. We wrote this course to make that distinction second nature."
          },
          {
            "heading": "Why one fake entry poisons a list",
            "body": "Picture what the client does with your list. They send two hundred cold emails, or call two hundred suppliers. Every fabricated address bounces, every dead number wastes a call, and the client starts asking which other rows are wrong. That is why QC does not treat a fabricated entry as one bad cell. The operator spot-checks a sample, and a single invented email found in ten checked records implies the same shortcut runs through the other one hundred ninety. At that point the list cannot be trusted without redoing your work, which is exactly what the delivery was paid to avoid. One honest gap costs you nothing. One invented value can cost the whole delivery."
          },
          {
            "heading": "Variance versus fabrication",
            "body": "The standard forgives what you could not reasonably know. A firm moved offices last month and every public source still shows the old suite number: that is staleness, normal variance in public data. Nobody expects you to know things the internet does not. What the standard does not forgive is a value that was never researched. The test is simple and personal: did you actually look? If you checked real sources and the data was wrong anyway, you are covered. If you copied a directory row without opening it, guessed an email format, or filled a field to hit the count, you fabricated, even if the value happens to be correct. Fabrication is about your process, not about luck."
          }
        ],
        "keyPoints": [
          "Approval turns on one standard: criteria matched, every field filled or honestly marked unavailable.",
          "QC treats one fabricated entry in a sample as evidence of a pattern.",
          "Staleness you could not have caught is variance; a value you never checked is fabrication.",
          "Fabrication is judged by your process, not by whether the guess happened to be right."
        ]
      },
      {
        "title": "Criteria Are Filters, Not Preferences",
        "minutes": 5,
        "sections": [
          {
            "heading": "Every criterion is a gate",
            "body": "A sourcing brief reads like a description, but you should treat it as a series of gates. Montreal-area accounting firms with five to fifty staff is three separate tests: is it in the Montreal area, is it an accounting firm, is it within the size band. A candidate enters your list only when it passes all of them. Passing two of three is not close, it is a fail. This matters because the tempting candidates are exactly the borderline ones: the well-known Toronto firm with a Montreal client base, the three-person bookkeeping shop that calls itself a firm. When you are short on candidates, the border starts to look flexible. It is not. The client filtered for a reason you may never see."
          },
          {
            "heading": "Ambiguity gets a declared rule",
            "body": "Some criteria are genuinely unclear. Does Montreal-area include Laval and the South Shore, or just the island? Does active mean a working website, or recent activity you can point to? You cannot ask the client, and the task should not stall on a definition. So make a reasonable interpretation, apply it identically to every record, and state it in the note you attach to your delivery: for example, Montreal-area interpreted as the island plus Laval and Longueuil. The operator can then judge your list against your stated rule instead of guessing at it. What you must never do is mix interpretations, using the strict reading when candidates are plentiful and the loose one when you run short. An inconsistent list reads as a careless one."
          },
          {
            "heading": "Padding is the fastest route to rejection",
            "body": "Near the end of a task, the count pressures you. You need two hundred records and you have one hundred eighty-five that genuinely qualify. The shortcut is to relax a gate and slide in fifteen near-misses. Resist it, because QC reads a list from the client's seat, and the client knows their own market. Firms that obviously fail a criterion jump out immediately and put every other record under suspicion, the same way a fabricated email does. If the pool is truly thinner than the brief assumed, that is real information the client is paying for. Deliver the qualifying records with a note explaining what you searched and why the pool ran short. A smaller honest list survives QC. A padded one rarely does."
          }
        ],
        "keyPoints": [
          "A record enters the list only when it passes every criterion, not most of them.",
          "Interpret unclear criteria one consistent way and declare that rule in your delivery note.",
          "Never mix strict and loose readings depending on how the count is going.",
          "A short honest list with a note beats a padded list every time."
        ]
      },
      {
        "title": "Searching Past Page One",
        "minutes": 5,
        "sections": [
          {
            "heading": "Where the first page runs out",
            "body": "General web search is a starting point, not a method. Search Montreal accounting firms and the first pages give you the biggest names, the best-optimized websites, and a few top-ten listicles that all repeat each other. That surface layer yields maybe thirty or forty usable candidates before you are seeing the same firms again. A two-hundred-record task lives in the layer underneath: the small firms with plain websites and no marketing budget. They are not hiding, they are simply not competing for search rankings. To find them you switch from searching to harvesting structured sources, places where someone else already assembled the population you need."
          },
          {
            "heading": "Directories, maps, and associations",
            "body": "Three source families cover most list-building tasks. Professional associations first: regulated professions publish member directories, and an accounting body's public register lists firms by city more completely than any search engine will. Maps second: search the category area by area, borough by borough, because map results are capped per view and a single wide search hides most of the market. Industry directories third: chambers of commerce, trade associations, niche directories like podcast catalogs for a podcast-contact task. Each source family has a bias. Associations miss unregistered businesses, maps favor storefronts, directories decay. That is why you draw from more than one, and why the next habit matters more than any single source."
          },
          {
            "heading": "Cross-check before you copy",
            "body": "A directory row is a lead, not a record. Directories are written once and updated rarely, so treat every harvested entry as a claim to verify. The habit is simple: the source gives you the name, the company's own website gives you the data. Open the site, confirm the firm still matches the criteria, and take the address, phone, and email from the pages the company itself maintains. When the source and the site disagree, the live site wins. This one habit is what separates a researched list from a scraped one, and it is precisely what the standard means by a real search. Copying a directory wholesale produces unresearched entries, and a pattern of those is the exact thing the dispute criteria name as a fail."
          }
        ],
        "keyPoints": [
          "Page one of search holds thirty or forty candidates; the rest live in structured sources.",
          "Work associations, maps area by area, and industry directories, because each covers what the others miss.",
          "A directory row is a claim; verify it against the company's own site before it enters.",
          "When a source and the live website disagree, the website wins."
        ]
      },
      {
        "title": "When Unavailable Is the Right Answer",
        "minutes": 6,
        "sections": [
          {
            "heading": "What a real search looks like",
            "body": "The standard lets you mark a field unavailable after a real search, so you need a working definition of one. For a missing email, a real search means at least this: the company's contact page, then its footer, team, and about pages, then a targeted web search combining the company name with the word email or with its domain, then the directory listing that surfaced the company in the first place. That is two to three minutes of genuine looking. If the address exists anywhere public, this routine usually finds it. If it does not, you have earned the right to write unavailable, and the standard explicitly protects you when you do."
          },
          {
            "heading": "Never construct what you did not see",
            "body": "Here is the line that must never blur. If you saw an address published somewhere, it is sourced. If you built it from a pattern, it is fabricated, no matter how reliable the pattern looks. Many firms do use firstname at domain, and after twenty confirmations the last ten feel safe to guess. They are not, because your delivery does not distinguish confident guesses from found data. The client treats every cell as researched. And the guess that bounces does the damage described in lesson one: it turns up in a QC sample and converts your whole list into suspect work. An unavailable is invisible variance. An invented address is evidence. No deadline pressure changes that arithmetic."
          },
          {
            "heading": "Gaps in a pattern deserve a note",
            "body": "Sometimes honesty produces an uncomfortable-looking list. You research two hundred firms and discover that a third of them publish no email at all, which is common in some industries. Sixty unavailables is not a quality problem if the searches were real, but it can look like one at a glance. Do not quietly hope QC reads it charitably, and absolutely do not start filling gaps to improve the look. Use the note you attach to your delivery: state the pattern, state what your search routine covered, and say it plainly. Roughly sixty firms publish no email; each was checked against site, search, and source directory. Now the operator reviews an explained list instead of a suspicious one. Flagging what looks off is always cheaper than being asked about it."
          }
        ],
        "keyPoints": [
          "A real search covers the site, a targeted web search, and the source, before writing unavailable.",
          "Seen and published means sourced; built from a pattern means fabricated, even when the pattern works.",
          "An honest unavailable is protected variance; an invented address is evidence against the whole list.",
          "When many records share a gap, explain the pattern in your delivery note."
        ]
      },
      {
        "title": "Stale Listing or Dead Company",
        "minutes": 5,
        "sections": [
          {
            "heading": "Public data ages at different speeds",
            "body": "Every source you touch is a snapshot from a different year. Directories may not have been edited since the company joined. Map listings linger long after a move. Association registers are often cleaned annually at best. So conflicting data is not a red flag by itself, it is the normal condition of public information. The judgement you owe the client is not whether this listing is current, because most are not. It is whether this company is alive. A live company with a stale listing belongs on your list, carrying the freshest data you can find. A dead company with a polished listing does not belong at all, because the client is buying reachable counterparties, not database rows."
          },
          {
            "heading": "Signals of death",
            "body": "You can usually settle the question from a browser in under two minutes. Strong signals a company is gone: the domain is parked or for sale, the map listing says permanently closed, a public business registry shows it dissolved, or news mentions a closure or merger. Weak signals that mean little on their own: an outdated copyright year, a quiet blog, social accounts that stopped posting, a directory entry with an old address. The rule is convergence. One weak signal is staleness. Two or three strong signals agreeing is death. An active website with recent, dated activity overrides almost everything, because companies maintain what they still use."
          },
          {
            "heading": "When you cannot tell",
            "body": "Some candidates sit in the gray zone: the site loads but nothing is dated, the map listing is unclaimed, nothing confirms life or death either way. When the candidate pool is deep, the cheap move is to drop the ambiguous ones and spend the time finding clearly live firms instead. When the pool is thin and you need the record, include it with the best data available and identify the uncertainty in your delivery note, naming the records you could not confirm as active. That keeps the decision where it belongs, with the operator, and keeps you on the right side of the standard. Guessing silently in either direction is the only wrong option."
          }
        ],
        "keyPoints": [
          "Judge the company, not the listing; stale listings of live companies belong on the list.",
          "One weak signal is staleness; several strong signals agreeing means the company is gone.",
          "A parked domain, a closed map listing, or a dissolved registry entry are strong death signals.",
          "In the gray zone, drop it if the pool is deep, or include and flag it."
        ]
      },
      {
        "title": "Duplicates, Client Data, and the Clock",
        "minutes": 6,
        "sections": [
          {
            "heading": "Duplicates hide behind variations",
            "body": "No client wants to call the same firm twice, so duplicates read as carelessness even when every record is real. The trap is that duplicates rarely look identical. The same firm appears as Groupe Lavoie CPA in a directory, Lavoie Accounting on maps, and lavoiecpa.com on its own site, sometimes with different addresses for different offices. Names and addresses lie; domains and phone numbers mostly do not. So dedup on the stable keys: if two rows share a website domain or a phone number, treat them as one company until proven otherwise. And unless the brief asks for locations, a firm with three branches is one record, at its main office."
          },
          {
            "heading": "Check on entry, sweep at the end",
            "body": "Dedup twice. On entry: before a candidate goes in, search your sheet for its domain, a few seconds that prevents most duplicates, especially when you work multiple sources that overlap heavily. At the end: sort the finished list by domain, then by phone, then by name, and scan each sorted view for neighbors that match. The final sweep catches what entry checks miss, like the same firm under two domains. If the brief includes a client file of existing contacts to exclude, that file is client data and never leaves the task. Compare it inside your own spreadsheet with lookup formulas. Do not upload either list to an online dedup tool or an AI service, and keep no copy after delivery."
          },
          {
            "heading": "The per-record budget",
            "body": "A two-hundred-record task collapses without arithmetic. If you give it eight focused hours, that is about two and a half minutes per record, and that average must absorb dead ends and unavailables. So spend the first half hour on sources, not records, because a good directory can halve your per-record cost. Then measure: after twenty records, check your pace. At double budget, the fix is always your method, never your verification. Find a richer source, tighten your routine, drop a slow source family. What you must not do is protect the deadline by cutting the checks, because that produces the classic failed delivery: a careful first hundred and a fabricated last hundred, and QC samples the whole list."
          }
        ],
        "keyPoints": [
          "Dedup on domains and phone numbers; names and addresses vary too much to trust.",
          "A multi-branch firm is one record unless the brief asks for locations.",
          "Client exclusion files stay in the task: compare in your spreadsheet, upload nowhere, keep nothing.",
          "Measure your pace at twenty records; fix the method, never cut verification."
        ]
      }
    ],
    "exam": {
      "questions": [
        {
          "prompt": "The brief asks for Montreal-area accounting firms with 5 to 50 staff. Late in the task you find a firm that matches everything except size: it has 3 staff. You are 15 records short of the target. What do you do?",
          "options": [
            "Include it and note the staff count in your delivery note so the operator can decide.",
            "Exclude it and keep working structured sources; every criterion is a gate, whatever the count says.",
            "Include it, since staff counts in public data are often stale anyway.",
            "Include it only if you are still short when the deadline arrives."
          ],
          "correct": 1,
          "explain": "Criteria are hard filters. A record that fails one gate is a fail, and padding to hit the count puts the whole list under suspicion."
        },
        {
          "prompt": "The brief says Montreal-area but never defines the boundary. You are unsure whether firms in Laval qualify. The pool on the island alone looks thin. How do you handle it?",
          "options": [
            "Use the strictest reading, island only, and say nothing; nobody rejects a list for being conservative.",
            "Include Laval firms only if the island pool runs short of the target.",
            "Include everything within commuting distance, since more candidates gives the client more value.",
            "Pick one reasonable boundary, apply it to every record, and state that rule in your delivery note."
          ],
          "correct": 3,
          "explain": "Ambiguous criteria call for one consistent, declared interpretation. The operator can then judge the list against your stated rule instead of guessing what you meant."
        },
        {
          "prompt": "You need 200 home-services podcasts. After an hour of web searching you have 45, and results are repeating the same shows. What is the right next move?",
          "options": [
            "Switch to structured sources: podcast directories and catalogs, browsing the niche category by category.",
            "Keep paging deeper through search results; the smaller shows appear after the big ones.",
            "Broaden the niche slightly so the search engine has more to return.",
            "Deliver the 45 with a note that the niche appears smaller than the brief assumed."
          ],
          "correct": 0,
          "explain": "General search surfaces only the best-ranked shows before repeating. Large targets live in structured sources that already assembled the population, not deeper in search pages."
        },
        {
          "prompt": "The brief requires an email per firm. One firm's contact page shows only a form, no address. What must happen before you may write unavailable?",
          "options": [
            "Nothing more; the contact page is where a firm publishes its email if it wants one.",
            "One more check of the directory entry that surfaced the firm.",
            "Check the site's footer, team, and about pages, run a targeted search on the name plus email, and recheck the source.",
            "Enter the contact form link in the email column so the field is not empty."
          ],
          "correct": 2,
          "explain": "Unavailable is earned by a real search: the rest of the site, a targeted web search, and the original source. One page is not a search."
        },
        {
          "prompt": "You are 190 records in. For dozens of firms you verified that emails follow firstname at domain. Ten remaining firms publish no email anywhere you searched. Constructing the same pattern would finish the task on time. What do you do?",
          "options": [
            "Construct the ten addresses; the pattern is proven across this exact list.",
            "Mark the ten unavailable; an address you never saw published is fabricated regardless of how reliable the pattern looks.",
            "Construct them but disclose in your delivery note that ten addresses are pattern-based.",
            "Leave the ten cells empty so you are not asserting anything either way."
          ],
          "correct": 1,
          "explain": "Sourced means seen published. A constructed address is fabrication even when disclosed, and one bounce in a QC sample makes the whole list suspect. Honest unavailables are protected variance."
        },
        {
          "prompt": "A directory entry matches every criterion. But the firm's domain is parked, its map listing says permanently closed, and its registry entry shows it dissolved last year. What do you do?",
          "options": [
            "Exclude it; several strong signals agree the company is gone, and a listing is not a company.",
            "Include it with the directory data; staleness in public data is normal variance.",
            "Include it but mark the email and phone unavailable since they may be dead.",
            "Include it and let the operator decide, since the directory entry itself matches the brief."
          ],
          "correct": 0,
          "explain": "One weak signal is staleness; multiple strong signals converging means the company is dead. A dead company fails the brief no matter what its old listing says."
        },
        {
          "prompt": "A directory lists a qualifying firm at an address its own website contradicts. The website is active, with news posted last month and a different address on its contact page. What goes in your list?",
          "options": [
            "Exclude the firm; conflicting sources mean the record cannot be trusted.",
            "The directory address, since the directory is the source that surfaced the record.",
            "Mark the address unavailable and note that public sources disagree.",
            "Include the firm with the address from its own website; the live site wins over any directory."
          ],
          "correct": 3,
          "explain": "This is a stale listing of a live company, normal variance. Companies maintain their own sites, so when source and site disagree, take the site's current data."
        },
        {
          "prompt": "Your directory pass produced Groupe Lavoie CPA and your maps pass produced Lavoie Accounting, at different addresses. Both point to lavoiecpa.com and share a phone number. The brief asks for firms, not locations. What do you do?",
          "options": [
            "Keep both records; the names and addresses differ, so they count as separate entries.",
            "Keep both but note the similarity so the operator can merge them if needed.",
            "Enter one record for the firm; shared domain and phone means one company, and branches count once.",
            "Drop both records, since conflicting addresses make the data unreliable."
          ],
          "correct": 2,
          "explain": "Names and addresses vary; domains and phone numbers are stable keys. Two rows sharing them are one firm, and a multi-branch firm is one record unless the brief asks for locations."
        },
        {
          "prompt": "A 200-record task. You planned about eight hours of sourcing. After the first 20 records you check your pace: you are on track for sixteen hours. What is the right adjustment?",
          "options": [
            "Skip the cross-check against each company's website for the remaining records to recover the pace.",
            "Change the method: find richer structured sources and tighten your routine, keeping every verification step.",
            "Release the claim now, before more hours sink into a task you may not finish.",
            "Keep working unchanged and deliver however many verified records the deadline allows."
          ],
          "correct": 1,
          "explain": "Pace problems are method problems. Better sources can halve per-record cost, while cutting verification produces exactly the unresearched pattern the standard rejects. Twenty records in is early enough to fix."
        },
        {
          "prompt": "Your finished list of 200 firms has honest gaps: about 60 publish no email anywhere, each confirmed by your full search routine. The list looks thin at a glance. How do you deliver?",
          "options": [
            "Fill the gaps with each firm's most likely address format so the list reads complete.",
            "Remove the 60 firms and deliver 140 fully populated records instead.",
            "Deliver as is; unavailable is explicitly allowed by the standard, so no explanation is needed.",
            "Deliver with a note stating the pattern and the search routine each gap went through."
          ],
          "correct": 3,
          "explain": "Sixty real unavailables are fine, but an unexplained pattern invites doubt. The delivery note turns a suspicious-looking list into an explained one. Flagging is always cheaper than being questioned."
        },
        {
          "prompt": "One email in your 200-record delivery was constructed, not found. QC spot-checks ten records and it happens to be one of them, and it bounced. Under the category standard, what is the likely outcome?",
          "options": [
            "The whole delivery is suspect; a fabricated entry in a sample reads as a pattern, not an isolated slip.",
            "That single record is corrected in revision and the rest of the list stands.",
            "It counts as isolated staleness, which the standard names as normal variance.",
            "The operator deducts that record from the payout and approves the rest."
          ],
          "correct": 0,
          "explain": "The standard forgives isolated staleness but not fabrication. One invented value found in a small sample implies the shortcut runs through the unchecked records, so trust in the list collapses."
        },
        {
          "prompt": "The task files include the client's spreadsheet of current customers, to be excluded from your list. You want to compare it against your 200 rows quickly. What is the right way?",
          "options": [
            "Upload both files to a free online duplicate-finder; it is faster and the data is just business names.",
            "Paste only the email columns into an AI tool, since partial data is not the full file.",
            "Compare inside your own spreadsheet with lookup formulas, and keep no copy of the client file after delivery.",
            "Skip the comparison and note that the operator should run the exclusion check."
          ],
          "correct": 2,
          "explain": "Client files never leave the task. No third-party or AI tools unless the brief says to, and no copies kept after delivery. Spreadsheet lookups handle exclusion locally."
        }
      ]
    }
  },
  "research": {
    "slug": "research",
    "title": "Research",
    "track": "category",
    "tagline": "Sourced, current, and never invented: research a client can act on.",
    "summary": "Research tasks are judged against one standard: every field populated or honestly marked unavailable, and every figure traceable when the brief asks for sourcing. This course teaches the judgement behind that standard: choosing sources, corroborating facts that matter, reading whether data is current, running discovery and verification with the right method for each, and holding the line between honest unavailability and invented findings.",
    "outcomes": [
      "You can choose between primary and secondary sources based on what the client will do.",
      "You can apply the two-source rule and spot sources that copied each other.",
      "You can capture source URLs and dates that make every figure traceable.",
      "You can tell current data from pages published once and never maintained.",
      "You can run discovery and verification tasks with the method each one needs.",
      "You can mark a field unavailable honestly and back it with the searches you ran."
    ],
    "lessons": [
      {
        "title": "What Verification-Grade Means",
        "minutes": 4,
        "sections": [
          {
            "heading": "The standard you are judged against",
            "body": "Every research delivery is judged against one standard. Every requested field is populated or explicitly marked unavailable after a real search, and figures are traceable to a source where the brief asked for sourcing. Isolated inaccuracies in publicly-sourced data are normal variance; fabricated findings are not. Read it twice. It does not ask for perfection. It asks for three things: no empty cells without a reason behind them, a trail back to a source whenever sourcing was requested, and nothing invented. This course teaches you to meet that standard on every task you claim."
          },
          {
            "heading": "Variance is forgiven, fabrication is not",
            "body": "Public data is messy. A phone number changes the week after you record it. A directory spells a name wrong and you carry the error forward. If you ran a real search and recorded what a source actually said, that is variance, and we treat it as normal. Fabrication is different: writing down something no source ever told you. A guessed email, an estimated price, a role assumed from a job posting. The operator cannot tell your 295 real findings from your 5 invented ones, so one discovered fabrication makes the whole file suspect. Variance costs a correction. Fabrication costs trust in every row you have ever delivered."
          },
          {
            "heading": "Why the bar is this high",
            "body": "Research deliveries get used, not just read. A client who orders owner emails for 300 dental clinics is about to send 300 messages. A wrong email bounces harmlessly. An invented one can reach a stranger, embarrass the client, or poison a mailing list. A pricing sheet feeds a pricing decision. A verification file decides which records stay in a database. You rarely see what happens after delivery, so treat every cell as something a real person will act on tomorrow morning. That is what verification-grade means: not academically perfect, but safe to act on."
          }
        ],
        "keyPoints": [
          "The standard forgives sourced inaccuracies but never invented findings.",
          "Every cell is either populated or marked unavailable after a real search.",
          "One discovered fabrication makes every row in your file suspect.",
          "Clients act on research; treat every cell as something used tomorrow."
        ]
      },
      {
        "title": "Primary and Secondary Sources",
        "minutes": 4,
        "sections": [
          {
            "heading": "What primary means here",
            "body": "A primary source is the entity itself speaking about itself. The clinic's own website is primary for its address. A company's own pricing page is primary for its prices. A person's own LinkedIn profile is primary for the role they claim. An official registry is primary for registration facts. Primary does not mean guaranteed true, since a company page can be outdated, but it means no one retyped or summarized the fact on its way to you. When the fact belongs to the entity, the primary source is where the fact lives."
          },
          {
            "heading": "What secondary means, and its uses",
            "body": "A secondary source repeats what someone else found: directories, aggregator sites, news articles, comparison blogs, cached lists. Secondary sources are fast and wide, which makes them good for discovery. When you need to locate 300 clinics, a directory hands you the list in minutes. But every step away from the primary source adds a chance of error: old scrape dates, typos, merged records. Use secondary sources to locate candidates and to corroborate, not as the final word on facts the client will act on."
          },
          {
            "heading": "When each is enough",
            "body": "Match the source to the stakes. A low-stakes field with no sourcing requirement, such as a clinic's city or general specialty, can rest on one reasonable secondary source. A field the client will act on directly, an email they will write to or a price they will position against, deserves the primary source or corroboration. Pricing is a special case: it changes without announcement, so a secondary source that was right last quarter can be wrong today. When in doubt, ask what the client does with this cell. The more they will do, the closer to the source you go."
          }
        ],
        "keyPoints": [
          "Primary means the entity speaking about itself; nothing retyped on the way to you.",
          "Secondary sources locate candidates and corroborate; they are not the final word.",
          "Match source strength to stakes: the more the client will act, the more primary you go.",
          "Pricing changes silently; only the company's own page is current."
        ]
      },
      {
        "title": "The Two-Source Rule",
        "minutes": 5,
        "sections": [
          {
            "heading": "Two independent sources for facts that matter",
            "body": "For any fact the client will act on, find it in two places that did not copy each other. If a directory and the clinic's own site agree on an email, record it with confidence. If they disagree, the primary source usually wins, and you note the conflict if the brief asked for sourcing. One strong primary source about itself, such as a company's own pricing page for its own prices, can stand alone; corroboration adds little there. The rule exists for everything else: names, emails, roles, and figures that passed through other hands before reaching you."
          },
          {
            "heading": "Independence is the whole rule",
            "body": "Two sources only count if they are independent. Dozens of directory sites resell the same data feed, so finding a phone number on three of them is finding it once. Signs of a shared feed: identical wording, identical mistakes, the same odd formatting. Real independence looks like a directory plus the clinic's own site, or a news article plus a registry. Before you count a second source, ask where it likely got the fact. If the honest answer is from the first source, keep looking."
          },
          {
            "heading": "Capture evidence as you go",
            "body": "When the brief asks for sourcing, a fact without a trail does not meet the standard. The trail is simple: the source URL and the date you saw it. Capture both at the moment you record the fact, not at the end of the task. Pages change and disappear, and the date tells the operator the fact was true as of that day, which protects you when data shifts after delivery. Follow the format the brief specifies; if it specifies none, a source column and a date column in the sheet is enough. Traceable is the word in the standard, and this is what it costs: one paste and one date per fact."
          }
        ],
        "keyPoints": [
          "Facts the client acts on need two sources that did not copy each other.",
          "Three directories reselling one feed count as one source.",
          "A primary source speaking about itself can stand alone.",
          "Record the source URL and the date seen the moment you find the fact."
        ]
      },
      {
        "title": "Current, or Published Once",
        "minutes": 4,
        "sections": [
          {
            "heading": "The web does not age visibly",
            "body": "A page written six years ago looks exactly like a page written yesterday. Footers showing this year's date auto-update and prove nothing. The question behind every fact you pull is not whether it was published but whether it is maintained. A staff page nobody has touched in four years still lists the doctor who left. A pricing table can survive three price changes without anyone correcting it. Verification-grade research treats every undated fact as a claim of unknown age until something tells you otherwise."
          },
          {
            "heading": "Reading freshness signals",
            "body": "Look for evidence the page is alive: recent posts, dated updates, prices that match a current promotion, staff listings consistent with recent activity elsewhere. Then look for signs of neglect: a news section that stops years ago, broken links, past events described as upcoming, copyright ranges ending in the past. No single signal is proof; each one shifts your confidence. A fact from a clearly maintained page carries more weight than the same fact from a ghost site, and a stale signal is a cue to corroborate somewhere fresher before you record."
          },
          {
            "heading": "Your delivery is a snapshot",
            "body": "Everything you deliver is true as of the date you saw it, no more. That is not a weakness; it is what the date-seen column is for. Recording dates turns this is the owner's email into this source said so on this date, which is a claim you can always stand behind. The standard calls sourced inaccuracies normal variance partly for this reason: data drifts. Your job is not to promise the future. It is to report what maintained sources say today, and to mark the today."
          }
        ],
        "keyPoints": [
          "Published once is not the same as current; footer years prove nothing.",
          "Judge whether a page is maintained before trusting its facts.",
          "A stale signal means corroborate somewhere fresher before recording.",
          "A date-seen column turns findings into claims you can always defend."
        ]
      },
      {
        "title": "Discovery Versus Verification",
        "minutes": 5,
        "sections": [
          {
            "heading": "Two task shapes, two methods",
            "body": "Discovery asks you to find something that may exist: owner emails, competitor prices, a contact name. Verification asks whether something already claimed is still true: does this profile still match this role, is this firm still at this address. The shapes differ. Discovery starts wide, using secondary sources to generate candidates, then narrows to confirm. Verification starts narrow, at the claim itself, and goes straight to the primary source to test it. Using the discovery method on a verification task wastes hours; using the verification method on a discovery task finds nothing."
          },
          {
            "heading": "Discovery: wide, then confirmed",
            "body": "In discovery, secondary sources are your map and primary sources are your proof. Cast a wide net across directories, search engines with varied phrasings, and the entity's own site, then confirm the candidates that matter against primary sources. The first failure mode is stopping at the map: delivering the first directory hit without confirmation. The second is not knowing when to stop. A real search has an endpoint, and once the reasonable avenues are exhausted, unavailable is a finding. The next lesson covers exactly where that line sits."
          },
          {
            "heading": "Verification: the claim is the starting point",
            "body": "In verification, each row is a claim to test, and your deliverable is a status: confirmed, changed, or could not confirm. Go to the source that owns the claim, the profile itself or the company's own page, and compare. Record what you saw and when. Resist two temptations. Do not quietly overwrite changed data unless the brief asks for updates; the client asked whether their data is still true, and changed is the answer they are paying for. And do not stretch could not confirm into confirmed because most other rows were fine. Could not confirm is a real status, not a failure."
          }
        ],
        "keyPoints": [
          "Discovery starts wide and narrows; verification starts at the claim and tests it.",
          "In discovery, secondary sources map and primary sources prove.",
          "Verification deliverables are statuses: confirmed, changed, or could not confirm.",
          "Never quietly overwrite changed data; changed is the answer being paid for."
        ]
      },
      {
        "title": "Unavailable, Honestly",
        "minutes": 6,
        "sections": [
          {
            "heading": "Unavailable is a finding, not a failure",
            "body": "The standard says every field is populated or explicitly marked unavailable after a real search. That last clause is a license: unavailable is a legitimate deliverable. Some owners publish no email. Some companies hide pricing behind a sales call. A file with honest unavailable rows is complete; a file with guessed rows is not. What makes unavailable honest is what stands behind it, meaning the searches you actually ran. What makes it dishonest is using it to skip hard rows, or avoiding it by inventing something to fill the cell."
          },
          {
            "heading": "What a real search looks like",
            "body": "Before writing unavailable, you should have tried the reasonable avenues: the entity's own site including contact and about pages, a search engine with several phrasings, the obvious directories for that industry, and the platform where the fact would naturally live. For a person's role, that includes their professional profile. Keep a short note of what you tried; three or four search descriptions per stubborn row is enough. When the operator sees checked site, searched three phrasings, checked two directories, no owner email published, the unavailable mark is credible and defensible. A bare empty cell is neither."
          },
          {
            "heading": "The extrapolation line",
            "body": "Here is the line that matters most. You know forty owner emails follow the pattern of first name at domain. Row forty-one has no published email, but you know the owner's first name. Typing the pattern into the cell feels like insight. It is fabrication. No source told you that address exists; you did. A plausible inference presented as a finding is an invented finding under the standard. If a pattern seems worth mentioning, put it where it belongs: in your delivery note to the operator, labeled as a pattern, never in the data. The cell gets unavailable. The note gets your reasoning. The operator decides what to do with it."
          },
          {
            "heading": "When the brief itself is unclear",
            "body": "Uncertainty about the brief is handled the same way as uncertainty about a fact: flag it, do not guess it silently. If a term could mean two things, pick the reading that best fits the task, apply it consistently, and say so in your delivery note: which definition you used and which rows it affects. The operator can accept it or request a revision with the definition corrected, and either way your record shows judgement rather than concealment. A delivery that hides its assumptions gambles the whole payout on a coin flip. A delivery that states them is safe even when the assumption was wrong."
          }
        ],
        "keyPoints": [
          "Unavailable after a real search is a complete, legitimate answer.",
          "Log the searches behind every unavailable mark; a bare empty cell defends nothing.",
          "Patterns go in the delivery note as patterns, never in the data as findings.",
          "State assumptions in the delivery note; hidden assumptions gamble the whole payout."
        ]
      }
    ],
    "exam": {
      "questions": [
        {
          "prompt": "The brief asks for each clinic's owner name and says it will be used for outreach. A directory lists Dr. Reyes as owner of one clinic. What do you do?",
          "options": [
            "Record Dr. Reyes; established directories are usually accurate.",
            "Confirm it against a second independent source, such as the clinic's own site, before recording it.",
            "Skip the field and mark it unavailable to stay safe.",
            "Deliver the name with a note asking the operator to double-check it."
          ],
          "correct": 1,
          "explain": "An owner name used for outreach is a fact the client acts on, so corroborate the directory against an independent source before recording it."
        },
        {
          "prompt": "You find the same phone number on two directory websites. The two listings use identical wording, down to the same abbreviation. Does this satisfy the two-source rule?",
          "options": [
            "Yes; two separate websites count as two sources.",
            "Yes, as long as both were seen on the same day.",
            "No; they likely copied one feed, so find one independent source, such as the clinic's own listing.",
            "No; phone numbers always require three sources."
          ],
          "correct": 2,
          "explain": "Independence is the point of the rule. Identical wording signals a shared data feed, so the two pages count as one source. The clinic's own listing is independent."
        },
        {
          "prompt": "The task is to pull pricing for five competitors into one sheet. A comparison article from last year lists all five prices in one table. What do you do?",
          "options": [
            "Use the article; it covers all five companies in one place.",
            "Use the article but record its URL as the source.",
            "Average the article's prices with whatever else you find.",
            "Go to each competitor's own pricing page; pricing changes silently, and the primary source is the page itself."
          ],
          "correct": 3,
          "explain": "Pricing changes without announcement, so a year-old secondary source cannot be trusted. Each company's own pricing page is the primary source and the only current one."
        },
        {
          "prompt": "A clinic site's footer shows the current year, but its news page stopped in 2021. The site lists Dr. Cruz as the owner. How do you treat that fact?",
          "options": [
            "Unknown age; footers auto-update, and the dead news page suggests staleness, so corroborate the fact somewhere fresher.",
            "Current; the footer year shows the site is actively maintained.",
            "Stale; discard the site entirely and rely on directories instead.",
            "Current, as long as every page loads without errors."
          ],
          "correct": 0,
          "explain": "Footer years auto-update and prove nothing. A news page dead since 2021 is a stale signal, so the ownership fact needs corroboration from a fresher source."
        },
        {
          "prompt": "You are verifying that 150 LinkedIn profiles still match their listed roles. Profile 88 now shows a different title at a different company. What do you enter for that row?",
          "options": [
            "The new title, quietly replacing the old data.",
            "The old title; the task said verify, not update.",
            "Mark the row as no longer matching, recording what you saw and the date; that status is the deliverable.",
            "Skip the row; changed profiles fall outside the task."
          ],
          "correct": 2,
          "explain": "Verification deliverables are statuses. The client is paying to learn which rows changed, so record the change with what you saw and the date you saw it."
        },
        {
          "prompt": "The brief asks for owner emails. For one clinic you searched its site, ran several search phrasings, and checked two industry directories. No owner email is published anywhere. What do you do?",
          "options": [
            "Mark it unavailable and note the searches you ran, so the operator can see the search was real.",
            "Enter the clinic's general contact address as the owner email.",
            "Guess the address from the format other staff emails follow.",
            "Leave the cell blank and move to the next clinic."
          ],
          "correct": 0,
          "explain": "Unavailable after a real search is a complete answer, and logging the searches makes it credible. Generic or guessed emails presented as owner emails are fabrication."
        },
        {
          "prompt": "You have found 40 owner emails, all following the pattern of first name at clinic domain. Clinic 41 publishes no email, but you know the owner's first name and the domain. Entering the patterned address as the owner email is what?",
          "options": [
            "Fabrication; a plausible inference presented as a finding is invented data, so mark the field unavailable instead.",
            "Efficient pattern-matching that any experienced researcher would use.",
            "Acceptable if you feel confident the pattern holds.",
            "Fine, since the rest of your emails are verified."
          ],
          "correct": 0,
          "explain": "No source told you that address exists. A plausible inference presented as a finding is fabrication under the standard. Mention the pattern in your delivery note instead."
        },
        {
          "prompt": "The brief asks for sourcing on revenue figures. You found a figure in an industry article. What must you deliver alongside the number?",
          "options": [
            "Just the number; the operator can search for it if questioned.",
            "The publication's name, which is enough to identify the source.",
            "A note saying it was found in an industry article online.",
            "The article's URL and the date you saw it, so the figure is traceable."
          ],
          "correct": 3,
          "explain": "The standard requires figures traceable to a source when the brief asks for sourcing. The URL plus the date seen is the minimal trail that satisfies it."
        },
        {
          "prompt": "The brief asks for each clinic's city, a low-stakes field with no sourcing requirement. A well-known directory lists it. Do you need to verify further?",
          "options": [
            "Yes; every field needs two sources without exception.",
            "No; for a low-stakes field with no sourcing requirement, one reasonable secondary source is enough.",
            "Yes; location data must always come from an official registry.",
            "No; you can infer the city from the clinic's phone area code."
          ],
          "correct": 1,
          "explain": "Source strength matches stakes. A low-stakes field with no sourcing requirement can rest on one reasonable secondary source; save corroboration effort for fields the client acts on."
        },
        {
          "prompt": "A discovery task asks for the head of procurement at 50 companies. Your first search for company 12 returns nothing useful. What is the verification-grade move?",
          "options": [
            "Mark it unavailable; you ran a real search.",
            "Enter the CEO instead, since the CEO oversees procurement.",
            "Try varied searches, including the company site, LinkedIn people search, and related titles like purchasing manager, before deciding.",
            "Copy the likely answer from a similar-sized company in the same industry."
          ],
          "correct": 2,
          "explain": "Unavailable is only honest after a real search, which means varied phrasings and the places the fact would naturally live, not a single failed query."
        },
        {
          "prompt": "After delivery, the operator reports that 3 of your 300 clinic emails bounced. You had verified each against the clinic's own site and recorded dates seen. Did your delivery fail the standard?",
          "options": [
            "Yes; any inaccuracy in a delivery fails the standard.",
            "It depends on whether the client notices the bounces.",
            "Yes; you should have tested each address by sending a message.",
            "No; isolated inaccuracies in publicly-sourced data are normal variance, unlike fabricated findings."
          ],
          "correct": 3,
          "explain": "The standard says isolated inaccuracies in publicly-sourced data are normal variance. You searched, recorded what sources said, and dated it; that is exactly what verification-grade means."
        },
        {
          "prompt": "Halfway through verifying 150 profiles, you realize the brief's phrase still active could mean two different things, and you have been applying one reading. What do you do?",
          "options": [
            "Continue with your reading; consistency matters most.",
            "Flag the ambiguity in your delivery note, stating which definition you used and which rows it affects.",
            "Redo the finished rows using the stricter of the two definitions.",
            "Use whichever definition makes more rows pass verification."
          ],
          "correct": 1,
          "explain": "Flagging beats guessing, for briefs as much as facts. Stating your definition in the delivery note shows judgement and lets the operator correct course cheaply."
        }
      ]
    }
  },
  "analysis": {
    "slug": "analysis",
    "title": "Analysis",
    "track": "category",
    "tagline": "Numbers that tie back, methods followed exactly, work anyone can re-derive.",
    "summary": "Analysis deliveries are judged on one standard: figures reconcile to the source data and the stated method was followed. This course teaches the judgement that meets it, from control totals and documented choices to categorization rules, sanity checks, and the line between reporting and opinion. You finish able to build summaries an operator can re-derive and defend.",
    "outcomes": [
      "You can tie every delivered figure back to source row counts and sums.",
      "You can follow a stated method exactly and document every choice it left open.",
      "You can categorize hundreds of rows consistently using written decision rules.",
      "You can catch your own errors with magnitude, sum, and sign checks.",
      "You can report findings without editorializing, and flag anomalies instead of hiding them."
    ],
    "lessons": [
      {
        "title": "The Standard You Are Judged Against",
        "minutes": 4,
        "sections": [
          {
            "heading": "One sentence decides every dispute",
            "body": "Every analysis delivery is judged against one standard: figures reconcile to the source data and the stated method was followed. A conclusion the client disagrees with is not a dispute ground; an arithmetic or method error is. That is the exact wording the operator uses in a dispute, and everything in this course exists to help you meet it. Notice what it does not say. It does not say the client must like the result. It does not say the trend must look good. It says two things must be true: your numbers must tie back to the data you were given, and you must have done what the brief said to do. Meet those two conditions and you are on solid ground."
          },
          {
            "heading": "Two failures, one safe harbor",
            "body": "There are exactly two ways to lose a dispute in this category. The first is an arithmetic error: a total that does not match the source, a formula that skips rows, a sum that double counts. The second is a method error: the brief said cost per kilogram and you computed cost per shipment, or it said three years and you used two. Both are checkable facts, which is why they decide disputes. What cannot lose you a dispute is the result itself. If the data shows sales falling and the client hoped they were rising, that is the client's problem, not yours. Your protection is accuracy, not flattery. Never bend a number toward the answer someone wants."
          },
          {
            "heading": "What checkable means for you",
            "body": "Because the standard is checkable, your delivery has to be checkable too. The operator reviewing your work was not there while you built it. If they cannot trace your headline figure back to source rows in a few minutes, they cannot defend it, and an undefendable delivery gets sent back. So the habit this course builds is simple: work as if someone will re-derive every number you deliver, because someone will. Keep your steps visible, your choices written down, and your totals tied to the source. The field guide for this category gives you the step-by-step mechanics. This course covers the judgement calls the checklist cannot make for you."
          }
        ],
        "keyPoints": [
          "Disputes turn on two checkable facts: reconciliation and method. Nothing else.",
          "A result the client dislikes is not an error.",
          "Work as if every figure will be re-derived, because it will."
        ]
      },
      {
        "title": "Numbers That Tie Back",
        "minutes": 5,
        "sections": [
          {
            "heading": "Take control totals before anything else",
            "body": "Before you sort, filter, or build a single formula, record three numbers from the untouched source file: the row count, the sum of the main value column, and the date range. These are your control totals. Write them somewhere outside the working file, because everything you deliver must tie back to them. If the source has 4,960 rows and your trend sheet accounts for 4,812, you owe an explanation for 148 rows before the delivery leaves your hands. Reconciliation is not a step you do at the end. It is a fence you build at the start, so that any number that later escapes it announces itself."
          },
          {
            "heading": "When totals refuse to tie",
            "body": "A gap between your output and your control totals almost always has a boring cause. The usual suspects, roughly in order: a filter still applied from earlier work, blank cells in the column you grouped by, duplicate rows counted twice, numbers stored as text that a sum silently skips, and rows added or deleted by accident. Hunt the gap down to the exact rows. Fifty missing rows is not a rounding story; it is fifty specific rows you can find. Never close a gap by adjusting a total to match. A forced total is an arithmetic error wearing a disguise, and it is precisely what QC exists to catch."
          },
          {
            "heading": "Problems that live in the source",
            "body": "Sometimes the source itself is broken: a month appears twice, quantities are negative where they cannot be, a whole week of rows is missing. You did not cause this, but you must not bury it either. Handle it in two moves. First, apply the stated method to the data as given, unless the brief tells you how to treat bad rows. Second, list every anomaly in your delivery note to the operator: what you found, which rows, and how it affects the totals. Flagging a broken source costs you nothing. Quietly working around it, or quietly fixing it, turns the client's data problem into your method error."
          }
        ],
        "keyPoints": [
          "Record row count, value sum, and date range before touching the file.",
          "Every gap has specific rows behind it. Find them.",
          "Never force a total to match. Explain it or fix the cause.",
          "Source anomalies go in the delivery note, named row by row."
        ]
      },
      {
        "title": "Follow the Method, Log the Gaps",
        "minutes": 5,
        "sections": [
          {
            "heading": "The stated method is a contract",
            "body": "When a brief states a method, that method is the deliverable as much as the numbers are. Compare our shipping costs against three carriers using cost per kilogram means cost per kilogram, even if you believe cost per shipment tells a truer story. The dispute standard says the stated method was followed, and it means followed exactly. A smarter method delivered silently is still a method error, because the client cannot compare your output to what they asked for. If you see a real flaw in the requested approach, do the work as stated and put your suggestion in the note to the operator. That is the only channel where a better idea helps you instead of hurting you."
          },
          {
            "heading": "Write down every open choice",
            "body": "No brief specifies everything. Three years of sales: calendar years or the last 36 months? Shipping cost: with or without fuel surcharges? Revenue: gross or net of refunds? Each open question forces a choice, and every choice you make silently is a risk. The rule is simple: decide, then write the decision down at the moment you make it. Pick the most standard reading when one exists, and carry the full list into your delivery note. A choice that is written down is a judgement call the operator can confirm or correct. The same choice made silently looks like an error when someone else re-derives your numbers and gets a different answer."
          },
          {
            "heading": "When both readings change the answer",
            "body": "Most open choices barely move the result, and a written note covers them. But sometimes the two readings produce genuinely different answers: including refunds flips a trend from up to down, or a fiscal year boundary moves a big contract between years. When the choice changes the story, say so plainly in your note: state which reading you used, what the key figure would be under the other one, and why you chose as you did. That single paragraph turns a potential rejection into a fast approval, because the operator can resolve the ambiguity without sending the task back. Flagging a fork in the road is always better than guessing and hoping you took the branch the client meant."
          }
        ],
        "keyPoints": [
          "A better method delivered silently is still a method error.",
          "Decide open questions, write each decision down as you make it.",
          "When a choice flips the result, show both readings in your note.",
          "Suggestions belong in the operator note, never in silent deviations."
        ]
      },
      {
        "title": "Categorizing Without Drift",
        "minutes": 5,
        "sections": [
          {
            "heading": "Rules before rows",
            "body": "Categorize 500 support tickets by root cause is really an instruction to make five hundred consistent decisions. Consistency does not come from concentration; it comes from written rules. Before you touch row one, skim thirty or forty tickets, draft your buckets, and write a one-line definition for each: what belongs, what does not, and one example. Password reset requests go to Account Access, not Billing, even when the user mentions an invoice. That sentence, written in advance, is worth more than an hour of careful judging later, because hour four of a five-hundred-row job does not judge the way hour one does. The rules do the judging so your tired self does not have to."
          },
          {
            "heading": "An honest Other",
            "body": "Every categorization needs an Other bucket, and every Other bucket wants to grow. Keep it honest with two properties. First, it has a definition like any other bucket: tickets that match no defined root cause, not tickets I was unsure about. Unsure means your rules need a sharper line, so sharpen the rule and re-decide. Second, it stays small. As a working rule, when Other passes roughly one row in ten, stop: some pattern inside it is recurring, and that pattern deserves its own bucket. An Other at thirty percent is not a category; it is an unfinished job. Name the new bucket, write its rule, re-sort, and say what you did in your delivery note."
          },
          {
            "heading": "Drift, and the second pass",
            "body": "Your understanding of the data improves as you work, and that is a problem as much as a gift. The billing bucket you defined at row one is not the bucket you are applying at row four hundred, unless you actively hold it still. Whenever you refine a rule mid-job, update the written definition first, then keep going. And before delivery, make a second pass over the rows you categorized earliest, checking them against the final rules. Early rows judged by early rules are where inconsistency hides. The second pass is fast, because you are checking, not deciding, and it is the difference between a sheet that survives a spot check and one that fails on row twelve."
          }
        ],
        "keyPoints": [
          "Write bucket definitions before row one. Rules judge better than tired eyes.",
          "Other means matches no defined cause, never means I was unsure.",
          "Other past one row in ten signals a missing bucket.",
          "After rules change, re-check the earliest rows against the final definitions."
        ]
      },
      {
        "title": "Pivot Craft and Sanity Checks",
        "minutes": 5,
        "sections": [
          {
            "heading": "A pivot you can defend",
            "body": "A pivot table is the fastest route to a trend sheet and the fastest route to a quiet error. Three checks make it defensible. First, the source range: it must cover every row, including rows added late, so re-check the range after any edit to the data. Second, the grand total: it must equal your control total from the untouched source. If it does not, the gap is usually a lingering filter or blank cells in the field you grouped by, and blanks must appear as a visible group, not vanish. Third, date grouping: confirm the tool grouped months and years the way you intended, because a misread date column can shift whole months into the wrong year without warning."
          },
          {
            "heading": "Three checks that catch most errors",
            "body": "Run three sanity checks on every summary before delivery. Order of magnitude: if monthly revenue has run around 40,000 and one month reads 400,000, something is wrong with the data or with you, and you find out which before the operator does. Sums of parts: category subtotals must add to the grand total, and each year of a three-year sheet must add across its months. Year-over-year signs: if your sheet says sales grew, the raw yearly sums must actually rise. These checks take five minutes and catch shifted decimal points, double-counted rows, and misgrouped dates, which between them cause most rejected deliveries in this category."
          },
          {
            "heading": "When a check fails",
            "body": "A failed sanity check means one of two things: you made an error, or the data really is strange. Trace the figure back to its source rows and find out which. If it was your error, fix it and re-run every check. If the data genuinely contains the spike, the spike is the finding, and it goes in your delivery with a note naming the rows behind it. What you must never do is smooth it, cap it, exclude it, or average it away to make the sheet look sensible. An adjusted figure no longer reconciles to the source, and that is the exact definition of a dispute you lose. Strange but true beats smooth but false, every time."
          }
        ],
        "keyPoints": [
          "Pivot grand totals must equal the control totals from the untouched source.",
          "Blanks appear as a visible group, never silently dropped.",
          "Check magnitudes, sums of parts, and year-over-year signs before every delivery.",
          "A true spike is a finding. A smoothed spike is a lost dispute."
        ]
      },
      {
        "title": "Deliver Arithmetic, Not Opinion",
        "minutes": 5,
        "sections": [
          {
            "heading": "Where reporting ends and editorializing begins",
            "body": "Your trend sheet shows sales falling for six straight months, starting the month a price increase took effect. Sales fell 18 percent from March to August is reporting: it is arithmetic anyone can re-derive. The price increase caused the decline is editorializing: it is a causal claim the data alone cannot prove, and it does not belong in the deliverable unless the brief asked for interpretation. The line is simple to test. If a figure and a formula can back the sentence, it is reporting. If the sentence needs a theory, it is opinion. When you genuinely see something the client should know, put the observation in your note to the operator and let them decide whether it travels further."
          },
          {
            "heading": "Show your work",
            "body": "The operator must be able to re-derive any figure you deliver without asking you a single question. That takes a short methods note alongside the sheet: which file you started from, the control totals you recorded, the steps you ran in order, the formulas or pivot settings behind each summary figure, and every open choice you made with the option you picked. This is not busywork; it is the evidence side of the dispute standard. Reconciliation you cannot demonstrate might as well not exist. A delivery with a methods note gets approved on the operator's first pass. A bare sheet of numbers, however correct, invites a revision request just to establish where the numbers came from."
          },
          {
            "heading": "The data was never yours",
            "body": "Everything in this course happens inside files a client trusted us with, so the confidentiality rules are part of the method. Client files never leave the task. Do not upload the data to converters, cloud viewers, or AI tools to speed up categorization or summarizing, unless the brief itself says to. Anonymizing rows first does not make it allowed. Work in the files provided, deliver through the platform, and when the task is approved, delete every local copy, including your scratch versions and control-total notes that quote the data. Keeping a sample for your portfolio is the same breach as sharing one. The habit is simple: when the task ends, nothing of the client's remains with you."
          }
        ],
        "keyPoints": [
          "If a formula can back the sentence, it is reporting. Otherwise it is opinion.",
          "Observations for the client go in the operator note, not the deliverable.",
          "A methods note is how reconciliation gets proven, not just achieved.",
          "Client data never enters outside tools, and nothing remains after approval."
        ]
      }
    ],
    "exam": {
      "questions": [
        {
          "prompt": "You deliver a three-year trend sheet showing sales declining every quarter. The figures tie to the source and follow the stated method. The client is unhappy and asks the operator to reject the delivery because the numbers must be wrong. What is your position?",
          "options": [
            "Offer to re-run the analysis with a method more likely to show growth.",
            "Accept the rejection; the client is the final judge of whether the numbers are right.",
            "The delivery stands: a conclusion the client disagrees with is not a dispute ground when figures reconcile and the method was followed.",
            "Remove the declining quarters and deliver only the periods the client will accept."
          ],
          "correct": 2,
          "explain": "The dispute standard is explicit: disputes turn on reconciliation and method, both checkable. A disliked but accurate result is defensible; altering it would create a real error."
        },
        {
          "prompt": "The source file has 4,960 order rows. Your finished pivot summary shows a grand total of 4,812 orders. Everything else looks ready to deliver. What do you do first?",
          "options": [
            "Find the 148 missing rows; check for filters, blanks in the grouping field, and text-stored numbers before delivering.",
            "Deliver the sheet and mention in the note that totals are approximate.",
            "Add 148 to the grand total so it matches the source count.",
            "Deliver as is; pivot tables are reliable and the source probably contains errors."
          ],
          "correct": 0,
          "explain": "A gap always has specific rows behind it, usually a filter or blanks. Delivering unreconciled totals, or forcing them to match, is exactly the arithmetic error QC exists to catch."
        },
        {
          "prompt": "While summarizing sales data you find March appears twice with identical rows, inflating that month. The brief says nothing about handling bad data. What do you do?",
          "options": [
            "Delete one copy of March quietly; the client obviously does not want duplicates.",
            "Skip March entirely and note that the month was unusable.",
            "Deliver the inflated figures without comment; the source is the client's responsibility.",
            "Apply the stated method to the data as given and list the duplication, with row references, in your delivery note."
          ],
          "correct": 3,
          "explain": "You report the source faithfully and flag the anomaly so the operator can decide. Silently fixing or hiding a source problem converts the client's data issue into your method error."
        },
        {
          "prompt": "The brief says compare shipping costs across three carriers using cost per kilogram. Halfway through, you are convinced cost per shipment reflects reality better for this client. What do you do?",
          "options": [
            "Switch to cost per shipment and explain the improvement in your delivery note.",
            "Deliver cost per kilogram as stated, and suggest the alternative measure in your note to the operator.",
            "Rebuild the deliverable around both measures so the client can choose the better one.",
            "Deliver cost per shipment; the standard only requires that a consistent method was used."
          ],
          "correct": 1,
          "explain": "The stated method is the contract; a smarter method delivered silently is still a method error. Suggestions travel through the operator note, never through silent deviation."
        },
        {
          "prompt": "The brief asks for a trend sheet covering three years of sales but does not say calendar years or the most recent 36 months. The two readings produce noticeably different year totals. How do you proceed?",
          "options": [
            "Use the more standard reading, state it in your note, and show how the key totals differ under the other reading.",
            "Pick whichever reading is faster to build and move on; the difference is the client's problem.",
            "Build the full sheet both ways and deliver two complete versions without comment.",
            "Release the claim; a task with an ambiguous brief cannot be delivered safely."
          ],
          "correct": 0,
          "explain": "An open choice becomes safe when written down. Showing both key totals lets the operator resolve the ambiguity without a revision cycle; silent guessing and releasing both cost you more."
        },
        {
          "prompt": "Eighty tickets into categorizing 500 by root cause, you realize your Billing bucket mixes two distinct causes: payment failures and invoice disputes. What is the right move?",
          "options": [
            "Keep the single Billing bucket; changing definitions mid-task breaks consistency.",
            "Split the bucket for the remaining 420 tickets and leave the first 80 as they are.",
            "Update the written definitions, split the bucket, and re-check the first 80 tickets against the final rules.",
            "Move all 80 Billing tickets to Other and continue with the new buckets."
          ],
          "correct": 2,
          "explain": "Rules may improve mid-job, but early rows judged by early rules are where inconsistency hides. A second pass over them keeps all 500 decisions aligned with the final definitions."
        },
        {
          "prompt": "You finish categorizing 500 tickets. Other holds 140 of them. Most of the 140 mention a recent app update. The deadline is close. What do you do?",
          "options": [
            "Deliver as is; Other exists precisely so unusual tickets have somewhere to go.",
            "Create a bucket for the app-update pattern, re-sort the 140, and mention the added bucket in your note.",
            "Distribute the 140 tickets among the existing buckets by best fit to shrink Other.",
            "Delete the Other column so the sheet only shows clean, defined categories."
          ],
          "correct": 1,
          "explain": "Other past roughly one row in ten signals a missing bucket, and 28 percent is an unfinished job. A recurring pattern is exactly what root-cause categorization exists to surface."
        },
        {
          "prompt": "Your year-over-year summary shows revenue jumping from 42,000 to 410,000 in one year. The client is a small shop and nothing in the brief suggests a windfall. What do you do?",
          "options": [
            "Cap the outlier year at a plausible figure and note that you adjusted it.",
            "Exclude that year from the trend so the sheet stays believable.",
            "Deliver the number as computed; sanity checking the client's business is not your job.",
            "Trace the figure to its source rows; fix it if it is your error, deliver it with a note if real."
          ],
          "correct": 3,
          "explain": "A failed magnitude check means either your error or a real anomaly, and tracing decides which. Smoothing or excluding breaks reconciliation, the exact definition of a losing dispute."
        },
        {
          "prompt": "Your pivot's grand total is short of the control total. You find the region field has blank cells and the pivot filter is excluding those rows. How do you handle the blank rows?",
          "options": [
            "Include them as a visible blank or unknown group so the grand total ties to the source.",
            "Leave them filtered out; rows without a region cannot be summarized meaningfully.",
            "Assign each blank row to the region that appears most often in the data.",
            "Delete the blank rows from the source so the totals match cleanly."
          ],
          "correct": 0,
          "explain": "Blanks must appear as a visible group, never vanish. Filtering, guessing, or deleting rows all break the tie between your summary and the source data."
        },
        {
          "prompt": "The brief asks you to summarize three years of sales into a trend sheet, nothing more. You notice sales dropped sharply the month a price increase appears in the data. Where, if anywhere, does that observation go?",
          "options": [
            "Into the trend sheet as an annotation, so the client sees the likely cause.",
            "Nowhere; noticing patterns beyond the requested summary is outside your task.",
            "Into your delivery note to the operator; the deliverable itself stays arithmetic only.",
            "Into a short recommendations section suggesting the client revisit their pricing."
          ],
          "correct": 2,
          "explain": "A causal claim needs a theory, not just a formula, so it is opinion and stays out of the deliverable. The operator note is the channel for observations worth passing on."
        },
        {
          "prompt": "Two deliveries contain identical, correct trend sheets. One is approved on the operator's first pass; the other triggers a revision request. What most likely made the difference?",
          "options": [
            "Better formatting and chart styling in the approved delivery.",
            "The approved worker delivered faster, so QC trusted the work more.",
            "The approved delivery included a written summary of what the trends mean for the business.",
            "A methods note with control totals, steps, and open choices, letting the operator re-derive every figure."
          ],
          "correct": 3,
          "explain": "Reconciliation you cannot demonstrate might as well not exist. A methods note lets the operator verify figures without questions; a bare sheet invites a revision just to establish origins."
        },
        {
          "prompt": "You are categorizing 500 support tickets and realize a free AI tool could classify them in minutes. The brief does not mention outside tools. The tickets contain customer names and emails. What do you do?",
          "options": [
            "Remove names and emails first, then paste the tickets into the tool.",
            "Categorize inside the provided file yourself; client data leaves the task only when the brief says so.",
            "Use the tool, then delete the pasted data from it after delivering.",
            "Use the tool but spot-check its output so accuracy is not affected."
          ],
          "correct": 1,
          "explain": "Client files never leave the task. Uploading to outside services, even anonymized or temporarily, is a confidentiality breach regardless of how accurate or fast the result is."
        }
      ]
    }
  },
  "writing": {
    "slug": "writing",
    "title": "Writing",
    "track": "category",
    "tagline": "Write to spec, not to taste: length, tone, format, and only the facts supplied.",
    "summary": "This course teaches the judgement behind paid writing tasks: treating length, tone, and format as hard constraints, and never stating a fact the brief did not supply. You learn to match a client's voice from their examples, keep templates and batches consistent, and rewrite dense text without changing its meaning. By the end, you can self-edit against the same standard the operator uses at QC.",
    "outcomes": [
      "You can read length, tone, and format requirements as hard constraints and meet them.",
      "You can trace every factual claim to the brief and flag gaps instead of filling them.",
      "You can match a client's tone from supplied examples instead of your own style.",
      "You can draft email templates whose merge fields survive any recipient.",
      "You can rewrite dense text in plain language without changing a single fact.",
      "You can hold twelve pieces to one pattern and catch drift before QC does."
    ],
    "lessons": [
      {
        "title": "The Spec Is the Job",
        "minutes": 5,
        "sections": [
          {
            "heading": "Taste is not the standard",
            "body": "Writing feels personal, so new writers assume the goal is to impress. It is not. Every writing delivery is judged against one fixed standard: it matches the requested length, tone, and format, and makes no factual claim the brief didn't supply. Style preference alone is not a dispute ground. That sentence cuts both ways. If your delivery meets the spec, a client who simply would have phrased things differently has no grounds to reject it. And if you miss the spec, no amount of elegant prose saves the delivery. The client bought a specific piece of writing, defined in advance. Your job is to produce exactly that piece, in their voice, from their facts. Impressiveness is what happens when you hit the spec cleanly, not a separate goal."
          },
          {
            "heading": "Requirements are constraints, not suggestions",
            "body": "Read the brief the way you would read a form. Under 100 words means 100 is the ceiling, not the target zone. Around 100 words gives you room, maybe 85 to 115, but 160 is a miss. Format instructions are just as hard: if the brief asks for a heading, two sentences, and three bullet-style feature lines per product, a delivery with flowing paragraphs fails even if it reads beautifully. Tone words like casual or formal are constraints too, and we cover how to pin them down in a later lesson. Before you write anything, pull every requirement out of the brief and list the numbers, formats, and tone words. That list is your contract. Everything you draft gets checked against it, not against your own sense of good."
          },
          {
            "heading": "When the spec is unclear",
            "body": "Briefs are written by busy people and sometimes leave gaps or contradict themselves. You never contact the client; the operator sits between you, and your channel to the operator is the note you attach when you deliver. So sort problems by size. If a contradiction blocks the whole task, say the brief demands a word count its own example ignores, do not silently pick a side. Choose the reading that best fits the client's supplied materials, then state in your delivery note what conflicted and what you chose. If the gap is small, make the safest spec-compliant choice and note the assumption. A stated assumption is a professional judgement. A silent guess that turns out wrong is a QC rejection, and rejections sit on your record."
          }
        ],
        "keyPoints": [
          "Deliveries are judged on length, tone, format, and facts, never on the reviewer's taste.",
          "Every number and format word in a brief is a hard constraint.",
          "Pull the requirements into a list before drafting; check the draft against it.",
          "A stated assumption in your delivery note beats a silent guess every time."
        ]
      },
      {
        "title": "Facts You Can Point To",
        "minutes": 5,
        "sections": [
          {
            "heading": "The traceability test",
            "body": "The second half of the standard says your delivery makes no factual claim the brief didn't supply. The test is simple: for every factual statement you write, you should be able to point at the line in the brief or the attached materials it came from. Stainless steel housing traces to the spec sheet. Free shipping traces to nothing unless the client said it, so it does not go in. This rule exists because you cannot verify anything yourself. You have never held the product, called the support line, or seen the warranty terms. The client has, and their materials are the record of what they are willing to claim. Writing beyond that record puts words in their mouth, and they are legally responsible for every one."
          },
          {
            "heading": "Describing versus embellishing",
            "body": "Describing restates a supplied fact; embellishing asserts a new one. Stainless steel housing is a description. Industry-leading durability is an invented claim about the whole market. The trap is that embellishment sounds like normal marketing, so it feels safe. It is not. Waterproof, hypoallergenic, bestselling, doctor-recommended, longest-lasting: each of these is a factual assertion someone could test and dispute. You can still write vivid copy inside the rule. Rephrase freely, reorder freely, choose strong plain verbs, and let supplied facts do the selling. A 1.7 liter capacity can become enough for seven cups, because that is arithmetic, not invention. A useful check for any adjective: is this a fact from the materials, or a compliment I added? Compliments that assert facts come out."
          },
          {
            "heading": "Gaps, and where sources end",
            "body": "When a fact you need is missing, the answer is never to fill the gap yourself. Do not copy the field from a similar product, and do not search the web for the answer. The manufacturer's site might describe a different model year, and either way the client did not supply it, so it fails the traceability test. Describe around the gap and flag it in your delivery note. Sources end at the task boundary in the other direction too. Client materials are confidential: do not paste spec sheets or client text into AI tools, translators, or any third-party service unless the brief tells you to, do not keep copies after delivery, and never reuse a client's text as a sample of your work."
          }
        ],
        "keyPoints": [
          "Every factual statement must trace to a line in the brief or attached materials.",
          "Describing restates a supplied fact; embellishing invents a new one.",
          "Marketing adjectives like waterproof or bestselling are factual claims, not decoration.",
          "Fill no gaps: not from similar products, not from the web. Flag them.",
          "Client files stay inside the task: no AI tools, no copies, no samples."
        ]
      },
      {
        "title": "Matching a Voice That Is Not Yours",
        "minutes": 5,
        "sections": [
          {
            "heading": "Examples outrank adjectives",
            "body": "Most briefs describe tone in adjectives: friendly, professional, warm, authoritative. Adjectives are ambiguous. Your friendly and the client's friendly can be two different registers, and only one of them passes QC. When the client attaches examples, existing pages, past emails, a sample description, the examples are the real tone spec, and the adjectives are just a summary of them. If the brief says professional but the attached posts are relaxed and joke occasionally, write relaxed with occasional jokes. When there are no examples, look at anything else the client supplied, even the brief's own wording, and steer to the middle of the adjective rather than your favorite end of it. Tone is a requirement of the standard, which means missing it is a legitimate dispute ground."
          },
          {
            "heading": "Reading a tone profile",
            "body": "You can turn an example into a checkable profile in five minutes. Look at sentence length: mostly under 15 words, or long and layered? Contractions: do they write it's and you'll, or it is and you will? Person: do they address the reader as you, speak as we, or stay impersonal? Vocabulary: everyday words or technical terms? Punctuation habits: dashes, questions, one-word sentences? Formality tells: humor, slang, exclamations, or none of them? Write your answers down as a short profile and keep it beside you while drafting. Now tone is not a feeling you are chasing but six observable habits you can imitate, and later verify. When your draft is done, check it against the profile the same way you check word count against the brief."
          },
          {
            "heading": "The slide-in test",
            "body": "The finished test for tone is substitution. Put a paragraph of your draft next to a paragraph of the client's example and read both aloud. If a stranger could not tell which writer produced which, you matched. If your paragraph stands out, find the habit that gives you away. Usually it is one of three things: your sentences run longer than theirs, your vocabulary is more formal than theirs, or you dropped their contractions under pressure. Fix the habit across the whole delivery, not just the paragraph you tested, because tone drift is systematic. And resist improving their voice. If the client writes flat, correct sentences with no flair, deliver flat, correct sentences with no flair. The moment your writing is recognizably yours, it is off spec."
          }
        ],
        "keyPoints": [
          "Client examples are the real tone spec; adjectives only summarize them.",
          "Turn an example into a profile: sentence length, contractions, person, vocabulary, punctuation, formality.",
          "Test by substitution: your paragraph should slide into their page unnoticed.",
          "Never improve the client's voice; recognizably yours means off spec."
        ]
      },
      {
        "title": "Template and Merge-Field Discipline",
        "minutes": 5,
        "sections": [
          {
            "heading": "Written for everyone at once",
            "body": "A template is a strange kind of writing: one draft, many readers, none of whom you can see. Every sentence must be true for all of them. A line about your recent demo works only if every recipient had a demo. A reference to a Manila trade show is false for anyone who was not there. So before any detail goes into a template, ask who it will be sent to. If the answer varies, the detail either becomes generic, moves behind a merge field, or comes out. This is the template version of the no-invented-claims rule: a claim that is true for one recipient and false for another is an invented claim for the second one."
          },
          {
            "heading": "Merge-field hygiene",
            "body": "Merge fields are code, not text. The client's email system looks for exact characters, so {{FirstName}} and {{first_name}} are different fields, and only one exists in their system. Copy field names character for character from the brief or the client's example, including braces, capitals, and underscores. Never invent a new field; if the templates need one the brief does not mention, draft without it and suggest it in your delivery note. Then check the grammar around every field. Each sentence has to survive any plausible value, short or long. The line As a {{JobTitle}}, you know hiring is hard reads fine when the value is recruiter and turns ungrammatical when it is Sales Operations. Reread every line imagining the longest and strangest value the sales team might put in."
          },
          {
            "heading": "Six templates, one system",
            "body": "A set of follow-up templates is one product, not six. They share a voice, follow the format the brief sets, and make sense as a sequence: a second follow-up should acknowledge more time has passed than the first, and the final one can close the loop politely. But each must also stand alone, because you cannot know which ones the team will send. Never let template four depend on the recipient having read template two. Vary the openings so a recipient who receives three does not read the same first line three times, while keeping structure and voice identical. Before delivering, read all six top to bottom in one sitting. Sequence problems, repeated phrases, and voice drift are invisible one template at a time and obvious in one read."
          }
        ],
        "keyPoints": [
          "Every template sentence must be true for every possible recipient.",
          "Copy merge-field names exactly; never invent a field the brief does not define.",
          "Every sentence around a merge field must survive the longest, strangest real value.",
          "A template set shares voice and sequence, but each email stands alone."
        ]
      },
      {
        "title": "Plain Language, Full Meaning",
        "minutes": 5,
        "sections": [
          {
            "heading": "What the rewrite actually changes",
            "body": "A plain-language rewrite has one promise: same facts, easier reading. In practice that means roughly half the words, sentences under about 20 words, everyday vocabulary, and active voice, so the text lands one reading level lower. Everything else is preserved. You are changing the packaging of the information, never the information. That distinction is the whole task. Purchases may be returned within a 30-day window upon presentation of proof of purchase becomes Return items within 30 days with your receipt. Fourteen words became eight, the reading level dropped, and both sentences commit the client to the same policy. If your rewrite is shorter and simpler but commits the client to something different, you have not simplified the FAQ. You have rewritten their policy, which was never yours to touch."
          },
          {
            "heading": "Conditions are facts",
            "body": "The facts most often lost in simplification are not the headline statements but the qualifiers hanging off them. Within 30 days. With a receipt. Unused items only. Except sale items. Usually. Up to. Each qualifier changes what the client is promising, which makes each one a fact under the standard. Refunds within 30 days with a receipt simplified to refunds within 30 days is not shorter writing, it is a bigger promise. The same trap runs the other direction: do not sharpen soft statements into hard ones. We usually reply within one business day must keep its usually, because dropping it converts a tendency into a guarantee. Before delivering a rewrite, list every number, condition, exception, and hedge in the original, then confirm each one survived."
          },
          {
            "heading": "Plain does not mean casual",
            "body": "Plain language is a clarity level, not a tone. An FAQ for a bank can be plain and still formal; an FAQ for a game can be plain and playful. So the tone rules from earlier still apply: match the client's examples, or the voice of the pages they are keeping, unless the brief says the rewrite should also change the voice. Watch two more traps. Jargon sometimes is the fact: if the original names a specific plan tier, legal term, or product name, keep the term and explain it in plain words beside it, rather than replacing it with a looser word. And keep the structure the brief asks for. If the FAQ format is question and answer, plain answers live under the same questions unless told otherwise."
          }
        ],
        "keyPoints": [
          "Plain language changes the packaging of information, never the information.",
          "Qualifiers are facts: every number, condition, exception, and hedge must survive the rewrite.",
          "Never sharpen a soft statement into a promise the client did not make.",
          "Plain is a clarity level, not a tone; the voice spec still applies."
        ]
      },
      {
        "title": "Batches, Drift, and the Final Pass",
        "minutes": 6,
        "sections": [
          {
            "heading": "Why batches drift",
            "body": "Twelve product descriptions written across one shift are twelve chances to drift. Early items follow the sample closely because you keep checking it. By item eight you trust your memory, and your own habits leak in: openings change shape, sentence rhythm shifts, a feature that was a phrase in item two becomes a full sentence in item ten. No single item is wrong, but the client will paste all twelve onto one page, where the inconsistency is the first thing anyone sees. Treat the batch as one deliverable with twelve parts. Lock the pattern before you scale it: write the first item, check it against the sample and the brief, and only then produce the rest, re-reading the first item and the sample at regular intervals as you go."
          },
          {
            "heading": "What consistency means concretely",
            "body": "Consistency is checkable, not a vibe. Same structure: information appears in the same order in every item, name, key feature, details, close. Same shape: if item one is a heading plus two sentences plus three feature lines, so is item twelve. Same grammar decisions: one tense, one person, features phrased the same way, either all sentence fragments or all full sentences, never a mix. Same conventions: units, capitalization, and number formatting identical throughout, 1.7 L in one item and 1.7 liters in another is drift. Same voice, held to the tone profile from lesson three. A quick test: read items one and twelve back to back, skipping the middle. If they read like the same writer on the same day, the batch holds."
          },
          {
            "heading": "Edit in passes, deliver with a note",
            "body": "Self-editing works when each pass hunts one kind of problem. First a spec pass: word counts counted, format checked element by element, every brief requirement ticked off your list. Second a fact pass: every claim traced to its source line, every flagged gap still flagged. Third a consistency pass across the batch, structure, conventions, voice. Only then polish sentences. This order matters because QC reads in the same spirit: a beautiful description at the wrong length still fails. Then write the delivery note. State any assumptions you made, any gaps or conflicts you found, and anything the operator should check first. Keep it short and factual. A good note turns a rejection into a quick decision. After approval, delete your local copies; the work belongs to the client now."
          }
        ],
        "keyPoints": [
          "Lock the pattern with item one, then hold every later item to it.",
          "Consistency is checkable: same structure, shape, grammar decisions, conventions, and voice.",
          "Edit in passes: spec first, facts second, consistency third, polish last.",
          "The delivery note states assumptions, gaps, and conflicts; short and factual.",
          "After approval, delete local copies; the work belongs to the client."
        ]
      }
    ],
    "exam": {
      "questions": [
        {
          "prompt": "The brief asks for product descriptions of 80 to 100 words each. Your draft of one runs 130 words, and you think every sentence earns its place. What do you do?",
          "options": [
            "Deliver it at 130 words with a note explaining why the extra length improves the description.",
            "Deliver at 130 words and trim only if the operator asks for a revision.",
            "Make other descriptions shorter so the batch averages out to the requested length.",
            "Cut it to 80 to 100 words, keeping the facts the spec sheet supplies."
          ],
          "correct": 3,
          "explain": "Length is a hard constraint, not a suggestion. A delivery outside the requested length fails the dispute standard no matter how good the extra sentences are."
        },
        {
          "prompt": "A spec sheet says a kettle has a stainless steel housing and a 1.7 liter capacity. Nothing else is attached. Which sentence can you write?",
          "options": [
            "The stainless steel housing holds 1.7 liters.",
            "Built to last for years, this kettle outperforms cheaper rivals.",
            "Its 1.7 liter capacity is the largest in its class.",
            "The rust-proof stainless housing keeps water hotter for longer."
          ],
          "correct": 0,
          "explain": "Only the first sentence limits itself to supplied facts. Durability, class comparisons, rust-proofing, and heat retention are invented claims, even though they sound like ordinary marketing."
        },
        {
          "prompt": "You are writing 12 descriptions from spec sheets. One sheet is missing the material field, and the other 11 products are all listed as cotton. What do you do?",
          "options": [
            "Write cotton for it too, since the product line is clearly consistent.",
            "Find the product on the manufacturer's website and use the material listed there.",
            "Describe it without a material claim and flag the missing field in your delivery note.",
            "Release the claim, since the task cannot be completed as briefed."
          ],
          "correct": 2,
          "explain": "A pattern is not a source, and neither is the web; the brief and attachments are. Flag the gap, because a guessed claim is an invented claim."
        },
        {
          "prompt": "The brief says friendly but professional and attaches two blog posts the client wrote. The posts use contractions, short sentences, and address the reader as you. Your natural style is more formal. How do you set the tone?",
          "options": [
            "Follow the adjectives and write your own idea of friendly but professional.",
            "Match the posts: contractions, short sentences, direct address to the reader.",
            "Write formally, since professional is the safer reading for business content.",
            "Blend their style with yours so the writing feels natural to produce."
          ],
          "correct": 1,
          "explain": "Supplied examples define what the client's adjectives mean. When examples and your instincts disagree, the examples win; tone is a spec, not a preference."
        },
        {
          "prompt": "A brief for six email templates shows one example using the merge field {{FirstName}}. Drafting the others, you want a field for the recipient's company, but the brief never mentions one. What do you do?",
          "options": [
            "Create {{Company}} to match the existing naming style and use it where needed.",
            "Write [COMPANY] in brackets so the sales team notices it and fills it in.",
            "Type a sample company name and trust the client to replace it per recipient.",
            "Draft without a company field and suggest adding one in your delivery note."
          ],
          "correct": 3,
          "explain": "You never invent merge fields. A field the client's system does not recognize can break the merge or send broken text. The note lets the operator decide."
        },
        {
          "prompt": "Drafting follow-up templates for a sales team, you see the client's example mentions a great conversation at a Manila trade show. Your templates will be sent to many different recipients. What do you do with that detail?",
          "options": [
            "Generalize it or move it behind a merge field, since a template must be true for every recipient.",
            "Keep it; it appears in the client's own example, so it is approved content.",
            "Keep the sentence but vary the city across the six templates.",
            "Copy the sentence exactly so your tone matches the example."
          ],
          "correct": 0,
          "explain": "A template is read by every recipient at once. A detail true for one contact is false for the rest; anything that varies gets generalized or merged."
        },
        {
          "prompt": "You are rewriting an FAQ in plain language. The original says refunds are issued within 30 days of purchase, provided the item is unused and proof of purchase is retained. Which rewrite is acceptable?",
          "options": [
            "You can get a refund within 30 days of purchase.",
            "Unused item plus your receipt gets you a refund within 30 days of purchase.",
            "We offer hassle-free refunds on most purchases.",
            "Return anything within a month and get your money back."
          ],
          "correct": 1,
          "explain": "Plain language keeps every condition. The other rewrites drop the unused and proof-of-purchase requirements, which changes the policy. That is a factual change, not a style choice."
        },
        {
          "prompt": "The FAQ you are simplifying says: We usually respond within one business day. Which version can you deliver?",
          "options": [
            "We usually reply within one business day.",
            "We reply within one business day.",
            "We guarantee a reply within 24 hours.",
            "We reply fast, usually the same day."
          ],
          "correct": 0,
          "explain": "Usually is part of the fact. Dropping it turns a tendency into a commitment the client never made, and same day changes the stated timeframe."
        },
        {
          "prompt": "Halfway through 12 product descriptions, you notice your recent drafts open with a question, while the first five open with the product name, matching the client's sample. What do you do?",
          "options": [
            "Keep both patterns; variety stops a category page from feeling repetitive.",
            "Rewrite the first five as questions, since your writing improved as you went.",
            "Rewrite the recent openings to match the sample's pattern used in the first five.",
            "Alternate the two patterns evenly across the full batch of 12."
          ],
          "correct": 2,
          "explain": "The client's sample sets the pattern, and batch consistency means every item follows it. Drift toward your own habits is exactly what a consistency pass exists to catch."
        },
        {
          "prompt": "You have 20 minutes left before delivering a batch of descriptions and time for one more pass. Which pass matters most?",
          "options": [
            "A polish pass to strengthen word choice and rhythm.",
            "A fresh read hunting for typos.",
            "Rewriting the weakest description from scratch.",
            "A spec pass: word counts, format, and required elements checked against the brief."
          ],
          "correct": 3,
          "explain": "QC judges against the dispute standard: length, tone, format, and facts. A missed hard constraint fails the delivery outright; polish problems and typos rarely do."
        },
        {
          "prompt": "The brief says every description must mention the two-year warranty. The attached spec sheets all list a one-year warranty. What do you do?",
          "options": [
            "Use two years; the brief is the instruction you were given.",
            "Use one year; the spec sheets are the factual source.",
            "State the conflict in your delivery note, saying which figure you used and why.",
            "Leave the warranty out of all 12 so you make no false claim."
          ],
          "correct": 2,
          "explain": "A factual conflict is not yours to resolve silently. Surfacing it lets the operator check with the client; a silent pick either way risks 12 wrong claims."
        },
        {
          "prompt": "A spec sheet's technical wording is dense, and a free AI rewriting tool would speed you up. The brief says nothing about AI tools. What does confidentiality require?",
          "options": [
            "Use it; the platform allows free tools for writing tasks.",
            "Keep the client's files inside the task and do the rewriting yourself.",
            "Paste a single product's sheet as a test before deciding.",
            "Use the tool, then delete the conversation when you finish."
          ],
          "correct": 1,
          "explain": "Client files never leave the task. Uploading them to any third-party service, including AI tools, is barred unless the brief says to, no matter how you clean up afterward."
        }
      ]
    }
  },
  "document-production": {
    "slug": "document-production",
    "title": "Document production",
    "track": "category",
    "tagline": "Rebuild documents in a new template without changing a single word.",
    "summary": "Document production means moving content into a new shape without changing the content itself. This course teaches the judgement behind that line: what you may touch, what you must flag, and how to keep a 90-page rebuild consistent from first page to last. You will finish able to convert, assemble, and verify documents to the exact standard the operator judges your deliveries against.",
    "outcomes": [
      "You can preserve source content exactly while rebuilding a document in a new template.",
      "You can map source structure to template styles before converting a single page.",
      "You can run consistency sweeps that catch drift in fonts, spacing, numbering, and captions.",
      "You can assemble multiple documents into one packet with continuous numbering and a working contents page.",
      "You can prove completeness with a tally that accounts for every source item.",
      "You can flag doubtful content instead of quietly fixing it."
    ],
    "lessons": [
      {
        "title": "Formatting Is the Job, Content Is Untouchable",
        "minutes": 4,
        "sections": [
          {
            "heading": "The line you never cross",
            "body": "The standard in this category is exact: the rebuilt or reformatted document preserves all source content exactly, in the requested template, with consistent formatting throughout. Content changes were not requested and are a dispute ground in either direction. That sentence is what we judge every delivery in this category against, so read the last part twice. Either direction means changing a word is a dispute ground, and so is dropping one. You were hired to change how the document looks. The words, the numbers, the order of ideas — those belong to the client, and they leave your hands exactly as they arrived."
          },
          {
            "heading": "Why you do not fix typos",
            "body": "On page 12 the source says the the project team. Every instinct says delete the extra word. Do not. You cannot know what is an error and what is deliberate. A price that looks wrong may include a discount you were never told about. A misspelled product name may be the actual product name. A sentence that reads badly may be legal wording that survived three reviews. The moment you correct one thing, you have decided you know the client's intent better than the client does, on a job where you have never spoken to the client. Reproduce the source exactly, including its flaws."
          },
          {
            "heading": "Flag it, do not fix it",
            "body": "Preserving an error does not mean hiding it. When you spot something that looks wrong — a typo, a total that does not add up, a duplicated paragraph — reproduce it exactly, then list it in the note you send with your delivery. Give the page, quote the exact text, and say what looks off. Do not editorialize and do not fix. The operator decides what reaches the client. A delivery with three flagged oddities reads as careful work. A delivery with three silent corrections is a content change, and a dispute ground, no matter how right you were."
          }
        ],
        "keyPoints": [
          "You change how the document looks, never what it says.",
          "Either direction: altering content and dropping content are both dispute grounds.",
          "Typos, odd numbers, and duplicates get reproduced exactly and flagged in your delivery note.",
          "A silent correction is a content change, even when you are right."
        ]
      },
      {
        "title": "Styles, Not Hand Formatting",
        "minutes": 4,
        "sections": [
          {
            "heading": "What a template actually is",
            "body": "A template is not a look. It is a set of named decisions: what a first-level heading is, what body text is, what a caption is, stored as styles. Free word processors such as LibreOffice Writer and Google Docs all work this way. When the client sends their template, open it and read those decisions before you type anything. List the styles it defines and what each one is for. That inventory is the target you are converting into. Skip this step and you are not converting into their template; you are imitating its surface, and imitation drifts."
          },
          {
            "heading": "Why hand-bolding fails at ninety pages",
            "body": "Hand formatting means selecting a heading and making it bold, size sixteen, extra space above — by hand, two hundred times. By page 60 one heading is size fifteen, another lost its spacing, and a third is bold body text pretending to be a heading. Styles solve this structurally. Apply the heading style to every chapter title and they are identical by definition. If the template changes a heading font, one edit updates every heading at once. Styles also carry meaning: a table of contents is generated from heading styles. Hand-bolded headings are invisible to it, and your contents page comes out empty."
          },
          {
            "heading": "The discipline in practice",
            "body": "Working with styles is a habit, not a trick. Never format a heading directly; apply the template's heading style. If text refuses to look right, do not fight it with manual overrides — find which style is applied and fix the mismatch at the source. Keep manual formatting for the rare true one-off, and even then, doubt yourself first. On a 90-page rebuild, the worker who spends the first hour setting up and applying styles finishes faster and cleaner than the worker who starts formatting page one immediately. The setup is the work."
          }
        ],
        "keyPoints": [
          "A template is a set of named styles, not a look to imitate.",
          "Styles make two hundred headings identical by definition; hand formatting drifts.",
          "Tables of contents are built from heading styles; hand-bolded headings break them.",
          "Fix the style, never pile manual overrides on top."
        ]
      },
      {
        "title": "Map Before You Move",
        "minutes": 5,
        "sections": [
          {
            "heading": "The structure map",
            "body": "Before touching page one, read the whole source and write down its structure: how many heading levels, where tables sit, what repeats, what is unusual. A simple spreadsheet works — one row per element type, one column for the template style it maps to. This takes twenty minutes on a 90-page proposal and saves hours. Every decision you make while mapping is a decision you will not have to make two hundred times while converting. Conversion done without a map is a chain of small improvised choices, and improvised choices are never consistent."
          },
          {
            "heading": "Decide the hard cases once",
            "body": "The map exposes the hard cases early. The source has four heading levels; the template defines two. The source has sidebar boxes the template has no style for. Decide each case once, write the rule down, and apply it everywhere. When the brief does not settle a question that shapes the whole document, do not silently invent answers page by page. Pick one consistent rule, apply it throughout, and state the decision plainly in your delivery note so the operator can accept it or send a revision with a clear instruction. If the gap is so large the task cannot honestly be done, releasing the claim is better than delivering a guess."
          },
          {
            "heading": "Work in passes, not pages",
            "body": "With the map done, resist converting page by page to perfection. Work in passes across the whole document: first structure, with heading and body styles applied throughout, then tables and figures, then front matter, then the consistency sweep. Passes keep you in one kind of decision at a time, which is faster and far more consistent than switching between heading logic and table logic every two minutes. On multi-file tasks like 25 price sheets, the same rule applies at file level: settle your conversion rules on a sample of sheets before committing to the whole set."
          }
        ],
        "keyPoints": [
          "Map the source structure to template styles before converting anything.",
          "Decide hard cases once, apply everywhere, state the rule in your delivery note.",
          "Work in passes across the document, not page by page.",
          "On multi-file tasks, settle rules on a sample before converting the set."
        ]
      },
      {
        "title": "Catching Drift Before the Operator Does",
        "minutes": 5,
        "sections": [
          {
            "heading": "The page 60 problem",
            "body": "Drift is what happens between page one and page ninety. At page one you are careful. At page 60 you are tired, and the caption font quietly changes, a heading skips a number, the spacing above tables shrinks. Nobody decides to be inconsistent; it accumulates. The standard your delivery is judged against says consistent formatting throughout, and inconsistency is easiest to see in exactly the places you stopped seeing it. Assume drift happened. The question is not whether your document has it, but whether your process catches it before the operator does."
          },
          {
            "heading": "Sweeps beat vigilance",
            "body": "You cannot will yourself into noticing everything while converting. Instead, schedule dedicated sweeps after the conversion is done, one element per pass: one sweep for fonts, one for spacing, one for numbering, one for captions. Each sweep asks a single question across all pages, which is fast and hard to fool. Zoom the view out until pages appear as thumbnails; wrong fonts and broken spacing show up as texture changes even when the text is unreadable. And one symptom means a full pass: if you notice caption drift on page 60, sweep every caption, because noticed drift is proof of unnoticed drift."
          },
          {
            "heading": "Numbering, captions, references",
            "body": "Numbered things drift in their own way. Figure 7 follows Figure 5 because a figure was moved. Table captions switch style halfway through the document. A cross reference still says see page 42 when the content now sits on page 47. Sweep these as sequences: read only the figure numbers in order, then only the table numbers, then check every cross reference against its target. Where your tool can automate — generated numbering, reference fields — prefer automation for the same reason styles beat hand formatting: things maintained by the tool cannot drift."
          }
        ],
        "keyPoints": [
          "Drift accumulates when attention fades; assume it happened.",
          "Run one sweep per element: fonts, spacing, numbering, captions.",
          "Thumbnail view makes inconsistency visible as texture.",
          "Noticed drift on one page means a full sweep of that element."
        ]
      },
      {
        "title": "Assembly: Many Sources, One Document",
        "minutes": 5,
        "sections": [
          {
            "heading": "Running order is content",
            "body": "Assembling a board packet from 11 source documents starts with the running order. Treat the order as content: if the brief specifies it, follow it exactly, even when another order seems more logical to you. If the brief lists ten documents and you received eleven, do not drop the extra one and do not silently choose its place. Include everything, position the unlisted piece where it reasonably fits, and flag the gap in your delivery note. Dropped content is the worst outcome in this category; a flagged placement question costs the operator one decision."
          },
          {
            "heading": "Making eleven documents behave as one",
            "body": "A packet is judged as one document. Page numbers run continuously from cover to end, with no resets where source files were joined. One table of contents covers everything, built from heading styles, which is another reason the merged pieces must use styles rather than imported hand formatting. Add bookmarks per section so a reader can jump straight to item eight of a two hundred page packet. Headers and footers deserve special attention: source documents bring their own, and a leftover header still naming its old file is the classic sign of a rushed merge."
          },
          {
            "heading": "Seams are where errors live",
            "body": "Every junction between two source documents is a risk point. Check each seam deliberately: no leftover blank pages, no orphaned section breaks, no sudden font change where the next source begins, no header carried over from the previous document. Then do the last steps in the right order: finish all layout work first, then regenerate the table of contents, then verify its page numbers against the actual pages. A contents page generated before the final layout change is wrong by exactly the amount nobody checks."
          }
        ],
        "keyPoints": [
          "Running order is content: follow the brief exactly, flag gaps, drop nothing.",
          "Continuous page numbers, one contents page, bookmarks per section.",
          "Check every seam: leftover headers, breaks, and font shifts between sources.",
          "Regenerate the table of contents last, then verify it against actual pages."
        ]
      },
      {
        "title": "Prove Nothing Was Lost",
        "minutes": 5,
        "sections": [
          {
            "heading": "Page counts lie",
            "body": "A 90-page source can honestly become an 88-page delivery: tighter styles, different margins, smaller heading spacing. So matching page counts prove nothing, and mismatched counts prove nothing either. Completeness is counted in content, not pages: every section, every table, every figure, every appendix in the source appears in the delivery. This is what the structure map from your first hour is for. It was your plan going in; at the end it becomes your checklist coming out. Anything on the map without a confirmed destination is a dropped item, the single worst dispute in this category, because it is a content change in the deleting direction."
          },
          {
            "heading": "The tally before upload",
            "body": "Before uploading, run the tally: work down the structure map and confirm each item's location in the delivery. Sections in order, tables present, figures present with captions, appendices attached. Then write the delivery note. State what you verified — all sections, tables, and figures from the source are present — and list every flag: the typo on page 12, the total that does not add up, the mapping rule you chose for the third heading level. A specific note is not covering yourself; it is doing the operator's first QC pass for them, and it is why revisions come back rarely and small."
          },
          {
            "heading": "The files end with the task",
            "body": "Client documents live inside the task and nowhere else. While working: no uploading source files to online converters, format fixers, or AI tools unless the brief explicitly says to. A proposal or price sheet is confidential business information, and seconds on someone else's server is still a leak. Work with free local tools, and if a file defeats them, flag the problem rather than route around it through the browser. After approval: delete everything — the sources, your rebuilt version, and the structure map with their section titles in it. Nothing you produced becomes a sample, a template for the next task, or a portfolio piece."
          }
        ],
        "keyPoints": [
          "Page counts prove nothing; count sections, tables, and figures.",
          "Your structure map becomes your completeness checklist at delivery.",
          "The delivery note states what you verified and lists every flag.",
          "Client files never touch online converters or AI tools, and nothing survives approval."
        ]
      }
    ],
    "exam": {
      "questions": [
        {
          "prompt": "You are rebuilding a 90-page proposal in the client's template. On page 12 the source reads 'the the project team'. What do you do?",
          "options": [
            "Fix the obvious typo; delivering a document with a known error looks careless.",
            "Reproduce it exactly, then note the page and the exact text in your delivery note.",
            "Fix it and disclose the correction in your delivery note.",
            "Reproduce it and say nothing; typos in the source are not your concern."
          ],
          "correct": 1,
          "explain": "Content changes were not requested, so even a helpful fix is a dispute ground. Reproduce exactly and flag it so the operator decides what reaches the client."
        },
        {
          "prompt": "You are converting a legacy price sheet to the current layout. One line's total does not equal quantity times unit price. The task is layout conversion only. What do you do?",
          "options": [
            "Recalculate and enter the correct total; accurate numbers matter more than layout.",
            "Enter the corrected total and flag that you fixed it.",
            "Copy every number exactly as it appears and flag the mismatch in your delivery note.",
            "Leave that line blank and let the operator fill it in."
          ],
          "correct": 2,
          "explain": "The mismatch may be a discount or rounding you were never told about. Numbers are content; you flag them, you never correct them."
        },
        {
          "prompt": "Thirty pages into a 90-page rebuild, you have been formatting headings by hand with bold and font size. The client's template defines heading styles. What is the right call?",
          "options": [
            "Continue by hand; redoing thirty pages wastes more time than it saves.",
            "Go back, apply the template's heading styles throughout, and continue with styles.",
            "Use styles from page 31 onward and leave the first thirty pages as they are.",
            "Finish by hand, then adjust anything inconsistent in one final read-through."
          ],
          "correct": 1,
          "explain": "Hand formatting drifts and is invisible to table of contents generation. Restyling thirty pages now is cheaper than a rejected ninety."
        },
        {
          "prompt": "The source proposal uses four heading levels. The client's template defines only two heading styles, and the brief does not say how to handle the extra levels. What do you do?",
          "options": [
            "Choose one consistent mapping, apply it across the whole document, and state the decision in your delivery note.",
            "Handle each case page by page, picking whatever looks best in context.",
            "Create two new heading styles in the template so all four levels survive unchanged.",
            "Deliver without comment; the operator will send a revision if the mapping matters."
          ],
          "correct": 0,
          "explain": "When the brief is silent on a document-wide question, consistency plus disclosure beats silent improvising. The operator can accept your rule or send one clear revision."
        },
        {
          "prompt": "At page 60 of a rebuild, you notice that figure captions since page 40 use a different font from the earlier ones. What do you do?",
          "options": [
            "Run a dedicated caption sweep across the entire document, not just the pages where you noticed it.",
            "Fix pages 40 through 60 and continue; that covers the affected range.",
            "Fix what you saw; sweeping ninety pages for one font issue is not worth the time.",
            "Deliver as is and mention the caption inconsistency in your note."
          ],
          "correct": 0,
          "explain": "Noticed drift is evidence of unnoticed drift. One symptom means that element gets a full pass across every page."
        },
        {
          "prompt": "You are assembling a board packet from 11 source documents. The brief lists a running order for ten of them and never mentions the eleventh. What do you do?",
          "options": [
            "Leave the eleventh out; if it mattered, it would be in the running order.",
            "Place it last; unlisted items always go at the end.",
            "Place it where its content fits best and treat that as settled.",
            "Include it in a reasonable position and flag the missing instruction in your delivery note."
          ],
          "correct": 3,
          "explain": "Dropping content is the worst outcome, and a silent guess is a dispute risk. Include everything and surface the gap for the operator."
        },
        {
          "prompt": "You generate the packet's table of contents, then fix a spacing issue that pushes several sections onto new pages. What do you do about the contents page?",
          "options": [
            "Nothing; readers expect small offsets in long documents.",
            "Manually edit the entries for the sections that moved.",
            "Regenerate it after the layout change and verify its entries against the actual pages.",
            "Undo the spacing fix so the contents page stays accurate."
          ],
          "correct": 2,
          "explain": "Any layout change after generation can invalidate the contents page. Regenerate last, then spot-check entries against real page numbers."
        },
        {
          "prompt": "Your rebuilt proposal runs 88 pages; the source ran 90. Tighter styles can legitimately change page count. How do you confirm nothing was dropped?",
          "options": [
            "The tighter template explains the difference, so deliver.",
            "Work down your structure map and confirm every source section, table, and figure has a location in the delivery.",
            "Add two blank pages so the counts match the source.",
            "Compare the word counts of both files; matching totals prove completeness."
          ],
          "correct": 1,
          "explain": "Page counts prove nothing after reflow, in either direction. Completeness is verified at item level: sections, tables, figures, appendices, each with a confirmed destination."
        },
        {
          "prompt": "One source file opens badly in your word processor. A free online converter site would fix the file in seconds. What do you do?",
          "options": [
            "Use the converter; the file is on the site only briefly.",
            "Use the converter, then delete the file from the site afterward.",
            "Send the file to a friend whose software handles the format.",
            "Keep the file inside the task: try free local tools, and flag the format problem if they fail."
          ],
          "correct": 3,
          "explain": "Client files never leave the task. Uploading to a third-party site is a breach regardless of duration. A flagged format problem is honest work."
        },
        {
          "prompt": "Your delivery was approved and the payout released. The source files and your rebuilt document are still on your laptop. What do you do?",
          "options": [
            "Keep them as work samples; you built the rebuilt version yourself.",
            "Keep them for a month in case the operator has questions.",
            "Delete everything: sources, your rebuilt version, and any working notes containing client content.",
            "Delete the sources but keep your rebuilt version; the formatting work is yours."
          ],
          "correct": 2,
          "explain": "No copies survive the task. The rebuilt document is still the client's content in a new shape, and your working notes carry their information too."
        },
        {
          "prompt": "The source repeats an entire paragraph twice on page 34, clearly a copy-paste error. What do you do?",
          "options": [
            "Delete the duplicate; removing an obvious accident is not a real content change.",
            "Delete the duplicate and disclose the deletion in your delivery note.",
            "Keep both copies and say nothing; the source's problems are the client's problems.",
            "Reproduce both copies exactly and flag the duplication in your delivery note."
          ],
          "correct": 3,
          "explain": "Removing content is a content change in the other direction, and disclosure does not make an unrequested change allowed. Preserve exactly, flag clearly."
        },
        {
          "prompt": "You claim 'Convert 25 legacy price sheets to the current layout' and download the files. What is your first move?",
          "options": [
            "Open a sample of sheets from across the set, map their structures to the target layout, and settle your conversion rules.",
            "Start converting sheet one immediately; momentum matters on a 25-file task.",
            "Convert the shortest sheet first to learn the layout on an easy case.",
            "Sort the sheets newest to oldest and convert them in that order."
          ],
          "correct": 0,
          "explain": "Rules discovered at sheet 20 force rework on nineteen. Mapping a sample first means every decision is made once and applied consistently."
        }
      ]
    }
  },
  "admin-coordination": {
    "slug": "admin-coordination",
    "title": "Admin & coordination",
    "track": "category",
    "tagline": "Execute the process exactly, prove it with a log, and never guess in silence.",
    "summary": "Admin and coordination tasks are judged on exact execution and proof, not creativity. This course teaches the judgement layer: following explicit steps without unrequested improvements, keeping an action log worth auditing, tracking dozens of items so nothing silently stalls, scheduling across timezones without daylight saving mistakes, running scripted outreach and its replies, and knowing when to handle, note, or stop. You finish able to meet the standard the operator reviews against, word for word.",
    "outcomes": [
      "You can execute a multi-step brief exactly, in order, without unrequested improvements.",
      "You can keep a what-when-outcome action log filled as you go, never reconstructed.",
      "You can track 45 items through their states so nothing silently stalls.",
      "You can schedule across timezones and catch daylight saving shifts before they break a calendar.",
      "You can run scripted outreach verbatim and sort replies into handle or escalate.",
      "You can decide fast whether a surprise is handled, noted, or stops the task."
    ],
    "lessons": [
      {
        "title": "The Standard You Are Judged Against",
        "minutes": 4,
        "sections": [
          {
            "heading": "How admin work is judged",
            "body": "Every delivery in this category is reviewed against one standard: Completed per the brief's explicit steps, with the actions taken logged where a log was requested. Anything the brief left ambiguous is noted rather than guessed. Read it twice. It does not mention creativity, speed, or initiative. It mentions steps, a log, and notes. Admin work is process work: the client already designed the process, and they are paying for it to be executed exactly and to be able to prove it was. Your judgement shows up in three places only: reading the steps correctly, recording what you did, and recognizing when the brief has not told you enough to act."
          },
          {
            "heading": "Follow the steps in order",
            "body": "Step order is part of the instruction, not a suggestion. If the brief says confirm the calendar slot, then send the invite, then log the outcome, doing them in a different order can break things you cannot see. Maybe the confirmation triggers a reminder on the client's side. Maybe the invite template pulls the slot from the confirmation. You do not know, and you do not need to know. Treat the sequence like a combination lock: the numbers are only correct in order. If a step genuinely cannot be done before another, that is a problem with the brief, and problems with the brief get noted for the operator, not solved by rearranging."
          },
          {
            "heading": "Resist improvements nobody asked for",
            "body": "You will see things you could improve. A clunky subject line. A form that asks for the same data twice. A step that looks redundant. Leave them alone. The client's process may connect to systems, habits, or legal requirements you cannot see, and an improvement you were not asked for is, from the operator's side, a deviation from the brief. There is one right way to act on a good idea: finish the task as written, then mention the suggestion in your delivery note. If the client wants it, it becomes part of the next brief. If they do not, you have lost nothing. Deviating first and explaining later risks a rejection either way."
          }
        ],
        "keyPoints": [
          "The standard: explicit steps followed, actions logged, ambiguity noted rather than guessed.",
          "Step order is part of the instruction; never rearrange it.",
          "Unrequested improvements are deviations; suggest them in the delivery note instead."
        ]
      },
      {
        "title": "The Action Log",
        "minutes": 5,
        "sections": [
          {
            "heading": "A deliverable, not a diary",
            "body": "When a brief asks for a log of actions taken, the log is not paperwork attached to the real work. It often is the real work. A client chasing 45 W-9 forms needs to show, later, exactly which vendors were contacted, when, and what happened, because tax paperwork gets audited. A log that is complete and accurate can matter more to them than the forms themselves. Treat the log with the same care as the task: it will be read, checked, and possibly relied on months from now by people who never saw the brief. If the brief requests a log, an incomplete log means an incomplete delivery, even if every action was actually done."
          },
          {
            "heading": "What, when, outcome",
            "body": "A useful log entry answers three questions: what you did, when you did it, and what happened. Sent the scripted W-9 request to the vendor's billing email at 09:14, no reply yet. Call slot confirmed for March 3, 10:00 in the client's calendar, invite accepted. Write the outcome you observed, not the outcome you expect. Sent is an action; they will probably reply is a prediction, and predictions do not belong in a log. Keep entries short and identical in shape so the operator can scan 45 rows in a minute. If the brief supplies a log format, use it exactly. If it does not, one row per item with those three fields is the default."
          },
          {
            "heading": "Filled as you go, never after",
            "body": "Log each action the moment you take it, before starting the next one. This feels slow. It is the only method that works. After thirty similar emails, your memory of which vendor got which version at which time is gone, and a log rebuilt afterward from memory is a set of guesses wearing timestamps. The dispute standard asks for actions taken, logged; a reconstruction is neither honest nor checkable. If you realize you missed logging something, log it now and mark it clearly as a late entry with your best known time, rather than inventing a precise one. An honest gap survives QC. A confident fabrication, discovered later, is the kind of thing that ends up on your record."
          }
        ],
        "keyPoints": [
          "When a log is requested, the log is part of the deliverable itself.",
          "Every entry records what you did, when, and the outcome you observed.",
          "Log each action before starting the next; never rebuild a log from memory.",
          "Mark late entries honestly instead of inventing precise timestamps."
        ]
      },
      {
        "title": "Tracking Thirty Things at Once",
        "minutes": 5,
        "sections": [
          {
            "heading": "The failure mode is silence",
            "body": "Admin tasks in this category are rarely one action. They are the same action across 30 calls or 45 vendors, each item moving through its own states: not started, sent, waiting on a reply, done, blocked. The dangerous failure is not doing something wrong. It is an item that silently stops moving. Vendor 23 never replied, nobody noticed, and at delivery time the task is 44 out of 45 with no explanation. QC will find the gap even when you did not. Your job is to build a view where a stalled item is impossible to miss, so that every item ends the task either completed or explicitly accounted for in your log and delivery note."
          },
          {
            "heading": "One row, one status column",
            "body": "A free spreadsheet is enough. One row per item, columns for the item's identity, its current status, the date of your last action, and what you are waiting for. Update the status the moment it changes, in the same motion as your log entry. Use a small fixed set of statuses and never invent new ones mid-task, because a status list that grows becomes a list you cannot filter. Sort or filter by status to work in batches: send all first contacts, then process all replies. The tracker and the action log are different things. The log records history and never changes; the tracker shows the present and changes constantly. You need both, and each stays clean because the other exists."
          },
          {
            "heading": "Sweep for stalls before delivery",
            "body": "Once per working session, sweep the tracker for anything in a waiting state older than the brief allows, and anything still not started. This sweep is how vendor 23 gets caught on day two instead of at delivery. What you do with a stalled item depends on the brief: if it defines a follow-up rule, apply it and log it; if it does not, the item goes into your delivery note as waiting, with dates, rather than being quietly dropped or chased in a way the brief never authorized. A delivery that says 41 complete, 4 awaiting replies, last contacted on these dates, meets the standard. A delivery that hopes nobody counts does not."
          }
        ],
        "keyPoints": [
          "The dangerous failure is an item that silently stops moving.",
          "One row per item, one status column, updated the moment things change.",
          "The log records history; the tracker shows the present. Keep both.",
          "Sweep every session for stalls; account for every item at delivery."
        ]
      },
      {
        "title": "Scheduling Across Time Zones",
        "minutes": 6,
        "sections": [
          {
            "heading": "Anchor every time to one zone",
            "body": "When a brief involves three calendars in three cities, never convert directly between pairs of zones. Pick one anchor, normally the client's stated timezone or UTC, convert everything to it, do your arithmetic there, then convert out. Direct pair conversion is where errors breed, because each pair has its own offset and your head is holding three of them at once. Write conversions down instead of trusting mental math: 10:00 New York is 15:00 UTC is 23:00 Manila. Note your own trap as well. The Philippines does not shift its clocks, so the gap between you and a US or European client changes twice a year while your clock stays still. The offset you memorized last month may be wrong this month."
          },
          {
            "heading": "Daylight saving is where schedules break",
            "body": "Daylight saving time is the single most common cause of meetings booked an hour wrong. The United States and Europe change clocks on different dates a few weeks apart, so for part of spring and autumn the usual offsets between them are wrong too. Any time you schedule something more than a few days out, check whether a transition falls between today and the meeting date, and check it per region, not once. Never assume the offset that is true today holds next month. A free world clock site that compares a specific future date across cities settles the question in seconds. Thirty calls booked with one stale offset is thirty wrong calls, and one check would have prevented all of them."
          },
          {
            "heading": "Let the calendar do the final check",
            "body": "Your arithmetic is a draft; the calendar entry is the fact. Calendar tools attach a timezone to every event, so after creating an entry, read it back and confirm it displays the intended local time for each attendee's zone, especially for dates after a daylight saving transition. When your log records a scheduled call, record the time in the anchor zone and the attendee's local time both, so a mismatch is visible on paper before anyone joins an empty call. If the brief does not say which timezone its listed times are in, that is ambiguity, and the protocol is the one you already know: note it for the operator rather than guessing. A guessed timezone is a guessed meeting."
          }
        ],
        "keyPoints": [
          "Convert through one anchor zone; never juggle pairwise offsets in your head.",
          "The Philippines never shifts clocks, so your offset to DST countries changes twice a year.",
          "Check for DST transitions between today and every date you book.",
          "Record both anchor time and local time so mismatches show on paper.",
          "A brief that omits its timezone is ambiguity: note it, do not guess."
        ]
      },
      {
        "title": "Scripted Outreach and Reply Handling",
        "minutes": 5,
        "sections": [
          {
            "heading": "The script is the instruction",
            "body": "Outreach templates are not suggestions of tone. They are the exact words the client has decided will go out under their name, and they may have been reviewed for legal wording, brand voice, or promises the client is willing to keep. Your job is to fill the designated fields, the name, the date, the missing document, and change nothing else. Not the greeting, not the subject line, not a phrase that sounds stiff to you. A friendlier version is still a deviation, and if a vendor later disputes what they were told, the client needs the message on record to be the message they approved. Before a batch, send the first one, reread it against the template, then continue."
          },
          {
            "heading": "Handle only the replies the brief anticipated",
            "body": "Replies sort into two piles. The brief anticipated some: a completed form arrives, a bounce, an out-of-office, a request to resend. For those, do exactly what the reply-handling rules say and log it. Everything else goes in the second pile: a vendor disputing that they owe the form, a question about the client's business, a complaint, a request to speak to someone. Those get logged, noted for the operator, and not answered by you, however easy the answer seems. The moment you improvise a reply, you are speaking for the client without authorization, and you may commit them to something. An unanswered tricky reply costs a day. A wrong answer in the client's name can cost the relationship."
          },
          {
            "heading": "What passes through you stays here",
            "body": "Outreach work moves other people's data through your hands: names, emails, tax documents, internal contacts. All of it belongs to the task. Do not copy vendor lists or replies into personal notes, do not paste message contents into AI tools or translators unless the brief says to, and keep no copies of anything after delivery. Do the work inside the tools the brief provides, and keep your tracker and log free of data the deliverable does not need. This is the confidentiality rule that covers every category, and outreach tasks are where it is easiest to break by accident, because the data arrives scattered across dozens of small messages instead of one obvious file."
          }
        ],
        "keyPoints": [
          "Fill the template's designated fields and change nothing else, not even tone.",
          "Anticipated replies: follow the rules and log. Everything else: flag for the operator.",
          "Improvising a reply means speaking for the client without authorization.",
          "Vendor data belongs to the task: no copies, no outside tools, nothing kept after delivery."
        ]
      },
      {
        "title": "Handle, Note, or Stop",
        "minutes": 5,
        "sections": [
          {
            "heading": "Three lanes: handle, note, stop",
            "body": "Every surprise in a task fits one of three lanes. Handle it when the brief already covers it: a bounce with a defined retry rule is work, not a problem. Note it and keep going when it does not block the work but the operator needs to know: a vendor list with two duplicate entries, a calendar slot the brief lists twice, a step that is ambiguous for three items out of 45. Stop when continuing would multiply damage: access that does not work, instructions that contradict each other, a template field you cannot fill for most items. The skill is picking the lane fast and not upgrading or downgrading a problem because stopping feels like failure or noting feels like nitpicking."
          },
          {
            "heading": "The ambiguity protocol",
            "body": "When the brief is silent on something you need, the rule is mechanical: do not guess, note it. For most tasks that means finishing every item the brief does cover, holding the ambiguous ones, and describing them precisely in your delivery note. A good note has three parts: what you found, why the brief leaves it open, and what remains to be decided. Compare two notes about the same gap. First: some vendors had two emails so I picked one. Second: three vendors have two addresses on file and the brief does not say which to contact; items 12, 19, and 31 are held pending an answer, everything else is sent. The first admits a guess. The second hands the operator a ten-second decision."
          },
          {
            "heading": "Flagging beats a finished guess",
            "body": "Your record on the platform tracks claim releases and QC rejections. Neither tracks flags. A delivery that says 42 done, 3 held for a decision, reasons attached, is a complete delivery under the standard, because held-and-noted is a legitimate outcome. A delivery that quietly guessed on those 3 gambles the whole task: if QC catches the guess, the rejection lands on the entire delivery, and on your record. Guessing feels faster because most guesses turn out fine. But you are not paid per lucky guess, you are building a history that decides what work you see next. The worker who flags looks slower on one task and becomes the one we trust with the 45-vendor tasks. That trade is the whole job."
          }
        ],
        "keyPoints": [
          "Handle what the brief covers, note what it leaves open, stop what multiplies damage.",
          "Complete covered items, hold ambiguous ones, explain both in the delivery note.",
          "A good note says what you found, why it is open, and what needs deciding.",
          "Held-and-noted is a legitimate outcome; a caught guess can cost the whole delivery."
        ]
      }
    ],
    "exam": {
      "questions": [
        {
          "prompt": "The brief includes an email template for chasing W-9 forms. You are sure a warmer wording would get more replies. What do you do?",
          "options": [
            "Rewrite the greeting and one stiff sentence; better reply rates serve the client's actual goal.",
            "Send the template exactly as written and put your suggested wording in the delivery note.",
            "Send your improved version to five vendors first, then switch if replies come faster.",
            "Alternate the two versions across the batch so the client can compare results."
          ],
          "correct": 1,
          "explain": "The template is the message the client approved to go out under their name. Changing it is a deviation; suggestions belong in the delivery note."
        },
        {
          "prompt": "After a two-hour calling block you realize the last six entries never made it into the log. You remember most details but not exact times. What do you do?",
          "options": [
            "Redo the six calls so the log and your actions match exactly.",
            "Reconstruct the six entries from memory with estimated times, formatted identically to the rest.",
            "Add them now with the details you are sure of, clearly marked as late entries with approximate times.",
            "Leave them out; an incomplete log is safer than an imprecise one."
          ],
          "correct": 2,
          "explain": "A reconstruction formatted like live entries is a set of guesses wearing timestamps. Honest late entries with marked approximations survive QC; hidden gaps and fabricated precision do not."
        },
        {
          "prompt": "Day two of a 45-vendor chase. Your tracker shows 39 sent and 4 replied, but two rows still say not started, with no last-action date. What do you do?",
          "options": [
            "Contact those two now, log the real times, and check what made your process skip them.",
            "Mark them sent; you almost certainly covered them and forgot to update the tracker.",
            "Leave them for delivery day and list them as unreachable in your note.",
            "Delete the rows; the totals will still show 43 vendors handled."
          ],
          "correct": 0,
          "explain": "A stalled item caught on day two is the tracker doing its job. Marking them sent without evidence would turn a catchable gap into a false record."
        },
        {
          "prompt": "Today is March 5. You are booking a March 12 call between New York and London. The US enters daylight saving on March 8; the UK changes later in the month. What matters here?",
          "options": [
            "Nothing; both countries observe daylight saving, so the offset between them never changes.",
            "Use today's offset, since the meeting is only a week away.",
            "Add one hour to every conversion involving Manila to stay safe.",
            "The New York to London offset on March 12 differs from today's, so convert using that date's offsets."
          ],
          "correct": 3,
          "explain": "The US and UK shift on different dates, so between transitions the usual offset is wrong. Always check offsets for the meeting date, not today."
        },
        {
          "prompt": "The brief lists 30 call times in one column with no timezone stated. The client is in Chicago; the calendars belong to teams in Denver and Berlin. What do you do?",
          "options": [
            "Assume Chicago, since the times are the client's and they wrote the brief.",
            "Treat the missing timezone as ambiguity: note it for the operator instead of booking on an assumption.",
            "Use the calendar tool's default timezone; the client configured the tool.",
            "Book everything in UTC so no single city is favored."
          ],
          "correct": 1,
          "explain": "Chicago is a reasonable guess, but the standard says ambiguity is noted rather than guessed. Thirty calls booked on a wrong assumption is thirty wrong calls."
        },
        {
          "prompt": "A vendor replies to your scripted chase: We already sent this in January, and your client's billing is a mess. The brief's reply rules cover received forms, bounces, and resend requests only. What do you do?",
          "options": [
            "Log the reply, send nothing further to that vendor, and flag the message for the operator.",
            "Apologize briefly and ask them to resend the form anyway; that closes the item.",
            "Reply that billing complaints should go to the client directly.",
            "Treat it as a resend request, since they claim the form was already sent."
          ],
          "correct": 0,
          "explain": "The reply falls outside the brief's rules, so answering it means speaking for the client without authorization. Log it, hold the thread, and let the operator decide."
        },
        {
          "prompt": "The brief for 20 user setups says: create the account, assign the license, send the welcome invite, per user. The tool can send all invites in bulk at the end, which is faster. What do you do?",
          "options": [
            "Use the bulk feature; the end result is identical and the client pays for outcomes.",
            "Do ten each way and report which was faster in your delivery note.",
            "Follow the per-user order as written and mention the bulk option in your delivery note.",
            "Use the bulk feature but log each invite as if sent individually."
          ],
          "correct": 2,
          "explain": "Step order is part of the instruction; the sequence may matter in ways you cannot see. Finish as written, then suggest the improvement for future briefs."
        },
        {
          "prompt": "A vendor's reply includes their completed W-9 with a tax ID, partly written in German. A free online translator would clarify one sentence. The brief says nothing about translation tools. What do you do?",
          "options": [
            "Paste only the German sentence, leaving out the tax ID and names.",
            "Use the translator, then clear its history so nothing is retained.",
            "Translate it; the brief does not forbid translation tools.",
            "Keep the file inside the task and note the untranslated sentence for the operator."
          ],
          "correct": 3,
          "explain": "Client files never leave the task unless the brief says so. Pasting any part into an outside service breaks confidentiality; a silent brief means note, not guess."
        },
        {
          "prompt": "Delivery time on the 45-vendor chase. You handled 42; 3 never replied even after the follow-up rule the brief defined, all logged. How do you deliver?",
          "options": [
            "Deliver now, with a note listing 42 complete and 3 awaiting replies, with contact dates for each.",
            "Hold delivery until all 45 respond, however long that takes.",
            "Deliver marked complete; you performed every required action, so the task is done.",
            "List the 3 as refused to comply so the client knows to escalate."
          ],
          "correct": 0,
          "explain": "Every item ends completed or explicitly accounted for. Waiting items with dates meet the standard; calling them complete or inventing a refusal misstates what you observed."
        },
        {
          "prompt": "Setting up 20 users, the brief's credentials open the project tool but cannot create accounts. You found a workaround page that invites users a different way. What do you do?",
          "options": [
            "Use the workaround and log each invite; the outcome is what matters.",
            "Stop; the explicit steps are blocked, and access problems get reported, not redesigned around.",
            "Complete the setups via the workaround and disclose the method in your delivery note.",
            "Release the claim without comment so the task returns to the pool."
          ],
          "correct": 1,
          "explain": "Blocked access stops the task: the brief's explicit steps cannot be followed, and an unauthorized method multiplies risk across 20 accounts. Disclosing a deviation afterward does not authorize it."
        },
        {
          "prompt": "You just left a voicemail for vendor 12 asking them to return their W-9. Which log entry is right?",
          "options": [
            "Vendor 12 contacted; form expected shortly.",
            "Called vendor 12; they will probably send it this week.",
            "Vendor 12 done.",
            "Voicemail left for vendor 12 at 10:42 requesting W-9 return; no response yet."
          ],
          "correct": 3,
          "explain": "A log entry records what you did, when, and the outcome you observed. Predictions and vague statuses are not observations and cannot be checked later."
        },
        {
          "prompt": "While booking 30 check-in calls you find one person listed twice on the client's contact sheet with different phone numbers. The brief says to call the number on the sheet. What do you do?",
          "options": [
            "Call both numbers so the person is reached either way.",
            "Use whichever number appears lower on the sheet; later entries are usually newer.",
            "Book the other 29, hold this one, and note the duplicate with both numbers for the operator.",
            "Skip that person; 29 of 30 booked is close enough to complete."
          ],
          "correct": 2,
          "explain": "The sheet contradicts itself, so the brief cannot be followed for that item. Complete what is covered, hold the ambiguous item, and give the operator a ten-second decision."
        }
      ]
    }
  }
};

export function courseFor(slug: string): Course | null {
  return COURSES[slug] ?? null;
}

export function allCourses(): Course[] {
  return Object.values(COURSES);
}

export function hasCourse(slug: string): boolean {
  return slug in COURSES;
}

/** Total honest reading time for a course, minutes. */
export function courseMinutes(course: Course): number {
  return course.lessons.reduce((s, l) => s + l.minutes, 0);
}
