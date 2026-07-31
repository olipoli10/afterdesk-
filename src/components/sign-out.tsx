"use client";

import { authClient } from "@/lib/auth-client";

export function SignOutButton({ tone = "paper" }: { tone?: "paper" | "night" }) {
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
        window.location.href = "/login";
      }}
    >
      Sign out
    </button>
  );
}
