"use client";

import { authClient } from "@/lib/auth-client";

export function SignOutButton() {
  return (
    <button
      type="button"
      className="rounded-md px-2.5 py-1.5 text-[13px] font-medium text-neutral-500 hover:bg-neutral-100 hover:text-neutral-900"
      onClick={async () => {
        await authClient.signOut();
        window.location.href = "/login";
      }}
    >
      Sign out
    </button>
  );
}
