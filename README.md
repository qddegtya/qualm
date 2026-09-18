<p align="center">
  <img src="./.github/assets/banner.svg" alt="qualm" width="100%">
</p>

<p align="center">
  <a href="https://www.npmjs.com/package/@atools/qualm"><img alt="npm" src="https://img.shields.io/npm/v/@atools/qualm"></a>
  <a href="https://github.com/qddegtya/qualm/actions/workflows/ci.yml"><img alt="CI" src="https://github.com/qddegtya/qualm/actions/workflows/ci.yml/badge.svg"></a>
  <img alt="types" src="https://img.shields.io/npm/types/@atools/qualm">
  <img alt="node" src="https://img.shields.io/node/v/@atools/qualm">
  <img alt="unpacked size" src="https://img.shields.io/npm/unpacked-size/@atools/qualm">
  <a href="./LICENSE"><img alt="license" src="https://img.shields.io/npm/l/@atools/qualm"></a>
</p>

<p align="center"><b>English</b> · <a href="./README.zh-CN.md">简体中文</a></p>

Typed decisions from a System One model ([TypeSafe's Jev](https://typesafe.ai/)), where uncertainty
is something you have to handle.

A judgment that collapses to `boolean`, or to a bare `argmax`, throws away the one signal that tells
you when to escalate. `qualm` never does that: every decision has an `unsure` branch, and the
compiler will not let you forget it.

## What this library gives you

Jev is the model. This is what `qualm` adds on top of calling its HTTP API yourself.

- **Questions read as questions.** Tagged templates mean the question text _is_ the code —
  ``is`This message conveys urgency` `` — instead of a JSON literal you assemble from `type`,
  `instructions` and `criteria` keys.
- **The answer's type is your type.** Labels come back as the literal union you declared, not as
  `string`, so a typo in a branch name is a compile error rather than a silent miss.
- **Uncertainty is a branch you have to write.** `unsure` is a required key on every decision. A
  decision that ignores it does not compile.
- **Handing over to System 2 is one line.** Put your LLM call in `unsure`; `decide` passes its
  promise straight through, so nothing about the handover is special-cased.
- **All three of Jev's primitives**, each keeping its full distribution and confidence: `is` for a
  proposition, `choice` for a selection, `score` for a rubric.
- **Two providers behind one API** — TypeSafe's own endpoint and Cloudflare Workers AI.
- **Retries, cancellation and typed errors.** Backoff on `429` and `5xx` honouring `Retry-After`,
  `AbortSignal` support, and an `ApiError` carrying the status and parsed body.
- **Zero runtime dependencies**, shipped as ESM and CJS with separate declarations for each.

---

## Why this shape

The terms come from the dual-process literature. **System 1** is fast, automatic, low-effort
judgment; **System 2** is slow, deliberate, effortful reasoning. Stanovich and West named them in
[_Individual differences in reasoning_](https://www.cambridge.org/core/journals/behavioral-and-brain-sciences/article/abs/individual-differences-in-reasoning-implications-for-the-rationality-debate/2906AEF620B36C10018DD291F790BE97)
(Behavioral and Brain Sciences 23(5), 2000, 645–665), and Kahneman made them common currency in
_Thinking, Fast and Slow_ (2011), where he credits them for the vocabulary.

Software has had only System 2. An LLM is slow, expensive, and can genuinely reason — so it became
the interpreter of the program, with your code demoted to the tools it calls. That was never a
design; it was a workaround for the fact that a semantic `if` cost seconds and could hallucinate.

A System One model changes the arithmetic. Jev answers typed questions in roughly a tenth of a
second, returns probabilities instead of prose, and cannot invent an option you did not give it.
With a cheap typed judgment available, control goes back to your code — and the only thing left to
design is the seam where fast judgment hands over to slow reasoning.

**`unsure` is that seam, and this library is built around making it impossible to skip.**

```mermaid
flowchart LR
    state["Program state<br/>text · records · logs"]
    ask["<b>qualm</b> · ask()<br/>one request<br/>N questions in parallel"]
    jev["<b>Jev · System 1</b><br/>fast · typed<br/>cannot hallucinate"]
    decide["<b>qualm</b> · decide()<br/>every branch,<br/>plus unsure"]
    code["Your code runs"]
    llm["<b>LLM · System 2</b><br/>slow · costly<br/>can reason"]

    state --> ask --> jev
    jev -->|"probabilities<br/>+ confidence"| decide
    decide -->|"confidence ≥ bar"| code
    decide -->|"below the bar"| llm
    llm --> code

    classDef fast fill:#e0f7fa,stroke:#0891b2,stroke-width:2px,color:#083344
    classDef slow fill:#fce7f3,stroke:#be185d,stroke-width:2px,color:#500724
    class jev fast
    class llm slow
```

## Install

```sh
pnpm add @atools/qualm
npm install @atools/qualm
yarn add @atools/qualm
```

ESM and CJS ship side by side, each with its own declarations, so both of these work and `tsc`
resolves either under `moduleResolution: nodenext`:

```ts
import { client } from "@atools/qualm"; // ESM
const { client } = require("@atools/qualm"); // CJS
```

Zero runtime dependencies. Node 20+. Runs in Node, Workers, Deno, Bun and the browser.

## Ask

Questions in one request are evaluated independently and in parallel, and latency barely grows with
their number — so ask many narrow questions rather than one broad one. The API takes a record
because a record is honest about that: asking ten things costs about what asking one costs.

```ts
import { choice, client, is, score } from "@atools/qualm";

const jev = client({ provider: "cloudflare", accountId: "…" }); // reads CLOUDFLARE_API_TOKEN

const { team, urgent, severity } = await jev.ask(ticket, {
  team: choice`Which team should handle this?`({
    billing: "Payments, invoicing, refunds",
    technical: "Bugs, outages, integrations",
    sales: null,
  }),
  urgent: is`This message conveys urgency`,
  severity: score`How severe is this for the customer?`([
    "Cosmetic",
    "A workaround exists",
    "Blocks production",
  ]),
});
```

| Ask                 | With                 | Read                                    |
| ------------------- | -------------------- | --------------------------------------- |
| Which one of these? | ``choice`…`({ … })`` | `.top`, `.confidence`, `.probabilities` |
| Is this true?       | ``is`…` ``           | `.probability`, `.confidence`, `.top`   |
| How much?           | ``score`…`([ … ])``  | `.value`, `.confidence`, `.legend`      |

## Decide

`decide` is a `switch` that the compiler makes total. Every label needs a branch, `unsure` needs a
branch, and nothing else is allowed:

```ts
const action = team.decide({
  billing: () => refund(ticket),
  technical: () => file(ticket),
  sales: () => assign(ticket),
  unsure: () => escalate(ticket), // required — leave it out and this will not compile
});
```

Add a label to the question later and every `decide` call breaks until you handle it. A plain
`switch` with a `default` would have swallowed it.

Handlers take no arguments. They are ordinary closures, so whatever is in scope where you write the
decision — `ticket` above — is in scope inside them; nothing has to be threaded through `qualm` to
get there.

`unsure` runs whenever confidence falls below the bar, which makes it the natural place to hand over
to System 2:

```ts
unsure: () => opus(`Read this ticket and route it: ${ticket}`),
```

Branches do whatever you need: side effects, values, or both. `decide` returns exactly what the
branch that ran returned — it never wraps it.

```ts
// Every branch synchronous: a plain value comes back, with no `await` and no microtask.
team.decide({ billing: () => refund(ticket), sales: () => assign(ticket), unsure: () => queue(ticket) });

// One branch async: that branch's promise comes back, so `await` the call.
const outcome = await team.decide({ …, unsure: () => opus(`Route this: ${ticket}`) });
```

**`decide` is never `async` itself**, so a decision that does no I/O costs no tick and still works
inside a synchronous context:

```ts
const urgent = tickets.filter((t) =>
  t.flag.decide({ yes: () => true, no: () => false, unsure: () => false }),
);
```

Mixing a synchronous branch with an `async` one gives a union — `void | Promise<string>` above — and
`await` flattens it. Forgetting that `await` would make the escalation fire-and-forget, so keep a
type-aware linter on; `no-floating-promises` sees the promise inside that union and reports it:

```sh
oxlint --type-aware -D typescript/no-floating-promises .   # or @typescript-eslint/no-floating-promises
```

A yes/no answer splits the same way, into `yes`, `no` and `unsure`.

### The bar

```ts
client({ …, confidence: 0.8 });           // for everything this client asks
team.decide({ … }, { confidence: 0.95 }); // higher, because this branch deletes things
```

Confidence exactly on the bar counts as sure. The default is `0.7`, and **it is arbitrary** — there
is no principled value. Measure your own data and set your own.

### `top` is the escape hatch

`.top` is the highest-probability label. It is there for logs and metrics, and it is named `top`
rather than `value` because it is only the one that came first — `{ bug: 0.34, other: 0.33 }` has a
top too. Reading it skips the uncertainty check, on purpose and visibly, the way `unwrap` does.

## Providers

```ts
client({ provider: "cloudflare", accountId, apiKey }); // CLOUDFLARE_ACCOUNT_ID, CLOUDFLARE_API_TOKEN
client({ provider: "typesafe", apiKey }); //             TYPESAFE_API_KEY
```

Keys fall back to those environment variables, read at call time — importing this package runs
nothing, which is what `sideEffects: false` promises.

The Cloudflare provider is built from Cloudflare's documented wire format. One detail is not yet
confirmed against a live response: whether the REST body arrives inside Cloudflare's `{ result }`
envelope. It is recorded as unverified in [`docs/jev-api.md`](./docs/jev-api.md) and will be settled
by the first real call.

## Failures

A refused request throws `ApiError` with its `status` and parsed `body`. Rate limits (`429`) and
server faults (`5xx`) are retried with exponential backoff, honouring `Retry-After`; anything you got
wrong is not retried, because trying again cannot help.

```ts
client({ …, retry: { attempts: 3, baseDelay: 500 } });
await jev.ask(ticket, questions, { signal });
```

## Inside

Seven small modules, no cycles, nothing exported that is not part of the public surface.

```mermaid
flowchart TD
    index["<b>index.ts</b><br/>public surface"]
    question["<b>question.ts</b><br/>is · choice · score<br/>tagged-template builders"]
    client["<b>client.ts</b><br/>client() · ask()<br/>request → answers"]
    answer["<b>answer.ts</b><br/>answers · decide()<br/>confidence gating"]
    provider["<b>provider.ts</b><br/>typesafe · cloudflare<br/>wire shapes"]
    retry["<b>retry.ts</b><br/>backoff · 429 / 5xx"]
    error["<b>error.ts</b><br/>ApiError"]

    index --> question
    index --> client
    index --> answer
    client --> question
    client --> answer
    client --> provider
    client --> retry
    retry --> error
```

## Types are the point

This library exists because a type can make you handle something. The strictness is not decoration:

| Guarantee                               | How                                                                         |
| --------------------------------------- | --------------------------------------------------------------------------- |
| Every branch handled, `unsure` included | A mapped handler type over `keyof criteria \| "unsure"`, all required       |
| A stale branch cannot linger            | `Record<Exclude<keyof H, …>, never>` rejects a key that is not a branch     |
| Labels are your literals, not `string`  | `infer O extends Options` carries the question's options into its answer    |
| A rubric keeps its levels               | A `const` type parameter keeps `score` levels a tuple instead of `string[]` |
| Sync branches beside an async one       | `ReturnType<H[keyof H]>` returns their union instead of forcing agreement   |
| A forgotten `await` is caught           | The union keeps a `Promise` in it, which `no-floating-promises` keys on     |
| Invalid client config cannot be written | A discriminated union: `cloudflare` needs `accountId`, `typesafe` does not  |

`tsconfig` runs `strict` plus `exactOptionalPropertyTypes`, `noUncheckedIndexedAccess`,
`noPropertyAccessFromIndexSignature`, `noImplicitReturns`, `noFallthroughCasesInSwitch`,
`noUnusedLocals`, `noUnusedParameters` and `erasableSyntaxOnly`. There is no `any` and no `!` in
`src`; the few `as` casts sit at wire boundaries and each carries a comment stating its guarantee.

Tests are written failing first, and type-level behaviour is tested too: a `@ts-expect-error` that
stops erroring breaks the build, so "this must not compile" is a real, verifiable test.

```sh
pnpm run check    # oxlint → type-aware lint → tsc --noEmit → vitest with coverage
pnpm run verify   # check → build → are-the-types-wrong
```

`publint` and `@arethetypeswrong/cli` gate what gets published, so the package's `exports` and its
declarations are verified to resolve before a release, not after.

## What this does not claim

Jev's probabilities are what the model reported. They are **not** independently established as
calibrated: one reproducible third-party benchmark measured worse accuracy _and_ worse calibration
than a small frontier model on its task. Making you handle uncertainty is the whole point precisely
because the number cannot be trusted blindly. The evidence, and every API fact this library relies
on, is recorded with its source and the date it was checked in [`docs/jev-api.md`](./docs/jev-api.md).

## License

[MIT](./LICENSE)
