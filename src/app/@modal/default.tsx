/**
 * The parallel slot's fallback: nothing. Every route in the app renders
 * through this slot on a hard navigation (refresh, typed URL, external
 * link), because those never match the intercepted (.)login segment below.
 * Without this file the slot 404s on any route that doesn't populate it —
 * which, absent this file, would be every route except /login itself.
 */
export default function ModalSlotDefault() {
  return null;
}
