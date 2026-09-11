# OpenRouter — candidat texte personnel, recherche documentaire

**Verdict : candidat technique identifié; activation personnelle NO-GO sur ces seules preuves.** Recherche publique fraîche le 11 septembre 2026, entre 01:55 et 02:01 UTC. Aucun appel d’inférence, clé, donnée client, achat, configuration distante ou écriture produit. Les GET effectués visent seulement les métadonnées publiques. Aucun champ de certification privée n’a été fabriqué.

## Candidat borné aux 30 prochains jours

**`google/gemini-2.5-flash-lite`**, endpoint exact **`google-vertex/eu`**. Il est économique et actuellement publié, mais convient ici à un essai borné, pas à un choix durable : Google annonce sa retraite le **20 octobre 2026**. La fenêtre de 30 jours envisagée se termine avant cette date; toute extension impose une nouvelle qualification. Source primaire, mise à jour le 9 septembre : [cycle de vie Google](https://docs.cloud.google.com/gemini-enterprise-agent-platform/models/model-versions).

Observations publiques :

| Pin / capacité | Valeur observée |
| --- | --- |
| Model ID | `google/gemini-2.5-flash-lite` |
| Provider name / tag | `Google` / `google-vertex/eu` |
| Paramètres annoncés | `structured_outputs`, `response_format`, `max_tokens`, `temperature`, notamment |
| Contexte / sortie max | 1048576 / 65535 tokens |
| État metadata | `status:0` |
| Cache implicite metadata | `supports_implicit_caching:false` — pas une inspection de configuration Google |
| Liste ZDR | Même couple model_id + tag présent |

Sources : [endpoints du modèle](https://openrouter.ai/api/v1/models/google/gemini-2.5-flash-lite/endpoints) et [endpoints ZDR](https://openrouter.ai/api/v1/endpoints/zdr), GET sans authentification. Dernière relecture endpoints à **01:58:52.355Z**, SHA-256 du texte de réponse décodé UTF-8 **627e0289753b3ed5e397a64b0b23a570e4ed4122ba73d9c9bf7d3e99e733ba85**; ce hash identifie l’observation, pas une attestation signée. Les compteurs d’uptime rendent ce document dynamique.

Le slug suffixé est important : `google-vertex` seul couvre plusieurs régions. Le pin compatible à préparer est `only:["google-vertex/eu"]`, avec `allow_fallbacks:false`, `require_parameters:true`, `data_collection:"deny"`, `zdr:true`. Aucun de ces paramètres n’a été activé ici. [Routage OpenRouter](https://openrouter.ai/docs/guides/routing/provider-selection).

La présence de structured_outputs ne prouve ni acceptation du schéma exact de l’application ni exactitude sémantique. OpenRouter précise que l’application du mode strict varie; Google ne supporte qu’un sous-ensemble JSON Schema. Les validateurs locaux doivent rester fermés. Aucune conformité runtime du payload actuel, notamment ses alias de paramètres, n’est revendiquée sans test autorisé. [OpenRouter structured outputs](https://openrouter.ai/docs/guides/features/structured-outputs), [Google structured outputs](https://ai.google.dev/gemini-api/docs/structured-output), mise à jour Google 2 septembre 2026.

## Prix et enveloppe 20 CAD / 30 jours

Prix **USD**, pour l’endpoint exact et non le tarif le moins cher d’une autre route :

| Poste metadata | Prix |
| --- | ---: |
| Entrée texte | 0,10 USD / million tokens |
| Sortie texte | 0,40 USD / million tokens |
| Raisonnement interne si utilisé | 0,40 USD / million tokens |
| Lecture cache si utilisée | 0,01 USD / million tokens |
| Écriture cache, valeur metadata par token | 0,0000000833333333333333 USD; unité/durée de stockage non qualifiée ici |
| Web search, valeur metadata | 0,014 USD; hors périmètre, ne pas activer |

Source : [endpoint exact](https://openrouter.ai/api/v1/models/google/gemini-2.5-flash-lite/endpoints). Aucun supplément fixe par requête texte n’est annoncé dans cette ligne; absence d’un champ n’est pas une garantie contractuelle universelle. Exemple arithmétique sans cache, recherche ni raisonnement supplémentaire : 2000 tokens entrée + 500 sortie = **0,0004 USD**; 10000 appels semblables = 4 USD d’inférence, pas un engagement de volume ou de qualité.

La [tarification actuelle OpenRouter](https://openrouter.ai/pricing) affiche **5,5 %** de frais plateforme pour le prépayé. L’ancienne vue indexée de la [FAQ officielle](https://openrouter.ai/docs/faq) mentionne un minimum de 0,80 USD et 5 % en crypto; la page dynamique fraîche ne rend pas ces chiffres dans le texte extrait : minimum et modalité de paiement **à reconfirmer au paiement**, pas prétendus vérifiés sur le compte. La page fraîche remplace aussi l’ancien seuil BYOK « un million de requêtes » par une allocation en coût catalogue; BYOK n’est pas proposé ici.

Conserver **20 CAD comme plafond tout compris**, à l’intérieur des 100 CAD totaux, sans convertir fictivement en 20 USD. Réserver marge pour change, frais de carte/plateforme et taxes éventuelles; aucun taux CAD/USD, traitement fiscal ou état du solde n’a été vérifié. Aucun achat automatique ni abonnement Business n’est autorisé par cette recherche.

## Confidentialité : faits et inconnus distincts

- **Fait OpenRouter :** le couple précis apparaît dans sa liste ZDR. Sa documentation décrit un filtrage ZDR et l’absence de conservation des prompts par OpenRouter sauf opt-in au logging. Elle exclut cependant le cache en mémoire de sa définition de rétention. [Politique ZDR OpenRouter](https://openrouter.ai/docs/guides/features/zdr).
- **Fait Google :** pas d’entraînement/fine-tuning sans permission ou instruction. Des exceptions de journalisation d’abus existent; certains clients doivent obtenir une exemption. Le cache mémoire Gemini est activé par défaut, avec TTL de 24 h, désactivable par projet. La journalisation request/response est optionnelle. Cela ne prouve pas les réglages ni l’accord particulier de l’endpoint OpenRouter. [Politique primaire Google](https://docs.cloud.google.com/gemini-enterprise-agent-platform/resources/zero-data-retention), mise à jour **9 septembre 2026**.
- **Écart à résoudre :** metadata `supports_implicit_caching:false` et classification ZDR sont des déclarations OpenRouter; elles ne prouvent pas zéro stockage de contenu sous chaque exception Google. Si notre politique exclut aussi le cache mémoire, obtenir une preuve spécifique au service/projet utilisé. Ne pas conclure que « aucun entraînement » signifie « aucune conservation ».
- **Résidence non certifiée :** le suffixe `/eu` ne prouve pas que le proxy OpenRouter déchiffre en Europe. L’annonce officielle du **9 septembre 2026** réserve le routage régional de bout en bout aux offres Business/Enterprise et aux domaines régionaux. Le transport actuel relu utilise `https://openrouter.ai/api/v1/chat/completions`, pas `eu.openrouter.ai`. Ni résidence canadienne ni résidence européenne complète n’est donc établie. [Routage régional officiel](https://openrouter.ai/blog/announcements/us-in-region-routing/).
- **Inconnus :** réglages du compte OpenRouter (logging/guardrails), exemption d’abus applicable, absence effective de cache, régions de tous les traitements et métadonnées, engagements contractuels spécifiques, identité juridique/tenancy et durée/expiration des preuves exigées par notre certification. Aucun de ces champs ne peut être rempli « verified » à partir des seuls noms de fournisseurs.

## Autres vérifications utiles, sans seconde qualification complète

Le catalogue public [models](https://openrouter.ai/api/v1/models), GET **01:58:52.186Z**, contient 437 modèles et liste effectivement `openai/gpt-6-astra`, `openai/gpt-6-astra:batch`, `openai/gpt-6-astra-pro`, `openai/gpt-6-astra-pro:batch`. Ce fait de présence est observé, pas déduit du nom de notre agent. Aucun endpoint, prix ou dossier confidentialité Astra n’est qualifié ici.

`google/gemini-3.1-flash-lite` existe aussi; [metadata](https://openrouter.ai/api/v1/models/google/gemini-3.1-flash-lite/endpoints) à 01:57:43Z : Vertex EU 0,275/1,65 USD par million entrée/sortie, présent en ZDR mais cache implicite annoncé **true**. C’est une piste de remplacement après qualification, pas une alternative activable silencieusement. Sa durée de disponibilité officielle est au moins jusqu’au 7 mai 2027.

## Décision / suite minimale

Le prix n’est pas le blocage principal. Garder le candidat exact pour le dossier opérateur, mais **ne pas créer une certification 14 champs à partir de cette recherche**. Il faut rapprocher les exigences réelles de confidentialité avec une preuve spécifique au couple endpoint/contrat, arbitrer la définition du cache et les régions permises, vérifier le coût tout compris, puis seulement préparer un essai explicitement autorisé sans données personnelles avant toute activation. Pas de fallback automatique vers AI Studio, Astra ou un autre modèle. Zéro nouvelle couverture Verified-E2E; `executionAuthorized:false`.
