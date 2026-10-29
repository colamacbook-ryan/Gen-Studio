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
| `server/main.js`, `server/http.js`, `server/auth.js`, `server/api.js`, `server/routes/`, `server/grids.js`, `server/grids/`, `server/mcp.js`, `server/mcp-tools/`, `server/mcp-stdio.js`, `server/pipeline.js`, `server/scheduler.js`, `server/events.js`, `agent/` | **D — Máy chủ, MCP, pipeline, agent runner** | HTTP, auth, REST, SSE, MCP, điều phối pipeline, lịch + runner |
| `studio/` | **E — Giao diện** | Web GUI Data Console (vanilla JS, không build) |
| `cli/`, `Dockerfile`, `docker-compose.yml`, `install.sh`, `tools/test.sh`, `.github/` | **F — Đóng gói** | CLI `genstudio`, image, installer, CI |
| `voice/` (`server.py`, `models.json`, `requirements.lock`, `test_server.py`), `Dockerfile.voice`, `media/providers/offline.js` | **L — Giọng offline (0.2.0)** | Sidecar Python VieNeu-TTS + faster-whisper, adapter vendor `offline` (§13) |

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
// actor: {type:'user'|'agent'|'assistant'|'system'|'cli'|'runner'|'client', id, scopes?:[...], entry:'ui'|'http'|'mcp'|'cli'|'runner'|'system'|'oauth'}
// op (whitelist, kiểm quyền theo ma trận DATABASE §6, ném WriteError{code:'forbidden'|'invalid'|'conflict'|'not_found', text_human}):
//   'channel.create' 'channel.update' (version mới) 'curriculum.save' 'cast.save' (version mới, data = công thức Gen-Chibi)
//   'asset.put' ({kind, bytes:Buffer, mime, meta, source}) → asset (lưu theo sha256, dedupe)
//   'lesson.submit' ({channel, curriculum_node?, title, lines, beats, camera_hints?, work_order?}) → {lesson, version, render}
//        (lesson mới hoặc version mới nếu có `lesson`), kiểm lược đồ bài (§6) và block params qua render/blocks/registry.validate
//   'work_order.create' 'work_order.cancel' 'work_order.complete' ({summary})
//   'agent.create' (trả token 1 lần) 'agent.revoke' 'provider.save' ({vendor,kind,model,key?}) 'provider.scan_result'
//   'settings.set' 'suggestion.create' 'suggestion.apply'
//   Duyệt quyền agent (§5 "Xác thực agent"): 'auth.register' 'auth.request' 'auth.exchange' 'auth.refresh' 'auth.runner_status' (actor client:<id>, entry oauth — endpoint không xác thực, có hạn tần suất)
//   'auth.approve' 'auth.deny' 'auth.pairing_open' (CHỈ owner + entry ui; agent/CLI/http/hệ thống → forbidden) · 'auth.init' (sinh server_id). 'agent.create' nhận thêm actor cli (token tay).
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
Migration `0003_v020.sql` (0.2.0, SPEC-0.2.0 §9; `-- fk-off`): `lesson_versions` + `kind/variant/thumbnail/screens/host/music` (không CHECK `kind`, CNS-090); dựng lại `gate_results` bỏ CHECK trên `gate` (giữ CHECK `result`, `subject_kind`) — danh sách cổng theo `media/gates` `GATES`, không theo DB;
`renders` + `thumbnail_pick*`, `exported_at`, `published_*`, `awaiting_review_at` (ghi một lần — `tr_render_awaiting_once`, backfill từ `audit_log`); `tr_render_outputs_once` khoá `outputs` CHỈ khi `OLD.state` ∈ awaiting_review/approved/changes_requested/rejected/superseded (trong pipeline `state.js` vẫn gộp dần, CNS-119);
`cast_members` + `status` (draft|candidate|approved|retired, hàng cũ ⇒ draft) + `approved_*`; bảng mới `asset_rights` (chỉ thêm hàng, hiện trạng = hàng mới nhất, CNS-125); các index §9 #9.
`media/gates/index.js` `GATES = [{id, applies(kind, lv)}]` + `gatesFor(kind, lv)`: 8 cổng R3 luôn áp; G-THUMB khi bài có `thumbnail` (hoặc tutorial); G-CURSOR chỉ tutorial. Hợp đồng plan v2 + `plan.cursor` + `plan.assetRefs`: `test/h-fixtures.js` (fixture + bộ kiểm lược đồ) và `test/h-contracts.test.js`.

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
// render/blocks/index.json — NGUỒN DUY NHẤT danh sách khối (0.2.0 §2.3): [{name, file, kinds:['lesson'|'tutorial'], agent:boolean, enabled:boolean}]
//   enabled:false = nạp vào sân khấu nhưng bài chưa nhận (6 khối tutorial: screen, cursor, focus, callout, keystroke, mock-ui — stub do P0a, gói U làm thật)
// `node tools/gen-stage.js` sinh vùng <script> khối trong render/stage/stage.html (giữa gen-stage:blocks:begin/end) + render/blocks/index.browser.js (window.GSBlockIndex);
//   `--check` thoát mã 1 nếu lệch (test h-contracts kiểm). Thêm/bật một khối = sửa index.json + chạy gen-stage, không sửa lõi.
// render/blocks/registry.js (chạy cả Node và trình duyệt: UMD gắn window.GSBlocks khi có window) — đọc index.json
list(kind?) → [{name, version, schema}] ; validate(name, params, kind?) → {ok, errors:[...]} ; names(kind?) ; all() ; isEnabled(name, kind?) ; get(name)
// Khối MVP (enabled): title, concept-chip, token-row, prob-card, stamp, takeaway, lesson-map, end-card, illustration
// Mỗi khối: {name, version, schema, footprint(aspect) → {w,h}, sfx:[{at:'in'|'peak', name}], mount(world, params, ctx), draw(el, t_local, ctx)}

