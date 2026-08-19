"use client";

import Link from "next/link";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { Wordmark } from "@/components/logo";
import type { ConceptAssemblyCopy } from "@/lib/i18n/home-assembly";
import styles from "./home-assembly.module.css";

/* -------------------------------------------------------------------------
   The homepage "Assembly Lock" experience (accepted V5.5, ported 1.4B).

   ONE SCENE, ONE DRIVEN VALUE. The whole choreography is the CSS module
   reading a single custom property, --p. The scroll handler measures the
   track once per event and writes --p (plus a coarse data-phase for the few
   discrete needs) STRAIGHT onto the stage element - no React state, no
   re-render, and deliberately no requestAnimationFrame token: Phase 3.1
   proved that an rAF gate wedges permanently in any window that stops
   compositing, and scroll position is already a continuous interpolator.
   Nothing animates after the user stops.

   TWO RENDERINGS, ONE TRUTH. The server (and any reduced-motion or no-JS
   reader) gets the SAME stage frozen at four --p stops in ordinary flow.
   The sticky track mounts only when motion is welcome, so hydration always
   matches the static markup first.

   THE FIELD SENDS NOTHING. React state and preventDefault; no action, fetch,
   beacon, storage, cookie, URL write or navigation.

   V5.2: the machine is one instrument slab (engraved contract + routing-bus
   fabric), the outcome composes element by element so no frame slices text,
   mobile runs a semantic-zoom magazine instead of two crushed columns, and
   the below-fold sections stay inside the onyx world until a deliberate
   daylight coda. `data-g` attributes are the anti-clipping guard's hooks.
   ------------------------------------------------------------------------- */

/** The four frozen moments of the static story, as --p values. */
export const STATIC_STOPS = [0.04, 0.66, 0.78, 0.97] as const;

/**
 * Normalized progress for a sticky track: 0 when the track's top touches the
 * viewport top, 1 when its bottom leaves. Pure and unit-tested.
 */
export function progressToP(trackTop: number, trackHeight: number, viewportHeight: number): number {
  const span = trackHeight - viewportHeight;
  if (!(span > 0)) return 0;
  return Math.min(1, Math.max(0, -trackTop / span));
}

function subscribeMotionPreference(onChange: () => void) {
  const query = window.matchMedia("(prefers-reduced-motion: reduce)");
  query.addEventListener("change", onChange);
  return () => query.removeEventListener("change", onChange);
}

/* -- the request field ----------------------------------------------------- */

function RequestField({
  copy,
  typed,
  onTyped,
  onAdvance,
  idSuffix,
}: {
  copy: ConceptAssemblyCopy;
  typed: string;
  onTyped: (v: string) => void;
  onAdvance: () => void;
  idSuffix: string;
}) {
  return (
    <>
      <form
        className={styles.field}
        onSubmit={(event) => {
          event.preventDefault();
          onAdvance();
        }}
      >
        <span className={styles.caret} aria-hidden="true" />
        <input
          type="text"
          value={typed}
          onChange={(event) => onTyped(event.target.value)}
          placeholder={copy.placeholder}
          aria-label={copy.cta}
          autoComplete="off"
          id={`home-assembly-input-${idSuffix}`}
        />
        <button type="submit" className={styles.go}>
          {copy.cta}
        </button>
      </form>
      <p className={styles.fieldNote}>{copy.fieldNote}</p>
    </>
  );
}

/* -- the engineered chart of the south shore -------------------------------- */

/**
 * A stylised survey of the St. Lawrence south shore, drawn as engineering
 * linework: the coast falls from northeast to southwest, water hatching sits
 * north of it, the Route 132 corridor runs just inland, and the three sites
 * sit on the corridor at credible relative positions. Deliberately a CHART,
 * never a map tile - and the field note already declares the scenario
 * synthetic.
 */
/* Bays and headlands, not a ruler: the shore breathes. One tributary joins
   near the middle site, the way the Rimouski river meets the estuary. */
const COAST =
  "M-2 88 L5 83 L10 84 L15 78 L20 78 L24 74 L28 75 L33 68 L38 66 L42 67 L47 59 L52 58 L55 60 L60 51 L64 49 L68 51 L73 42 L78 40 L82 42 L86 34 L90 32 L95 26 L102 22";
