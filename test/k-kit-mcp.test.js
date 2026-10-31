// © 2026 Gen Labs — All rights reserved.
// Gói 0.3.0-B (SPEC-GK-0.1): MCP nộp hàng theo phiếu + token nộp có hạn. Luồng trọn qua HTTP /mcp thật (không bypass):
// token → kit_list → kit_claim → kit_submit (PNG 2048² nền đúng, ffmpeg) → checks pass → "Chờ duyệt" (submitted);
// submit sai nền → rework lần 1, 2; lần 3 → chờ Ryan (blocked_for_ryan); token hết hạn/thu hồi → 401;
// kit_upload_chunk 3 MB ghép đúng sha256; kit_report_blocked. Cần ffmpeg trên máy (như test/j-checks.test.js).
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const { execFileSync } = require('node:child_process');
const { bootTmp, mcpCall } = require('./d-helpers.js');

const FF = process.env.FFMPEG_PATH || process.env.GS_FFMPEG_PATH || 'ffmpeg';
let hasFfmpeg = true;
try { execFileSync(FF, ['-version'], { stdio: 'ignore' }); } catch { hasFfmpeg = false; }
const skip = (t) => { if (!hasFfmpeg) { t.skip('không có ffmpeg trên máy này'); return true; } return false; };

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'gs-k-'));
test.after(() => fs.rmSync(tmp, { recursive: true, force: true }));
const ff = (...a) => execFileSync(FF, ['-hide_banner', '-loglevel', 'error', '-y', ...a]);
// PR-01/PR-02 (gói E, review #4/#7) đòi có VẬT thật trong khung (không chỉ nền phẳng) cách mép ≥64px — vẽ thêm một
// hộp màu khác hẳn nền ở giữa khung làm "vật" (giống test/j-checks.test.js bgWithBoxes).
function flatPng(file, { w, h, color = '0x00B140', withSubject = true }) {
  const vf = withSubject ? ['-vf', `drawbox=x=${Math.round(w * 0.3)}:y=${Math.round(h * 0.3)}:w=${Math.round(w * 0.4)}:h=${Math.round(h * 0.4)}:color=0x336699:t=fill`] : [];
  ff('-f', 'lavfi', '-i', `color=c=${color}:s=${w}x${h}`, ...vf, '-frames:v', '1', file);
}

const CLI = { type: 'cli', entry: 'cli' };
async function museToken(ctx, { expires_at = null, revoke = false } = {}) {
  const r = ctx.write(CLI, 'agent.create', { name: 'Muse test', scopes: ['assets.submit'], kind: 'token', token_expires_at: expires_at });
  if (revoke) ctx.write(CLI, 'agent_token.revoke', { token: r.token_id });
  return r;
}
async function reviewToken(ctx) { return ctx.write(CLI, 'agent.create', { name: 'Review test', scopes: ['assets.review'], kind: 'token' }); }

test('k-kit-mcp: token → kit_list → kit_claim → kit_submit (PNG nền đúng) → checks pass → Chờ duyệt', async (t) => {
  if (skip(t)) return;
  const b = await bootTmp();
  try {
    b.app.ctx.write(CLI, 'kit.sync', {});
    const muse = await museToken(b.app.ctx);
    const list = await mcpCall(b.base, muse.token, 'kit_list', { group: 'NB-05', state: 'free' });
    assert.equal(list.status, 200, list.text);
    const items = list.json.result.structuredContent.items;
    assert.ok(items.some((x) => x.code === 'prop.tech.01'), JSON.stringify(items));

    const claim = await mcpCall(b.base, muse.token, 'kit_claim', { kit_slot: 'prop.tech.01' });
    assert.ok(!claim.json.result.isError, JSON.stringify(claim.json));
    assert.equal(claim.json.result.structuredContent.kit_slot, 'prop.tech.01');

    const f = path.join(tmp, 'prop-ok.png');
    flatPng(f, { w: 2048, h: 2048 });
    const b64 = fs.readFileSync(f).toString('base64');
    const sub = await mcpCall(b.base, muse.token, 'kit_submit', { kit_slot: 'prop.tech.01', declared_mime: 'image/png', data_base64: b64 });
    assert.ok(!sub.json.result.isError, JSON.stringify(sub.json.result));
    const d = sub.json.result.structuredContent;
    assert.equal(d.verdict, 'pass', JSON.stringify(d.checks));
    assert.equal(d.state, 'submitted', 'nền đúng ⇒ không rework, nằm hàng "Chờ duyệt"');
    assert.match(d.submission, /^SB-/);

    // review: nằm trong hàng chờ, đề xuất được (không đổi trạng thái)
    const review = await reviewToken(b.app.ctx);
    const rl = await mcpCall(b.base, review.token, 'kit_review_list', {});
    assert.ok(rl.json.result.structuredContent.items.some((x) => x.submission === d.submission));
    const prop = await mcpCall(b.base, review.token, 'kit_propose', { submission: d.submission, verdict: 'approve', reason: 'Đạt mọi tiêu chí máy kiểm.' });
    assert.ok(!prop.json.result.isError, JSON.stringify(prop.json.result));
    assert.equal(b.app.ctx.db.get("SELECT state FROM asset_submissions WHERE display_id=?", d.submission).state, 'submitted', 'propose không tự đổi trạng thái');

    // slot đã nộp ⇒ không còn "free"
    const list2 = await mcpCall(b.base, muse.token, 'kit_list', { group: 'NB-05' });
    const row = list2.json.result.structuredContent.items.find((x) => x.code === 'prop.tech.01');
    assert.equal(row.status, 'submitted');
  } finally { await b.clean(); }
});