// render/engine/timeline.js (thuần, không DOM)
buildPlan({lesson:{lines, beats, camera_hints}, clips:{[lineId]:{duration_ms, word_times, envelope}}, channel, cast, aspect:'16:9', fps:30})
  → plan = {fps, size:[1920,1080], duration_ms, lines:[{id, who, say, terms, a_ms, b_ms, words:[{w,t0,t1}], envelope}],
            beats:[{id, block, params, t_in, t_out, slot:{x,y,w,h}, morphFrom?}],
            camera:[{t, x, y, z}], cues:[{t_ms, name, vol}], cast:{[id]:recipe}, style}
// Mốc vào của Beat = thời điểm từ neo; máy quay tự sinh (render/engine/camera.js) từ slot các Beat; prob-card nối tiếp prob-card = morph.

// render/stage/stage.html + stage.js — trang sân khấu, nạp vendor/gen-chibi + blocks
window.__load(plan) → Promise ; window.__seek(t_ms) ; window.__sfx(names) → {name: base64 WAV}
window.__still(mode, payload) → Promise<measures>   // render/stage/still.js: gọi GSStill.<mode>(payload); mode ∈ brand|thumb|frame|cast; KHÔNG chạy vòng __seek
//   GSStill.brand (gói B) · GSStill.thumb (gói T; phải hiểu payload.textOff=true ⇒ ẩn lớp chữ để đo tương phản) · GSStill.frame (gói U; bản P0a dựng plan.t_ms của payload.plan)
//   · GSStill.cast (gói K sở hữu render/stage/cast-sheet.js; P0a để stub). Bản mặc định trong still.js có measures.stub=true.

// render/chromium.js — tìm và chạy Chromium headless (CHROMIUM_PATH | 'chromium' | /opt/pw-browsers/chromium-*/chrome-linux*/chrome)
// render/cdp.js — client CDP thuần (WebSocket toàn cục của Node 22): connect, send(method, params), on(event)
// render/render.js
renderPlan({plan, outDir, chromiumPath, assetRoot, ffmpegPath, onProgress(p)}) → {framesPattern, frames, fps, errors:[...], sfx:{[name]:path}, cover:path, thumbs:[{index, spec, measures, png, png_notext, jpg1280, jpg1920}]}
//   plan.thumbs (mặc định []) ⇒ sau vòng khung hình, mỗi phương án đi __still('thumb', spec) và {…spec, textOff:true} trong CÙNG phiên Chromium (không mở lần nữa), ffmpeg hạ 1280/1920 JPEG q85.
//   plan.assetRefs = [{asset, label?, maxPx?:[w,h]}] (hoặc chuỗi) ⇒ resolveAssets(plan, errors, assetRoot, {ffmpegPath}) → {asset: dataURL}; cùng luật magic bytes/assetRoot/≤ 8 MB; maxPx hạ ảnh raster lớn (CNS-114). Param `asset` của khối illustration vẫn được đọc (bài v1).
openStage({chromiumPath?, nice?, shared?:{ch,client}, width, height, errors?, holder?}) → {page, ev(expr), shot(format?, quality?, clip?), errors, close()}   // phần Chromium/CDP dùng chung renderPlan + renderStill

// render/still.js — đường dựng MỘT khung (0.2.0 §2.2, CNS-118: mọi đường dựng ảnh đi qua đây)
renderStill({mode:'thumb'|'frame'|'brand'|'cast', payload, size:[w,h], format:'jpeg'|'png', quality, outFile?, assetRoot?, ffmpegPath?, chromiumPath?, timeoutMs?}) → Promise<{file|null, buffer, measures, errors, elapsed_ms}>
//   payload.assetRefs (cùng lược đồ trên) được phân giải thành payload.assetData trước khi gọi sân khấu. size phải cùng tỉ lệ ≤ 16:9 so với sân khấu 1920×1080 (chụp clip + scale).
//   Tiết chế (CNS-106): 1 still chạy một lúc, Chromium riêng `nice 10`, FIFO ≤ 8 chờ (đầy ⇒ lỗi code still_queue_full), hạn 15 s từ lúc BẮT ĐẦU dựng (still_timeout, bỏ Chromium), Chromium ấm 60 s rồi tự đóng.
//   Mã lỗi: still_mode · still_size · still_queue_full · still_timeout. closeStill() đóng Chromium ấm (test/tắt máy chủ). Tool MCP `render_still` thuộc gói P0b (server/mcp-tools/still.js).
```
`tools/sync-gen-chibi.sh <đường dẫn Gen-Chibi>` chép `engine/core.js, i18n.js, voices.js, sounds.js, audio.js, choreo.js, kinds/character/gen.core.js, kinds/khung/gen.khung.js, kinds/character/gen.choreo.js` + `VERSION` vào `vendor/gen-chibi/`. Gen-Chibi ở phiên bản 0.26.0 (gói dữ liệu thuần JSON, viền nướng vào path, biến thể tâm trạng — xem Gen-Chibi docs/PACK-DATA.md).

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
  - `POST /api/providers` · `POST /api/providers/:id/scan` · `POST /api/agents` (token tay, trả 1 lần; Nâng cao) · `GET /api/auth-requests` · `GET /api/auth-requests/:id` · `POST /api/auth-requests/lookup` · `POST /api/auth-requests/:id/approve|deny` · `POST /api/pairing/open` · `GET /api/runner-status` · `POST /api/agents/:id/revoke` · `POST /api/work_orders` · `POST /api/work_orders/:id/cancel` · `POST /api/curriculum` · `POST /api/channels`
  - `GET /api/events` — SSE `change` events
- **MCP** (`server/mcp.js`, JSON-RPC 2.0, MCP 2025-06-18 tối thiểu: `initialize`, `tools/list`, `tools/call`, `ping`): HTTP `POST /mcp` (Bearer token agent) và `server/mcp-stdio.js --token <t>` (cầu stdio gọi HTTP local). Tool đúng PRODUCT-SPEC v2 W7; actor `agent` với scopes của token; **không có** tool review/delete.
- **Pipeline** (`server/pipeline.js`): worker lease run theo kind, chạy: `voicing` (B.tts, đệm theo content_hash, ước lượng lượt trước) → `judging` (B.judge + voiceGates; G-PRON fail → tạo lại câu đó tối đa 2 lần → blocked) → `aligning` → `rendering` (C.buildPlan → đóng băng manifest → C.renderPlan) → `mixing` (B.mix + mux + srt + cover) → `gating` (renderGates) → `awaiting_review`. ProviderError quota → `waiting_quota` + `waiting_until`. Cổng `unknown` → chặn.
- **Lịch** (`server/scheduler.js`): mỗi phút kiểm lịch kênh → mở WO `new_lesson` cho mục giáo trình kế tiếp (tối đa `per_run`); WO `assigned` quá hạn nhịp sống → `stalled`; trần 2 WO `unblock` / bài.
- **Agent runner = container riêng** (`agent/runner.js`, gói D): KHÔNG mount `DATA_DIR`, không có `.env`/secret, không Docker socket. Biến môi trường: `GS_MCP_URL` (vd `http://studio:7490/mcp`), `GS_AGENT_STATE` (thư mục `token.json`, mode 0600; token do ghép thiết bị, KHÔNG nhận token từ môi trường/.env). Runner luôn chạy ở trạng thái `unpaired`, hỏi `GET /oauth/pairing-status` và chỉ xin mã khi chủ xưởng mở cửa sổ ghép; CLI con chạy uid khác (`GS_CLI_UID`) và chỉ nhận access token. Vòng lặp: mỗi 60 s gọi MCP `get_next_task`; có việc → `spawn('claude', ['-p', prompt, '--mcp-config', cfg, '--output-format', 'json', '--allowedTools', 'mcp__gen-studio__*'])` với cfg trỏ MCP HTTP + token; gửi nhịp sống `report_problem`/`complete_task`; không có CLI → `report_problem({code:'cli_missing'})`. `GS_FAKE_AGENT=1` → agent giả nộp bài mẫu 3 câu qua chính MCP (dùng cho e2e, chạy được ngay trong tiến trình test). Test âm: runner không có đường nào tới `studio.db` (kiểm cấu hình compose: service `agent` không có volume `data`).

