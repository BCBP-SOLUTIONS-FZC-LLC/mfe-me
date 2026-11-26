#!/usr/bin/env bash
# Moves the three platform packages to one exact version, together (CLAUDE.md: SDK upgrades), sets the
# SDK peer range to ^<version>, then checks the pins. Usage: bump.sh <version>
set -euo pipefail
v=${1:?usage: bump.sh <version, e.g. 1.0.0-alpha.11>}
# An exact version only (what check-sdk-pins.mjs requires), checked before anything is installed.
[[ "$v" =~ ^[0-9]+\.[0-9]+\.[0-9]+(-[0-9A-Za-z.]+)?$ ]] || { echo "✗ \"$v\" is not an exact version (e.g. 1.0.0-alpha.11)" >&2; exit 1; }
cd "$(git rev-parse --show-toplevel)"
[ -n "${NODE_AUTH_TOKEN:-}" ] || export NODE_AUTH_TOKEN=$(gh auth token)

s=@bcbp-solutions-fzc-llc
for p in frontend-sdk webpack-preset eslint-plugin; do
  npm view "$s/$p@$v" version >/dev/null || { echo "✗ $s/$p@$v is not published" >&2; exit 1; }
done
# The SDK is a peer (the shell provides it) and a dev dependency (types, tests, the standalone build).
npm install --save-exact --save-dev "$s/frontend-sdk@$v" "$s/webpack-preset@$v" "$s/eslint-plugin@$v"
node -e "
const fs=require('fs');const p=JSON.parse(fs.readFileSync('package.json','utf8'));
p.peerDependencies={...p.peerDependencies,'$s/frontend-sdk':'^$v'};
fs.writeFileSync('package.json',JSON.stringify(p,null,2)+'\n');"
npm install --package-lock-only >/dev/null
node .claude/hooks/check-sdk-pins.mjs package.json
echo "✓ installed $v; next: lint, arch-lint, tsc, test:ci, contracts:check, build, test:browser, then the real shell (SKILL.md step 5)"
