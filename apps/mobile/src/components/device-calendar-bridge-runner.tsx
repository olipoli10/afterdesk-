import { useCallback, useEffect, useRef } from "react";
import * as Notifications from "expo-notifications";
import { AppState } from "react-native";
import { refreshLinkedAndroidDevice, runDeviceCalendarBridge } from "@/lib/device-calendar-bridge";

export function DeviceCalendarBridgeRunner({ workspaceId }: { workspaceId?: string }) {
  const reconciling = useRef(false);
  const reconcile = useCallback(() => {
    if (!workspaceId || reconciling.current) return;
    reconciling.current = true;
    void refreshLinkedAndroidDevice(workspaceId)
      .catch(() => null)
      .then(() => runDeviceCalendarBridge(workspaceId))
      .finally(() => { reconciling.current = false; });
  }, [workspaceId]);

  useEffect(() => {
    reconcile();
    const appState = AppState.addEventListener("change", (state) => {
      if (state === "active") reconcile();
    });
    const received = Notifications.addNotificationReceivedListener(reconcile);
    const tapped = Notifications.addNotificationResponseReceivedListener(reconcile);
    return () => {
      appState.remove();
      received.remove();
      tapped.remove();
    };
  }, [reconcile]);

  return null;
}