const ROUTE_132 =
  "M-2 94 L8 88 L16 84 L24 80 L32 74 L40 70 L48 64 L56 58 L64 53 L72 47 L80 42 L88 36 L96 31 L102 28";
const TRIBUTARY = "M55 60 L53 68 L54 78 L51 88 L52 100";
/* On the corridor, at the corridor's own heights. */
const SITE_POINTS = [
  { x: 30, y: 75.5 },
  { x: 56, y: 58 },
  { x: 79, y: 42.5 },
];

function GeoChart({ copy }: { copy: ConceptAssemblyCopy }) {
  return (
    <div className={styles.geo} data-g="geo">
      <svg
        className={styles.geoSvg}
        viewBox="0 0 100 100"
        preserveAspectRatio="none"
        aria-hidden="true"
      >
        {/* water hatching, north of the coast */}
        {[0, 1, 2, 3].map((i) => (
          <path
            key={i}
            d={COAST}
            transform={`translate(${-3 - i * 3.5} ${-5 - i * 5.5})`}
            fill="none"
            stroke="rgba(150,155,163,0.09)"
            strokeWidth="0.3"
          />
        ))}
        {/* the coastline itself, and the tributary meeting the estuary */}
        <path d={COAST} fill="none" stroke="rgba(241,238,231,0.34)" strokeWidth="0.5" />
        <path d={TRIBUTARY} fill="none" stroke="rgba(241,238,231,0.16)" strokeWidth="0.35" />
        {/* survey ticks along the coast */}
        {[10, 24, 38, 52, 66, 80, 94].map((x) => {
          const y = 88 - (x + 2) * 0.64;
          return (
            <path
              key={x}
              d={`M${x} ${y} l1.1 1.6`}
              stroke="rgba(241,238,231,0.22)"
              strokeWidth="0.3"
            />
          );
        })}
        {/* the corridor: Route 132, just inland */}
        <path d={ROUTE_132} fill="none" stroke="rgba(201,167,106,0.8)" strokeWidth="0.6" />
        {SITE_POINTS.map((pos, i) => (
          <g key={i}>
            <circle cx={pos.x} cy={pos.y} r={i === 2 ? 1.3 : 1.9} fill="#E2C486" />
            <circle
              cx={pos.x}
              cy={pos.y}
              r={i === 2 ? 3.2 : 4.2}
              fill="none"
              stroke={i === 2 ? "rgba(216,117,38,0.6)" : "rgba(201,167,106,0.45)"}
              strokeWidth="0.35"
            />
          </g>
        ))}
      </svg>
      <span className={styles.geoRiver}>{copy.outcome.riverLabel}</span>
      <span className={styles.geoNorth}>N</span>
      {copy.outcome.sites.map((s, i) => (
        <span
          key={s.name}
          className={i === 2 ? `${styles.geoTag} ${styles.geoTagOpen}` : styles.geoTag}
          style={GEO_TAG_POSITIONS[i]}
        >
          {s.name} <b>{s.score}</b>
        </span>
      ))}
      <span className={styles.geoLabel} data-g="geo-label">
        {copy.outcome.corridorLabel}
      </span>
      <span className={styles.geoScale}>{copy.outcome.scaleLabel}</span>
    </div>
  );
}

/* Anchored under the three corridor markers (viewBox 0..100 = percentages). */
const GEO_TAG_POSITIONS: React.CSSProperties[] = [
  { left: "30%", top: "80%" },
  { left: "56%", top: "62.5%" },
  { left: "79%", top: "47%" },
];

/* -- the stage: the complete scene at any --p ------------------------------- */

