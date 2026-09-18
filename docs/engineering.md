# Engineering conventions

Toolchain, gates and the exceptions we have deliberately accepted. Behavioural rules for writing
code live in `AGENTS.md`; notes on the remote API live in `docs/jev-api.md`.

## Toolchain

| Concern          | Tool                  | Installed | Why this one                                                      |
| ---------------- | --------------------- | --------- | ----------------------------------------------------------------- |
| Language         | TypeScript            | 7.0.2     | The native compiler, and the current `latest` tag.                |
| Bundle + types   | tsdown                | 0.23.0    | Rolldown/Oxc, by VoidZero. ESM-first, and it runs publint for us. |
| Test             | Vitest                | 5.0.1     | With v8 coverage.                                                 |
| Lint             | oxlint                | 1.83.0    | Same Oxc toolchain as the bundler.                                |
| Format           | Prettier              | 3.9.8     |                                                                   |
| Package metadata | publint               | 0.3.24    | Checks `exports`, fields and file layout.                         |
| Type resolution  | @arethetypeswrong/cli | 0.18.5    | Checks the published types actually resolve.                      |

publint and attw check different things and both are required. publint has already caught a real
bug here: `exports` pointed at `./dist/index.js` while tsdown emits `.mjs`.

## Gates

`pnpm run check` is the bar for any change: oxlint, the type-aware pass, Prettier, `tsc --noEmit`,
and Vitest with coverage. `pnpm run verify` adds the build and attw, and is the bar for publishing.

**The type-aware pass is scoped on purpose.** `lint:types` allows every rule and then denies exactly
two — `no-floating-promises` and `no-misused-promises`. Turning on the whole type-aware set instead
produces mostly noise here: `prefer-readonly-parameter-types` wants a readonly `TemplateStringsArray`,
and `no-unsafe-type-assertion` flags the handful of boundary casts that already carry a comment
explaining their guarantee. The two promise rules earn their place because `decide` returns a union
such as `void | Promise<string>` when one branch escalates, and a forgotten `await` there silently
turns an escalation into fire-and-forget. A `@ts-expect-error` test pins the promise inside that
union, so the rule cannot quietly lose the type it keys on.

Coverage thresholds sit at 85% in `vitest.config.ts`. They exist to catch a file nobody tested. See
`AGENTS.md` for why that is a floor and not a goal.

## Accepted exceptions

**ESM only, `node >= 20`.** No CJS build. attw therefore reports `no-resolution` (node10) and
`cjs-resolves-to-esm` (node16 from CJS). Both are consequences of that decision, not defects, so the
`attw` script passes them as explicit `--ignore-rules` rather than hiding them in config. A
`package.json` `attw.ignoreRules` field was tried first and is not honoured — only the CLI flags are.
Revisit if a real CJS consumer appears.

**tsdown warns that the TypeScript 7 API is experimental.** Declaration emit was verified by hand
against `const` type parameters, `infer ... extends`, nested conditional types and discriminated
unions using `?: never`; every one survived intact into the emitted `.d.mts`. Re-verify if the output
ever looks wrong.

## Registered type features

Every advanced type feature used in `src/` is listed here with what it buys. An unregistered one is a
review failure.

| Feature                              | Since  | Bought us                                                                                                                                                                                                                                                                                                                                                                                                                           |
| ------------------------------------ | ------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `const` type parameter               | TS 5.0 | On `score`, keeps the levels a readonly tuple so their positions and literal values survive; without it they widen to `string[]` and the rubric stops being checkable. Pinned by a `@ts-expect-error` test: remove the `const` and that test stops compiling. **Deliberately not used on `choice`** — object-literal keys stay literal without it, and we never read the description strings as types, so there it was dead weight. |
| `infer X extends C`                  | TS 4.8 | `AnswerFor` recovers a question's options or levels and carries them into its answer, so `answer.top` is the union of your own labels rather than `string`. The `extends` clause is what lets the recovered type be used as a constraint without a second cast.                                                                                                                                                                     |
| `Record<Exclude<keyof H, K>, never>` | —      | Rejects a handler key that is not a branch. Without it a stale handler left behind after a label is removed compiles and silently never runs. The cost is an unhelpful message on that one case (`Type '() => number' is not assignable to type 'never'`), though it does point at the right line.                                                                                                                                  |
| `ReturnType<H[keyof H]>`             | —      | Makes `decide` return the union of its branches' return types instead of forcing them all to agree. Without it a synchronous branch beside an `async unsure` branch fails to compile — which is the library's central use, so a single shared type parameter was not an option.                                                                                                                                                     |
| `@ts-expect-error` in tests          | TS 3.9 | Turns "this wrong call must not compile" into a real test that fails first: if the error stops happening, `tsc` reports the directive as unused and the build breaks.                                                                                                                                                                                                                                                               |
