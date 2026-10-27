# Gen-Studio — Kiến trúc MVP và hợp đồng giữa các gói

> Nguồn sự thật sản phẩm: Second-Brain `01-projects/xuong-video/` — `spec/PRODUCT-SPEC.md` (v2), `spec/FRONTEND-SPEC.md` (v2), `spec/DATABASE.md` (v1), `design/v1/BUILD-BRIEF.md`, spike `spikes/bai01-motion-genchibi/`.
> File này là **hợp đồng code**: mỗi gói chỉ sửa file thuộc gói mình, gọi gói khác qua đúng chữ ký ở đây. Đổi hợp đồng = sửa file này trước.

## 0. Luật chung
- **Node 22 LTS, không npm ở runtime.** Chỉ dùng module có sẵn của Node: `node:sqlite`, `node:http`, `node:crypto`, `node:child_process`, `node:test`, `WebSocket` toàn cục. **Không** `package.json` dependencies. Không Playwright.
- CommonJS (`require`). Mỗi file mở đầu bằng `// © 2026 Gen Labs — All rights reserved.` + 1 dòng mục đích.
- Chuỗi người đọc tiếng Việt có dấu; lỗi trả về dạng `{code, text_human, detail}` (không stack trace cho người dùng).
- Không ghi secret ra log; log mask chuỗi giống key.
- Test: `node --test test/*.test.js` (glob; `node --test test/` lỗi trên Node 22.22) — mỗi gói có file `test/<gói>-*.test.js`, chạy được không cần mạng (provider giả `GS_FAKE_PROVIDERS=1`).
- Media từ API: kiểm magic bytes, giải bằng parser định dạng, không tự bọc (L-101).
- Đường dẫn dữ liệu: `DATA_DIR` (mặc định `./data`) → `studio.db`, `media/`, `exports/`, `backups/`, `run/`.

## 1. Cây thư mục và chủ sở hữu
| Đường dẫn | Gói | Nội dung |
|---|---|---|
| `server/config.js`, `server/db.js`, `server/ids.js`, `server/write.js`, `server/state.js`, `server/queue.js`, `server/secrets.js`, `server/seed.js`, `migrations/`, `seed/` | **A — Lõi dữ liệu** | DB, migration, ULID/display_id, `write()`, máy trạng thái, hàng đợi job bền, secret store, seed demo |
| `media/` (`wav.js`, `providers/gemini.js`, `providers/fake.js`, `providers/index.js`, `align.js`, `mix.js`, `probe.js`, `srt.js`, `gates/`) | **B — Giọng & âm thanh & cổng** | TTS, giám khảo, căn mốc, trộn, mux, 8 cổng |
| `render/` (`engine/`, `blocks/`, `stage/`, `cdp.js`, `chromium.js`, `render.js`), `vendor/gen-chibi/`, `tools/sync-gen-chibi.sh` | **C — Dựng hình** | Dòng thời gian, máy quay, khối hình, trang sân khấu, CDP thuần, xuất khung + sfx |
| `server/main.js`, `server/http.js`, `server/auth.js`, `server/api.js`, `server/grids.js`, `server/mcp.js`, `server/mcp-stdio.js`, `server/pipeline.js`, `server/scheduler.js`, `server/events.js`, `agent/` | **D — Máy chủ, MCP, pipeline, agent runner** | HTTP, auth, REST, SSE, MCP, điều phối pipeline, lịch + runner |
| `studio/` | **E — Giao diện** | Web GUI Data Console (vanilla JS, không build) |
| `cli/`, `Dockerfile`, `docker-compose.yml`, `install.sh`, `tools/test.sh`, `.github/` | **F — Đóng gói** | CLI `genstudio`, image, installer, CI |