function Stage({
  copy,
  typed,
  onTyped,
  onAdvance,
  frozenP,
  stageRef,
  idSuffix,
  utility,
  continuation,
}: {
  copy: ConceptAssemblyCopy;
  typed: string;
  onTyped: (v: string) => void;
  onAdvance: () => void;
  frozenP?: number;
  stageRef?: React.RefObject<HTMLDivElement | null>;
  idSuffix: string;
  utility?: React.ReactNode;
  /* continuation mode: the V7 acts above own the opening, so this stage
     skips its own nav and hero copy and keeps the machine/outcome intact */
  continuation?: boolean;
}) {
  const isStatic = frozenP !== undefined;
  const instruction = typed.trim() || copy.sampleRequest;
  const price = copy.intent.rows[1]?.[1] ?? "";

  return (
    <div
      ref={stageRef}
      className={`${styles.stage} ${isStatic ? styles.stageStatic : ""}`}
      style={isStatic ? ({ "--p": String(frozenP) } as React.CSSProperties) : undefined}
      data-phase={isStatic ? (frozenP < 0.2 ? "hero" : frozenP < 0.82 ? "machine" : "outcome") : "hero"}
    >
      <div className={styles.grid} aria-hidden="true" />

      {/* the ONE header: wordmark + page utilities + anchor nav. On phones
          the utility slot wraps to its own row (order/basis classes on the
          slot), keeping the accepted mark / Early Access line untouched. */}
      {!continuation && <nav className={styles.nav}>
        <Link href="/" className={styles.mark} aria-label="Endvera home">
          <Wordmark tone="paper" />
        </Link>
        {utility}
        <span className={styles.navLinks}>
          <a href="#outcomes">{copy.nav.outcomes}</a>
          <a href="#how">{copy.nav.how}</a>
          <a href="#inside">{copy.nav.inside}</a>
          <span className={styles.early}>{copy.nav.earlyAccess}</span>
        </span>
      </nav>}

      {!continuation && <div className={styles.copy}>
        <p className={styles.kicker}>{copy.kicker}</p>
        <h1 className={styles.hl} data-g="hl">
          <span className={styles.hlL1}>{copy.headline[0]}</span>
          <span className={styles.hlL2}>{copy.headline[1]}</span>
        </h1>
        <p className={styles.sup} data-g="sup">
          {copy.supporting}
        </p>

        <div className={styles.fieldWrap}>
          <RequestField
            copy={copy}
            typed={typed}
            onTyped={onTyped}
            onAdvance={onAdvance}
            idSuffix={idSuffix}
          />
          <span className={styles.rail} aria-hidden="true" />
        </div>
      </div>}

      {/* off-stage masses, stated in geometry */}
      <span className={`${styles.edgeTick} ${styles.edgeTickL}`} aria-hidden="true" />
      <span className={`${styles.edgeTick} ${styles.edgeTickR}`} aria-hidden="true" />

      {/* the gold spine and its machined joints */}
      <div className={styles.spine} aria-hidden="true">
        <span className={styles.jointBox} style={{ top: "22%" }} />
        <span className={styles.joint} style={{ top: "22%" }} />
        <span className={styles.joint} style={{ top: "50%" }} />
        <span className={styles.jointBox} style={{ top: "78%" }} />
        <span className={styles.joint} style={{ top: "78%" }} />
      </div>
      <div className={styles.spinePulse} aria-hidden="true" />
      <span className={styles.lockWord}>{copy.lockLabel}</span>

      {/* the perimeter rule that seals both hemispheres into one instrument */}
      <div className={styles.machineFrame} aria-hidden="true" />

      {/* left hemisphere: the contract, engraved */}
      <section className={`${styles.plane} ${styles.planeL}`} aria-label={copy.intent.title}>
        <span className={`${styles.planeEdge} ${styles.planeEdgeL}`} aria-hidden="true" />
        <div className={styles.planeInner}>
          <div className={styles.zTitle}>{copy.intent.title}</div>
          <div className={styles.quote} data-g="quote">
            <i>{copy.intent.outcomeLabel}</i>
            <b>&ldquo;{instruction}&rdquo;</b>
          </div>
          <div className={styles.engraving}>
            {copy.intent.rows.map(([label, value]) => (
              <div className={styles.engRow} key={label}>
                <i>{label}</i>
                <b>{value}</b>
              </div>
            ))}
          </div>
          <p className={styles.auth}>{copy.intent.authorization}</p>
          <div className={`${styles.threshold} ${styles.thresholdVerified}`} data-g="threshold">
            <i>{copy.intent.finishLineLabel}</i>
            {copy.intent.finishLine}
          </div>
        </div>
        {/* the condensed contract band: mobile's one-line summary while the
            fabric holds the stage; invisible on desktop */}
        <div className={styles.bandMini} data-g="band">
          <i>&ldquo;{instruction}&rdquo;</i>
          <b>{price}</b>
        </div>
      </section>

      {/* right hemisphere: one fabric, five behaviours on a routing bus */}
      <section className={`${styles.plane} ${styles.planeR}`} aria-label={copy.fabric.title}>
        <span className={`${styles.planeEdge} ${styles.planeEdgeR}`} aria-hidden="true" />
        <div className={styles.planeInner}>
          <div className={styles.zTitle}>{copy.fabric.title}</div>
          <div className={styles.fabricWrap}>
            <div className={styles.bus} aria-hidden="true" />
            <div className={styles.lanes}>
              <div className={styles.lanesRibbon}>
                {copy.fabric.materials.map((m, i) => {
                  const isBrowser = i === 3;
                  const isHuman = i === 4;
                  return (
                    <div
                      key={m.label}
                      className={`${styles.lane} ${isBrowser ? styles.excRow : ""}`}
                      style={{ "--d": String(i * 0.13) } as React.CSSProperties}
                    >
                      <span className={styles.laneTick} aria-hidden="true" />
                      <div className={styles.laneHead}>
                        <b>{m.label}</b>
                        {isBrowser && <span className={styles.excState}>{copy.exception.state}</span>}
                      </div>
                      <div className={styles.laneBody}>{m.behavior}</div>
                      {i === 0 && <div className={styles.vModel} aria-hidden="true" />}
                      {i === 1 && (
                        <div className={styles.vSoft} aria-hidden="true">
                          <i>MTQ</i>
                          <i>HQ</i>
                          <i>REQ</i>
                        </div>
                      )}
                      {i === 2 && (
                        <div className={styles.vCode}>
                          40+35+30 <b>= 105 ok</b>
                        </div>
                      )}
                      {isBrowser && (
                        <>
                          <div className={styles.vBrowser} aria-hidden="true" />
                          <div className={styles.laneBody}>{copy.exception.fact}</div>
                        </>
                      )}
                      {isHuman && (
                        <>
                          <div className={styles.aperture}>
                            <div className={styles.apertureInner}>
                              {copy.exception.chip} — {copy.exception.routed}
                            </div>
                          </div>
                          <p className={styles.resolved}>{copy.exception.resolved}</p>
                        </>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
          {/* the magazine's position rail: mobile names all five materials and
              lights the one on stage; invisible on desktop */}
          <div className={styles.magRail} aria-hidden="true">
            {copy.fabric.materials.map((m, i) => (
              <span key={m.label} style={{ "--i": String(i) } as React.CSSProperties}>
                {m.label}
              </span>
            ))}
          </div>
        </div>
      </section>

      {/* evidence travelling to the finish line */}
      <div className={styles.evidence} style={{ top: "30dvh" }} aria-hidden="true" />
      <div className={styles.evidence} style={{ top: "46dvh" }} aria-hidden="true" />
      <div className={styles.evidence} style={{ top: "62dvh" }} aria-hidden="true" />

      <p className={styles.verLine} data-g="verline">
        <b>{copy.verification.line}</b> {copy.verification.limit}
      </p>

      {/* the fused outcome: the frame opens, then content composes whole */}
      <section className={styles.outcome} aria-label={copy.outcome.kicker}>
        <div className={styles.outcomeInner}>
          <div
            className={`${styles.outcomeHead} ${styles.cmp}`}
            style={{ "--at": "0" } as React.CSSProperties}
            data-g="outcome-head"
          >
            <span className={styles.outcomeKicker}>{copy.outcome.kicker}</span>
            <span className={styles.outcomeLock}>
              <span className={styles.check}>&#10003;</span> {copy.outcome.lock}
            </span>
          </div>

          <div className={styles.outcomeBody}>
            <div className={styles.cmp} style={{ "--at": "0.03" } as React.CSSProperties}>
              <GeoChart copy={copy} />
            </div>

            <div className={styles.rec}>
              <h2
                className={`${styles.recTitle} ${styles.cmp}`}
                style={{ "--at": "0.06" } as React.CSSProperties}
                data-g="rec-title"
              >
                {copy.outcome.recommendation}
              </h2>
              <p
                className={`${styles.recDetail} ${styles.cmp}`}
                style={{ "--at": "0.1" } as React.CSSProperties}
                data-g="rec-detail"
              >
                {copy.outcome.detail}
              </p>
              {copy.outcome.sites.map((s, i) => (
                <div
                  className={`${styles.siteRow} ${styles.cmp}`}
                  key={s.name}
                  style={{ "--at": String(0.14 + i * 0.04) } as React.CSSProperties}
                  data-g={`site-${i}`}
                >
                  <em>{s.name}</em>
                  <span className={i === 2 ? `${styles.siteScore} ${styles.siteScoreOpen}` : styles.siteScore}>
                    {s.score}
                  </span>
                  <span className={styles.siteNote}>{s.note}</span>
                </div>
              ))}
              <div
                className={`${styles.ledger} ${styles.cmp}`}
                style={{ "--at": "0.34" } as React.CSSProperties}
                data-g="ledger"
              >
                <div className={styles.ledgerTitle}>{copy.outcome.ledgerTitle}</div>
                <div className={styles.ledgerCols}>
                  {copy.outcome.ledger.map((row) => (
                    <div className={styles.ledgerRow} key={row.source}>
                      <span>{row.source}</span>
                      <b className={styles.check}>&#10003;</b>
                    </div>
                  ))}
                </div>
                {/* phone width condenses the five rows to one honest line */}
                <div className={styles.ledgerCompact}>
                  <span>{copy.outcome.ledgerCompact}</span>
                  <b className={styles.check}>&#10003;</b>
                </div>
              </div>
              <div
                className={`${styles.unknown} ${styles.cmp}`}
                style={{ "--at": "0.44" } as React.CSSProperties}
                data-g="unknown"
              >
                <b>{copy.outcome.unknownLabel}</b>
                <span>{copy.outcome.unknownNote}</span>
              </div>
            </div>
          </div>

          <div
            className={`${styles.outcomeFoot} ${styles.cmp}`}
            style={{ "--at": "0.54" } as React.CSSProperties}
            data-g="foot"
          >
            <b>{copy.outcome.delivered}</b>
            <span>{copy.outcome.exports}</span>
          </div>
        </div>
      </section>

      <p className={styles.closing} data-g="closing">
        <b>{copy.outcome.closing}</b>
      </p>
    </div>
  );
}

/* -- below-the-fold: the same universe continues ---------------------------- */

function RangeGlyph({ kind }: { kind: 0 | 1 | 2 }) {
  if (kind === 0) {
    return (
      <svg viewBox="0 0 200 56" aria-hidden="true">
        {[42, 30, 18].map((y, i) => (
          <g key={y}>
            <rect x="0" y={y} width="196" height="3" fill="rgba(241,238,231,0.08)" />
            <rect x="0" y={y} width={[150, 118, 66][i]} height="3" fill="#C9A76A" opacity={1 - i * 0.28} />
          </g>
        ))}
      </svg>
    );
  }
  if (kind === 1) {
    return (
      <svg viewBox="0 0 200 56" aria-hidden="true">
        <path d="M8 10 H74 L110 28 H196" fill="none" stroke="rgba(241,238,231,0.35)" strokeWidth="1.4" />
        <path d="M8 46 H74 L110 28" fill="none" stroke="#C9A76A" strokeWidth="1.4" />
        <circle cx="110" cy="28" r="3.4" fill="#E2C486" />
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 200 56" aria-hidden="true">
      {[0, 1, 2, 3].map((i) => (
        <g key={i}>
          <rect x={i * 52} y="22" width="36" height="12" rx="2" fill="none" stroke="rgba(241,238,231,0.3)" />
          {i < 3 && <path d={`M${i * 52 + 40} 28 h6`} stroke="#C9A76A" strokeWidth="1.2" />}
        </g>
      ))}
      <path d="M162 28 l5 5 9 -10" fill="none" stroke="#2E9A74" strokeWidth="2" />
    </svg>
  );
}

const RING_POSITIONS: React.CSSProperties[] = [
  { top: "-0.8rem", left: "8%" },
  { top: "-0.8rem", left: "50%", transform: "translateX(-50%)" },
  { top: "-0.8rem", right: "8%" },
  { top: "50%", left: "-0.4rem", transform: "translateY(-50%) rotate(-90deg)" },
  { top: "50%", right: "-0.4rem", transform: "translateY(-50%) rotate(90deg)" },
  { bottom: "-0.8rem", left: "14%" },
  { bottom: "-0.8rem", right: "14%" },
];

/**
 * The phone's real ending (V5.3): after the sticky story hands over, the full
 * outcome lives as a NATURAL-FLOW surface - stable vertical order, no
 * absolute positioning, free to exceed the viewport. The sticky stage keeps
 * only the essential decision (chart, recommendation, sites); everything
 * here completes it. Desktop never renders this block. Checks are steady
 * green: in flow, the readback already happened.
 */
function OutcomeFlow({ copy }: { copy: ConceptAssemblyCopy }) {
  return (
    <>
      {/* V5.4/C2: ONE outcome, never two. The sticky stage owns the map, the
          recommendation and the scored sites; this surface CONTINUES it and
          repeats none of them - it begins at Evidence and closes the story. */}
      <section className={styles.outcomeFlow} aria-label={copy.outcome.ledgerTitle} data-g="flow">
        <div className={styles.ledger} data-g="flow-ledger">
          <div className={styles.ledgerTitle}>{copy.outcome.ledgerTitle}</div>
          <div className={styles.ledgerCols}>
            {copy.outcome.ledger.map((row) => (
              <div className={styles.ledgerRow} key={row.source}>
                <span>{row.source}</span>
                <b className={styles.checkOn}>&#10003;</b>
              </div>
            ))}
          </div>
        </div>
        <div className={styles.unknown} data-g="flow-unknown">
          <b>{copy.outcome.unknownLabel}</b>
          <span>{copy.outcome.unknownNote}</span>
        </div>
        <div className={styles.outcomeFoot} data-g="flow-foot">
          <b>{copy.outcome.delivered}</b>
          <span>{copy.outcome.exports}</span>
        </div>
      </section>
      <p className={styles.flowClosing} data-g="flow-closing">
        <b>{copy.outcome.closing}</b>
      </p>
    </>
  );
}

function BelowFold({
  copy,
  typed,
  onTyped,
  onAdvance,
  ctaHref,
}: {
  copy: ConceptAssemblyCopy;
  typed: string;
  onTyped: (v: string) => void;
  onAdvance: () => void;
  ctaHref: string;
}) {
  return (
    <div className={styles.afterworld}>
      <div className={styles.worldThread} aria-hidden="true" />

      <OutcomeFlow copy={copy} />

      <section className={styles.section} id="outcomes" aria-label={copy.range.title}>
        <h2 className={styles.sectionTitle} data-g="world-title">
          {copy.range.title}
        </h2>
        <p className={styles.sectionLede}>{copy.range.lede}</p>
        <div className={styles.rangeRows}>
          {copy.range.outcomes.map(([kicker, name, essence], i) => (
            <div className={styles.rangeRow} key={name}>
              <span>
                <span className={styles.rangeKicker}>{kicker}</span>
                <span className={styles.rangeName}>{name}</span>
                <span className={styles.rangeEssence}>{essence}</span>
              </span>
              <div className={styles.rangeGlyph}>
                <RangeGlyph kind={i as 0 | 1 | 2} />
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className={styles.section} id="how" aria-label={copy.control.title}>
        <h2 className={styles.sectionTitle}>{copy.control.title}</h2>
        <p className={styles.sectionLede}>{copy.control.lede}</p>
        <div className={styles.ringWrap}>
          <div className={styles.ringFrame}>
            <span className={styles.ringCore}>{copy.intent.outcomeLabel}</span>
            {copy.control.ring.map((label, i) => (
              <span className={styles.ringLabel} key={label} style={RING_POSITIONS[i]}>
                {label}
              </span>
            ))}
          </div>
        </div>
      </section>

      <section className={`${styles.section} ${styles.door}`} id="inside" aria-label={copy.door.line1}>
        <h2 className={styles.doorLine}>
          {copy.door.line1} <i>{copy.door.line2}</i>
        </h2>
        <div className={styles.doorField}>
          <RequestField
            copy={copy}
            typed={typed}
            onTyped={onTyped}
            onAdvance={onAdvance}
            idSuffix="door"
          />
          <a className={styles.doorCta} href={ctaHref}>
            {copy.doorCta}
          </a>
        </div>
      </section>

      {/* daylight is a decision, not an accident: the thread lands on one
          final joint and the world hands over deliberately */}
      <div className={styles.coda} aria-hidden="true">
        <span className={styles.codaThread} />
        <span className={styles.codaJoint} />
      </div>
    </div>
  );
}

/* -- the experience --------------------------------------------------------- */

export function AssemblyExperience({
  copy,
  ctaHref,
  utility,
  continuation,
}: {
  copy: ConceptAssemblyCopy;
  ctaHref: string;
  utility?: React.ReactNode;
  continuation?: boolean;
}) {
  const motion = useSyncExternalStore(
    subscribeMotionPreference,
    () => !window.matchMedia("(prefers-reduced-motion: reduce)").matches,
    () => false
  );
  const [typed, setTyped] = useState("");
  const trackRef = useRef<HTMLDivElement | null>(null);
  const stageRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!motion) return;
    const track = trackRef.current;
    const stage = stageRef.current;
    if (!track || !stage) return;

    /* One measurement, two style writes, straight from the event. No rAF
       token to wedge, no state, no work after the user stops. */
    const onScroll = () => {
      const raw = progressToP(track.getBoundingClientRect().top, track.offsetHeight, window.innerHeight);
      /* continuation mode enters with the machine masses already present:
         the acts told the opening story, so there is no wire-only interlude. */
      const p = continuation ? 0.3 + raw * 0.7 : raw;
      stage.style.setProperty("--p", p.toFixed(4));
      const phase = p < 0.2 ? "hero" : p < 0.82 ? "machine" : "outcome";
      if (stage.dataset.phase !== phase) stage.dataset.phase = phase;
    };
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll, { passive: true });
    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
    };
  }, [motion, continuation]);

  /* Submitting nudges the story forward - a scroll, never a navigation. */
  const advance = () => {
    const track = trackRef.current;
    if (!track) return;
    const span = track.offsetHeight - window.innerHeight;
    const top = track.getBoundingClientRect().top + window.scrollY;
    window.scrollTo({ top: top + span * 0.3, behavior: "smooth" });
  };

  if (!motion) {
    /* The complete story in ordinary flow: four distinct frozen moments. */
    return (
      <div>
        <p className={styles.srOnly}>{copy.srJourney}</p>
        {(continuation ? STATIC_STOPS.filter((sp) => sp >= 0.2) : STATIC_STOPS).map((p, i) => (
          <Stage
            key={p}
            copy={copy}
            typed={typed}
            onTyped={setTyped}
            onAdvance={() => undefined}
            frozenP={p}
            idSuffix={`static-${i}`}
            continuation={continuation}
            /* page utilities render once, in the first frozen moment - the
               later stages keep only their fading mark/anchor chrome */
            utility={i === 0 ? utility : undefined}
          />
        ))}
        <div data-coda=""><BelowFold copy={copy} typed={typed} onTyped={setTyped} onAdvance={() => undefined} ctaHref={ctaHref} /></div>
      </div>
    );
  }

  return (
    <div>
      <p className={styles.srOnly}>{copy.srJourney}</p>
      <div ref={trackRef} id="home-assembly-track" className={styles.track}>
        <div className={styles.sticky}>
          <Stage
            copy={copy}
            typed={typed}
            onTyped={setTyped}
            onAdvance={advance}
            stageRef={stageRef}
            idSuffix="live"
            utility={utility}
            continuation={continuation}
          />
        </div>
      </div>
      <div data-coda=""><BelowFold copy={copy} typed={typed} onTyped={setTyped} onAdvance={advance} ctaHref={ctaHref} /></div>
    </div>
  );
}
