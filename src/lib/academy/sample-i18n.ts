import type { WorkersLang } from "@/lib/i18n/workers";

/**
 * Translations for the ONE public sample exam question (data-cleanup
 * course, question index 0 — see SAMPLE in src/lib/academy/public.ts).
 *
 * This is deliberately NOT a general translation layer for academy content.
 * The real courses behind an account (src/lib/academy/content.ts, several
 * thousand lines) stay English on purpose — see the note in
 * src/lib/i18n/workers.ts's `chAcademy` field. Translating the certification
 * exams themselves is a much larger, higher-stakes decision (a mistranslated
 * question changes what "correct" means) that hasn't been made. This file
 * exists only because one specific question is shown, unauthenticated, on
 * the marketing page — a reader who can't yet read the real course should
 * still be able to answer the one question that demonstrates what it's
 * like, in their own language.
 *
 * Every entry MUST stay in lockstep with the English source at
 * content.ts → courses["data-cleanup"].exam.questions[0]: same number of
 * options, same correct index, same facts in `explain`. If that question
 * ever changes, these three translations go stale silently — there's no
 * automated check tying them together.
 */
export type SampleTranslation = {
  prompt: string;
  options: [string, string, string, string];
  explain: string;
};

export const SAMPLE_EXAM_TRANSLATIONS: Partial<Record<WorkersLang, SampleTranslation>> = {
  fr: {
    prompt:
      "Vous dédupliquez un export CRM de 4 000 contacts. Deux lignes : Maria Santos, maria.santos@acmecorp.com, et Maria Santos, msantos@acmecorp.com, toutes deux chez Acme Corp avec le même titre de poste. Le mandat dit de retirer les doublons. Que faites-vous ?",
    options: [
      "Garder les deux lignes, car les adresses courriel sont des chaînes différentes et ne sont donc pas de vrais doublons.",
      "Supprimer la ligne qui apparaît en second dans le fichier pour que le compte baisse proprement.",
      "Les traiter comme une seule personne, fusionner selon votre règle de survivant, et noter la paire dans votre journal de modifications.",
      "Déplacer les deux lignes dans un onglet séparé et laisser l'opérateur trancher chaque paire de doublons.",
    ],
    explain:
      "Le nom, l'entreprise et le titre concordent, et les courriels partagent un domaine et un motif. Plusieurs signaux indépendants établissent l'identité ; des chaînes identiques ne sont pas requises.",
  },
  es: {
    prompt:
      "Estás deduplicando una exportación de CRM de 4000 contactos. Dos filas: Maria Santos, maria.santos@acmecorp.com, y Maria Santos, msantos@acmecorp.com, ambas en Acme Corp con el mismo puesto. El brief dice que elimines los contactos duplicados. ¿Qué haces?",
    options: [
      "Conservar ambas filas, porque las direcciones de correo son cadenas distintas y por lo tanto no son duplicados verdaderos.",
      "Eliminar la fila que aparece segunda en el archivo para que el conteo baje limpiamente.",
      "Tratarlas como una sola persona, fusionar según tu regla de superviviente, y registrar el par en tu registro de cambios.",
      "Mover ambas filas a una pestaña aparte y dejar que el operador decida cada par de duplicados.",
    ],
    explain:
      "El nombre, la empresa y el puesto coinciden, y los correos comparten dominio y patrón. Varias señales independientes establecen la identidad; no se requieren cadenas idénticas.",
  },
  tl: {
    prompt:
      "Nagde-dedupe ka ng 4,000-contact na CRM export. Dalawang row: Maria Santos, maria.santos@acmecorp.com, at Maria Santos, msantos@acmecorp.com, parehong nasa Acme Corp na may parehong job title. Sinasabi ng brief na alisin ang duplicate na contact. Ano ang gagawin mo?",
    options: [
      "Panatilihin ang dalawang row, dahil magkaiba ang email address kaya hindi ito totoong duplicate.",
      "Burahin ang row na pangalawang lumitaw sa file para bumaba nang malinis ang bilang.",
      "Ituring silang iisang tao, i-merge gamit ang iyong survivor rule, at itala ang pares sa iyong change log.",
      "Ilipat ang dalawang row sa hiwalay na tab at hayaang ang operator ang magpasya sa bawat pares ng duplicate.",
    ],
    explain:
      "Magkatugma ang pangalan, kumpanya, at titulo, at may parehong domain at pattern ang mga email. Maraming independiyenteng senyales ang nagpapatunay ng pagkakakilanlan; hindi kailangang magkatulad ang mga string.",
  },
};
