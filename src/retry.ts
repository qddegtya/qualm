// oxlint-disable no-await-in-loop -- retries are sequential by definition; backoff means waiting
import { ApiError } from "./error.ts";

export interface RetryOptions {
  /** How many times to try in total, including the first. Default 3. */
  readonly attempts?: number;
  /** Base for exponential backoff, in milliseconds. Default 500. */
  readonly baseDelay?: number;
}

export interface Send {
  readonly fetch: typeof globalThis.fetch;
  readonly url: string;
  readonly request: RequestInit;
  readonly retry: RetryOptions | undefined;
  /** Milliseconds for the whole call, retries included. */
  readonly timeout: number;
  /** The caller's own signal, if they passed one. */
  readonly signal: AbortSignal | undefined;
}

/**
 * Sends the request, retrying only statuses that a later attempt can fix.
 * A thrown error — an abort, a dead network — is passed straight through: retrying an abort would
 * ignore the caller, and we cannot tell a transient network fault from a permanent one.
 */
export async function send(options: Send): Promise<unknown> {
  const attempts = options.retry?.attempts ?? 3;
  const baseDelay = options.retry?.baseDelay ?? 500;
  const { signal, release } = deadline(options.timeout, options.signal);

  try {
    for (let attempt = 1; ; attempt += 1) {
      if (signal.aborted) throw signal.reason;
      const response = await options.fetch(options.url, { ...options.request, signal });
      if (response.ok) return parse(response);
      if (attempt >= attempts || !worthRetrying(response.status)) {
        throw new ApiError(response.status, await parse(response));
      }
      await pause(backoff(response, attempt, baseDelay), signal);
    }
  } finally {
    release();
  }
}

/** Rate limits and server faults may pass; anything the caller got wrong will not. */
const worthRetrying = (status: number) => status === 429 || status >= 500;

function backoff(response: Response, attempt: number, baseDelay: number): number {
  const after = Number(response.headers.get("retry-after"));
  if (Number.isFinite(after) && after > 0) return after * 1000;
  // Full jitter. Without it every caller that failed together comes back in the same millisecond,
  // so a rate limit turns into a stampede that the retry itself keeps feeding.
  return Math.random() * baseDelay * 2 ** (attempt - 1);
}

/** One signal that aborts when the caller's does, or when the deadline passes. */
function deadline(ms: number, caller: AbortSignal | undefined) {
  const controller = new AbortController();
  const relay = () => {
    controller.abort(caller?.reason);
  };

  if (caller?.aborted) controller.abort(caller.reason);
  else caller?.addEventListener("abort", relay, { once: true });

  const timer = setTimeout(() => {
    controller.abort(new DOMException(`Timed out after ${ms}ms.`, "TimeoutError"));
  }, ms);

  return {
    signal: controller.signal,
    release: () => {
      clearTimeout(timer);
      caller?.removeEventListener("abort", relay);
    },
  };
}

const pause = (ms: number, signal: AbortSignal) =>
  new Promise<void>((resolve, reject) => {
    const stop = () => {
      clearTimeout(timer);
      reject(signal.reason);
    };
    const timer = setTimeout(() => {
      signal.removeEventListener("abort", stop);
      resolve();
    }, ms);
    signal.addEventListener("abort", stop, { once: true });
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
