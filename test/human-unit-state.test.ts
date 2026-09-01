import { describe, expect, it } from "vitest";
import {
  HUMAN_UNIT_CAUSES,
  HUMAN_UNIT_REFUSAL_CAUSES,
  HUMAN_UNIT_STATES,
  TERMINAL_HUMAN_UNIT_STATES,
  canTransition,
  isTerminalHumanUnitState,
  safeNextAction,
  safeNextActionForRefusal,
  type HumanUnitCause,
  type HumanUnitState,
} from "@/lib/human-unit-state";

/**
 * THE STATE TABLE IS THE FEATURE'S SAFETY ARGUMENT IN ONE PLACE.
 *
 * A person is mid-judgment on a mandate a client has already paid for. Every
 * question an operator can ask — why is this waiting, who may act, what is the
 * safe next thing to do — has to be answerable from the state alone, without
 * interpretation (FR-046, FR-052, SC-011). That is only true if the table is
 * total: every legal pair permitted, every other pair refused, and no state
 * that leaves an operator without a move.
 *
 * This spec is the pure half. The guards that make a legal pair *actually*
 * happen — the claimant's identity, the claim generation, the revision counter
 * — are enforced by CAS and by database constraints, and are proven by the
 * integration suite. A pair being legal here is a necessary condition, never a
 * sufficient one.
 */

const legal: Array<[HumanUnitState | null, HumanUnitState]> = [
  // Admission. Absence of the row is `not_admitted`, so the source is null.
  [null, "admitted"],

  // Publication, and the two refusals that pause instead of degrading.
  ["admitted", "published"],
  ["admitted", "paused"],

  // The pool.
  ["published", "claimed"],
  ["published", "paused"],

  // Work in hand.
  ["claimed", "submitted"],
  ["claimed", "published"],
  ["claimed", "paused"],

  // Review.
  ["submitted", "in_review"],
  ["submitted", "accepted"],
  ["submitted", "revision_requested"],
  ["submitted", "exhausted"],
  ["in_review", "accepted"],
  ["in_review", "revision_requested"],
  ["in_review", "exhausted"],

  /**
   * RELEASE FROM UNDER REVIEW.
   *
   * plan.md's table lists release only from `claimed` and `revision_requested`;
   * contracts/audit-events.md §1 lists `released` from four source states,
   * adding `submitted` and `in_review`. The audit vocabulary is the one that
   * matches reality, and it wins here, because the fencing trigger fires on a
   * change to `Task.claimedById` and knows nothing about the unit's state. An
   * admin reassignment or a lease lapse can therefore land while a candidate is
   * under review. Refusing the pair would not prevent that — it would only let
   * the task and the unit disagree about who holds the work, which is strictly
   * worse than returning it to the pool with the generation bumped.
   */
  ["submitted", "published"],
  ["in_review", "published"],

  // Revision.
  ["revision_requested", "submitted"],
  ["revision_requested", "published"],
  ["revision_requested", "paused"],

  // Resume, and the economics pause that precedes it.
  ["accepted", "resumed"],
  ["accepted", "paused"],

  // Admin-owned exits from a pause.
  ["paused", "accepted"],
  ["paused", "exhausted"],

  // Lifecycle exit, from every non-terminal state.
  ["admitted", "withdrawn"],
  ["published", "withdrawn"],
  ["claimed", "withdrawn"],
  ["submitted", "withdrawn"],
  ["in_review", "withdrawn"],
  ["revision_requested", "withdrawn"],
  ["accepted", "withdrawn"],
  ["paused", "withdrawn"],
];

const key = (from: HumanUnitState | null, to: HumanUnitState) => `${from ?? "—"}→${to}`;
const legalKeys = new Set(legal.map(([f, t]) => key(f, t)));

