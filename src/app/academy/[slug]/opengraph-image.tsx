import { ImageResponse } from "next/og";
import { publicCourseFull, PUBLISHED_COURSES, academyStats } from "@/lib/academy/public";

export const alt = "A free AfterDesk Academy course";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export function generateStaticParams() {
  return PUBLISHED_COURSES.map((slug) => ({ slug }));
}

/**
 * The share card for one course — what appears when a worker forwards the
 * link into a Facebook group, which is where this audience actually discovers
 * things. So the card leads with the course name and closes with the two
 * facts that decide whether someone clicks: it is free, and the certificate
 * is real.
 *
 * Satori renders TEXT NODES ONLY — a raw number child crashes the route with
 * an empty response and no stack trace. Every figure below is String()-wrapped
 * for that reason; do not "simplify" it back.
 */
export default async function OgImage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const course = publicCourseFull(slug);
  const stats = academyStats();

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
            fontSize: 22,
            letterSpacing: "0.2em",
            color: "#14161A",
            textTransform: "uppercase",
          }}
        >
          <div>AfterDesk</div>
          <div style={{ fontSize: 19, color: "#5B6069" }}>Academy</div>
        </div>

        <div style={{ display: "flex", flexDirection: "column" }}>
          <div style={{ fontSize: 24, color: "#5B6069", marginBottom: 18 }}>Free course</div>
          <div
            style={{
              fontSize: course && course.title.length > 26 ? 62 : 74,
              color: "#14161A",
              letterSpacing: "-0.028em",
              lineHeight: 1.08,
            }}
          >
            {course ? course.title : "AfterDesk Academy"}
          </div>
        </div>

        <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between" }}>
          <div style={{ display: "flex", gap: 44 }}>
            {(
              [
                [String(course?.lessonCount ?? stats.courses), "lessons"],
                [String(course?.minutes ?? stats.minutes), "minutes"],
                [String(stats.questionCount), "exam questions"],
              ] as [string, string][]
            ).map(([n, label]) => (
              <div key={label} style={{ display: "flex", flexDirection: "column" }}>
                <div style={{ fontSize: 44, color: "#14161A", letterSpacing: "-0.02em" }}>{n}</div>
                <div style={{ fontSize: 18, color: "#5B6069", marginTop: 7 }}>{label}</div>
              </div>
            ))}
          </div>
          <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end" }}>
            <div style={{ fontSize: 20, color: "#5B6069", marginBottom: 12 }}>
              Free · certificate included
            </div>
            {/* Dusk, not the payout green — a certificate is not money. */}
            <div style={{ width: 220, height: 6, backgroundColor: "#1B2740", borderRadius: 3 }} />
          </div>
        </div>
      </div>
    ),
    size
  );
}
