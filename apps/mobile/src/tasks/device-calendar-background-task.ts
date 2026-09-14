import * as Notifications from "expo-notifications";
import * as TaskManager from "expo-task-manager";
import { runLinkedDeviceCalendarBridge } from "../lib/device-calendar-bridge";

const TASK_NAME = "ENDVERA_DEVICE_WAKE_V1";

function wakePayload(payload: Notifications.NotificationTaskPayload) {
  if (!payload || typeof payload !== "object" || "actionIdentifier" in payload) return false;
  const data = payload.data;
  if (!data || typeof data !== "object") return false;
  if (data.type === TASK_NAME) return true;
  if (typeof data.dataString !== "string") return false;
  try {
    const parsed = JSON.parse(data.dataString) as { type?: unknown };
    return parsed.type === TASK_NAME;
  } catch {
    return false;
  }
}

if (!TaskManager.isTaskDefined(TASK_NAME)) {
  TaskManager.defineTask<Notifications.NotificationTaskPayload>(TASK_NAME, async ({ data, error }) => {
    if (error || !wakePayload(data)) return Notifications.BackgroundNotificationTaskResult.NoData;
    try {
      const result = await runLinkedDeviceCalendarBridge();
      return result?.state === "COMPLETED"
        ? Notifications.BackgroundNotificationTaskResult.NewData
        : Notifications.BackgroundNotificationTaskResult.NoData;
    } catch {
      return Notifications.BackgroundNotificationTaskResult.Failed;
    }
  });
}

void Notifications.registerTaskAsync(TASK_NAME).catch(() => undefined);