test('k-kit-mcp: submit sai nền → rework lần 1, 2; lần 3 → chờ Ryan (blocked_for_ryan) — KHÔNG truyền previous (review mục 2: server tự nối chuỗi)', async (t) => {
  if (skip(t)) return;
  const b = await bootTmp();
  try {
    b.app.ctx.write(CLI, 'kit.sync', {});
    const muse = await museToken(b.app.ctx);
    const badPng = (n) => { const f = path.join(tmp, `bad-${n}.png`); flatPng(f, { w: 2048, h: 2048, color: '0x04A53C' }); return f; }; // bg sai (MR-051)
    // review Gen mục 2 [chặn]: tool kit_submit KHÔNG còn nhận `previous` — gọi lại CÙNG kit_slot, server tự tìm lần
    // nộp "rework" gần nhất của agent để nối chuỗi. Không truyền previous ở cả 3 lần dưới đây.
    const submit = (n) => mcpCall(b.base, muse.token, 'kit_submit', {
      kit_slot: 'prop.tech.02', declared_mime: 'image/png', data_base64: fs.readFileSync(badPng(n)).toString('base64'),
    });

    const r1 = await submit(1);
    const d1 = r1.json.result.structuredContent;
    assert.equal(d1.verdict, 'rework'); assert.equal(d1.state, 'rework');

    const r2 = await submit(2);
    const d2 = r2.json.result.structuredContent;
    assert.equal(d2.verdict, 'rework'); assert.equal(d2.state, 'rework');
    assert.equal(b.app.ctx.db.get('SELECT previous_id FROM asset_submissions WHERE display_id=?', d2.submission).previous_id,
      b.app.ctx.db.get('SELECT id FROM asset_submissions WHERE display_id=?', d1.submission).id, 'server tự nối previous_id dù client không gửi');

    const r3 = await submit(3);
    const d3 = r3.json.result.structuredContent;
    assert.equal(d3.verdict, 'rework');
    assert.equal(d3.state, 'blocked_for_ryan', 'lần 3 liên tiếp ⇒ chờ Ryan, không tự rework nữa');
    assert.ok(d3.rework.blocked); assert.match(d3.rework.suggestion, /^SG-/);
    // submission chuyển sang "blocked" (cờ bền, PR #33 review #5) — Gen không có quyền rework/approve/reject ở lần 3,
    // chỉ owner áp dụng đề xuất SG- (suggestion.apply) mới đổi tiếp được (INT-GK-04).
    assert.equal(b.app.ctx.db.get('SELECT state FROM asset_submissions WHERE display_id=?', d3.submission).state, 'blocked');
  } finally { await b.clean(); }
});

test('k-kit-mcp: token hết hạn → 401; thu hồi → 401', async (t) => {
  const b = await bootTmp();
  try {
    b.app.ctx.write(CLI, 'kit.sync', {});
    const expired = await museToken(b.app.ctx, { expires_at: '2020-01-01T00:00:00.000Z' });
    const r1 = await mcpCall(b.base, expired.token, 'kit_list', {});
    assert.equal(r1.status, 401, r1.text);

    const live = await museToken(b.app.ctx);
    const ok = await mcpCall(b.base, live.token, 'kit_list', {});
    assert.equal(ok.status, 200);
    b.app.ctx.write(CLI, 'agent_token.revoke', { token: live.token_id });
    const r2 = await mcpCall(b.base, live.token, 'kit_list', {});
    assert.equal(r2.status, 401, r2.text);
  } finally { await b.clean(); }
});

