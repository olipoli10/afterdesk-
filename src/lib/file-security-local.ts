import "server-only";
import {
  FileRejectedError,
  inspectAndSanitizeFile,
  type ScanResult,
} from "@/lib/file-security";

const PROJECT_BRAIN_M4A_MAX_DURATION_MS = 120_000;
const PROJECT_BRAIN_M4A_MAX_BOX_COUNT = 512;
const PROJECT_BRAIN_M4A_DECLARED_DURATION_TOLERANCE_MS = 2_000;
const PROJECT_BRAIN_M4A_DECLARED_DURATION_TOLERANCE_RATIO = 0.05;
const PROJECT_BRAIN_M4A_MAX_CHUNK_COUNT = 262_144;
const PROJECT_BRAIN_M4A_MAX_SAMPLE_COUNT = 2_500_000;
const PROJECT_BRAIN_M4A_AUDIO_SAMPLE_ENTRY = "mp4a";

type IsoBox = {
  type: string;
  payloadStart: number;
  end: number;
};

type M4aDuration = {
  duration: bigint;
  timescale: bigint;
};

type MediaDataRange = {
  start: bigint;
  end: bigint;
};

type SampleSizeTable = {
  sampleCount: number;
  fixedSampleBytes: number;
  variableSampleBytes: number[] | null;
  totalSampleBytes: bigint;
};

type SampleToChunkEntry = {
  firstChunk: number;
  samplesPerChunk: number;
  sampleDescriptionIndex: number;
};

type AacAudioConfig = {
  sampleRate: number;
  channelCount: number;
};

export type LocalProjectBrainSourceInspection = ScanResult & {
  actualVoiceDurationMs: number | null;
};

function malformedM4a(): never {
  throw new FileRejectedError("The M4A audio container is malformed or incomplete.");
}

function parseIsoBoxes(
  buffer: Buffer,
  start: number,
  end: number,
  budget: { count: number },
): IsoBox[] {
  const boxes: IsoBox[] = [];
  let cursor = start;
  while (cursor < end) {
    if (end - cursor < 8) malformedM4a();
    budget.count += 1;
    if (budget.count > PROJECT_BRAIN_M4A_MAX_BOX_COUNT) malformedM4a();

    const shortSize = buffer.readUInt32BE(cursor);
    const type = buffer.subarray(cursor + 4, cursor + 8).toString("ascii");
    let headerBytes = 8;
    let size: number;
    if (shortSize === 1) {
      if (end - cursor < 16) malformedM4a();
      const longSize = buffer.readBigUInt64BE(cursor + 8);
      if (longSize > BigInt(Number.MAX_SAFE_INTEGER)) malformedM4a();
      size = Number(longSize);
      headerBytes = 16;
    } else if (shortSize === 0) {
      size = end - cursor;
    } else {
      size = shortSize;
    }
    if (size < headerBytes || cursor + size > end) malformedM4a();
    boxes.push({ type, payloadStart: cursor + headerBytes, end: cursor + size });
    cursor += size;
  }
  if (cursor !== end) malformedM4a();
  return boxes;
}

function childBoxes(
  buffer: Buffer,
  parent: IsoBox,
  budget: { count: number },
): IsoBox[] {
  return parseIsoBoxes(buffer, parent.payloadStart, parent.end, budget);
}

function parseMediaDuration(buffer: Buffer, mdhd: IsoBox): M4aDuration {
  if (mdhd.end - mdhd.payloadStart < 20) malformedM4a();
  const version = buffer[mdhd.payloadStart];
  let timescale: bigint;
  let duration: bigint;
  if (version === 0) {
    if (mdhd.end - mdhd.payloadStart < 24) malformedM4a();
    timescale = BigInt(buffer.readUInt32BE(mdhd.payloadStart + 12));
    duration = BigInt(buffer.readUInt32BE(mdhd.payloadStart + 16));
    if (duration === 0xffff_ffffn) malformedM4a();
  } else if (version === 1) {
    if (mdhd.end - mdhd.payloadStart < 36) malformedM4a();
    timescale = BigInt(buffer.readUInt32BE(mdhd.payloadStart + 20));
    duration = buffer.readBigUInt64BE(mdhd.payloadStart + 24);
    if (duration === 0xffff_ffff_ffff_ffffn) malformedM4a();
  } else {
    malformedM4a();
  }
  if (timescale <= 0n || duration <= 0n) malformedM4a();
  return { duration, timescale };
}