describe("the transition table is total", () => {
  it.each(legal)("permits %s → %s", (from, to) => {
    expect(canTransition(from, to)).toBe(true);
  });

  /**
   * The exhaustive complement. Every pair the table does not name is refused,
   * so a pair can only become legal by being written down — never by an
   * omission somewhere else being read as permission.
   */
  it("refuses every pair the table does not name", () => {
    const sources: Array<HumanUnitState | null> = [null, ...HUMAN_UNIT_STATES];
    const refused: string[] = [];
    for (const from of sources) {
      for (const to of HUMAN_UNIT_STATES) {
        if (legalKeys.has(key(from, to))) continue;
        if (canTransition(from, to)) refused.push(key(from, to));
      }
    }
    expect(refused, "these pairs are permitted but undocumented").toEqual([]);
  });

  it("refuses every state as a transition to itself", () => {
    for (const state of HUMAN_UNIT_STATES) {
      expect(canTransition(state, state), `${state} → ${state}`).toBe(false);
    }
  });

  it("refuses re-admission of an existing unit", () => {
    for (const state of HUMAN_UNIT_STATES) {
      expect(canTransition(state, "admitted"), `${state} → admitted`).toBe(false);
    }
  });

  it("permits nothing but admission from the absent row", () => {
    for (const to of HUMAN_UNIT_STATES) {
      expect(canTransition(null, to), `— → ${to}`).toBe(to === "admitted");
    }
  });

  it("does not skip review: claimed never reaches accepted directly", () => {
    expect(canTransition("claimed", "accepted")).toBe(false);
    expect(canTransition("claimed", "resumed")).toBe(false);
    expect(canTransition("claimed", "revision_requested")).toBe(false);
  });

  it("does not resume from anything but an acceptance", () => {
    for (const from of HUMAN_UNIT_STATES) {
      expect(canTransition(from, "resumed"), `${from} → resumed`).toBe(
        from === "accepted"
      );
    }
  });

  /**
   * C6: a revision loop is the ONE cycle in this machine, and it is bounded by
   * the frozen revision counter rather than by the shape of the table.
   */
  it("permits the revision loop in both directions", () => {
    expect(canTransition("submitted", "revision_requested")).toBe(true);
    expect(canTransition("revision_requested", "submitted")).toBe(true);
  });

  it("never lets a pause resume work directly", () => {
    expect(canTransition("paused", "resumed")).toBe(false);
    expect(canTransition("paused", "published")).toBe(false);
    expect(canTransition("paused", "claimed")).toBe(false);
    expect(canTransition("paused", "submitted")).toBe(false);
    expect(canTransition("paused", "in_review")).toBe(false);
    expect(canTransition("paused", "revision_requested")).toBe(false);
  });
});

describe("terminal states never transition out (C5)", () => {
  it("names exactly three terminal states", () => {
    expect([...TERMINAL_HUMAN_UNIT_STATES].sort()).toEqual([
      "exhausted",
      "resumed",
      "withdrawn",
    ]);
  });

  it.each([...TERMINAL_HUMAN_UNIT_STATES])("%s is terminal", (state) => {
    expect(isTerminalHumanUnitState(state)).toBe(true);
  });

  it.each([...TERMINAL_HUMAN_UNIT_STATES])("%s has no outbound transition", (from) => {
    for (const to of HUMAN_UNIT_STATES) {
      expect(canTransition(from, to), `${from} → ${to}`).toBe(false);
    }
  });

  /**
   * `resumed` is terminal for the UNIT even though it is the success case: the
   * machine carries on from there, but the human work unit is finished and
   * must never be reopened. Reopening it is how a second resume, a second
   * claim, or a second payout would become reachable.
   */
  it("treats resumed as terminal, not as a way station", () => {
    expect(isTerminalHumanUnitState("resumed")).toBe(true);
    expect(canTransition("resumed", "withdrawn")).toBe(false);
  });

  it("does not treat paused as terminal — it is admin-owned and non-terminal", () => {
    expect(isTerminalHumanUnitState("paused")).toBe(false);
    expect(TERMINAL_HUMAN_UNIT_STATES as readonly string[]).not.toContain("paused");
  });

  it.each(
    HUMAN_UNIT_STATES.filter((s) => !(TERMINAL_HUMAN_UNIT_STATES as readonly string[]).includes(s))
  )("%s is non-terminal and can still be withdrawn", (state) => {
    expect(isTerminalHumanUnitState(state)).toBe(false);
    expect(canTransition(state, "withdrawn")).toBe(true);
  });
});

describe("every non-terminal state has exactly one safe next action (FR-052)", () => {
  const nonTerminal = HUMAN_UNIT_STATES.filter(
    (s) => !(TERMINAL_HUMAN_UNIT_STATES as readonly string[]).includes(s)
  );

  it.each(nonTerminal)("%s yields an action, never null", (state) => {
    const cause: HumanUnitCause | null = state === "paused" ? "paused:economics" : null;
    expect(safeNextAction(state, cause)).not.toBeNull();
  });

  it("matches contracts/projections.md §4 exactly", () => {
    expect(safeNextAction("published", null)).toBe("claim_or_wait");
    expect(safeNextAction("claimed", null)).toBe("submit_or_release");
    expect(safeNextAction("submitted", null)).toBe("accept_or_reject");
    expect(safeNextAction("in_review", null)).toBe("accept_or_reject");
    expect(safeNextAction("revision_requested", null)).toBe("revise_or_release");
    expect(safeNextAction("exhausted", null)).toBe("open_manual_residual_path");
  });

  /**
   * The economics pause is the only pause with a way forward inside the
   * feature, and even that one is bounded: an admin may continue explicitly
   * WITHIN the unchanged frozen ceiling, or fail closed. It is never a licence
   * to raise the ceiling.
   */
  it("distinguishes the economics pause from every other pause", () => {
    expect(safeNextAction("paused", "paused:economics")).toBe(
      "continue_within_ceiling_or_fail_closed"
    );
    for (const cause of [
      "paused:publication_deadline",
      "paused:submission_deadline",
      "paused:input_unavailable",
      "paused:classification_conflict",
    ] as const) {
      expect(safeNextAction("paused", cause), cause).toBe("open_manual_residual_path");
    }
  });

  it("falls closed for a pause whose cause is unknown", () => {
    expect(safeNextAction("paused", null)).toBe("open_manual_residual_path");
  });

  /**
   * The two system-owned waits. plan.md requires that EVERY non-terminal state
   * have a named owner and a safe next action; projections.md §4 tabulates the
   * operator-facing ones, which leaves these two to be stated here rather than
   * left as a hole an operator would read as "nothing to do".
   */
  it("names the system-owned waits", () => {
    expect(safeNextAction("admitted", null)).toBe("await_precut_drain");
    expect(safeNextAction("accepted", null)).toBe("await_resume");
  });

  it("has nothing to ask of anyone once the unit is resumed or withdrawn", () => {
    expect(safeNextAction("resumed", null)).toBeNull();
    expect(safeNextAction("withdrawn", null)).toBeNull();
  });

  it("routes every not-admitted verdict to the manual residual path", () => {
    for (const cause of HUMAN_UNIT_REFUSAL_CAUSES) {
      expect(safeNextActionForRefusal(cause), cause).toBe("open_manual_residual_path");
    }
  });

  it("is a pure function of state and cause", () => {
    for (const state of HUMAN_UNIT_STATES) {
      const first = safeNextAction(state, null);
      for (let i = 0; i < 5; i += 1) {
        expect(safeNextAction(state, null)).toBe(first);
      }
    }
  });
});

