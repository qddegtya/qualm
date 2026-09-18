# qualm

A zero-dependency TypeScript library for typed decisions from a System One model (TypeSafe's Jev).

**The thesis every design decision follows from:** an uncertain answer is a different type from a
confident one, and the type system makes you handle it. A judgment that collapses to `boolean` or to
a bare `argmax` throws away the only signal that says when to escalate. This library never does that.

## Source of truth

Code is the only source of truth, in this order:

1. **This repo's code and tests.**
2. **A dependency's own source in `node_modules`**, when its behaviour is in question — not its
   README, not a blog post, not recall.
3. **The vendor's official documentation**, only for a remote API whose code we cannot read. Every
   such fact is written down with a link and the date it was checked, in `docs/jev-api.md`.

A third-party package wrapping the same API is **not** a source of truth. Read it for design ideas;
never copy its constraints. Its limits are that author's choices, and they have already been wrong
once: a community client validates score levels as 2–10, while the official docs state a minimum of
two and no maximum at all.

Do not guess an API shape. Unverified means unverified — say so instead of writing it down.

## Commands

```sh
pnpm run check      # lint + typecheck + test. Nothing is "done" until this passes.
pnpm run verify     # check + build + attw. Run before publishing.
pnpm run dev        # vitest watch
pnpm run format     # oxlint --fix + prettier --write
```

## Writing code

The linter, formatter and `tsconfig` already enforce style and strictness; do not loosen a flag to
make code compile, and do not restate their rules here. What they cannot enforce:

- **No `any`, no non-null `!`.** `as` only at a boundary the compiler cannot see (parsing a response,
  narrowing after a runtime check), and every one carries a one-line comment stating its guarantee.
- **Public types must read on their own.** Someone hovering a symbol in their editor should
  understand it without opening this repo. Give each step of a conditional-type chain a named alias
  rather than writing one unreadable expression.
- **Register advanced type features** in the table in `docs/engineering.md` with what they buy. A
  type feature earns its place by removing a runtime check or a cast, not by being impressive.
- **Comments say why, never what.** Code needing a "what" comment gets rewritten. No history, no
  attribution, no commented-out code.
- **Nothing speculative.** No abstraction, option or compatibility shim without a caller today.
- **No Node-only APIs in `src/`.** The library must run in Workers, Deno, Bun and the browser.

## Writing tests

- **Write the failing test first.** A test that has never been red has not been shown to test
  anything.
- **Coverage is a floor, not a goal.** The threshold catches an untested file; it is not a target.
  Never write a test whose only purpose is a covered line.
- **Core paths are non-negotiable:** the confident/uncertain narrowing; exhaustiveness of decision
  handlers; threshold and confidence arithmetic at its boundaries (exactly at the threshold, a flat
  distribution, one dominant option); each provider's wire mapping in both directions; every error
  branch.
- **Name a test for the guarantee it makes**, not the function it calls. `"stays unsure when two
options tie"` beats `"decide works"`.
- Test through the public API. Never export something only so a test can reach it.
- A test asserting that a wrong call **fails to compile** is a real test.

## Git

Solo trunk-based, with `main` always releasable and always green.

- **A branch per change** — `feat/…`, `fix/…`, `docs/…`, `chore/…`. Never commit to `main` directly.
- **Rebase onto `main`, merge `--ff-only`.** History stays linear; no merge commits.
- **One commit per logical change.** If the message needs an "and also", it is two commits.
- **`pnpm run check` passes on every commit**, not only at the end of a branch.

The Angular commit format is enforced by commitlint on `commit-msg`, and the allowed scopes live in
`commitlint.config.js`, so neither is repeated here. What the hook cannot check, and you must: the
subject says what changed in the imperative and stays honest about scope, and the body carries the
reasoning whenever the diff does not already show it. A commit that changes behaviour says why the
old behaviour was wrong.

## Further reading

- `docs/engineering.md` — toolchain, gates, accepted exceptions, registered type features.
- `docs/jev-api.md` — cached notes on the remote API, each with a source and a date. Not authoritative.
