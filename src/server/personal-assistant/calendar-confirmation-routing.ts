/** Routing only, never approval. Preserve the original SMS for exact matching.
 * A quoted, malformed or negated reserved phrase must not fall through to a model. */
export function isReservedCalendarConfirmationMessage(body: string): boolean {
  const routingText = body.normalize("NFKC").replace(/\p{Cf}/gu, "");
  return /confirme\s+endvera\s+agenda\b/iu.test(routingText);
}
