-- StandingCapacityPayment n'avait qu'un index de recherche sur
-- (accountId, periodStart), aucune contrainte d'unicité — contrairement à son
-- miroir StandingCapacityPayout, qui porte @@unique([accountId, vaId, periodStart]).
--
-- Enregistrer deux fois la même semaine insérait donc une deuxième écriture
-- `sale` dans le grand livre, qui est en ajout seul : le revenu doublait sans
-- aucun moyen de revenir en arrière. Tant que l'action figeait
-- currentPeriodStart, il fallait deux clics rapprochés pour y arriver. Le
-- sélecteur de période ajouté dans le même commit rend le cas ordinaire :
-- une liste déroulante de douze semaines où rien n'indiquait laquelle était
-- déjà réglée.
--
-- Réparation avant contrainte, même ordre que 20260802140000 : on garde la
-- PREMIÈRE écriture de chaque période (la plus ancienne createdAt, id le plus
-- petit à égalité) et on supprime les doublons ultérieurs. C'est le bon sens
-- ici : la première est celle qui a produit l'écriture de grand livre que la
-- comptabilité a déjà vue.
DELETE FROM "StandingCapacityPayment" a
USING "StandingCapacityPayment" b
WHERE a."accountId" = b."accountId"
  AND a."periodStart" = b."periodStart"
  AND (a."createdAt" > b."createdAt"
       OR (a."createdAt" = b."createdAt" AND a."id" > b."id"));

CREATE UNIQUE INDEX "StandingCapacityPayment_one_per_account_period"
  ON "StandingCapacityPayment" ("accountId", "periodStart");
