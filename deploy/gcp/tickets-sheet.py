#!/usr/bin/env python3
# Quản lý phiếu công việc của Muse trên Google Sheet. © 2026 Gen Labs — All rights reserved.
# Chạy dưới user genstudio (venv do tickets-setup.sh tạo):
#   /opt/gs-deploy/venv/bin/python /opt/gs-deploy/tickets-sheet.py init|seed|sync|status
# Cần: GS_TICKETS_SA_FILE (khoá tài khoản dịch vụ, mặc định /opt/gs-deploy/drive-sa.json, 600, chủ genstudio)
#      đã được chia sẻ quyền Chỉnh sửa (qua thư mục Drive "Muse Workspace") vào Sheet GS_TICKETS_SHEET_ID.
# Đọc phiếu từ GS_LIBRARY_DIR/requests/MR-0{63,64,65,66}-*.md, đối chiếu file đã nộp trong
# GS_LIBRARY_DIR/inbox/** và GS_DATA_INBOX_DIR/** (hàng Drive kéo về qua drive-sync.sh).
from __future__ import annotations

import argparse
import json
import os
import re
import sys
from datetime import datetime, timezone
from pathlib import Path

from google.oauth2 import service_account
from googleapiclient.discovery import build

SA_FILE = os.environ.get("GS_TICKETS_SA_FILE", "/opt/gs-deploy/drive-sa.json")
SHEET_ID = os.environ.get("GS_TICKETS_SHEET_ID", "16riWP4rvrsb4jrD0XSwN-krTedYu4H7LapljFxI0--E")
LIBRARY_DIR = Path(os.environ.get("GS_LIBRARY_DIR", "/opt/gen-studio/library"))
DATA_INBOX_DIR = Path(os.environ.get("GS_DATA_INBOX_DIR", "/opt/gen-studio/data/inbox/drive"))
# 0.3.0-C.2: data/kit-status.json do `genstudio import` ghi ra (v_kit_coverage, MỘT công thức «ô đạt» — DB-GK-0.1 §13).
KIT_STATUS_FILE = Path(os.environ.get("GS_KIT_STATUS", "/opt/gen-studio/data/kit-status.json"))
SCOPES = ["https://www.googleapis.com/auth/spreadsheets"]

SHEET_TITLE = "Gen-Studio — Phiếu Muse"
TAB_PHIEU = "Phieu"
TAB_HUONGDAN = "HuongDan"
HEADER = [
    "Mã phiếu", "Nhân vật", "Mã ô", "Tên VI", "Tên EN", "Mô tả/prompt",
    "Chuẩn (kích thước, nền)", "Trạng thái", "Người làm", "Link file Drive",
    "Ghi chú kiểm", "Cập nhật lúc",
]
STATUSES = ["Mới", "Đang làm", "Chờ kiểm", "Đạt", "Làm lại", "Bỏ"]
STATUS_COLOR = {
    "Mới": (0.953, 0.953, 0.953),
    "Đang làm": (0.812, 0.886, 0.953),
    "Chờ kiểm": (1.0, 0.949, 0.8),
    "Đạt": (0.851, 0.918, 0.827),
    "Làm lại": (0.957, 0.8, 0.8),
    "Bỏ": (0.851, 0.851, 0.851),
}
IMG_EXT = (".png", ".jpg", ".jpeg", ".webp")

# 9 ô MR-063 mà Ryan dặn không tạo lại (xem docs/handoff) — cố định theo brief 01/11/2026. Mã ô ĐẦY ĐỦ
# (nhi.expr.NN — cùng quy ước với docs/MUSE-CONNECT.md/kit-map.js từ bổ sung cổng C.2 mục 1, không còn "nhi-08").
MR063_BO = {"nhi.expr.08", "nhi.expr.16", "nhi.expr.17", "nhi.expr.20", "nhi.expr.22", "nhi.expr.23", "nhi.expr.33", "nhi.expr.34", "nhi.expr.37"}
GHI_CHU_BO = "CO dặn không tạo lại"


