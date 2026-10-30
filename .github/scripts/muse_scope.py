"""Đọc `git diff -U0` của một phiếu MR-*.md từ stdin; exit 1 nếu có dòng sửa ngoài phạm vi Muse.

Được phép: dòng `status: …`, `assignee: …`, dòng `> MUSE-…` (thêm/bớt), và ô tick
`- [ ] X` ↔ `- [x] X` với phần chữ X giữ nguyên.
"""
import re
import sys

ALLOWED = re.compile(r"^(status: |assignee: |> MUSE-)")
BOX = re.compile(r"^- \[[ x]\] (.*)$")

removed, added, bad = [], [], []
in_hunk = False  # chỉ bỏ qua dòng tiêu đề NGOÀI hunk; trong hunk mọi dòng +/- đều bị kiểm
for line in sys.stdin.read().splitlines():
    if line.startswith("diff --git"):
        in_hunk = False
        continue
    if line.startswith("@@"):
        in_hunk = True
        continue
    if not in_hunk:
        continue  # tiêu đề file: index, ---, +++, new file, rename…
    if not line or line[0] not in "+-":
        continue
    sign, body = line[0], line[1:]
    if ALLOWED.match(body):
        continue
    m = BOX.match(body)
    if m:
        (removed if sign == "-" else added).append(m.group(1))
        continue
    bad.append(line)

# ô tick: chữ phía sau phải giữ nguyên (chỉ đổi [ ] ↔ [x])
if sorted(removed) != sorted(added):
    bad.append("ô tick bị đổi chữ hoặc thêm/bớt dòng")
for b in bad:
    print(b)
sys.exit(1 if bad else 0)