test('k-kit-mcp: kit_upload_chunk 3 MB ghép đúng sha256 rồi kit_submit dùng upload_session', async (t) => {
  if (skip(t)) return;
  const b = await bootTmp();
  try {
    b.app.ctx.write(CLI, 'kit.sync', {});
    const muse = await museToken(b.app.ctx);
    // ~11 s sine 48kHz/24-bit stereo ≈ 3 MB (288 000 B/s) — nội dung thật để qua magic bytes WAV (không cần checks pass).
    const f = path.join(tmp, 'sfx-3mb.wav');
    ff('-f', 'lavfi', '-i', 'sine=frequency=440:sample_rate=48000:duration=11', '-ac', '2', '-sample_fmt', 's32', '-c:a', 'pcm_s24le', f);
    const raw = fs.readFileSync(f);
    assert.ok(raw.length > 2.5 * 1024 * 1024 && raw.length < 4 * 1024 * 1024, `kích thước thử: ${raw.length}`);
    const expectedSha = crypto.createHash('sha256').update(raw).digest('hex');

    const start = await mcpCall(b.base, muse.token, 'kit_upload_chunk', { action: 'start', kit_slot: 'audio.sfx.whoosh.01', declared_mime: 'audio/wav' });
    const session = start.json.result.structuredContent.session;
    assert.ok(session);
    const CHUNK = 1024 * 1024;
    let idx = 0;
    for (let off = 0; off < raw.length; off += CHUNK) {
      const part = raw.subarray(off, Math.min(off + CHUNK, raw.length));
      const r = await mcpCall(b.base, muse.token, 'kit_upload_chunk', { action: 'chunk', session, index: idx, data_base64: part.toString('base64') });
      assert.ok(!r.json.result.isError, JSON.stringify(r.json.result));
      idx++;
    }
    const fin = await mcpCall(b.base, muse.token, 'kit_upload_chunk', { action: 'finish', session });
    assert.ok(!fin.json.result.isError, JSON.stringify(fin.json.result));
    assert.equal(fin.json.result.structuredContent.bytes, raw.length);

    const sub = await mcpCall(b.base, muse.token, 'kit_submit', { kit_slot: 'audio.sfx.whoosh.01', upload_session: session });
    assert.ok(!sub.json.result.isError, JSON.stringify(sub.json.result));
    const d = sub.json.result.structuredContent;
    const asset = b.app.ctx.db.get('SELECT * FROM assets WHERE display_id=?', d.asset);
    assert.equal(asset.sha256, expectedSha, 'chunk ghép đúng — sha256 khớp tệp gốc');
    assert.equal(asset.bytes, raw.length);
  } finally { await b.clean(); }
});

test('k-kit-mcp: kit_report_blocked ghi lý do, bỏ claim', async (t) => {
  const b = await bootTmp();
  try {
    b.app.ctx.write(CLI, 'kit.sync', {});
    const muse = await museToken(b.app.ctx);
    await mcpCall(b.base, muse.token, 'kit_claim', { kit_slot: 'prop.tech.03' });
    const before = b.app.ctx.db.get('SELECT claimed_by FROM kit_slots WHERE code=?', 'prop.tech.03');
    assert.ok(before.claimed_by);
    const r = await mcpCall(b.base, muse.token, 'kit_report_blocked', { kit_slot: 'prop.tech.03', reason: 'Thiếu ảnh tham chiếu để vẽ đúng chi tiết.' });
    assert.ok(!r.json.result.isError, JSON.stringify(r.json.result));
    const after = b.app.ctx.db.get('SELECT claimed_by FROM kit_slots WHERE code=?', 'prop.tech.03');
    assert.equal(after.claimed_by, null);
  } finally { await b.clean(); }
});

test('0.3.0-B (review Gen, mục 3 [nên]): submit không nộp được vào ô agent khác đang giữ claim còn sống; claim của người khác không bị xoá', async (t) => {
  if (skip(t)) return;
  const b = await bootTmp();
  try {
    b.app.ctx.write(CLI, 'kit.sync', {});
    const museA = await museToken(b.app.ctx);
    const museB = await museToken(b.app.ctx);
    const claimA = await mcpCall(b.base, museA.token, 'kit_claim', { kit_slot: 'prop.tech.04' });
    assert.ok(!claimA.json.result.isError, JSON.stringify(claimA.json.result));

    const f = path.join(tmp, 'steal.png');
    flatPng(f, { w: 2048, h: 2048 });
    const b64 = fs.readFileSync(f).toString('base64');
    const stolen = await mcpCall(b.base, museB.token, 'kit_submit', { kit_slot: 'prop.tech.04', declared_mime: 'image/png', data_base64: b64 });
    assert.ok(stolen.json.result.isError, 'agent B không nộp được vào ô agent A đang giữ');
    assert.equal(stolen.json.result.structuredContent.error.code, 'conflict');

    // claim của A còn nguyên — B không xoá mất được
    const row = b.app.ctx.db.get('SELECT claimed_by FROM kit_slots WHERE code=?', 'prop.tech.04');
    assert.equal(row.claimed_by, museA.agent.id);

    // chính A nộp bình thường được
    const okSub = await mcpCall(b.base, museA.token, 'kit_submit', { kit_slot: 'prop.tech.04', declared_mime: 'image/png', data_base64: b64 });
    assert.ok(!okSub.json.result.isError, JSON.stringify(okSub.json.result));
  } finally { await b.clean(); }
});

