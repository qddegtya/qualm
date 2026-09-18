# Jev API — cached notes

**These notes are not a source of truth.** They are what the vendor's documentation said on the date
recorded beside each fact. The API is remote and its code cannot be read, so this is the best we
have — but re-check the link before relying on anything here, and never let a note outrank an actual
response from the API.

Anything not listed here is **unverified**. Do not fill a gap from recall or from a third-party
client; leave it unverified and let the server answer.

Checked 2026-09-18 against [docs.typesafe.ai](https://docs.typesafe.ai/llms-full.txt) unless noted.

## Transport

```
POST https://api.typesafe.ai/v1/systemone
Authorization: Bearer <API_KEY>
Content-Type: application/json
```

Request `{ state, model, questions }`. `state` is a string, object or array. `questions` is a map of
your own names to question objects; the same names key the answers back.

Response `{ model, answers, usage: { input_tokens, output_tokens } }`.

Errors: `401` bad key, `422` validation failed, `429` rate limited, `529` overloaded.

## Question and answer shapes

| Type     | Request fields                                       | Answer fields                                            |
| -------- | ---------------------------------------------------- | -------------------------------------------------------- |
| `noul`   | `instructions`, optional `criteria: { true, false }` | `type`, `noul` (probability)                             |
| `choice` | `instructions`, `criteria` (label → description)     | `type`, `choice`, `probabilities`, `confidence`          |
| `score`  | `instructions`, `criteria` (ordered array)           | `type`, `score`, `legend`, `probabilities`, `confidence` |

**`noul` answers carry no `confidence` field.** Only `choice` and `score` do. Any certainty figure
for a `noul` is therefore derived by us and must be labelled as derived wherever it surfaces.

## Limits — and what is not stated

- **Score levels: minimum two. No maximum is stated anywhere in the docs.**
- **Choice options:** the [launch post](https://typesafe.ai/blog/introducing-system-one-models-and-jev)
  says cardinality up to 255; the API docs state no explicit maximum. The two do not agree, so
  neither number is settled.
- **Questions per request:** no stated maximum. A docs cookbook shows 62 in one request.
- Input is **text only**.

Because these bounds are unsettled, the client does not validate them. A limit we invent would reject
a request the server would have accepted. Send it and surface the `422`.

## Why the API takes a record of questions

Questions in one request are evaluated independently and in parallel, and latency barely grows with
their number. Asking ten things costs about what asking one costs. A question that depends on a
previous answer is a second request and must look like one in our API too.

## Other providers

### Cloudflare Workers AI — the priority provider

Checked 2026-09-18 against the [model page](https://developers.cloudflare.com/ai/models/typesafe/jev/)
and the [REST quickstart](https://developers.cloudflare.com/workers-ai/get-started/rest-api/).

Model id `typesafe/jev`. **Context window 32,000 tokens** — the only place a context limit is stated
for Jev at all.

```
POST https://api.cloudflare.com/client/v4/accounts/{ACCOUNT_ID}/ai/run
Authorization: Bearer {API_TOKEN}
Content-Type: application/json

{ "model": "typesafe/jev", "input": { "state": ..., "questions": { ... } } }
```

Workers binding: `env.AI.run("typesafe/jev", { state, questions })`.

Note this is **not** the shape the rest of Workers AI uses. Cloudflare's own models put the model in
the path and the input at the top level of the body (`/ai/run/@cf/meta/llama-3.1-8b-instruct` with
`{ prompt }`). Jev goes through the unified route: model in the body, input under `input`.

An API token needs both `Workers AI - Read` and `Workers AI - Edit`. The account id is in the Workers
AI dashboard.

**Unverified — must be confirmed against a real response.** Cloudflare's REST API documents a
response envelope, `{ result, success, errors, messages }`, while the Jev model page documents the
answer shape `{ model, answers, usage }` with no envelope. The model page is describing the model's
output, so REST almost certainly returns it under `result` while the Workers binding returns it
unwrapped — but "almost certainly" is not verified. Make one real call and read the response before
writing the parser.

**Conflict to resolve at the same time.** Cloudflare's schema marks `criteria` as required on every
question type, including `noul`. The TypeSafe docs describe `criteria` as optional for `noul`. One of
the two docs is imprecise; a real call settles it.

**Also unverified: which response header carries a request id.** Neither provider's documentation
states one, so `ApiError` deliberately carries only `status` and `body`. Read the real response
headers before adding a request id — do not guess a header name.

### Vercel AI Gateway

**Unverified.** The model is listed at $0.042/1M input tokens with zero output tokens, but its
evaluation-protocol wire format has not been read from Vercel's own docs. Do not implement this
provider from recall or from another client's adapter; read the protocol first.

## Known limits of the model itself

Relevant because it constrains what we may claim in docs and type names.

TypeSafe's own workflow benchmark compares against a reference derived from other models rather than
independently verified ground truth. One reproducible third-party benchmark,
[jev-phishing-bench](https://github.com/anisselbd/jev-phishing-bench) (2,000 phishing emails, checked
2026-09-18), measured Jev at 62.6% accuracy and ECE 0.154 against Claude Haiku 4.5's 81.3% and 0.097
— worse accuracy _and_ worse calibration — at 239ms vs 687ms p50 and $0.038 vs $0.462 per thousand.

**So: never describe this library's output as "calibrated", in docs, in type names or in comments.**
It is the probability the model reported. Forcing callers to handle uncertainty is the whole point
precisely because that probability cannot be trusted blindly.
