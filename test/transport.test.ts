import { expect, test } from "vitest";
import { ApiError, client, is } from "../src/index.ts";
import { answered, replayFetch, stubFetch } from "./helpers.ts";

const ok = answered({ urgent: { type: "noul", noul: 0.9 } });
const question = { urgent: is`This conveys urgency` };
const nothing = { retry: { attempts: 1 } } as const;

test("cloudflare puts the model in the body and the call under `input`", async () => {
  const { fetch, calls } = stubFetch({ result: ok, success: true, errors: [], messages: [] });
  const c = client({ provider: "cloudflare", apiKey: "t", accountId: "acc", fetch });

  const { urgent } = await c.ask("Payouts failing.", question);

  expect(calls[0]?.url).toBe("https://api.cloudflare.com/client/v4/accounts/acc/ai/run");
  expect(calls[0]?.body).toEqual({
    model: "typesafe/jev",
    input: {
      state: "Payouts failing.",
      questions: { urgent: { type: "noul", instructions: "This conveys urgency" } },
    },
  });
  expect(urgent.probability).toBe(0.9);
});

test("a failed response becomes an ApiError carrying the status and body", async () => {
  const { fetch } = stubFetch({ error: "bad key" }, { status: 401 });
  const c = client({ provider: "typesafe", apiKey: "k", fetch, ...nothing });

  const failure = await c.ask("...", question).catch((e: unknown) => e);

  expect(failure).toBeInstanceOf(ApiError);
  expect(failure).toMatchObject({ status: 401, body: { error: "bad key" } });
});

test("a client error is not retried, because trying again cannot help", async () => {
  const { fetch, tried } = replayFetch([{ status: 422 }]);
  const c = client({
    provider: "typesafe",
    apiKey: "k",
    fetch,
    retry: { attempts: 3, baseDelay: 0 },
  });

  await expect(c.ask("...", question)).rejects.toBeInstanceOf(ApiError);

  expect(tried()).toBe(1);
});

test("rate limits and overload are retried, and a later success is returned", async () => {
  const { fetch, tried } = replayFetch([
    { status: 429 },
    { status: 529 },
    { status: 200, body: ok },
  ]);
  const c = client({
    provider: "typesafe",
    apiKey: "k",
    fetch,
    retry: { attempts: 3, baseDelay: 0 },
  });

  const { urgent } = await c.ask("...", question);

  expect(tried()).toBe(3);
  expect(urgent.probability).toBe(0.9);
});

test("gives up after the last attempt and reports the final failure", async () => {
  const { fetch, tried } = replayFetch([{ status: 529 }]);
  const c = client({
    provider: "typesafe",
    apiKey: "k",
    fetch,
    retry: { attempts: 2, baseDelay: 0 },
  });

  await expect(c.ask("...", question)).rejects.toBeInstanceOf(ApiError);
  expect(tried()).toBe(2);
});

test("an ApiError reads as the API's own complaint, so a log line is enough to act on", async () => {
  const { fetch } = stubFetch({ error: "score needs at least two levels" }, { status: 422 });
  const spelled = client({ provider: "typesafe", apiKey: "k", fetch, ...nothing });

  const { fetch: plain } = stubFetch("upstream exploded", { status: 500 });
  const text = client({ provider: "typesafe", apiKey: "k", fetch: plain, ...nothing });

  await expect(spelled.ask("...", question)).rejects.toThrow("422 score needs at least two levels");
  await expect(text.ask("...", question)).rejects.toThrow(/upstream exploded/u);
});

test("an aborted request is passed through rather than retried", async () => {
  const controller = new AbortController();
  controller.abort();
  const c = client({ provider: "typesafe", apiKey: "k" });

  await expect(c.ask("...", question, { signal: controller.signal })).rejects.toThrow(/abort/iu);
});

test("falls back to the environment when a key is not passed", async () => {
  const environment = (globalThis as unknown as { process: { env: Record<string, string> } })
    .process.env;
  environment["TYPESAFE_API_KEY"] = "from-env";

  const { fetch, calls } = stubFetch(ok);
  await client({ provider: "typesafe", fetch }).ask("...", question);

  expect(calls[0]?.headers.get("authorization")).toBe("Bearer from-env");
  delete environment["TYPESAFE_API_KEY"];
});

test("says which option is missing when neither it nor its variable is set", () => {
  expect(() => client({ provider: "cloudflare", apiKey: "t" })).toThrow(/accountId/u);
});

test("refuses an answer set that is missing a question we asked", async () => {
  const { fetch } = stubFetch(answered({}));
  const c = client({ provider: "typesafe", apiKey: "k", fetch, ...nothing });

  await expect(c.ask("...", question)).rejects.toThrow(/urgent/u);
});
