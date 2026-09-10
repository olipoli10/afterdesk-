# Project Brain voice disclosure — revue ciblée des délais

2026-09-10. Propriété reviewer : `test/project-brain-voice-review-route-deadline-review.test.ts` et cet audit. Aucun source produit, SQL, fixture native ou fournisseur modifié/exécuté par le reviewer.

Plan `ASR_PROJECT_BRAIN_TRANSCRIPT_REVIEW_PLAN.md`, notamment l'addendum 20:37Z, route auteur et ses 27 tests de délai lus. Skills code-review et Next.js, références route/runtime/async et guides de routes réellement installés lus avant les contre-tests.

## RED route observé

**16:42:26 : 7 PASS /1 FAIL.** Le vrai handler GET reçoit un résultat synthétique du lecteur simulé, encore valide à un milliseconde de son `expiresAt`. Sa sérialisation JSON avance les horloges wall/monotone de deux millisecondes. Le handler publie 200 et le texte, parce que son budget global de dix secondes n'est pas écoulé ; attendu 503 opaque sans contenu. Un sentinel exige que la sérialisation ait réellement été atteinte, avec un seul appel du lecteur.

Cette reproduction utilise des horloges DB/application supposées alignées dans le mock. Elle établit le contrôle absent à la frontière de publication du handler, pas une fuite externe observée ni une preuve native. Le vrai lecteur renvoie actuellement des données simples gelées ; `toJSON` est ici un crochet synthétique de latence synchrone et ne constitue pas une entrée publique utilisateur. Une interruption CPU/GC peut aussi faire consommer du temps à cette étape.

Le correctif ne doit pas traiter `Date.now()` comme une horloge DB. Proposition auteur transmise au contrôleur : conserver une borne monotone privée issue de la dernière horloge DB avec le résultat, puis l'asserter à la publication avant/après JSON, sans modifier DTO/fingerprint ni créer un token d'autorité client. Aucun correctif n'est autorisé par ce seul audit.

## Sept positifs

- Corps synthétique exact et intact dans le positif.
- Contexte gelé : ni deadline wall ni monotone ne peut être remplacée par le lecteur pour prolonger le budget.
- Remplacer le signal du faux Request puis annuler ce remplacement ne change pas le signal original capturé.
- Recul wall ou monotone pendant JSON refusé même au-dessus de l'instant d'entrée.
- Horloge wall non finie après lecture refuse, sans retry.
- Une lecture pendante n'est pas déclarée arrêtée artificiellement ; après son règlement, l'annulation originale supprime le contenu.

À ce checkpoint RED, le lecteur attendait encore son gel auteur et le RED natif contrôleur. Aucun verdict global GREEN ni validation de transcription, d'appareil, d'utilisateur réel ou de qualité de modèle n'était attribué.

## Correction coordonnée et relecture finale

Le contrôleur a approuvé la WeakMap privée après le RED. Le lecteur conserve l'identité exacte du résultat connu comme commité et une closure qui vérifie le signal original, le budget non renouvelé wall/monotone et la borne monotone dérivée de la dernière horloge DB. La borne démarre avant la requête de dernière horloge : sa latence et celle du commit sont comptées conservativement. La route appelle la garde avant et après JSON, en conservant sa propre borne d'entrée de dix secondes. Aucun champ, hash, label, verrou de lignée ou grammaire publique n'est changé par ce delta relu.

Le test route a maintenant une garde simulée explicite par WeakMap d'identité avec une durée mono privée, sans comparaison directe entre expiresAt et Date.now. Le RED initial reste conservé ci-dessus. **106/106 route PASS à 16:44:45**, dont les huit contre-tests reviewer.

Nouveau fichier reviewer `test/project-brain-transcript-review-deadline-review.test.ts` : **6/6 PASS à 16:46:28** avec le vrai GET, le vrai lecteur, l'assemblage/fingerprints réels et la vraie garde WeakMap ; seuls auth, SQL et inspecteur de session sont simulés. Il couvre les décalages DB/application de −24h et +24h, refus exactement à 1000ms de TTL et succès à 999ms après JSON, puis annulation du signal original et OFF pendant sérialisation. Un sentinel prouve le passage après sérialisation d'une réponse 200 candidate ; l'oracle vérifie qu'aucune nouvelle transaction/relecture ne remplace le résultat refusé. Les métadonnées privées de délai restent absentes du JSON.

Les 40 tests auteur lecteur incluent les copies/forgeries/disabled refusées, le signal original après retour, les appels de garde sans renouvellement de budget et le résultat provisoire d'un commit échoué jamais enregistré. Ils ont été lus et relancés, sans duplication artificielle dans les six tests de parité.

**221/221 ciblés PASS à 16:47:30**, huit fichiers comprenant **14 contre-tests reviewer**. TypeScript root exit 0, lint des deux fichiers reviewer exit 0. Un diagnostic intermédiaire propre au mock `now: () => 0` inféré comme littéral a été corrigé par une annotation `(): number` ; aucun oracle ni source produit modifié pour cela.

Verdict : **GREEN borné pour le delta lecteur/GET**, pas une preuve native SQL de cette lane, de transport externe, d'ASR, de rendu mobile ou de qualité de modèle. La campagne PostgreSQL réelle est détenue séparément par le contrôleur. Aucun nouveau besoin de permission, mutation ou activation identifié dans ce delta.

SHA256 relus : lecteur `665336638041b4f5a899da599005361fc819822f0ff2c7569b9eb58334ae01a3` ; route `a91b30a452f3f626658ef8b9da8f292ecd7026d2adca2c29fa0da628599979d9`.