function requireVersionZeroFullBox(buffer: Buffer, box: IsoBox): void {
  if (
    box.end - box.payloadStart < 4
    || buffer.readUInt32BE(box.payloadStart) !== 0
  ) malformedM4a();
}

function readDescriptor(
  buffer: Buffer,
  cursor: number,
  end: number,
): { tag: number; payloadStart: number; end: number } {
  if (cursor >= end) malformedM4a();
  const tag = buffer[cursor];
  cursor += 1;
  let length = 0;
  let terminated = false;
  for (let index = 0; index < 4; index += 1) {
    if (cursor >= end) malformedM4a();
    const octet = buffer[cursor];
    cursor += 1;
    length = length * 128 + (octet & 0x7f);
    if ((octet & 0x80) === 0) {
      terminated = true;
      break;
    }
  }
  if (!terminated || length <= 0 || cursor + length > end) malformedM4a();
  return { tag, payloadStart: cursor, end: cursor + length };
}

function readAudioSpecificConfigBits(
  bytes: Buffer,
  state: { bitOffset: number },
  count: number,
): number {
  if (count <= 0 || state.bitOffset + count > bytes.length * 8) malformedM4a();
  let value = 0;
  for (let index = 0; index < count; index += 1) {
    const offset = state.bitOffset + index;
    value = value * 2 + ((bytes[Math.floor(offset / 8)] >> (7 - (offset % 8))) & 1);
  }
  state.bitOffset += count;
  return value;
}

function readAacObjectType(bytes: Buffer, state: { bitOffset: number }): number {
  const initial = readAudioSpecificConfigBits(bytes, state, 5);
  return initial === 31
    ? 32 + readAudioSpecificConfigBits(bytes, state, 6)
    : initial;
}

function readAacSampleRate(bytes: Buffer, state: { bitOffset: number }): number {
  const index = readAudioSpecificConfigBits(bytes, state, 4);
  const knownRates = [
    96_000, 88_200, 64_000, 48_000, 44_100, 32_000, 24_000,
    22_050, 16_000, 12_000, 11_025, 8_000, 7_350,
  ];
  if (index === 15) return readAudioSpecificConfigBits(bytes, state, 24);
  return knownRates[index] ?? 0;
}

function validateAudioSpecificConfig(bytes: Buffer): AacAudioConfig {
  if (bytes.length < 2) malformedM4a();
  const state = { bitOffset: 0 };
  let audioObjectType = readAacObjectType(bytes, state);
  const sampleRate = readAacSampleRate(bytes, state);
  const channelConfiguration = readAudioSpecificConfigBits(bytes, state, 4);
  let outputSampleRate = sampleRate;
  if (audioObjectType === 5 || audioObjectType === 29) {
    const extensionSampleRate = readAacSampleRate(bytes, state);
    audioObjectType = readAacObjectType(bytes, state);
    if (extensionSampleRate <= 0) malformedM4a();
    outputSampleRate = extensionSampleRate;
  }
  if (
    !new Set([1, 2, 3, 4, 6, 7, 17, 19, 20, 21, 22, 23, 39, 42]).has(audioObjectType)
    || sampleRate < 1_000
    || sampleRate > 384_000
    || channelConfiguration < 1
    || channelConfiguration > 7
  ) malformedM4a();
  const channelCount = channelConfiguration === 7 ? 8 : channelConfiguration;
  return { sampleRate: outputSampleRate, channelCount };
}

