// © 2026 Gen Labs — All rights reserved.
// Gói P0b — móc mở rộng của cổng ghi (SPEC-0.2.0 §2.4, §9, §10): POLICY_FIELDS duy nhất, nạp op từ server/ops/*, lessonExt, channelDefaults, suggestionApply (loại + quyền),
// quyền dùng asset (rights), awaiting_review_at + gộp outputs (CNS-119). Ma trận §10: mỗi ô ✗ có test âm bên dưới.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const dbm = require('../server/db');
const state = require('../server/state');
const rights = require('../server/rights');
const policy = require('../server/policy');
const { createWriter } = require('../server/write');
const { createExt } = require('../server/hooks');
const { tmpDb, basics, lessonBody, owner, agent } = require('./a-helpers');
const { tutorialBody } = require('./g-tutorial-fixtures');

const code = (c) => (e) => e.name === 'WriteError' && e.code === c;
const ROOT = path.join(__dirname, '..');
const PNG = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(32, 1)]);
const SVG = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><rect width="10" height="10" fill="red"/></svg>');
// mọi diễn viên KHÔNG phải owner-UI (cho ô ✗ của ma trận §10)
const NON_OWNER_UI = (db) => [
  ['agent compose', agent(['read', 'compose', 'run'])],
  ['agent run', agent(['run'])],
  ['trợ lý', { type: 'assistant', entry: 'assistant' }],
  ['CLI', { type: 'cli', entry: 'cli' }],
  ['runner', { type: 'runner', entry: 'runner' }],
  ['owner qua http (không phải phiên UI)', Object.assign({}, owner(db), { entry: 'http' })],
];

// module op tạm (giả làm gói W1): ghi vào thư mục tạm, nạp qua opts.opsDirs
function tmpOps(src) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'gs-ops-'));
  fs.writeFileSync(path.join(dir, 'x.js'), src);
  return { dir, clean: () => fs.rmSync(dir, { recursive: true, force: true }) };
}
function writerWith(src) {
  const ops = tmpOps(src);
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'gs-a-'));
  const db = dbm.open(dir, { masterKey: 'a'.repeat(64) });
  const write = createWriter(db, { opsDirs: [ops.dir] });
  return { db, write, dir, clean: () => { db.close(); fs.rmSync(dir, { recursive: true, force: true }); ops.clean(); } };
}