### Xác thực agent (OAuth 2.1 + ghép thiết bị) — `server/oauth.js`
Mọi agent xin quyền và chờ chủ xưởng **Duyệt** (chỉ phiên UI của chủ xưởng: cookie + CSRF + Origin; agent/CLI/Bearer → 403; chỉ được hạ phạm vi `read|compose|run`). Token tay `gst_…` (không hết hạn) chỉ là lối nâng cao.
- **Metadata:** `/.well-known/oauth-protected-resource` (và `/mcp`), `/.well-known/oauth-authorization-server` (và `openid-configuration`). `/mcp` thiếu/sai token → 401 `WWW-Authenticate: Bearer realm, resource_metadata, scope="read compose run"`. issuer/resource chỉ dựng từ Host nằm trong danh sách cho phép (gồm `studio:7490`); Host lạ → 403.
- **Luồng code:** `POST /oauth/register` (RFC 7591, client public `none`, tên luôn kèm "(tự khai)", redirect https hoặc loopback) → `GET /oauth/authorize` (PKCE S256 bắt buộc, redirect khớp đúng chuỗi, loopback đổi cổng được) → chuyển sang `#/authorize?req=AR-…` → Duyệt (fetch JSON, JS chuyển hướng; redirect ngoài loopback bắt xác nhận "vừa tự bấm") → `POST /oauth/token`: code 60 s dùng 1 lần (dùng lại ⇒ thu hồi mọi thứ đã cấp từ code), access `gsa_…` 1 giờ, refresh `gsr_…` xoay vòng, 30 ngày trượt; refresh cũ dùng lại ⇒ thu hồi cả agent, trừ ân hạn 30 s khi cặp con chưa dùng (cấp cặp thay thế). Phạm vi cấp ra không bao giờ rộng hơn `agents.scopes`; `scope` trong yêu cầu chỉ được thu hẹp (nới ⇒ `invalid_scope`); token ghi phạm vi riêng và phạm vi hiệu lực = giao với phạm vi hiện tại của agent. Access token có audience = `server_id` (sinh lúc cài), không phải URL.
- **Ghép thiết bị** (RFC 8628 rút gọn): chỉ khi chủ xưởng mở **cửa sổ ghép** 10 phút (`settings.pairing_window {channel, open_until}`, op `auth.pairing_open`); ngoài cửa sổ → 400 `pairing_closed` (không tạo hàng); qua host công khai/tunnel → 403. Kênh vào do server suy ra (`internal` = Host `studio:7490` trong mạng Docker, không có header proxy; `loopback`; `public`): chỉ kênh `internal` mới thành agent `internal`, nguồn khác là `oauth` với tên "(tự khai)" và chủ xưởng phải **tự gõ** mã (`#/pair`, không liệt kê/không điền sẵn; server lưu băm mã). Mỗi yêu cầu có client `dev_<ulid>`. Hạn tần suất và trần pending theo kênh (đẩy bỏ hàng cũ nhất, kênh nội bộ có chỗ riêng).
- **Runner:** `GET /oauth/pairing-status` → `{owner_exists, window_open}` (công khai, không bí mật; runner nội bộ báo `unpaired|waiting|paired|error` qua tham số, lưu `settings.runner_status`). Token ở `/agent-state/token.json` (0600, ghi nguyên tử, refresh single-flight). Thu hồi agent nội bộ = tắt (đóng cửa sổ, runner không tự xin lại); thu hồi tự động (refresh bị dùng lại) hiện "Ghép lại" ở Tổng quan.
- **Dữ liệu:** migration `0002_agent_auth.sql` (`-- fk-off`, `-- require-empty: oauth_grants`): `oauth_clients` (kind dcr|device), `auth_requests` (`AR-`), `oauth_grants` (code/refresh theo `token_hash`, `parent_id`/`child_id`), `agent_tokens.kind/expires_at/audience/scopes`, dựng lại `audit_log` để nhận entry `oauth` và tạo lại trigger chỉ-thêm. Token/code/device_code không bao giờ vào URL (trừ `code` 60 s trong redirect), log hay nhật ký (`events.mask` che `gst_/gsa_/gsr_/gsd_/gsc_`).

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