function validateMp4aDescriptor(buffer: Buffer, esds: IsoBox): AacAudioConfig {
  requireVersionZeroFullBox(buffer, esds);
  const esDescriptor = readDescriptor(buffer, esds.payloadStart + 4, esds.end);
  if (esDescriptor.tag !== 0x03 || esDescriptor.end !== esds.end) malformedM4a();
  if (esDescriptor.end - esDescriptor.payloadStart < 3) malformedM4a();

  let cursor = esDescriptor.payloadStart + 2;
  const flags = buffer[cursor];
  cursor += 1;
  if ((flags & 0x80) !== 0) cursor += 2;
  if ((flags & 0x40) !== 0) {
    if (cursor >= esDescriptor.end) malformedM4a();
    const urlLength = buffer[cursor];
    cursor += 1 + urlLength;
  }
  if ((flags & 0x20) !== 0) cursor += 2;
  if (cursor > esDescriptor.end) malformedM4a();

  const decoderConfig = readDescriptor(buffer, cursor, esDescriptor.end);
  if (
    decoderConfig.tag !== 0x04
    || decoderConfig.end - decoderConfig.payloadStart < 13
  ) malformedM4a();
  const objectTypeIndication = buffer[decoderConfig.payloadStart];
  const streamType = buffer[decoderConfig.payloadStart + 1];
  if (
    !new Set([0x40, 0x66, 0x67, 0x68]).has(objectTypeIndication)
    || ((streamType >> 2) & 0x3f) !== 0x05
    || (streamType & 1) !== 1
  ) malformedM4a();

  const decoderSpecificInfo = readDescriptor(
    buffer,
    decoderConfig.payloadStart + 13,
    decoderConfig.end,
  );
  if (decoderSpecificInfo.tag !== 0x05) malformedM4a();
  return validateAudioSpecificConfig(
    buffer.subarray(decoderSpecificInfo.payloadStart, decoderSpecificInfo.end),
  );
}

function validateAudioSampleEntries(
  buffer: Buffer,
  stsd: IsoBox,
  budget: { count: number },
): Set<number> {
  requireVersionZeroFullBox(buffer, stsd);
  if (stsd.end - stsd.payloadStart < 8) malformedM4a();
  const entryCount = buffer.readUInt32BE(stsd.payloadStart + 4);
  if (entryCount <= 0 || entryCount > 64) malformedM4a();
  const entries = parseIsoBoxes(buffer, stsd.payloadStart + 8, stsd.end, budget);
  if (entries.length !== entryCount) malformedM4a();

  const validAudioEntries = new Set<number>();
  for (let index = 0; index < entries.length; index += 1) {
    const entry = entries[index];
    if (entry.type !== PROJECT_BRAIN_M4A_AUDIO_SAMPLE_ENTRY) continue;
    if (entry.end - entry.payloadStart < 28) malformedM4a();
    for (let offset = 0; offset < 6; offset += 1) {
      if (buffer[entry.payloadStart + offset] !== 0) malformedM4a();
    }
    const dataReferenceIndex = buffer.readUInt16BE(entry.payloadStart + 6);
    const version = buffer.readUInt16BE(entry.payloadStart + 8);
    const channelCount = buffer.readUInt16BE(entry.payloadStart + 16);
    const sampleSize = buffer.readUInt16BE(entry.payloadStart + 18);
    const sampleRateFixed = buffer.readUInt32BE(entry.payloadStart + 24);
    const sampleRate = sampleRateFixed / 65_536;
    if (
      dataReferenceIndex !== 1
      || version !== 0
      || channelCount <= 0
      || channelCount > 32
      || sampleSize <= 0
      || sampleSize > 64
      || sampleRate < 1_000
      || sampleRate > 384_000
    ) malformedM4a();

    const codecBoxes = parseIsoBoxes(
      buffer,
      entry.payloadStart + 28,
      entry.end,
      budget,
    );
    const descriptors = codecBoxes.filter((box) => box.type === "esds");
    if (descriptors.length !== 1) malformedM4a();
    const codecConfig = validateMp4aDescriptor(buffer, descriptors[0]);
    if (
      codecConfig.sampleRate !== sampleRate
      || codecConfig.channelCount !== channelCount
    ) malformedM4a();
    validAudioEntries.add(index + 1);
  }
  if (validAudioEntries.size === 0) malformedM4a();
  return validAudioEntries;
}

