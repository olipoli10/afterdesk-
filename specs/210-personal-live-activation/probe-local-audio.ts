/** Fixed synthetic fixture only: not an untrusted-media service or OS sandbox. */
import { spawnSync } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { existsSync, lstatSync, mkdirSync, readFileSync, realpathSync, statSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { splitVoicePcmIntoWav } from "@/server/model-gateway/voice/pcm-segments";

const executables = Object.freeze({
  ffmpeg: { path: "C:/Users/oliro/AppData/Local/Microsoft/WinGet/Packages/Gyan.FFmpeg_Microsoft.Winget.Source_8wekyb3d8bbwe/ffmpeg-8.1.1-full_build/bin/ffmpeg.exe",
    sha256: "09948d4cdd0650da6ff5a87577469f2a218dc2615ae379f8f734d24c49de0f73" },
  ffprobe: { path: "C:/Users/oliro/AppData/Local/Microsoft/WinGet/Packages/Gyan.FFmpeg_Microsoft.Winget.Source_8wekyb3d8bbwe/ffmpeg-8.1.1-full_build/bin/ffprobe.exe",
    sha256: "a6618e99bb58869ded3c6f37b53aa1a8d701c3591dbb7b5b317d47369c112be2" },
});
const hash = (bytes: Uint8Array) => createHash("sha256").update(bytes).digest("hex");

function main() {
  if (process.argv.length !== 3 || process.argv[2] !== "--synthetic-local-probe" || process.platform !== "win32") {
    throw new Error("SYNTHETIC_LOCAL_WINDOWS_PROBE_REQUIRED");
  }
  const root = resolve(__dirname, "../..");
  if (resolve(process.cwd()) !== root || !existsSync(join(root, "prisma/schema.prisma"))) throw new Error("AUDIO_PROBE_ROOT_REFUSED");
  function requireLocalDirectory(path: string) {
    if (!existsSync(path) || !lstatSync(path).isDirectory() || lstatSync(path).isSymbolicLink() || realpathSync(path) !== path) {
      throw new Error("AUDIO_PROBE_DIRECTORY_REFUSED");
    }
  }
  const scratchRoot = join(root, ".scratch");
  const evidenceRoot = join(root, "specs/210-personal-live-activation/evidence");
  requireLocalDirectory(root);
  requireLocalDirectory(scratchRoot);
  requireLocalDirectory(evidenceRoot);
  const id = randomUUID(), scratch = join(scratchRoot, `audio-probe-${id}`);
  mkdirSync(scratch, { recursive: false });
  requireLocalDirectory(scratch);
  const evidence = join(evidenceRoot, `audio-probe-${id}`);
  mkdirSync(evidence, { recursive: false });
  requireLocalDirectory(evidence);
  const nativeEnv: NodeJS.ProcessEnv = { NODE_ENV: "test", SystemRoot: process.env.SystemRoot, WINDIR: process.env.WINDIR, TEMP: scratch, TMP: scratch };
  const deadline = Date.now() + 90_000;
  const stages: Array<{ stage: string; pid: number; elapsedMs: number; stdoutBytes: number; status: number }> = [];
  const report: Record<string, unknown> = { schemaVersion: 1, fixture: "FIXED_SYNTHETIC_SINE_600S", scratch,
    providerCalls: 0, personalAudio: false, osSandbox: false, publisherAuthenticated: false,
    executablePins: executables, stages, verdict: "IN_PROGRESS" };
  function run(tool: keyof typeof executables, stage: string, args: string[], maxBuffer = 65_536) {
    const pin = executables[tool], remaining = deadline - Date.now();
    if (remaining <= 0) throw new Error("AUDIO_PROBE_DEADLINE");
    if (lstatSync(pin.path).isSymbolicLink() || hash(readFileSync(pin.path)) !== pin.sha256) throw new Error("AUDIO_EXECUTABLE_PIN_CHANGED");
    const started = Date.now();
    const result = spawnSync(pin.path, args, { cwd: scratch, env: nativeEnv, shell: false, windowsHide: true,
      timeout: Math.max(1, Math.min(20_000, deadline - Date.now())), killSignal: "SIGKILL", maxBuffer });
    stages.push({ stage, pid: result.pid, elapsedMs: Date.now() - started, stdoutBytes: result.stdout?.byteLength ?? 0, status: result.status ?? -1 });
    if (result.error || result.signal || result.status !== 0) throw new Error(`AUDIO_NATIVE_STAGE_FAILED:${stage}`);
    return result.stdout;
  }
  try {
    const file = join(scratch, "synthetic-sine.m4a");
    run("ffmpeg", "synthesize", ["-nostdin", "-hide_banner", "-loglevel", "error", "-n", "-threads", "1",
      "-f", "lavfi", "-i", "sine=frequency=440:sample_rate=16000:duration=600",
      "-map_metadata", "-1", "-map_chapters", "-1", "-ac", "1", "-ar", "16000", "-c:a", "aac", "-b:a", "64k",
      "-flags:a", "+bitexact", "-fflags", "+bitexact", "-movflags", "+faststart", "-fs", "10485761", file]);
    if (statSync(file).size < 1 || statSync(file).size > 10 * 1024 * 1024) throw new Error("AUDIO_FIXTURE_SIZE_REFUSED");
    const mov = ["-protocol_whitelist", "file,pipe", "-enable_drefs", "0", "-use_absolute_path", "0", "-f", "mov"];
    const probe = JSON.parse(run("ffprobe", "probe-source", ["-v", "error", ...mov, "-show_entries",
      "stream=codec_name,codec_type,sample_rate,channels,duration:format=duration,nb_streams", "-of", "json", file]).toString("utf8"));
    if (probe.streams?.length !== 1 || probe.streams[0].codec_name !== "aac" || probe.streams[0].channels !== 1 ||
        probe.streams[0].sample_rate !== "16000" || Number(probe.format?.duration) !== 600) throw new Error("AUDIO_FIXTURE_PROBE_REFUSED");
    const decodeArgs = ["-nostdin", "-hide_banner", "-loglevel", "error", "-max_alloc", "33554432", "-threads", "1", ...mov,
      "-i", file, "-map", "0:a:0", "-vn", "-sn", "-dn", "-map_metadata", "-1", "-ac", "1", "-ar", "16000",
      "-c:a", "pcm_s16le", "-f", "s16le", "pipe:1"];
    const pcm = run("ffmpeg", "decode", decodeArgs, 19_200_002);
    report.source = { sha256: hash(readFileSync(file)), sizeBytes: statSync(file).size, probe };
    report.decodedBytes = pcm.byteLength;
    const segmented = splitVoicePcmIntoWav(pcm);
    if (segmented.totalSamples !== 9_600_000 || segmented.segments.length !== 14) throw new Error("AUDIO_SAMPLE_COVERAGE_REFUSED");
    const repeated = run("ffmpeg", "decode-repeat", decodeArgs, 19_200_002);
    if (!pcm.equals(repeated)) throw new Error("AUDIO_REPEAT_CHANGED");
    const summaries = segmented.segments.map(segment => {
      const path = join(scratch, `segment-${String(segment.ordinal).padStart(2, "0")}.wav`);
      writeFileSync(path, segment.bytes, { flag: "wx" });
      const readback = JSON.parse(run("ffprobe", `probe-segment-${segment.ordinal}`, ["-v", "error", "-f", "wav",
        "-protocol_whitelist", "file,pipe", "-show_entries", "stream=codec_name,sample_rate,channels,duration_ts,time_base", "-of", "json", path]).toString("utf8"));
      const stream = readback.streams?.[0];
      if (readback.streams?.length !== 1 || stream.codec_name !== "pcm_s16le" || stream.sample_rate !== "16000" ||
          stream.channels !== 1 || stream.time_base !== "1/16000" || stream.duration_ts !== segment.sampleCount) throw new Error("AUDIO_SEGMENT_READBACK_REFUSED");
      const { bytes: _bytes, ...metadata } = segment; void _bytes;
      return { ...metadata, byteCount: segment.bytes.byteLength };
    });
    if (!Buffer.concat(segmented.segments.map(s => s.bytes.subarray(44))).equals(pcm)) throw new Error("AUDIO_REASSEMBLY_REFUSED");
    Object.assign(report, { verdict: "SYNTHETIC_NATIVE_DECODE_AND_SEGMENT_PASS", sampleRate: segmented.sampleRate,
      totalSamples: segmented.totalSamples, decodedPcmHash: segmented.decodedPcmHash, segments: summaries,
      limitations: ["fixed local synthetic input only", "not ASR or source-subject authority", "not production decoder isolation", "fractional-millisecond manifest adoption remains separate"] });
  } catch (error) {
    report.verdict = "REWORK"; report.failure = error instanceof Error ? error.message : "AUDIO_PROBE_FAILED";
    process.exitCode = 1;
  } finally {
    report.finishedAt = new Date().toISOString();
    writeFileSync(join(evidence, "result.json"), JSON.stringify(report, null, 2), { flag: "wx" });
    console.log(JSON.stringify({ verdict: report.verdict, failure: report.failure ?? null, evidence, stages: stages.length }));
  }
}
main();
