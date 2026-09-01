-- Forward-only enum expansion for provider-neutral voice transcripts and
-- persistent operating-assistant commands. No existing row is rewritten.
ALTER TYPE "ConstructionChannel" ADD VALUE IF NOT EXISTS 'voice';
ALTER TYPE "ConstructionMessageStatus" ADD VALUE IF NOT EXISTS 'answered';
ALTER TYPE "ConstructionIntent" ADD VALUE IF NOT EXISTS 'calendar_item_reschedule';
ALTER TYPE "ConstructionIntent" ADD VALUE IF NOT EXISTS 'reminder_create';
ALTER TYPE "ConstructionIntent" ADD VALUE IF NOT EXISTS 'daily_briefing';