function validateSelfContainedDataReference(
  buffer: Buffer,
  minf: IsoBox,
  budget: { count: number },
): void {
  const dinfBoxes = childBoxes(buffer, minf, budget).filter(
    (box) => box.type === "dinf",
  );
  if (dinfBoxes.length !== 1) malformedM4a();
  const drefBoxes = childBoxes(buffer, dinfBoxes[0], budget).filter(
    (box) => box.type === "dref",
  );
  if (drefBoxes.length !== 1) malformedM4a();
  const dref = drefBoxes[0];
  requireVersionZeroFullBox(buffer, dref);
  if (dref.end - dref.payloadStart < 8) malformedM4a();
  const entryCount = buffer.readUInt32BE(dref.payloadStart + 4);
  const references = parseIsoBoxes(buffer, dref.payloadStart + 8, dref.end, budget);
  if (
    entryCount !== 1
    || references.length !== 1
    || references[0].type !== "url "
    || references[0].end - references[0].payloadStart !== 4
    || buffer.readUInt32BE(references[0].payloadStart) !== 1
  ) malformedM4a();
}

function parseSampleTimeline(
  buffer: Buffer,
  stts: IsoBox,
): { sampleCount: number; sampleDuration: bigint } {
  requireVersionZeroFullBox(buffer, stts);
  if (stts.end - stts.payloadStart < 8) malformedM4a();
  const entryCount = buffer.readUInt32BE(stts.payloadStart + 4);
  if (
    entryCount <= 0
    || entryCount > 4_096
    || stts.payloadStart + 8 + entryCount * 8 !== stts.end
  ) malformedM4a();
  let sampleCount = 0n;
  let sampleDuration = 0n;
  for (let index = 0; index < entryCount; index += 1) {
    const offset = stts.payloadStart + 8 + index * 8;
    const count = BigInt(buffer.readUInt32BE(offset));
    const delta = BigInt(buffer.readUInt32BE(offset + 4));
    if (count <= 0n || delta <= 0n) malformedM4a();
    sampleCount += count;
    sampleDuration += count * delta;
  }
  if (
    sampleCount <= 0n
    || sampleCount > BigInt(PROJECT_BRAIN_M4A_MAX_SAMPLE_COUNT)
  ) malformedM4a();
  return { sampleCount: Number(sampleCount), sampleDuration };
}

function parseSampleSizes(
  buffer: Buffer,
  stsz: IsoBox,
  expectedSampleCount: number,
): SampleSizeTable {
  requireVersionZeroFullBox(buffer, stsz);
  if (stsz.end - stsz.payloadStart < 12) malformedM4a();
  const fixedSampleBytes = buffer.readUInt32BE(stsz.payloadStart + 4);
  const sampleCount = buffer.readUInt32BE(stsz.payloadStart + 8);
  if (sampleCount !== expectedSampleCount || sampleCount <= 0) malformedM4a();

  if (fixedSampleBytes > 0) {
    if (stsz.payloadStart + 12 !== stsz.end) malformedM4a();
    return {
      sampleCount,
      fixedSampleBytes,
      variableSampleBytes: null,
      totalSampleBytes: BigInt(fixedSampleBytes) * BigInt(sampleCount),
    };
  }

  if (stsz.payloadStart + 12 + sampleCount * 4 !== stsz.end) malformedM4a();
  const variableSampleBytes: number[] = [];
  let totalSampleBytes = 0n;
  for (let index = 0; index < sampleCount; index += 1) {
    const sampleBytes = buffer.readUInt32BE(stsz.payloadStart + 12 + index * 4);
    if (sampleBytes <= 0) malformedM4a();
    variableSampleBytes.push(sampleBytes);
    totalSampleBytes += BigInt(sampleBytes);
  }
  return { sampleCount, fixedSampleBytes, variableSampleBytes, totalSampleBytes };
}

