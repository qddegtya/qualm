// oxlint-disable no-await-in-loop -- retries are sequential by definition; backoff means waiting
import { ApiError } from "./error.ts";

export interface RetryOptions {
  /** How many times to try in total, including the first. Default 3. */
  readonly attempts?: number;
  /** Base for exponential backoff, in milliseconds. Default 500. */
  readonly baseDelay?: number;
}

/**
 * Sends the request, retrying only statuses that a later attempt can fix.
 * A thrown error — an abort, a dead network — is passed straight through: retrying an abort would
 * ignore the caller, and we cannot tell a transient network fault from a permanent one.
 */
export async function send(
  fetch: typeof globalThis.fetch,
  url: string,
  request: RequestInit,
  options: RetryOptions | undefined,
): Promise<unknown> {
  const attempts = options?.attempts ?? 3;
  const baseDelay = options?.baseDelay ?? 500;

  for (let attempt = 1; ; attempt += 1) {
    const response = await fetch(url, request);
    if (response.ok) return parse(response);
    if (attempt >= attempts || !worthRetrying(response.status)) {
      throw new ApiError(response.status, await parse(response));
    }
    await pause(backoff(response, attempt, baseDelay));
  }
}

/** Rate limits and server faults may pass; anything the caller got wrong will not. */
const worthRetrying = (status: number) => status === 429 || status >= 500;

function backoff(response: Response, attempt: number, baseDelay: number): number {
  const after = Number(response.headers.get("retry-after"));
  if (Number.isFinite(after) && after > 0) return after * 1000;
  return baseDelay * 2 ** (attempt - 1);
}

const pause = (ms: number) =>
  new Promise((resolve) => {
    setTimeout(resolve, ms);
  });

// Servers and proxies do not always set a content type, so try JSON before trusting it.
async function parse(response: Response): Promise<unknown> {
  const text = await response.text();
  if (!text) return undefined;
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}
