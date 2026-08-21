import { mkdir, rename } from "node:fs/promises";

import { describe, expect, it } from "vitest";

import {
  AUTHORITY_V3_FAKE_ARGV,
  AuthorityV3FakeProtocolRefusal,
  FrameDecoder,
  buildAuthorityV3FakeEnvironment,
  chooseAuthorityV3TerminalCause,
  encodeAuthorityV3Frame,
  validateAuthorityV3FakeArgv,
} from "@/lib/engineering-factory/authority-v3-r3-fake-protocol";
import {
  assertAuthorityV3PipeClosure,
  runAuthorityV3FakeCli,
} from "@/../tools/engineering-factory/authority-v3-fake-cli/fake-cli-harness";

const RUN_ID = "123e4567-e89b-42d3-a456-426614174000";
const ZERO = "0".repeat(64);

describe("Authority V3 R3 deterministic fake CLI protocol", () => {
  it("accepts only the exact ten-token logical argv contract", () => {
    const exact = AUTHORITY_V3_FAKE_ARGV(RUN_ID);
    expect(exact).toHaveLength(10);
    expect(validateAuthorityV3FakeArgv(exact)).toEqual({ runId: RUN_ID });
    expect(() => validateAuthorityV3FakeArgv([...exact, "--extra"])).toThrow("ARGV_REFUSED");
    expect(() => validateAuthorityV3FakeArgv([exact[0]!, exact[2]!, exact[1]!, ...exact.slice(3)]))
      .toThrow("ARGV_REFUSED");
  });

  it("round-trips u32be canonical JSON frames with an exact LF", () => {
    const encoded = encodeAuthorityV3Frame({
      schemaVersion: "3.3.0",
      type: "start",
      frameSequence: 1,
      priorFrameSha256: ZERO,
      runId: RUN_ID,
      contractHash: "a".repeat(64),
    });
    const decoder = new FrameDecoder({ maxFrameBytes: 65_536, maxTotalBytes: 1_048_576 });
    expect(decoder.push(encoded.subarray(0, 3))).toEqual([]);
    expect(decoder.push(encoded.subarray(3))).toHaveLength(1);
    expect(decoder.end()).toEqual([]);
    expect(encoded.at(-1)).toBe(0x0a);
  });

  it("rejects duplicate keys before JSON parse", () => {
    const raw = Buffer.from('{"a":1,"a":1}', "utf8");
    const framed = Buffer.alloc(raw.length + 5);
    framed.writeUInt32BE(raw.length, 0);
    raw.copy(framed, 4);
    framed[framed.length - 1] = 0x0a;
    const decoder = new FrameDecoder({ maxFrameBytes: 65_536, maxTotalBytes: 1_048_576 });
    expect(() => decoder.push(framed)).toThrow("DUPLICATE_JSON_KEY");
  });

  it("rejects partial prefixes, bodies and newlines at EOF", () => {
    for (const bytes of [Buffer.from([0, 0, 0]), Buffer.from([0, 0, 0, 2, 0x7b]), Buffer.from([0, 0, 0, 2, 0x7b, 0x7d])]) {
      const decoder = new FrameDecoder({ maxFrameBytes: 65_536, maxTotalBytes: 1_048_576 });
      decoder.push(bytes);
      expect(() => decoder.end()).toThrow("PARTIAL_FRAME_AT_EOF");
    }
  });

  it("rejects a complete frame whose terminator is not LF", () => {
    const encoded = encodeAuthorityV3Frame({
      schemaVersion: "3.3.0",
      type: "end",
      frameSequence: 1,
      priorFrameSha256: ZERO,
      runId: RUN_ID,
    });
    encoded[encoded.length - 1] = 0x0d;
    const decoder = new FrameDecoder({ maxFrameBytes: 65_536, maxTotalBytes: 1_048_576 });
    expect(() => decoder.push(encoded)).toThrow("FRAME_LF_INVALID");
  });

  it("bounds raw backpressure before parsing untrusted bytes", () => {
    const decoder = new FrameDecoder({ maxFrameBytes: 16, maxTotalBytes: 20 });
    expect(() => decoder.push(Buffer.alloc(21))).toThrow("OUTPUT_LIMIT_EXCEEDED");
  });

  it("uses violation, cancellation, timeout, exit, frame precedence", () => {
    expect(chooseAuthorityV3TerminalCause(["frame", "exit", "timeout", "cancel", "violation"]))
      .toBe("violation");
    expect(chooseAuthorityV3TerminalCause(["timeout", "cancel"])).toBe("cancel");
    expect(chooseAuthorityV3TerminalCause(["frame", "exit"])).toBe("exit");
  });

  it("fails closed when a descendant keeps either output pipe open", () => {
    expect(() => assertAuthorityV3PipeClosure({
      childExited: true,
      stdoutEnded: true,
      stderrEnded: false,
      drainDeadlineReached: true,
    })).toThrow("PIPE_HELD_BY_UNAPPROVED_DESCENDANT");
  });

  it("constructs only the exact child environment", () => {
    expect(buildAuthorityV3FakeEnvironment(RUN_ID)).toEqual({
      EF_AUTHORITY_SCHEMA_VERSION: "3.3.0",
      EF_COMPATIBILITY_CONTRACT_VERSION: "3.3.0",
      EF_FAKE_RELAY_HOST: "198.18.0.2",
      EF_FAKE_RELAY_PORT: "47001",
      EF_RUN_ID: RUN_ID,
      HOME: "/nonexistent",
      LANG: "C.UTF-8",
      LC_ALL: "C.UTF-8",
      PATH: "/ef/bin",
      TMPDIR: "/ef/tmp",
    });
  });

  it("runs the pinned fake process with concurrent drains and no network authority", async () => {
    const proof = await runAuthorityV3FakeCli({
      runId: RUN_ID,
      requests: [{ fakeRequestId: "fake-1", payloadClass: "synthetic-small", fakePayload: { units: 3 } }],
      timeoutMilliseconds: 5_000,
    });
    expect(proof).toMatchObject({
      status: "AUTHORITY_V3_R3_FAKE_CLI_PROVED",
      exitCode: 0,
      stderrFrameCount: 0,
      concurrentDrainsStartedBeforeInput: true,
      networkDenied: true,
      childProcessesRemaining: 0,
      ephemeralRootRemoved: true,
      providerCalls: 0,
      realCandidateInvocations: 0,
      syntheticFakeInvocations: 1,
    });
    expect(proof.stdoutTypes).toEqual(["ready", "accepted", "progress", "result", "terminal"]);
    expect(proof.logicalArgv).toEqual(AUTHORITY_V3_FAKE_ARGV(RUN_ID));
  });

  it("rejects a replaced disposable root before launching the fake process", async () => {
    await expect(runAuthorityV3FakeCli({
      runId: RUN_ID,
      requests: [{ fakeRequestId: "fake-1", payloadClass: "synthetic-small", fakePayload: { units: 1 } }],
      timeoutMilliseconds: 5_000,
      beforeLaunch: async ({ root }) => {
        const replaced = `${root}-replaced`;
        await rename(root, replaced);
        await mkdir(root);
        return [replaced];
      },
    })).rejects.toThrow(new AuthorityV3FakeProtocolRefusal("ROOT_REPLACED"));
  });

  it("kills a fake process that cannot complete before the overall deadline", async () => {
    await expect(runAuthorityV3FakeCli({
      runId: RUN_ID,
      requests: [{ fakeRequestId: "fake-1", payloadClass: "synthetic-small", fakePayload: { units: 1 } }],
      timeoutMilliseconds: 5,
      inputDelayMilliseconds: 50,
    })).rejects.toThrow("OVERALL_TIMEOUT");
  });
});