## 2. Gói A — Lõi dữ liệu
```js
// server/config.js
load() → { dataDir, port, host, masterKey, fakeProviders:boolean, chromiumPath|null, ffmpegPath, publicUrl|null, version }
// .env tự sinh lần đầu (GS_MASTER_KEY 32 byte hex, GS_PORT=7490) nếu chưa có.

// server/ids.js
ulid() → string(26)
// server/db.js
open(dataDir) → Db            // WAL, foreign_keys=ON, chạy migrate()
Db.raw                         // DatabaseSync
Db.tx(fn) → kết quả fn(db)     // BEGIN IMMEDIATE … COMMIT/ROLLBACK
Db.nextDisplayId(ws, prefix) → 'LS-0001'   // gọi trong tx
Db.get(sql, ...p) / Db.all(sql, ...p) / Db.run(sql, ...p)
Db.json(row) → row với các cột *_json/JSON đã parse

// server/write.js — CỔNG GHI DUY NHẤT
createWriter(db, {events}) → write(actor, op, payload) → kết quả
// actor: {type:'user'|'agent'|'assistant'|'system'|'cli'|'runner', id, scopes?:[...], entry:'ui'|'http'|'mcp'|'cli'|'runner'|'system'}
// op (whitelist, kiểm quyền theo ma trận DATABASE §6, ném WriteError{code:'forbidden'|'invalid'|'conflict'|'not_found', text_human}):
//   'channel.create' 'channel.update' (version mới) 'curriculum.save' 'cast.save' (version mới, data = công thức Gen-Chibi)
//   'asset.put' ({kind, bytes:Buffer, mime, meta, source}) → asset (lưu theo sha256, dedupe)
//   'lesson.submit' ({channel, curriculum_node?, title, lines, beats, camera_hints?, work_order?}) → {lesson, version, render}
//        (lesson mới hoặc version mới nếu có `lesson`), kiểm lược đồ bài (§6) và block params qua render/blocks/registry.validate
//   'work_order.create' 'work_order.cancel' 'work_order.complete' ({summary})
//   'agent.create' (trả token 1 lần) 'agent.revoke' 'provider.save' ({vendor,kind,model,key?}) 'provider.scan_result'
//   'settings.set' 'suggestion.create' 'suggestion.apply'
// Mọi op ghi 1 dòng audit_log trong cùng tx và phát events.emit('change', {entity, id}).
// KHÔNG có op review; KHÔNG có op đổi state render (xem state.js).

// server/state.js
review(db, {user, renderId, decision, notes:[{pin_kind,pin_ref,text}], reviewSeconds, entry:'ui'}) → review
//   CHỈ nhận user.role in (owner, reviewer) và entry==='ui'; ngược lại ném forbidden.
//   changes_requested → tự tạo work_order kind 'revise'.
transitionRender(db, renderId, to, {progress?, blocked_reason?, waiting_until?, manifest?, outputs?}) → render
//   Chỉ cạnh hợp lệ (PRODUCT-SPEC §4.3); blocked → tự tạo WO 'unblock'; render mới cho cùng lesson → bản cũ chưa duyệt chuyển superseded.
transitionWorkOrder(db, woId, to, extra)

// server/queue.js — hàng đợi bền trên bảng runs
enqueue(db, {kind, render_id?, work_order_id?, payload}) → run
lease(db, kinds[], workerId, ms) → run|null       // nhặt run queued hoặc running hết lease (chạy bù)
heartbeat(db, runId, ms, progress?) ; done(db, runId, result) ; fail(db, runId, error) ; waitQuota(db, runId, untilIso)

// server/secrets.js
put(db, ws, name, plaintext) ; get(db, ws, name) → plaintext   // AES-256-GCM, masterKey
// server/seed.js
seedDemo(db) — đúng dữ liệu BUILD-BRIEF §5 (idempotent)
```
Migration `migrations/0001_init.sql` hiện thực đủ bảng DATABASE §4 (kể cả trigger bất biến, audit append-only).

