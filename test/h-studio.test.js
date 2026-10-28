// © 2026 Gen Labs — All rights reserved.
// Gói P0b — giao diện + agent: tách i18n theo gói UI, route #/cast + alias work_orders, ?q= vào lưới, Phòng chiếu không hardcode cổng, CSS theo gói, agent/samples + agent/prompt.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const ROOT = path.join(__dirname, '..');
const STUDIO = path.join(ROOT, 'studio');
const load = (rel) => import(pathToFileURL(path.join(STUDIO, rel)).href);
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');

test('i18n tách theo gói UI: module nào cũng {vi,en} cùng bộ khoá, KHÔNG trùng khoá giữa module; cửa cũ i18n.js giữ nguyên API', async () => {
  const idx = await load('i18n/index.js'), old = await load('i18n.js');
  assert.deepEqual(Object.keys(idx.MODULES), ['core', 'ov', 'brand', 'cast', 'review', 'lessons', 'lists']);
  const seen = new Map();
  for (const [name, m] of Object.entries(idx.MODULES)) {
    assert.deepEqual(Object.keys(m.vi).sort(), Object.keys(m.en).sort(), name + ': vi và en cùng bộ khoá');
    for (const k of Object.keys(m.vi)) { assert.ok(!seen.has(k), `khoá "${k}" trùng giữa ${seen.get(k)} và ${name}`); seen.set(k, name); }
  }
  assert.equal(old.VI, idx.VI); assert.equal(old.t, idx.t); assert.equal(old.tOr, idx.tOr);
  assert.ok(Object.keys(idx.MODULES.core.vi).length > 250, 'chuỗi lõi đã chuyển nguyên vẹn');
  idx.setLang('vi'); assert.equal(idx.t('nav.cast'), 'Nhân vật'); idx.setLang('en'); assert.equal(idx.t('nav.cast'), 'Cast'); idx.setLang('vi');
  assert.equal(idx.t('nav.overview'), 'Tổng quan');
  assert.ok(!/from '\.\/i18n\/(?!index)/.test(read('studio/i18n.js')));
});

test('route: #/cast có trong ROUTES; #/work_orders (khoá API) và #/work-orders cùng mở lưới Lệnh; ?q= được parse', async () => {
  const u = await load('components/util.js');
  assert.ok(u.ROUTES.includes('cast'));
  assert.deepEqual(u.parseRoute('#/cast?q=status:candidate'), { path: 'cast', id: null, query: { q: 'status:candidate' } });
  assert.equal(u.parseRoute('#/cast/CM-0001').id, 'CM-0001');
  assert.deepEqual(u.parseRoute('#/work-orders?q=state:open'), { path: 'work-orders', id: null, query: { q: 'state:open' } });
  assert.equal(u.parseRoute('#/work_orders?q=state:open').path, 'work-orders', 'href kiểu khoá API vẫn đúng lưới');
  assert.equal(u.parseRoute('#/khong-co').path, 'overview');
  assert.equal(u.buildHash('cast', 'CM-0001'), '#/cast/CM-0001');
  const app = read('studio/app.js'); assert.match(app, /case 'cast': return \(await import\('\.\/views\/cast\.js'\)\)\.mount/);
  assert.match(read('studio/components/shell.js'), /path: 'cast', icon: 'grid', label: 'nav\.cast'/);
  const cast = await load('views/cast.js'); assert.equal(typeof cast.mount, 'function');
});

test('grid-view: ?q= trong route thắng cfg.q; rỗng ⇒ cfg.q ⇒ rỗng (D0 ↗ mở lưới đã lọc)', async () => {
  const { initialQuery, gridView } = await load('views/grid-view.js');
  assert.equal(initialQuery({ route: { query: { q: 'state:open' } } }, { q: 'x' }), 'state:open');
  assert.equal(initialQuery({ route: { query: { q: '  rights:pending ' } } }, {}), 'rights:pending');
  assert.equal(initialQuery({ route: { query: {} } }, { q: 'kind:manual' }), 'kind:manual');
  assert.equal(initialQuery({ route: { query: { q: '   ' } } }, { q: 'a' }), 'a');
  assert.equal(initialQuery({ route: { query: { q: 5 } } }, {}), '');
  assert.equal(initialQuery({}, undefined), '');
  assert.match(read('studio/views/grid-view.js'), /q: initialQuery\(ctx, cfg\)/, 'createDataGrid nhận q từ initialQuery');
  assert.equal(typeof gridView({ grid: 'cast' }), 'function');
});

test('Phòng chiếu: không còn GATE_ORDER hardcode (đọc danh sách cổng từ API); làn tuỳ chọn review-lanes nạp có try/catch; CSS theo gói nối sẵn', () => {
  const rr = read('studio/views/review-room.js');
  assert.ok(!/GATE_ORDER/.test(rr)); assert.match(rr, /gates\.map\(\(g\) => g\.gate\)/);
  assert.match(rr, /OPTIONAL_LANES = \['cursor'\]/); assert.match(rr, /import\('\.\/review-lanes\/' \+ name \+ '\.js'\)/);
  const html = read('studio/index.html');
  for (const f of ['overview', 'brand', 'cast', 'review', 'lessons']) { assert.ok(fs.existsSync(path.join(STUDIO, 'css', f + '.css')), f + '.css'); assert.ok(html.includes(`./css/${f}.css`), 'index.html nối ' + f); }
});

// ---- agent ----
test('agent/samples + agent/prompt: mẫu bài đọc từ JSON (đúng nội dung cũ), prompt ghép từ *.md (đúng khung cũ), thêm file là nối tiếp', () => {
  const fake = require('../agent/fake-agent.js');
  const { buildPrompt } = require('../agent/runner.js');
  assert.deepEqual(fake.listSamples(), ['lesson', 'lesson-thumb', 'tutorial', 'tutorial-trailer']);   // lesson-thumb: gói T; tutorial + trailer: gói U
  const spec = fake.loadSample('lesson');
  assert.equal(spec.lines.length, 3); assert.equal(spec.cast.length, 2); assert.deepEqual(fake.LINES, spec.lines);
  const cast = [{ display_id: 'CM-0001', name: 'Anh Gen' }, { display_id: 'CM-0002', name: 'Bé Hỏi' }];
  const task = { channel: { display_id: 'CH-0001' }, curriculum_node: { display_id: 'CU-0001' }, work_order: 'WO-0001' };
  const les = fake.sample(cast, task);
  assert.deepEqual(les.lines.map(l => l.who), ['CM-0002', 'CM-0001', 'CM-0002']);
  assert.equal(les.title, 'Vì sao A.I. sai mà vẫn tự tin?'); assert.equal(les.beats.length, 3); assert.equal(les.beats[1].block, 'prob-card');
  assert.deepEqual(les.beats[1].params.options[0], ['Hà Nội', 92]); assert.equal(les.work_order, 'WO-0001');
  assert.notEqual(fake.sample(cast, task).beats, spec.beats, 'mỗi lần nộp là bản sao, không dùng chung tham chiếu');
  // "$cast:<Tên>" trong extra
  const withExtra = fake.sample(cast, task, Object.assign({}, spec, { extra: { thumbnail: { variants: [{ sidekick: { cast: '$cast:Bé Hỏi' } }] }, kind: 'lesson' } }));
  assert.equal(withExtra.thumbnail.variants[0].sidekick.cast, 'CM-0002'); assert.equal(withExtra.kind, 'lesson');
  assert.throws(() => fake.loadSample('khong-co'), /Không có mẫu agent giả/); assert.throws(() => fake.loadSample('../x'), /không hợp lệ/);
  // prompt
  const p = buildPrompt({ work_order: 'WO-0007', kind: 'revise', brief: 'Sửa đoạn 2\n\nvà đoạn 3', review_notes: [{ pin_ref: 'LN-0002', text: 'nhanh quá' }], blocked: { reason: { code: 'gate_fail' } } });
  const order = ['Bạn là agent soạn bài', 'Việc cần làm: Work order WO-0007 (revise).', 'Lời giao việc:\nSửa đoạn 2\n\nvà đoạn 3', '- LN-0002: nhanh quá', 'Bản dựng bị chặn: {"code":"gate_fail"}', 'work_order = WO-0007 → complete_task', 'DỮ LIỆU', 'report_problem', 'ƯU TIÊN SVG'];
  let at = -1; for (const s of order) { const i = p.indexOf(s); assert.ok(i > at, `thiếu/sai thứ tự: ${s}`); at = i; }
  assert.ok(!/\{\{/.test(p), 'không còn biến chưa thay');
  const p0 = buildPrompt({ work_order: 'WO-1', kind: 'manual' });
  assert.ok(!/Lời giao việc|Ghi chú duyệt|bị chặn:/.test(p0) && !/\n{3,}/.test(p0), 'đoạn rỗng bị bỏ');
  // thêm file prompt (như gói T/U) ⇒ nối tiếp
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'gs-prompt-'));
  fs.writeFileSync(path.join(dir, '00-a.md'), 'Đầu {{work_order}}\n\n{{brief}}'); fs.writeFileSync(path.join(dir, '10-thumbnail.md'), 'Ảnh bìa: …');
  assert.equal(buildPrompt({ work_order: 'W', kind: 'k' }, dir), 'Đầu W\n\nẢnh bìa: …'); fs.rmSync(dir, { recursive: true, force: true });
  assert.match(fs.readFileSync(path.join(ROOT, 'Dockerfile.agent'), 'utf8'), /COPY agent\/ \/app\/agent\//, 'image agent mang theo samples + prompt');
});
