import "server-only";

export async function readBoundedJson(request: Request, maximumBytes = 64 * 1024): Promise<unknown> {
  const contentLength = Number(request.headers.get("content-length"));
  if (Number.isFinite(contentLength) && contentLength > maximumBytes) throw new RequestBodyError("Request body is too large", 413);
  const body = await request.text();
  if (Buffer.byteLength(body, "utf8") > maximumBytes) throw new RequestBodyError("Request body is too large", 413);
  try {
    return JSON.parse(body) as unknown;
  } catch {
    throw new RequestBodyError("Request body must be valid JSON", 400);
  }
}

export class RequestBodyError extends Error {
  constructor(message: string, public readonly status: number) {
    super(message);
  }
}