# ---------- quy đổi mã rút gọn trong phiếu .md -> mã ô đầy đủ Bộ Neo ----------
# C.2 (Gen, bổ sung cổng, mục 1): HAI quy ước tên file từng loại trừ nhau (docs dặn Muse nộp `<mã ô>.<ext>` như
# `nhi.expr.08.png`; phiếu MR-063/065/066.md tự viết mã RÚT GỌN `nhi-08` trong markdown; tickets-sheet.py trước
# đây lấy thẳng mã rút gọn làm cột "Mã ô" trên Sheet ⇒ KHÔNG BAO GIỜ khớp file đặt tên theo chuẩn). CHỐT: cột
# "Mã ô" trên Sheet = mã ô ĐẦY ĐỦ (để HuongDan + docs cùng nói một quy ước); hàm này quy đổi mã rút gọn → đầy đủ.
def to_slot_code(ticket_id: str, raw_code: str) -> str | None:
    if ticket_id == "MR-064":  # fx-01-sweat-drop... -> fx.manpu.01 (thứ tự trong MR-064.md khớp STANDARD-KIT-v1 §4.3)
        m = re.match(r"^fx-(\d{2})-", raw_code)
        return f"fx.manpu.{m.group(1)}" if m else None
    m = re.match(r"^([a-z]+)-(\d{2})$", raw_code)
    if not m:
        return None
    subject, n = m.group(1), m.group(2)
    if n == "00":
        return None  # ảnh gốc tham chiếu (MR-063 bước 1), không phải một ô
    return f"{subject}.expr.{n}"

# Phiếu nào ứng với nhân vật nào — chỉ 4 phiếu trong phạm vi brief 01/11/2026.
TICKET_CHAR = {"MR-063": "Nhi", "MR-064": "Chung", "MR-065": "Vy", "MR-066": "Ryan"}


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


def sheets_client():
    if not Path(SA_FILE).exists():
        sys.exit(f"✗ Thiếu khoá tài khoản dịch vụ: {SA_FILE}")
    creds = service_account.Credentials.from_service_account_file(SA_FILE, scopes=SCOPES)
    return build("sheets", "v4", credentials=creds, cache_discovery=False)


# ---------- đọc phiếu MR-*.md ----------

def extract_prompt_template(body: str) -> str:
    m = re.search(r"## Lệnh tạo \(prompt\)\s*```\s*(.*?)\s*```", body, re.S)
    return m.group(1).strip() if m else ""


def parse_character_ticket(ticket_id: str, body: str) -> list[dict]:
    """MR-063 / MR-065 / MR-066: 1 ảnh gốc + 40 biểu cảm, có nhóm theo cảm xúc."""
    char_lower = TICKET_CHAR[ticket_id].lower()
    prompt_tpl = extract_prompt_template(body)
    rows = []

    base_m = re.search(rf"`({char_lower}-00-base)\.png`", body)
    if base_m:
        rows.append({
            "ma_o": f"{char_lower}-00", "nhom": "Cơ bản",
            "desc": "neutral, mouth closed (base)",
        })

    section_m = re.search(r"## Danh sách 40 biểu cảm\s*(.*?)\n## ", body, re.S)
    section = section_m.group(1) if section_m else ""
    nhom = ""
    for line in section.splitlines():
        head_m = re.match(r"-\s+\*\*(.+?):\*\*\s*$", line.strip())
        if head_m:
            nhom = head_m.group(1).strip()
            continue
        item_m = re.match(r"-\s*`([a-z0-9]+-\d+)`\s*·\s*(.+)$", line.strip())
        if item_m:
            rows.append({"ma_o": item_m.group(1), "nhom": nhom, "desc": item_m.group(2).strip()})

    out = []
    for r in rows:
        prompt = prompt_tpl.replace("<tên biểu cảm>", r["desc"]) if prompt_tpl else r["desc"]
        # `nhi-00` (ảnh gốc tham chiếu, MR-063 bước 1) KHÔNG phải một ô Bộ Neo (to_slot_code trả None) — vẫn giữ
        # dòng trên Sheet để Muse theo dõi tiến độ, chỉ không quy đổi được sang mã ô đầy đủ (không khớp kit-status.json).
        code = to_slot_code(ticket_id, r["ma_o"]) or r["ma_o"]
        out.append({
            "ma_o": code, "legacy_ma_o": r["ma_o"],
            "ten_vi": r["nhom"],
            "ten_en": r["desc"],
            "prompt": prompt,
            "chuan": "2048×2048, nền phẳng #00B140",
        })
    return out


