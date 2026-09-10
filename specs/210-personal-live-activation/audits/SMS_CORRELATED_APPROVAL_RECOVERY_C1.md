# Recovery C1 — implémentation locale et limites de preuve

2026-09-10. Auteur `openrouter_disabled_adapter`. Baseline B libéré par le contrôleur après5348PASS; commit B bf4f2251c7670ddd6b88c250e4a7e57a25e4e96d. Aucun changement SQL79, schéma, génération ou lancement PostgreSQL par cette lane.

## Delta

`claim-recovery.ts` conserve son API OFF, son unique transaction Serializable/requête CTE→UPDATE, ses deadlines et son CAS historique. Deux LEFT JOIN globales par operationId rendent visibles review et approval même si leurs scopes seraient incohérents. Le CASE avant LIMIT réserve les fonctions calendrier à la branche calendar_write ayant ses deux relations, phase live, lease exacte et approbation antérieure au snapshot. binding/state_valid79 doivent être vrais. Toute origine marker OU review OU approval invalide est exclue sans fallback legacy et sans consommer le batch.

La requête verrouille seulement l'opération `FOR UPDATE OF p SKIP LOCKED`. Les relations sont immuables; aucun namespace/advisory ou rowlock sur grants/owner n'est ajouté. La récupération reste possible après révocation ou expiration des sources. Le trigger79 demeure l'arbitre final de l'union et du claim committé.

Le résultat corrélé est l'union fermée79 UNCERTAIN/CLAIM_LEASE_EXPIRED avec origin reconstruite à partir des scalaires approval. Aucun priorClaimResult supplémentaire incompatible avec cette union; les données historiques restent dans approval/review inchangées. Le ELSE legacy conserve son merge historique, y compris ses marqueurs existants, sans réinterprétation de ces anciennes preuves. Ni transport ni budget ni attempts n'est modifié. Le CAS existant ajoute l'égalité du marker et du booléen transport avec le candidat verrouillé.

## Tests auteur

**27/27 PASS à14:18:44** :24 cas existants et3 nouveaux. Deux assertions existantes sont uniquement qualifiées avec l'alias `p` et le verrou explicite `OF p`. Les nouveaux cas inspectent le texte SQL : origine globale avant LIMIT, CASE protégeant les serializers calendrier, exactitude phases/lease/pre_snapshot/binding/state, absence de currentauthority/namespace, enveloppe79 exacte, CAS marker/transport.

Full TypeScript et lint ciblé des deux fichiers ont ensuite terminé exit0. Aucun autre fichier source n'a été modifié pour obtenir ce résultat.

Ces tests utilisent le même mock transaction que les tests historiques. Ils prouvent la forme émise et les contrôles JS, **pas** l'exécution SQL, la non-starvation native, les plans du query planner ou les races entre backends. Aucun RED natif avant patch n'est revendiqué; l'incompatibilité de l'ancien JSON legacy avec l'union79 était constatée par lecture.

Contre-revue Android demandée avant native. Le contrôleur possède les fixtures de vraie expiration CLAIMED/DISPATCH_CLAIMED, révocation sans obstacle au bookkeeping, conservation des relations/budgets, replay, concurrence et coexistence legacy. Aucun effet externe n'est autorisé ni observé par ce changement.
