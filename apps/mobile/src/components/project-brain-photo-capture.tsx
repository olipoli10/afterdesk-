import * as ImagePicker from "expo-image-picker";
import { useLayoutEffect, useRef, useState } from "react";
import { Image, Linking, Platform, Text } from "react-native";
import { Button, Card, Label, Notice, sharedStyles } from "@/components/ui";
import { mobileProductLocale } from "@/lib/product-experience";
import { createProjectBrainPhotoSelection, PROJECT_BRAIN_PHOTO_OPTIONS, type ProjectBrainPhotoMode, type ProjectBrainPhotoPreview } from "@/lib/project-brain-photo-selection";
import type { ProjectBrainPickerContext } from "@/lib/project-brain-source-picker";
import type { ProjectBrainSourceAttempt } from "@/lib/project-brain-intake";

export type ProjectBrainPhotoCaptureProps = {
  context: ProjectBrainPickerContext | null;
  projectName: string;
  locale?: string | null;
  disabled: boolean;
  /** Atomically acquire the shared native-action lease; return an owner-bound release closure. */
  acquireNativeAction: () => (() => void) | null;
  onImport: (attempt: ProjectBrainSourceAttempt) => Promise<ProjectBrainSourceAttempt>;
};

export function ProjectBrainPhotoCapture(props: ProjectBrainPhotoCaptureProps) {
  if (!props.context) return null;
  const { workspaceId, projectId, intakeId, stateVersion } = props.context;
  return <PhotoCaptureSession key={JSON.stringify([workspaceId, projectId, intakeId, stateVersion])} {...props} context={props.context} />;
}

