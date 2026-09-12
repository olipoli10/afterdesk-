export const DEVICE_RESOURCES = ["CALENDAR", "CONTACTS", "MICROPHONE", "CAMERA", "PHOTOS", "NOTIFICATIONS", "LOCATION"] as const;
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
    detail: "Autorisation native du téléphone. ENDVERA utilisera ce pont pour ajouter ou modifier les rendez-vous demandés depuis ton numéro ENDVERA, après validation du serveur et de ton appareil associé. Cette permission seule n’active aucun envoi ni modification.",
  },
  MICROPHONE: {
    title: "Microphone",
    detail: "Pour écouter uniquement lorsque tu appuies pour parler à ENDVERA.",
  },
  CAMERA: {
    title: "Caméra",
    detail: "Dans le dossier du chantier, prends volontairement une photo, vérifie son aperçu puis confirme l’import. Cette autorisation seule ne prend ni n’envoie de photo. Le fichier choisi peut conserver ses métadonnées intégrées.",
  },
  PHOTOS: {
    title: "Photos choisies",
    detail: "Dans le dossier du chantier, choisis une seule photo JPEG ou PNG dans le sélecteur du téléphone, puis confirme son aperçu avant l’import. Ce parcours ne demande pas d’accès général à la galerie; cet écran ne lit aucune photo.",
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