test('0.3.0-B (review Gen, mục 4 [nên], IDOR): kit_submit với upload_session của agent khác (đã done) bị từ chối, không đọc trộm được nội dung', async (t) => {
  const b = await bootTmp();
  try {
    b.app.ctx.write(CLI, 'kit.sync', {});
    const museA = await museToken(b.app.ctx);
    const museB = await museToken(b.app.ctx);
    const startA = await mcpCall(b.base, museA.token, 'kit_upload_chunk', { action: 'start', kit_slot: 'audio.sfx.whoosh.02', declared_mime: 'audio/wav' });
    const session = startA.json.result.structuredContent.session;
    await mcpCall(b.base, museA.token, 'kit_upload_chunk', { action: 'chunk', session, index: 0, data_base64: Buffer.from('bi-mat-cua-A').toString('base64') });
    await mcpCall(b.base, museA.token, 'kit_upload_chunk', { action: 'finish', session });

    // B dùng session của A (state='done') — phải bị từ chối, không lấy được nội dung của A
    const stolen = await mcpCall(b.base, museB.token, 'kit_submit', { kit_slot: 'audio.sfx.whoosh.02', upload_session: session });
    assert.ok(stolen.json.result.isError, 'agent B không dùng được upload_session của agent A');
    assert.equal(stolen.json.result.structuredContent.error.code, 'not_found');
  } finally { await b.clean(); }
});

test('0.3.0-B (review Gen, mục 5 [nên]): upload.start giới hạn ≤3 phiên mở/agent; phiên quá hạn 24h tự dọn (unlink + aborted)', async (t) => {
  const b = await bootTmp();
  try {
    b.app.ctx.write(CLI, 'kit.sync', {});
    const muse = await museToken(b.app.ctx);
    const starts = [];
    for (let i = 0; i < 3; i++) {
      const r = await mcpCall(b.base, muse.token, 'kit_upload_chunk', { action: 'start', kit_slot: 'audio.sfx.whoosh.03', declared_mime: 'audio/wav' });
      assert.ok(!r.json.result.isError, JSON.stringify(r.json.result));
      starts.push(r.json.result.structuredContent.session);
    }
    const r4 = await mcpCall(b.base, muse.token, 'kit_upload_chunk', { action: 'start', kit_slot: 'audio.sfx.whoosh.03', declared_mime: 'audio/wav' });
    assert.ok(r4.json.result.isError, 'phiên thứ 4 bị chặn (trần 3 phiên mở/agent)');
    assert.equal(r4.json.result.structuredContent.error.code, 'conflict');

    // ép phiên đầu tiên "quá hạn 24h" rồi gọi start lần nữa — phiên cũ bị dọn (unlink + aborted), trần được nhả ra
    const old = new Date(Date.now() - 25 * 3600e3).toISOString();
    b.app.ctx.db.run('UPDATE upload_sessions SET created_at=? WHERE id=?', old, starts[0]);
    const tmpPathRow = b.app.ctx.db.get('SELECT tmp_path FROM upload_sessions WHERE id=?', starts[0]);
    assert.ok(require('node:fs').existsSync(tmpPathRow.tmp_path), 'tệp tạm tồn tại trước khi dọn');

    const r5 = await mcpCall(b.base, muse.token, 'kit_upload_chunk', { action: 'start', kit_slot: 'audio.sfx.whoosh.03', declared_mime: 'audio/wav' });
    assert.ok(!r5.json.result.isError, 'phiên cũ đã dọn ⇒ mở phiên mới được');
    assert.equal(b.app.ctx.db.get('SELECT state FROM upload_sessions WHERE id=?', starts[0]).state, 'aborted');
    assert.equal(require('node:fs').existsSync(tmpPathRow.tmp_path), false, 'tệp tạm bị unlink khi dọn');
  } finally { await b.clean(); }
});
