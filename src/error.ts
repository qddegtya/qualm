/** A response the API refused. */
export class ApiError extends Error {
  override readonly name = "ApiError";
  /** HTTP status of the refused response. */
  readonly status: number;
  /** Parsed response body, or its text when it was not JSON. `undefined` when it was empty. */
  readonly body: unknown;

  constructor(status: number, body: unknown) {
    super(`${status} ${describe(body)}`);
    this.status = status;
    this.body = body;
  }
}

function describe(body: unknown): string {
  if (typeof body === "string") return body;
  if (typeof body !== "object" || body === null) return "(no body)";
  const { error, message } = body as { error?: unknown; message?: unknown };
  const stated = error ?? message;
  return typeof stated === "string" ? stated : JSON.stringify(body).slice(0, 200);
}
