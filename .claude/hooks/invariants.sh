#!/usr/bin/env bash
# PostToolUse (Edit|Write|MultiEdit): the repository rules a linter cannot see, checked on the edited src/ file
# (CLAUDE.md "Rules that are easy to break"). Exit 2 shows the problem to Claude to fix now. The same rules are
# enforced in CI by dependency-rules.test.ts and layers.test.ts; this gives the answer at edit time.
set -uo pipefail
f=$(jq -r '.tool_input.file_path // empty')
[ -n "$f" ] || exit 0
root="${CLAUDE_PROJECT_DIR:-$PWD}"
case "$f" in "$root"/src/*.ts | "$root"/src/*.tsx) ;; *) exit 0 ;; esac
[ -f "$f" ] || exit 0
rel=${f#"$root"/}
# Code without comments, so a rule is not tripped by the comment that explains it.
code=$(sed -E 's#^[[:space:]]*(//|/?\*).*$##; s#/\*.*\*/##g' "$f")
problems=()
hit() { printf '%s' "$code" | grep -Eq "$1"; }

[ "$rel" != "src/infrastructure/api/signatureStorage.ts" ] && hit '\bfetch\(|XMLHttpRequest' && problems+=("fetch/XHR outside signatureStorage.ts: use useApiClient() templates (ADR 0006).")
[ "$rel" != "src/domain/vocabulary.ts" ] && hit "['\"](tenant_owner|tenant_admin|tender_admin)['\"]" && problems+=("role literal outside src/domain/vocabulary.ts: access is a hint through SDK hooks, never a role comparison.")
hit '\bconsole\.(log|info|warn|error|debug)\(' && problems+=("console.*: log with getLogger from the SDK.")
hit 'createObjectURL' && problems+=("blob: URLs are blocked by the platform CSP (img-src 'self' data:): use a data: URL.")
hit "(x-user-id|x-tenant-id|x-tenant-roles|tenant_id:|user_id:)" && case "$rel" in src/infrastructure/api/mappers.ts | src/domain/entities/*) ;; *) problems+=("identity in a request: my ID goes in the path only; never a tenant, user or role in a body, query or header.") ;; esac
hit 'dangerouslySetInnerHTML|\binnerHTML\b|\beval\(' && problems+=("HTML injection or eval: forbidden (CSP, XSS).")
hit '\b(localStorage|sessionStorage|indexedDB)\b' && problems+=("browser storage: this remote stores nothing (LLD §10).")
hit 'new Intl\.|\.toLocale(Date|Time)?String\(' && problems+=("Intl/toLocale*: format with the SDK's formatDate/formatNumber.")
case "$rel" in src/domain/* | src/application/*) hit "from '(react|react-router-dom|@tanstack|@bcbp)" && problems+=("domain/ and application/ import no framework or SDK.") ;; esac
case "$rel" in src/presentation/*) hit "from '(\.\./)+(infrastructure|app)/" && problems+=("presentation never imports infrastructure or app: use the services provider.") ;; esac
case "$rel" in src/presentation/pages/* | src/presentation/components/*) hit "from '@tanstack/react-query'" && problems+=("TanStack Query only in app/ and presentation/features/: go through a feature hook.") ;; esac

if [ ${#problems[@]} -gt 0 ]; then
  echo "Repository rules broken in $rel:" >&2
  printf ' - %s\n' "${problems[@]}" >&2
  exit 2
fi
exit 0
