import "server-only";

const HEADER = "[ENDVERA_SMS_TRANSCRIPT_V1]";
const PREVIOUS_OPEN = "[PREVIOUS_CONTEXT]";
const PREVIOUS_CLOSE = "[/PREVIOUS_CONTEXT]";
const QUESTION_OPEN = "[ENDVERA_CLARIFICATION]";
const QUESTION_CLOSE = "[/ENDVERA_CLARIFICATION]";
const REPLY_OPEN = "[CURRENT_USER_REPLY]";
const REPLY_CLOSE = "[/CURRENT_USER_REPLY]";
const RESERVED = /\[\/?(?:ENDVERA_SMS_TRANSCRIPT_V1|PREVIOUS_CONTEXT|ENDVERA_CLARIFICATION|CURRENT_USER_REPLY)\]/u;

export type PersonalSmsTranscript = Readonly<{
  isTranscript: boolean;
  turns: number;
  userText: string;
  latestUserText: string;
}>;

/** Strictly parses only the server-owned transcript grammar. Raw user text that
 * contains a reserved marker is not accepted as a transcript component. */
export function inspectPersonalSmsTranscript(source: string): PersonalSmsTranscript | null {
  if (typeof source !== "string" || source.length < 1 || source.length > 10_000) return null;
  if (!source.startsWith(`${HEADER}\n`)) {
    return RESERVED.test(source) ? null : Object.freeze({ isTranscript: false, turns: 1, userText: source, latestUserText: source });
  }
  const prefix = `${HEADER}\n${PREVIOUS_OPEN}\n`;
  const previousBoundary = `\n${PREVIOUS_CLOSE}\n${QUESTION_OPEN}\n`;
  const questionBoundary = `\n${QUESTION_CLOSE}\n${REPLY_OPEN}\n`;
  const suffix = `\n${REPLY_CLOSE}`;
  if (!source.startsWith(prefix) || !source.endsWith(suffix)) return null;
  const previousEnd = source.lastIndexOf(previousBoundary);
  if (previousEnd < prefix.length) return null;
  const previousSource = source.slice(prefix.length, previousEnd);
  const afterPrevious = source.slice(previousEnd + previousBoundary.length, -suffix.length);
  const questionEnd = afterPrevious.indexOf(questionBoundary);
  if (questionEnd < 1 || afterPrevious.indexOf(questionBoundary, questionEnd + 1) !== -1) return null;
  const question = afterPrevious.slice(0, questionEnd);
  const currentReply = afterPrevious.slice(questionEnd + questionBoundary.length);
  if (!currentReply || RESERVED.test(question) || RESERVED.test(currentReply)) return null;
  const previous = inspectPersonalSmsTranscript(previousSource);
  if (!previous || previous.turns >= 4) return null;
  return Object.freeze({ isTranscript: true, turns: previous.turns + 1,
    userText: `${previous.userText}\n${currentReply}`, latestUserText: currentReply });
}

export function appendPersonalSmsClarificationTranscript(previousSource: string, question: string, currentReply: string) {
  const previous = inspectPersonalSmsTranscript(previousSource);
  if (!previous || previous.turns >= 4 || !question || !currentReply || RESERVED.test(question) || RESERVED.test(currentReply)) return null;
  const source = [HEADER, PREVIOUS_OPEN, previousSource, PREVIOUS_CLOSE, QUESTION_OPEN, question, QUESTION_CLOSE,
    REPLY_OPEN, currentReply, REPLY_CLOSE].join("\n");
  if (source.length > 10_000) return null;
  const inspected = inspectPersonalSmsTranscript(source);
  return inspected?.isTranscript === true ? Object.freeze({ source, inspected }) : null;
}
