"use client";

/* ENDVERA public narrative.
   The document owns the pace: every section stays in normal flow. A single
   powered vein connects intake to the coordination heart, while the one A2
   concierge appears only at three explanatory stations. */

import { useEffect, useRef, useState } from "react";
import { A2Concierge, type ConciergeCopy } from "@/app/_home/a2-concierge";
import type { V7ActsCopy } from "@/lib/i18n/v7-acts";

type StopName = "scope" | "core" | "verification";

const STOP_SCENES: Record<StopName, keyof ConciergeCopy["guide"]> = {
  scope: "solution",
  core: "run",
  verification: "review",
};

function AccentLine({ text, accent }: { text: string; accent: string }) {
  const at = text.indexOf(accent);
  if (at < 0) return <>{text}</>;
  return (
    <>
      {text.slice(0, at)}
      <span data-copy-accent="" className="text-[#D87526]">{accent}</span>
      {text.slice(at + accent.length)}
    </>
  );
}

function CircuitRule() {
  return (
    <span aria-hidden className="flex items-center gap-1.5">
      <i className="h-[5px] w-[5px] rotate-45 border border-[#6F4C29] bg-[#15110A]" />
      <i className="h-px w-12 bg-gradient-to-r from-[#6F4C29]/80 to-transparent" />
    </span>
  );
}

function StaticArtifact({ state }: { state: "request" | "locked" | "checked" }) {
  return (
    <span
      aria-hidden
      data-static-artifact={state}
      className="relative block h-[34px] w-[52px] overflow-hidden rounded-[3px] border border-[#4A3A26] bg-[#14171D] shadow-[0_5px_18px_rgba(0,0,0,0.38)]"
    >
      {state === "checked" && <i className="absolute inset-0 bg-[#F7F6F3]" />}
      <i className="absolute inset-y-[3px] left-[3px] w-[2px] rounded-full bg-[#C9A76A]" />
      {state !== "request" && <i className="absolute inset-x-[9px] top-[4px] h-[4px] rounded-sm bg-[#C9A76A]" />}
      <i className="absolute bottom-[7px] left-[11px] right-[7px] flex flex-col gap-[4px]">
        <b className="block h-[2px] w-[82%] rounded bg-[#78808B]" />
        <b className="block h-[2px] w-[58%] rounded bg-[#78808B]" />
        <b className="block h-[2px] w-[70%] rounded bg-[#78808B]" />
      </i>
      {state === "checked" && (
        <i className="absolute inset-0 grid place-items-center pl-1 font-mono text-[17px] font-bold not-italic text-[#14161A]">✓</i>
      )}
    </span>
  );
}

