# Inventaire honnête — pas un scellement alternatif

État de ce document : préparation avant FINAL_HEAD stable et avant la fin de G7.
Le résultat terminal, les métriques finales et la fermeture Brain ne sont pas
inventés. Aucun manifeste de scellement conforme n'est actuellement assemblable
en conservant tous les essais réels sous le contrat canonique inchangé.

## Collecteur reproductible, en lecture seule

`scripts/collect-unsealed-evidence.mjs` lit les vrais fichiers de commandes et
émet un JSON `UNSEALED_LOCAL_EVIDENCE_INVENTORY` sur stdout. Il n'écrit rien,
ne lance aucune phase et ne touche pas au Brain. Le recorder existant peut
enregistrer son stdout avec un nouvel ID de commande; ne réutiliser aucun ID.

Configuration de préparation : `closeout-inventory.config.json`. Commande :

```text
node specs/206-gpt6-astra-endvera-reverification/scripts/collect-unsealed-evidence.mjs specs/206-gpt6-astra-endvera-reverification/closeout-inventory.config.json
```

Pour une observation finale, le parent peut créer un nouveau fichier de
configuration non historique avec `expectedFinalHead` égal au commit final réel
et un nouveau `collectorCommandId`. Ne pas modifier un input déjà gelé pour
inscrire son propre HEAD. `selectedPacketAuditCommandIds` est seulement un index
des quatre paquets retenus; il ne filtre jamais les commandes initiales.

Le collecteur conserve :

- tous les `command.json` terminés découverts, leurs exits attendus/réels et
  empreintes exactes des deux streams;
- les exits non conformes, sans remplacer une erreur ancienne par un retest;
- les incidents de refus du recorder et l'absence constatée de streams/record,
  sans reconstruire une sortie disparue ni lui attribuer un exit fictif;
- les wrappers gelés séparés des wrappers `phase-checks-r0b`, dont l'exit zéro
  ne constitue pas un PASS du produit;
- les contrats originaux comparés octet pour octet aux blobs CAMPAIGN_HEAD;
- les outils/contrats R0b additifs, sans les promouvoir en inputs gelés;
- les huit tentatives G2 réelles, leurs champs obligatoires manquants et leur
  statut propre; la validation complète du schéma n'est pas réaffirmée par cet
  inventaire;
- les calculs de métriques et invariants réellement rencontrés, sans valeurs
  de remplacement;
- un hash du payload JSON et les hashes des scripts/config lus.

L'inventaire ne recopie pas le texte des streams. Les reproductions du scanner
ne portent que sur des champs déjà vérifiés comme empreintes hexadécimales de
64 caractères, jamais sur un secret ni sur un texte ressemblant à une clé.
Le record du collecteur lui-même n'existe pas encore pendant sa propre capture :
son dossier est explicitement marqué, sans circularité de hash.

## Blocages exacts du validateur canonique

Fichier : `scripts/validate-revalidation-seal.mjs` sous spec206, inchangé.

| Contrainte | Lignes | Conséquence honnête |
| --- | --- | --- |
| Détection Twilio sans frontière de token | 115–116 | Un digest SHA256 normal peut être refusé. Le collecteur rejoue ce test contre les vrais champs de hashes. |
| Exactement quatre rapports/stderr en G2 PASS ou REWORK; au plus quatre si BLOCKED | 504–517 | Les huit tentatives conservées ne peuvent pas être représentées. |
| Chaque G2 MODEL_AUDIT.stdout reçoit obligatoirement FINDING_REPORT | 569–580 | Impossible de déplacer silencieusement les premiers essais vers SUPPORTING_EVIDENCE. |
| Chaque FINDING_REPORT doit satisfaire le schéma | 526 | Les quatre premiers INCOMPLETE manquent schemaVersion, auditLane et summary; exit zéro ne les rend pas conformes. |
| Le validateur lui-même appartient au kit immuable | 256–283 | Le remplacer par r0b brise la comparaison SPEC/CAMPAIGN/FINAL; r0b n'a aucune autorité canonique. |
| Toutes les anciennes erreurs déterministes comptent | 604–609, 1362 | Une correction ne transforme pas la baseline rouge en LOCAL_REVALIDATION_COMPLETE. |
| Contrat de wrapper exigé comme CAMPAIGN_HEAD_BLOB | 650–651 | Le résultat R0b reste séparé, jamais substitué au wrapper canonique. |
| BRAIN_PACKET interdit lorsque le Brain est propre | 1282–1284 | Fournir un checkpoint/validation Brain réel. Ne pas salir le Brain pour satisfaire une branche de schéma. |

Exemple sûr réellement trouvé dans `g0-astra-probe/command.json` : le digest
`stdoutSha256` est reconnu par le regex original mais pas par le regex corrigé
avec frontières de token. La valeur et les deux booléens sont dans
`safeDigestScannerReproductions`, avec le hash du validateur original utilisé.

`scripts/assemble-local-seal.mjs:132–151` rencontre la même impossibilité : il
charge chaque stdout G2 MODEL_AUDIT puis exige quatre rapports de quatre lanes.
Un config qui conserverait les huit commandes échoue à
`ASSEMBLY_FOUR_NATIVE_AUDIT_REPORTS_REQUIRED`; en retirer quatre masquerait de
vrais essais. Aucun config tronqué ni faux candidat canonique n'est fourni.

## Première capture — photographie, pas état final

`evidence/commands/g3-unsealed-inventory-preparation/command.json` enregistre
la capture du 2026-09-09 à 14:22:45–14:22:47 UTC, HEAD
`a9c4c01fdb2fcdff3838a6966f1560832bc32553` : 107 commandes terminées,
31 exits natifs non conformes, dont 26 selon le compteur déterministe canonique,
8 audits G2, 1 incident sans streams ni command.json, 0 commande classée
PROVIDER_CALL. Aucun hash de stream ne divergeait et aucun contrat gelé ne
divergeait. Ces nombres augmenteront avec les tests/revues/G7 suivants.

Cette capture observait le Brain propre à
`3a4e31d837ed4f53f8326d865fca43cc54eb4c3e`; ce n'est pas une affirmation de
fermeture finale. Une revue était encore en cours et le record du collecteur
lui-même n'était pas finalisé.

## Dernières conditions à documenter par le parent

1. FINAL_HEAD stable; commandes et wrappers G7 canoniques terminés, avec les
   retests R0b explicitement séparés et toute erreur conservée.
2. Cinq rubriques de métriques rejouées, six valeurs finales justifiées, sans
   amélioration déduite des seuls tests verts.
3. Invariants observés et portée exacte de l'isolation locale; aucun provider
   candidat observé et aucune généralisation à un vrai service.
4. Checkpoint/validation Brain honnête après les observations finales.
5. Tentative de validation canonique et ses erreurs brutes conservées; rapport
   final explicitement REWORK/BLOCKED et non scellé si le contrat reste impossible.

Les conditions 1–4 rendent le paquet utile et traçable; elles n'effacent pas les
contradictions structurelles du scellement. Ne pas déclarer le goal entièrement
accompli sur la seule base de cet inventaire.