test('POLICY_FIELDS: MỘT danh sách (server/policy.js) dùng chung write.js và mcp-tools; có brand + policy', () => {
  assert.ok(policy.POLICY_FIELDS.includes('brand') && policy.POLICY_FIELDS.includes('policy'));
  assert.equal(require('../server/write').POLICY_FIELDS, policy.POLICY_FIELDS, 'write.js re-export đúng một mảng');
  const src = fs.readFileSync(path.join(ROOT, 'server/write.js'), 'utf8') + fs.readFileSync(path.join(ROOT, 'server/mcp.js'), 'utf8') + fs.readdirSync(path.join(ROOT, 'server/mcp-tools')).map(f => fs.readFileSync(path.join(ROOT, 'server/mcp-tools', f), 'utf8')).join('');
  assert.ok(!/POLICY_FIELDS\s*=\s*\[/.test(src), 'không còn bản sao danh sách ở nơi khác');
  assert.deepEqual(policy.policyHits({ brand: {}, glossary: [] }, { policy: 1 }), ['brand', 'policy']);
});

test('Sửa brand/policy của kênh: owner ✓, agent ✗ (policy_field) — cả create lẫn update, cả hai trường mới', () => {
  const t = tmpDb(); const b = basics(t.write, t.db);
  for (const f of ['brand', 'policy']) {
    assert.throws(() => t.write(agent(['compose']), 'channel.update', { channel: b.ch.display_id, data: { [f]: { x: 1 } } }), code('forbidden'));
    assert.throws(() => t.write(agent(['compose']), 'channel.create', { name: 'Z', data: { [f]: { x: 1 } } }), code('forbidden'));
    t.write(b.o, 'channel.update', { channel: b.ch.display_id, data: { [f]: f === 'brand' ? { preset: 'console' } : { x: 1 } } });   // owner ✓ (brand phải hợp lệ lược đồ — gói B kiểm khi lưu)
  }
  t.clean();
});

test('server/ops/*: module stub là no-op (không đăng ký op nào) và có chủ; gói đã làm thật (B, O, V, U) bị loại khỏi kiểm no-op; U chỉ thêm asset.attest/revoke_attest (ownerUi)', () => {
  const dir = path.join(ROOT, 'server/ops');
  const files = fs.readdirSync(dir).filter(f => f.endsWith('.js'));
  assert.deepEqual(files.sort(), ['brand.js', 'cast.js', 'overview.js', 'publish.js', 'thumb.js', 'tutorial.js']);
  const DONE = ['brand.js', 'publish.js', 'cast.js', 'tutorial.js'];   // gói B, O, V, U đã thay stub bằng bản thật
  for (const f of files.filter(x => !DONE.includes(x))) {
    const m = require(path.join(dir, f));
    assert.equal(typeof m.register, 'function', f); assert.ok(m.OWNER, f + ' ghi rõ gói sở hữu');
    const calls = [];
    m.register((...a) => calls.push(a), {});
    assert.deepEqual(calls, [], f + ' stub không được đăng ký op');
  }
  const u = require(path.join(dir, 'tutorial.js')), calls = [];
  u.register((...a) => calls.push(a), { ext: require('../server/hooks.js').createExt(), db: null, err: () => new Error('x'), rights: require('../server/rights.js'), need: () => null });
  assert.deepEqual(calls.map(c => [c[0], c[1]]), [['asset.attest', 'ownerUi'], ['asset.revoke_attest', 'ownerUi']], 'gói U: chỉ hai op quyền asset, chỉ owner trên UI');
  const t = tmpDb();   // writer thật: tập op = tập op lõi + op của gói đã làm thật
  assert.ok(t.write.ops.includes('lesson.submit') && !t.write.ops.some(n => /^thumbnail\./.test(n)));   // cast.approve/retire (V), render.mark_* (O), asset.attest (U) là op thật
  assert.ok(t.write.ops.includes('asset.attest') && t.write.ops.includes('asset.revoke_attest'));
  t.clean();
});

test('nạp op từ module: op mới đi qua write() (kiểm quyền + audit); trùng tên/who lạ bị từ chối; around bọc op cũ', () => {
  const w = writerWith(`
    exports.register = (op, ctx) => {
      op('x.ping', 'ownerUi', (c) => ({ result: { ok: true }, entity: ['x', 'X-1'], before: null, after: { p: c.p.n } }));
      op('x.fn', (a) => a.entry === 'ui' && a.type === 'user', () => ({ result: { fn: true }, entity: ['x', 'X-2'], before: null, after: {} }));
      ctx.around('settings.set', (next) => (c) => { const r = next(c); r.result.wrapped = true; return r; });
    };`);
  try {
    const o = owner(w.db);
    assert.deepEqual(w.write(o, 'x.ping', { n: 7 }), { ok: true });
    assert.equal(w.db.get("SELECT COUNT(*) AS n FROM audit_log WHERE action='x.ping'").n, 1, 'op mới cũng audit');
    for (const [name, a] of NON_OWNER_UI(w.db)) assert.throws(() => w.write(a, 'x.ping', {}), code('forbidden'), name);
    assert.deepEqual(w.write(o, 'x.fn', {}), { fn: true }, 'who là hàm: write() gọi hàm, không tra bảng allow');
    for (const [name, a] of NON_OWNER_UI(w.db)) assert.throws(() => w.write(a, 'x.fn', {}), code('forbidden'), 'x.fn ' + name);
    assert.equal(w.write(o, 'settings.set', { key: 'k', value: 1 }).wrapped, true, 'around đã bọc');
  } finally { w.clean(); }
  const dup = tmpOps("exports.register = (op) => { op('lesson.submit', 'owner', () => ({})); };");
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'gs-a-')); const db = dbm.open(dir, { masterKey: 'a'.repeat(64) });
  assert.throws(() => createWriter(db, { opsDirs: [dup.dir] }), /đã tồn tại/);
  dup.clean();
  const bad = tmpOps("exports.register = (op) => { op('x.y', 'khong-co', () => ({})); };");
  assert.throws(() => createWriter(db, { opsDirs: [bad.dir] }), /quyền không xác định/);
  bad.clean(); db.close(); fs.rmSync(dir, { recursive: true, force: true });
});

