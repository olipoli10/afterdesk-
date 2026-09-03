-- R37F: retain strict canonical provider evidence for exact replay.
ALTER TABLE "ControlledProviderRun"
    ADD COLUMN "canonicalEvidenceSnapshot" JSONB,
    ADD COLUMN "canonicalEvidenceFingerprint" TEXT;

ALTER TABLE "ControlledProviderRun"
    ADD CONSTRAINT "ControlledProviderRun_canonical_evidence_pair_check"
    CHECK (
        ("canonicalEvidenceSnapshot" IS NULL AND "canonicalEvidenceFingerprint" IS NULL) OR
        ("canonicalEvidenceSnapshot" IS NOT NULL AND "canonicalEvidenceFingerprint" IS NOT NULL)
    );
