-- PHASE 1E-alpha — FICHIERS ET DONNEES.
--
-- Strictement additive. Aucune colonne supprimee, aucune contrainte durcie sur
-- des lignes existantes, aucune valeur inventee : tout ce qui est ajoute est
-- nullable ou porte un defaut vide. Un plan ou un contrat anterieur a cette
-- migration reste exactement ce qu'il etait, et se lit comme "aucun fichier,
-- aucune classe" — ce qui est la verite pour eux, puisque aucune primitive ne
-- pouvait lire un fichier avant cette phase.

-- 1. La classe d'execution, calculee localement avant le devis et gelee avec
--    le reste de l'economie du plan. Les signaux disent POURQUOI, en clair,
--    sans jamais porter de valeur client.
ALTER TABLE "TaskExecutionPlanVersion"
  ADD COLUMN "dataClass" TEXT,
  ADD COLUMN "dataClassSignals" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];

-- 2. La configuration gelee d'une etape. Une capacite comme data.filter n'a
--    aucun sens sans predicat, et un predicat approuve par le client fait
--    partie du contrat au meme titre que son prix.
ALTER TABLE "TaskExecutionPlanStep"
  ADD COLUMN "params" JSONB;

-- 3. La classe, recopiee verbatim sur le contrat accepte.
ALTER TABLE "TaskAcceptanceSnapshot"
  ADD COLUMN "dataClass" TEXT;

-- 4. Les octets que le client a acceptes.
--
--    onDelete RESTRICT sur le fichier, comme la version de plan referencee par
--    un snapshot : un fichier qu'un contrat accepte epingle ne se supprime
--    pas. onDelete CASCADE sur le snapshot, parce qu'un gel sans son contrat
--    n'a aucun sens.
CREATE TABLE "TaskAcceptanceSnapshotFile" (
  "id"         TEXT NOT NULL,
  "snapshotId" TEXT NOT NULL,
  "fileId"     TEXT NOT NULL,
  "sha256"     TEXT NOT NULL,
  "fileName"   TEXT NOT NULL,
  "sizeBytes"  INTEGER NOT NULL,
  "createdAt"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "TaskAcceptanceSnapshotFile_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "TaskAcceptanceSnapshotFile_snapshotId_fileId_key"
  ON "TaskAcceptanceSnapshotFile"("snapshotId", "fileId");

CREATE INDEX "TaskAcceptanceSnapshotFile_fileId_idx"
  ON "TaskAcceptanceSnapshotFile"("fileId");

ALTER TABLE "TaskAcceptanceSnapshotFile"
  ADD CONSTRAINT "TaskAcceptanceSnapshotFile_snapshotId_fkey"
  FOREIGN KEY ("snapshotId") REFERENCES "TaskAcceptanceSnapshot"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "TaskAcceptanceSnapshotFile"
  ADD CONSTRAINT "TaskAcceptanceSnapshotFile_fileId_fkey"
  FOREIGN KEY ("fileId") REFERENCES "File"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

-- 5. LE GEL S'ETEND AUX NOUVELLES COLONNES, SANS TOUCHER AU TRIGGER EXISTANT.
--
--    La fonction posee en 20260809100000 rend les etapes et la version d'un
--    plan accepte reellement append-only. Elle refuse tout UPDATE de la
--    version referencee par un snapshot, donc `dataClass` et
--    `dataClassSignals` sont deja couverts ; `params` l'est de la meme facon
--    par la regle sur les etapes. Rien a ajouter ici, et c'est note plutot que
--    suppose : une colonne economique ou de securite ajoutee a un plan sans
--    verifier qu'elle tombe sous ce trigger serait une regression silencieuse.
--
--    Ce qui manque en revanche est le gel des FICHIERS eux-memes : la table
--    ci-dessus doit etre append-only pour un contrat accepte, sinon
--    substituer un sha256 apres coup redevient possible.
CREATE OR REPLACE FUNCTION "afterdesk_snapshot_files_are_frozen"()
RETURNS TRIGGER AS $$
BEGIN
  -- Un gel appartient toujours a un contrat accepte : il n'existe pas d'etat
  -- "brouillon" pour cette table. Toute modification apres l'insertion
  -- initiale changerait ce que le client a accepte.
  IF (TG_OP = 'UPDATE' OR TG_OP = 'DELETE') THEN
    RAISE EXCEPTION
      'TaskAcceptanceSnapshotFile est append-only: le contrat accepte epingle ces octets (snapshot %)',
      COALESCE(OLD."snapshotId", 'inconnu');
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "afterdesk_snapshot_files_are_frozen_trg"
  BEFORE UPDATE OR DELETE ON "TaskAcceptanceSnapshotFile"
  FOR EACH ROW EXECUTE FUNCTION "afterdesk_snapshot_files_are_frozen"();