export function SimplicityActs({ copy, concierge, children }: {
  copy: V7ActsCopy;
  concierge: ConciergeCopy;
  children?: React.ReactNode;
}) {
  const rootRef = useRef<HTMLDivElement | null>(null);
  const veinRef = useRef<SVGSVGElement | null>(null);
  const [typed, setTyped] = useState("");

  useEffect(() => {
    const root = rootRef.current;
    const vein = veinRef.current;
    if (!root || !vein) return;

    const dock = root.querySelector<HTMLElement>("[data-a2-dock]");
    const start = root.querySelector<HTMLElement>("[data-primary-vein-start]");
    const runIn = root.querySelector<HTMLElement>("[data-managed-run-intake]");
    const runOut = root.querySelector<HTMLElement>("[data-managed-run-output]");
    const heartIntake = root.querySelector<HTMLElement>("[data-heart-intake]");
    const heartTarget = root.querySelector<HTMLElement>("[data-heart-target]");
    const stops = [...root.querySelectorAll<HTMLElement>("[data-a2-stop-anchor]")];
    const bed = vein.querySelector<SVGPathElement>("[data-primary-vein-bed]");
    const current = vein.querySelector<SVGPathElement>("[data-primary-vein-current]");
    if (!dock || !start || !runIn || !runOut || !heartIntake || !heartTarget || stops.length !== 3 || !bed || !current) return;

    let active: "hero" | "off" | StopName = "hero";
    let popTimer: ReturnType<typeof setTimeout> | null = null;
    const ratios = new Map<HTMLElement, number>();

    const layoutPoint = (element: HTMLElement) => {
      let x = 0;
      let y = 0;
      let node: HTMLElement | null = element;
      while (node) {
        x += node.offsetLeft;
        y += node.offsetTop;
        node = node.offsetParent as HTMLElement | null;
      }
      return { x, y };
    };

    const placeAt = (anchor: HTMLElement) => {
      const home = layoutPoint(dock);
      const target = layoutPoint(anchor);
      const x = Math.round(target.x + (anchor.offsetWidth - dock.offsetWidth) / 2 - home.x);
      const y = Math.round(target.y + (anchor.offsetHeight - dock.offsetHeight) / 2 - home.y);
      dock.style.setProperty("--a2-stop-x", `${x}px`);
      dock.style.setProperty("--a2-stop-y", `${y}px`);
    };

    const expose = (next: "hero" | "off" | StopName) => {
      active = next;
      if (popTimer) {
        clearTimeout(popTimer);
        popTimer = null;
      }

      if (next === "hero") {
        dock.style.removeProperty("--a2-stop-x");
        dock.style.removeProperty("--a2-stop-y");
        dock.removeAttribute("data-a2-stop");
        dock.setAttribute("data-a2-scene", "hero");
        dock.removeAttribute("aria-hidden");
        dock.removeAttribute("inert");
        return;
      }

      if (next === "off") {
        dock.setAttribute("data-a2-stop", "off");
        dock.setAttribute("aria-hidden", "true");
        dock.setAttribute("inert", "");
        return;
      }

      const anchor = stops.find((candidate) => candidate.dataset.a2StopAnchor === next);
      if (!anchor) return;
      dock.setAttribute("data-a2-stop", "off");
      dock.setAttribute("aria-hidden", "true");
      dock.setAttribute("inert", "");
      placeAt(anchor);

      const reveal = () => {
        popTimer = null;
        dock.setAttribute("data-a2-stop", next);
        dock.setAttribute("data-a2-scene", STOP_SCENES[next]);
        dock.removeAttribute("aria-hidden");
        dock.removeAttribute("inert");
      };
      const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      popTimer = setTimeout(reveal, reduced ? 0 : 90);
    };

    const measureVein = () => {
      const rootBox = root.getBoundingClientRect();
      const width = Math.max(1, root.clientWidth);
      const height = Math.max(1, root.scrollHeight);
      const pointAt = (element: HTMLElement) => {
        const box = element.getBoundingClientRect();
        return {
          x: box.left - rootBox.left + box.width / 2,
          y: box.top - rootBox.top + box.height / 2,
        };
      };
      const startPoint = pointAt(start);
      const runInPoint = pointAt(runIn);
      const runOutPoint = pointAt(runOut);
      const heartIntakePoint = pointAt(heartIntake);
      const heartTargetPoint = pointAt(heartTarget);
      const gutter = Math.min(width - 24, Math.max(startPoint.x, width * 0.88));
      const firstBend = startPoint.y + Math.max(90, (runInPoint.y - startPoint.y) * 0.28);
      const runApproach = runInPoint.y - Math.max(84, (runInPoint.y - startPoint.y) * 0.18);
      const heartDeparture = runOutPoint.y + Math.max(72, (heartIntakePoint.y - runOutPoint.y) * 0.3);
      const heartApproach = heartIntakePoint.y - Math.max(72, (heartIntakePoint.y - runOutPoint.y) * 0.24);
      const path = [
        `M ${startPoint.x} ${startPoint.y}`,
        `C ${gutter} ${firstBend}, ${gutter} ${runApproach}, ${runInPoint.x} ${runInPoint.y}`,
        `L ${runOutPoint.x} ${runOutPoint.y}`,
        `C ${runOutPoint.x} ${heartDeparture}, ${heartIntakePoint.x} ${heartApproach}, ${heartIntakePoint.x} ${heartIntakePoint.y}`,
        `L ${heartTargetPoint.x} ${heartTargetPoint.y}`,
      ].join(" ");

      vein.setAttribute("viewBox", `0 0 ${width} ${height}`);
      vein.style.height = `${height}px`;
      bed.setAttribute("d", path);
      current.setAttribute("d", path);

      if (active !== "hero" && active !== "off") {
        const anchor = stops.find((candidate) => candidate.dataset.a2StopAnchor === active);
        if (anchor) placeAt(anchor);
      }
    };

    const resizeObserver = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(measureVein);
    resizeObserver?.observe(root);
    resizeObserver?.observe(start);
    resizeObserver?.observe(runIn);
    resizeObserver?.observe(runOut);
    resizeObserver?.observe(heartIntake);
    resizeObserver?.observe(heartTarget);
    measureVein();
    void document.fonts?.ready.then(measureVein);

    const intersectionObserver = typeof IntersectionObserver === "undefined" ? null : new IntersectionObserver(
      (entries) => {
        for (const entry of entries) ratios.set(entry.target as HTMLElement, entry.isIntersecting ? entry.intersectionRatio : 0);
        const visible = stops
          .filter((stop) => (ratios.get(stop) ?? 0) > 0)
          .sort((a, b) => (ratios.get(b) ?? 0) - (ratios.get(a) ?? 0))[0];

        if (visible) {
          const next = visible.dataset.a2StopAnchor as StopName;
          if (next !== active) expose(next);
          return;
        }

        const beforeFirstStop = stops[0].getBoundingClientRect().top > window.innerHeight * 0.58;
        const next = beforeFirstStop ? "hero" : "off";
        if (next !== active) expose(next);
      },
      { rootMargin: "-16% 0px -46% 0px", threshold: [0, 0.15, 0.45, 0.8] },
    );
    for (const stop of stops) intersectionObserver?.observe(stop);

    return () => {
      if (popTimer) clearTimeout(popTimer);
      resizeObserver?.disconnect();
      intersectionObserver?.disconnect();
      dock.style.removeProperty("--a2-stop-x");
      dock.style.removeProperty("--a2-stop-y");
      dock.removeAttribute("data-a2-stop");
      dock.removeAttribute("aria-hidden");
      dock.removeAttribute("inert");
      dock.setAttribute("data-a2-scene", "hero");
    };
  }, []);

  const mono = "font-mono text-[10px] uppercase tracking-[0.16em]";

  return (
    <div ref={rootRef} data-v7-acts="" className="relative overflow-x-clip bg-[#08090B] text-[#F7F6F3]">
      <style>{`
        [data-v7-acts] {
          --amber: #D87526;
          --gold: #C9A76A;
          --graphite: #262B35;
        }
        [data-v7-acts] [data-fabric] {
          background-image:
            repeating-linear-gradient(0deg, rgba(154,161,171,.035) 0 1px, transparent 1px 32px),
            repeating-linear-gradient(90deg, rgba(154,161,171,.035) 0 1px, transparent 1px 32px),
            repeating-linear-gradient(0deg, rgba(154,161,171,.04) 0 1px, transparent 1px 160px),
            repeating-linear-gradient(90deg, rgba(154,161,171,.04) 0 1px, transparent 1px 160px);
        }
        [data-primary-vein] {
          position: absolute;
          inset: 0 auto auto 0;
          z-index: 1;
          width: 100%;
          overflow: visible;
          pointer-events: none;
        }
        [data-primary-vein-bed] {
          fill: none;
          stroke: rgba(111, 76, 41, .56);
          stroke-width: 11;
          stroke-linecap: round;
          filter: drop-shadow(0 0 7px rgba(216, 117, 38, .2));
        }
        [data-primary-vein-current] {
          fill: none;
          stroke: url(#v7-power-gradient);
          stroke-width: 3;
          stroke-linecap: round;
          stroke-dasharray: .075 .925;
          stroke-dashoffset: 0;
          filter: drop-shadow(0 0 5px rgba(240, 161, 74, .9));
          animation: v7powerflow 3.4s linear infinite;
        }
        [data-primary-vein-start], [data-managed-run-intake], [data-managed-run-output], [data-heart-intake] {
          box-shadow: inset 0 0 6px rgba(255,210,142,.58), 0 0 15px rgba(216,117,38,.36);
        }
        [data-managed-run] {
          animation: v7managedpulse 4.6s ease-in-out infinite;
        }
        [data-managed-run-channel], [data-heart-throughput] {
          background: linear-gradient(180deg, rgba(111,76,41,.25), #FFD28E 42%, #D87526 58%, rgba(111,76,41,.25));
          box-shadow: 0 0 14px rgba(240,161,74,.52);
          animation: v7channelpulse 2.3s ease-in-out infinite;
        }
        [data-a2-stop-anchor] {
          position: relative;
          width: 76px;
          height: 76px;
          flex: 0 0 76px;
        }
        [data-a2-stop-anchor]::before {
          content: "";
          position: absolute;
          left: 10px;
          right: 10px;
          bottom: 7px;
          height: 1px;
          background: linear-gradient(90deg, transparent, rgba(201,167,106,.58), transparent);
        }
        [data-a2-stop-anchor]::after {
          content: "";
          position: absolute;
          left: 50%;
          bottom: 4px;
          width: 7px;
          height: 7px;
          border: 1px solid rgba(216,117,38,.75);
          background: #15110A;
          transform: translateX(-50%) rotate(45deg);
          box-shadow: 0 0 10px rgba(216,117,38,.28);
        }
        [data-core-heart] {
          animation: v7heartbeat 4.6s ease-in-out infinite;
          transform-origin: center;
        }
        [data-heart-seam] {
          background: linear-gradient(180deg, rgba(111,76,41,.25), #FFD28E, rgba(111,76,41,.25));
          box-shadow: 0 0 14px rgba(240,161,74,.52);
        }
        [data-heart-aura] {
          box-shadow: inset 0 0 30px rgba(240,161,74,.12), 0 0 24px rgba(216,117,38,.14);
        }
        [data-engine-module] {
          background: linear-gradient(145deg, rgba(25,29,37,.92), rgba(13,15,20,.98));
        }
        [data-power-fill] {
          background: linear-gradient(90deg, rgba(216,117,38,.18), rgba(240,161,74,.72), rgba(216,117,38,.18));
        }
        @keyframes v7powerflow { to { stroke-dashoffset: -1; } }
        @keyframes v7heartbeat {
          0%, 62%, 72%, 100% { transform: scale(1); filter: brightness(1); }
          66% { transform: scale(1.018); filter: brightness(1.3); }
          76% { transform: scale(1.012); filter: brightness(1.2); }
        }
        @keyframes v7managedpulse {
          0%, 62%, 72%, 100% { border-color: #332A20; box-shadow: 0 0 0 rgba(216,117,38,0); filter: brightness(1); }
          66% { border-color: #8A582E; box-shadow: 0 0 34px rgba(216,117,38,.17); filter: brightness(1.12); }
          76% { border-color: #614124; box-shadow: 0 0 24px rgba(216,117,38,.11); filter: brightness(1.07); }
        }
        @keyframes v7channelpulse {
          0%, 100% { opacity: .46; filter: brightness(.8); }
          50% { opacity: 1; filter: brightness(1.35); }
        }
        @media (max-width: 639px) {
          [data-site-header] + main [data-act="1"] {
            min-height: 0;
            align-items: flex-start;
            padding: 6.25rem 1rem 1.5rem;
          }
          [data-hero-shell] {
            padding: 1rem;
            border-radius: 11px;
          }
          [data-hero-grid] { gap: .75rem; }
          [data-hero-title] {
            margin-top: 0;
            font-size: clamp(2.15rem, 11.5vw, 2.8rem);
            line-height: .92;
          }
          [data-hero-copy] {
            margin-top: .8rem;
            font-size: .78rem;
            line-height: 1.48;
          }
          [data-hero-field] { margin-top: .85rem; }
          [data-hero-field-control] { min-height: 44px; padding-inline: .75rem; }
          [data-hero-field-control] input { padding-block: .65rem; font-size: .76rem; }
          [data-hero-field-note] { margin-top: .25rem; font-size: .5rem; }
          [data-intake-console] {
            display: grid;
            grid-template-columns: minmax(0, 1fr) 76px;
            grid-template-areas:
              "status a2"
              "title a2"
              "manifest a2";
            column-gap: .65rem;
            padding: .7rem;
          }
          [data-console-status] { grid-area: status; }
          [data-console-manifest-title] { grid-area: title; margin-top: .45rem; }
          [data-console-manifest] {
            grid-area: manifest;
            display: grid;
            grid-template-columns: repeat(2, minmax(0, 1fr));
            gap: .32rem .5rem;
            margin-top: .45rem;
          }
          [data-console-manifest] li { gap: .3rem; font-size: .61rem; line-height: 1.25; }
          [data-console-manifest] li > span:nth-child(2) { display: none; }
          [data-a2-home] {
            grid-area: a2;
            min-height: 76px;
            margin-top: 0;
            align-self: center;
            border-top: 0;
            padding-top: 0;
          }
          [data-mobile-fragment-stack] { display: none; }
        }
        @media (prefers-reduced-motion: reduce) {
          [data-primary-vein-current] { animation: none; stroke-dasharray: .14 .86; }
          [data-managed-run], [data-managed-run-channel], [data-heart-throughput] { animation: none; }
          [data-core-heart] { animation: none; filter: brightness(1.08); }
        }
      `}</style>

      <p className="sr-only">{copy.srStory}</p>
      <div aria-hidden data-fabric="" className="pointer-events-none absolute inset-0 z-0" />
      <svg ref={veinRef} aria-hidden focusable="false" data-primary-vein="" preserveAspectRatio="none">
        <defs>
          <linearGradient id="v7-power-gradient" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0" stopColor="#6F4C29" />
            <stop offset=".45" stopColor="#F0A14A" />
            <stop offset=".62" stopColor="#FFD28E" />
            <stop offset="1" stopColor="#D87526" />
          </linearGradient>
        </defs>
        <path data-primary-vein-bed="" pathLength="1" />
        <path data-primary-vein-current="" pathLength="1" />
      </svg>

      <section data-act="1" data-v7-sem="what" className="relative z-30 mx-auto flex min-h-[92svh] w-full max-w-[1180px] items-center px-5 pb-16 pt-28 sm:px-8 sm:pb-24 sm:pt-36">
        <div data-hero-shell="" className="relative w-full overflow-visible rounded-[14px] border border-[#252B35] bg-[linear-gradient(155deg,rgba(25,29,37,.98),rgba(10,12,16,.99))] px-5 py-8 shadow-[0_36px_100px_rgba(0,0,0,.52)] sm:px-10 sm:py-12">
          <span aria-hidden className="absolute inset-x-10 top-0 h-px bg-gradient-to-r from-transparent via-[#C9A76A]/75 to-transparent" />
          <span aria-hidden className="absolute left-4 top-4 h-3 w-3 border-l border-t border-[#48505E]" />
          <span aria-hidden className="absolute right-4 top-4 h-3 w-3 border-r border-t border-[#48505E]" />

          <div data-hero-grid="" className="relative z-10 grid gap-10 lg:grid-cols-[minmax(0,1fr)_310px] lg:items-end">
            <div>
              <h1 data-hero-title="" className="max-w-[16ch] text-[clamp(2.65rem,7vw,5.8rem)] font-semibold leading-[.94] tracking-[-.065em]">
                <AccentLine text={copy.act1.h} accent={copy.act1.accent} />
              </h1>
              <p data-hero-copy="" className="mt-6 max-w-[60ch] text-[15px] leading-[1.7] text-[#A6ADB8] sm:text-[17px]">{copy.act1.sub}</p>

              <label data-hero-field="" className="mt-9 block max-w-[670px]">
                <span className="sr-only">{copy.act1.placeholder}</span>
                <span data-hero-field-control="" className="relative flex min-h-14 items-center rounded-[7px] border border-[#343B47] bg-[#0C0F14] px-4 shadow-[inset_0_0_0_1px_rgba(255,255,255,.015)] focus-within:border-[#C9A76A]/70">
                  <input
                    value={typed}
                    onChange={(event) => setTyped(event.target.value)}
                    placeholder={copy.act1.placeholder}
                    className="min-w-0 flex-1 bg-transparent py-4 text-[15px] text-[#F7F6F3] outline-none placeholder:text-[#69717E]"
                  />
                  <span aria-hidden className="ml-3 h-2 w-2 rotate-45 border border-[#D87526] bg-[#23170E] shadow-[0_0_9px_rgba(216,117,38,.45)]" />
                </span>
                <span data-hero-field-note="" className="mt-2 block font-mono text-[9.5px] leading-relaxed text-[#69717E]">{copy.act1.note}</span>
              </label>
            </div>

            <aside data-intake-console="" className="relative rounded-[9px] border border-[#2C333E] bg-[#0D1015]/95 p-4">
              <div data-console-status="" className="flex items-center justify-between gap-4">
                <span className={`${mono} text-[#8F98A6]`}>{typed ? copy.instrument.receiving : copy.instrument.awaiting}</span>
                <StaticArtifact state={typed ? "locked" : "request"} />
              </div>
              <p data-console-manifest-title="" className="mt-5 font-mono text-[10px] uppercase tracking-[.14em] text-[#D87526]">{copy.instrument.manifestTitle}</p>
              <ul data-console-manifest="" className="mt-3 space-y-2.5">
                {copy.instrument.manifest.map((item, index) => (
                  <li key={item} className="flex items-center gap-3 text-[12px] text-[#AAB1BC]">
                    <span className="font-mono text-[9px] text-[#6F4C29]">0{index + 1}</span>
                    <span className="h-px flex-1 bg-[#242A34]" />
                    {item}
                  </li>
                ))}
              </ul>
              <div data-a2-home="" className="mt-5 flex min-h-[82px] items-end justify-end border-t border-[#222832] pt-2">
                <A2Concierge copy={concierge} />
              </div>
            </aside>
          </div>

          <span aria-hidden data-intake-bus="" className="absolute inset-x-0 bottom-0 z-[4] flex items-center">
            <i className="h-px flex-1 bg-gradient-to-r from-transparent via-[#6F4C29] to-[#D87526]" />
            <i
              data-primary-vein-start=""
              className="h-[18px] w-[18px] shrink-0 translate-y-1/2 rotate-45 rounded-[3px] border border-[#D87526] bg-[#17110A]"
            />
            <i className="h-px flex-1 bg-gradient-to-l from-transparent via-[#6F4C29] to-[#D87526]" />
          </span>
        </div>
      </section>

      <section data-act="2" data-v7-sem="problem" className="relative z-10 mx-auto w-full max-w-[1180px] px-5 py-20 sm:px-8 sm:py-28">
        <div className="grid gap-10 lg:grid-cols-[.8fr_1.2fr] lg:gap-16">
          <div>
            <CircuitRule />
            <h2 className="mt-6 max-w-[18ch] text-[clamp(2rem,5vw,4rem)] font-semibold leading-[1.02] tracking-[-.055em]">
              <AccentLine text={copy.act2.h} accent={copy.act2.accent} />
            </h2>
            <p className="mt-6 max-w-[54ch] text-[15px] leading-[1.75] text-[#9FA7B3]">{copy.act2.sub}</p>
          </div>
          <div data-mobile-fragment-stack="" className="grid gap-3 sm:grid-cols-2">
            {copy.act2.fragments.map((fragment, index) => (
              <article key={fragment.label} className="relative min-h-[112px] overflow-hidden rounded-[8px] border border-[#252B35] bg-[#101319]/92 p-4">
                <span aria-hidden className="absolute right-3 top-3 font-mono text-[9px] text-[#4D5561]">0{index + 1}</span>
                <p className="font-mono text-[10px] uppercase tracking-[.14em] text-[#C7CCD4]">{fragment.label}</p>
                <p className="mt-4 text-[13px] text-[#7F8793]">{fragment.meta}</p>
                <span aria-hidden className="absolute bottom-0 left-0 h-px w-1/3 bg-gradient-to-r from-[#D87526]/55 to-transparent" />
              </article>
            ))}
          </div>
        </div>
      </section>

      <section data-act="2b" data-v7-sem="solution" className="relative z-10 mx-auto w-full max-w-[1180px] px-5 py-20 sm:px-8 sm:py-28">
        <div data-managed-run="" className="relative overflow-visible rounded-[12px] border border-[#332A20] bg-[linear-gradient(135deg,rgba(29,23,16,.98),rgba(12,14,18,.99)_58%)] px-6 py-10 sm:px-10 sm:py-14">
          <span
            aria-hidden
            data-managed-run-intake=""
            className="absolute left-1/2 top-[-9px] z-[4] h-[18px] w-[18px] -translate-x-1/2 rotate-45 rounded-[3px] border border-[#D87526] bg-[#17110A]"
          />
          <span aria-hidden data-managed-run-channel="" className="absolute bottom-0 left-1/2 top-0 z-0 w-[2px] -translate-x-1/2 opacity-70" />
          <span
            aria-hidden
            data-managed-run-output=""
            className="absolute bottom-[-9px] left-1/2 z-[4] h-[18px] w-[18px] -translate-x-1/2 rotate-45 rounded-[3px] border border-[#D87526] bg-[#17110A]"
          />
          <span aria-hidden className="absolute inset-y-0 left-0 w-px bg-gradient-to-b from-transparent via-[#D87526] to-transparent opacity-70" />
          <div className="relative z-10 flex items-start justify-between gap-5">
            <div>
              <p className={`${mono} text-[#D87526]`}>{copy.solution.eyebrow}</p>
              <h2 className="mt-5 max-w-[19ch] text-[clamp(2rem,4.7vw,3.8rem)] font-semibold leading-[1.02] tracking-[-.055em]">
                <AccentLine text={copy.solution.h} accent={copy.solution.accent} />
              </h2>
              <p className="mt-5 max-w-[58ch] text-[15px] leading-[1.7] text-[#B2A996]">{copy.solution.sub}</p>
            </div>
            <div
              data-a2-stop-anchor="scope"
              data-a2-stop-scene="solution"
              data-a2-stop-copy={concierge.guide.solution}
              aria-label={concierge.guide.solution}
            />
          </div>
          <div className="relative z-10 mt-9 grid gap-3 sm:grid-cols-3">
            {copy.engine.boundaryItems.map((item, index) => (
              <div key={item} className="rounded-[6px] border border-[#3A3025] bg-[#111217]/80 px-4 py-3">
                <span className="font-mono text-[9px] text-[#D87526]">0{index + 1}</span>
                <p className="mt-2 text-[12px] text-[#D0C8B8]">{item}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section data-act="3" data-v7-sem="how" className="relative z-10 mx-auto w-full max-w-[1180px] px-5 py-20 sm:px-8 sm:py-28">
        <div className="flex items-start justify-between gap-5">
          <div>
            <CircuitRule />
            <h2 className="mt-6 max-w-[21ch] text-[clamp(2rem,5vw,4rem)] font-semibold leading-[1.02] tracking-[-.055em]">
              <AccentLine text={copy.act3.h} accent={copy.act3.accent} />
            </h2>
          </div>
          <div
            data-a2-stop-anchor="core"
            data-a2-stop-scene="run"
            data-a2-stop-copy={concierge.guide.run}
            aria-label={concierge.guide.run}
          />
        </div>

        <div data-living-engine="" className="relative mt-12 w-full overflow-visible rounded-[13px] border border-[#343B47] bg-[#0D1015]/96 p-4 shadow-[0_26px_80px_rgba(0,0,0,.48)] sm:p-7">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#252B35] pb-4">
            <p className={`${mono} text-[#C9A76A]`}>{copy.engine.title}</p>
            <span className="rounded-[3px] border border-[#3E3427] bg-[#16120D] px-2.5 py-1 font-mono text-[9px] uppercase tracking-[.13em] text-[#D87526]">{copy.engine.standardStatus}</span>
          </div>

          <div className="mt-6 grid gap-4 lg:grid-cols-[.8fr_1.5fr_.8fr] lg:items-stretch">
            <aside data-engine-boundary="" className="rounded-[8px] border border-[#282E38] bg-[#11141A] p-4">
              <p className={`${mono} text-[#8F98A6]`}>{copy.engine.boundary}</p>
              <ul className="mt-5 space-y-4">
                {copy.engine.boundaryItems.map((item, index) => (
                  <li key={item} className="flex gap-3 text-[12px] leading-relaxed text-[#B4BBC5]">
                    <span className="mt-1 font-mono text-[9px] text-[#D87526]">0{index + 1}</span>
                    {item}
                  </li>
                ))}
              </ul>
            </aside>

            <div data-engine-core="" className="relative rounded-[9px] border border-[#403424] bg-[radial-gradient(circle_at_50%_45%,rgba(216,117,38,.13),transparent_48%),#0B0E13] p-4 sm:p-5">
              <span
                aria-hidden
                data-heart-intake=""
                className="absolute left-1/2 top-[-10px] z-[4] h-[19px] w-[19px] -translate-x-1/2 rotate-45 rounded-[4px] border border-[#D87526] bg-[#17110A]"
              />
              <div data-coordination-heart="" className="relative mx-auto max-w-[420px] pt-4">
                <div data-core-heart="" className="relative isolate min-h-[160px] overflow-hidden rounded-[10px] border border-[#6F4C29] bg-[#0C0F14] px-5 py-7 text-center">
                  <span aria-hidden data-heart-aura="" className="absolute inset-3 rounded-[8px] border border-[#3D3124]" />
                  <span aria-hidden data-heart-seam="" data-heart-throughput="" className="absolute bottom-5 left-1/2 top-5 w-px -translate-x-1/2" />
                  <span aria-hidden data-heart-target="" className="absolute left-1/2 top-1/2 h-12 w-12 -translate-x-1/2 -translate-y-1/2 rotate-45 border border-[#D87526]/45 bg-[#2A1B0E]/65 shadow-[0_0_30px_rgba(216,117,38,.22)]" />
                  <div className="relative z-10">
                    <p className="font-mono text-[11px] uppercase tracking-[.18em] text-[#F0A14A]">{copy.engine.core}</p>
                    <p className="mx-auto mt-5 max-w-[35ch] text-[12px] leading-[1.65] text-[#B8B0A1]">{copy.engine.coreSub}</p>
                  </div>
                </div>
              </div>

              <div data-engine-modules="" className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-3">
                {copy.act3.stations.map((station, index) => (
                  <article key={station.name} data-engine-module="" className="rounded-[6px] border border-[#272E38] p-3">
                    <span className="font-mono text-[8px] text-[#6F4C29]">0{index + 1}</span>
                    <p className="mt-2 text-[11px] font-medium text-[#D7DBE1]">{station.name}</p>
                    <p className="mt-1 text-[9.5px] leading-relaxed text-[#77808D]">{station.truth}</p>
                  </article>
                ))}
              </div>
            </div>

            <aside className="grid gap-3">
              <div data-evidence-ledger="" className="rounded-[8px] border border-[#282E38] bg-[#11141A] p-4">
                <p className={`${mono} text-[#8F98A6]`}>{copy.engine.ledger}</p>
                <p className="mt-5 text-[12px] leading-relaxed text-[#A9B0BB]">{copy.engine.evidence}</p>
              </div>
              <div data-engine-verification="" className="rounded-[8px] border border-[#3B3429] bg-[#15130F] p-4">
                <p className={`${mono} text-[#C9A76A]`}>{copy.engine.verification}</p>
                <p className="mt-4 font-mono text-[10px] uppercase tracking-[.13em] text-[#3FA176]">✓ {copy.engine.pass}</p>
              </div>
              <div data-engine-result="" className="flex items-center gap-3 rounded-[8px] border border-[#4A3A26] bg-[#18130D] p-4">
                <StaticArtifact state="checked" />
                <p className="text-[12px] font-medium text-[#E4D8C0]">{copy.engine.result}</p>
              </div>
            </aside>
          </div>

          <div data-engine-standard="" className="mt-5 rounded-[8px] border border-[#2C333E] bg-[#0A0D12] p-4">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              {copy.engine.continuity.map((item, index) => (
                <div key={item} className="relative overflow-hidden rounded-[5px] border border-[#242A33] px-3 py-3">
                  <span className="font-mono text-[8px] text-[#6F4C29]">0{index + 1}</span>
                  <p className="mt-1 text-[11px] text-[#C7CCD4]">{item}</p>
                  <span aria-hidden data-power-fill="" style={{ "--power-release": `${(index + 1) / 3}` } as React.CSSProperties} className="absolute inset-x-0 bottom-0 h-px" />
                </div>
              ))}
            </div>
            <p className="mt-4 text-[12px] leading-[1.65] text-[#838C99]">{copy.engine.continuitySub}</p>
          </div>
        </div>
      </section>

      <section data-act="4" data-v7-sem="review" className="relative z-10 mx-auto w-full max-w-[1180px] px-5 py-20 sm:px-8 sm:py-28">
        <div className="flex items-start justify-between gap-5">
          <div>
            <CircuitRule />
            <h2 className="mt-6 max-w-[20ch] text-[clamp(2rem,5vw,4rem)] font-semibold leading-[1.02] tracking-[-.055em]">
              <AccentLine text={copy.review.h} accent={copy.review.accent} />
            </h2>
            <p className="mt-6 max-w-[58ch] text-[15px] leading-[1.75] text-[#9FA7B3]">{copy.review.sub}</p>
          </div>
          <div
            data-a2-stop-anchor="verification"
            data-a2-stop-scene="review"
            data-a2-stop-copy={concierge.guide.review}
            aria-label={concierge.guide.review}
          />
        </div>

        <div className="mt-12 grid gap-3 sm:grid-cols-3">
          {[copy.review.standard, copy.review.draft, copy.review.evidence].map((item, index) => (
            <article key={item} className="rounded-[8px] border border-[#282E38] bg-[#101319] p-5">
              <span className="font-mono text-[9px] text-[#6F4C29]">0{index + 1}</span>
              <p className="mt-4 text-[13px] text-[#C7CCD4]">{item}</p>
            </article>
          ))}
        </div>
        <div className="mt-3 flex flex-col gap-3 rounded-[9px] border border-[#3A342A] bg-[#15130F] p-5 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="font-mono text-[10px] uppercase tracking-[.14em] text-[#3FA176]">✓ {copy.review.exception}</p>
            <p className="mt-2 text-[12px] text-[#9FA7B3]">{copy.review.mark}</p>
          </div>
          <StaticArtifact state="checked" />
        </div>
      </section>

      <section data-v7-sem="sealed" className="relative z-10 mx-auto w-full max-w-[1180px] px-5 py-20 sm:px-8 sm:py-28">
        <div className="rounded-[13px] border border-[#5B472E] bg-[radial-gradient(circle_at_50%_0%,rgba(216,117,38,.16),transparent_50%),#0D0F13] px-6 py-12 text-center shadow-[0_0_70px_rgba(216,117,38,.08)] sm:px-10 sm:py-16">
          <p className={`${mono} text-[#D87526]`}>{copy.sealed.seal}</p>
          <h2 className="mx-auto mt-6 max-w-[20ch] text-[clamp(2.1rem,5vw,4.4rem)] font-semibold leading-[1] tracking-[-.055em]">
            <AccentLine text={copy.sealed.h} accent={copy.sealed.accent} />
          </h2>
          <div className="mt-8 flex flex-wrap justify-center gap-2.5">
            {copy.sealed.chips.map((chip) => (
              <span key={chip} className="rounded-[4px] border border-[#3D3428] bg-[#15130F] px-3.5 py-2 font-mono text-[10px] uppercase tracking-[.13em] text-[#C9A76A]">{chip}</span>
            ))}
          </div>
        </div>
      </section>

      <section data-v7-sem="outcomes" className="relative z-10 mx-auto w-full max-w-[1180px] px-5 py-20 sm:px-8 sm:py-28">
        <h2 className="max-w-[20ch] text-[clamp(2rem,5vw,4rem)] font-semibold leading-[1.02] tracking-[-.055em]">
          <AccentLine text={copy.outcomes.h} accent={copy.outcomes.accent} />
        </h2>
        <p className="mt-6 max-w-[64ch] text-[15px] leading-[1.75] text-[#9FA7B3]">{copy.outcomes.lede}</p>
        <div className="mt-10 grid gap-4 md:grid-cols-2">
          {copy.outcomes.cases.map((outcome) => (
            <article key={outcome.title} className="rounded-[9px] border border-[#282E38] bg-[#101319]/94 p-5 sm:p-6">
              <p className={`${mono} text-[#6F4C29]`}>{copy.outcomes.example}</p>
              <h3 className="mt-3 text-[17px] font-medium text-[#E9E5DD]">{outcome.title}</h3>
              <dl className="mt-6 space-y-4 text-[12px] leading-[1.6]">
                <div className="grid grid-cols-[92px_1fr] gap-3"><dt className="font-mono text-[9px] uppercase tracking-[.12em] text-[#77808D]">{copy.outcomes.request}</dt><dd className="text-[#B8BEC7]">{outcome.request}</dd></div>
                <div className="grid grid-cols-[92px_1fr] gap-3"><dt className="font-mono text-[9px] uppercase tracking-[.12em] text-[#77808D]">{copy.outcomes.coordinated}</dt><dd className="text-[#B8BEC7]">{outcome.coordinated}</dd></div>
                <div className="grid grid-cols-[92px_1fr] gap-3"><dt className="font-mono text-[9px] uppercase tracking-[.12em] text-[#D87526]">{copy.outcomes.delivered}</dt><dd className="text-[#E0D4BD]">{outcome.delivered}</dd></div>
              </dl>
            </article>
          ))}
        </div>
      </section>

      {children}
    </div>
  );
}