test('hooks.js: đăng ký trùng bị từ chối; hook lạ bị từ chối; deepMerge/channelDefaults người gọi thắng', () => {
  const e = createExt();
  e.lessonExt.register({ name: 'a', columns: ['thumbnail'] });
  assert.throws(() => e.lessonExt.register({ name: 'a', columns: [] }), /trùng tên/);
  assert.throws(() => e.lessonExt.register({ name: 'b', columns: ['thumbnail'] }), /đã có chủ/);
  e.gates.register('G-X', () => null); assert.throws(() => e.gates.register('G-X', () => null), /trùng/);
  e.suggestionApply.register('k', { apply() {} }); assert.throws(() => e.suggestionApply.register('k', { apply() {} }), /trùng/);
  assert.throws(() => e.hooks.on('khong.co', () => {}), /không tồn tại/);
  assert.deepEqual(e.hooks.names(), ['plan.input', 'plan.after', 'export.after']);
  e.channelDefaults.register(() => ({ policy: { thumbnail_required: true, x: 1 }, brand: { preset: 'p' } }));
  assert.deepEqual(e.channelDefaults.apply({}, { policy: { x: 2 } }), { policy: { thumbnail_required: true, x: 2 }, brand: { preset: 'p' } });
});

test('channelDefaults: kênh MỚI nhận mặc định server (kể cả trường chính sách); kênh có sẵn không đổi; agent vẫn không tự đặt policy', () => {
  const w = writerWith(`exports.register = (op, ctx) => { ctx.ext.channelDefaults.register(() => ({ policy: { thumbnail_required: true } })); };`);
  try {
    const o = owner(w.db);
    const ch = w.write(o, 'channel.create', { name: 'Mới', data: { glossary: ['A'] } });
    const data = w.db.json(w.db.get('SELECT data FROM channel_versions WHERE entity_id=?', ch.id)).data;
    assert.deepEqual(data, { glossary: ['A'], policy: { thumbnail_required: true } });
    const viaAgent = w.write(agent(['compose']), 'channel.create', { name: 'Của agent' });   // agent tạo kênh KHÔNG data ⇒ vẫn nhận mặc định do server đặt
    assert.equal(w.db.json(w.db.get('SELECT data FROM channel_versions WHERE entity_id=?', viaAgent.id)).data.policy.thumbnail_required, true);
    assert.throws(() => w.write(agent(['compose']), 'channel.create', { name: 'X', data: { policy: { thumbnail_required: false } } }), code('forbidden'));
    const upd = w.write(o, 'channel.update', { channel: ch.display_id, data: { glossary: ['B'] } });   // update: không áp lại mặc định
    assert.equal(w.db.json(w.db.get('SELECT data FROM channel_versions WHERE entity_id=? AND version=?', ch.id, upd.version)).data.policy.thumbnail_required, true, 'giữ từ version trước');
  } finally { w.clean(); }
  const t = tmpDb(); const ch = t.write(owner(t.db), 'channel.create', { name: 'Cũ' });   // không hook ⇒ không đổi hành vi 0.1.1
  assert.deepEqual(t.db.json(t.db.get('SELECT data FROM channel_versions WHERE entity_id=?', ch.id)).data, {});
  t.clean();
});