def parse_overlay_ticket(ticket_id: str, body: str) -> list[dict]:
    """MR-064: ký hiệu cảm xúc, nhiều mục ghép trên 1 dòng, cách nhau bằng ' · '."""
    prompt_tpl = extract_prompt_template(body)
    section_m = re.search(r"## Danh sách \(mỗi ký hiệu.*?\)\s*(.*?)\n## ", body, re.S)
    section = section_m.group(1) if section_m else ""
    out = []
    for line in section.splitlines():
        line = line.strip()
        if not line.startswith("-"):
            continue
        for piece in line.lstrip("-").split("·"):
            m = re.match(r"\s*`([a-z0-9-]+)`\s*(.+?)\s*$", piece)
            if not m:
                continue
            code, desc_vi = m.group(1), m.group(2).strip()
            en = code.split("-", 2)[-1].replace("-", " ")
            prompt = prompt_tpl.replace("<tên ký hiệu>", f"{en} ({desc_vi})") if prompt_tpl else desc_vi
            slot_code = to_slot_code(ticket_id, code) or code
            out.append({
                "ma_o": slot_code, "legacy_ma_o": code, "ten_vi": desc_vi, "ten_en": en, "prompt": prompt,
                "chuan": "1024×1024, nền phẳng #00B140",
            })
    return out


def load_tickets() -> dict[str, list[dict]]:
    """Trả về {mã phiếu: [ô...]} cho MR-063..066."""
    req_dir = LIBRARY_DIR / "requests"
    out: dict[str, list[dict]] = {}
    for ticket_id in sorted(TICKET_CHAR):
        matches = sorted(req_dir.glob(f"{ticket_id}-*.md"))
        if not matches:
            print(f"! chưa thấy phiếu {ticket_id} trong {req_dir}", file=sys.stderr)
            continue
        body = matches[0].read_text(encoding="utf-8")
        if ticket_id == "MR-064":
            items = parse_overlay_ticket(ticket_id, body)
        else:
            items = parse_character_ticket(ticket_id, body)
        if not items:
            print(f"! không đọc được ô nào trong {matches[0].name}", file=sys.stderr)
        out[ticket_id] = items
    return out


# ---------- đối chiếu file đã nộp ----------

def _iter_files(root: Path):
    if not root.is_dir():
        return
    for p in root.rglob("*"):
        if p.is_file() and p.suffix.lower() in IMG_EXT:
            yield p


def find_submitted(ticket_id: str) -> dict[str, Path]:
    """mã ô -> đường dẫn file đầu tiên khớp tên (loại 02_Dang-lam/CHUA-NOP: chưa nộp thật)."""
    found: dict[str, Path] = {}
    roots = []
    for d in DATA_INBOX_DIR.glob("03_Hoan-thanh/*"):
        if ticket_id in d.name:
            roots.append(d)
    for d in LIBRARY_DIR.glob(f"inbox/{ticket_id}-*"):
        if d.is_dir():
            roots.append(d)
    for root in roots:
        for f in _iter_files(root):
            if "CHUA-NOP" in f.parts:
                continue
            if f.stem.endswith("-sheet") or f.name == "preview.jpg":
                continue
            found.setdefault(f.stem, f)
    return found


def link_for(path: Path) -> str:
    try:
        rel = path.relative_to(DATA_INBOX_DIR)
        return f"Muse Workspace/{rel.as_posix()}"
    except ValueError:
        pass
    try:
        rel = path.relative_to(LIBRARY_DIR.parent)
        return rel.as_posix()
    except ValueError:
        return str(path)


def match_ma_o(ma_o: str, submitted: dict[str, Path], legacy_ma_o: str | None = None) -> Path | None:
    # C.2 (mục 1): khớp tên file CHUẨN (stem == mã ô đầy đủ, vd `nhi.expr.08`) TRƯỚC; `legacy_ma_o` (mã rút gọn
    # `nhi-08`) chỉ dự phòng cho hàng đã nộp trước khi chốt quy ước — không phải quy ước mới.
    for stem, path in submitted.items():
        if stem == ma_o or stem.startswith(ma_o + "-"):
            return path
    if legacy_ma_o:
        for stem, path in submitted.items():
            if stem == legacy_ma_o or stem.startswith(legacy_ma_o + "-"):
                return path
    return None


# ---------- Sheets: hạ tầng (sheet/tab/format) ----------

def get_spreadsheet(svc):
    return svc.spreadsheets().get(spreadsheetId=SHEET_ID).execute()


