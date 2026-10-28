// © 2026 Gen Labs — All rights reserved.
// Gói T — e2e QUA pipeline thật (Chromium + ffmpeg + giọng giả): bài có `thumbnail` ⇒ awaiting_review với outputs.thumbs (CNS-119), cổng G-THUMB trong 9 cổng, CHỈ phương án đạt thành asset,
// cả bộ trượt ⇒ blocked thumb_fail, ảnh mặt do agent tải lên chưa xác nhận quyền ⇒ rights_missing, owner chọn ảnh bìa (thumbnail.pick) ⇒ gói xuất đúng phương án.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const pipeline = require('../server/pipeline.js');
const state = require('../server/state.js');
const events = require('../server/events.js');
const G = require('../media/gates/thumb.js');
const { gatesFor } = require('../media/gates/index.js');
const cast = require('../render/cast');
const { tmpDb, owner, agent } = require('./a-helpers');
const H = require('./g-thumb-helpers');

const SKIP = H.NO_BROWSER_OR_FFMPEG;
const OPTS = { skip: SKIP, timeout: 420000 };

// kênh MỚI (mặc định bắt buộc ảnh bìa, CNS-123) + ảnh mặt chủ kênh do owner tải lên (tự có quyền owner_upload) + 2 nhân vật mặc định
function studio({ alpha = true, by = null } = {}) {
  const t = tmpDb(), o = owner(t.db);
  const faceBytes = H.ownerFacePng({ alpha });
  const face = t.write(by || o, 'asset.put', { kind: 'image', mime: 'image/png', bytes: faceBytes, meta: { role: 'thumb_face' } });
  const ch = t.write(o, 'channel.create', { name: 'Kênh ảnh bìa', data: { brand: { thumb: { faces: [{ asset: face.display_id, mood: 'shock' }] } } } });
  const hosts = cast.samples();
  const m1 = t.write(o, 'cast.save', { channel: ch.display_id, name: 'Anh Gen', data: hosts[0] });
  const m2 = t.write(o, 'cast.save', { channel: ch.display_id, name: 'Bé Hỏi', data: hosts[1] });
  const ctx = { db: t.db, write: t.write, events: events.create(), config: { dataDir: t.dir, fakeProviders: true, ffmpegPath: H.FFMPEG, chromiumPath: null, version: 'test' }, pipelineOpts: { backoffMs: 1 } };
  return { t, o, ch, m1, m2, face, ctx };
}
const lesson = (s, thumbnail) => ({ channel: s.ch.display_id, title: 'Vì sao A.I. sai?', thumbnail,
  lines: [{ who: s.m2.display_id, say: 'Sao vậy ạ?' }],   // MỘT câu ngắn: dựng hình thật (Chromium phần mềm) tốn ~0,3 s/khung, mỗi giây clip = 30 khung; Anh Gen chỉ xuất hiện ở ảnh bìa (công thức nạp từ DB)
  beats: [{ block: 'title', anchor: { line: 0, word: 'Sao' }, params: { text: 'Vì sao A.I. sai?' } }, { block: 'stamp', anchor: { line: 0, word: 'vậy' }, params: { text: 'ĐOÁN ≠ BIẾT', sub: '' } }] });
async function run(s, body) {
  const r = s.t.write(s.o, 'lesson.submit', body);
  const w = pipeline.startWorkers(s.ctx, { pollMs: 20 });
  try { await w.idle(380000); } finally { w.stop(); }
  return s.t.db.json(s.t.db.get('SELECT * FROM renders WHERE display_id=?', r.render.display_id));
}
const V = {
  owner: { template: 'host-shock-left', headline: 'AI bịa chuyện thế nào?', highlight: 'bịa', kicker: 'SỰ THẬT', face: { owner: true, mood: 'shock' }, sidekick: { cast: 'CM-0002', mood: 'panic' }, visual: { beat: 0 } },
  duo: { template: 'duo-versus', headline: 'Máy đoán chữ kế tiếp', highlight: 'đoán', face: { cast: 'CM-0001', mood: 'vow' }, sidekick: { cast: 'CM-0002', mood: 'panic' }, visual: { beat: 1 } },
  big: { template: 'big-visual', headline: 'Đoán chứ không biết', highlight: 'Đoán', kicker: 'SỐ LIỆU', face: { cast: 'CM-0002', mood: 'excited' }, visual: { beat: 1 } },
};
const fileOf = (db, id) => path.join(db.dataDir, db.get('SELECT path FROM assets WHERE display_id=?', id).path);