test('lessonExt: kind/cột ext — chưa đăng ký ⇒ từ chối rõ; đăng ký ⇒ lưu, kế thừa khi không gửi, null xoá, validate thấy channelData', () => {
  // chưa có ext nào: bài cũ y hệt; gửi thumbnail/kind lạ bị từ chối với chữ người đọc được
  const t = tmpDb(); const b = basics(t.write, t.db);
  const r0 = t.write(b.o, 'lesson.submit', lessonBody(b));
  assert.equal(t.db.get('SELECT kind, thumbnail FROM lesson_versions WHERE version=1').kind, 'lesson');
  assert.throws(() => t.write(b.o, 'lesson.submit', lessonBody(b, { thumbnail: { variants: [] } })), /chưa được bật/);
  assert.throws(() => t.write(b.o, 'lesson.submit', lessonBody(b, { kind: 'podcast' })), /chưa được hỗ trợ/);
  assert.ok(r0.render);
  t.clean();

  const w = writerWith(`
    exports.register = (op, ctx) => {
      ctx.ext.lessonExt.register({ name: 'thumbnail', columns: ['thumbnail'], schema: { properties: { thumbnail: { type: 'object' } } },
        validate(lv, c) {
          const need = lv.channelData.policy && lv.channelData.policy.thumbnail_required;
          if (need && !lv.values.thumbnail) return [{ path: 'thumbnail', text: 'thumbnail_required: kênh bật luật ảnh bìa' }];
          if (lv.values.thumbnail && !Array.isArray(lv.values.thumbnail.variants)) return ['variants phải là mảng'];
          return [];
        } });
    };`);   // tutorial: module thật của gói U (server/ops/tutorial.js) — kind + variant/screens/host/music
  try {
    const bb = basics(w.write, w.db);
    const ext = w.write.ext.lessonExt;
    assert.deepEqual(ext.kinds(), ['lesson', 'tutorial']); assert.deepEqual(ext.columns().sort(), ['host', 'music', 'screens', 'thumbnail', 'variant']);
    assert.deepEqual(ext.schemaProps().thumbnail, { type: 'object' });
    assert.deepEqual(ext.unowned(), [], 'mọi cột 0003 đã có chủ (T giả + U thật)');
    // lưu + validate
    assert.throws(() => w.write(bb.o, 'lesson.submit', lessonBody(bb, { thumbnail: { variants: 5 } })), /variants phải là mảng/);
    const v1 = w.write(bb.o, 'lesson.submit', lessonBody(bb, { thumbnail: { variants: [{ template: 't' }] } }));
    const row = (n) => w.db.json(w.db.get('SELECT * FROM lesson_versions WHERE version=?', n));
    assert.deepEqual(row(1).thumbnail, { variants: [{ template: 't' }] });
    // update KHÔNG gửi thumbnail ⇒ kế thừa; gửi null ⇒ xoá
    w.write(bb.o, 'lesson.submit', lessonBody(bb, { lesson: v1.lesson.display_id, title: 'Sửa', note: 'n' }));
    assert.deepEqual(row(2).thumbnail, { variants: [{ template: 't' }] }, 'kế thừa từ version trước');
    w.write(bb.o, 'lesson.submit', lessonBody(bb, { lesson: v1.lesson.display_id, title: 'Sửa 2', thumbnail: null }));
    assert.equal(row(3).thumbnail, null);
    // luật theo dữ liệu kênh: policy.thumbnail_required ⇒ thiếu thumbnail bị chặn; kênh cũ (không bật) thì không
    w.write(bb.o, 'channel.update', { channel: bb.ch.display_id, data: { policy: { thumbnail_required: true } } });
    assert.throws(() => w.write(bb.o, 'lesson.submit', lessonBody(bb)), /thumbnail_required/);
    // loại bài do ext khai báo: tutorial nhận; khối chỉ-lesson (token-row) bị từ chối ở bài tutorial
    w.write(bb.o, 'channel.update', { channel: bb.ch.display_id, data: { policy: { thumbnail_required: false } } });
    const tut = w.write(bb.o, 'lesson.submit', tutorialBody(bb, { variant: 'full', thumbnail: { variants: [] } }));
    assert.equal(w.db.get('SELECT kind, variant FROM lesson_versions WHERE lesson_id=(SELECT id FROM lessons WHERE display_id=?)', tut.lesson.display_id).kind, 'tutorial');
    assert.throws(() => w.write(bb.o, 'lesson.submit', tutorialBody(bb, { thumbnail: { variants: [] }, beats: [{ block: 'token-row', anchor: { line: 0, word: 'chào' }, params: { tokens: ['a'], next: 'b' } }] })), /token-row/);
    assert.equal(w.db.get("SELECT COUNT(*) AS n FROM lessons").n, 2, 'lần bị từ chối không để lại bài');
  } finally { w.clean(); }
});

