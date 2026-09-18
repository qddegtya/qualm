import { afterEach, expect, test, vi } from "vitest";
import { ApiError, client, is } from "../src/index.ts";
import { answered, hangingFetch, replayFetch, slowFetch, stubFetch } from "./helpers.ts";

const question = { urgent: is`This conveys urgency` };
const ok = answered({ urgent: { type: "noul", noul: 0.9 } });

afterEach(() => {
  vi.restoreAllMocks();
});

/** Records every backoff delay while letting the timers really run. */
function recordDelays() {
  const delays: number[] = [];
  const real = globalThis.setTimeout;
  vi.spyOn(globalThis, "setTimeout").mockImplementation(((fn: () => void, ms?: number) => {
    if (ms !== undefined && ms < 1000) delays.push(ms);
    return real(fn, ms);
  }) as typeof globalThis.setTimeout);
  return delays;
}

test("spreads retries out, so callers that failed together do not retry together", async () => {
  const delays = recordDelays();
  vi.spyOn(Math, "random").mockReturnValue(0.5);
  const { fetch } = replayFetch([{ status: 429 }, { status: 429 }, { status: 200, body: ok }]);

  await client({
    provider: "typesafe",
    apiKey: "k",
    fetch,
    retry: { attempts: 3, baseDelay: 40 },
  }).ask("...", question);

  // Half of 40 and half of 80: the exponential ceiling, scaled by the random draw.
  expect(delays).toEqual([20, 40]);
});

test("a different random draw gives a different delay, which is the whole point", async () => {
  const delays = recordDelays();
  vi.spyOn(Math, "random").mockReturnValue(0.1);
  const { fetch } = replayFetch([{ status: 429 }, { status: 200, body: ok }]);

  await client({
    provider: "typesafe",
    apiKey: "k",
    fetch,
    retry: { attempts: 2, baseDelay: 40 },
  }).ask("...", question);

  expect(delays).toEqual([4]);
});

test("honours Retry-After exactly, because the server said when to come back", async () => {
  const delays = recordDelays();
  vi.spyOn(Math, "random").mockReturnValue(0.5);
  const { fetch } = replayFetch([
    { status: 429, headers: { "retry-after": "0.05" } },
    { status: 200, body: ok },
  ]);

  await client({
    provider: "typesafe",
    apiKey: "k",
    fetch,
    retry: { attempts: 2, baseDelay: 40 },
  }).ask("...", question);

  expect(delays).toEqual([50]);
});

test("gives up on a request that never answers", async () => {
  const failure = await client({
    provider: "typesafe",
    apiKey: "k",
    fetch: hangingFetch,
    timeout: 30,
  })
    .ask("...", question)
    .catch((e: unknown) => e);

  expect((failure as Error).name).toBe("TimeoutError");
});

test("the deadline covers the retries too, not each attempt on its own", async () => {
  const started = Date.now();
  const failure = await client({
    provider: "typesafe",
    apiKey: "k",
    fetch: slowFetch,
    timeout: 60,
    retry: { attempts: 10, baseDelay: 1 },
  })
    .ask("...", question)
    .catch((e: unknown) => e);

  expect((failure as Error).name).toBe("TimeoutError");
  expect(Date.now() - started).toBeLessThan(400);
});

test("a caller's own signal still aborts, and says so rather than blaming the clock", async () => {
  const controller = new AbortController();
  controller.abort(new Error("caller changed their mind"));
  const { fetch } = stubFetch(ok);

  await expect(
    client({ provider: "typesafe", apiKey: "k", fetch }).ask("...", question, {
      signal: controller.signal,
    }),
  ).rejects.toThrow("caller changed their mind");
});

test("leaves no timer behind once the request is done", async () => {
  const cleared: unknown[] = [];
  vi.spyOn(globalThis, "clearTimeout").mockImplementation(((id: unknown) => {
    cleared.push(id);
  }) as typeof globalThis.clearTimeout);
  const { fetch } = stubFetch(ok);

  await client({ provider: "typesafe", apiKey: "k", fetch, timeout: 5000 }).ask("...", question);

  expect(cleared.length).toBeGreaterThan(0);
});

test("reports what the call cost and which model version answered", async () => {
  const seen: unknown[] = [];
  const { fetch } = stubFetch({
    model: "jev-1.12",
    answers: { urgent: { type: "noul", noul: 0.9 } },
    usage: { input_tokens: 312, output_tokens: 48 },
  });

  await client({ provider: "typesafe", apiKey: "k", fetch, onUsage: (u) => seen.push(u) }).ask(
    "...",
    question,
  );

  expect(seen).toEqual([{ model: "jev-1.12", inputTokens: 312, outputTokens: 48 }]);
});

test("a handler passed with the call replaces the client's", async () => {
  const onClient: unknown[] = [];
  const onCall: unknown[] = [];
  const { fetch } = stubFetch(ok);

  await client({ provider: "typesafe", apiKey: "k", fetch, onUsage: (u) => onClient.push(u) }).ask(
    "...",
    question,
    { onUsage: (u) => onCall.push(u) },
  );

  expect(onClient).toEqual([]);
  expect(onCall).toHaveLength(1);
});

test("a failed call reports no usage, because none was returned", async () => {
  const seen: unknown[] = [];
  const { fetch } = stubFetch({}, { status: 500 });

  await expect(
    client({
      provider: "typesafe",
      apiKey: "k",
      fetch,
      retry: { attempts: 1 },
      onUsage: (u) => seen.push(u),
    }).ask("...", question),
  ).rejects.toBeInstanceOf(ApiError);

  expect(seen).toEqual([]);
});
