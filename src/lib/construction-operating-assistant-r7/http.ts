import {
  constructionSharedApiCommandSchema,
  type ConstructionSharedApiCommand,
} from "./api-contracts";

export const CONSTRUCTION_COMMAND_MAX_BYTES = 64 * 1024;

export class ConstructionApiRequestError extends Error {
  constructor(
    public readonly status: 400 | 413 | 415,
    public readonly publicMessage: string,
  ) {
    super(publicMessage);
    this.name = "ConstructionApiRequestError";
  }
}

export async function parseConstructionCommandRequest(
  request: Request,
): Promise<ConstructionSharedApiCommand> {
  const contentType = request.headers.get("content-type")?.toLowerCase() ?? "";
  if (!contentType.startsWith("application/json")) {
    throw new ConstructionApiRequestError(415, "JSON required.");
  }
  const declaredLength = Number(request.headers.get("content-length"));
  if (
    Number.isFinite(declaredLength) &&
    declaredLength > CONSTRUCTION_COMMAND_MAX_BYTES
  ) {
    throw new ConstructionApiRequestError(413, "Request body too large.");
  }

  let text: string;
  try {
    text = await request.text();
  } catch {
    throw new ConstructionApiRequestError(400, "Invalid request body.");
  }
  if (new TextEncoder().encode(text).byteLength > CONSTRUCTION_COMMAND_MAX_BYTES) {
    throw new ConstructionApiRequestError(413, "Request body too large.");
  }

  let body: unknown;
  try {
    body = JSON.parse(text) as unknown;
  } catch {
    throw new ConstructionApiRequestError(400, "Invalid JSON.");
  }
  const parsed = constructionSharedApiCommandSchema.safeParse(body);
  if (!parsed.success) {
    throw new ConstructionApiRequestError(400, "Invalid construction command.");
  }
  return parsed.data;
}

