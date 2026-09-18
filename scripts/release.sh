#!/usr/bin/env bash
# Cuts a release: verify, bump, tag, publish, push. Refuses to run from a state that would
# produce a tag nobody can trace back to a published version.
#
#   pnpm run release              first release, or re-cut the version already in package.json
#   pnpm run release patch        1.0.0 -> 1.0.1
#   pnpm run release minor        1.0.0 -> 1.1.0
#   pnpm run release major        1.0.0 -> 2.0.0
#   pnpm run release 1.4.2        an explicit version
#   pnpm run release patch 123456 the trailing argument is a 2FA one-time password
set -euo pipefail

root="$(cd "$(dirname "$0")/.." && pwd)"
cd "$root"

bump="${1:-}"
otp="${2:-}"
name="$(node -p "require('./package.json').name")"
current="$(node -p "require('./package.json').version")"

step() { printf '\n\033[1m==>\033[0m %s\n' "$1"; }
die() { printf '\n\033[31mrelease stopped:\033[0m %s\n' "$1" >&2; exit 1; }

step "Checking the working state"
branch="$(git branch --show-current)"
[ "$branch" = "main" ] || die "on branch '$branch'. Releases are cut from main."
[ -z "$(git status --porcelain)" ] || die "the working tree has uncommitted changes."
git fetch --quiet origin main
ahead="$(git rev-list --count origin/main..main)"
behind="$(git rev-list --count main..origin/main)"
[ "$behind" = "0" ] || die "main is $behind commit(s) behind origin. Pull first."
[ "$ahead" = "0" ] || die "main is $ahead commit(s) ahead of origin. Push first."
npm whoami >/dev/null 2>&1 || die "not logged in to npm. Run 'npm login' first."
echo "    main, clean, in sync, npm user $(npm whoami)"

step "Deciding the version"
if [ -z "$bump" ]; then
  if npm view "$name@$current" version >/dev/null 2>&1; then
    die "$name@$current is already published. Pass patch, minor, major or an explicit version."
  fi
  target="$current"
  echo "    $current has never been published; releasing it as it stands"
else
  target="$bump"
  echo "    bumping $current by '$bump'"
fi

step "Verifying"
pnpm run verify

step "Tagging"
if [ -z "$bump" ]; then
  npm version "$target" --allow-same-version --message "chore(release): %s" >/dev/null
else
  npm version "$target" --message "chore(release): %s" >/dev/null
fi
released="$(node -p "require('./package.json').version")"
echo "    v$released committed and tagged"

step "Publishing $name@$released"
if [ -n "$otp" ]; then npm publish --otp "$otp"; else npm publish; fi

step "Pushing"
git push --follow-tags origin main

printf '\n\033[32mReleased %s@%s\033[0m\n' "$name" "$released"
printf 'https://www.npmjs.com/package/%s\n' "$name"
