/**
 * A parallel route keeps its last matched subpage during a soft navigation.
 * When the sign-in modal links to /register (or any non-/login page), this
 * explicit match replaces the intercepted modal with nothing instead of
 * leaving it on top of the destination page.
 */
export default function ClearModalSlot() {
  return null;
}
