# Delta proposé — lecture propriétaire et admission typée du gateway voix

Statut : étapes1et2 IMPLEMENTED_LOCAL_OFF; admission/transport des étapes3et4
encore non implémentés. Le sujet fermé et sa projection sont seulement des
liaisons d'intégrité, jamais une autorisation. La première
exécution native de la migration de persistance a échoué avant les tests sur
une expression PL/pgSQL `NOT CASE` (42601). Correction parenthésée soumise à
contre-revue ; preuve d'échec conservée : `postgres-native-1789028796787`.
Après correction,126tests natifs ont passé; ajout de la lecture propriétaire
validé par15/15 scénarios natifs (dont expiration DB réelle). La projection et
les bindings ont reçu deux revues distinctes;378/378 tests ciblés gateway/voix,
TypeScript et lint passent. Ces nombres recouvrent des suites, ne pas les sommer.

## 1. Plus petit prochain lot : projection propriétaire, sans admission

Ajouter dans `voice/project-brain-sessions.ts` un lecteur interne
`projectBrainVoiceSessionForOwner({ actorUserId, sessionId }, { enabled })`.
OFF par défaut. Pas de route HTTP, de lecture audio, de log download, de
transcript brut ou de nouvelle écriture dans cette tranche.

Une seule transaction Serializable :

- Charger exclusivement une session `project_brain_voice` de ce demandeur, ses
  champs sourceBinding/manifeste et au plus 14 segments.
- Recharger le propriétaire actuel, membre et epochs, workspace/projet actifs,
  source/file/intake/version avec le même inspecteur de sujet transactionnel.
  Comparer tous les hashes canoniques et les identités à la session persistée.
- Lire l'horloge DB et exposer explicitement l'expiration même si le statut
  historique est encore `finishing`. La projection ne prolonge rien.
- Renvoyer sessionId/sourceId/intakeId/projet, statut enregistré, expiration,
  segments ordonnés avec durées et états, consentement LOCAL SYNTHETIC et
  limites. Pas de storageKey, de clé fournisseur ou d'affirmation de transcription.
- Résultat `READ_ONLY_NOT_AUTHORIZED`, `executionAuthorized:false` et
  `transcriptionAvailable:false` tant qu'aucun transcript conforme n'est présent.

Reconstituer un inspecteur de **métadonnées de manifeste stocké** à partir du
contrat actuel, pas lui passer des octets fictifs pour satisfaire le validateur
source-segments. Il doit comparer ordinal/plages/hash/MIME/taille aux vraies
lignes de segments, sans prétendre revérifier les octets qui ne sont pas lus.
Tests : mauvais utilisateur/tenant, epochs révoqués/changés, source/session
croisées, JSONB ordre différent, hash changé, segment absent/extra, expiration,
aucune lecture de stockage et zéro écriture. Aucune migration nécessaire.

## 2. Surface d'admission réellement à adapter

| Point actuel | Limite observée | Delta fermé proposé |
| --- | --- | --- |
| `model-gateway/types.ts` | Sujet voice uniquement session/segment legacy | Union discriminée `voice_intake_segment` / `project_brain_voice_segment`, cette dernière avec workspace/projet/intake/source et sourceBindingHash/manifestHash |
| `privacy.ts:buildVoiceGatewayRequest` | Fingerprint ne comprend que projection audio | Branches explicites ; le PB ajoute le sujet exact et ses hashes au fingerprint, sans changer le fingerprint legacy |
| `operations.ts:bindGatewayOperation` | Tenant voice égale voice.clientId | Charger subjectKind/source/demandeur/workspace ; PB exige clientId NULL et tenant `construction-workspace:<workspaceId>` ; legacy exige clientId exact |
| `operations.ts:createGatewayAttempt` | Recontrôle budget/tenant voice sur clientId | Même branche fermée et recontrôle du même AiOperation.voiceIntakeSegmentId et source PB |
| `voice/operations.ts:reserveVoiceAiOperation` | CLIENT-only | Inspection transactionnelle commune de sujet, pas un faux actor.role CLIENT ; réutiliser le même AiOperation et sa clé liée au segment |
| `voice/dispatch.ts` | Admission, prétransport et postréponse CLIENT-only | Brancher le même resolver partout et la même chaîne policy/route/hold/attempt ; pas un autre engine |
| `voice/transcripts.ts` | Stockage/lecture d'un attempt accepté uniquement clientId | Ajouter branche propriétaire et provenance source/gateway/attempt exacte ; brut reste protégé et expirant |
| `voice/assembly.ts` | Assemblage ordre/complet, mais ne rehash pas le texte fourni | Vérifier `canonicalFingerprint(text)` contre chaque textFingerprint avant assemblage et garder provenance audio/attempt/source |

