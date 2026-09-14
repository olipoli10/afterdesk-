import { useCallback, useEffect } from "react";
import * as Notifications from "expo-notifications";
import { AppState } from "react-native";
import { refreshLinkedAndroidDevice, runDeviceCalendarBridge } from "@/lib/device-calendar-bridge";

export function DeviceCalendarBridgeRunner({ workspaceId }: { workspaceId?: string }) {
  const reconcile = useCallback(() => {
    if (!workspaceId) return;
    void runDeviceCalendarBridge(workspaceId);
  }, [workspaceId]);

  const refreshAndReconcile = useCallback(() => {
    if (!workspaceId) return;
    void refreshLinkedAndroidDevice(workspaceId)
      .catch(() => null)
      .then(() => runDeviceCalendarBridge(workspaceId));
  }, [workspaceId]);

  useEffect(() => {
    refreshAndReconcile();
    const appState = AppState.addEventListener("change", (state) => {
      if (state === "active") refreshAndReconcile();
    });
    const received = Notifications.addNotificationReceivedListener(reconcile);
    const tapped = Notifications.addNotificationResponseReceivedListener(reconcile);
    return () => {
      appState.remove();
      received.remove();
      tapped.remove();
    };
  }, [reconcile, refreshAndReconcile]);

  return null;
}
