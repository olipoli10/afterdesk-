import "server-only";
import { createHash } from "node:crypto";

export const VOICE_PCM_PROFILE = Object.freeze({
  key: "pcm-s16le-mono-16000-v1", sampleRate: 16_000, channels: 1,
  bytesPerSample: 2, maxDurationSeconds: 600, segmentSeconds: 45,
});

/** Pure conversion of already-decoded PCM; does not attest its source or authorize ASR. */
export function splitVoicePcmIntoWav(input: Uint8Array) {
  const p = VOICE_PCM_PROFILE;
  if (!(input instanceof Uint8Array) || input.byteLength < 2 || input.byteLength % 2 !== 0 ||
      input.byteLength > p.sampleRate * p.bytesPerSample * p.maxDurationSeconds) {
    throw new Error("VOICE_PCM_SIZE_REFUSED");
  }
  const pcm = Buffer.from(input);
  const totalSamples = pcm.byteLength / p.bytesPerSample;
  const segmentSamples = p.sampleRate * p.segmentSeconds;
  const segments = [];
  for (let startSample = 0; startSample < totalSamples; startSample += segmentSamples) {
    const endSample = Math.min(startSample + segmentSamples, totalSamples);
    const payloadBytes = (endSample - startSample) * p.bytesPerSample;
    const wav = Buffer.alloc(44 + payloadBytes);
    wav.write("RIFF", 0); wav.writeUInt32LE(36 + payloadBytes, 4); wav.write("WAVEfmt ", 8);
    wav.writeUInt32LE(16, 16); wav.writeUInt16LE(1, 20); wav.writeUInt16LE(p.channels, 22);
    wav.writeUInt32LE(p.sampleRate, 24); wav.writeUInt32LE(p.sampleRate * p.bytesPerSample, 28);
    wav.writeUInt16LE(p.bytesPerSample, 32); wav.writeUInt16LE(16, 34); wav.write("data", 36);
    wav.writeUInt32LE(payloadBytes, 40);
    pcm.copy(wav, 44, startSample * p.bytesPerSample, endSample * p.bytesPerSample);
    if (wav.byteLength > 2_000_000) throw new Error("VOICE_PCM_SEGMENT_SIZE_REFUSED");
    segments.push(Object.freeze({ ordinal: segments.length, startSample, endSample,
      sampleRate: p.sampleRate, sampleCount: endSample - startSample,
      // These may be fractional milliseconds. Do not round them into an older manifest contract.
      startMs: startSample * 1000 / p.sampleRate, endMs: endSample * 1000 / p.sampleRate,
      durationMs: (endSample - startSample) * 1000 / p.sampleRate,
      contentHash: createHash("sha256").update(wav).digest("hex"), bytes: wav }));
  }
  if (segments.length > 14 || segments.reduce((sum, item) => sum + item.bytes.byteLength, 0) > 28_000_000) {
    throw new Error("VOICE_PCM_SESSION_SIZE_REFUSED");
  }
  return Object.freeze({ profile: p.key, totalSamples, sampleRate: p.sampleRate,
    durationMs: totalSamples * 1000 / p.sampleRate, segments: Object.freeze(segments),
    decodedPcmHash: createHash("sha256").update(pcm).digest("hex"),
    sourceDerivationVerified: false as const, executionAuthorized: false as const });
}
