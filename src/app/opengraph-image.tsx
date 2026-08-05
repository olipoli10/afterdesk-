import { ImageResponse } from "next/og";

export const alt = "AfterDesk: Send the work. Get a reviewed deliverable.";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

/** The night card — the client side of the seam. */
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
          backgroundColor: "#0A0B0D",
          padding: "72px 80px",
          fontFamily: "monospace",
        }}
      >
        <div
          style={{
            fontSize: 24,
            letterSpacing: "0.22em",
            color: "#F7F6F3",
            textTransform: "uppercase",
          }}
        >
          AfterDesk
        </div>
        <div style={{ display: "flex", flexDirection: "column" }}>
          <div style={{ fontSize: 72, color: "#767C86", letterSpacing: "-0.02em" }}>
            Send the work.
          </div>
          <div style={{ fontSize: 72, color: "#F7F6F3", letterSpacing: "-0.02em" }}>
            Get a reviewed deliverable.
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div style={{ fontSize: 22, color: "#767C86" }}>
            Scope approved upfront. Quality control before delivery.
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
