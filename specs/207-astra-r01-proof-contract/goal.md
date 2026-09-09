# Bounded autonomous goal — R0.1

Apply plan.md, repair and test the local proof contract, freeze it before a fresh
local campaign, preserve every historical outcome, then validate and checkpoint
the exact result without another GO. No external authority and no timer.

The app goal registry still holds the older blocked whole-project goal. A fresh
create_goal attempt was refused on 2026-09-09. Do not mark that project complete
to clear the slot. LONG_RUN_PROGRAM.json and CONTINUATION_QUEUE.json are this
bounded campaign's durable state; they do not replace the app registry.
