import { ImageResponse } from "next/og";

export const alt = "AfterDesk — The payout is printed before you claim.";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

/**
 * The paper card — the specialist side of the seam.
 *
 * This image used to read "America goes to sleep. / You wake up to paid work."
 * It is the single most-travelled surface on the site: every share of
 * /workers, on any platform, rendered that sentence, and it defined AfterDesk
 * by a labour-arbitrage story — one timezone asleep, another working cheaper.
 * A client who followed a shared link met that framing before anything else.
 *
 * The replacement keeps the real differentiator, which is not geography: the
 * amount is fixed and visible BEFORE the decision to take the work. That is
 * true of the product as built (the payout is frozen at claim by a database
 * trigger) and it is the thing specialists actually come for.
 */
export default function OgImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          backgroundColor: "#F7F6F3",
          padding: "72px 80px",
          fontFamily: "monospace",
        }}
      >
        <div
          style={{
            fontSize: 24,
            letterSpacing: "0.22em",
            color: "#14161A",
            textTransform: "uppercase",
          }}
        >
          AfterDesk
        </div>
        <div style={{ display: "flex", flexDirection: "column" }}>
          <div style={{ fontSize: 72, color: "#8A9099", letterSpacing: "-0.02em" }}>
            No bidding.
          </div>
          <div style={{ fontSize: 72, color: "#14161A", letterSpacing: "-0.02em" }}>
            The payout is printed before you claim.
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div style={{ fontSize: 22, color: "#5B6069" }}>
            Scope, deadline and payout, visible before you take the work.
          </div>
          <div
            style={{
              width: 220,
              height: 6,
              backgroundColor: "#1E7F5C",
              borderRadius: 3,
            }}
          />
        </div>
      </div>
    ),
    size
  );
}
