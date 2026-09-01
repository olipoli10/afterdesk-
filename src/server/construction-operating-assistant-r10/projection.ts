import "server-only";

import { projectPreparedActionInspection } from "@/lib/construction-operating-assistant-r10/prepared-action-contracts";

export function projectOwnerConstructionAction<T extends { type: string; payload: unknown }>(
  action: T,
) {
  if (action.type !== "outbound_message") return action;
  return {
    ...action,
    payload: projectPreparedActionInspection(action),
  };
}
