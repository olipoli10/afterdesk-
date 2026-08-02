-- Un compte Standing Capacity n'avait aucune notion de « compte interne »,
-- alors que Task en a une depuis le début. Les entrées de ledger `sale` et
-- `payout` de ce produit n'avaient donc aucune valeur correcte à passer :
-- insertLedgerEntry retombait sur ses défauts permissifs (isInternal=false,
-- publiclyVisible=true), et un compte de pratique de l'opérateur franchissait
-- les deux filtres du ledger public — définitivement, la table étant
-- append-only.
ALTER TABLE "StandingCapacityAccount"
  ADD COLUMN IF NOT EXISTS "isInternal" BOOLEAN NOT NULL DEFAULT false;
