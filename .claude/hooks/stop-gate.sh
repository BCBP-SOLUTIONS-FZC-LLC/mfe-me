#!/usr/bin/env bash
# Stop: before Claude hands the turn back, check what only the whole project shows (post-edit.sh checks
# one file at a time) and make Claude fix it now instead of the user finding it in CI.
#   1. typecheck (tsc --noEmit over src/) and arch-lint (.dependency-cruiser.cjs) are green;
#   2. CHANGELOG.md was touched after the last change to what changelog-check.yml watches (src/,
#      Dockerfile, nginx/, rsbuild.config.ts, index.html, package.json).
# Either problem blocks the stop once with the reason (JSON decision). `stop_hook_active` is set on the
# turn that follows a block, so a reminder never loops: the second time the turn ends regardless.
set -uo pipefail

input=$(cat)
active=$(printf '%s' "$input" | jq -r '.stop_hook_active // false')
[ "$active" = "true" ] && exit 0
root="${CLAUDE_PROJECT_DIR:-$PWD}"
cd "$root" || exit 0

problems=()

# 1. Only when something under src/ or test/ changed in the last day (a session that only talked does not pay for it).
if [ -n "$(find src test -type f -mtime -1 2>/dev/null | head -1)" ]; then
  if ! out=$(npx --no-install tsc --noEmit 2>&1); then
    problems+=("Typecheck (tsc --noEmit) fails:\n$(printf '%s' "$out" | grep -v '^npm ' | head -20)")
  fi
  if [ -f .dependency-cruiser.cjs ] && ! out=$(npx --no-install depcruise src --config .dependency-cruiser.cjs --output-type err 2>&1); then
    problems+=("Architecture lint (npm run arch-lint) fails:\n$(printf '%s' "$out" | head -20)")
  fi
fi

# 2. CHANGELOG.md older than a watched file: the changelog check would fail the PR.
if [ -f CHANGELOG.md ]; then
  stale=$(find src Dockerfile nginx rsbuild.config.ts index.html package.json -type f -newer CHANGELOG.md ! -name '*.d.ts' 2>/dev/null | head -3)
  if [ -n "$stale" ]; then
    problems+=("CHANGELOG.md was not updated after: $(printf '%s' "$stale" | tr '\n' ' ')\nAdd an entry under [Unreleased] (a bold lead, what changed and why, files and tests; *(Previously: …)* for a behaviour change), or say why none is needed.")
  fi
fi

[ ${#problems[@]} -eq 0 ] && exit 0
reason=$(printf '%b\n\n' "${problems[@]}")
jq -n --arg r "Before finishing: $reason" '{decision: "block", reason: $r}'
exit 0
