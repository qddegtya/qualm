import {
  choiceAnswer,
  isAnswer,
  type ChoiceAnswer,
  type IsAnswer,
  type ScoreAnswer,
} from "./answer.ts";
import type {
  ChoiceQuestion,
  IsQuestion,
  Levels,
  Options,
  Question,
  ScoreQuestion,
} from "./question.ts";
import { send, type RetryOptions } from "./retry.ts";
import {
  cloudflare,
  typesafe,
  type Provider,
  type State,
  type WireAnswer,
  type WireResult,
} from "./provider.ts";

export type Questions = Readonly<Record<string, Question>>;

export type AnswerFor<Q extends Question> = Q extends IsQuestion
  ? IsAnswer
  : Q extends ChoiceQuestion<infer O extends Options>
    ? ChoiceAnswer<O>
    : Q extends ScoreQuestion<infer L extends Levels>
      ? ScoreAnswer<L>
      : never;

export type Answers<Q extends Questions> = { readonly [K in keyof Q]: AnswerFor<Q[K]> };

interface Shared {
  /**
   * Minimum confidence a decision acts on, unless a call site says otherwise.
   * The default is arbitrary: there is no principled value. Calibrate it against your own data.
   */
  readonly confidence?: number;
  /** Overrides the provider's default model. */
  readonly model?: string;
  /** Overrides the provider's base URL. */
  readonly baseUrl?: string;
  /** Replaces `globalThis.fetch`, for tests, proxies and custom runtimes. */
  readonly fetch?: typeof globalThis.fetch;
  /** How hard to try when the API is rate limited or overloaded. */
  readonly retry?: RetryOptions;
}

export interface RequestOptions {
  /** Cancels the request. */
  readonly signal?: AbortSignal;
}

export type ClientOptions = Shared &
  (
    | {
        readonly provider: "typesafe";
        /** Falls back to `TYPESAFE_API_KEY`. */
        readonly apiKey?: string;
      }
    | {
        readonly provider: "cloudflare";
        /** Falls back to `CLOUDFLARE_API_TOKEN`. */
        readonly apiKey?: string;
        /** Falls back to `CLOUDFLARE_ACCOUNT_ID`. */
        readonly accountId?: string;
      }
  );

export interface Client {
  /** Sends every question in one request and resolves to answers under the same keys. */
  ask<const Q extends Questions>(
    state: State,
    questions: Q,
    options?: RequestOptions,
  ): Promise<Answers<Q>>;
}

export function client(options: ClientOptions): Client {
  const fetch = options.fetch ?? globalThis.fetch;
  const model = options.model ?? defaultModel[options.provider];
  const bar = options.confidence ?? defaultConfidence;
  const provider = build(options);

  return {
    async ask(state, questions, request) {
      const payload = await send(
        fetch,
        provider.url,
        {
          method: "POST",
          headers: { ...provider.headers, "content-type": "application/json" },
          body: JSON.stringify(provider.body({ state, questions, model })),
          ...(request?.signal && { signal: request.signal }),
        },
        options.retry,
      );
      return collect(questions, provider.unwrap(payload), bar);
    },
  };
}

const defaultModel = { typesafe: "jev-latest", cloudflare: "typesafe/jev" } as const;

// Arbitrary, and documented as such. Nothing about the model makes one number the right one.
const defaultConfidence = 0.7;

function build(options: ClientOptions): Provider {
  if (options.provider === "cloudflare") {
    return cloudflare(
      required(options.apiKey, "CLOUDFLARE_API_TOKEN", "apiKey"),
      required(options.accountId, "CLOUDFLARE_ACCOUNT_ID", "accountId"),
      options.baseUrl,
    );
  }
  return typesafe(required(options.apiKey, "TYPESAFE_API_KEY", "apiKey"), options.baseUrl);
}

// Reading the environment lazily keeps importing this package free of side effects.
function required(value: string | undefined, variable: string, option: string): string {
  const environment = (globalThis as { process?: { env?: Record<string, string | undefined> } })
    .process?.env;
  const found = value ?? environment?.[variable]?.trim();
  if (!found) throw new TypeError(`Pass \`${option}\` to client() or set ${variable}.`);
  return found;
}

function collect<Q extends Questions>(questions: Q, result: WireResult, bar: number): Answers<Q> {
  const answers: Record<string, unknown> = {};
  for (const [name, question] of Object.entries(questions)) {
    const wire = result.answers[name];
    if (wire === undefined) throw new TypeError(`The model returned no answer for "${name}".`);
    answers[name] = toAnswer(question, wire, bar);
  }
  // Each key was built from `questions` by the same mapping `Answers` describes.
  return answers as Answers<Q>;
}

function toAnswer(
  question: Question,
  wire: WireAnswer,
  bar: number,
): IsAnswer | ChoiceAnswer | ScoreAnswer {
  if (wire.type === "noul") return isAnswer(wire.noul, bar);
  if (wire.type === "choice")
    return choiceAnswer(wire.choice, wire.confidence, wire.probabilities, bar);
  return {
    type: "score",
    value: wire.score,
    confidence: wire.confidence,
    probabilities: numbered(wire.probabilities),
    legend: numbered(wire.legend),
    levels: (question as ScoreQuestion).criteria,
  };
}

// JSON object keys are strings; the API numbers score levels from zero.
const numbered = <T>(entries: Readonly<Record<string, T>>): Readonly<Record<number, T>> =>
  Object.fromEntries(Object.entries(entries).map(([key, value]) => [Number(key), value]));
