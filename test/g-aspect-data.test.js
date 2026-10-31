// © 2026 Gen Labs — All rights reserved.
// Gói A1 (SPEC-0.2.0-F7 §3.2–3.6, §9, §13): dữ liệu tỉ lệ khung — migration 0005, móc lessonExt.resolve (CNS-330: bài KHÔNG gửi aspect vẫn lưu giá trị đã phân giải), aspect_mismatch /
// aspect_unsupported / aspect_kind_unsupported / aspect_kind_fallback, quyền (ma trận §9: mỗi ô ✗ có ca âm), schedule.mix ở scheduler, lưới, MCP (get_capabilities.aspects, get_task.aspect,
// validate_lesson.aspect), GET /api/aspects. Dựng hình 9:16 thật là việc của A2/A-INT — ở đây không có Chromium.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const { DatabaseSync } = require('node:sqlite');
const dbm = require('../server/db');
const state = require('../server/state');
const auth = require('../server/auth');
const grids = require('../server/grids');
const scheduler = require('../server/scheduler');
const { createMcp } = require('../server/mcp.js');
const { POLICY_FIELDS } = require('../server/policy.js');
const registry = require('../render/blocks/registry.js');
const A = require('../render/aspects.js');
const aspectOps = require('../server/ops/aspect.js');
const { tmpDb, basics, lessonBody, owner, agent } = require('./a-helpers');
const { tutorialBody } = require('./g-tutorial-fixtures');
const D = require('./d-helpers');

const MIG = path.join(__dirname, '..', 'migrations');
const code = (c) => (e) => e.name === 'WriteError' && e.code === c;
const errs = (fn) => { try { fn(); } catch (e) { return e; } return null; };
const verOf = (db, ref) => db.get('SELECT lv.* FROM lesson_versions lv JOIN lessons l ON l.id=lv.lesson_id WHERE l.display_id=? ORDER BY lv.version DESC LIMIT 1', ref);
const CLI = { type: 'cli', entry: 'cli' }, RUNNER = { type: 'runner', entry: 'runner' }, SYSTEM = { type: 'system', entry: 'system', id: 'scheduler' };
// bài 9:16 hợp lệ không cần khối hình (khối khai tỉ lệ là việc của registry/A2; test nhịp có khối dùng registry giả bên dưới)
const body = (b, extra = {}) => lessonBody(b, Object.assign({ beats: [] }, extra));

