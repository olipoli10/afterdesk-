type MobileBootstrapLoadState = "IDLE" | "LOADING" | "READY" | "UNAVAILABLE";

export function shouldRouteToOnboarding({
  bootstrap,
  activeWorkspaceId,
  loadState,
}: {
  bootstrap: { workspaces: readonly unknown[] } | null;
  activeWorkspaceId: string | null;
  loadState: MobileBootstrapLoadState;
}): boolean {
  return (
    loadState === "READY" &&
    bootstrap !== null &&
    bootstrap.workspaces.length === 0 &&
    activeWorkspaceId === null
  );
}
