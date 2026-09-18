import type { Question } from "./question.ts";

/** A JSON-serialisable value. */
export type Json =
  string | number | boolean | null | readonly Json[] | { readonly [key: string]: Json };

/** What the questions are asked about. */
export type State = string | readonly Json[] | { readonly [key: string]: Json };

/** An answer exactly as it arrives on the wire. */
export type WireAnswer =
  | { readonly type: "noul"; readonly noul: number }
  | {
      readonly type: "choice";
      readonly choice: string;
      readonly confidence: number;
      readonly probabilities: Readonly<Record<string, number>>;
    }
  | {
      readonly type: "score";
      readonly score: number;
      readonly confidence: number;
      readonly probabilities: Readonly<Record<string, number>>;
      readonly legend: Readonly<Record<string, string>>;
    };

export interface WireResult {
  readonly model: string;
  readonly answers: Readonly<Record<string, WireAnswer>>;
  readonly usage: { readonly input_tokens: number; readonly output_tokens: number };
}

export interface Call {
  readonly state: State;
  readonly questions: Readonly<Record<string, Question>>;
  readonly model: string;
}

export interface Provider {
  readonly url: string;
  readonly headers: Readonly<Record<string, string>>;
  body(call: Call): unknown;
  unwrap(payload: unknown): WireResult;
}

export const typesafe = (apiKey: string, baseUrl = "https://api.typesafe.ai"): Provider => ({
  url: `${trim(baseUrl)}/v1/systemone`,
  headers: { authorization: `Bearer ${apiKey}` },
  body: ({ state, questions, model }) => ({ model, state, questions }),
  unwrap: (payload) => payload as WireResult,
});

export const cloudflare = (
  apiToken: string,
  accountId: string,
  baseUrl = "https://api.cloudflare.com",
): Provider => ({
  url: `${trim(baseUrl)}/client/v4/accounts/${accountId}/ai/run`,
  headers: { authorization: `Bearer ${apiToken}` },
  // Jev goes through the unified route, so the model is in the body and the call is under `input`.
  body: ({ state, questions, model }) => ({ model, input: { state, questions } }),
  // Every /client/v4 endpoint wraps its payload. See docs/jev-api.md: confirm on the first real call.
  unwrap: (payload) => (payload as { result: WireResult }).result,
});

const trim = (url: string) => url.replace(/\/+$/u, "");
