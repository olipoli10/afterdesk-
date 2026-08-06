-- BAIL SUR LES INTENTIONS MONÉTAIRES — correction d'un défaut latent.
--
-- processMoneyIntents ne sélectionnait que les lignes `queued` ou `failed`.
-- Une ligne passée en `processing` par un runner qui plantait ensuite
-- devenait invisible à TOUTES les exécutions suivantes : bloquée pour
-- toujours, sans alerte, sans reprise, et sans qu'aucun opérateur ne soit
-- prévenu qu'une capture Stripe ou un remboursement était resté en plan.
--
-- Le bail rend la reprise possible : une ligne `processing` dont le bail est
-- expiré peut être réclamée par un autre runner. Le rejeu reste sûr côté
-- fournisseur parce que chaque appel Stripe passe `idempotencyKey`, sur
-- laquelle Stripe déduplique.
--
-- Purement additif : deux colonnes nullables et un index. Aucune ligne
-- existante n'a besoin d'être remplie — une ligne sans bail est simplement
-- une ligne qu'aucun runner ne détient.

ALTER TABLE "MoneyIntent" ADD COLUMN "leaseExpiresAt" TIMESTAMP(3);
ALTER TABLE "MoneyIntent" ADD COLUMN "lockedAt" TIMESTAMP(3);

CREATE INDEX "MoneyIntent_leaseExpiresAt_idx" ON "MoneyIntent"("leaseExpiresAt");
