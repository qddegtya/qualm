#!/usr/bin/env bash
# Packs the tarball and consumes it the way a user would: installed by npm and by pnpm, then
# imported as ESM, required as CJS, and resolved by tsc under node16 from both a .mts and a .cts
# file. Anything that works only because we are inside this repo fails here.
set -euo pipefail

root="$(cd "$(dirname "$0")/.." && pwd)"
work="$(mktemp -d)"
trap 'rm -rf "$work"' EXIT

cd "$root"
pnpm run build >/dev/null 2>&1
# `npm pack` runs prepack, whose build log also lands on stdout; the filename is the last line.
tarball="$work/$(cd "$work" && npm pack "$root" --silent 2>/dev/null | tail -1)"
name="$(node -p "require('$root/package.json').name")"

write_consumer() {
  cat > package.json <<JSON
{ "name": "consumer", "private": true, "version": "1.0.0" }
JSON

  cat > esm.mjs <<JS
import { ApiError, choice, client, is, score } from "$name";
const exported = { client, choice, is, score, ApiError };
const missing = Object.keys(exported).filter((k) => exported[k] === undefined);
if (missing.length) throw new Error("ESM export missing: " + missing.join(", "));
if (is\`works\`.type !== "noul") throw new Error("ESM: is() built the wrong question");
if (choice\`pick\`({ a: null, b: null }).criteria.a !== null) throw new Error("ESM: choice() broken");
if (score\`how much\`(["low", "high"]).criteria.length !== 2) throw new Error("ESM: score() broken");
if (!(new ApiError(429, {}) instanceof Error)) throw new Error("ESM: ApiError is not an Error");
JS

  cat > cjs.cjs <<JS
const { ApiError, choice, client, is, score } = require("$name");
const exported = { client, choice, is, score, ApiError };
const missing = Object.keys(exported).filter((k) => exported[k] === undefined);
if (missing.length) throw new Error("CJS export missing: " + missing.join(", "));
if (is\`works\`.type !== "noul") throw new Error("CJS: is() built the wrong question");
if (typeof client !== "function") throw new Error("CJS: client is not callable");
if (!(new ApiError(500, {}) instanceof Error)) throw new Error("CJS: ApiError is not an Error");
JS

  cat > types.mts <<TS
import { choice, client, type ChoiceAnswer } from "$name";
const q = choice\`pick\`({ bug: "broken", other: null });
const label: "bug" | "other" = q.criteria.other === null ? "other" : "bug";
export const made: typeof client = client;
export type Answer = ChoiceAnswer<typeof q.criteria>;
export const chosen = label;
TS

  cat > types.cts <<TS
import { choice, client, type ChoiceAnswer } from "$name";
const q = choice\`pick\`({ bug: "broken", other: null });
export const made: typeof client = client;
export type Answer = ChoiceAnswer<typeof q.criteria>;
TS
}

for manager in npm pnpm; do
  dir="$work/$manager"
  mkdir -p "$dir"
  cd "$dir"
  write_consumer

  case "$manager" in
    npm) npm install "$tarball" --silent --no-audit --no-fund ;;
    pnpm) pnpm add "$tarball" --silent --ignore-workspace >/dev/null ;;
  esac

  node esm.mjs
  node cjs.cjs
  "$root/node_modules/.bin/tsc" --noEmit --strict --skipLibCheck \
    --module nodenext --moduleResolution nodenext --target es2023 --lib es2023,dom \
    --ignoreConfig types.mts types.cts
  printf '  %-5s install  →  ESM import ok · CJS require ok · types (nodenext, .mts + .cts) ok\n' "$manager"
done
