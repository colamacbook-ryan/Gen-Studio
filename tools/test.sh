#!/usr/bin/env bash
# Bộ kiểm repo — chạy trước mọi lần đẩy (CLAUDE.md). Mở rộng dần khi có code.
set -euo pipefail
cd "$(dirname "$0")/.."
fail=0
ok() { printf '  ✓ %s\n' "$1"; }
bad() { printf '  ✗ %s\n' "$1"; fail=1; }

echo "Gen-Studio · kiểm repo"
grep -q "All rights reserved" LICENSE && ! grep -qi "apache license" LICENSE && ok "LICENSE là Gen Labs (không phải Apache)" || bad "LICENSE phải là © Gen Labs — All rights reserved"
[[ "$(cat VERSION)" =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]] && ok "VERSION hợp lệ ($(cat VERSION))" || bad "VERSION phải dạng x.y.z"
grep -q "^## $(cat VERSION) " CHANGELOG.md && ok "CHANGELOG có mục cho VERSION" || bad "CHANGELOG thiếu mục ## $(cat VERSION)"
# không secret trong repo (khoá Google kiểu AIza…/AQ.…, khoá OpenAI/Anthropic, private key)
if git ls-files -z | xargs -0 grep -nE 'AIza[0-9A-Za-z_-]{30,}|AQ\.[A-Za-z0-9_-]{30,}|sk-(ant-)?[A-Za-z0-9_-]{20,}|-----BEGIN [A-Z ]*PRIVATE KEY-----' -- 2>/dev/null | grep -v '^tools/test.sh:'; then bad "phát hiện chuỗi giống secret"; else ok "không có secret"; fi
# .env không được commit
git ls-files | grep -qE '(^|/)\.env$' && bad ".env bị commit" || ok ".env không bị commit"
# link tương đối trong tài liệu phải tồn tại
while IFS= read -r f; do
  while IFS= read -r l; do
    t="${l%%#*}"; [[ -z "$t" || "$t" =~ ^[a-z]+: ]] && continue
    [[ -e "$(dirname "$f")/$t" ]] || bad "link chết trong $f: $l"
  done < <(grep -oE '\]\([^)]+\)' "$f" | sed -E 's/^\]\(([^)]+)\)$/\1/')
done < <(git ls-files '*.md')
ok "đã kiểm link tài liệu"
exit $fail
