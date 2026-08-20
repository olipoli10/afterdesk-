import { A2_REST, A2Sprite } from "@/app/_home/a2-concierge";

/**
 * The approved original A2, used as a quiet supervisor inside the client
 * workspace. This is deliberately not a second assistant implementation:
 * the exact frozen skeleton is imported from the public-site authority and
 * rendered once per portal screen. Conversation behavior remains in the
 * existing intake action; this component is only its visible presence.
 */
export function A2PortalPresence({
  label = "A2",
  compact = false,
}: {
  label?: string;
  compact?: boolean;
}) {
  return (
    <div
      data-a2-portal-presence=""
      className={`relative grid shrink-0 place-items-center rounded-[10px] border border-[#6F4C29] bg-[#17130E] shadow-[inset_0_1px_0_rgba(226,196,134,0.12),0_14px_30px_-18px_rgba(0,0,0,0.8)] ${
        compact ? "h-[58px] w-[66px]" : "h-[82px] w-[92px]"
      }`}
    >
      <span aria-hidden className="absolute inset-x-3 bottom-2 h-px bg-gradient-to-r from-transparent via-[#D87526]/70 to-transparent" />
      <A2Sprite rects={A2_REST} px={compact ? 1 : 2} label="A2" />
      <span className="sr-only">{label}</span>
    </div>
  );
}
