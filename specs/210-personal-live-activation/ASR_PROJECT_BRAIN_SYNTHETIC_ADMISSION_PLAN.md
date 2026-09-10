# Project Brain — admission voix synthétique dans le gateway existant

Statut : ARCHITECTURE LOCALE APPROUVÉE PAR LE PARENT après contre-revue,
avec les décisions ci-dessous. Chaque tranche de code exige encore sa revue.
Pas de publication, nouvelle clé, véritable média, appel fournisseur ou permission
externe. Le schéma75 reste immuable; Android possède la migration76 distincte.

## 1. Première réparation indépendante : octets

Défaut observé le 2026-09-10 à04:47:51 : les trois tests Uint8Array, Buffer et
subarray de `test/voice-projection-byte-ownership.test.ts` échouaient parce que
modifier le buffer appelant changeait les octets après le hash enregistré.

Correctif borné dans `voice/projection.ts` : copie privée avant hash, puis helper
`copyVerifiedVoiceSegmentProjection` qui copie et rehash une projection au point
d'usage. Il reste à brancher ce helper au dispatch : geler un objet ne fige pas
son tableau d'octets. La copie transmise à l'adaptateur ne doit pas être exposée
au détenteur de l'admission pendant une attente asynchrone.

## 2. Interfaces et fichiers minimaux

- `voice/project-brain-sessions.ts` : extraire sans affaiblissement le contrôle
  actuel de lecture dans `inspectProjectBrainVoiceSessionInTransaction(tx,input)`.
  Interne seulement : sujet/consentement/manifeste/lignes exactes +horlogeDB,
  aucun octet et aucune autorité externe. Le wrapper public reste métadonnées
  seulement. Prévoir lecture partagée versus verrou de session pour l'admission;
  ne pas réimplémenter les règles owner/source dans une autre classe.
- `voice/dispatch.ts` : garder les deux points d'entrée existants
  `admitGatewayVoiceSegment` et `dispatchVoiceGatewayAttempt`. Ajouter une branche
  acteur fermée `{kind:'PROJECT_BRAIN_OWNER',id,workspaceId}`; la branche CLIENT
  existante reste explicitement CLIENT, jamais un cast du propriétaire en CLIENT.
  Les fonctions PB transactionnelles internes peuvent être extraites dans
  `voice/project-brain-admission.ts` pour limiter la taille, mais elles réutilisent
  exactement policy/decision/operation/attempt/hold/transcript du gateway actuel.
  Aucun autre routeur, table d'opération, dispatcher public ou worker.
- `voice/operations.ts` : helper transactionnel PB réservé à ce chemin pour
  l'AiOperation existant et son CAS unique. Clé `voiceOperationKey` inchangée,
  FK VoiceIntakeSegment inchangée; aucun Task ni PersonalAssistantOperation.
- `voice/adapters/project-brain-synthetic.ts` : runner synthétique déterministe
  privé utilisant le contrat/key `voice-synthetic-direct` existant. Aucun callback
  transport arbitraire fourni par un appelant. Scénarios fermés pour simuler
  succès/échec/délai/inconnu, bornes strictes, compteur privé. Le factory legacy
  injectable reste séparé et n'est pas accepté comme preuve synthétique PB.
  Une marque privée peut vérifier la construction mais ne représente pas une
  isolation réseau : la garantie de cette tranche vient du code déterministe
  audité sans API/credential/fonction injectée et de ses tests locaux.
- `ai-operations.ts` : exclure les sessions PB du claim générique à deux essais,
  de succeedAiOperation, failAiOperation et recordSupersededUsage. Filtre de
  relation DB fermé : pas de segment, OU segment de session `voice_intake`.
  L'inspection de subjectKind pour la comptabilité superseded vient de la DB,
  pas du purpose envoyé par l'appelant. Aucun faux AiUsage Task/Anthropic pour PB.