function parseSampleToChunk(
  buffer: Buffer,
  stsc: IsoBox,
  validAudioEntries: Set<number>,
): SampleToChunkEntry[] {
  requireVersionZeroFullBox(buffer, stsc);
  if (stsc.end - stsc.payloadStart < 8) malformedM4a();
  const entryCount = buffer.readUInt32BE(stsc.payloadStart + 4);
  if (
    entryCount <= 0
    || entryCount > 4_096
    || stsc.payloadStart + 8 + entryCount * 12 !== stsc.end
  ) malformedM4a();
  const entries: SampleToChunkEntry[] = [];
  for (let index = 0; index < entryCount; index += 1) {
    const offset = stsc.payloadStart + 8 + index * 12;
    const entry = {
      firstChunk: buffer.readUInt32BE(offset),
      samplesPerChunk: buffer.readUInt32BE(offset + 4),
      sampleDescriptionIndex: buffer.readUInt32BE(offset + 8),
    };
    if (
      entry.firstChunk <= 0
      || (index === 0 && entry.firstChunk !== 1)
      || (index > 0 && entry.firstChunk <= entries[index - 1].firstChunk)
      || entry.samplesPerChunk <= 0
      || !validAudioEntries.has(entry.sampleDescriptionIndex)
    ) malformedM4a();
    entries.push(entry);
  }
  return entries;
}

function parseChunkOffsets(
  buffer: Buffer,
  sampleTableBoxes: IsoBox[],
): bigint[] {
  const offsetBoxes = sampleTableBoxes.filter(
    (box) => box.type === "stco" || box.type === "co64",
  );
  if (offsetBoxes.length !== 1) malformedM4a();
  const offsetsBox = offsetBoxes[0];
  requireVersionZeroFullBox(buffer, offsetsBox);
  if (offsetsBox.end - offsetsBox.payloadStart < 8) malformedM4a();
  const chunkCount = buffer.readUInt32BE(offsetsBox.payloadStart + 4);
  const bytesPerOffset = offsetsBox.type === "stco" ? 4 : 8;
  if (
    chunkCount <= 0
    || chunkCount > PROJECT_BRAIN_M4A_MAX_CHUNK_COUNT
    || offsetsBox.payloadStart + 8 + chunkCount * bytesPerOffset !== offsetsBox.end
  ) malformedM4a();

  const offsets: bigint[] = [];
  for (let index = 0; index < chunkCount; index += 1) {
    const offset = offsetsBox.payloadStart + 8 + index * bytesPerOffset;
    offsets.push(bytesPerOffset === 4
      ? BigInt(buffer.readUInt32BE(offset))
      : buffer.readBigUInt64BE(offset));
  }
  return offsets;
}

function sampleBytesForRange(
  sampleSizes: SampleSizeTable,
  start: number,
  count: number,
): bigint {
  if (count <= 0 || start < 0 || start + count > sampleSizes.sampleCount) {
    malformedM4a();
  }
  if (sampleSizes.fixedSampleBytes > 0) {
    return BigInt(sampleSizes.fixedSampleBytes) * BigInt(count);
  }
  let bytes = 0n;
  for (let index = start; index < start + count; index += 1) {
    bytes += BigInt(sampleSizes.variableSampleBytes?.[index] ?? 0);
  }
  if (bytes <= 0n) malformedM4a();
  return bytes;
}