test('suggestion: apply CHỈ owner + phiên UI (ô ✗ §10) ; loại có bộ áp dụng chạy trong tx; validate khi tạo', () => {
  const w = writerWith(`
    exports.register = (op, ctx) => {
      ctx.ext.suggestionApply.register('test_brand_kind', {
        validate(c, p) { if (!p.diff || !p.diff.brand) throw ctx.err('invalid', 'diff phải có brand', null); },
        apply(c, sg) { ctx.db.run("INSERT INTO settings(workspace_id,key,value,updated_at,updated_by) VALUES(?,?,?,?,?)", ctx.ws(), 'brand_applied', JSON.stringify(sg.diff), ctx.db.now(), c.by); return { brand_applied: true }; } });
    };`);
  try {
    const o = owner(w.db);
    const asst = { type: 'assistant', entry: 'assistant' };   // Trợ lý: "chỉ Suggestion" (§10); agent MCP đề xuất brand qua op riêng của gói B (propose_brand_change)
    assert.throws(() => w.write(asst, 'suggestion.create', { target_kind: 'test_brand_kind', diff: {} }), code('invalid'));
    assert.throws(() => w.write(agent(['compose']), 'suggestion.create', { target_kind: 'test_brand_kind', diff: { brand: {} } }), code('forbidden'), 'op chung vẫn không cho agent tạo SG-');
    const sg = w.write(asst, 'suggestion.create', { target_kind: 'test_brand_kind', diff: { brand: { a: 1 } } });
    for (const [name, a] of NON_OWNER_UI(w.db)) assert.throws(() => w.write(a, 'suggestion.apply', { suggestion: sg.display_id }), code('forbidden'), name + ' ✗ áp dụng SG-');
    assert.equal(w.db.get('SELECT state FROM suggestions WHERE display_id=?', sg.display_id).state, 'proposed');
    w.write(o, 'suggestion.apply', { suggestion: sg.display_id });
    assert.equal(w.db.get('SELECT state FROM suggestions WHERE display_id=?', sg.display_id).state, 'applied');
    assert.match(w.db.get("SELECT value FROM settings WHERE key='brand_applied'").value, /brand/);
    assert.match(w.db.get("SELECT after FROM audit_log WHERE action='suggestion.apply'").after, /brand_applied/);
    // loại không có bộ áp dụng: hành vi 0.1.x (chỉ đánh dấu)
    const sg2 = w.write(o, 'suggestion.create', { target_kind: 'khac', diff: {} });
    w.write(o, 'suggestion.apply', { suggestion: sg2.display_id });
    // bộ áp dụng ném lỗi ⇒ cả tx lùi, SG- vẫn proposed
    const sg3 = w.write(o, 'suggestion.create', { target_kind: 'test_brand_kind', diff: { brand: { a: 1 } } });
    w.db.run("DELETE FROM settings WHERE key='brand_applied'");
    w.db.raw.exec("CREATE TRIGGER tr_x BEFORE INSERT ON settings WHEN NEW.key='brand_applied' BEGIN SELECT RAISE(ABORT,'x'); END");
    assert.throws(() => w.write(o, 'suggestion.apply', { suggestion: sg3.display_id }));
    assert.equal(w.db.get('SELECT state FROM suggestions WHERE display_id=?', sg3.display_id).state, 'proposed');
  } finally { w.clean(); }
});

