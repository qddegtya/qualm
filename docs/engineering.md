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

## Releasing

```sh
pnpm run release          # first release, or re-cut the version already in package.json
pnpm run release patch    # 1.0.0 -> 1.0.1
pnpm run release minor    # 1.0.0 -> 1.1.0
pnpm run release major    # 1.0.0 -> 2.0.0
pnpm run release 1.4.2    # an explicit version
pnpm run release patch 123456   # trailing argument is a 2FA one-time password
```

One command does the whole thing: it refuses unless you are on `main` with a clean tree in sync with
origin and logged in to npm, runs `verify`, then `npm version` to bump, commit and tag, then
publishes, then pushes the commit and the tag together. Version, tag and published artifact always
agree, so any release can be traced back to the exact code it was cut from.

With no argument it releases the version already in `package.json`, but only after checking the
registry that this version has never been published — which is what makes the very first release
work without a pointless bump, while a second attempt at the same version stops instead of
silently re-publishing.

The version commit is typed `build(release)`. `chore` would also pass commitlint, but only because
it exempts any commit whose subject is a bare version number — relying on that exemption would mean
`chore(release): prepare 1.0.0` suddenly failing. `build` is in the allowed Angular types on its own
merits, so the message stays valid whatever the subject says.

Nothing is pushed until the registry confirms the version is really there. Publishing and pushing
are two operations and either can fail on its own, so the script asks npm for the version it just
published before it lets the tag leave the machine. A tag that reaches origin while the publish did
not reach npm claims a release nobody can install, which is the one outcome this whole script exists
to prevent.

If `npm publish` fails — a mistyped 2FA code is the usual reason — the commit and tag are local
only. Undo with `git tag -d v<version> && git reset --hard origin/main` and start again, passing the
one-time password as the second argument.

## Accepted exceptions

**The library supports Node 20; the build does not.** tsdown loads `tsdown.config.ts` through
`unrun`, which Node 20 cannot do without native TypeScript stripping (added in 22.6). Lint, typecheck
and the whole test suite pass on Node 20, so `engines` stays at `>=20` — that field describes what
consumers need, and consumers do not build. CI therefore runs `check` across 20, 22 and 24 and
builds only on 24.

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
