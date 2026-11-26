#!/usr/bin/env bash
# PreToolUse (Edit|Write|MultiEdit|NotebookEdit): block edits to the sibling repositories this one reads
# but never modifies, to installed or generated output, to the pinned IAM Swagger files, and to the
# developer's local env files (.claude/CLAUDE.md, "Critical Rules"). Exit 2 blocks the tool call and
# shows the reason to Claude.
set -euo pipefail

f=$(jq -r '.tool_input.file_path // .tool_input.notebook_path // empty')
[ -n "$f" ] || exit 0
root="${CLAUDE_PROJECT_DIR:-$PWD}"

block() {
  echo "Blocked: $1" >&2
  exit 2
}

# Compare canonical paths: resolve `..`, `.` and symlinks (the target need not exist yet), and
# lower-case both sides, since the default macOS volume ignores case.
canon() { python3 -c 'import os,sys; print(os.path.realpath(os.path.abspath(sys.argv[1])).lower())' "$1"; }
case "$f" in /*) ;; *) f="$root/$f" ;; esac
cf=$(canon "$f")
croot=$(canon "$root")

# Siblings are only "sibling" outside this repository's own tree.
case "$cf" in "$croot"/*) ;; *)
  case "$cf" in
    */web-shell/*)
      block "$f is in web-shell, which another team/session owns. Change it in that repository's own PR (this remote's changes to the shell go in a handoff under docs/lld/)." ;;
    */mfe-dashboard/*)
      block "$f is in mfe-dashboard, which another team/session owns. Change it in that repository's own PR." ;;
    */platform-reactcommon/*)
      block "$f is in platform-reactcommon (the SDK). Change it there in its own PR, release it, then upgrade all three packages here (.claude/operations.md, SDK upgrade checklist)." ;;
  esac
  exit 0 ;;
esac

case "$(basename "$cf")" in
  .env | docker.local.env) block "$f is the developer's local, untracked config. Ask the user to edit it." ;;
esac

rel=${cf#"$croot"/}
case "$rel" in
  node_modules/* | dist/* | coverage/* | test-results/* | playwright-report/*) block "$rel is installed or generated output. Change the source and rebuild." ;;
  test/contract/swagger/*.yaml) block "$rel is a pinned copy of an IAM service's Swagger. Copy the new file from the IAM docs, read the diff, then re-pin with 'npm run contracts:pin' (the pin is PIN.json's SHA-256)." ;;
  test/contract/swagger/PIN.json) block "$rel is written by 'npm run contracts:pin' after the Swagger diff has been read; do not edit it by hand." ;;
esac
exit 0