- `account-spend.ts` : proposer une entrée explicite `synthetic` dans la table
  des plafonds pour le registre synthétique existant, sans hériter du plafond
  Anthropic/OpenRouter. La branche PB exige ce plafond positif même en local;
  pas de dérogation «non-production illimitée». Réutiliser
  reserveAccountProviderSpendInTransaction et le même ledger.
  La table de noms ne suffit PAS : décision parent, `provider==='synthetic'`
  TOUJOURS strict comme OpenRouter : type bigint/montant positif, tentative
  positive, cap explicite, replay held même montant/jour, agrégats actuels et
  cap courant. Aucune option que l'appelant pourrait omettre. Les autres
  providers legacy gardent leur comportement.
- `voice/transcripts.ts` / `voice/assembly.ts` : la réparation de hash par le
  parent est indépendante et doit rester intacte. Le terminal PB dans le flux
  existant stocke uniquement un transcript non vérifié; lecture propriétaire de
  texte/assemblage et publication de facts sont une tranche ultérieure.

## 3. Conditions OFF et contrat d'entrée

PB exige cumulativement : environnement local, voix explicitement activée pour
le test, activation PB synthétique explicite, deadline absolue bornée, propriétaire
authentifié et workspace, session+segment rechargés, bytes synthétiques fournis
par le harness, policyID et budgetsegment fournis par configuration serveur.
Pas de booléen d'autorité provenant de la source, du modèle ou du client mobile.

Le manifeste et le consentement restent `SYNTHETIC_LOCAL`,
`mediaDecodingVerified:false`, `externalProcessingAllowed:false`. Seule route
acceptable : adaptateur `voice-synthetic-direct`, billingProvider `synthetic`,
intermediary null, policy exacte maxAttempts1/fallbacks vides. OpenRouter STT,
même si la route est publiée ailleurs, est refusé par cette branche.

L'identité/hashes/paramètres/bytes sont copiés avant toute attente. Les alias MIME
historiques ne sont pas réécrits : le segment doit satisfaire le profil canonique
du gateway, autrement refus explicite. Le coût limite local n'est pas une
autorisation de dépense réelle.

## 4. Admission : une seule transaction, aucune opération orpheline

1. Bornes/OFF/acteur/deadline avant accèsDB. Faire la copie bornée des octets.
2. Transaction Serializable, statement_timeout<=2s, lock_timeout<=250ms,
   timeout transaction limité par deadline. Aucun retry de serialization.
3. Verrou advisory `voice-session-spend:<sessionId>` pour sérialiser les segments
   de cette session. Verrouiller source/intake/file/workspace/member/project
   puis session et segment dans un ordre commun à admission/dispatch/terminal.
   Recharger le même inspecteur propriétaire +manifeste et la limite de session.
4. Sourcecourante/TTL/consentement/hashes exacts, segment `registered` seulement;
   session `finishing` ou `transcribing`, jamais terminale. Ordinal suivant non
   traité uniquement; pas de traitement du segment suivant après un inconnu.
5. Charger policy/routes via les loaders existants acceptant `tx`, résoudre
   avec le vrai request PB et l'horlogeDB. Verrouiller les lignes policy/route
   sélectionnées; leurs hashes/pins sont fixes. MaxAttempts1, aucun fallback,
   route synthétique stricte. Toute erreur ici : zéro AiOperation/hold.
6. Prendre les verrous advisory canoniques de breaker
   `gateway-breaker:<scopeKind>:<scopeKey>` en ordre trié, puis recharger via
   loadGatewayBreakerResolution(tx). Cela couvre aussi une ligne absente créée
   par transitionGatewayBreaker; pas seulement les lignes existantes.
7. Plafond synthétique explicite et total session : holds existants retenus
   +coûts synthétiques settled. Le helper account-spend garde son verrou
   `acct-spend:synthetic:<UTCday>`. Toutes les limites sont revérifiées avant
   writes; une réservation refusée provoque rollback entier.
