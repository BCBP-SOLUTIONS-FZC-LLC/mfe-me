#!/usr/bin/env bash
# PostToolUse (Edit|Write|MultiEdit): run the test that pins the edited file, so a rule or a mapper that no longer
# does what its test says shows now, not at the end. Only the files below have a one-to-one test; anything
# else is covered by the stop gate and CI. Exit 2 shows a failure to Claude.
set -uo pipefail
f=$(jq -r '.tool_input.file_path // empty')
[ -n "$f" ] || exit 0
root="${CLAUDE_PROJECT_DIR:-$PWD}"
case "$f" in "$root"/*) ;; *) exit 0 ;; esac
rel=${f#"$root"/}
case "$rel" in
  src/domain/rules/*) t="test/unit/domain/rule-paths.test.ts" ;;
  src/domain/value-objects/*) t="test/unit/domain/value-objects.test.ts" ;;
  src/infrastructure/api/mappers.ts | src/infrastructure/api/userProfile.ts | src/infrastructure/api/delegation.ts | src/infrastructure/api/orgDirectory.ts) t="test/contract" ;;
  src/infrastructure/api/problem.ts) t="test/unit/infrastructure/problem.test.ts" ;;
  src/application/use-cases/*) t="test/unit/application" ;;
  src/infrastructure/telemetry/* | src/domain/events/*) t="test/unit/metrics" ;;
  src/infrastructure/configuration/locales/*) t="test/unit/i18n" ;;
  *) exit 0 ;;
esac
cd "$root" || exit 0
if ! out=$(timeout 100 npx --no-install rstest run "$t" 2>&1); then
  echo "The test for $rel fails ($t):" >&2
  printf '%s' "$out" | grep -E '"fullName"|"message"|AssertionError' | head -12 >&2
  exit 2
fi
exit 0
