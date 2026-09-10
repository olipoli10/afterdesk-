# C2c — contre-revue bornée du même exécuteur et du wrapper

2026-09-10. Lane relecteur `android_permission_readiness`. **GREEN local borné**, aucun nouveau défaut concret restant dans le code final lu. Ce travail entre lanes n'est pas une validation indépendante de qualité du modèle. Aucune approbation humaine, requête fournisseur réelle ou observation d'appareil.

## Source finale et périmètre

Sources intégralement lues, puis derniers deltas relus :

- `calendar-actions.ts` : SHA256 `4fe68c46a386e684bac1d2d988b67dfe947ff6be0bb64e89707452a22e0b89b9`.
- `correlated-calendar-approval.ts` : SHA256 `ea5f2bc79b35627236f1ac2a593a797dceecdf3af16cf5645079773a5fe638a2`.

Empreintes revérifiées après la campagne. Lecture complète des tests auteur executor/wrapper/legacy-isolation, du client Google réel et des contrats déjà relus C2a/A/79. Aucune modification de ces sources, migration, fixture native, route ou code mobile. Propriété nouvelle du reviewer : `test/correlated-calendar-approval-executor-review.test.ts` et le présent audit.

## Contrôles de code

- La forme typée est discriminée par présence de version/origin, puis parsée strictement ; forme typée invalide jamais repliée vers legacy. PREPARE replay public, liste avant LIMIT et lock legacy excluent globalement marqueur OU relation review OU relation approval. Pas de remplacement des règles admin/owner legacy par une permission corrélée générique.
- Le même exécuteur utilise les gates C2a à trois étapes : CLAIMED avant marqueur, DISPATCH_CLAIMED avant HTTP, DISPATCH_CLAIMED avant terminal. Le marqueur doit avoir un commit connu avant chargement des tokens. La copie des pins READ du chargement est comparée au gate avant HTTP **et** avant le terminal.
- L'appel client démarre sous locks, mais sa Promise est mise dans un objet et attendue seulement après la transaction. Un résultat client positif doit passer le contrat de reçu/ID déterministe et un départ transport observé avant CONFIRMED.
- Claim, nonce, scope, request/hash, lease et état précédent sont présents dans les CAS. Cleanup n'est tenté que par l'invocation ayant acquis son marqueur avec commit connu, sur le même état DISPATCH_CLAIMED. Il ne peut pas remplacer un état recovery/terminal ni fermer le marqueur d'un concurrent.
- Le plafond monotone original est copié directement dans le budget, avec borne murale et 25 secondes maximum, sans conversion resamplée qui ajouterait de la durée. Le gate fournit la différence lease DB/inspection DB ; l'exécuteur l'applique à la borne monotone en comptant conservativement la latence du gate. Les horloges app/DB ne sont pas supposées identiques.
- Un commit de claim perdu interdit exécution et retry. Un commit terminal connu reste un fait durable même si sa réponse arrive tard. Le wrapper rend seulement une réponse fermée sans handle, autorité ou permission réutilisable. La future route peut refuser une divulgation tardive sans changer ce fait DB ; C3 sert à réconcilier.
- Un replay n'exécute jamais : après sortie de la transaction, C3 impose son propriétaire courant, sans restaurer pilote/STORE/Google pour relire l'historique.

Le cleanup hérité utilise un budget distinct borné `maxWait:1000 + timeout:2000` : il peut suivre le délai d'exécution original. Il fait uniquement du bookkeeping exact, sans gate mutable, namespace, token, retry ou fournisseur. Cela ne doit pas être présenté comme une garantie que toute réponse HTTP finit dans 25 secondes ni comme une extension du droit d'exécuter.

## Contre-tests exécutés

Nouveau fichier : **8 cas**, vrai `executeClaimedPersonalCalendarWrite` et vrai `GoogleCalendarClient`, HTTP injecté. Gate canonique, tokens et DB sont des doubles synthétiques. La machine de stockage simulée conserve volontairement un terminal lorsqu'un accusé de commit est perdu ; elle ne transforme pas automatiquement toute exception en rollback.

- Trois décalages DB/app : 0, +1h, −1h. Un POST injecté, requête exacte, trois gates, état CONFIRMED typé et fait transport.
- Réponse HTTP ressemblant à confirmed mais avec un autre titre : vrai parseur client refuse, résultat UNCERTAIN, transport conservé.
- Terminal stocké puis accusé perdu : cleanup tente son CAS exact mais n'écrase pas CONFIRMED ; sortie inconnue, aucun second POST.
- Réponse HTTP suspendue puis recovery terminal : transaction de dispatch déjà sortie, succès tardif ne remplace pas le terminal recovery.
- Mutation de l'objet READ du chargement après sa copie : pins capturés conservés.
- Marqueur stocké puis accusé perdu : aucun token/HTTP/cleanup propriétaire ; marqueur conservé pour récupération ultérieure.

À **15:56:01 : 8/8 PASS**. À **15:56:45 : 74/74 PASS** = 8 reviewer executor +33 auteur executor +21 auteur wrapper +4 auteur legacy-isolation +8 reviewer C2b. ESLint du nouveau fichier et TypeScript global : exit0.

Premier run **15:55:35 : 8 échecs reviewer /54 auteur PASS**. Cause exclusivement dans le mock du reviewer : comparaison JSON.stringify sensible à l'ordre des clés, contrairement à l'égalité JSONB exigée. Correction du mock vers canonicalJson des deux objets, sans retirer de champ ni changer l'assertion de provenance ; 8/8 ensuite. Aucun RED produit revendiqué pour cette erreur de fixture.

## RED auteur et corrections lus, attribution distincte

- Auteur rapporte RED sync transport à15:50:39 : client injecté **non-async** incrémentait le compteur puis lançait synchroniquement une exception avant affectation du fait transport. Correctif try/finally relu. Le vrai GoogleCalendarClient async transforme ce throw en Promise rejetée : ce RED prouve une robustesse face à la dépendance injectée, pas que ce chemin synchronique se produisait avec le vrai client.
- Auteur rapporte RED READ version changé après HTTP à15:54:19. Correction finale `requireLoadedRead` appelée aussi avant terminal relue et tests auteur exécutés dans le lot74.
- Contrôleur a demandé le plafond monotone exact et l'oracle wrapper court. Dernier budget directement borné et test vérifiant la sortie OUTCOME_UNKNOWN après commit (pas un refus prématuré de fixture) relus.

## Limites restantes

Les tests injectés ne prouvent pas SQL79, locks concurrents, rollback PostgreSQL, session HTTP réelle ou geste humain. Le contrôleur possède l'exécution native170 et les oracles réels, dont futur accusé terminal perdu après commit. Aucun résultat de cette campagne native en cours n'est attribué au présent audit. Pas de GO fournisseur, activation, changement de budget ou consentement.
