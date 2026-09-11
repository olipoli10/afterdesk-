import { useCallback, useEffect } from "react";
import * as Notifications from "expo-notifications";
import { AppState } from "react-native";
import { runDeviceCalendarBridge } from "@/lib/device-calendar-bridge";

export function DeviceCalendarBridgeRunner({ workspaceId }: { workspaceId?: string }) {
  const reconcile = useCallback(() => {
    if (workspaceId) void runDeviceCalendarBridge(workspaceId);
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

