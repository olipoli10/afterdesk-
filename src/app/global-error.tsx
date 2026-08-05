"use client";

/* global-error REPLACES the root layout when it renders, and the root layout
   is the only place globals.css (and therefore Tailwind) is imported — so
   this boundary must carry its own inline styles or it renders unstyled at
   exactly the moment the app is already broken. */
export default function GlobalError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <html lang="en">
      <body style={{ margin: 0 }}>
        <main
          style={{
            display: "flex",
            minHeight: "100vh",
            alignItems: "center",
            justifyContent: "center",
            background: "#0A0B0D",
            color: "#F7F6F3",
            padding: "0 24px",
            fontFamily: "ui-sans-serif, system-ui, -apple-system, 'Segoe UI', sans-serif",
          }}
        >
          <div
            style={{
              width: "100%",
              maxWidth: 420,
              borderRadius: 12,
              border: "1px solid rgba(255,255,255,0.12)",
              background: "#111317",
              padding: 32,
              textAlign: "center",
            }}
          >
            <p
              style={{
                margin: 0,
                fontFamily: "ui-monospace, 'Cascadia Mono', Consolas, monospace",
                fontSize: 11,
                textTransform: "uppercase",
                letterSpacing: "0.18em",
                color: "#8A9099",
              }}
            >
              AfterDesk
            </p>
            <h1 style={{ margin: "20px 0 0", fontSize: 24, fontWeight: 600 }}>
              The application could not load.
            </h1>
            <p style={{ margin: "12px 0 0", fontSize: 14, lineHeight: 1.6, color: "#9AA1AB" }}>
              Your request may not have completed. Try loading the application again.
            </p>
            <button
              type="button"
              onClick={reset}
              style={{
                marginTop: 28,
                minHeight: 44,
                borderRadius: 9999,
                border: "none",
                background: "#F7F6F3",
                padding: "0 20px",
                fontSize: 14,
                fontWeight: 600,
                color: "#14161A",
                cursor: "pointer",
              }}
            >
              Try again
            </button>
          </div>
        </main>
      </body>
    </html>
  );
}
