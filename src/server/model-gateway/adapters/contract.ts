import "server-only";
import type { AdapterAttemptEnvelope, AdapterAttemptResult } from "../types";

/** One adapter invocation is exactly one externally observable attempt. */
export interface ModelGatewayAdapter {
  readonly key: string;
  dispatch(envelope: AdapterAttemptEnvelope): Promise<AdapterAttemptResult>;
}