## 10. 0.2.0 — P0b: nạp module, chuyển tool, móc mở rộng (BRIEF cho gói W1)
> Nguồn: SPEC-0.2.0 §2.4, §2.5, §9, §10, §13. P0b không viết tính năng: chỉ mở **điểm mở rộng có chữ ký cố định + test hợp đồng** để K, V, B, T, U, O sửa file RIÊNG của mình. Mọi op mới đi qua `write(actor, op, payload)` → kiểm lược đồ → kiểm quyền → ghi → audit; mỗi ô ✗ ở §10 của SPEC có test âm trong file test của gói sở hữu tính năng (mẫu: `test/h-hooks.test.js`).

### 10.1 Nạp module (mỗi thư mục: tên bắt đầu `_` là tiện ích, không nạp; trùng tên ⇒ ném lỗi lúc khởi động)
| Thư mục | Module export | Ghi chú |
|---|---|---|
| `server/ops/*.js` | `register(op, ctx)` | stub: `cast, brand, thumb, tutorial, publish, overview` (no-op, có `OWNER`). `ctx = { db, ws(), err, byRef, need, allow, isOwner, agentHas, nonEmpty, newVersion, getSetting, putSetting, checkPolicy, ext, rights, op, around, validateBlock }`. `op(name, who, run)`: `who` = khoá trong `ctx.allow` (`owner`, **`ownerUi`** = owner + phiên UI, `compose`, `run`, `composeOrSystem`, `suggest`, `system`…) hoặc hàm `(actor)→bool`; `run(c)→{result, entity:[kiểu,id], before, after}`, `c={a,p,by,actor,entry}`. `ctx.around(opName, wrap)` bọc op đã có (V bọc `cast.save`). Test: `createWriter(db, {opsDirs:[dir]})` nạp thêm module tạm. |
| `server/mcp-tools/*.js` | `tools(ctx)→[{name, scope, description, schema, required, handler(args,c)→{text,data,images?}}]`, tuỳ chọn `capabilities(ctx,args)→object` | `schema` = bản đồ `properties` (hoặc HÀM trả bản đồ). `ctx={db,write,config,deps?,caps}`; `require('./_kit.js').kit(ctx)` cho `fail, S/N/O, actorOf(c), need, channelOf, chanData, castOf, assigned, renderOf, ext`. Module hiện có: `task, capabilities, channel, cast, curriculum, asset, lesson, render, still`; stub `thumb, tutorial`. Tên tool duy nhất toàn hệ thống (`h-contracts`). Tool trả ảnh: `images:[{data(base64), mimeType}]` ⇒ MCP `image`. |
| `server/routes/*.js` | `register(add, rctx)` | `add(method, pattern, {sess?, ui?, strictOrigin?, raw?, pub?}, async fn({req,res,url,params,body,sess}))`; `rctx={ctx,db,write,config,actorOf,userActor,fail,need,J,send,readJson,firstChannel}`. Có `overview.js` (chuyển nguyên trạng, gói O mở rộng). (method, pattern) trùng ⇒ lỗi. |
| `server/grids/*.js` | `{name, grid}` | một lưới/file; cột 0.2.0 đã thêm sẵn: `lessons.kind/thumbnail`, `review_queue.kind/thumbs/cast_unapproved`, `assets.role/rights` (`attested\|pending\|exempt`), `cast.status/approved_version/approved_at`. `server/grids.js` chỉ còn bộ phân tích truy vấn + `runGrid`. |