## 3. Gói B — Giọng, âm thanh, cổng
```js
// media/wav.js
parse(buf) → {rate, channels, bits, pcm:Int16Array}   // RIFF: duyệt chunk, chỉ lấy 'data'; không phải RIFF → ném
encode({rate, channels, pcm}) → Buffer
envelope(pcm, rate, fps=30) → number[] (0..1)
edgePeaks(pcm, rate, ms=50) → {head, tail}

// media/providers/index.js
get(config) → provider   // fake khi config.fakeProviders
// provider:
probe({key}) → {models:[{kind:'tts'|'judge', model, available, quota:{value|null, source:'api'|'local_counter'|'unknown'}}], voices:[...]}
tts({key, model, voice, text, style?}) → {raw:Buffer (blob gốc), wav:Buffer (đã giải đúng), duration_ms}
     // ném ProviderError{code:'quota', retryAfterSec} khi 429; code:'auth' | 'transient' | 'bad_output'
judge({key, model, wav:Buffer, script, terms:[...]}) → {transcript, matches:boolean, extra_speech:boolean,
     terms:{[t]:'english'|'vietnamese'|'unknown'}, detected_terms:[...], word_times:[{w, t0, t1}]|null}
     // prompt TÁCH dữ liệu khỏi chỉ thị; trả JSON
// fake.js: tts sinh giọng tổng hợp (sine điều biến theo âm tiết) và **trả RIFF có chunk C2PA đuôi** để chứng minh parse đúng;
//          judge trả khớp + mọi thuật ngữ 'english'; có công tắc lỗi để test (GS_FAKE_FAIL=quota|pron).

// media/align.js
align({say, duration_ms, judgeWordTimes|null}) → [{w, t0, t1}]   // dùng word_times giám khảo nếu có, dự phòng chia theo ký tự

// media/mix.js (ffmpeg)
mix({voices:[{path, at_ms}], sfx:[{path, at_ms, vol}], duration_ms, out}) → out   // 48 kHz stereo, limiter đỉnh −1.5 dBTP
mux({framesPattern|videoPath, fps, audio, out, srt?:[{lang,path}]}) → out          // H.264 yuv420p + AAC
loudness(path) → {lufs, tp}          // ebur128
probe(path) → {streams:[...], duration_ms}
freeze(path, {minSec}) → [{start,end}] ; cuts(path, {threshold}) → [t]   // cho G-MOTION
// media/srt.js
build(lines:[{say, a_ms, b_ms}], lang) → string

// media/gates/index.js — mỗi cổng trả {gate, result:'pass'|'fail'|'unknown', measure}
voiceGates({wav, raw, judge, termsEffective, otherTails}) → [G-WAV(a), G-SCRIPT, G-PRON]
renderGates({mixPath, mp4Path, lines:[{a_ms,b_ms}], beats:[{anchor_ok}], frames:{expected, got, errors}, cutsAllowed:[t]}) → [G-WAV(b), G-LOUD, G-SYNC, G-MOTION, G-FRAMES, G-MUX]
```

## 4. Gói C — Dựng hình
```js
// render/blocks/registry.js (chạy cả Node và trình duyệt: UMD gắn window.GSBlocks khi có window)
list() → [{name, version, schema}] ; validate(name, params) → {ok, errors:[...]}
// Khối MVP: title, concept-chip, token-row, prob-card, stamp, takeaway, lesson-map, end-card, illustration
// Mỗi khối: {name, version, schema, footprint(aspect) → {w,h}, sfx:[{at:'in'|'peak', name}], mount(world, params, ctx), draw(el, t_local, ctx)}

// render/engine/timeline.js (thuần, không DOM)
buildPlan({lesson:{lines, beats, camera_hints}, clips:{[lineId]:{duration_ms, word_times, envelope}}, channel, cast, aspect:'16:9', fps:30})
  → plan = {fps, size:[1920,1080], duration_ms, lines:[{id, who, say, terms, a_ms, b_ms, words:[{w,t0,t1}], envelope}],
            beats:[{id, block, params, t_in, t_out, slot:{x,y,w,h}, morphFrom?}],
            camera:[{t, x, y, z}], cues:[{t_ms, name, vol}], cast:{[id]:recipe}, style}
// Mốc vào của Beat = thời điểm từ neo; máy quay tự sinh (render/engine/camera.js) từ slot các Beat; prob-card nối tiếp prob-card = morph.

// render/stage/stage.html + stage.js — trang sân khấu, nạp vendor/gen-chibi + blocks
window.__load(plan) → Promise ; window.__seek(t_ms) ; window.__sfx(names) → {name: base64 WAV}

// render/chromium.js — tìm và chạy Chromium headless (CHROMIUM_PATH | 'chromium' | /opt/pw-browsers/chromium-*/chrome-linux*/chrome)
// render/cdp.js — client CDP thuần (WebSocket toàn cục của Node 22): connect, send(method, params), on(event)
// render/render.js
renderPlan({plan, outDir, chromiumPath, onProgress(p)}) → {framesPattern, frames, fps, errors:[...], sfx:{[name]:path}, cover:path}
```
`tools/sync-gen-chibi.sh <đường dẫn Gen-Chibi>` chép `engine/core.js, i18n.js, voices.js, sounds.js, audio.js, choreo.js, kinds/character/gen.core.js, kinds/khung/gen.khung.js, kinds/character/gen.choreo.js` + `VERSION` vào `vendor/gen-chibi/`. Gen-Chibi ở phiên bản 0.25.1.

