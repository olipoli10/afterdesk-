export const DEVICE_RESOURCES = ["CONTACTS", "CALENDAR", "MICROPHONE", "CAMERA", "PHOTOS", "NOTIFICATIONS", "LOCATION"] as const;
export type DeviceResource = (typeof DEVICE_RESOURCES)[number];
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
  MICROPHONE: {
    title: "Microphone",
    detail: "Pour écouter uniquement lorsque tu appuies pour parler à ENDVERA.",
  },
  CAMERA: {
    title: "Caméra",
    detail: "Pour photographier une preuve, un document ou l’avancement d’un chantier à ta demande.",
  },
  PHOTOS: {
    title: "Photos choisies",
    detail: "Pour joindre seulement les photos que tu sélectionnes, jamais parcourir ta galerie en arrière-plan.",
  },
  NOTIFICATIONS: {
    title: "Notifications",
    detail: "Pour signaler un rendez-vous, un suivi ou une décision qui demande ton attention.",
  },
  LOCATION: {
    title: "Localisation pendant l’utilisation",
    detail: "Pour associer une action au bon chantier pendant que tu utilises ENDVERA, sans suivi permanent.",
  },
} as const;
