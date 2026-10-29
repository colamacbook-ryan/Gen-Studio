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
# cú pháp mọi script bash
for f in install.sh cli/genstudio tools/*.sh; do
  [[ -f "$f" ]] || continue
  bash -n "$f" 2>/dev/null && ok "bash -n $f" || bad "lỗi cú pháp bash: $f"
done
# test hợp đồng sidecar giọng offline (Python thuần, không cần model/numpy/mạng — gói L)
if [[ -f voice/test_server.py ]]; then
  if command -v python3 >/dev/null 2>&1; then
    pyout="$(mktemp)"
    if python3 -m unittest discover -s voice -p 'test_*.py' >"$pyout" 2>&1; then ok "python3 -m unittest voice/ ($(grep -oE 'Ran [0-9]+ tests' "$pyout"))"; else tail -30 "$pyout"; bad "test sidecar giọng offline đỏ"; fi
    rm -f "$pyout"
  else bad "thiếu python3 để chạy voice/test_server.py"; fi
fi
# test Node (bỏ qua êm nếu chưa có thư mục test)
if [[ -d test ]] && ls test/*.test.js >/dev/null 2>&1; then
  # in đúng lần chạy đỏ (chạy lại để in sẽ che test chập chờn)
  out="$(mktemp)"
  # nhiều file test mở Chromium thật: giới hạn song song + chờ khởi động lâu hơn để máy 4 nhân không quá tải
  if GS_CHROMIUM_START_MS="${GS_CHROMIUM_START_MS:-60000}" node --test --test-concurrency="${GS_TEST_CONCURRENCY:-2}" test/*.test.js >"$out" 2>&1; then ok "node --test test/*.test.js"
  else grep -E -A30 '^not ok' "$out" | head -120; tail -12 "$out"; bad "node --test đỏ"; fi
  rm -f "$out"
else
  ok "chưa có test/ — bỏ qua node --test"
fi
exit $fail
