export type DeviceResource = "CONTACTS" | "CALENDAR";
export type DeviceAccessStatus = "UNDETERMINED" | "DENIED" | "GRANTED" | "UNAVAILABLE";

export type NativePermissionLike = {
  status?: string;
  granted: boolean;
  canAskAgain: boolean;
};

export type DeviceAccessState = {
  resource: DeviceResource;
  status: DeviceAccessStatus;
  canAskAgain: boolean;
  valuesDisclosed: false;
};

export function normalizeDevicePermission(
  resource: DeviceResource,
  permission: NativePermissionLike | null,
): DeviceAccessState {
  if (!permission) return { resource, status: "UNAVAILABLE", canAskAgain: false, valuesDisclosed: false };
  const status = permission.granted
    ? "GRANTED"
    : permission.status?.toLowerCase() === "undetermined"
      ? "UNDETERMINED"
      : "DENIED";
  return { resource, status, canAskAgain: permission.canAskAgain, valuesDisclosed: false };
}

export const DEVICE_ACCESS_COPY = {
  CONTACTS: {
    title: "Contacts du téléphone",
    detail: "Pour reconnaître les personnes que tu choisis. Aucune liste n’est envoyée automatiquement.",
  },
  CALENDAR: {
    title: "Calendriers du téléphone",
    detail: "Pour voir ton horaire et préparer les rendez-vous demandés. Chaque écriture reste contrôlée.",
  },
} as const;
