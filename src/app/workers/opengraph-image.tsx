import { ImageResponse } from "next/og";

export const alt = "Second Shift — America goes to sleep. You wake up to paid work.";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

/** The paper card — the worker side of the seam. */
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
          Second Shift
        </div>
        <div style={{ display: "flex", flexDirection: "column" }}>
          <div style={{ fontSize: 72, color: "#8A9099", letterSpacing: "-0.02em" }}>
            America goes to sleep.
          </div>
          <div style={{ fontSize: 72, color: "#14161A", letterSpacing: "-0.02em" }}>
            You wake up to paid work.
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div style={{ fontSize: 22, color: "#5B6069" }}>
            No proposals. No bidding. The payout is printed on every task.
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
