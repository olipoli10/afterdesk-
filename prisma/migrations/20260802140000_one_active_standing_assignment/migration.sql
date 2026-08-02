-- « Au plus une assignation active par compte » était une invariante affirmée
-- par le code (commentaire de assignWorker, standing-capacity.ts:104-112) et
-- par rien d'autre. assignWorker ferme les lignes actives puis en crée une,
-- mais sur un compte qui n'en a AUCUNE le updateMany n'apparie rien, ne prend
-- donc aucun verrou de ligne, et deux appels concurrents créent deux lignes
-- actives. Deux admins, ou un double-envoi du formulaire, suffisent.
--
-- Le dépôt connaît déjà ce motif : Dispute_one_pending_per_task
-- (20260730001000_integrity_triggers) est exactement le même index unique
-- partiel, pour exactement la même forme d'invariante.

-- 1. Réparer d'abord les doublons éventuels : ne garder active que la plus
--    récente par compte. Sans ça, la création de l'index échouerait sur une
--    base déjà polluée — et échouer au déploiement serait pire que le bug.
--    activeFrom départage, comme currentAssignee l'a toujours fait.
UPDATE "StandingCapacityAssignment" a
SET "activeTo" = NOW()
WHERE a."activeTo" IS NULL
  AND EXISTS (
    SELECT 1
    FROM "StandingCapacityAssignment" b
    WHERE b."accountId" = a."accountId"
      AND b."activeTo" IS NULL
      AND (b."activeFrom" > a."activeFrom"
           OR (b."activeFrom" = a."activeFrom" AND b."id" > a."id"))
  );

-- 2. L'invariante, désormais tenue par la base et non par une convention.
CREATE UNIQUE INDEX "StandingCapacityAssignment_one_active_per_account"
  ON "StandingCapacityAssignment" ("accountId")
  WHERE "activeTo" IS NULL;