`ProtectedContentRef` peut conserver `voice_intake_input/output` : l'identifiant
est le segment existant, le namespace de tenant et le sujet fermé fournissent
le contexte. Ne pas dupliquer les colonnes AiOperation dans une opération
personnelle ou Task artificielle.

## 3. Garde-fous nécessaires avant un premier dispatch synthétique

Le consentement persisté dans la tranche actuelle dit explicitement
`externalProcessingAllowed:false` et le manifeste est `SYNTHETIC_LOCAL`.
Cela ne change pas au moment d'ajouter un sujet au type TypeScript.

- Première adoption : adaptateur synthétique existant uniquement et résultat
  de préparation/texte non vérifié. Le candidat STT OpenRouter reste OFF et la
  certification de routage/privacy/pricing demeure une exigence distincte.
- Lire la policy et toutes les limites **avant** de créer l'opération. Le flux
  legacy réserve actuellement un AiOperation avant de vérifier la policy ; ne
  pas reproduire un AiOperation orphelin pour la nouvelle branche.
- Le `claimAiOperation` générique admet échec et lease expirée (deux tentatives
  legacy). PB exige une seule tentative : exclure les segments de sessions PB
  de ce claim générique et faire un CAS `reserved/attempts=0 → running/1`
  dans le chemin voice commun sous autorité courante. Aucun retry automatique,
  aucun nouveau ledger. La session/source unique empêche le reset par nouvelle
  commande ; elle ne remplace pas le fencing de chaque tentative.
- Admission PB atomique : verrou de session, preuve de sujet actuelle, policy,
  route synthétique, budget de session/compte actuel, hold canonique et CAS.
  Réutiliser les helpers transactionnels du ledger existant. Ne pas confondre
  maxTotalCostMicros du consentement local avec une somme déjà réservée.
- Ordre de verrous défini et court ; aucun réseau dans la transaction. Date
  limite absolue couvrant DB/transport/lecture, reinspection après latence,
  perte de résultat ou commit = UNCERTAIN et holds conservés.
- Réconcilier les timestamps bruts encore présents dans la lane voice legacy
  avant de les exécuter sous le nouveau sujet. Le nouveau stockage UTC ne
  corrige pas automatiquement les anciens `$Date` non castés et `now()`.
- `buildVoiceSegmentProjection` exige des MIME canoniques (ex. m4a→audio/mp4),
  tandis que le manifeste local accepte quelques alias. Soit le profil de
  segmentateur produit directement la forme canonique, soit on refuse une
  session non compatible ; aucune modification silencieuse de son manifeste
  immuable. Réutiliser l'unique contrat MIME du gateway lors de l'adoption.

## 4. Tests et ordre sans élargir l'autorité

1. Projection propriétaire seule (pas de nouvelle migration) et tests de
   révocation/hash/JSONB/absence d'accès aux octets.
2. Type + builder + bindings partagés avec tests legacy inchangés et PB fermé
   avant adoption. Aucun AiOperation créé lorsque policy/source n'est pas valide.
3. Claim one-attempt et reinspection dans le gateway existant : concurrence
   native deux workers, aucune reclamation par le runner générique, holds non
   libérés sur incertitude, horloges UTC/New_York/Tokyo. Modifier le claim partagé
   seulement avec revue de ses consommateurs legacy.
4. Exécution synthétique injectée → transcript protégé → assemblage non vérifié
   → projection de review. Texte source « appelle Marc » ne déclenche rien.
5. Pas de facts, de publication de route, d'activation de candidat, de nouvelle
   clé ou de budget réel dans ces lots. Un consentement réel et le profil de
   décodeur ne sont pas fabriqués à partir d'une fixture ou d'un résultat local.
