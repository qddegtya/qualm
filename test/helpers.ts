/** A fetch that records the request it was given and replies with a fixed body. */
export function stubFetch(
  body: unknown,
  init: { status?: number; headers?: Record<string, string> } = {},
) {
  const calls: { url: string; headers: Headers; body: unknown }[] = [];
  const fetch: typeof globalThis.fetch = (input, request) => {
    calls.push({
      url: typeof input === "string" ? input : input instanceof URL ? input.href : input.url,
      headers: new Headers(request?.headers),
      body: JSON.parse(typeof request?.body === "string" ? request.body : "null"),
    });
    return Promise.resolve(
      new Response(JSON.stringify(body), {
        status: init.status ?? 200,
        headers: { "content-type": "application/json", ...init.headers },
      }),
    );
  };
  return { fetch, calls };
}

/** One answer as the TypeSafe API returns it. */
export const answered = (answers: Record<string, unknown>) => ({
  model: "jev-1.12",
  answers,
  usage: { input_tokens: 312, output_tokens: 48 },
});

/** A fetch that replays the given replies in order, repeating the last once they run out. */
export function replayFetch(
  replies: readonly { status: number; body?: unknown; headers?: Record<string, string> }[],
) {
  let tries = 0;
  const fetch: typeof globalThis.fetch = () => {
    const reply = replies[Math.min(tries, replies.length - 1)] ?? { status: 200 };
    tries += 1;
    return Promise.resolve(
      new Response(JSON.stringify(reply.body ?? {}), {
        status: reply.status,
        headers: { "content-type": "application/json", ...reply.headers },
      }),
    );
  };
  return { fetch, tried: () => tries };
}

/** A fetch that never answers, so only an abort can end the call. */
export const hangingFetch: typeof globalThis.fetch = (_input, init) =>
  new Promise((_resolve, reject) => {
    init?.signal?.addEventListener("abort", () => {
      reject(init.signal?.reason);
    });
  });

/** A fetch that answers slowly, and always with a status worth retrying. */
export const slowFetch: typeof globalThis.fetch = (_input, init) =>
  new Promise((resolve, reject) => {
    init?.signal?.addEventListener("abort", () => {
      reject(init.signal?.reason);
    });
    setTimeout(() => {
      resolve(new Response("{}", { status: 429 }));
    }, 20);
  });
