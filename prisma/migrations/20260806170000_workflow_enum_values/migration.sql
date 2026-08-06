-- PHASE 1B (1/3) — VALEURS D'ÉNUMÉRATION SEULES.
--
-- Postgres refuse d'utiliser une valeur d'énumération dans la transaction qui
-- l'ajoute. Ces deux ajouts vivent donc dans leur propre migration, appliquée
-- avant celle qui crée les tables et les colonnes qui s'en servent.
--
-- `ai_processing` : payé, le bloc machine du plan accepté tourne. La tâche
-- n'est PAS réclamable ici — `open` continue de vouloir dire « un humain peut
-- prendre ça ». Une tâche sans plan exécutable saute cet état.
--
-- `artifact` : un fichier produit par le moteur, jamais téléversé. La route
-- HTTP d'upload ne peut pas en créer (elle exige un rôle CLIENT ou VA).

-- `IF NOT EXISTS` comme dans toutes les migrations d'énumération de ce dépôt
-- (20260730000500, 20260730002000, 20260731020000) : sans lui, un déploiement
-- rejoué ou un `migrate resolve` échoue net sur une valeur déjà ajoutée.

ALTER TYPE "TaskStatus" ADD VALUE IF NOT EXISTS 'ai_processing';

ALTER TYPE "FileKind" ADD VALUE IF NOT EXISTS 'artifact';
