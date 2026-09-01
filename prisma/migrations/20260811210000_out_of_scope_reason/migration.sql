-- LOT B (Commercial Readiness build) — la taxonomie de refus apprend a
-- nommer la sortie du firewall. Additive : une valeur d'enum, rien d'autre.
--
-- « Hors perimetre / nous ne pouvons pas prendre la responsabilite de cette
-- demande » tombait dans `other`, donc la question centrale d'une roadmap de
-- capabilities — combien de demandes refuse-t-on faute de capability — etait
-- non mesurable dans le journal des mandats fermes.
ALTER TYPE "LostReasonCategory" ADD VALUE 'out_of_scope' BEFORE 'other';
