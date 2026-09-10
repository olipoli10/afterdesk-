/** Closed whole-message calendar read grammar shared by SMS routing.
 * Classification alone grants no calendar access or execution authority. */
export function smsCalendarDay(message: string): "TODAY" | "TOMORROW" | null {
  const normalized = message.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[’']/g, " ").replace(/[-?!.]/g, " ").replace(/\s+/g, " ").trim();
  const match = /^(?:(?:hey|salut) )?(?:qu est ce que j ai|qu ai je|j ai quoi|c est quoi mon horaire|mon horaire|mon agenda|mon calendrier(?: google)?|mes rendez vous)(?: pour)? (demain|aujourd hui)$/.exec(normalized);
  return match ? match[1] === "demain" ? "TOMORROW" : "TODAY" : null;
}