### 10.2 Móc của cổng ghi — `write.ext` (`server/hooks.js`; đăng ký từ `ops/<gói>.js` qua `ctx.ext`)
| Móc | Chữ ký | Ai dùng |
|---|---|---|
| `lessonExt.register({name, columns, kinds?, schema?, validate?})` | `columns`: cột `lesson_versions` (`thumbnail`, `variant`, `screens`, `host`, `music`, hoặc `kind`); `kinds`: loại bài mới nhận (`['tutorial']`); `schema:{properties}` gộp vào inputSchema `validate/submit/update_lesson`; `validate(lv, {db,err,byRef,nonEmpty,ext}) → [{path,text}\|chuỗi]`, `lv = {kind, values:{[cột]}, payload, lines, beats, channel, channelData, prev, isNew}` | **T** (`thumbnail` + luật `channelData.policy.thumbnail_required`), **U** (`kind/variant/screens/host/music`, `kinds:['tutorial']`) |
| `lessonExt` quy tắc | cột không gửi ⇒ **kế thừa** version trước (update_lesson không phải gửi lại), gửi `null` ⇒ xoá; cột 0003 chưa ai nhận mà gửi ⇒ lỗi "chưa được bật"; `kind` ngoài `lessonExt.kinds()` ⇒ lỗi; khối kiểm theo `registry.names(kind)`. Bỏ đăng ký ⇒ `tutorial` biến mất (điều kiện cắt F4 §13.4). | |
| `channelDefaults.register(fn({p, actor, db}) → object\|null)` | gộp sâu DƯỚI `data` người gọi gửi, chỉ cho `channel.create`, chạy SAU kiểm trường chính sách (agent vẫn không tự đặt được) | **T** (`policy.thumbnail_required:true`), **B** (preset brand) |
| `suggestionApply.register(targetKind, {validate?(c,p), apply(c,sg)→object\|undefined})` | `validate` chạy ở `suggestion.create`; `apply` chạy TRONG tx của `suggestion.apply` (**chỉ owner + UI**, `ownerUi`); trả object gộp vào `audit.after` | **B** (`channel_brand`) |
| `gates.register(id, async fn({ctx,db,B,plan,render,rendered,tmp,run,mp4Path,mixPath,ffmpegPath}) → {gate,result,measure})` | cổng áp cho bài (theo `media/gates` `GATES`) ngoài 8 cổng R3; chưa đăng ký ⇒ `unknown` ⇒ chặn (INT-08). G-THUMB: `measure.variants=[{index,pass,score}]` quyết định phương án nào thành asset (`outputs.thumbs`); cả bộ trượt ⇒ `blocked thumb_fail` | **T** (`G-THUMB`), **U** (`G-CURSOR`) |
| `hooks.on('plan.input', ({B,input,ctx}))` | trước `buildPlan`: sửa `input` (`kind, variant, brand, assetRefs, persona, actorLayout:{[CM]:{mode,x,y,scale}}, cursor, screens`) | **U, V** |
| `hooks.on('plan.after', ({B,plan,ctx}))` | sau `buildPlan`, trước kiểm quyền asset: sửa `plan` (`plan.thumbs`, đẩy `plan.assetRefs`…) | **T** (`render/thumb.js resolveThumbs`), **B**, **U** |
| `hooks.on('export.after', ({ctx,render,actor,entry,dir,files}))` | sau `exportRender`; `entry` = `ui` (owner xuất) hoặc `mcp` (agent `get_export`) | **O** (`ops/publish.js`) |

### 10.3 Pipeline (`server/pipeline.js`) — hợp đồng đã móc
- `renderPlan({…, ffmpegPath})`. Plan v2 qua `buildPlan(input)`: `kind, variant, actors[].layout, cursor, screens, thumbs, assetRefs, persona, style.brand` (mặc định như SPEC §2.1). `kind:'tutorial'` ⇒ `render/engine/tutorial.js buildTutorialPlan` (stub ném `PlanError tutorial_unsupported`).
- **Quyền asset** (`server/rights.js`): trước khi dựng, mọi mục của `plan.assetRefs` (illustration v1 + hook thêm; AS-…/id/đường dẫn) phải qua `rights.missing(db, refs)`; thiếu ⇒ `blocked rights_missing {assets:[AS-…]}`. Luật: raster/audio `source!='system'` tạo từ `schema_migrations(3).applied_at` trở đi cần hàng `asset_rights` mới nhất là `attest`; SVG/hệ thống/asset cũ miễn. `asset.put` của owner trên **phiên UI** tự ghi `attest/owner_upload` (`pii_redacted` từ payload); agent/owner-http thì không. Op `asset.attest`/`revoke_attest` (owner + UI) thuộc **U**.
- **Cổng**: `gatesFor(kind, lv)` quyết định danh sách; 8 cổng R3 chạy như cũ, cổng khác qua `write.ext.gates`. `api.renderView` trả đúng danh sách (và `media.thumbs`, `render.kind`); `studio/views/review-room.js` không còn `GATE_ORDER`.
- **outputs**: gộp dần trong pipeline (`state.js`), `awaiting_review_at` ghi một lần; `gating` thêm `outputs.thumbs=[{variant,w1280,w1920,pass,score}]` (display_id asset); sau `awaiting_review` trigger khoá `outputs` (CNS-119).
- **Manifest**: thêm khoá CHỈ khi có dữ liệu — `brand_hash` (khi `render/brand.js normalize(channelData)` ≠ null), `parts_hash` (khi `render/cast library().hash`), `kind` (≠ lesson); nhân vật `approved` dùng `approved_version`, còn lại bản hiện hành.
- **Xuất**: có `outputs.thumbs` ⇒ `RD-….cover.jpg` (1280) + `RD-….cover-1920.jpg` = `renders.thumbnail_pick` hoặc phương án đạt có score cao nhất.

### 10.4 Sân khấu / UI
- `stage.js`: khối `place:'fullbleed'` (màn hình) vào `#layerFull`, `'track'` vào `#layerTrack` — phủ 1920×1080, **không** theo máy quay (`ctx.layers={full,track,hud,pip}`); `plan.actors[].layout.mode` `stage|pip|hidden` (PiP: `#pip` trong HUD, `.pip .actor` trong `tutorial.css`); `GSBrand.apply(rootEl, brand)` lúc `__load`, `GSBrand.inkFilter(svg, brand)` chỉ khi chuỗi SVG đổi. Stub: `render/stage/{brand,thumb}.js` (GSThumb stub hiểu `textOff`), `render/{brand,thumb}.js`, `render/engine/{tutorial,cursor-path,plan-error}.js`.
- UI: `studio/i18n/{core,ov,brand,cast,review,lessons,lists}.js` (`export {vi,en}`, KHÔNG trùng khoá giữa module — `test/h-studio.test.js`), `studio/i18n.js` là cửa cũ; `studio/css/{overview,brand,cast,review,lessons}.css` nối sẵn trong `index.html`; route `#/cast` (stub `views/cast.js`), alias `#/work_orders`; `gridView` đọc `?q=`; Phòng chiếu nạp làn `views/review-lanes/<tên>.js` (`OPTIONAL_LANES`, export `lane(env)→{key,label,draw(env,track)}`, thiếu file ⇒ bỏ qua).
- Agent: `agent/samples/<id>.json` (`GS_FAKE_SAMPLE`, `"$cast:<Tên>"` trong `extra`), `agent/prompt/*.md` (`{{task}} {{brief}} {{notes}} {{blocked}} {{work_order}} {{kind}}`, nối theo tên file).
- Still (`render_still`, `server/mcp-tools/still.js`): compose-only, 10 ảnh/phút/agent, `payload.assetRefs` chỉ nhận `AS-…`. **Ngân sách RAM (CNS-106: still ≤ 600 MB, render ≤ 1,5 GB) CHƯA cưỡng chế** — đo ở S7 trên Chromium thật; hiện chỉ có hàng đợi FIFO ≤ 8, hạn 15 s, Chromium ấm 60 s (`render/still.js`).