// ---------------------------------------------------------------- migration 0005
test('0005: cột aspect, hàng cũ NULL, trigger bất biến dựng lại (cả aspect), index; migrator chạy lại không làm gì', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'gs-mig5-')), key = crypto.randomBytes(32).toString('hex');
  try {
    const raw = new DatabaseSync(path.join(dir, 'studio.db'));
    raw.exec('PRAGMA foreign_keys=ON');
    raw.exec(fs.readFileSync(path.join(MIG, '0001_init.sql'), 'utf8'));
    raw.exec('PRAGMA foreign_keys=OFF');
    raw.exec(fs.readFileSync(path.join(MIG, '0002_agent_auth.sql'), 'utf8'));
    raw.exec('PRAGMA foreign_keys=ON');
    raw.exec('CREATE TABLE IF NOT EXISTS schema_migrations(version INTEGER PRIMARY KEY, applied_at TEXT NOT NULL)');
    raw.exec("INSERT INTO schema_migrations VALUES(1,'2026-01-01T00:00:00.000Z'),(2,'2026-01-02T00:00:00.000Z')");
    const T = "'2026-01-03T00:00:00.000Z'";
    raw.exec(`
      INSERT INTO workspaces(id,name,locale,timezone,created_at,updated_at) VALUES('w','W','vi','UTC',${T},${T});
      INSERT INTO channels(id,workspace_id,display_id,name,created_at,updated_at) VALUES('c','w','CH-0001','K',${T},${T});
      INSERT INTO lessons(id,workspace_id,display_id,channel_id,title,created_at,updated_at) VALUES('ls','w','LS-0001','c','Bài',${T},${T});
      INSERT INTO work_orders(id,workspace_id,display_id,channel_id,kind,opened_at,created_at,updated_at) VALUES('wo','w','WO-0001','c','manual',${T},${T},${T});
      INSERT INTO lesson_versions(id,workspace_id,lesson_id,version,created_at,updated_at) VALUES('lv','w','ls',1,${T},${T});`);
    raw.close();
    const db = dbm.open(dir, { masterKey: key });
    assert.deepEqual(db.all('SELECT version FROM schema_migrations ORDER BY version').map((r) => r.version), [1, 2, 3, 4, 5, 6, 7, 8]);
    assert.ok(db.all('PRAGMA table_info(lesson_versions)').some((c) => c.name === 'aspect'));
    assert.ok(db.all('PRAGMA table_info(work_orders)').some((c) => c.name === 'aspect'));
    assert.equal(db.get("SELECT aspect FROM lesson_versions WHERE id='lv'").aspect, null, 'hàng 0.1.x: NULL (= 16:9)');
    assert.equal(db.get("SELECT aspect FROM work_orders WHERE id='wo'").aspect, null, 'lệnh cũ: NULL (= theo kênh)');
    assert.throws(() => db.run("UPDATE lesson_versions SET aspect='9:16' WHERE id='lv'"), /bất biến/, 'trigger bao cả aspect');
    for (const c of ['kind', 'thumbnail', 'music']) assert.throws(() => db.run(`UPDATE lesson_versions SET ${c}='x' WHERE id='lv'`), /bất biến/, 'trigger cũ còn nguyên: ' + c);
    db.run("UPDATE work_orders SET aspect='9:16' WHERE id='wo'");   // lệnh đổi được (không bất biến)
    assert.ok(db.all("SELECT name FROM sqlite_master WHERE type='index'").some((r) => r.name === 'ix_lv_aspect'));
    assert.equal(db.get("SELECT COUNT(*) n FROM sqlite_master WHERE type='trigger' AND name='tr_lv_immutable'").n, 1, 'đúng một trigger');
    assert.equal(dbm.migrate(db).length, 0, 'chạy lại migrator: không còn gì để áp');
    db.close();
    const db2 = dbm.open(dir, { masterKey: key });   // mở lại: vẫn êm
    assert.equal(db2.all('SELECT version FROM schema_migrations').length, 8);
    db2.close();
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

// ---------------------------------------------------------------- phân giải (CNS-330)
test('CNS-330: lệnh 9:16, bài KHÔNG gửi aspect ⇒ lesson_versions.aspect = "9:16" (giá trị đã phân giải); bài thường ⇒ "16:9" (không NULL)', () => {
  const t = tmpDb();
  try {
    const b = basics(t.write, t.db);
    const wo = t.write(b.o, 'work_order.create', { channel: b.ch.display_id, kind: 'manual', brief: 'clip dọc', aspect: '9:16' });
    assert.equal(wo.aspect, '9:16');
    const r = t.write(b.o, 'lesson.submit', body(b, { work_order: wo.display_id }));
    assert.equal(verOf(t.db, r.lesson.display_id).aspect, '9:16');
    assert.deepEqual([r.aspect.value, r.aspect.source], ['9:16', 'work_order']);
    assert.equal(t.db.get('SELECT state FROM work_orders WHERE id=?', wo.id).state, 'fulfilled');
    const r2 = t.write(b.o, 'lesson.submit', body(b));
    assert.equal(verOf(t.db, r2.lesson.display_id).aspect, '16:9', 'ghi giá trị đã phân giải, không ghi NULL cho version mới');
    assert.equal(r2.aspect.source, 'default');
    // gửi đúng tỉ lệ của lệnh ⇒ qua
    const wo2 = t.write(b.o, 'work_order.create', { channel: b.ch.display_id, kind: 'manual', aspect: '9:16' });
    const r3 = t.write(b.o, 'lesson.submit', body(b, { work_order: wo2.display_id, aspect: '9:16' }));
    assert.equal(verOf(t.db, r3.lesson.display_id).aspect, '9:16'); assert.equal(r3.aspect.source, 'lesson');
  } finally { t.clean(); }
});

test('mặc định kênh (default_aspect, bí danh cũ `aspect`) → bài không gửi aspect; đổi mặc định kênh KHÔNG đổi bài đã nộp; update_lesson kế thừa version trước', () => {
  const t = tmpDb();
  try {
    const b = basics(t.write, t.db);
    t.write(b.o, 'channel.update', { channel: b.ch.display_id, data: { default_aspect: '9:16' } });
    const r = t.write(b.o, 'lesson.submit', body(b));
    assert.equal(verOf(t.db, r.lesson.display_id).aspect, '9:16'); assert.equal(r.aspect.source, 'channel');
    t.write(b.o, 'channel.update', { channel: b.ch.display_id, data: { default_aspect: '16:9' } });
    assert.equal(verOf(t.db, r.lesson.display_id).aspect, '9:16', 'bài đã nộp giữ giá trị đã ghi (dựng lại tất định)');
    // update_lesson không gửi aspect ⇒ kế thừa 9:16 dù kênh đã đổi về 16:9
    const r2 = t.write(b.o, 'lesson.submit', body(b, { lesson: r.lesson.display_id }));
    assert.equal(verOf(t.db, r.lesson.display_id).aspect, '9:16'); assert.equal(r2.aspect.inherited, true);
    // lệnh sửa (revise) không đặt aspect ⇒ kế thừa version trước
    const rv = t.write(b.o, 'work_order.create', { channel: b.ch.display_id, kind: 'revise', lesson: r.lesson.display_id });
    assert.equal(rv.aspect, null);
    const r3 = t.write(b.o, 'lesson.submit', body(b, { lesson: r.lesson.display_id, work_order: rv.display_id }));
    assert.equal(r3.aspect.value, '9:16');
    // bí danh cũ `aspect` trong dữ liệu kênh được đọc khi default_aspect thiếu (khoá cũ không bị ghi mới)
    const b2 = basics(t.write, t.db);
    assert.equal(aspectOps.channelDefault({ aspect: '9:16' }), '9:16'); assert.equal(aspectOps.channelDefault({ aspect: '9:16', default_aspect: '16:9' }), '16:9'); assert.equal(aspectOps.channelDefault({}), '16:9');
    void b2;
  } finally { t.clean(); }
});

test('update_lesson: version cũ NULL (bài 0.1.x) ⇒ coi là 16:9 và GHI "16:9"; gửi tỉ lệ khác bài cũ (lệnh không đặt) ⇒ aspect_mismatch', () => {
  const t = tmpDb();
  try {
    const b = basics(t.write, t.db);
    const r = t.write(b.o, 'lesson.submit', body(b));
    // giả lập bài trước 0.2.0: aspect NULL (trigger bất biến chặn UPDATE ⇒ tháo tạm rồi dựng lại đúng định nghĩa)
    const trg = t.db.get("SELECT sql FROM sqlite_master WHERE name='tr_lv_immutable'").sql;
    t.db.raw.exec('DROP TRIGGER tr_lv_immutable'); t.db.run('UPDATE lesson_versions SET aspect=NULL'); t.db.raw.exec(trg);
    assert.equal(verOf(t.db, r.lesson.display_id).aspect, null);
    t.write(b.o, 'channel.update', { channel: b.ch.display_id, data: { default_aspect: '9:16' } });   // mặc định kênh 9:16 không kéo bài cũ sang dọc
    const r2 = t.write(b.o, 'lesson.submit', body(b, { lesson: r.lesson.display_id }));
    assert.equal(verOf(t.db, r.lesson.display_id).aspect, '16:9'); assert.equal(r2.aspect.inherited, true);
    // gửi tỉ lệ khác bài cũ khi lệnh không đặt ⇒ aspect_mismatch (đổi khung = chủ xưởng tạo lệnh mới); gửi trùng tỉ lệ cũ vẫn được
    const e3 = errs(() => t.write(b.o, 'lesson.submit', body(b, { lesson: r.lesson.display_id, aspect: '9:16' })));
    assert.ok(e3 && e3.code === 'invalid'); assert.equal(e3.detail.errors[0].code, 'aspect_mismatch');
    assert.match(e3.detail.errors[0].text, /Bài đã dựng khung 16:9; muốn đổi khung cần chủ xưởng tạo lệnh mới \(ví dụ "Tạo lệnh bản dọc"\)\./);
    assert.equal(t.write(b.o, 'lesson.submit', body(b, { lesson: r.lesson.display_id, aspect: '16:9' })).aspect.value, '16:9');
  } finally { t.clean(); }
});

test('lỗi aspect_mismatch / aspect_unsupported / aspect_kind_unsupported: có mã + text_human tiếng Việt', () => {
  const t = tmpDb();
  try {
    const b = basics(t.write, t.db);
    const wo = t.write(b.o, 'work_order.create', { channel: b.ch.display_id, kind: 'manual', aspect: '9:16' });
    const detail = (e) => e.detail.errors;
    let e = errs(() => t.write(b.o, 'lesson.submit', body(b, { work_order: wo.display_id, aspect: '16:9' })));
    assert.ok(e && e.code === 'invalid', 'mismatch ⇒ invalid'); assert.equal(detail(e)[0].code, 'aspect_mismatch');
    assert.match(detail(e)[0].text, new RegExp(`${wo.display_id} yêu cầu 9:16, bài gửi 16:9`));
    assert.equal(t.db.get('SELECT COUNT(*) n FROM lessons').n, 0, 'không lưu gì');
    assert.equal(t.db.get('SELECT state FROM work_orders WHERE id=?', wo.id).state, 'open');
    e = errs(() => t.write(b.o, 'lesson.submit', body(b, { aspect: '1:1' })));
    assert.equal(detail(e)[0].code, 'aspect_unsupported'); assert.match(detail(e)[0].text, /không được hỗ trợ \(đang bật: 16:9, 9:16\)/);
    assert.equal(detail(errs(() => t.write(b.o, 'lesson.submit', body(b, { aspect: 'abc' }))))[0].code, 'aspect_unsupported');
    assert.equal(detail(errs(() => t.write(b.o, 'lesson.submit', body(b, { aspect: { x: 1 } }))))[0].code, 'aspect_unsupported');
    // tutorial + 9:16 do người chọn ⇒ aspect_kind_unsupported với lời TUTORIAL_BLOCKED
    e = errs(() => t.write(b.o, 'lesson.submit', tutorialBody(b, { aspect: '9:16' })));
    const k = detail(e).find((x) => x.code === 'aspect_kind_unsupported');
    assert.ok(k, JSON.stringify(detail(e))); assert.match(k.text, /chỉ dựng được khung 16:9/);
    // tỉ lệ bị tắt (L-MIN) ⇒ aspect_unsupported theo dữ liệu, không theo hằng số trong mã
    const d = A.data(); d.aspects['9:16'].enabled = false;
    assert.equal(A.create(d).list({ enabledOnly: true }).length, 1);
  } finally { t.clean(); }
});

test('aspect_kind_fallback: kênh mặc định 9:16 + bài tutorial không chọn tỉ lệ ⇒ lưu 16:9 + cảnh báo (không chặn)', () => {
  const t = tmpDb();
  try {
    const b = basics(t.write, t.db);
    t.write(b.o, 'channel.update', { channel: b.ch.display_id, data: { default_aspect: '9:16' } });
    let seen = null;
    t.write.ext.lessonExt.register({ name: 'probe-aspect', columns: [], validate: (lv) => { seen = lv.out.aspect; return []; } });   // đọc thông tin phụ resolve để lại, kể cả khi bài lỗi chỗ khác
    const r = t.write(b.o, 'lesson.submit', tutorialBody(b));
    assert.equal(verOf(t.db, r.lesson.display_id).aspect, '16:9');
    assert.deepEqual([seen.value, seen.source], ['16:9', 'kind_fallback']);
    assert.equal(seen.warnings.find((w) => w.code === 'aspect_kind_fallback').level, 'warn');
    assert.match(seen.warnings[0].text_human, /chỉ dựng được 16:9/);
  } finally { t.clean(); }
});

test('block_aspect (CNS-342): khối chưa khai hỗ trợ tỉ lệ bị báo ở bài 9:16, bài 16:9 không ảnh hưởng — registry giả để test không phụ thuộc gói A2', () => {
  const t = tmpDb(), real = registry.all;
  try {
    const b = basics(t.write, t.db);
    // aspects = null ⇒ bỏ hẳn trường (sau khi gộp A2, index.json thật đã khai aspects cho title)
    const mk = (aspects) => () => real.call(registry).map((e) => { if (e.name !== 'title') return e; const o = Object.assign({}, e); if (aspects) o.aspects = aspects; else delete o.aspects; return o; });
    const beats = () => [{ block: 'title', anchor: { line: 0, word: 'chào' }, params: { text: 'Hi' } }];   // mới mỗi lần: write() gán id nhịp vào object
    registry.all = mk(['16:9']);
    const e = errs(() => t.write(b.o, 'lesson.submit', lessonBody(b, { aspect: '9:16', beats: beats() })));
    const x = e.detail.errors.find((y) => y.code === 'block_aspect');
    assert.ok(x, JSON.stringify(e.detail)); assert.equal(x.path, 'beats[0].block'); assert.match(x.text, /Khối "title" chưa dựng được ở khung 9:16/);
    assert.ok(t.write(b.o, 'lesson.submit', lessonBody(b, { aspect: '16:9', beats: beats() })).lesson, '16:9 vẫn nộp được');
    registry.all = mk(null);   // thiếu trường `aspects` ⇒ ['16:9'] (khối mới phải chủ động khai)
    assert.ok(errs(() => t.write(b.o, 'lesson.submit', lessonBody(b, { aspect: '9:16', beats: beats() }))).detail.errors.some((y) => y.code === 'block_aspect'));
    registry.all = mk(['16:9', '9:16']);
    const ok = t.write(b.o, 'lesson.submit', lessonBody(b, { aspect: '9:16', beats: beats() }));
    assert.equal(verOf(t.db, ok.lesson.display_id).aspect, '9:16');
    assert.ok(aspectOps.blocksOf('9:16').includes('title') && !aspectOps.blocksOf('16:9').includes('zzz'));
  } finally { registry.all = real; t.clean(); }
});

test('thumbnail_required theo thumbSupported: kênh bắt buộc ảnh bìa nhưng tỉ lệ chưa có mẫu ⇒ không đòi; mẫu 16:9 gửi cho bài 9:16 ⇒ thumbnail_aspect', () => {
  const t = tmpDb();
  try {
    const b = basics(t.write, t.db);
    t.write(b.o, 'channel.update', { channel: b.ch.display_id, data: { policy: { thumbnail_required: true } } });
    const e169 = errs(() => t.write(b.o, 'lesson.submit', body(b, { aspect: '16:9' })));
    assert.ok(e169.detail.errors.some((x) => /thumbnail_required/.test(x.text)), '16:9 vẫn bắt buộc');
    const sup = A.thumbSupported('9:16');   // false khi chưa có mẫu dọc (A3); true sau khi gộp A3 ⇒ khi đó 9:16 cũng bắt buộc
    const e916 = errs(() => t.write(b.o, 'lesson.submit', body(b, { aspect: '9:16' })));
    assert.equal(!!(e916 && e916.detail.errors.some((x) => /thumbnail_required/.test(x.text))), sup);
    const th = { variants: [{ template: 'host-shock-left', headline: 'AI sai?', face: { owner: true, mood: 'shock' }, visual: { beat: 0 } }, { template: 'big-visual', headline: 'Đoán chứ', face: { owner: true, mood: 'shock' }, visual: { beat: 0 } }] };
    const e2 = errs(() => t.write(b.o, 'lesson.submit', lessonBody(b, { aspect: '9:16', thumbnail: th })));
    assert.ok(e2.detail.errors.some((x) => x.code === 'thumbnail_aspect' || /thumbnail_aspect/.test(x.text)), JSON.stringify(e2.detail.errors.slice(0, 3)));
  } finally { t.clean(); }
});

// ---------------------------------------------------------------- ma trận quyền §9: mỗi ô ✗ có ca âm
test('§9 ✗: default_aspect và schedule.mix — agent / CLI / runner / assistant / system đều bị từ chối; chỉ owner đặt được (và giá trị sai bị chặn)', () => {
  const t = tmpDb();
  try {
    assert.ok(POLICY_FIELDS.includes('default_aspect') && POLICY_FIELDS.includes('schedule'));
    const b = basics(t.write, t.db), ch = b.ch.display_id;
    const sched = { time: '06:00', per_run: 3, mix: [{ aspect: '9:16', n: 1 }, { aspect: '16:9', n: 2 }] };
    const patches = [{ default_aspect: '9:16' }, { schedule: sched }, { aspect: '9:16' }];
    for (const who of [agent(['read', 'compose', 'run']), CLI, RUNNER, { type: 'assistant', entry: 'assistant' }, SYSTEM, { type: 'client', entry: 'oauth' }]) {
      for (const data of patches) {
        assert.throws(() => t.write(who, 'channel.update', { channel: ch, data }), (e) => e.name === 'WriteError' && ['forbidden'].includes(e.code), `${who.type} ${JSON.stringify(data)}`);
      }
    }
    // agent tạo kênh mới kèm default_aspect ⇒ forbidden (policy_field), kể cả qua channel.create
    assert.throws(() => t.write(agent(['compose']), 'channel.create', { name: 'K2', data: { default_aspect: '9:16' } }), code('forbidden'));
    // agent vẫn sửa được phần NỘI DUNG (không có trường chính sách) — không làm hỏng luật cũ
    assert.ok(t.write(agent(['compose']), 'channel.update', { channel: ch, data: { glossary: [] } }).version);
    // owner: đặt được, giá trị sai bị chặn bằng mã riêng
    assert.equal(t.write(b.o, 'channel.update', { channel: ch, data: { default_aspect: '9:16', schedule: sched } }).version >= 2, true);
    assert.throws(() => t.write(b.o, 'channel.update', { channel: ch, data: { default_aspect: '4:5' } }), code('aspect_unsupported'));
    assert.throws(() => t.write(b.o, 'channel.update', { channel: ch, data: { schedule: { time: '06:00', per_run: 3, mix: [{ aspect: '9:16', n: 1 }] } } }), (e) => e.code === 'invalid' && /tổng n \(1\) phải bằng per_run \(3\)/.test(e.text_human));
    assert.throws(() => t.write(b.o, 'channel.update', { channel: ch, data: { schedule: { time: '06:00', per_run: 1, mix: [{ aspect: '1:1', n: 1 }] } } }), code('aspect_unsupported'));
    assert.throws(() => t.write(b.o, 'channel.update', { channel: ch, data: { schedule: { time: '06:00', per_run: 2, mix: [{ aspect: '9:16', n: 1 }, { aspect: '9:16', n: 1 }] } } }), code('invalid'));
    assert.throws(() => t.write(b.o, 'channel.update', { channel: ch, data: { schedule: { time: '06:00', mix: 'x' } } }), code('invalid'));
    assert.throws(() => t.write(b.o, 'channel.update', { channel: ch, data: { schedule: { time: '06:00', per_run: 2, mix: [{ aspect: '9:16', n: 0 }, { aspect: '16:9', n: 2 }] } } }), code('invalid'));
    t.write(b.o, 'channel.update', { channel: ch, data: { default_aspect: null } });   // xoá về mặc định hệ thống
  } finally { t.clean(); }
});

test('§9 ✗: work_orders.aspect — agent / CLI / runner không tạo được lệnh; owner và scheduler (system) tạo được; giá trị sai ⇒ aspect_unsupported', () => {
  const t = tmpDb();
  try {
    const b = basics(t.write, t.db);
    for (const who of [agent(['read', 'compose', 'run']), CLI, RUNNER, { type: 'assistant', entry: 'assistant' }]) {
      assert.throws(() => t.write(who, 'work_order.create', { channel: b.ch.display_id, kind: 'manual', aspect: '9:16' }), code('forbidden'), who.type);
    }
    assert.equal(t.write(b.o, 'work_order.create', { channel: b.ch.display_id, kind: 'manual', aspect: '9:16' }).aspect, '9:16');
    assert.equal(t.write(SYSTEM, 'work_order.create', { channel: b.ch.display_id, kind: 'manual', aspect: '16:9' }).aspect, '16:9');
    assert.equal(t.write(b.o, 'work_order.create', { channel: b.ch.display_id, kind: 'manual' }).aspect, null, 'không đặt ⇒ NULL = theo kênh');
    assert.equal(t.write(b.o, 'work_order.create', { channel: b.ch.display_id, kind: 'manual', aspect: '' }).aspect, null);
    for (const v of ['3:4', 'abc', 916, {}]) assert.throws(() => t.write(b.o, 'work_order.create', { channel: b.ch.display_id, kind: 'manual', aspect: v }), code('aspect_unsupported'), String(v));
  } finally { t.clean(); }
});

// ---------------------------------------------------------------- scheduler: schedule.mix (CNS-334)
test('scheduler: schedule.mix mở đúng số lệnh mỗi tỉ lệ (Σn = per_run); không mix ⇒ aspect NULL như cũ; mix hỏng bị bỏ qua', () => {
  const t = tmpDb();
  try {
    const b = basics(t.write, t.db), ch = b.ch.display_id;
    for (let i = 1; i <= 9; i++) t.write(b.o, 'curriculum.save', { channel: ch, title: 'Mục ' + i, ord: i });
    const ctx = { db: t.db, write: t.write };
    // mốc lịch phải SAU lúc tạo kênh (đồng hồ thật): ngày mai 12:00Z (sau 06:00 giờ địa phương mọi múi giờ gần VN) — mốc cố định 2026-10-29 cũ hỏng khi đồng hồ thật vượt qua nó
    const day = (k) => { const d = new Date(); d.setUTCDate(d.getUTCDate() + 1 + k); d.setUTCHours(12, 0, 0, 0); return d; };
    const now = day(0);
    const sched = (extra) => ({ time: '00:01', per_run: 3, ...extra });
    // parse: mix đúng được giữ, sai thì rơi về không có mix (per_run giữ nghĩa tổng)
    assert.deepEqual(scheduler.parseSchedule(sched({ mix: [{ aspect: '9:16', n: 1 }, { aspect: '16:9', n: 2 }] })).mix, [{ aspect: '9:16', n: 1 }, { aspect: '16:9', n: 2 }]);
    assert.equal(scheduler.parseSchedule(sched({ mix: [{ aspect: '9:16', n: 1 }] })).mix, undefined, 'Σn ≠ per_run');
    assert.equal(scheduler.parseSchedule(sched({ mix: [{ aspect: '1:1', n: 3 }] })).mix, undefined, 'tỉ lệ không bật');
    assert.deepEqual(Object.keys(scheduler.parseSchedule(sched())), ['h', 'mi', 'per_run'], 'lịch cũ: hình dạng không đổi');
    assert.deepEqual(scheduler.expandMix([{ aspect: '9:16', n: 1 }, { aspect: '16:9', n: 2 }]), ['9:16', '16:9', '16:9']);
    const aspectsOf = () => t.db.all("SELECT aspect FROM work_orders WHERE kind='new_lesson' AND state='open' ORDER BY display_id").map((r) => r.aspect);
    // 1) có mix
    t.write(b.o, 'channel.update', { channel: ch, data: { schedule: sched({ mix: [{ aspect: '9:16', n: 1 }, { aspect: '16:9', n: 2 }] }) } });
    assert.equal(scheduler.openScheduled(ctx, now).length, 3);
    assert.deepEqual(aspectsOf(), ['9:16', '16:9', '16:9']);
    // 2) không mix: lệnh theo kênh (NULL). Đóng 3 lệnh cũ để mục giáo trình được mở tiếp; dùng slot của ngày hôm sau
    t.db.run("UPDATE work_orders SET state='cancelled'");
    t.write(b.o, 'channel.update', { channel: ch, data: { schedule: sched() } });
    assert.equal(scheduler.openScheduled(ctx, day(1)).length, 3);
    assert.deepEqual(aspectsOf(), [null, null, null]);
    // 3) mix lưu tay sai (không qua write()) ⇒ bỏ qua, không làm hỏng tick
    t.db.run("UPDATE work_orders SET state='cancelled'");
    const cur = t.db.get('SELECT id, current_version FROM channels WHERE display_id=?', ch);
    t.db.run("UPDATE channel_versions SET data=? WHERE entity_id=? AND version=?", JSON.stringify({ schedule: sched({ mix: [{ aspect: '9:16', n: 9 }] }) }), cur.id, cur.current_version);
    assert.equal(scheduler.openScheduled(ctx, day(2)).length, 3);
    assert.deepEqual(aspectsOf(), [null, null, null]);
  } finally { t.clean(); }
});

// ---------------------------------------------------------------- lưới
test('lưới: lessons/review_queue/work_orders/channels có cột aspect; truy vấn `aspect:9:16` lọc được; NULL = 16:9 (lessons) / theo kênh (work_orders)', () => {
  const t = tmpDb();
  try {
    const b = basics(t.write, t.db);
    const wo = t.write(b.o, 'work_order.create', { channel: b.ch.display_id, kind: 'manual', aspect: '9:16' });
    const v = t.write(b.o, 'lesson.submit', body(b, { work_order: wo.display_id }));
    const h = t.write(b.o, 'lesson.submit', body(b));
    const col = (g, k) => g.columns.some((c) => c.key === k);
    for (const n of ['lessons', 'review_queue', 'work_orders']) assert.ok(col(grids.runGrid(t.db, n, {}), 'aspect'), n);
    assert.ok(col(grids.runGrid(t.db, 'channels', {}), 'default_aspect'));
    const ls = (q) => grids.runGrid(t.db, 'lessons', { q }).rows.map((r) => r.display_id).sort();
    assert.deepEqual(ls('aspect:9:16'), [v.lesson.display_id]); assert.deepEqual(ls('aspect:16:9'), [h.lesson.display_id]); assert.deepEqual(ls('-aspect:9:16'), [h.lesson.display_id]);
    assert.deepEqual(grids.runGrid(t.db, 'work_orders', { q: 'aspect:9:16' }).rows.map((r) => r.display_id), [wo.display_id]);
    // review_queue: đưa bản dựng 9:16 vào hàng chờ duyệt
    for (const s of ['voicing', 'judging', 'aligning', 'rendering', 'mixing', 'gating', 'awaiting_review']) state.transitionRender(t.db, v.render.id, s);
    assert.deepEqual(grids.runGrid(t.db, 'review_queue', { q: 'aspect:9:16' }).rows.map((r) => r.render), [v.render.display_id]);
    assert.equal(grids.runGrid(t.db, 'review_queue', { q: 'aspect:16:9' }).rows.length, 0);
    assert.equal(grids.runGrid(t.db, 'channels', {}).rows[0].default_aspect, '16:9');
    t.write(b.o, 'channel.update', { channel: b.ch.display_id, data: { default_aspect: '9:16' } });
    assert.deepEqual(grids.runGrid(t.db, 'channels', { q: 'default_aspect:9:16' }).rows.map((r) => r.display_id), [b.ch.display_id]);
  } finally { t.clean(); }
});

// ---------------------------------------------------------------- MCP
function mcpKit() {
  const t = tmpDb(), b = basics(t.write, t.db);
  const mcp = createMcp({ db: t.db, write: t.write, config: { version: 't' } });
  const mk = (scopes) => auth.verifyAgentToken(t.db, t.write(b.o, 'agent.create', { name: 'A' + scopes.join(''), scopes }).token);
  const call = async (c, name, args) => (await mcp.handle({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name, arguments: args || {} } }, c)).result;
  return { t, b, mcp, mk, call };
}
test('MCP: get_capabilities.aspects = catalog() + aspect_default; get_task.aspect (kèm nguồn + how_to); validate/submit/update_lesson nhận aspect; agent không có tool đặt default_aspect/work_orders.aspect', async () => {
  const { t, b, mcp, mk, call } = mcpKit();
  try {
    const c = mk(['read', 'compose', 'run']);
    const caps = (await call(c, 'get_capabilities', { channel: b.ch.display_id })).structuredContent;
    assert.deepEqual(caps.aspects, aspectOps.catalogFor());
    assert.deepEqual(caps.aspects.aspects.map((a) => a.id), ['16:9', '9:16']); assert.equal(caps.aspect_default, '16:9');
    assert.deepEqual(caps.aspects.presets.map((p) => p.id), ['yt_long', 'yt_shorts', 'fb_reels', 'tiktok']);
    assert.ok(caps.aspects.aspects[0].blocks.includes('title') && Array.isArray(caps.aspects.aspects[1].thumbnail_templates));
    assert.deepEqual(Object.keys(caps.aspects.aspects[1]).sort(), Object.keys(JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures', 'api-aspects.json'), 'utf8')).aspects[1]).sort(), 'đúng lược đồ fixture hợp đồng UI');
    // get_task: lệnh 9:16
    const cu = t.write(b.o, 'curriculum.save', { channel: b.ch.display_id, title: 'Mục 1' });
    const wo = t.write(b.o, 'work_order.create', { channel: b.ch.display_id, kind: 'new_lesson', curriculum_node: cu.display_id, aspect: '9:16' });
    const task = (await call(c, 'get_next_task')).structuredContent.task;
    assert.deepEqual(task.aspect, { value: '9:16', source: 'work_order' });
    assert.match(task.how_to, /Bài này dựng 9:16 — xem get_capabilities\.aspects/);
    assert.deepEqual((await call(c, 'get_task', { work_order: wo.display_id })).structuredContent.task.aspect, { value: '9:16', source: 'work_order' });
    // inputSchema của 3 tool ghi có `aspect`
    for (const n of ['validate_lesson', 'submit_lesson', 'update_lesson']) assert.ok(mcp.TOOLS.find((x) => x.name === n).inputSchema.properties.aspect, n);
    // validate_lesson: không gửi aspect ⇒ theo lệnh; trả aspect {value, source, presets, fit_estimate, warnings}
    const lessonArgs = Object.assign(lessonBody(b), { beats: [], work_order: wo.display_id });
    const v = (await call(c, 'validate_lesson', lessonArgs)).structuredContent;
    assert.equal(v.ok, true, JSON.stringify(v));
    assert.deepEqual([v.aspect.value, v.aspect.source], ['9:16', 'work_order']);
    assert.deepEqual(v.aspect.presets.map((p) => p.id), ['yt_shorts', 'fb_reels', 'tiktok']);
    assert.ok(v.aspect.fit_estimate.duration_s > 0 && v.aspect.fit_estimate.fit.yt_shorts.ok === true);
    assert.ok(v.aspect.warnings.some((w) => w.code === 'duration_off_target' && /ngoài khoảng nên dùng cho khung 9:16 \(30–60 giây\)/.test(w.text_human)), JSON.stringify(v.aspect.warnings));
    // aspect_mismatch qua MCP: lỗi theo đường dẫn, có mã
    const bad = (await call(c, 'validate_lesson', Object.assign({}, lessonArgs, { aspect: '16:9' }))).structuredContent;
    assert.equal(bad.ok, false); assert.equal(bad.errors[0].code, 'aspect_mismatch'); assert.match(bad.errors[0].text, /yêu cầu 9:16, bài gửi 16:9/);
    // validate khô không lưu gì
    assert.equal(t.db.get('SELECT COUNT(*) n FROM lessons').n, 0);
    // submit rồi update_lesson (không gửi aspect ⇒ kế thừa)
    const s = (await call(c, 'submit_lesson', lessonArgs)).structuredContent;
    assert.deepEqual([s.aspect.value, s.aspect.source], ['9:16', 'work_order']);
    assert.equal(verOf(t.db, s.lesson).aspect, '9:16');
    const u = await call(c, 'update_lesson', { lesson: s.lesson, title: 'Tên mới' });
    assert.ok(!u.isError, u.content[0].text); assert.equal(verOf(t.db, s.lesson).aspect, '9:16'); assert.equal(verOf(t.db, s.lesson).version, 2);
    assert.equal((await call(c, 'get_lesson', { lesson: s.lesson })).structuredContent.doc.aspect, '9:16');
    // không có tool đặt tỉ lệ của kênh/lệnh (§9)
    assert.ok(!mcp.tools.some((n) => /aspect/.test(n)), mcp.tools.join());
    // update_channel(default_aspect) ⇒ policy_field/forbidden (ô ✗ MCP compose)
    const r = await call(c, 'update_channel', { channel: b.ch.display_id, data: { default_aspect: '9:16' } });
    assert.equal(r.isError, true); assert.match(r.content[0].text, /forbidden/); assert.ok(r.structuredContent.error.detail.fields.includes('default_aspect'));
    const r2 = await call(c, 'update_channel', { channel: b.ch.display_id, data: { schedule: { time: '06:00', per_run: 2, mix: [{ aspect: '9:16', n: 2 }] } } });
    assert.equal(r2.isError, true); assert.ok(r2.structuredContent.error.detail.fields.includes('schedule'));
  } finally { t.clean(); }
});

test('validate_lesson: cảnh báo thời lượng — vượt YouTube Shorts (duration_over_platform, nêu preset) và ngoài target_s; KHÔNG chặn; phụ đề dài chỉ báo info', async () => {
  const { t, b, mk, call } = mcpKit();
  try {
    const c = mk(['read', 'compose']);
    const long = (n, say) => Array.from({ length: n }, (_, i) => ({ who: i % 2 ? b.m2.display_id : b.m1.display_id, say }));
    const words = Array(55).fill('từ').join(' ');   // 55 âm tiết ≈ 19,1 s/câu
    const v = (await call(c, 'validate_lesson', lessonBody(b, { aspect: '9:16', beats: [], lines: long(11, words) }))).structuredContent;
    assert.equal(v.ok, true, JSON.stringify(v.errors));
    const over = v.aspect.warnings.find((w) => w.code === 'duration_over_platform');
    assert.ok(over, JSON.stringify(v.aspect.warnings)); assert.equal(over.detail.preset, 'yt_shorts');
    assert.match(over.text_human, /vượt YouTube Shorts \(3 phút\): YouTube sẽ xếp thành video dài/);
    assert.equal(v.aspect.fit_estimate.fit.yt_shorts.ok, false); assert.equal(v.aspect.fit_estimate.fit.tiktok.ok, true);
    assert.ok(v.aspect.warnings.some((w) => w.code === 'duration_off_target'));
    // một câu rất dài ⇒ info subtitle_pages (> 4 trang × 60 ký tự)
    const sub = (await call(c, 'validate_lesson', lessonBody(b, { aspect: '9:16', beats: [], lines: [{ who: b.m1.display_id, say: Array(80).fill('chữ').join(' ') }] }))).structuredContent;
    const pg = sub.aspect.warnings.find((w) => w.code === 'subtitle_pages');
    assert.ok(pg && pg.level === 'info' && pg.detail.pages > 4, JSON.stringify(sub.aspect.warnings));
    // 16:9 thì không có cảnh báo thời lượng/phụ đề (không preset giới hạn, không target)
    const w169 = (await call(c, 'validate_lesson', lessonBody(b, { aspect: '16:9', beats: [], lines: long(11, words) }))).structuredContent;
    assert.deepEqual(w169.aspect.warnings, []);
    // lệnh validate cũ: bài 16:9 thường vẫn trả đúng text cũ
    const old = await call(c, 'validate_lesson', lessonBody(b));
    assert.match(old.content[0].text, /^Bài hợp lệ: 2 câu, 1 nhịp\. Có thể submit_lesson\./);
  } finally { t.clean(); }
});

// ---------------------------------------------------------------- HTTP
test('HTTP: GET /api/aspects = get_capabilities.aspects (cần phiên); POST /api/work_orders nhận aspect (sai ⇒ 400 aspect_unsupported); owner đặt default_aspect, agent Bearer không vào được; renderView/overview có aspect', async () => {
  const k = await D.bootTmp();
  try {
    const so = await D.setupOwner(k.app, k.base), call = D.ui(k.base, so);
    assert.equal((await D.request(k.base, 'GET', '/api/aspects')).status, 401, 'cần phiên');
    const r = await call('GET', '/api/aspects');
    assert.equal(r.status, 200); assert.deepEqual(r.json, aspectOps.catalogFor());
    assert.match(r.headers.etag, /^W\/"aspects-v\d+"$/);
    const fx = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures', 'api-aspects.json'), 'utf8'));
    assert.deepEqual(Object.keys(r.json).sort(), Object.keys(fx).filter((x) => x !== '_doc').sort());
    assert.deepEqual(r.json.aspects.map((a) => Object.keys(a).sort()), fx.aspects.map((a) => Object.keys(a).sort()), 'route thật đúng lược đồ fixture');
    // kênh + lệnh
    const ch = await call('POST', '/api/channels', { name: 'Kênh dọc', data: { default_aspect: '9:16', policy: { thumbnail_required: false } } });
    assert.equal(ch.status, 201, ch.text);
    const chId = ch.json.display_id;
    assert.equal(k.app.ctx.db.json(k.app.ctx.db.get("SELECT data FROM channel_versions WHERE entity_id=(SELECT id FROM channels WHERE display_id=?) AND version=1", chId)).data.default_aspect, '9:16');
    const upd = await call('POST', '/api/channels', { id: chId, data: { default_aspect: '16:9' } });
    assert.equal(upd.status, 201, upd.text);
    const bad = await call('POST', '/api/channels', { id: chId, data: { default_aspect: '2:1' } });
    assert.equal(bad.status, 400); assert.equal(bad.json.error.code, 'aspect_unsupported'); assert.match(bad.json.error.text_human, /không được hỗ trợ/);
    const w1 = await call('POST', '/api/work_orders', { channel: chId, kind: 'manual', brief: 'x', aspect: '9:16' });
    assert.equal(w1.status, 201); assert.equal(w1.json.work_order.aspect, '9:16');
    const w2 = await call('POST', '/api/work_orders', { channel: chId, kind: 'manual', brief: 'x', aspect: '5:4' });
    assert.equal(w2.status, 400); assert.equal(w2.json.error.code, 'aspect_unsupported');
    // agent Bearer không gọi được route phiên UI (ô ✗: agent không đặt tỉ lệ qua HTTP)
    const ag = k.app.ctx.write(owner(k.app.ctx.db), 'agent.create', { name: 'AG', scopes: ['read', 'compose', 'run'] });
    assert.ok([401, 403].includes((await D.request(k.base, 'POST', '/api/channels', { token: ag.token, body: { id: chId, data: { default_aspect: '9:16' } } })).status));
    assert.ok([401, 403].includes((await D.request(k.base, 'POST', '/api/work_orders', { token: ag.token, body: { channel: chId, aspect: '9:16' } })).status));
    // bài 9:16 → renderView: render.aspect/size/fit; overview.recent_renders[].aspect; lessons nộp qua write
    const db = k.app.ctx.db, o = owner(db), write = k.app.ctx.write;
    const m1 = write(o, 'cast.save', { channel: chId, name: 'A', data: { look: {} } }), m2 = write(o, 'cast.save', { channel: chId, name: 'B', data: { look: {} } });
    const sub = write(o, 'lesson.submit', { channel: chId, title: 'Dọc', work_order: w1.json.work_order.display_id, lines: [{ who: m1.display_id, say: 'Chào bạn' }, { who: m2.display_id, say: 'Chào nhé' }], beats: [] });
    const rv = await call('GET', '/api/renders/' + sub.render.display_id);
    assert.equal(rv.json.render.aspect, '9:16'); assert.deepEqual(rv.json.render.size, [1080, 1920]);
    assert.deepEqual(Object.keys(rv.json.fit), ['yt_shorts', 'fb_reels', 'tiktok']);
    const ov = await call('GET', '/api/overview');
    assert.equal(ov.status, 200, ov.text);
    assert.equal(ov.json.recent_renders.find((x) => x.id === sub.render.display_id).aspect, '9:16');
    const gr = await call('GET', '/api/grid/lessons?q=' + encodeURIComponent('aspect:9:16'));
    assert.deepEqual(gr.json.rows.map((x) => x.display_id), [sub.lesson.display_id]);
  } finally { await k.clean(); }
});

// ---------------------------------------------------------------- agent giả + prompt tĩnh
test('agent giả: đọc get_task.aspect ⇒ chọn mẫu lesson-vertical, KHÔNG gửi aspect, bài lưu "9:16" theo lệnh; việc 16:9 vẫn dùng mẫu gốc; prompt aspect.md tĩnh (không biến mới)', async () => {
  const fake = require('../agent/fake-agent.js'), real = registry.all;
  const { t, b, mcp, mk } = mcpKit();
  try {
    // registry giả: khối bài thường khai cả 9:16 (việc của gói A2) để bài mẫu dọc qua kiểm khối
    registry.all = () => real.call(registry).map((e) => ((e.kinds || []).includes('lesson') ? Object.assign({}, e, { aspects: ['16:9', '9:16'] }) : e));
    const c = mk(['read', 'compose', 'run']);
    const client = { async call(name, args) { const r = (await mcp.handle({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name, arguments: args || {} } }, c)).result; return { isError: !!r.isError, text: r.content[0].text, data: r.structuredContent }; } };
    assert.ok(fake.listSamples().includes('lesson-vertical'));
    assert.equal(fake.loadSample('lesson-vertical').extra.aspect, undefined, 'mẫu dọc không tự gửi aspect');
    const cu = t.write(b.o, 'curriculum.save', { channel: b.ch.display_id, title: 'Mục dọc' });
    t.write(b.o, 'work_order.create', { channel: b.ch.display_id, kind: 'new_lesson', curriculum_node: cu.display_id, aspect: '9:16' });
    const task = (await client.call('get_next_task')).data.task;
    assert.equal(task.aspect.value, '9:16');
    assert.equal(await fake.handleTask(client, task), 'done');
    const l = t.db.get('SELECT l.display_id d FROM lessons l ORDER BY l.created_at DESC LIMIT 1');
    assert.equal(verOf(t.db, l.d).aspect, '9:16');
    assert.equal(verOf(t.db, l.d).thumbnail, null, 'kênh dọc chưa có mẫu ảnh bìa ⇒ agent giả không nộp ảnh bìa (và không bị đòi)');
    assert.equal(t.db.get("SELECT state FROM work_orders WHERE kind='new_lesson'").state, 'fulfilled');
    // việc 16:9: mẫu gốc
    const cu2 = t.write(b.o, 'curriculum.save', { channel: b.ch.display_id, title: 'Mục ngang' });
    t.write(b.o, 'work_order.create', { channel: b.ch.display_id, kind: 'new_lesson', curriculum_node: cu2.display_id });
    const task2 = (await client.call('get_next_task')).data.task;
    assert.deepEqual(task2.aspect, { value: '16:9', source: 'default' });
    assert.equal(await fake.handleTask(client, task2), 'done');
    assert.equal(verOf(t.db, t.db.get('SELECT l.display_id d FROM lessons l ORDER BY l.created_at DESC LIMIT 1').d).aspect, '16:9');
    // prompt tĩnh (CNS-348): agent/prompt/aspect.md không có {{biến}}; runner.buildPrompt vẫn ghép và có đoạn tỉ lệ
    const md = fs.readFileSync(path.join(__dirname, '..', 'agent', 'prompt', 'aspect.md'), 'utf8');
    assert.ok(!/\{\{/.test(md)); assert.match(md, /aspect_mismatch/); assert.match(md, /get_capabilities/);
    const { buildPrompt } = require('../agent/runner.js');
    const p = buildPrompt({ work_order: 'WO-0001', kind: 'new_lesson', review_notes: [] });
    assert.match(p, /Tỉ lệ khung \(aspect\)/); assert.ok(!/\{\{/.test(p));
  } finally { registry.all = real; t.clean(); }
});
