export default function Loading() {
  // Renders inside va/layout.tsx's AppShell, which is tone="night" — the
  // old #5B6069 was tuned for a paper background and nearly disappeared on
  // #0A0B0D.
  return (
    <p className="py-10 text-center font-mono text-[12px] text-[#8A9099]" role="status">
      Loading…
    </p>
  );
}
