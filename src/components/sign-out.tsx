"use client";

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
  const cls =
    tone === "night"
      ? "min-h-11 rounded-md px-2.5 py-1.5 text-[13px] font-medium text-[#8A9099] transition-colors duration-150 hover:text-[#F7F6F3] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-[#0A0B0D]"
      : "min-h-11 rounded-md px-2.5 py-1.5 text-[13px] font-medium text-[#5B6069] transition-colors duration-150 hover:text-[#14161A] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#14161A] focus-visible:ring-offset-2 focus-visible:ring-offset-[#F7F6F3]";
  return (
    <button
      type="button"
      className={cls}
      onClick={async () => {
        await authClient.signOut();
        window.location.href = home;
      }}
    >
      Sign out
    </button>
  );
}