## 11. 0.2.0 — gói O: Tổng quan v2 + "đã đăng" (SPEC-0.2.0 §7, §10, §16)
- **`GET /api/overview?period=7d|30d|month`** (`server/routes/overview.js`): giữ nguyên mọi khoá 0.1.x, thêm `period, modules, kpi_period, kpi_today, risks{runway,voice_quota}, weekly, orders_by_state, curriculum{…,by_root,next}, recent_renders, recent_orders`. Phần v2 là `buildV2(db,{period,now})` (thuần đọc, nhận `now` để test). `period` sai ⇒ 400 `invalid`. Kỳ = N ngày LỊCH kết thúc hôm nay (7d/30d) hoặc từ mùng 1 (month), `to` = bây giờ.
- **Múi giờ (quyết định)**: mọi ranh giới ngày/tuần/kỳ và "hôm nay" theo `workspaces.timezone` (`pipeline.wsTz`). `provider_usage.day` vốn được GHI theo múi giờ đó (`pipeline.bumpUsage` → `localParts(…, wsTz)`), nên `voice_quota.used_today` tra đúng khoá ngày địa phương, không quy đổi UTC. `resets_at` = nửa đêm địa phương kế tiếp + 1 phút (cùng `nextMidnightIso` mà pipeline dùng để hẹn chạy lại).
- **Hạn mức giọng (STD-10)**: `scan.quota.of` ⇒ `limit=of`, `remaining=max(0, of−used)`; không có `of` mà có `value` ⇒ `remaining=value` (cùng nghĩa với pipeline), `limit=null`; `source` thiếu/`unknown` ⇒ `limit`, `remaining`, `lessons_left` = `null`, `level:'unknown'`. `calls_per_lesson` = TB tổng `runs.cost.calls` (kind `tts`/`voicing`) trên ≤ 7 Render gần nhất CÓ số liệu, không có ⇒ `null` (pipeline thật hiện chưa ghi `runs.cost`; seed thì có).
- **runway**: `per_day` = `channel.data.publish.per_day` (>0) rồi tới `schedule.per_run`; không có ⇒ `per_day/days:null`, `level:'unknown'` (không chia 0). `level`: danger <1 ngày, warn <3, ok. `weekly.target` = Σ `per_run` các kênh × 7.
- **Đã đăng** (`server/ops/publish.js`): hook `export.after` ⇒ op `render.export_stamp` (quyền `run`): luôn đặt `exported_at`; chỉ khi hook báo `entry==='ui'` VÀ actor là owner UI mới đặt `published_at/by`, `published_source='export'` (nếu đang NULL). Agent `get_export` (MCP) ⇒ chỉ `exported_at`. Công tắc tay `render.mark_published` / `render.unmark_published`: `ownerUi`, mark chỉ cho Render `approved`, idempotent, có audit.
- Bench F5-2: `node tools/bench-overview.js` (không chạy trong CI).