test('quyền dùng asset: owner UI ⇒ owner_upload; agent raster ⇒ pending; SVG/hệ thống/asset cũ ⇒ exempt; owner http ✗ không tự có quyền', () => {
  const t = tmpDb(); const b = basics(t.write, t.db);
  const ownerAs = (id) => t.db.get('SELECT * FROM assets WHERE display_id=?', id);
  const latest = (a) => t.db.get('SELECT * FROM asset_rights WHERE asset_id=? ORDER BY at DESC, rowid DESC LIMIT 1', a.id);
  const own = t.write(b.o, 'asset.put', { kind: 'image', mime: 'image/png', bytes: PNG, pii_redacted: true });
  assert.equal(own.rights, 'attested');
  assert.deepEqual([latest(ownerAs(own.display_id)).action, latest(ownerAs(own.display_id)).basis, latest(ownerAs(own.display_id)).pii_redacted], ['attest', 'owner_upload', 1]);
  const png2 = Buffer.concat([PNG, Buffer.from([2])]);
  const ag = t.write(agent(['compose']), 'asset.put', { kind: 'image', mime: 'image/png', bytes: png2, source: 'upload' });
  assert.equal(ag.rights, 'pending'); assert.equal(latest(ownerAs(ag.display_id)), undefined);
  assert.deepEqual(rights.missing(t.db, [ag.display_id, own.display_id, { asset: ownerAs(ag.display_id).path }]), [ag.display_id], 'dạng AS-…, id lẫn đường dẫn đều nhận ra');
  assert.equal(t.write(agent(['compose']), 'asset.put', { kind: 'svg', mime: 'image/svg+xml', bytes: SVG }).rights, 'exempt', 'SVG qua lọc không cần xác nhận');
  assert.equal(t.write({ type: 'system', entry: 'system' }, 'asset.put', { kind: 'cover', mime: 'image/png', bytes: Buffer.concat([PNG, Buffer.from([3])]), source: 'system' }).rights, 'exempt', 'asset hệ thống');
  assert.equal(t.write(agent(['compose']), 'asset.put', { kind: 'audio', mime: 'audio/wav', bytes: Buffer.from('RIFF....WAVEfmt xxxx') }).rights, 'pending', 'audio agent tải lên cũng cần');
  // ô ✗: owner qua http không tự có quyền; agent đưa lại đúng tệp của owner không "mượn" quyền? (trùng nội dung ⇒ dùng asset cũ, quyền cũ)
  const viaHttp = t.write(Object.assign({}, b.o, { entry: 'http' }), 'asset.put', { kind: 'image', mime: 'image/png', bytes: Buffer.concat([PNG, Buffer.from([4])]) });
  assert.equal(viaHttp.rights, 'pending', 'chỉ phiên UI mới tự có owner_upload');
  // asset cũ (trước 0003) giữ hành vi 0.1.x
  const old = t.db.insertRow('assets', { kind: 'image', sha256: 'f'.repeat(64), path: 'media/ff/x.png', bytes: 5, mime: 'image/png', media_present: 1, source: 'upload', created_at: '2000-01-01T00:00:00.000Z', created_by: 'agent:x' }, { prefix: 'AS' });
  assert.equal(rights.statusOf(t.db, old), 'exempt'); assert.deepEqual(rights.missing(t.db, [old.display_id]), []);
  // thu hồi ⇒ lại pending (asset_rights chỉ thêm hàng, hiện trạng = hàng mới nhất)
  const a = ownerAs(own.display_id);
  t.db.insertRow('asset_rights', { asset_id: a.id, action: 'revoke', basis: null, pii_redacted: 0, by: b.o.id, at: new Date(Date.now() + 1000).toISOString() });
  assert.equal(rights.statusOf(t.db, a), 'pending');
  assert.throws(() => t.db.run("UPDATE asset_rights SET note='x'"), /chỉ thêm/);
  assert.throws(() => t.db.run('DELETE FROM asset_rights'), /chỉ thêm/);
  t.clean();
});

