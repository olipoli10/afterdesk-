# Confirmation exacte d’un rendez-vous par SMS — fondation locale OFF

## Résultat et limite

Le propriétaire pourra confirmer un rendez-vous précis depuis ses textos ordinaires, sans recopier un identifiant technique. Le modèle peut proposer le brouillon, jamais approuver ni lancer Google. Cette fondation ne branche aucun worker, ne crée aucune migration et n’autorise aucune exécution : `executionAuthorized:false`, zéro appel réel.

Un simple « oui » est insuffisant. Un ancien SMS retardé pourrait sinon confirmer un nouveau brouillon. Un seul brouillon en attente et une expiration ne prouvent pas à quel résumé le propriétaire répond.

## Ordre de réalisation

1. Durcir l’exécuteur Google existant : contrôle courant propriétaire/connexion/grant, claim exact et transactionnel, délai/annulation, finalisation CAS du claim, résultat incertain sans relance. Chantier coordonné séparément dans `calendar-actions.ts`.
2. Contrats purs et tests synthétiques : snapshot exact, résumé déterministe, phrase de confirmation réservée et reconnaissance fermée. Un match retourne seulement `MATCHED_NOT_AUTHORIZED`.
3. Migration et stockage du challenge après revue du contrat. Ne jamais simuler la persistance ni la non-réutilisation avec une variable en mémoire.
4. Préparer résumé/challenge atomiquement avec le brouillon et le CAS final du SMS source. Envoi par la file existante, sous consentement/budget actuels.
5. Consommer le challenge et réclamer le brouillon dans une seule transaction, puis appeler l’exécuteur Google durci hors transaction. Aucun fallback vers le modèle ou l’interpréteur historique sur le vocabulaire de confirmation réservé.
6. Tests PostgreSQL concurrents et revue indépendante avant tout branchement. Activation réelle distincte, OFF par défaut.

## Phrase visible, jamais autorité du modèle

Format versionné fermé : `CONFIRME ENDVERA AGENDA <quatre mots ASCII>`.

Les quatre mots proviennent d’un alphabet public de 64 mots; trois octets issus du générateur cryptographique serveur donnent 24 bits de diversité, soit 16 777 216 phrases possibles par conversation. Ce n’est ni une authentification ni un secret : l’identité SMS vérifiée reste obligatoire. La phrase ne contient aucun UUID technique. Elle sert uniquement à lier explicitement le nouveau SMS au résumé exact. Les accents, reformulations, ponctuation ajoutée, contenu cité et messages multi-actions ne valent pas confirmation.

Quatre mots remplacent le premier prototype de huit mots, trop encombrant pour confirmer un rendez-vous quotidien. Ce choix n’affaiblit pas une authentification, puisque la phrase n’en fournit aucune. Il augmente le risque de collision de génération : unicité DB permanente et refus des collisions sont donc non négociables. Aucun modèle ne génère ou raccourcit cette phrase. L’ergonomie réelle et le taux d’erreurs restent à observer; les tests locaux ne les prouvent pas.

Le stockage doit imposer la non-réutilisation de la phrase normalisée, même après expiration, dans le namespace permanent des deux numéros visibles (propriétaire et ENDVERA). Un changement de propriétaire, workspace, identité ou version du protocole ne remet jamais ce registre à zéro. Les bindings détaillés du challenge restent séparément limités au propriétaire/workspace/identité courants. Toute collision refuse la création; nouvelle entropie uniquement lors d’une nouvelle création, jamais pour remplacer en silence un challenge déjà résumé. Borner les tentatives de génération; collision répétée ou espace épuisé signifie refus/app, jamais réutilisation. Limiter les erreurs de confirmation et les créations par identité; la limite ne constitue pas une nouvelle autorisation de débit.

## Bindings durables obligatoires

- Propriétaire actif seulement (`memberRole:owner`, jamais admin), ID et révision du membre, révision du workspace actif, identité SMS vérifiée et sa révision, numéro propriétaire, numéro ENDVERA, compte Twilio et version, grant SMS entrant et sa version indépendants. Une révocation/réactivation du grant ne doit pas réanimer l’ancienne confirmation même si le compte est inchangé. Les révisions membre/workspace correspondent aux epochs contrôlées par l’exécuteur Google, pas à une affirmation du modèle.
- SMS d’origine : ID, hash, provider SID, réception; enfant modèle/review/action d’origine et son lien exact, sans prendre une sortie du modèle comme preuve.
- Opération Google en attente : ID/hash, titre, début et fin absolus, fuseau nommé, compte Google/version, credential et grant d’écriture/version.
- Résumé complet exact + hash + opération SMS sortante; phrase et namespace; politique, création et expiration fixes.
- À la consommation : ID/hash/provider SID du SMS de confirmation et claim exact de sa source; lien unique vers le challenge consommé.

Recommandation : table `PersonalCalendarSmsConfirmation`, plutôt que des champs libres dans `operation.result`. FKs composites vers sources, brouillon et résumé dans le même workspace/propriétaire; unicité du brouillon, du résumé et de la source de consommation; index unique partiel sur challenge actif par conversation; immutabilité des bindings et transitions fermées.

États : `PREPARED → WAITING → CONSUMED → COMPLETED | UNCERTAIN`, ou `EXPIRED | REFUSED` avant consommation. L’acceptation fournisseur du résumé avec SID durable permet seulement `WAITING` : elle n’est pas une preuve de livraison. La phrase exacte renvoyée doit désigner ce même résumé. TTL maximal proposé : dix minutes, horloge DB. Aucun renouvellement silencieux.

## Validation et claim

Dans la même transaction sérialisable : verrouiller challenge, source de confirmation et brouillon; vérifier unicité/current owner/binding/grants/version/hash/contenu/expiration; contrôler le lease et la tentative de la source; consommer une seule fois et obtenir le claim Google exact. Une approbation simultanée depuis l’application doit faire perdre proprement l’autre claim. Aucun appel réseau avant commit. Après le claim, délai et contrôles courants restent obligatoires; un timeout ou un résultat inconnu garde l’état incertain et ne relance rien.

La fondation pure peut comparer des snapshots fournis mais ne prouve jamais leur origine DB, la livraison du résumé, l’identité réelle, l’unicité persistée ni l’autorisation d’exécution. Ces garanties appartiennent au futur stockage et à l’exécuteur.

## Cas de refus et preuves attendues

- Aucun, plusieurs, modifié, expiré ou déjà consommé : aucune exécution.
- `OUI`, négation, texte libre, ancienne phrase ou phrase d’un autre namespace : aucun fallback autoritaire.
- Rejeu du même provider SID/contenu : même reçu, jamais deuxième insertion. SID identique/contenu différent : conflit.
- Révocation puis réactivation, changement de propriétaire/identité/compte/grant/fuseau/hash : nouvelle demande nécessaire.
- Approbations app/SMS concurrentes, deux workers, deux confirmations : un seul claim.
- Confirmation avant le résumé durable accepté, crash après claim, timeout après réponse fournisseur, perte du lease : aucune fausse confirmation ni relance.
- Tests purs de grammaire/résumé/hash/mutation; tests DB de FK/unique/rollback/concurrence; tests transport injecté de contrôle courant et d’incertitude. Tests réels distincts : jamais déduits des tests locaux.

## Ne pas construire dans cette vague

Pas de confirmation multi-action, employés, appels, suppression/modification de rendez-vous, lecture des textos privés du téléphone, reprise conversationnelle supposée, accès SMS accordé par le modèle, rotation de secret, migration/worker/envoi réel sans le prochain périmètre approuvé.
