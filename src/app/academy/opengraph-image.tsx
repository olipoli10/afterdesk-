import { ImageResponse } from "next/og";
import { academyStats } from "@/lib/academy/public";

export const alt = "Second Shift Academy — free virtual assistant training with real exams";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

/**
 * The share card for the page that gets forwarded — a worker sending the
 * Academy to a friend is the growth mechanism, so this image IS the pitch.
 * The three numbers are read from the live curriculum rather than typed, so
 * the card cannot outlive the truth the way the "12 courses" copy did.
 *
 * Paper side, matching /workers: this is the worker half of the seam.
 *
 * Satori renders text nodes only — a raw NUMBER child crashes the route with
 * an empty response and no stack trace, which is why every figure below is
 * String()-wrapped.
 */
export default function OgImage() {
  const stats = academyStats();
  const figures: [number, string][] = [
    [stats.courses, "courses"],
    [stats.lessons, "lessons"],
    [stats.questions, "exam questions"],
  ];

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
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            fontSize: 24,
            letterSpacing: "0.22em",
            color: "#14161A",
            textTransform: "uppercase",
          }}
        >
          <div>Second Shift</div>
          <div style={{ fontSize: 20, letterSpacing: "0.18em", color: "#5B6069" }}>Academy</div>
        </div>

        <div style={{ display: "flex", flexDirection: "column" }}>
          <div style={{ fontSize: 68, color: "#14161A", letterSpacing: "-0.025em" }}>
            Free training.
          </div>
          <div style={{ fontSize: 68, color: "#8A9099", letterSpacing: "-0.025em" }}>
            Real exams. Yours to keep.
          </div>
        </div>

        <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between" }}>
          <div style={{ display: "flex", gap: 56 }}>
            {figures.map(([n, label]) => (
              <div key={label} style={{ display: "flex", flexDirection: "column" }}>
                <div style={{ fontSize: 52, color: "#14161A", letterSpacing: "-0.02em" }}>{String(n)}</div>
                <div style={{ fontSize: 20, color: "#5B6069", marginTop: 8 }}>{label}</div>
              </div>
            ))}
          </div>
          {/* Green is money everywhere in this product — a certificate is not
              money, so the rule reads dusk here, not the payout green the
              worker card uses. */}
          <div style={{ width: 220, height: 6, backgroundColor: "#1B2740", borderRadius: 3 }} />
        </div>
      </div>
    ),
    size
  );
}