test('state: awaiting_review_at ghi MỘT lần; outputs gộp dần trong pipeline (gating thêm thumbs) rồi bị khoá sau awaiting_review (CNS-119)', () => {
  const t = tmpDb(); const b = basics(t.write, t.db);
  const r = t.write(b.o, 'lesson.submit', lessonBody(b));
  const id = r.render.id;
  const get = () => t.db.json(t.db.get('SELECT * FROM renders WHERE id=?', id));
  assert.equal(get().awaiting_review_at, null);
  for (const s of ['voicing', 'judging', 'aligning', 'rendering', 'mixing']) state.transitionRender(t.db, id, s);
  state.transitionRender(t.db, id, 'gating', { outputs: { mp4: 'AS-1', mix: 'AS-2' } });
  state.transitionRender(t.db, id, 'awaiting_review', { progress: 1, outputs: { thumbs: [{ variant: 0, w1280: 'AS-3', w1920: 'AS-4', pass: true, score: 0.8 }] } });
  const g = get();
  assert.deepEqual(Object.keys(g.outputs).sort(), ['mix', 'mp4', 'thumbs'], 'gộp dần: mp4/mix không mất khi thêm thumbs');
  assert.equal(g.outputs.thumbs[0].w1920, 'AS-4');
  assert.match(g.awaiting_review_at, /^\d{4}-\d\d-\d\dT/);
  assert.throws(() => t.db.run("UPDATE renders SET outputs=? WHERE id=?", '{"x":1}', id), /bất biến/, 'UPDATE outputs sau awaiting_review bị chặn');
  assert.throws(() => t.db.run("UPDATE renders SET awaiting_review_at=? WHERE id=?", '2001-01-01T00:00:00.000Z', id), /chỉ ghi một lần/);
  // vào lại awaiting_review không đổi mốc: render mới cùng lesson ⇒ bản cũ superseded, mốc cũ giữ nguyên
  const at = g.awaiting_review_at;
  t.write(b.o, 'lesson.submit', lessonBody(b, { lesson: r.lesson.display_id, title: 'v2' }));
  assert.equal(get().state, 'superseded'); assert.equal(get().awaiting_review_at, at);
  t.clean();
});

test('ma trận §10 (phần P0b) — ô ✗: trợ lý/CLI/runner/owner-http không ghi nội dung kênh, nhân vật, bài, asset; agent chỉ-đọc không tải asset', () => {
  const t = tmpDb(); const b = basics(t.write, t.db);
  const body = lessonBody(b);
  const attempts = {
    'channel.update(brand)': (a) => t.write(a, 'channel.update', { channel: b.ch.display_id, data: { brand: { x: 1 } } }),
    'channel.create': (a) => t.write(a, 'channel.create', { name: 'Z' }),
    'cast.save': (a) => t.write(a, 'cast.save', { channel: b.ch.display_id, name: 'N', data: { look: {} } }),
    'lesson.submit': (a) => t.write(a, 'lesson.submit', body),
  };
  for (const [name, a] of [['trợ lý', { type: 'assistant', entry: 'assistant' }], ['CLI', { type: 'cli', entry: 'cli' }], ['runner', { type: 'runner', entry: 'runner' }], ['agent chỉ đọc', agent(['read'])]]) {
    for (const [op, fn] of Object.entries(attempts)) assert.throws(() => fn(a), code('forbidden'), `${name} ✗ ${op}`);
  }
  for (const [name, a] of [['trợ lý', { type: 'assistant', entry: 'assistant' }], ['CLI', { type: 'cli', entry: 'cli' }], ['agent chỉ đọc', agent(['read'])], ['agent chỉ run', agent(['run'])]]) {
    assert.throws(() => t.write(a, 'asset.put', { kind: 'image', mime: 'image/png', bytes: PNG }), code('forbidden'), `${name} ✗ tải asset raster`);
  }
  assert.equal(t.db.get('SELECT COUNT(*) AS n FROM assets').n, 0, 'lần bị từ chối không để lại asset');
  assert.equal(t.db.get("SELECT COUNT(*) AS n FROM asset_rights").n, 0);
  t.clean();
});
