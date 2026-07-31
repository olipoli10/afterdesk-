"use client";

import { useState } from "react";
import { authClient } from "@/lib/auth-client";

/**
 * `home` is where signing out lands. It used to be hardcoded to /login, which
 * answered a question nobody asked — someone who just left the app wants the
 * storefront, not a form. The worker portal passes /workers, everyone else
 * gets the client homepage.
 */
export function SignOutButton({
  tone = "paper",
  home = "/",
}: {
  tone?: "paper" | "night";
  home?: string;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const night = tone === "night";
  const cls = night
    ? "min-h-11 rounded-md px-2.5 py-1.5 text-[13px] font-medium text-[#8A9099] transition-colors duration-150 hover:text-[#F7F6F3] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-[#0A0B0D] disabled:cursor-not-allowed disabled:opacity-40"
    : "min-h-11 rounded-md px-2.5 py-1.5 text-[13px] font-medium text-[#5B6069] transition-colors duration-150 hover:text-[#14161A] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#14161A] focus-visible:ring-offset-2 focus-visible:ring-offset-[#F7F6F3] disabled:cursor-not-allowed disabled:opacity-40";

  /**
   * The redirect only happens on a confirmed sign-out. better-auth resolves
   * with `{ error }` instead of throwing, so a 429 from the auth rate limiter
   * (src/lib/auth.ts) or an offline blip used to fall through to the redirect
   * with the session cookie still live — and every `home` here ("/" and
   * "/workers") bounces a signed-in account straight back into its portal, so
   * the click read as "sign out did nothing".
   */
  async function signOut() {
    setBusy(true);
    setError(null);
    const { error } = await authClient.signOut();
    if (error) {
      setError(error.message ?? "Sign out failed. Try again.");
      setBusy(false);
      return;
    }
    window.location.href = home;
  }

  return (
    <span className="relative inline-flex">
      <button type="button" className={cls} disabled={busy} onClick={signOut}>
        {busy ? "Signing out…" : "Sign out"}
      </button>
      {error ? (
        <span
          role="alert"
          className={`absolute right-0 top-full z-50 mt-1 w-56 rounded-md border border-[#A23B2E]/40 px-2.5 py-2 text-[12px] leading-snug ${
            night ? "bg-[#111317] text-[#FF9A8B]" : "bg-white text-[#8C2F23]"
          }`}
        >
          {error} You are still signed in.
        </span>
      ) : null}
    </span>
  );
}