function PhotoCaptureSession({ context, projectName, locale, disabled, acquireNativeAction, onImport }: ProjectBrainPhotoCaptureProps & { context: ProjectBrainPickerContext }) {
  const [controller] = useState(createProjectBrainPhotoSelection);
  const [preview, setPreview] = useState<ProjectBrainPhotoPreview | null>(null);
  const [previewLoaded, setPreviewLoaded] = useState(false);
  const [busy, setBusy] = useState(false);
  const [attempted, setAttempted] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [settingsNeeded, setSettingsNeeded] = useState(false);
  const mounted = useRef(false);
  const current = useRef<ProjectBrainPickerContext | null>(null);
  const { workspaceId, projectId, intakeId, stateVersion } = context;
  useLayoutEffect(() => {
    mounted.current = true; current.current = Object.freeze({ workspaceId, projectId, intakeId, stateVersion });
    return () => { mounted.current = false; current.current = null; };
  }, [workspaceId, projectId, intakeId, stateVersion]);
  const fr = mobileProductLocale(locale) === "fr-CA";
  const text = (french: string, english: string) => fr ? french : english;

  async function select(mode: ProjectBrainPhotoMode) {
    const captured = current.current;
    if (!captured || disabled || attempted || controller.isBusy() || Platform.OS === "web") return;
    const release = acquireNativeAction();
    if (!release) return;
    setBusy(true); setMessage(null); setSettingsNeeded(false);
    try {
      const result = await controller.select({ mode, context: captured, readCurrentContext: () => current.current,
        getCameraPermission: ImagePicker.getCameraPermissionsAsync, requestCameraPermission: ImagePicker.requestCameraPermissionsAsync,
        pickCamera: () => ImagePicker.launchCameraAsync({ ...PROJECT_BRAIN_PHOTO_OPTIONS }),
        pickLibrary: () => ImagePicker.launchImageLibraryAsync({ ...PROJECT_BRAIN_PHOTO_OPTIONS }),
        commandId: () => globalThis.crypto.randomUUID() });
      if (!mounted.current) return;
      if (result.status === "PREVIEW_ONLY") { setPreview(result.preview); setPreviewLoaded(false); }
      else if (result.status === "PERMISSION_DENIED") {
        setSettingsNeeded(!result.canAskAgain);
        setMessage(text("Accès caméra refusé. Aucune photo n’a été prise ou importée.", "Camera access denied. No photo was taken or imported."));
      } else if (result.status === "INVALID_PHOTO") setMessage(text("Photo non compatible : choisis un JPEG ou PNG de 10 Mo maximum, avec un type et une taille connus. Les HEIC et vidéos ne sont pas importés.", "Unsupported photo: select a JPEG or PNG up to 10 MB with a known type and size. HEIC and videos are not imported."));
      else if (result.status === "CANCELED") setMessage(text("Sélection annulée. Rien n’a été importé.", "Selection canceled. Nothing was imported."));
      else if (result.status !== "BUSY") setMessage(text("Le sélecteur a été interrompu ou le chantier a changé. Rien n’a été importé. Sélectionne la photo de nouveau.", "The picker was interrupted or the project changed. Nothing was imported. Select the photo again."));
    } finally { release(); if (mounted.current) setBusy(false); }
  }

  async function importReviewed() {
    if (!preview || !previewLoaded || disabled || attempted || controller.isBusy()) return;
    const release = acquireNativeAction();
    if (!release) return;
    setBusy(true); setAttempted(true); setMessage(null);
    try {
      const result = await controller.confirm({ preview, readCurrentContext: () => current.current, onImport });
      if (!mounted.current) return;
      setMessage(result.status === "CONFIRMED"
        ? text("Cette photo a été enregistrée dans le dossier du chantier. Aucune analyse IA n’est affirmée.", "This photo was saved to the project record. No AI analysis is claimed.")
        : text("Import non confirmé ici. Vérifie les fichiers en attente du chantier; ne crée pas une deuxième demande pour cette photo.", "Import is not confirmed here. Check the project's pending files; do not create a second request for this photo."));
    } finally { release(); if (mounted.current) setBusy(false); }
  }

  return <Card>
    <Text style={sharedStyles.name}>{text("Ajouter une photo au chantier", "Add a photo to the project")}</Text>
    <Text style={sharedStyles.muted}>{text("Une seule photo choisie ou prise volontairement. Aucun accès général à la galerie n’est demandé ici. L’import attend ta confirmation de l’aperçu.", "One photo you choose or take voluntarily. This screen requests no broad gallery access. Import waits for your preview confirmation.")}</Text>
    {Platform.OS === "web" ? <Notice>{text("Utilise l’application Android ou iOS installée pour ce parcours photo.", "Use the installed Android or iOS app for this photo workflow.")}</Notice> : !preview && !attempted ? <>
      <Button disabled={busy || disabled} onPress={() => void select("CAMERA")}>{text("Prendre une photo", "Take a photo")}</Button>
      <Button tone="secondary" disabled={busy || disabled} onPress={() => void select("LIBRARY")}>{text("Choisir une photo", "Choose a photo")}</Button>
    </> : null}
    {settingsNeeded ? <Button tone="secondary" disabled={busy} onPress={() => { void Linking.openSettings().catch(() => setMessage(text("Ouvre les autorisations Caméra d’ENDVERA dans les paramètres du téléphone.", "Open ENDVERA's Camera permissions in phone settings."))); }}>{text("Ouvrir les autorisations caméra", "Open camera permissions")}</Button> : null}
    {preview ? <>
      <Label>{attempted ? text("Photo sélectionnée — résultat ci-dessous", "Selected photo — result below") : text("Aperçu local — pas encore importé", "Local preview — not imported yet")}</Label>
      <Text style={sharedStyles.value}>{projectName}{"\n"}{preview.attempt.command.fileName}{"\n"}{preview.attempt.command.mimeType}{" · "}{preview.attempt.command.sizeBytes}{text(" octets", " bytes")}</Text>
      <Image source={{ uri: preview.attempt.command.uri }} style={{ width: "100%", height: 240 }} resizeMode="contain" accessibilityLabel={text("Aperçu exact de la photo sélectionnée", "Exact selected photo preview")}
        onLoad={() => setPreviewLoaded(true)} onError={() => { setPreviewLoaded(false); setMessage(text("L’aperçu ne peut pas être affiché. Aucun import ne sera lancé depuis cet aperçu.", "Preview cannot be displayed. No import can start from this preview.")); }} />
      <Notice>{text("Le fichier choisi peut conserver ses métadonnées intégrées. Aucune localisation ni donnée EXIF n’est extraite par cet écran; leur suppression n’est pas garantie. Confirme seulement si cette photo peut être ajoutée au chantier.", "The selected file may retain embedded metadata. This screen extracts no location or EXIF data; their removal is not guaranteed. Confirm only if this photo may be added to the project.")}</Notice>
      {!attempted ? <>
        <Button disabled={busy || disabled || !previewLoaded} onPress={() => void importReviewed()}>{text("Confirmer cette photo et l’importer", "Confirm and import this photo")}</Button>
        <Button tone="secondary" disabled={busy} onPress={() => { if (controller.discard()) { setPreview(null); setPreviewLoaded(false); setMessage(text("Aperçu abandonné. Rien n’a été importé.", "Preview discarded. Nothing was imported.")); } }}>{text("Annuler cet aperçu", "Cancel this preview")}</Button>
      </> : null}
    </> : null}
    {message ? <Notice>{message}</Notice> : null}
  </Card>;
}