## 5. Gói D — Máy chủ, MCP, pipeline, agent
- `server/main.js`: `config.load()` → `db.open` → nếu `GS_SEED_DEMO=1` thì `seedDemo` → `http.start` → `pipeline.startWorkers` → `scheduler.start`.
- **REST** (`server/api.js`, JSON; mọi ghi qua `write()`; phiên cookie `gs_sess` + header `X-CSRF` cho thao tác ghi từ UI):
  - `GET /api/setup/state` · `POST /api/setup/owner` (chỉ khi chưa có owner, cần `?k=` khoá một lần trong `run/admin-key`) · `POST /api/login` · `POST /api/logout` · `GET /api/me`
  - `GET /api/overview`
  - `GET /api/grid/:name?q=&sort=` → `{columns:[{key,label,type}], rows:[…], footer:{…}}` — `name` ∈ `review_queue, reviews, work_orders, lessons, runs, curriculum, cast, voice_clips, agents, providers, audit` (`server/grids.js`, whitelist ô truy vấn DATABASE §5.2)
  - `GET /api/lessons/:display_id` → bài + versions + lines + beats + renders + lineage
  - `GET /api/renders/:display_id` → render + manifest + gates + plan rút gọn (lines a/b, beats t_in/t_out, cues) + notes + `media` URLs
  - `GET /media/:asset_id` (cần phiên, hỗ trợ Range cho video)
  - `POST /api/renders/:display_id/review` `{decision, notes, review_seconds}` → `state.review` (chỉ phiên UI)
  - `POST /api/renders/:display_id/export` → gói vào `exports/`
  - `POST /api/providers` · `POST /api/providers/:id/scan` · `POST /api/agents` (trả token 1 lần) · `POST /api/agents/:id/revoke` · `POST /api/work_orders` · `POST /api/work_orders/:id/cancel` · `POST /api/curriculum` · `POST /api/channels`
  - `GET /api/events` — SSE `change` events
- **MCP** (`server/mcp.js`, JSON-RPC 2.0, MCP 2025-06-18 tối thiểu: `initialize`, `tools/list`, `tools/call`, `ping`): HTTP `POST /mcp` (Bearer token agent) và `server/mcp-stdio.js --token <t>` (cầu stdio gọi HTTP local). Tool đúng PRODUCT-SPEC v2 W7; actor `agent` với scopes của token; **không có** tool review/delete.
- **Pipeline** (`server/pipeline.js`): worker lease run theo kind, chạy: `voicing` (B.tts, đệm theo content_hash, ước lượng lượt trước) → `judging` (B.judge + voiceGates; G-PRON fail → tạo lại câu đó tối đa 2 lần → blocked) → `aligning` → `rendering` (C.buildPlan → đóng băng manifest → C.renderPlan) → `mixing` (B.mix + mux + srt + cover) → `gating` (renderGates) → `awaiting_review`. ProviderError quota → `waiting_quota` + `waiting_until`. Cổng `unknown` → chặn.
- **Lịch** (`server/scheduler.js`): mỗi phút kiểm lịch kênh → mở WO `new_lesson` cho mục giáo trình kế tiếp (tối đa `per_run`); WO `assigned` quá hạn nhịp sống → `stalled`; trần 2 WO `unblock` / bài.
- **Agent runner = container riêng** (`agent/runner.js`, gói D): KHÔNG mount `DATA_DIR`, không có `.env`/secret, không Docker socket. Biến môi trường: `GS_MCP_URL` (vd `http://studio:7490/mcp`), `GS_AGENT_TOKEN` (token `compose`+`run`). Vòng lặp: mỗi 60 s gọi MCP `get_next_task`; có việc → `spawn('claude', ['-p', prompt, '--mcp-config', cfg, '--output-format', 'json', '--allowedTools', 'mcp__gen-studio__*'])` với cfg trỏ MCP HTTP + token; gửi nhịp sống `report_problem`/`complete_task`; không có CLI → `report_problem({code:'cli_missing'})`. `GS_FAKE_AGENT=1` → agent giả nộp bài mẫu 3 câu qua chính MCP (dùng cho e2e, chạy được ngay trong tiến trình test). Test âm: runner không có đường nào tới `studio.db` (kiểm cấu hình compose: service `agent` không có volume `data`).

