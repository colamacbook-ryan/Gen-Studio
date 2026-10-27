// © 2026 Gen Labs — All rights reserved.
// Gói E: test thuần Node cho phần không DOM của giao diện (i18n, route, timecode, escape, tách thuật ngữ).
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const STUDIO = path.join(__dirname, '..', 'studio');
const load = (rel) => import(pathToFileURL(path.join(STUDIO, rel)).href);

function sourceFiles(dir) {
  const out = [];
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) out.push(...sourceFiles(p));
    else if (e.name.endsWith('.js')) out.push(p);
  }
  return out;
}

test('i18n: vi và en có cùng bộ khoá, không chuỗi rỗng', async () => {
  const { VI, EN } = await load('i18n.js');
  assert.deepEqual(Object.keys(VI).sort(), Object.keys(EN).sort());
  for (const [k, v] of [...Object.entries(VI), ...Object.entries(EN)]) assert.ok(typeof v === 'string' && v.length > 0, k);
});

test('i18n: mọi khoá t(\'…\') dùng trong mã đều tồn tại; khoá động có đủ', async () => {
  const { VI } = await load('i18n.js');
  const missing = [];
  for (const f of sourceFiles(STUDIO)) {
    if (f.endsWith('i18n.js')) continue;
    const src = fs.readFileSync(f, 'utf8');
    for (const m of src.matchAll(/\bt\(\s*'([a-z_]+(?:\.[a-z_]+)+)'/g)) if (!(m[1] in VI)) missing.push(path.basename(f) + ': ' + m[1]);
  }
  assert.deepEqual(missing, []);
  const dynamic = [
    ...['script', 'beats', 'versions', 'lineage'].map((k) => 'lesson.tab.' + k),
    ...['ruler', 'voice', 'beat', 'sfx', 'gate'].map((k) => 'lane.' + k),
    ...['pass', 'fail', 'unknown'].map((k) => 'gate.' + k),
    ...['owner', 'provider', 'agent', 'channel'].map((k) => 'setup.step.' + k),
    ...['owner', 'reviewer'].map((k) => 'role.' + k),
  ];
  for (const k of dynamic) assert.ok(k in VI, k);
});

test('i18n: t() nội suy biến, rơi về vi rồi về khoá, tOr dùng fallback', async () => {
  const i = await load('i18n.js');
  i.setLang('vi');
  assert.equal(i.t('grid.rows', { n: 3 }), '3 hàng');
  i.setLang('en');
  assert.equal(i.t('grid.rows', { n: 3 }), '3 rows');
  assert.equal(i.t('khong.ton.tai'), 'khong.ton.tai');
  assert.equal(i.tOr('col.zzz', 'Zzz'), 'Zzz');
  i.setLang('xx');
  assert.equal(i.getLang(), 'en');
  i.setLang('vi');
});

test('không hardcode tên chủ xưởng/kênh trong mã giao diện', () => {
  for (const f of sourceFiles(STUDIO)) {
    const src = fs.readFileSync(f, 'utf8');
    assert.ok(!/Ryan|Lớp AI Bình Dân/.test(src), path.basename(f));
  }
});

test('route: parse hash', async () => {
  const { parseRoute } = await load('components/util.js');
  assert.deepEqual(parseRoute(''), { path: 'overview', id: null, query: {} });
  assert.deepEqual(parseRoute('#/review/RD-0004'), { path: 'review', id: 'RD-0004', query: {} });
  assert.deepEqual(parseRoute('#/lessons/LS-0001'), { path: 'lessons', id: 'LS-0001', query: {} });
  assert.deepEqual(parseRoute('#/setup?k=ab%2Bc&x=1'), { path: 'setup', id: null, query: { k: 'ab+c', x: '1' } });
  assert.equal(parseRoute('#/work-orders').path, 'work-orders');
  assert.equal(parseRoute('#/khong-co').path, 'overview');
  assert.equal(parseRoute('#/review?view=decided').query.view, 'decided');
});

test('route: buildHash', async () => {
  const { buildHash, parseRoute } = await load('components/util.js');
  assert.equal(buildHash('review', 'RD-0004'), '#/review/RD-0004');
  assert.equal(buildHash('lessons'), '#/lessons');
  assert.equal(parseRoute(buildHash('review', 'RD-0004')).id, 'RD-0004');
});

test('timecode: fmtTc / fmtDur / fmtClock', async () => {
  const { fmtTc, fmtDur, fmtClock } = await load('components/util.js');
  assert.equal(fmtTc(0), '00:00.0');
  assert.equal(fmtTc(31200), '00:31.2');
  assert.equal(fmtTc(65999), '01:05.9');
  assert.equal(fmtTc(-5), '00:00.0');
  assert.equal(fmtTc('x'), '00:00.0');
  assert.equal(fmtDur(43000), '0:43');
  assert.equal(fmtClock(250), '04:10');
});

test('escape: esc() và toText() không để lọt HTML / object', async () => {
  const { esc, toText } = await load('components/util.js');
  assert.equal(esc('<img src=x onerror="a()">&\''), '&lt;img src=x onerror=&quot;a()&quot;&gt;&amp;&#39;');
  assert.equal(esc(null), '');
  assert.equal(toText({ a: 1 }), '{"a":1}');
  assert.equal(toText(null), '');
  assert.equal(toText(7), '7');
  assert.notEqual(toText({}), '[object Object]');
});

test('splitTerms: đánh dấu thuật ngữ, không phân biệt hoa thường, ưu tiên cụm dài', async () => {
  const { splitTerms } = await load('components/util.js');
  const parts = splitTerms('Vì A.I., cụ thể là Large Language Model, không tra cứu.', ['A.I.', 'large language model']);
  assert.deepEqual(parts.filter((p) => p.term).map((p) => p.text), ['A.I.', 'Large Language Model']);
  assert.equal(parts.map((p) => p.text).join(''), 'Vì A.I., cụ thể là Large Language Model, không tra cứu.');
  assert.deepEqual(splitTerms('xin chào', []), [{ text: 'xin chào', term: false }]);
  assert.deepEqual(splitTerms(null, null), [{ text: '', term: false }]);
});

test('lineAt: câu đang phát / câu gần nhất đã qua', async () => {
  const { lineAt } = await load('components/util.js');
  const lines = [{ id: 'LN-0001', a_ms: 1100, b_ms: 5200 }, { id: 'LN-0002', a_ms: 6300, b_ms: 15500 }];
  assert.equal(lineAt(lines, 500), null);
  assert.equal(lineAt(lines, 3000).id, 'LN-0001');
  assert.equal(lineAt(lines, 5800).id, 'LN-0001');
  assert.equal(lineAt(lines, 7000).id, 'LN-0002');
});

test('normalizeError / statusTone / csvEscape', async () => {
  const { normalizeError, statusTone, csvEscape } = await load('components/util.js');
  const e = normalizeError({ code: 'forbidden', text_human: 'Không có quyền', detail: 'x' });
  assert.equal(e.text_human, 'Không có quyền');
  assert.equal(normalizeError(new Error('boom')).detail, 'boom');
  assert.equal(statusTone('pass'), 'ok');
  assert.equal(statusTone('stalled'), 'danger');
  assert.equal(statusTone('waiting_quota'), 'warn');
  assert.equal(statusTone('awaiting_review'), 'info');
  assert.equal(csvEscape('a,"b"'), '"a,""b"""');
  assert.equal(csvEscape('=HYPERLINK("x")'), '"\'=HYPERLINK(""x"")"');
  assert.equal(csvEscape('-1+2'), "'-1+2");
  assert.equal(csvEscape('a\rb'), '"a\rb"');
});

test('overview.flatten: làm phẳng, không ra [object Object]', async () => {
  const { flatten } = await load('views/overview.js');
  const rows = flatten({ a: 1, b: { c: 2, d: { e: 3 } }, f: [1, 2], g: [{ x: 1 }], h: null });
  assert.deepEqual(rows, [['a', '1'], ['b.c', '2'], ['b.d.e', '3'], ['f', '1, 2'], ['g', '1'], ['h', '—']]);
});

test('fmtVal: định dạng số đo theo khoá, không ra JSON thô', async () => {
  const { fmtVal, fmtBytes } = await load('components/util.js');
  assert.equal(fmtVal('total_duration_ms', 117306), '1:57');
  assert.equal(fmtVal('median_review_seconds', 250), '4:10');
  assert.equal(fmtVal('disk.used', 17166488), '16,4 MB');
  assert.equal(fmtBytes(270553174016), '252 GB');
  assert.equal(fmtVal('by_state', { open: 1, stalled: 2 }), 'open 1 · stalled 2');
  assert.equal(fmtVal('x', null), '—');
  assert.ok(!/T\d\d:/.test(fmtVal('next_schedule', '2026-10-27T23:00:00.000Z')));
});

test('datagrid.cellText: định dạng ô', async () => {
  const { cellText } = await load('components/datagrid.js');
  // không bao giờ in object/JSON thô vào ô (L-102): object → nhãn đọc được, mảng giá trị → danh sách
  assert.equal(cellText({ key: 'x' }, { a: 1 }), 'a 1');
  assert.equal(cellText({ key: 'scopes' }, ['read', 'run']), 'read, run');
  assert.ok(!/[{}"]/.test(cellText({ key: 'x' }, { m: [{ a: 1 }], q: { v: null } }))); 
  assert.equal(cellText({ key: 'n' }, null), '');
  assert.equal(cellText({ key: 'd', type: 'duration' }, 43000), '0:43');
  // cột thời gian server khai type 'date' (grids.js) → không in ISO thô
  assert.ok(!/T\d\d:/.test(cellText({ key: 'ts', type: 'date' }, '2026-10-27T10:07:11.375Z')));
});

test('mọi module giao diện nạp được trong Node (cú pháp ESM hợp lệ)', async () => {
  for (const f of sourceFiles(STUDIO)) {
    if (f.endsWith('app.js')) continue; // app.js chạm DOM ngay khi nạp
    await load(path.relative(STUDIO, f));
  }
});

test('runner: mọi trạng thái (enum của máy chủ) và mã code runner có chữ vi/en — giao diện không hiện câu chữ tự do', async () => {
  const { VI, EN } = await load('i18n.js');
  const root = path.join(__dirname, '..');
  const oauth = fs.readFileSync(path.join(root, 'server', 'oauth.js'), 'utf8');
  const states = /RUNNER_STATES = new Set\(\[([^\]]+)\]\)/.exec(oauth)[1].match(/'([a-z_]+)'/g).map((x) => x.replace(/'/g, ''));
  assert.deepEqual(states.sort(), ['error', 'paired', 'requested', 'unpaired', 'waiting_window']);
  const runner = fs.readFileSync(path.join(root, 'agent', 'runner.js'), 'utf8');
  const used = new Set([...runner.matchAll(/setState\('([a-z_]+)'(?:, '([a-z_]+)')?\)/g)].flatMap((m) => [m[1] && 'state:' + m[1], m[2] && 'code:' + m[2]]).filter(Boolean));
  assert.ok(used.size >= 8);
  for (const u of used) {
    const [kind, v] = u.split(':');
    const key = (kind === 'state' ? 'runner.state.' : 'runner.code.') + v;
    assert.ok(key in VI && key in EN, key);
  }
  for (const k of ['col.display_id', 'col.last_call_at', 'col.wake_limit_per_day', 'col.scopes', 'kind.internal', 'pending.deny_all', 'k0.title', 'ov.internal_off']) assert.ok(k in VI && k in EN, k);
});

// Rào L-102 (tái phạm lần 3: "[object HTMLSpanElement]", "null" trên màn): Element.append gốc in null/mảng thành chữ.
// Câu lệnh có nhánh rỗng (": null" / "|| null") hoặc trải mảng phải đi qua append() của dom.js, không qua el.append(...).
test('UI: không truyền null có điều kiện vào Element.append gốc', () => {
  const bad = [];
  for (const f of sourceFiles(STUDIO)) {
    if (f.endsWith('dom.js')) continue;
    const src = fs.readFileSync(f, 'utf8');
    const re = /(?<![\w.])(?!append\()[\w$]+\.append\(/g;
    let m;
    while ((m = re.exec(src))) {
      // lấy hết đối số của lời gọi (đếm ngoặc)
      let i = m.index + m[0].length, depth = 1;
      while (i < src.length && depth) { const ch = src[i++]; if (ch === '(') depth++; else if (ch === ')') depth--; }
      const args = src.slice(m.index + m[0].length, i - 1);
      // chỉ xét nhánh rỗng ở cấp đối số trực tiếp (null trong props của h() được h() bỏ qua — an toàn)
      let top = '', d = 0;
      for (const ch of args) { if ('([{'.includes(ch)) d++; else if (')]}'.includes(ch)) d--; else if (d === 0) top += ch; }
      if (/:\s*null\b|\|\|\s*null\b/.test(top)) bad.push(path.relative(STUDIO, f) + ':' + src.slice(0, m.index).split('\n').length);
    }
  }
  assert.deepEqual(bad, [], 'dùng append(el, [...]) của dom.js cho các lời gọi này');
});