describe("the cause vocabulary is closed (FR-049)", () => {
  /**
   * The same discipline `exception-cause.ts` applies to its own vocabulary: a
   * cause that is not on this list may not be written, and the list is asserted
   * by a build-failing test rather than by review. An audit row is the record
   * of what happened to someone's paid mandate; a cause invented at a call site
   * is a claim nobody checked.
   */
  it("contains exactly the causes in contracts/audit-events.md §1", () => {
    expect([...HUMAN_UNIT_CAUSES].sort()).toEqual(
      [
        "accepted",
        "admin_continued",
        "admin_failed_closed",
        "admitted",
        "claimed",
        "exhausted:revisions",
        "exhausted:unsafe",
        "paused:classification_conflict",
        "paused:economics",
        "paused:input_unavailable",
        "paused:publication_deadline",
        "paused:submission_deadline",
        "published",
        "reclaimed",
        "refused:duplicate",
        "refused:self_review",
        "refused:stale_generation",
        "released",
        "resumed",
        "review_opened",
        "revision_requested",
        "submitted",
        "withdrawn:lifecycle_exit",
      ].sort()
    );
  });

  it("has no duplicate cause", () => {
    expect(new Set(HUMAN_UNIT_CAUSES).size).toBe(HUMAN_UNIT_CAUSES.length);
  });

  /**
   * No cause names a hypothetical remedy or a judgment about quality. A cause
   * says what happened, not what would have helped and not whether the work
   * was any good — the latter belongs to the review decision, which a person
   * signs.
   */
  it("no cause is phrased as a counterfactual or a quality verdict", () => {
    for (const cause of HUMAN_UNIT_CAUSES) {
      expect(cause, `${cause} names a hypothetical or a judgment`).not.toMatch(
        /WOULD_HAVE|COULD_HAVE|SHOULD_HAVE|SOLVED_BY|FIXED_BY|BETTER|WORSE|GOOD|BAD|POOR|LAZY|SLOW/i
      );
    }
  });

  /**
   * FR-049 is enforced by shape: the table has no free-text column, so no cause
   * may carry money, an identity, or submitted content. A cause that read like
   * a value or a name would mean that rule had been abandoned somewhere.
   */
  it("no cause carries a money value, an identity or content", () => {
    for (const cause of HUMAN_UNIT_CAUSES) {
      expect(cause, `${cause} looks like a value`).not.toMatch(
        /\d|cents|dollar|payout|price|email|@|name|client|worker_/i
      );
      expect(cause).toMatch(/^[a-z_]+(:[a-z_]+)?$/);
    }
  });

  it("keeps the refusal vocabulary disjoint from the transition vocabulary", () => {
    for (const refusal of HUMAN_UNIT_REFUSAL_CAUSES) {
      expect(HUMAN_UNIT_CAUSES).not.toContain(refusal as unknown as HumanUnitCause);
    }
  });

  /**
   * FR-053: a topology or economics refusal is rendered in its OWN terms. The
   * defect this prevents is the one `compile-preview.ts:154-176` exists to
   * prevent — a refusal shown to an operator as a missing capability or a
   * budget decision, which sends them to fix the wrong thing.
   */
  it("no refusal cause borrows capability or budget vocabulary", () => {
    expect([...HUMAN_UNIT_REFUSAL_CAUSES].sort()).toEqual([
      "malformed_topology",
      "unmapped_economics",
      "unsupported_topology",
    ]);
    for (const cause of HUMAN_UNIT_REFUSAL_CAUSES) {
      expect(cause, `${cause} reads as a capability or budget failure`).not.toMatch(
        /capability|primitive|budget|spend|ceiling|demot|provider|credit|quota/i
      );
    }
  });
});
