export const DEVICE_RESOURCES = ["CONTACTS", "CALENDAR", "MICROPHONE", "CAMERA", "PHOTOS", "NOTIFICATIONS", "LOCATION"] as const;
export type DeviceResource = (typeof DEVICE_RESOURCES)[number];
export type DeviceAccessStatus = "UNDETERMINED" | "DENIED" | "GRANTED" | "LIMITED" | "UNAVAILABLE";

export type NativePermissionLike = {
  status?: string;
  granted: boolean;
  canAskAgain: boolean;
  accessPrivileges?: "all" | "limited" | "none";
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
    ? resource === "PHOTOS" && permission.accessPrivileges === "limited" ? "LIMITED" : "GRANTED"
    : permission.status?.toLowerCase() === "undetermined"
      ? "UNDETERMINED"
      : "DENIED";
  return { resource, status, canAskAgain: permission.canAskAgain, valuesDisclosed: false };
}

export function devicePermissionAction(state: DeviceAccessState): "REQUEST" | "SETTINGS" | "UNAVAILABLE" {
  if (state.status === "UNAVAILABLE") return "UNAVAILABLE";
  if (state.status === "GRANTED" || state.status === "LIMITED" || !state.canAskAgain) return "SETTINGS";
  return "REQUEST";
}

export const DEVICE_ACCESS_COPY = {
  CONTACTS: {
    title: "Contacts du téléphone",
    detail: "Dans Contacts, choisis une personne, vérifie les coordonnées et confirme son ajout au portail. Aucune liste complète n’est envoyée et l’import n’autorise pas un SMS ou un appel.",
  },
  CALENDAR: {
    title: "Calendriers du téléphone",
    detail: "Autorisation native préparée. Les calendriers du téléphone ne sont pas encore lus ou modifiés par cette intégration. Google Agenda se connecte séparément au service SMS.",
  },
  MICROPHONE: {
    title: "Microphone",
    detail: "Pour écouter uniquement lorsque tu appuies pour parler à ENDVERA.",
  },
  CAMERA: {
    title: "Caméra",
    detail: "Autorisation native préparée pour une capture à ta demande. La prise de photo dans ENDVERA n’est pas encore branchée.",
  },
  PHOTOS: {
    title: "Photos choisies",
    detail: "Le téléphone indique si l’accès est complet ou limité à ta sélection. Le sélecteur de photos ENDVERA n’est pas encore branché; cet écran ne parcourt pas ta galerie.",
  },
  NOTIFICATIONS: {
    title: "Notifications",
    detail: "Autorisation native préparée. Les rappels locaux et les notifications push ne sont pas encore branchés; accorder cet accès ne programme aucun rappel.",
  },
  LOCATION: {
    title: "Localisation pendant l’utilisation",
    detail: "Autorisation native préparée, seulement pendant l’utilisation. L’association au chantier par position n’est pas encore branchée; aucune position n’est lue ici et aucun suivi permanent n’est demandé.",
  },
} as const;
