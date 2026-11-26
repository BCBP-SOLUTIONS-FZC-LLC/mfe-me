#!/usr/bin/env bash
# Runs mfe-me's gate: the checks CI runs, in order of cost, continuing past a failure so one run
# reports everything. Usage: run-gate.sh [quick|full] [--only name,name]
#   quick (default)  typecheck, lint, arch-lint, contracts, unit/integration/contract/e2e with the 95% coverage gate
#   full             quick + build + browser (Playwright, axe)
# Each step's output goes to $GATE_LOG_DIR (default: a temp directory); the summary names the log and
# prints the last lines of a failure. Exit 1 when any step failed.
set -uo pipefail
cd "$(git rev-parse --show-toplevel)"

mode=quick
only=""
while [ $# -gt 0 ]; do
  case "$1" in
    quick | full) mode=$1 ;;
    --only) shift; only=${1:-} ;;
    *) echo "usage: run-gate.sh [quick|full] [--only typecheck,lint,arch-lint,contracts,test,build,browser]" >&2; exit 2 ;;
  esac
  shift
done

logs=${GATE_LOG_DIR:-$(mktemp -d "${TMPDIR:-/tmp}/mfe-me-gate.XXXXXX")}
mkdir -p "$logs"
results=()
failed=0

want() { [ -z "$only" ] || [[ ",$only," == *",$1,"* ]]; }

run() { # name, command...
  local name=$1; shift
  want "$name" || return 0
  local start=$SECONDS
  if "$@" >"$logs/$name.log" 2>&1; then
    results+=("✓ $name ($((SECONDS - start))s)")
  else
    results+=("✗ $name ($((SECONDS - start))s) → $logs/$name.log")
    failed=1
  fi
}

run typecheck npx --no-install tsc --noEmit
run lint npx --no-install eslint . --max-warnings 0
run arch-lint npm run -s arch-lint
run contracts npm run -s contracts:check
run test npm run -s test:ci
if [ "$mode" = full ]; then
  run build npm run -s build
  # test:browser rebuilds; run it only after a successful build so a build error is reported once.
  if [ -f "$logs/build.log" ] && ! printf '%s\n' "${results[@]}" | grep -q '^✗ build'; then
    run browser npx --no-install playwright test
  fi
fi

echo "mfe-me gate ($mode)"
printf '%s\n' "${results[@]}"
for r in "${results[@]}"; do
  case "$r" in
    "✗ "*)
      name=${r#✗ }; name=${name%% *}
      echo; echo "── $name (last lines)"
      tail -n 25 "$logs/$name.log"
      ;;
  esac
done
if [ -f "$logs/test.log" ]; then
  echo; echo "── coverage"
  grep -E '^(statements|branches|functions|lines):|Coverage is below|Domain layer' "$logs/test.log" || true
fi
exit "$failed"
