"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { LoginForm } from "@/components/register-forms";

/**
 * The login window. Rendered by the intercepted route (src/app/@modal/(.)
 * login) over whatever page the user was already on, so "Sign in" no longer
 * throws you off the page you were reading onto a blank one.
 *
 * A native <dialog> does the heavy lifting a hand-rolled overlay would
 * otherwise need reinventing: top-layer stacking (nothing else needs a
 * z-index war with it), a built-in focus trap, Escape-to-close, and a
 * ::backdrop pseudo-element styled in globals.css. showModal() is called
 * from an effect because <dialog> has no declarative "open as modal" prop —
 * only the imperative method opens it in the modal (not just non-modal
 * visible) state that gets top-layer + focus-trap + inert-background
 * behavior.
 *
 * Closing always calls router.back(): the intercepting route pushed a
 * history entry when the modal opened, so back() removes it and returns to
 * the exact page underneath — never a hardcoded "/" that would strand a
 * worker who opened this from deep inside /academy.
 */
export function LoginModal({
  googleEnabled,
  next,
  applied,
  workerAudience = false,
}: {
  googleEnabled: boolean;
  next?: string;
  applied: boolean;
  workerAudience?: boolean;
}) {
  const router = useRouter();
  const dialogRef = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    dialog.showModal();
    // Most browsers do not scroll-lock the page behind a top-layer <dialog>
    // on their own; without this, the marketing page underneath keeps
    // scrolling while the modal stays pinned mid-viewport.
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = "";
    };
  }, []);

  function close() {
    // The native "close" event (also fired by Escape) lands here too, so
    // there is exactly one way this modal ever leaves the screen.
    router.back();
  }

  return (
    <dialog
      ref={dialogRef}
      className="ss-modal fixed inset-0 m-auto w-[calc(100%-2rem)] max-w-[420px] overflow-hidden rounded-xl border border-white/[0.14] bg-[#14161A]/60 shadow-[inset_0_1px_0_rgba(255,255,255,0.12),0_24px_64px_-16px_rgba(0,0,0,0.6)] backdrop-blur-2xl backdrop-saturate-150"
      onClose={close}
      onCancel={close}
      onClick={(e) => {
        // The backdrop is a pseudo-element behind the dialog box, but a
        // click that lands on the <dialog> element itself (not one of its
        // children) is a click on the box's own padding-less edge — i.e.
        // outside the visible card. Treat it the same as a backdrop click.
        if (e.target === dialogRef.current) close();
      }}
      onKeyDown={(e) => {
        // Belt-and-suspenders alongside the native "cancel" event: the
        // browser's own Escape-closes-the-topmost-dialog behavior keys off
        // the physical key code, and at least one automated test harness
        // was observed dispatching a keydown with key:"Escape" but an empty
        // code/keyCode — which onCancel above never sees fire. A real
        // keyboard always sets both, so this is redundant for a real user
        // and load-bearing for anything that isn't.
        if (e.key === "Escape") close();
      }}
    >
      <div className="p-6 sm:p-7">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="font-mono text-[11px] font-medium uppercase tracking-[0.16em] text-white/50">
              Sign in
            </p>
            <h1 className="mt-1.5 text-[26px] font-semibold leading-[1.1] tracking-[-0.02em] text-white">
              Welcome back.
            </h1>
          </div>
          <button
            type="button"
            onClick={close}
            aria-label="Close"
            className="-mr-1.5 -mt-1 flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-white/50 transition-colors duration-150 hover:bg-white/10 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/60"
          >
            <svg aria-hidden viewBox="0 0 20 20" className="h-4 w-4" fill="none">
              <path
                d="M5 5l10 10M15 5L5 15"
                stroke="currentColor"
                strokeWidth="1.6"
                strokeLinecap="round"
              />
            </svg>
          </button>
        </div>

        {applied ? (
          <p
            role="status"
            className="mt-4 rounded-md border-l-[3px] border-[#3DDCA0] bg-[#3DDCA0]/[0.1] px-3 py-2.5 text-sm leading-relaxed text-white"
          >
            Application received — sign in to continue.
          </p>
        ) : null}

        <div className="mt-5">
          <LoginForm
            googleEnabled={googleEnabled}
            next={next}
            tone="glass"
            workerAudience={workerAudience}
          />
        </div>
      </div>

      <div className="border-t border-white/10 bg-white/[0.04] px-6 py-3.5 text-[13px] leading-relaxed text-white/55 sm:px-7">
        No account yet?{" "}
        <Link href="/register" className="font-medium text-white underline decoration-white/30 underline-offset-2 transition-colors duration-150 hover:decoration-white">
          Client sign-up
        </Link>{" "}
        ·{" "}
        <Link href="/register/va" className="font-medium text-white underline decoration-white/30 underline-offset-2 transition-colors duration-150 hover:decoration-white">
          Specialist application
        </Link>
      </div>
    </dialog>
  );
}