function validateChunkMap(input: {
  chunkOffsets: bigint[];
  mediaDataRanges: MediaDataRange[];
  sampleSizes: SampleSizeTable;
  sampleToChunk: SampleToChunkEntry[];
}): void {
  let nextSample = 0;
  const occupiedRanges: MediaDataRange[] = [];
  for (let entryIndex = 0; entryIndex < input.sampleToChunk.length; entryIndex += 1) {
    const entry = input.sampleToChunk[entryIndex];
    const nextEntry = input.sampleToChunk[entryIndex + 1];
    const finalChunk = nextEntry
      ? nextEntry.firstChunk - 1
      : input.chunkOffsets.length;
    if (
      entry.firstChunk > input.chunkOffsets.length
      || finalChunk < entry.firstChunk
      || finalChunk > input.chunkOffsets.length
    ) {
      malformedM4a();
    }
    for (let chunk = entry.firstChunk; chunk <= finalChunk; chunk += 1) {
      if (entry.samplesPerChunk > input.sampleSizes.sampleCount - nextSample) {
        malformedM4a();
      }
      const chunkBytes = sampleBytesForRange(
        input.sampleSizes,
        nextSample,
        entry.samplesPerChunk,
      );
      const start = input.chunkOffsets[chunk - 1];
      const end = start + chunkBytes;
      if (!input.mediaDataRanges.some(
        (range) => start >= range.start && end <= range.end,
      )) malformedM4a();
      occupiedRanges.push({ start, end });
      nextSample += entry.samplesPerChunk;
    }
  }
  if (nextSample !== input.sampleSizes.sampleCount) malformedM4a();

  occupiedRanges.sort((left, right) => left.start < right.start ? -1 : left.start > right.start ? 1 : 0);
  for (let index = 1; index < occupiedRanges.length; index += 1) {
    if (occupiedRanges[index - 1].end > occupiedRanges[index].start) malformedM4a();
  }
}

function parseAudioSampleTimeline(
  buffer: Buffer,
  mdia: IsoBox,
  mdhd: IsoBox,
  mediaDataRanges: MediaDataRange[],
  budget: { count: number },
): M4aDuration | null {
  const minf = childBoxes(buffer, mdia, budget).find((box) => box.type === "minf");
  if (!minf) return null;
  validateSelfContainedDataReference(buffer, minf, budget);
  const stbl = childBoxes(buffer, minf, budget).find((box) => box.type === "stbl");
  if (!stbl) return null;
  const sampleTableBoxes = childBoxes(buffer, stbl, budget);
  const stsd = sampleTableBoxes.find((box) => box.type === "stsd");
  const stts = sampleTableBoxes.find((box) => box.type === "stts");
  const stsz = sampleTableBoxes.find((box) => box.type === "stsz");
  const stsc = sampleTableBoxes.find((box) => box.type === "stsc");
  if (!stsd || !stts || !stsz || !stsc) return null;

  const validAudioEntries = validateAudioSampleEntries(buffer, stsd, budget);
  const timeline = parseSampleTimeline(buffer, stts);
  const sampleSizes = parseSampleSizes(buffer, stsz, timeline.sampleCount);
  const availableMediaBytes = mediaDataRanges.reduce(
    (sum, range) => sum + range.end - range.start,
    0n,
  );
  if (
    sampleSizes.totalSampleBytes <= 0n
    || sampleSizes.totalSampleBytes > availableMediaBytes
  ) malformedM4a();
  validateChunkMap({
    chunkOffsets: parseChunkOffsets(buffer, sampleTableBoxes),
    mediaDataRanges,
    sampleSizes,
    sampleToChunk: parseSampleToChunk(buffer, stsc, validAudioEntries),
  });

  const mediaDuration = parseMediaDuration(buffer, mdhd);
  if (timeline.sampleDuration !== mediaDuration.duration) malformedM4a();
  return { duration: timeline.sampleDuration, timescale: mediaDuration.timescale };
}