def ensure_tabs(svc, meta) -> dict[str, int]:
    sheets = {s["properties"]["title"]: s["properties"]["sheetId"] for s in meta["sheets"]}
    requests = []
    if SHEET_TITLE != meta["properties"].get("title"):
        requests.append({"updateSpreadsheetProperties": {
            "properties": {"title": SHEET_TITLE}, "fields": "title"}})

    if TAB_PHIEU not in sheets:
        if len(meta["sheets"]) == 1 and meta["sheets"][0]["properties"]["title"] not in (TAB_PHIEU, TAB_HUONGDAN):
            first_id = meta["sheets"][0]["properties"]["sheetId"]
            requests.append({"updateSheetProperties": {
                "properties": {"sheetId": first_id, "title": TAB_PHIEU}, "fields": "title"}})
            sheets[TAB_PHIEU] = first_id
        else:
            requests.append({"addSheet": {"properties": {"title": TAB_PHIEU}}})
    if TAB_HUONGDAN not in sheets:
        requests.append({"addSheet": {"properties": {"title": TAB_HUONGDAN}}})

    if requests:
        svc.spreadsheets().batchUpdate(spreadsheetId=SHEET_ID, body={"requests": requests}).execute()
        meta = get_spreadsheet(svc)
        sheets = {s["properties"]["title"]: s["properties"]["sheetId"] for s in meta["sheets"]}
    return sheets


def init_sheet(svc):
    meta = get_spreadsheet(svc)
    sheets = ensure_tabs(svc, meta)
    phieu_id = sheets[TAB_PHIEU]

    # tiêu đề cột + đóng băng hàng 1
    svc.spreadsheets().values().update(
        spreadsheetId=SHEET_ID, range=f"{TAB_PHIEU}!A1",
        valueInputOption="RAW", body={"values": [HEADER]}).execute()

    requests = [
        {"updateSheetProperties": {
            "properties": {"sheetId": phieu_id, "gridProperties": {"frozenRowCount": 1}},
            "fields": "gridProperties.frozenRowCount"}},
        {"repeatCell": {
            "range": {"sheetId": phieu_id, "startRowIndex": 0, "endRowIndex": 1,
                      "startColumnIndex": 0, "endColumnIndex": len(HEADER)},
            "cell": {"userEnteredFormat": {"textFormat": {"bold": True},
                                            "backgroundColor": {"red": 0.85, "green": 0.85, "blue": 0.85}}},
            "fields": "userEnteredFormat(textFormat,backgroundColor)"}},
        {"setDataValidation": {
            "range": {"sheetId": phieu_id, "startRowIndex": 1, "endRowIndex": 1000,
                      "startColumnIndex": 7, "endColumnIndex": 8},
            "rule": {"condition": {"type": "ONE_OF_LIST",
                                    "values": [{"userEnteredValue": s} for s in STATUSES]},
                     "strict": True, "showCustomUi": True}}},
    ]

    # gỡ hết rule tô màu cũ rồi gắn lại — init chạy lại nhiều lần không bị nhân đôi rule
    existing_rules = next((s.get("conditionalFormats", []) for s in meta["sheets"]
                            if s["properties"]["sheetId"] == phieu_id), [])
    for i in range(len(existing_rules) - 1, -1, -1):
        requests.append({"deleteConditionalFormatRule": {"sheetId": phieu_id, "index": i}})
    for status in STATUSES:
        r, g, b = STATUS_COLOR[status]
        requests.append({"addConditionalFormatRule": {
            "rule": {
                "ranges": [{"sheetId": phieu_id, "startRowIndex": 1, "endRowIndex": 1000,
                            "startColumnIndex": 0, "endColumnIndex": len(HEADER)}],
                "booleanRule": {
                    "condition": {"type": "TEXT_EQ", "values": [{"userEnteredValue": status}]},
                    "format": {"backgroundColor": {"red": r, "green": g, "blue": b}}}},
            "index": 0}})

    svc.spreadsheets().batchUpdate(spreadsheetId=SHEET_ID, body={"requests": requests}).execute()

    huongdan = [
        ["Hướng dẫn cho Muse — làm phiếu trong tab Phieu"],
        ["1. Đọc các dòng Trạng thái = Mới, theo đúng thứ tự từ trên xuống (Mã phiếu rồi Mã ô)."],
        ["2. Nhận ô: đổi Trạng thái = Đang làm, Người làm = Muse."],
        ["3. Tạo đúng theo cột Mô tả/prompt và cột Chuẩn (kích thước, nền: xanh #00B140)."],
        ["4. Xuất file PNG vào Drive: Muse Workspace/03_Hoan-thanh/<Mã phiếu>/<Mã ô>.png"],
        ["5. Nộp xong: đổi Trạng thái = Chờ kiểm, điền Link file Drive (đường dẫn file vừa xuất)."],
        ["6. Mỗi lượt làm tối đa 4 ô — làm xong rồi báo, đừng ôm nhiều ô cùng lúc."],
        ["7. Không tự sửa dòng đã Đạt — đó là hàng Gen đã duyệt."],
        ["8. 9 ô MR-063 đang để Trạng thái = Bỏ (ghi chú \"CO dặn không tạo lại\") — bỏ qua, không làm."],
    ]
    svc.spreadsheets().values().update(
        spreadsheetId=SHEET_ID, range=f"{TAB_HUONGDAN}!A1",
        valueInputOption="RAW", body={"values": huongdan}).execute()
    print(f"✓ init xong — tab {TAB_PHIEU}/{TAB_HUONGDAN}, tiêu đề '{SHEET_TITLE}'")


