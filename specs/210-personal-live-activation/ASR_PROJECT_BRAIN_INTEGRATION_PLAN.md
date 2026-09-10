# ADR proposé — transcription Project Brain derrière le gateway existant

Date : 2026-09-10. Statut : **PROPOSED — LOCAL OFF IMPLEMENTATION PLAN**.
Décideurs : contrôleur ENDVERA et revue technique indépendante avant tout code
d'admission critique. Base inspectée : `9a650bbe4143b966c33b1899c4843d674e1c135c`,
avec changements locaux coordonnés des lanes UTC et capture mobile.

Ce document n'active rien. Aucune transcription réelle, API produit, clé,
donnée audio personnelle, dépense, publication, migration ou build APK exécuté
pour cette étude. Aucun pourcentage de préparation ni résultat ASR n'est déduit.

## 1. Verdict et contexte démontré

**Réutiliser le moteur `intake_voice_transcription`, pas créer un deuxième
pipeline.** Il faut adapter son sujet d'autorisation au Project Brain et fournir
une projection de review séparée des sources historiques. La capture de 600 s
en cours dans la lane Android est une capacité d'enregistrement/upload, pas de
transcription ni de compréhension.

Constats du code actuel :

- `src/server/model-gateway/voice/types.ts` : session 600000 ms, segment 45000 ms,
  au plus 14 segments, 2000000 octets/segment, 28000000 octets/session ; texte
  limité à 20000 caractères/segment et 120000/session, TTL de 24 h.
- `voice/{sessions,operations,dispatch,transcripts,assembly}.ts` : opérations
  durables, claims, budgets de session/compte, résultat lié à un segment et à une
  tentative, assemblage ordonné et fingerprints existent. Leur présence n'est
  pas une preuve de qualité ASR ou de compatibilité live.
- Sujet actuel : `voice_intake_segment`, session et segment ; autorisation
  `VoiceActor.role === CLIENT` et `VoiceIntakeSession.clientId`. Ni workspace,
  projet, intake, source Project Brain ni epoch du membre ne sont liés.
- `src/server/voice-intake-runtime-boundary.ts` est volontairement fermé par
  configuration constante. Les actions du portail sont CLIENT-only et cette
  frontière n'orchestre pas un fournisseur de transcription. Ne pas l'activer
  pour contourner le sujet Project Brain.
- R36V stocke une seule VOICE_NOTE par intake. `projectBrainSourceBytesForUser`
  recharge le fichier local, vérifie taille/hash/MIME/inspection et recontrôle
  l'accès après lecture. C'est le point de réutilisation pour les octets, pas une
  URL publique ou un média arbitraire fourni au modèle.
- `ConstructionProjectBrainSource` et ses fichiers/snapshots sont immuables.
  Le CHECK `CPBS_interpretation_check` impose `NOT_REQUESTED_LOCAL_ONLY`.
  R36W compare cette valeur au snapshot historique et ne crée aujourd'hui que
  des candidats issus du brief confirmé et des métadonnées des sources.
- Aucun segmentateur M4A/ASR local exploitable n'a été identifié dans les
  dépendances déclarées et les modules inspectés. Ce constat ne prétend pas
  inventorier chaque exécutable installé sur le poste.

## 2. Contradictions fournisseur à résoudre avant adoption