function extractM4aAudioDurationMs(buffer: Buffer): number {
  const budget = { count: 0 };
  const topLevel = parseIsoBoxes(buffer, 0, buffer.length, budget);
  const moovBoxes = topLevel.filter((box) => box.type === "moov");
  const mediaDataRanges = topLevel
    .filter((box) => box.type === "mdat")
    .map((box) => ({
      start: BigInt(box.payloadStart),
      end: BigInt(box.end),
    }));
  const moov = moovBoxes[0];
  if (moovBoxes.length !== 1 || !moov || mediaDataRanges.length === 0) malformedM4a();

  const durations: M4aDuration[] = [];
  for (const trak of childBoxes(buffer, moov, budget).filter(
    (box) => box.type === "trak",
  )) {
    for (const mdia of childBoxes(buffer, trak, budget).filter(
      (box) => box.type === "mdia",
    )) {
      const mediaBoxes = childBoxes(buffer, mdia, budget);
      const handler = mediaBoxes.find((box) => box.type === "hdlr");
      if (!handler || handler.end - handler.payloadStart < 12) continue;
      if (buffer.subarray(handler.payloadStart + 8, handler.payloadStart + 12).toString("ascii") !== "soun") {
        continue;
      }
      const mdhd = mediaBoxes.find((box) => box.type === "mdhd");
      if (!mdhd) malformedM4a();
      const sampleTimeline = parseAudioSampleTimeline(
        buffer,
        mdia,
        mdhd,
        mediaDataRanges,
        budget,
      );
      if (!sampleTimeline) malformedM4a();
      durations.push(sampleTimeline);
    }
  }
  if (durations.length === 0) {
    throw new FileRejectedError("The M4A container does not contain a supported audio track.");
  }

  const longest = durations.reduce((left, right) => (
    left.duration * right.timescale >= right.duration * left.timescale ? left : right
  ));
  const durationNumeratorMs = longest.duration * 1_000n;
  if (durationNumeratorMs > BigInt(PROJECT_BRAIN_M4A_MAX_DURATION_MS) * longest.timescale) {
    throw new FileRejectedError("The M4A voice note exceeds the 120-second limit.");
  }
  return Number(
    (durationNumeratorMs + longest.timescale / 2n) / longest.timescale,
  );
}

/**
 * Local-only file admission primitive.
 *
 * The provider policy is fixed by server code and cannot be supplied by an
 * HTTP body, environment variable or caller. Even when a scanner credential
 * exists, this path returns before the provider branch and performs no fetch.
 */
export function inspectAndSanitizeFileLocally(
  buffer: Buffer,
  extension: string,
): Promise<ScanResult> {
  return inspectAndSanitizeFile(buffer, extension, {
    providerPolicy: "FORBIDDEN",
  });
}

export async function inspectProjectBrainSourceLocally(input: {
  buffer: Buffer;
  extension: string;
  declaredDurationMs: number | null;
}): Promise<LocalProjectBrainSourceInspection> {
  const inspected = await inspectAndSanitizeFileLocally(input.buffer, input.extension);
  if (input.extension !== "m4a") {
    return { ...inspected, actualVoiceDurationMs: null };
  }
  if (input.declaredDurationMs === null) {
    throw new FileRejectedError("The M4A voice note requires a declared duration.");
  }

  const actualVoiceDurationMs = extractM4aAudioDurationMs(inspected.buffer);
  const toleranceMs = Math.max(
    PROJECT_BRAIN_M4A_DECLARED_DURATION_TOLERANCE_MS,
    Math.ceil(actualVoiceDurationMs * PROJECT_BRAIN_M4A_DECLARED_DURATION_TOLERANCE_RATIO),
  );
  if (Math.abs(input.declaredDurationMs - actualVoiceDurationMs) > toleranceMs) {
    throw new FileRejectedError(
      "The declared voice-note duration does not match the M4A audio track.",
    );
  }

  return {
    ...inspected,
    actualVoiceDurationMs,
    details: `${inspected.details}; audio track duration verified locally (${actualVoiceDurationMs}ms)`,
  };
}