# ---------- seed / sync / status ----------

def read_phieu_rows(svc) -> list[list[str]]:
    res = svc.spreadsheets().values().get(
        spreadsheetId=SHEET_ID, range=f"{TAB_PHIEU}!A2:L").execute()
    return res.get("values", [])


def seed(svc):
    tickets = load_tickets()
    existing = read_phieu_rows(svc)
    existing_keys = {(r[0], r[2]) for r in existing if len(r) > 2}

    new_rows = []
    counts = {}
    for ticket_id, items in tickets.items():
        submitted = find_submitted(ticket_id)
        n_new = 0
        for item in items:
            key = (ticket_id, item["ma_o"])
            if key in existing_keys:
                continue
            if ticket_id == "MR-063" and item["ma_o"] in MR063_BO:
                status, nguoi_lam, link, ghi_chu = "Bỏ", "", "", GHI_CHU_BO
            else:
                f = match_ma_o(item["ma_o"], submitted, item.get("legacy_ma_o"))
                if f:
                    status, nguoi_lam, link, ghi_chu = "Chờ kiểm", "Muse", link_for(f), ""
                else:
                    status, nguoi_lam, link, ghi_chu = "Mới", "", "", ""
            new_rows.append([
                ticket_id, TICKET_CHAR[ticket_id], item["ma_o"], item["ten_vi"], item["ten_en"],
                item["prompt"], item["chuan"], status, nguoi_lam, link, ghi_chu, now_iso(),
            ])
            n_new += 1
        counts[ticket_id] = (len(items), n_new)

    if new_rows:
        svc.spreadsheets().values().append(
            spreadsheetId=SHEET_ID, range=f"{TAB_PHIEU}!A1",
            valueInputOption="RAW", insertDataOption="INSERT_ROWS",
            body={"values": new_rows}).execute()

    for ticket_id, (total, n_new) in counts.items():
        print(f"{ticket_id}: tổng {total} ô, thêm mới {n_new}")
    print(f"✓ seed xong — {len(new_rows)} dòng mới")


