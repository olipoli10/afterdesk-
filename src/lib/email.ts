import "server-only";

/**
 * Transactional email. Uses Resend when RESEND_API_KEY is set; otherwise falls
 * back to writing the message to the server console so local development works
 * with no account and no keys.
 *
 * RULE 1: templates must never carry the counterpart's name or email. Only
 * platform-owned From/Reply-To addresses are used.
 */

type SendArgs = {
  to: string;
  subject: string;
  text: string;
};

export async function sendEmail({ to, subject, text }: SendArgs): Promise<void> {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.EMAIL_FROM || "AfterDesk <onboarding@resend.dev>";

  if (!apiKey) {
    if (process.env.NODE_ENV === "production") {
      throw new Error("RESEND_API_KEY must be configured before production email can be sent.");
    }
    console.info(
      `\n──────── EMAIL (dev — no RESEND_API_KEY set) ────────\n` +
        `To:      ${to}\n` +
        `Subject: ${subject}\n\n${text}\n` +
        `────────────────────────────────────────────────────\n`
    );
    return;
  }

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ from, to, subject, text }),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Email send failed (${res.status}): ${body}`);
  }
}