8. Insérer l'AiOperation réservé0 seulement maintenant. S'il existe déjà, état
   retourné/busy sans reclaim/retry, sans hold supplémentaire. CAS exact
   reserved0→running1, lockedBy UUID privé, lease=min(deadline,consentTTL).
   Session finishing→transcribing dans la même transaction.
9. Créer le hold canonique tentative1, binder ModelGatewayOperation, persist
   decision et attempt via les fonctions existantes. Recontrôle caps aprèshold
   avantcommit. Retour admission synthétique copiée, pas de permission d'action.

Contraintes SQL : aucune migration supplémentaire prévue. Les uniques
session/source et operation/segment sont déjà actives. Le nouveau CAS doit
inclure le discriminant PB via jointure, leaseUTC, attempts0 et statut réservé;
jamais `failed` ou lease expirée. Si une garantie nouvelle exige réellement une
contrainte DB supplémentaire, arrêter ce delta et coordonner avec le parent,
pas modifier75 ou concurrencer76.

## 5. Dispatch et résultat : point d'usage et terminal uniques

- L'admission seule ne suffit jamais : reprendre les mêmes locks et inspecteurs,
  refaire policy/route/breaker, owner+epochs/source/consent/TTL, budgetjour et
  budgetsession, même opération/attempt/lockedBy/lease. Comparer tous les pins.
- CAS attempt prepared/not_dispatched→dispatched/unaccounted une fois et segment
  registered→running. Le gagnant unique peut invoquer l'adaptateur synthétique;
  le perdant ne termine jamais la ligne du gagnant. Ce claim commit AVANT le
  callback. Puis un court gate transactionnel reprend les locks et pins courants
  pour invoquer le callback immédiatement sous ces locks, en capturant sa Promise
  avec gestion immédiate de rejet, sans attendre son résultat dans la transaction.
  On attend le résultat après le commit de ce gate. Ce deuxième gate n'est jamais
  accessible à un appel qui a perdu le premier CAS; un commit inconnu après
  callback conserve le hold et ne rappelle rien. Signal deadline immutable.
- Avant invocation, copie privée+rehash des octets immédiate sans await ensuite;
  le fingerprint doit correspondre à la DB et au request. Abort/deadline vérifiés
  avant/après toutes attentes et après résultat. Le contrat d'adaptateur doit
  provenir du runner PB déterministe interne, pas d'une string key ni d'un
  callback transport arbitraire déclaré synthétique.
- Après latence, même inspection et mêmes budgets/pins sous transaction. Un
  résultat tardif, une autorité changée, perte de claim, exception ou coût/usage
  invalide ne donne aucun transcript accepté. État UNCERTAIN, exposition retenue,
  pas de libération automatique ni de retry.
- Si callback n'a pas commencé mais claim déjà durable, enregistrer précisément
  not_dispatched/cancelled_before_dispatch et terminal non-retry; conserver le
  hold jusqu'à réconciliation explicite plutôt que faire croire à une facture.
  Forme exacte : attempt cancelled_before_dispatch/not_dispatched, gateway
  refused, AiOperation abandoned, segment failed (mais définitivement non
  reclaimable par les helpers génériques ou PB). Ce cas connu n'est PAS présenté
  comme un callback exécuté dont le résultat serait inconnu. Ne jamais appeler
  le closeVoiceBeforeDispatch legacy qui libère le hold et met l'AI failed.
  Si commit devient inconnu après invocation, conserver l'incertitude.
- Succès synthétique valide : même terminal canonique voice, CAS exact claim/
  attempt, texte borné +hash recalculé, usage synthétique étiqueté. Peut solder
  le hold synthétique à coût0 seulement avec reçu synthétique déterministe;
  cela ne démontre aucune facturation fournisseur. Pas d'AiUsage Anthropic.