# 0.3.0-C.2: đọc data/kit-status.json (env GS_KIT_STATUS, mặc định /opt/gen-studio/data/kit-status.json) —
# MỘT công thức «ô đạt» (DB-GK-0.1 §13, v_kit_coverage), do `genstudio import` ghi. File thiếu/hỏng ⇒ {} êm,
# không crash (tương thích ngược — sync vẫn chạy phần đối chiếu file Drive như trước).
def load_kit_status() -> dict:
    if not KIT_STATUS_FILE.is_file():
        return {}
    try:
        data = json.loads(KIT_STATUS_FILE.read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return {}
    return data.get("slots") or {}


KIT_VERDICT_TO_STATUS = {"đạt": "Đạt", "cờ lỗi": "Làm lại"}


# Chờ kiểm -> Đạt/Làm lại theo kit-status.json; KHÔNG đụng dòng khác (đặc biệt KHÔNG hạ dòng Đạt Ryan đã đặt —
# chỉ xét dòng đang "Chờ kiểm"). `ma_o` trên Sheet giờ LÀ mã ô đầy đủ (mục 1) nên tra thẳng, không cần quy đổi.
def kit_status_updates(rows: list[list[str]]) -> list[tuple[int, list[str]]]:
    slots = load_kit_status()
    if not slots:
        return []
    out = []
    for idx, row in enumerate(rows):
        row = row + [""] * (len(HEADER) - len(row))
        ma_o, status = row[2], row[7]
        if status != "Chờ kiểm":
            continue
        info = slots.get(ma_o)
        if not info:
            continue
        new_status = KIT_VERDICT_TO_STATUS.get(info.get("state"))
        if not new_status:
            continue
        row[7] = new_status
        row[10] = f"Kiểm máy (kit-status.json): {info.get('state')}"
        row[11] = now_iso()
        out.append((idx, row))
    return out


def sync(svc):
    rows = read_phieu_rows(svc)
    tickets = load_tickets()
    submitted_cache = {tid: find_submitted(tid) for tid in tickets}
    legacy_lookup = {tid: {it["ma_o"]: it.get("legacy_ma_o") for it in items} for tid, items in tickets.items()}

    updates: dict[int, list[str]] = {}
    for idx, row in enumerate(rows):
        row = row + [""] * (len(HEADER) - len(row))
        ticket_id, ma_o, status = row[0], row[2], row[7]
        if status not in ("Mới", "Đang làm"):
            continue
        sub = submitted_cache.get(ticket_id, {})
        legacy = legacy_lookup.get(ticket_id, {}).get(ma_o)
        f = match_ma_o(ma_o, sub, legacy)
        if not f:
            continue
        row[7], row[9], row[11] = "Chờ kiểm", link_for(f), now_iso()
        rows[idx] = row
        updates[idx] = row

    # C.2 (Gen, bổ sung cổng mục 1): Chờ kiểm -> Đạt/Làm lại theo kit-status.json — chạy SAU bước trên để thấy
    # đúng dòng vừa chuyển "Chờ kiểm" cùng lượt sync này.
    kit_updates = kit_status_updates(rows)
    for idx, row in kit_updates:
        rows[idx] = row
        updates[idx] = row

    if updates:
        svc.spreadsheets().values().batchUpdate(
            spreadsheetId=SHEET_ID,
            body={"valueInputOption": "RAW", "data": [
                {"range": f"{TAB_PHIEU}!A{idx + 2}:L{idx + 2}", "values": [row]} for idx, row in updates.items()
            ]}).execute()

    counts = {s: 0 for s in STATUSES}
    for row in rows:
        row = row + [""] * (len(HEADER) - len(row))
        if row[7] in counts:
            counts[row[7]] += 1
    print(f"✓ sync xong — cập nhật {len(updates)} dòng (file Drive: {len(updates) - len(kit_updates)}, "
          f"kit-status.json: {len(kit_updates)}) · "
          f"Mới {counts['Mới']} / Đang làm {counts['Đang làm']} / "
          f"Chờ kiểm {counts['Chờ kiểm']} / Đạt {counts['Đạt']} / Làm lại {counts['Làm lại']}")


def status(svc):
    rows = read_phieu_rows(svc)
    by_ticket: dict[str, dict[str, int]] = {}
    for row in rows:
        if len(row) < 8:
            continue
        ticket_id, st = row[0], row[7]
        by_ticket.setdefault(ticket_id, {s: 0 for s in STATUSES})
        if st in by_ticket[ticket_id]:
            by_ticket[ticket_id][st] += 1
    header = f"{'Phiếu':<10}" + "".join(f"{s:<11}" for s in STATUSES) + "Tổng"
    print(header)
    for ticket_id in sorted(by_ticket):
        counts = by_ticket[ticket_id]
        total = sum(counts.values())
        print(f"{ticket_id:<10}" + "".join(f"{counts[s]:<11}" for s in STATUSES) + str(total))


def main():
    ap = argparse.ArgumentParser(description="Quản lý phiếu Muse trên Google Sheet")
    ap.add_argument("action", choices=["init", "seed", "sync", "status"])
    args = ap.parse_args()
    svc = sheets_client()
    {"init": init_sheet, "seed": seed, "sync": sync, "status": status}[args.action](svc)


if __name__ == "__main__":
    main()