## 6. Lược đồ bài học (đầu vào `submit_lesson`)
```json
{
  "channel": "CH-0001", "curriculum_node": "CU-0001", "lesson": null, "work_order": "WO-0001",
  "title": "Vì sao A.I. sai mà vẫn tự tin?",
  "lines": [
    {"id": "LN-0001", "who": "CM-0002", "say": "Anh Gen ơi, sao A.I. nói sai mà vẫn tự tin thế ạ?", "lang": "vi",
     "terms": ["A.I."], "subtitle": {"en": "Gen, why does A.I. sound so sure when it's wrong?"}, "mood": "unsure"}
  ],
  "beats": [
    {"id": "BT-0004", "block": "prob-card", "anchor": {"line": "LN-0003", "word": "Hà Nội"},
     "params": {"prompt": "Thủ đô của Việt Nam là", "options": [["Hà Nội", 92], ["Huế", 4], ["TP.HCM", 3], ["Hải Phòng", 1]], "pick": 0, "chip": "✓ chắc chắn"}}
  ],
  "camera_hints": null
}
```
`id` của line/beat tuỳ chọn (bỏ trống = cấp mới; giữ = câu cũ được sửa). `anchor.word` (chuỗi con trong `say`) hoặc `anchor.word_index` — bắt buộc.

## 7. Gói E — Giao diện
SPA vanilla (`studio/index.html`, `studio/app.js`, `studio/styles.css`, `studio/views/*.js`), không build, không thư viện ngoài, font IBM Plex qua Google Fonts có fallback. Tokens và khung theo BUILD-BRIEF §2–§4 (Data Console). Màn MVP: Thiết lập lần đầu, Đăng nhập, Tổng quan, Hàng chờ, **Phòng chiếu** (video + bàn dựng 4 làn + bảng cổng + ghi chú + quyết định), Bài học (lưới + inspector Kịch bản/Nhịp hình/Phiên bản/Nguồn gốc), Pipeline (runs + lệnh sản xuất), Agent & MCP, Nhà cung cấp, Kênh/Giáo trình (lưới cơ bản), Nhật ký. Chỉ dùng REST §5; cập nhật trực tiếp qua SSE.

## 8. Gói F — Đóng gói
`cli/genstudio` (bash): `start|stop|restart|status|logs|update|backup|restore|uninstall|mcp|password|lang|open`. `Dockerfile` (node:22-bookworm-slim + chromium + ffmpeg + fonts-noto + font IBM Plex/Be Vietnam Pro/Patrick Hand tải lúc build, ghi ASSET_MANIFEST), `docker-compose.yml` (service `studio` có volume `data`; service `agent` chạy `agent/runner.js` + Claude Code CLI, **không** volume `data`, chỉ thấy `studio:7490`), `install.sh` (STD-06: kiểm OS/arch, Docker, tiến trình, in link đăng nhập một lần). `tools/test.sh` chạy kiểm repo + `node --test test/*.test.js`.

## 9. Kiểm chứng MVP (định nghĩa xong)
`test/e2e-mvp.test.js` (gói D sở hữu): DB tạm + seed tối thiểu + `GS_FAKE_PROVIDERS=1` + `GS_FAKE_AGENT=1` → lịch mở WO → runner + agent giả lấy việc qua `get_next_task` và nộp bài 3 câu qua MCP → pipeline chạy thật (Chromium + ffmpeg) → Render `awaiting_review` với 8 cổng `pass` → gọi review qua token agent bị từ chối → review qua phiên UI → `approved` → export có MP4 + SRT. Chạy được trong CI và trong container.
