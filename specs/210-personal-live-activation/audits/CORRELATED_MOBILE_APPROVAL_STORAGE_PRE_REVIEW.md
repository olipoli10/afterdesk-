# Pré-revue mobile : tentative persistée et source exacte

2026-09-10. Lecture seule des sources et du plan ; aucune implémentation mobile ou exécution de test par cette passe. Propriété reviewer limitée au présent audit.

## Lectures

Plan `SMS_CORRELATED_MOBILE_APPROVAL_IMPLEMENTATION_PLAN.md` intégral et plan typed approval mobile déjà relu. Sources : liste corrélée V1 entière, journal voix entier, interfaces et mécanismes initiaux de l'outbox et de la queue Project Brain, auth-client entier, implémentation SecureStore installée (validation clé/valeur et documentation de lecture/écriture).

Le plan conserve les bons domaines : journal de métadonnées distinct d'une file d'envoi ; carte V1 inchangée ; offre entière rechargée puis geste distinct ; latch avant toute attente ; C3 seul après issue inconnue. Rien ici ne justifie un branchement sur l'outbox générique ou une reprise automatique.

## Points concrets à transmettre à l'auteur

### 1. Encodage d'identité doit être injectif

Le plan propose UTF-8 hex de l'ownerId. Une chaîne JavaScript peut contenir un surrogate isolé : TextEncoder le remplace par U+FFFD. Deux chaînes distinctes telles que U+D800 et U+D801 peuvent alors donner la même clé. Un simple `string.min(1).max(191)` ne suffit pas.

Réduction bornée : refuser Unicode malformé avant encodage, sans normalisation, trim ou troncature supplémentaire. Préserver NFD/NFC comme deux identités exactes différentes. Garder la vérification de l'ownerId complet dans le blob : elle évite l'adoption d'un blob étranger, mais ne remplace pas l'unicité de la clé. Ce point concerne la future implémentation, pas une fuite actuelle observée.

Tests : surrogate isolé haut/bas refusé avant tout store ; paires valides/emoji ; U+FFFD valide distinct ; NFD/NFC distincts ; owner maxlongueur ; clé uniquement caractères SecureStore permis et aucun raccourcissement.

### 2. 24 KiB n'est pas une capacité native prouvée

Le SecureStore installé valide ici le type string et les caractères de clé, pas un plafond de bytes ni une garantie multi-écriture. Le journal voix existant borne chaque valeur à 2000 bytes. La queue Project Brain emploie chunks/pointeurs/journal ; réutiliser son interface ne transfère pas automatiquement ses garanties.

Le cap logique de 20 entrées et le cap bytes sont deux limites distinctes. Ne pas annoncer « 20 tentatives toujours stockables » avec des IDs longs Unicode. Pour une première version simple, un plafond conservateur de valeur peut refuser avant 20 entrées ; l'UI doit l'expliquer. Si 24 KiB reste choisi, read-back réussi et limites de plateforme doivent rester explicitement non certifiées sur appareil, avec toute erreur de stockage fermant le POST. Ne pas inventer une preuve Samsung à partir d'un Map en test.

Tests : mesure UTF-8, pas string.length ; dépassement refuse avant set et POST ; write rejette ; write réussit mais read-back renvoie ancien blob/null/autreowner/JSONpartiel ; aucune éviction ; toutes les anciennes entrées et la nouvelle comparées, pas seulement présence de la nouvelle review.

### 3. Retour de stockage tardif : portée et capacité globales

Une promise chain module unique est cohérente avec le runtime JS premier plan accepté, pas un CAS entre processus. Le latch synchrone doit vivre au-dessus des remontages, clé owner/workspace/review et non fingerprint/session seulement. Changer le fingerprint ne doit pas ouvrir un deuxième POST.

Après chaque await de store, vérifier encore la portée active/session/génération/foreground et la fraîcheur de l'offre initiale. Un marker persisté puis scope expiré est conservé ; le nouveau compte ne reçoit ni texte ni reviewId dans l'UI. Un rejet de read/hydration n'est pas assimilé à une liste vide.

Tests : deux taps même tick, deux cartes concurrentes au dernier slot disponible, changement A→B pendant get/set/read-back, logout/login pendant chaîne, remount avant sa fin, callback synchrone de listener qui pause ou remplace la sélection. Réponse tardive et refresh ne réarment jamais. Server SQL reste la défense entre processus/appareils.

### 4. Absence locale et découverte ne prouvent pas absence de tentative

La documentation installée de SecureStore indique que getItemAsync peut rendre null pour absence ou invalidation. Le marqueur local n'est donc pas un registre de vérité irrévocable. Le plan prévoit correctement C3 avant toute nouvelle offre après relance, et SQL reste one-use. Après perte du blob, une ancienne review disparue des cinq cartes peut toutefois ne plus être découvrable localement : ne pas promettre un historique complet ou une conservation après suppression des données d'app.

Les UNKNOWN persistants ne peuvent pas être purgés arbitrairement pour libérer le cap. Le plan prévoit une décision séparée pour dismissal ; conserver cette limite plutôt qu'inventer « aucun effet » ou un bouton Réessayer. Une capacité saturée doit bloquer seulement une nouvelle tentative, jamais la lecture des résultats existants.

### 5. Domaine serveur et copie affichée

Le runtime API vient d'authRuntime/baseUrl configuré. Si plusieurs origines peuvent partager une installation ou si une mise à jour change l'origine, des IDs identiques ne prouvent pas le même propriétaire serveur. Décision bornée à documenter : namespace incluant l'origine canonique approuvée, ou invariant explicite une seule origine avec invalidation/isolement lors du changement. Ne pas mélanger des marqueurs d'une autre origine ou envoyer leurs IDs à un nouveau backend par hydratation automatique.

Enfin, le bouton doit agir sur l'offre entière réellement rendue. Un callback qui capture une ancienne review alors que le fingerprint provient d'un reload est refusé. Les IDs proviennent seulement du serveur sélectionné, jamais de saisie libre ; métadonnées persistées ne reconstituent ni texte ni commande d'envoi.

## Complément lecture native C2c

Dans `temporal-registry.postgres.test.ts`, lateResponse est désormais retenue et attendue après le retour inconnu avant l'oracle DB expiry : l'erreur du helper ne peut plus être confondue avec une expiration observée. Le nouveau cas terminal ACK perdu attend le vrai commit, vérifie la ligne completed puis injecte l'erreur, exige une sentinelle et relit C3/replay avec un unique transport. Aucun nouveau défaut concret trouvé dans ces deux corrections ; aucun test natif lancé par cette lane.

Les comparaisons d'historique couvrent opérations/question/replies/expectations/budget/reviews/approvals, pas les grants/credentials modifiés explicitement par setup/révocation. Les wrappers concurrents démarrés par Promise.all ne prouvent pas à eux seuls une attente de lock déterministe ; le cas C2b à deux PIDs/barrière apporte une preuve différente de chevauchement. Les tests restent des choix synthétiques, des tokens synthétiques et du HTTP injecté, pas un geste humain ou Google réel.