Le candidat existant `voice/adapters/openrouter-candidate.ts` prépare le bon
type d'endpoint STT JSON/base64. Mais il envoie `provider.only` comme un pin.
La documentation primaire consultée le 2026-09-10 indique que les préférences
`order`, `only`, `ignore` ne sont pas appliquées aux requêtes de transcription.
Le candidat ne peut donc pas prouver le choix exact d'endpoint avec ce champ.
Ne pas étendre cette conclusion en prétendant que tous les autres paramètres
sont garantis ou ignorés : ZDR, collecte, résidence et fallback restent à
vérifier séparément pour le contrat STT. [Guide STT OpenRouter](https://openrouter.ai/docs/guides/overview/multimodal/stt).

Autre écart : l'adaptateur lit `usage.audio_seconds`, tandis que le contrat
documenté expose `usage.seconds`. La réponse `usage` est optionnelle. Il faut
une fixture wire synthétique conforme et une politique explicite d'absence de
coût, pas convertir l'absence en zéro. [Référence STT OpenRouter](https://openrouter.ai/docs/api/api-reference/stt/create-transcription).

Décision : conserver **EXTERNAL OFF**. Aucun modèle, tarif, nouveau fournisseur,
clé ou budget n'est sélectionné par ce plan. Une route publiée actuelle de
texte personnel n'autorise pas une route audio. Une future certification doit
résoudre la contradiction de routage ; à défaut, refus de cette route, sans
fallback caché vers chat audio ou fournisseur direct.

## 3. Options et décision

1. **Retenu :** même gateway, même opération STT et mêmes tables de segments,
   sujet Project Brain discriminé, sidecar de review. Plus de contrôles de
   liaison à ajouter, mais une seule autorité de claim/budget/dispatch.
2. **Rejeté :** fabriquer un CLIENT/Task ou détourner le gateway SMS personnel.
   Cela perdrait le tenant, la provenance et le consentement propres à l'audio.
3. **Différé :** envoyer d'emblée un fichier de 600 s comme un segment unique.
   Cela change la borne actuelle de 45 s et nécessite une preuve de limites,
   timeout, coût et routage ; ce n'est pas le raccourci local retenu.
4. **Rejeté :** écrire le texte directement dans le brief ou dans les facts.
   Une sortie ASR n'est ni une déclaration humaine confirmée ni une intention
   d'action.

## 4. Sujet typé et autorité durable proposée

Étendre le resolver de sujet voice, utilisé partout, avec deux branches fermées :

```ts
type VoiceSubject =
  | { kind: "voice_intake_segment"; sessionId: string; segmentId: string }
  | {
      kind: "project_brain_voice_segment";
      sessionId: string; segmentId: string;
      workspaceId: string; projectId: string; intakeId: string; sourceId: string;
      sourceContentHash: string; segmentManifestHash: string;
    };
```

Le client demande seulement une transcription de `sourceId` avec commandId et
état attendu. Le backend recharge tous les autres champs. Les hashes du type
ci-dessus sont des résultats du resolver, jamais des preuves acceptées du client.

Persistance à concevoir dans une future migration revue, non écrite ici :

- Étendre `VoiceIntakeSession` par un discriminant et une liaison optionnelle
  Project Brain composite source/intake/projet/workspace. Conserver la branche
  legacy CLIENT exacte. Pour la branche Project Brain, identifier explicitement
  `requestedByUserId` ; ne pas faire passer un propriétaire pour un CLIENT.
  CHECK exclusif des deux variantes, FK restrictives et identité immuable.
- Lier la source par son fileId, hash, MIME et durée inspectée ; ajouter les
  contraintes composites/uniques minimales nécessaires sans toucher sa valeur
  `transcriptionState` ni réécrire un snapshot confirmé.
- Réutiliser `VoiceIntakeSegment` et `AiOperation.voiceIntakeSegmentId`. Aucun
  nouvel AiOperation parallèle ni PersonalAssistantOperation artificiel.
- Persister un manifeste de transformation immuable et une review liée à
  session + assemblyFingerprint. La review/décision est un sidecar de contenu
  dérivé, pas une deuxième autorité de dispatch.
- Pin du demandeur, propriétaire actuel, membre/role/epoch, workspace actif,
  projet actif, source et consentement audio versionné. Pour le premier scope
  founder : propriétaire actuel et source déposée par ce même propriétaire.
  Les droits OFFICE_MANAGER existants de lecture ne valent pas consentement
  d'envoi à un service audio ; extension déléguée hors première phase.

Recontrôles obligatoires : admission, lecture des octets, réservation/claim,
juste avant tentative et après latence avant stockage/projection. Une révocation
ou un changement de contexte rend le résultat non consommable. Reprendre les
fences deterministes du gateway et la convention UTC corrigée, pas un nouveau
check d'autorisation dont la sémantique diverge.

## 5. Segmentation et ordre

```text
source VOICE_NOTE immuable → octets locaux revérifiés → manifeste/segments
→ AiOperation par segment → gateway STT → texte non vérifié par segment
→ assemblage exact → review explicite → éventuelle demande séparée de facts
```

Une seule source mobile reste une seule source. Les segments sont des dérivés
internes, pas 14 nouvelles VOICE_NOTE dans l'intake.

- Inspecter la timeline réelle M4A et conserver la durée de source, jamais la
  durée déclarée par le téléphone ou par l'ASR comme vérité canonique.
- Découpage déterministe par échantillons/frames en plages demi-ouvertes,
  ordonnées, sans trou ni recouvrement. Chaque segment doit être un conteneur
  audio valide ; découper des octets arbitrairement n'est pas un segmentateur.
- Manifeste : version du transformateur et profil encodage, parent fileId/hash,
  durée/échantillons, ordinal, début/fin, hash/octets/MIME de chaque dérivé.
  Version + manifestHash entrent dans le requestFingerprint.
- Départ ≤45 s, ≤2 MB, ≤14 segments, total source ≤600 s/10 MiB et enveloppe
  dérivée ≤28 MB. Si les vraies frames imposent une marge supérieure ou quinze
  segments, refuser ou réviser explicitement le profil ; ne pas rogner l'audio.
- Pour la première tranche OFF : segmentateur injecté et fixtures audio
  synthétiques. Avant un vrai M4A, choisir/revoir un décodeur local maintenu,
  borné CPU/mémoire/temps/fichiers, sans réseau. Aucune installation incluse ici.
- Assemblage avec tous les ordinals attendus, texte/segment/hash/tentative exacts.
  Revalider le hash du texte stocké, pas seulement sa présence. Aucun trou rempli
  par un modèle et aucun résumé utilisé comme substitut de transcription.
- Les horodatages/speakers renvoyés par ASR sont des annotations non vérifiées.
  Ne pas inventer une confiance par mot, une identité de locuteur ou un alignement
  exact lorsque le candidat ne fournit que du texte.

## 6. Budget, reprise et incertitude

Utiliser la politique/route du gateway et le ledger de compte déjà existants.
Une autorisation audio dédiée doit préciser propriétaire, finalité, plafond,
échéance, model/route et rétention ; les anciennes autorisations R37 et le
budget du moteur SMS ne sont pas hérités.

- Réserver conservativement avant la tentative : durée tarifable arrondie selon
  la grille revue, éventuels tokens d'entrée/sortie et FX CAD/USD versionné.
  Si une composante n'est pas bornable, pas de dispatch.
- Compter tous les segments, holds actifs, coûts réglés et expositions incertaines
  dans l'enveloppe de session et de compte. Une nouvelle session pour la même
  demande ne doit pas réinitialiser le plafond.
- Coût déclaré par le candidat ≠ reçu de règlement fiable. Le dispatch voice
  actuel utilise `usage.measuredCostMicros` pour régler : ce point doit être
  réconcilié avant réutilisation externe. Ne pas recopier cette supposition dans
  le nouveau sujet. Le mode local synthétique doit rester étiqueté comme tel.
- Rejouer une commande déjà reçue retourne le même état durable. Segment
  terminé : relire ; non commencé : reprendre seulement sous autorité encore
  valide ; tentative peut-être envoyée : UNCERTAIN, aucun retry/fallback.
- Une expiration, annulation, réponse tardive ou perte de CAS conserve la preuve
  et les holds non réglés. Une opération de purge ne libère pas une dette.
- Pas de réseau dans une transaction réessayable de R36V. Claim durable puis
  tentative unique, réception/finalisation atomiques et bornées ; worker non
  dépendant d'une requête HTTP ou de la survie de l'écran mobile.

## 7. Texte, review et faits

La projection additive affiche `AUDIO_STORED`, `TRANSCRIPTION_PENDING`,
`TRANSCRIPT_UNVERIFIED`, `INCOMPLETE`, `UNCERTAIN`, `EXPIRED` ou état de review
exact. Elle ne remplace pas le champ historique `NOT_REQUESTED_LOCAL_ONLY`.

Review : audio original autorisé, texte intégral, plage/ordinal, avertissements
sur lacunes et source visible. Les modifications de l'utilisateur créent une
révision séparée conservant hash du texte brut, texte édité, reviewer, source et
assemblyFingerprint. Confirmation exacte par hash/version ; double confirmation
rejouée, changement de source/contexte/review refusé.

Phase locale minimale : **aucune écriture de facts**. Une confirmation de la
lisibilité de transcription n'implique pas que chaque proposition est vraie ou
qu'une action doit être exécutée. Le futur passage vers R36W/R36X devra disposer
d'une provenance typée de transcript revu et d'une nouvelle décision explicite ;
jamais détourner `OWNER_BRIEF_FIELDS_V1` ou `SOURCE_METADATA`.

Le brut garde le TTL voice de 24 h. Le texte corrigé/confirmé doit avoir une
rétention distincte explicitement choisie, ou expirer aussi ; aucune copie
durable implicite. En cas de purge, garder seulement les références/hashes
autorisés et rendre la review indisponible. Texte dans stockage protégé, jamais
dans logs, audit ordinaire ou URL publique.

## 8. Ordre d'implémentation et fichiers minimaux

1. **Contrat/source resolver OFF.** `model-gateway/types.ts`, `privacy.ts`,
   `operations.ts`, nouveau `voice/project-brain-subject.ts`. Extraire au besoin
   les contrôles/lecture de R36V pour un usage interne sans faux log « download ».
   Tests ownership/context/hash et compatibilité stricte de la branche CLIENT.
2. **Persistance/manifeste.** `schema.prisma`, une migration revue dédiée future,
   `voice/sessions.ts`, `voice/operations.ts`, nouveau `voice/source-segments.ts`.
   Tests transactions, contraintes composites, replay et bornes des dérivés.
3. **Dispatch réutilisé et budget.** `voice/dispatch.ts`, `adapters/contract.ts`,
   `openrouter-candidate.ts` et tests wire injectés. Revoir lease UTC, annulation,
   post-latence et règlement avant tout externe. Ne pas activer la route portail.
4. **Review protégée.** `voice/transcripts.ts`, `assembly.ts`, nouveau
   `voice/project-brain-review.ts`, projection additive dans R36V. Aucune
   modification R36W/R36X nécessaire pour terminer ce lot review-only.
5. **Commande et UI OFF.** Sous l'API mobile Project Brain existante : commande
   sourceId + commandId, projection d'état/review, puis `apps/mobile/src/lib/api.ts`
   et écran intake/review. Charger les guides Next locaux avant code route.
   Ne pas uploader à nouveau l'audio déjà admis ; ne pas coupler à l'enregistrement.

Ces fichiers sont un périmètre proposé, pas l'autorisation d'implémenter une
migration dans cette étude. Chaque lot critique est revu par un autre agent.

## 9. Matrice de validation minimale proposée

1. OFF sans DB/lecture audio/transport ; aucun flag de chat ou SMS ne l'active.
2. Mauvais propriétaire/workspace/projet/intake/source, membre révoqué, rôle
   changé, consentement ancien : refus avant lecture/dispatch et après latence.
3. source/file/bytes/hash/MIME/timeline différents ; modèle qui prétend un hash
   valide ; source immuable et snapshot historique inchangés.
4. Audio synthétique 44999/45000/45001 ms, 599999/600000/600001 ms,
   2 MB/10 MiB/28 MB aux frontières ; manque/trou/overlap/ordinal dupliqué.
5. Deux workers et deux reprises simultanées : une seule tentative par segment,
   ledger de session/compte unique, aucune reconstitution d'un hold déjà réglé.
6. Coût absent/négatif/dépassement, rate/FX périmés ou changés, kill switch retiré,
   timeout/abort/perte de commit : aucune réussite ou libération inventée.
7. Wire `usage.seconds`, réponse vide/énorme, champs non supportés ; prouver
   qu'une demande de pin fournisseur non garantie ne devient jamais une route
   éligible. Ne pas utiliser les seuls mocks comme certification fournisseur.
8. Crash après segment 3/14, retour dans un autre compte/projet, annulation,
   purge à 24 h, réponse tardive : reprise lisible, pas de second envoi incertain.
9. Corpus synthétique québécois : négations, noms/homophones, adresses, nombres,
   heures, bruit/silence, longues dictées, demandes multi-actions et texte de
   type injection. Mesurer erreurs lexicales et champs critiques avec rubric
   séparé ; aucun score inventé à partir de l'intégration technique.
10. Review corrigée, hash/version périmés, double confirmation et purge : aucune
    création de facts ni action. Test explicite « appelle Marc » reste du texte.
11. PostgreSQL natif : contraintes/revocations/concurrence sous UTC/New_York/Tokyo.
    Tests mobiles du journal ne remplacent pas preuve capture réelle Samsung.

## 10. Sortie du lot et blocages explicites

Sortie autorisée : source synthétique locale → session gateway liée → segments
injectés → transcript non vérifié → review lisible, avec toutes les tentatives,
coûts synthétiques et refus traçables ; zéro transport externe et zéro fact/action.

Avant un essai réel : adoption/certification STT et confidentialité exactes,
tarification et budget audio actuels, consentement audio, vraie segmentation
M4A bornée, stockage/rétention et worker hébergé validés. Credentials restent
côté serveur via coffre/lecture paresseuse autorisée ; jamais dans APK, journal,
prompt, logs ou commits. Publier une policy/route ou déployer n'est pas une
conséquence automatique de ce plan. Si un prérequis manque, finir les tests
locaux indépendants et conserver la transcription externe indisponible.