test('pipeline: bài có thumbnail ⇒ awaiting_review + outputs.thumbs (CNS-119), 9 cổng pass (G-THUMB), CHỈ phương án đạt thành asset, JPEG đúng cỡ; outputs bất biến; chọn ảnh bìa ⇒ gói xuất đúng phương án', OPTS, async () => {
  const s = studio(), { t } = s;
  try {
    const r = await run(s, lesson(s, { variants: [V.owner, V.duo, Object.assign({}, V.duo, { kicker: 'MỚI' })] }));   // phương án 3 gần y hệt phương án 2: qua kiểm khô, trượt T11 trên pixel
    assert.equal(r.state, 'awaiting_review', JSON.stringify(r.blocked_reason));
    assert.ok(r.awaiting_review_at, 'awaiting_review_at ghi một lần');
    const th = r.outputs.thumbs;
    assert.deepEqual(th.map((x) => x.variant), [0, 1], 'CHỈ phương án đạt thành asset: phương án 3 (trùng phương án 2, T11) bị bỏ');
    for (const x of th) {
      assert.equal(x.pass, true); assert.ok(x.score > 0.5 && x.score <= 1);
      assert.deepEqual(G.jpegSize(fs.readFileSync(fileOf(t.db, x.w1280))), [1280, 720]); assert.deepEqual(G.jpegSize(fs.readFileSync(fileOf(t.db, x.w1920))), [1920, 1080]);
    }
    assert.ok(r.outputs.mp4 && r.outputs.srt_vi && r.outputs.cover, 'mp4/srt/cover kiểu cũ không mất khi gộp outputs.thumbs');
    const gates = t.db.all("SELECT gate, result, measure FROM gate_results WHERE subject_kind='render' AND subject_id=?", r.id);
    assert.deepEqual(gates.map((g) => g.gate).sort(), gatesFor('lesson', { thumbnail: 'x' }).slice().sort()); assert.ok(gates.length >= 9);
    assert.ok(gates.every((g) => g.result === 'pass'), JSON.stringify(gates.filter((g) => g.result !== 'pass')));
    const gm = t.db.json(gates.find((g) => g.gate === 'G-THUMB')).measure;
    assert.deepEqual(gm.passed, [0, 1]); assert.equal(gm.variants[0].face, 'owner', 'mặt chính = ảnh chủ kênh'); assert.match(gm.text_human, /^2\/3 phương án đạt/);
    assert.deepEqual(gm.variants[2].fails.map((f) => f.rule), ['T11']); assert.ok(gm.variants[2].min_diff_other < 0.1);
    assert.equal(t.db.all("SELECT * FROM assets WHERE meta LIKE '%\"role\":\"thumb\"%'").length, 4, '2 phương án đạt × (1280 + 1920)');
    // CNS-119: sau khi rời pipeline, outputs bất biến
    assert.throws(() => t.db.run('UPDATE renders SET outputs=? WHERE id=?', JSON.stringify({}), r.id), /bất biến/);
    // duyệt + chọn ảnh bìa + xuất
    const u = t.db.get('SELECT id FROM users LIMIT 1');
    state.review(t.db, { user: { id: u.id, role: 'owner' }, renderId: r.id, decision: 'approved', notes: [], reviewSeconds: 5, entry: 'ui' });
    const row = () => t.db.get('SELECT * FROM renders WHERE id=?', r.id);
    const best = th.reduce((a, b) => (b.score > a.score ? b : a)), worst = th.reduce((a, b) => (b.score < a.score ? b : a));
    const ex1 = pipeline.exportRender(s.ctx, row());
    assert.ok(ex1.files.includes(r.display_id + '.cover.jpg') && ex1.files.includes(r.display_id + '.cover-1920.jpg'));
    assert.ok(fs.readFileSync(path.join(ex1.dir, r.display_id + '.cover.jpg')).equals(fs.readFileSync(fileOf(t.db, best.w1280))), 'chưa chọn ⇒ phương án đạt có score cao nhất');
    if (worst.variant !== best.variant) {
      t.write(s.o, 'thumbnail.pick', { render: r.display_id, variant: worst.variant });
      assert.equal(row().thumbnail_pick, worst.w1280);
      const ex2 = pipeline.exportRender(s.ctx, row());
      assert.ok(fs.readFileSync(path.join(ex2.dir, r.display_id + '.cover.jpg')).equals(fs.readFileSync(fileOf(t.db, worst.w1280))), 'đã chọn ⇒ đúng phương án chọn');
      assert.ok(fs.readFileSync(path.join(ex2.dir, r.display_id + '.cover-1920.jpg')).equals(fs.readFileSync(fileOf(t.db, worst.w1920))));
    }
    assert.throws(() => t.write(agent(['read', 'compose', 'run']), 'thumbnail.pick', { render: r.display_id, variant: 0 }), (e) => e.code === 'forbidden', 'agent ✗ chọn ảnh bìa');
  } finally { t.clean(); }
});

