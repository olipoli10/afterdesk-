import "server-only";

import { createHash } from "node:crypto";
import { z } from "zod";
import { sha256Canonical } from "@/lib/construction-assistant-v1/canonical";
import { projectBrainVoiceSourceSubjectSchema } from "./project-brain-subject";
import { VOICE_LIMITS, VOICE_MEDIA_FORMATS } from "./types";

const fingerprint = z.string().regex(/^[a-f0-9]{64}$/);
const boundedLabel = z.string().min(1).max(160);
const transformerSchema = z.object({
  id: boundedLabel, version: boundedLabel, encodingProfile: boundedLabel,
  // No production decoder has been adopted. Synthetic injection is not container validation.
  mode: z.literal("SYNTHETIC_LOCAL"),
}).strict();
const segmentSchema = z.object({
  ordinal: z.number().int().min(0).max(VOICE_LIMITS.maxSegments - 1),
  startMs: z.number().int().min(0).max(VOICE_LIMITS.maxSessionDurationMs),
  endMs: z.number().int().positive().max(VOICE_LIMITS.maxSessionDurationMs),
  durationMs: z.number().int().positive().max(VOICE_LIMITS.maxSegmentDurationMs),
  mediaFormat: z.enum(VOICE_MEDIA_FORMATS),
  mimeType: z.string().min(1).max(80),
  contentHash: fingerprint,
  bytes: z.instanceof(Uint8Array).refine(value => value.byteLength > 0 && value.byteLength <= VOICE_LIMITS.maxSegmentBytes),
}).strict();
const formats: Record<(typeof VOICE_MEDIA_FORMATS)[number], readonly string[]> = {
  m4a: ["audio/mp4", "audio/m4a", "audio/x-m4a"], aac: ["audio/aac"],
  wav: ["audio/wav", "audio/x-wav"], mp3: ["audio/mpeg"], ogg: ["audio/ogg"],
  webm: ["audio/webm"], flac: ["audio/flac", "audio/x-flac"],
};

/** Pure inspection only: injected segment metadata/bytes never establish media or actor authority. */
export function inspectProjectBrainSourceSegments(input: unknown, options: { enabled?: boolean } = {}) {
  if (options.enabled !== true) return Object.freeze({ status: "DISABLED" as const, executionAuthorized: false as const });
  // Bound collection traversal before Zod visits every injected element.
  const candidates = input && typeof input === "object" ? (input as { segments?: unknown }).segments : null;
  if (!Array.isArray(candidates) || candidates.length < 1 || candidates.length > VOICE_LIMITS.maxSegments) {
    throw new Error("PROJECT_BRAIN_VOICE_SEGMENT_COUNT_REFUSED");
  }
  const parsed = z.object({
    subject: projectBrainVoiceSourceSubjectSchema, subjectFingerprint: fingerprint,
    sourceBytes: z.instanceof(Uint8Array), transformer: transformerSchema,
    segments: z.array(segmentSchema).min(1).max(VOICE_LIMITS.maxSegments),
  }).strict().parse(input);
  const subject = Object.freeze(parsed.subject);
  if (sha256Canonical(subject) !== parsed.subjectFingerprint
    || parsed.sourceBytes.byteLength !== subject.sourceSizeBytes
    || createHash("sha256").update(parsed.sourceBytes).digest("hex") !== subject.sourceContentHash) {
    throw new Error("PROJECT_BRAIN_VOICE_SEGMENT_SOURCE_CHANGED");
  }
  let nextStart = 0, totalBytes = 0;
  const segments = parsed.segments.map((segment, ordinal) => {
    if (segment.ordinal !== ordinal || segment.startMs !== nextStart || segment.endMs - segment.startMs !== segment.durationMs
      || !formats[segment.mediaFormat].includes(segment.mimeType)
      || createHash("sha256").update(segment.bytes).digest("hex") !== segment.contentHash) {
      throw new Error("PROJECT_BRAIN_VOICE_SEGMENT_MANIFEST_REFUSED");
    }
    nextStart = segment.endMs;
    totalBytes += segment.bytes.byteLength;
    return Object.freeze({ ordinal, startMs: segment.startMs, endMs: segment.endMs, durationMs: segment.durationMs,
      mediaFormat: segment.mediaFormat, mimeType: segment.mimeType, contentHash: segment.contentHash, byteCount: segment.bytes.byteLength });
  });
  if (nextStart !== subject.sourceDurationMs || totalBytes > VOICE_LIMITS.maxSessionBytes) {
    throw new Error("PROJECT_BRAIN_VOICE_SEGMENT_COVERAGE_REFUSED");
  }
  const manifest = Object.freeze({ schemaVersion: 1 as const, subject, subjectFingerprint: parsed.subjectFingerprint,
    transformer: Object.freeze(parsed.transformer), segments: Object.freeze(segments), totalBytes,
    totalDurationMs: nextStart, mediaDecodingVerified: false as const });
  return Object.freeze({ status: "MANIFEST_VALIDATED_LOCAL_NOT_AUTHORIZED" as const, executionAuthorized: false as const,
    externalTransportPerformed: false as const, manifest, manifestHash: sha256Canonical(manifest) });
}