## 12. 0.2.0 — Gói T: ảnh bìa (thumbnail + G-THUMB)
> Nguồn: SPEC-0.2.0 §5. Mọi thứ đăng ký qua điểm mở rộng §10; không sửa lõi.
- **Dữ liệu**: `render/thumbs/templates.json` (4 mẫu: `host-shock-left`, `host-shock-right`, `duo-versus`, `big-visual`; toạ độ 1280×720, ×1,5 cho 1920). Bộ kiểm T9 (`checkTemplate`) chạy **ngay lúc `require('render/thumb.js')`** (CNS-101): lề 48, không hộp nào chạm vùng cấm 260×110 góc phải dưới, chỉ hộp mặt được `bleed`, hộp chữ không giao hộp mặt/sidekick/hình chủ đạo. Quy cách T1–T11 ở MỘT chỗ: `RULES` (đổi khi nền tảng đổi).
- **Đặc tả bài** `lesson_versions.thumbnail = {variants:[2–3 phương án]}` (lessonExt `thumbnail` trong `server/ops/thumb.js`): `{template, headline (≤ 6 từ/32 ký tự), highlight?, kicker?, face:{owner:true|cast:"CM-…", mood}, sidekick?:{cast, mood}, visual:{beat: số thứ tự nhịp (0,1,…) | "BT-…"} | {asset:"AS-…"}}`. Kiểm khô T3–T6 (+ T11 sớm) lúc `validate/submit/update_lesson`; `policy.thumbnail_required` (hoặc bài `tutorial`) ⇒ thiếu thì lỗi `thumbnail_required` kèm ví dụ. **Kênh tạo mới** (wizard/`channel.create`) mặc định `policy.thumbnail_required=true` qua `channelDefaults` (CNS-123); kênh cũ giữ nguyên. Mặt chính = `brand.thumb.faces` (PNG alpha, chính sách chỉ owner) → không có thì KOL `host_lead` + cảnh báo → không có KOL thì khung giữ chỗ có nhãn (không bao giờ qua G-THUMB).
- **Đường dựng**: hook `plan.after` → `resolveThumbs` (`render/thumb.js`, thuần) ⇒ `plan.thumbs` + asset vào `plan.assetRefs` (cùng cổng quyền `rights_missing`); `renderPlan` gọi `__still('thumb', spec)` hai lần (có chữ / `textOff`) trong cùng phiên Chromium; `GSStill.thumb` = `render/stage/thumb.js` (`GSThumb.render` trả bbox + cỡ chữ + độ cao đầu, toạ độ 1280). Asset của spec lấy từ `plan.assetData` của lần `__load` (renderPlan) hoặc `payload.assetData` (renderStill). Tất định: nhân vật vẽ ở t=0,9 s, khối ở trạng thái lắng.
- **G-THUMB** (`media/gates/thumb.js`, đăng ký qua `ext.gates`): giải ảnh bằng `ffmpeg -f rawvideo -pix_fmt rgb24`; mặt nạ chữ = pixel khác nhau > 24/255 giữa bản có chữ/không chữ; tương phản WCAG = luminance trung bình pixel chữ so với cùng pixel ở bản không chữ; T11 so từng cặp (phương án sau trượt nếu giống một phương án ĐÃ ĐẠT trước nó). `measure.variants[{index, pass, score, fails[], …}]` + `passed[]` + `text_human`; `pass` ⇔ ≥ 1 phương án đạt; không đo được ⇒ `unknown`. Pipeline chỉ biến phương án đạt thành asset (`outputs.thumbs`), cả bộ trượt ⇒ `blocked thumb_fail`.
- **Chọn ảnh bìa**: op `thumbnail.pick` (`ownerUi`, không có tool MCP — §10); `renders.thumbnail_pick` đổi được tới khi `exported_at`; gói xuất dùng phương án đã chọn, chưa chọn ⇒ đạt có `score` cao nhất.
- **MCP**: `propose_thumbnail_text` (khung chữ tất định, không LLM), `preview_thumbnail` (JPEG 640×360 + số đo, 6 lần/phút/agent), `get_capabilities.thumbnail` (mẫu, quy cách, `required`, `owner_faces`). Agent giả (`GS_FAKE_AGENT=1`) tự nộp ảnh bìa của mẫu `lesson-thumb` khi kênh yêu cầu.
- Test: `test/g-thumb.test.js` (quy cách, ca âm, tương phản, máy chủ), `g-thumb-render.test.js` (Chromium thật), `g-thumb-pipeline.test.js` (e2e qua pipeline, CNS-119); `writer({skipOps:['thumb.js']})` cho test dựng bản giả của gói T.

## 13. 0.2.0 — Gói L: giọng offline (VieNeu-TTS + faster-whisper)
> Nguồn: Second-Brain `xuong-video/spec/SPEC-0.2.0-L-voice-offline.md` (audit `audit/CNS-2026-10-29-voice-offline.md`). Ngoại lệ có chủ đích của §0 "Node thuần": phần Python nằm **riêng** trong image `voice` (sidecar), studio vẫn không có phụ thuộc runtime.
- **Kiến trúc**: container `voice` (profile compose `voice`, `Dockerfile.voice`) = `voice/server.py` (`http.server` thuần) + VieNeu-TTS v3 Turbo (ONNX/CPU) + faster-whisper (CTranslate2). Mạng `voice` `internal: true` chỉ có `studio` + `voice` (agent không ở đó), không `ports:`, không `/data`, rootfs chỉ đọc, `cap_drop: ALL`, `no-new-privileges`, `mem_limit` (`GS_VOICE_MEM`, mặc định 3g), user `gsvoice` (uid 10001). Bật: `install.sh --voice-offline` hoặc `genstudio voice pull` (ghi `COMPOSE_PROFILES=voice`); không cờ ⇒ installer không hỏi gì, chỉ in gợi ý (STD-06).
- **Model** (`voice/models.json`): repo + commit 40 hex + sha256/size từng tệp. `voice-pull` (cùng image, profile `voice-pull`, mạng `gs`) tải `https://huggingface.co/<repo>/resolve/<commit>/<path>` bằng `urllib` → `.part` → kiểm sha256 + size → `rename`. Lúc khởi động `serve` băm lại mọi tệp; thiếu ⇒ `state=missing`, lệch/symlink ⇒ `error` và **không nạp**. Phục vụ với `HF_HUB_OFFLINE=1`; `OnnxV3LiteEngine._fetch` bị thay để chỉ trả thư mục codec đã kiểm (SDK 3.8.3 không chuyển `codec_dir`). Chọn: `GS_VOICE_PRECISION=fp32|int8` → `vieneu-v3-turbo-<p>`, `GS_VOICE_JUDGE=small|medium` → `faster-whisper-<j>`, luôn kèm `moss-audio-tokenizer-nano`. Python deps: `voice/requirements.lock` (`==` + `--hash`, cài `--require-hashes --no-deps --only-binary=:all:`; bỏ gradio/librosa/kaldi của SDK).
- **HTTP** (gốc `GS_VOICE_URL`, mặc định `http://voice:7491`; lỗi luôn `{"error":{"code","message"}}`, không stack):
  - `GET /health` → `{ok, service:"gen-studio-voice", version, state: missing|verifying|loading|ready|error, ready, precision, models:[{kind: tts|codec|judge, model, ready, revision}], voices:[{id, name, gender, accent, style}], detail}` (luôn 200).
  - `POST /tts` JSON `{model?, voice, text, seed?, style?}` → `audio/wav` PCM16 mono 48 kHz (WAV 44 byte đầu, fade 10 ms hai đầu), header `X-Duration-Ms`, `X-Model`, `X-Gen-Seconds`. `voice` = id ASCII (`DoanTrang`…, suy từ tên preset). `seed` 0…2³²−1 ⇒ tất định; pipeline không truyền. `style` bị VieNeu v3 Turbo bỏ qua.
  - `POST /judge` JSON `{model?, wav_b64, lang?:"vi"}` → `{model, transcript, words:[{w, t0, t1, p}], language, duration_ms}` (ms từ đầu clip, kẹp trong [0, duration]). Sidecar **không** nhận kịch bản (giám khảo nghe "mù").
  - Mã lỗi: 400 `bad_request`/`bad_audio` (magic `RIFF…WAVE` sai, không PCM16, rỗng) · 404 `unknown_voice`/`unknown_model`/`not_found` · 413 `too_large` (body > 20 MB, text > 1000 ký tự, audio > 120 s) · 415 `unsupported_media_type` · 503 `not_ready`/`busy` (+`Retry-After`) · 504 `timeout` (`GS_VOICE_TIMEOUT_S`, 180) · 500 `internal`. Một request nặng mỗi lúc (lock); socket timeout 30 s.