Toutes écritures/comparaisons raw Timestamp(3) utilisent UTC explicite;
paramètres Date vers naive : `($n::timestamptz AT TIME ZONE 'UTC')`.
SELECT clock_timestamp() reste un instant zoné. Aucun backfill de timestamps.

## 6. Vérification et livraisons bornées

A. Copie/rehash : 3 RED observés, correction +tests d'alias/sous-vue/altération;
contre-revue indépendante avant adoption.

B. Sujet/admission/runner : OFF/noDB; revokedowner/source/hash; policy manquante,
route OpenRouter refusée avant AiOperation; rollback holdrefusé; UNIQUE même
source; generic claim/succeed/fail/superseded refusent PB et gardent CLIENT/Task.

C. Dispatch synthétique : mêmeoctetexact, mutation pendantawait, concurrentdeux
workers uncallback, expiration/abort/breaker/revoke/capwithdrawal pré/post,
lostclaim ne touchepaswinner, une seule tentative et holdconservé.

D. Parent seul lance SQLnatif : UTC/NewYork/Tokyo, deuxbackends, coexistence
legacyCLIENT/PB, aucune API réelle. Pas de claim E2E produit ni d'ASR de qualité.

Séparer les checkpoints A, B puis C/D. Aucun élargissement externe ne découle
d'un résultat synthétique GREEN.

## 7. Contre-revue de conception et réconciliation

Le pair a confirmé la compatibilité générale puis demandé trois précisions,
adoptées dans cette proposition : budget strict même sur replay synthétique,
limite exacte de la marque factory et terminal connu sans callback.
Décision finale du parent : runner PB interne déterministe SANS callback
transport arbitraire. Les scénarios de test sont des valeurs fermées, non des
fonctions. Aucune assertion d'isolation réseau d'un callback arbitraire. Les
tests ne lisent ni credentials ni variables réelles et ne font aucun appel
fournisseur. Plafond synthetic strict inconditionnel, sans option contournable.

## Checkpoint A — 2026-09-10

Private projection snapshot/rehash, always-strict synthetic budget, persisted PB
exclusion from all generic retry/Task terminal paths, and transaction-scoped
session reader extraction reviewed. Independent targeted52/52 and145/145 PASS;
the obsolete literal source-order assertion failure remains in the review before
its exact repaired rerun. Main read these diffs and the audit notes. Full root
working-tree snapshot `root-1789032092179`:4222 PASS/3 historical skips,
09:22:32.777Z. It includes concurrent B/registry work and is not coherent-release
or native proof of those unfinished tranches. A has no PB dispatch entry enabled.

At09:26Z the three agents were interrupted by account usage limits; the repeated
heartbeat did not imply active programming during that interruption. Olivier's
subsequent continue resumed work around13:23Z; current usage tool allowed work.
No reset credit was consumed or purchased. B/C and native registry verification
continue; no campaign completion or metric increase follows from checkpoint A.

## Checkpoint B — 2026-09-10 13:40Z

Existing admitGatewayVoiceSegment now accepts the closed Project Brain owner
branch. One Serializable transaction binds source/session/policy/route/breakers,
strict synthetic spend hold and the existing AiOperation's single running claim.
It returns prepared_synthetic_not_dispatched, never execution authority.

Peer counterexamples reproduced two legacy dispatcher boundary defects: forged
subject labels could enter cleanup; a substituted CLIENT session could enter
positive dispatch while retaining PB claim/hold IDs. Both now require the same
durable joined CLIENT binding before any legacy mutation. The audit preserves
the RED observations. Separate reviewer64/64 PASS at09:36:03 local; controller
fresh64/64 PASS at09:40:48 local across the same four files, scoped lint passed.
These are synthetic DB regressions, not native transaction or provider proof.

Checkpoint B excludes project-brain-dispatch.ts and its new dispatch tests.
The existing dispatcher still refuses PB dispatch until C is integrated/reviewed.
Native B/C concurrency, UTC checks and protected transcript handling remain.