test('pipeline: cả bộ ảnh bìa trượt (ảnh mặt chủ kênh không có alpha ⇒ T5) ⇒ blocked thumb_fail kèm số đo từng phương án, không asset ảnh bìa nào', OPTS, async () => {
  const s = studio({ alpha: false }), { t } = s;
  try {
    const r = await run(s, lesson(s, { variants: [V.owner, Object.assign({}, V.owner, { template: 'host-shock-right', headline: 'Đừng tin AI 100%', highlight: 'tin', visual: { beat: 1 } })] }));
    assert.equal(r.state, 'blocked'); assert.equal(r.blocked_reason.code, 'thumb_fail');
    const gt = r.blocked_reason.detail.gates.find((g) => g.gate === 'G-THUMB');
    assert.equal(gt.result, 'fail'); assert.equal(gt.measure.variants.length, 2); assert.ok(gt.measure.variants.every((v) => v.fails.some((f) => f.rule === 'T5')));
    assert.match(gt.measure.text_human, /^Không phương án nào đạt/);
    assert.equal(r.outputs && r.outputs.thumbs, undefined);
    assert.equal(t.db.all("SELECT * FROM assets WHERE meta LIKE '%\"role\":\"thumb\"%'").length, 0);
  } finally { t.clean(); }
});

test('pipeline: ảnh mặt do agent tải lên (chưa xác nhận quyền) ⇒ blocked rights_missing TRƯỚC khi dựng — asset của ảnh bìa đi qua cùng cổng quyền', { skip: SKIP, timeout: 120000 }, async () => {
  const s = studio({ by: agent(['compose']) }), { t } = s;
  try {
    const r = await run(s, lesson(s, { variants: [V.owner, V.duo] }));
    assert.equal(r.state, 'blocked'); assert.equal(r.blocked_reason.code, 'rights_missing');
    assert.deepEqual(r.blocked_reason.detail.assets, [s.face.display_id]);
  } finally { t.clean(); }
});

test('pipeline: hình chủ đạo là asset đã bị dọn tệp sau khi nộp ⇒ blocked thumb_asset_missing có chữ người đọc được (không sập, không đốt công dựng)', { skip: SKIP, timeout: 120000 }, async () => {
  const s = studio(), { t } = s;
  try {
    const svg = t.write(s.o, 'asset.put', { kind: 'svg', mime: 'image/svg+xml', bytes: Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><circle cx="5" cy="5" r="4" fill="#E8A33D"/></svg>') });
    const v = { template: 'big-visual', headline: 'Hình tự vẽ', face: { cast: 'CM-0001', mood: 'proud' }, visual: { asset: svg.display_id } };
    const body = lesson(s, { variants: [v, Object.assign({}, v, { template: 'duo-versus', headline: 'Đoán chứ không biết' })] });
    const r0 = t.write(s.o, 'lesson.submit', body);   // nộp được: asset còn tệp lúc kiểm khô
    t.db.run('UPDATE assets SET media_present=0 WHERE display_id=?', svg.display_id);   // rồi tệp bị dọn
    const w = pipeline.startWorkers(s.ctx, { pollMs: 20 });
    try { await w.idle(100000); } finally { w.stop(); }
    const r = t.db.json(t.db.get('SELECT * FROM renders WHERE display_id=?', r0.render.display_id));
    assert.equal(r.state, 'blocked'); assert.equal(r.blocked_reason.code, 'thumb_asset_missing'); assert.match(r.blocked_reason.text_human, /không dùng được/);
    // và kiểm khô chặn ngay asset không phải ảnh / không tồn tại ở lúc nộp
    assert.throws(() => t.write(s.o, 'lesson.submit', lesson(s, { variants: [Object.assign({}, v, { visual: { asset: 'AS-9999' } }), v] })), /Asset AS-9999 không có trong xưởng/);
  } finally { t.clean(); }
});
