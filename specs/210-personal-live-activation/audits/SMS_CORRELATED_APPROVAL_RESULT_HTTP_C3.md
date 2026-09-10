# C3 HTTP — GET historique protégé

2026-09-10. Auteur `openrouter_disabled_adapter`. Implémentation locale autorisée après lecture du plan par le contrôleur; source C3, SQL, schéma, routes existantes et mobile inchangés.

## Instructions et conventions relues

AGENTS du worktree lu. Compétence Next.js lue intégralement ainsi que références route-handlers, async-patterns et runtime-selection; guide installé `node_modules/next/dist/docs/01-app/01-getting-started/15-route-handlers.md` lu intégralement. Cette lecture fixe le choix `route.ts`, runtime Node, absence de page concurrente et aucun cache opt-in. Inspection de la route collection existante, de ses tests auteur/reviewer, et des corps réels `getSessionUser`/`consumeRateLimit`.

La nouvelle route est `src/app/api/endvera/v1/personal/model/correlated-calendar-reviews/approval-result/route.ts`. Seuls exports GET/runtime=nodejs/dynamic=force-dynamic. Pas de POST, requête provider, caller mobile ou nouvelle permission. Aucun install/build/generate/serveur exécuté par cette lane.

## Contrat

REVIEW exacttrue uniquement, sinon404 avant auth. Session issue de getSessionUser, CLIENT et emailVerified true, id borné/trim exact; aucun header d'identité ne remplace la session. URL et signal capturés avant awaitauth; userId capturé avant awaitlimiter. Query workspaceId+reviewId exactement une fois chacune,1..191 caractères/trim exact; doublons encodés et autres paramètres refusés400.

Limiteur existant `personal-correlated-calendar-approval-result:<userId>`30/min, retour true strict. Ce limiteur écrit sa ligne d'infrastructure RateLimit; l'expression read-only signifie absence de mutation des objets métier, pas absence de toute écriture DB au niveau HTTP.

Une seule deadline5s à l'entrée, contrôlée par Date.now et écoulement monotone performance.now; pas de budget renouvelé après auth/rate. Signal original transmis au lecteur C3. Checks après chaque await et après validation du DTO avant sortie. L'appel auth n'est pas annulable de force : ceci garantit refus de divulgation tardive, pas terminaison HTTP absolue5s.

Le vrai schéma C3 valide une copie stricte et gelée du DTO; workspaceId ET reviewId doivent égaler la requête. Un résultat DISABLED/malformé/étranger n'est pas transformé en succès ou NOT_ATTEMPTED. L'offre active, l'exécution, le pilote et STORE ne sont pas requis pour l'histoire. Le reader C3 conserve le contrôle OWNER courant; la route n'en fournit pas une seconde version.

Chaque réponse produite par GET conserve `Cache-Control: private, no-store` et `Vary: Cookie, Authorization`. OFF/rôle→404; sans session→401; query→400; limite→429; échec interne→503 opaque. Aucune erreur SQL, stack, source ou credential n'est loggée/renvoyée. Aucun CORS implicite ajouté. CONFIRMED reste historique/non-vérifié actuellement, et aucun nonce/action/replay handle n'est transmis.

## Preuve et limite

Nouveau `test/correlated-calendar-approval-result-route.test.ts` : **72/72 PASS15:10:40**, via safeEnvironment. Auth/limiteur/lecteur sont mockés; le vrai schéma C3 est conservé. Quatre outcomes positifs, OFF avant DB/auth, sessions invalides, doublons query, bornes, rate strict, erreurs opaques, gates retirées pendant awaits, deadlines et aborts, horloge murale rétrograde, snapshot URL/signal/acteur, DTO global/nested extras et pinsscope/review sont exercés.

Ces mocks ne prouvent ni session HTTP réelle, ni owner DB, ni HEAD/OPTIONS/405 auto-générés par Next, ni caches d'un serveur déployé. Le contrôleur possède build/HTTP réel; aucun résultat de ces étapes n'est revendiqué ici. Contre-revue indépendante demandée, pas encore obtenue lors de ce premier compte rendu.

TypeScript complet et lint ciblé route/test terminés exit0 après ce run. Gel : route SHA256 `8ae249fd84e3754418aa7213cc565aa488ca1df87399d4f724da5ea51670e12a`; test SHA256 `cfa5f5c8f726c489ebfb1e4b991a70525211c7e6bab9e5ff83eaa1fe448d36ac`. Aucun autre fichier source modifié.