- **Adapter** `media/providers/offline.js` (đăng ký ở `media/providers/index.js` `ADAPTERS`; `get(config, vendor)` — pipeline lấy adapter theo vendor của **từng** kind, trộn được offline + Gemini): `tts` → `{raw, wav, duration_ms}` như Gemini (kiểm magic, `wav.parse`); `judge` → đúng khoá `{transcript, matches, extra_speech, terms, detected_terms, word_times}`: `matches` = `dist(normText)` ≤ 0,15 (dùng chung `media/gates/voice.js`), `extra_speech` = số từ nghe > kịch bản + max(2, 25 %), `terms[t]` = `english` nếu lời chép có đúng chính tả Latin (cửa sổ 1–4 token; viết tắt phải in hoa) ngược lại `vietnamese` (chặt: tạo lại, không bao giờ `unknown`), `word_times` = từ của whisper. Giọng Gemini cũ trong cast (`Charon`, `Leda`…) đổi sang preset cùng giới theo bảng ưu tiên đối chiếu danh sách **quét** (`/health`). Lỗi: không kết nối / timeout / 503 / 504 ⇒ `transient` (chữ kèm `genstudio voice pull`, pipeline giữ nguyên chữ này khi chặn `provider_transient`); 4xx, WAV/JSON hỏng ⇒ `bad_output`; không có `quota`/`auth`. `probe` ⇒ `models` (tts, judge), `voices` (id), `quota {value:null, source:'local'}`, `service {state, ready, detail, precision, voices[{id,name,gender,accent}]}` → `scanProvider` lưu `scan.service`.
- **Dữ liệu/quyền**: `providers.vendor ∈ {gemini, offline}`; offline không khoá (`key` ⇒ `invalid`), chỉ `tts|judge`; lưu/quét/bật-tắt vẫn là op owner (`provider.save`, `provider.scan_result`) — agent không có tool mới. `PREFERRED_BY_VENDOR.offline` = `vieneu-v3-turbo-fp32|int8`, `faster-whisper-small|medium`. Manifest: `providers.align.method = 'asr_word_times|chars'` khi giám khảo offline (Gemini giữ chuỗi cũ). Lược đồ nhân vật: `voice.provider ∈ {gemini, offline}`, tên giọng offline kiểm theo `providers.scan.voices` (chưa quét ⇒ cảnh báo `voice_unscanned`). Lưới `providers` thêm cột `service_state`, `voices`.
- **UI**: bước Giọng đọc (`studio/views/setup.js`) hai thẻ Gemini / Giọng offline; `studio/views/voice-offline.js` (`ensureOffline` không tạo trùng, `offlineStatus`); màn Nhà cung cấp: nút *Bật giọng offline*, trạng thái dịch vụ + lệnh, *Tắt/Bật nhà cung cấp này*. Chuỗi: `studio/i18n/voice.js`.
- **Số đo thật (2026-10-29, cloud x86_64, 4 vCPU, 15 GB RAM, Docker, fp32 + whisper small int8, 4 luồng)**:

  | Đo | Kết quả |
  |---|---|
  | Image `voice` | 892 MB trên đĩa (212 MB nén) |
  | Model tải lần đầu (`pull`, fp32 + codec decode + small) | ~1,01 GB, 47 s ở máy cloud |
  | Khởi động `serve` (băm sha256 ~1 GB + nạp) | ~12 s tới `ready` |
  | RAM container | nghỉ 1,46 GiB · đỉnh 1,92 GiB khi chạy bài |
  | RTF TTS (10 câu, 2 giọng, 26,7 s âm thanh, gồm HTTP) | **0,79** |
  | RTF giám khảo whisper small | **0,69** (câu rất ngắn có thể lâu bất thường: 5,3 s cho 1,4 s) |
  | Pipeline thật 5 câu (20,6 s video) qua `GS_VOICE_URL`, Chromium + ffmpeg thật | `awaiting_review`, 8/8 cổng đạt, 128 s tổng (gồm 3 take tạo lại vì G-PRON) |
  | Câu rất ngắn «À, ra vậy!» | 0/6 take whisper small chép đúng (nghe "xa vậy", "dạ vội", "Hẹn gặp lại"); medium 1/6 ⇒ dễ bị chặn `gate_fail` sau 2 lần tạo lại |
- **Giới hạn đã biết**: arm64 (Mac Docker Desktop) chưa kiểm (wheel aarch64 có đủ trong lock); G-PRON offline là heuristic từ lời chép; câu ≤ 3 tiếng hay bị nghe sai; tải lần đầu cần mạng tới huggingface.co.
- Test: `test/g-offline-provider.test.js` (sidecar giả qua HTTP thật: shape, lỗi, timeout, pipeline tới `awaiting_review`, trộn vendor, chặn khi sidecar tắt), `voice/test_server.py` (hợp đồng, không cần model/numpy: health, 400/404/413/415/503/504, magic bytes, lock, sha256/symlink, pull đúng revision), `test/f-compose.test.js` (cô lập mạng, hạ quyền, lock có hash, installer không hỏi).
