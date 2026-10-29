// © 2026 Gen Labs — All rights reserved.
// Gói U — DSL màn giả lập an toàn (F4-5, SPEC-0.2.0 §6.4): danh sách đóng 16 thành phần, chỉ chữ (textContent), không HTML/CSS tự do/URL;
// chèn <script>, onerror, style, URL ngoài ⇒ bị lược đồ từ chối hoặc ra chữ thường; sân khấu không gọi mạng; bố cục Node (đích) khớp DOM thật.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const chromium = require('../render/chromium');
const { openStage } = require('../render/render');
const mockUi = require('../render/blocks/mock-ui');
const { buildPlan } = require('../render/engine/timeline');
const { MINI_MOCK } = require('./g-tutorial-fixtures');

const HAS = chromium.find() ? false : 'không có Chromium';
const win = (children, extra) => Object.assign({ w: 1280, h: 800, root: { type: 'window', children } }, extra);
const errs = (m) => mockUi.validate(m).join(' | ');

test('lược đồ: danh sách đóng; thuộc tính lạ (style, onerror, html, src, href) bị từ chối; URL/đường dẫn ngoài ở image bị từ chối', () => {
  assert.deepEqual(mockUi.validate(MINI_MOCK), []);
  assert.equal(mockUi.TYPES.length, 16);
  assert.match(errs(win([{ type: 'script', text: 'x' }])), /type: phải là một trong/);
  assert.match(errs(win([{ type: 'text', text: 'a', style: 'color:red' }])), /style: thuộc tính không có trong DSL/);
  assert.match(errs(win([{ type: 'button', label: 'a', onerror: 'alert(1)', onclick: 'x' }])), /onerror: thuộc tính không có.*onclick/);
  assert.match(errs(win([{ type: 'text', text: 'a', html: '<b>x</b>' }])), /html: thuộc tính không có/);
  assert.match(errs(win([{ type: 'image', asset: 'https://evil.example/x.png', w: 100, h: 100 }])), /asset: phải là mã asset AS-…/);
  assert.match(errs(win([{ type: 'image', asset: 'AS-1', src: 'https://evil.example/x.png', w: 100, h: 100 }])), /src: thuộc tính không có/);
  assert.match(errs(win([{ type: 'text', text: { toString: 1 } }])), /phải là chữ/);
  assert.match(errs({ w: 1280, h: 800, root: { type: 'col', children: [] } }), /gốc phải là/);
  assert.match(errs(win([{ type: 'text', text: 'a' }], { css: 'body{}' })), /mock\.css: thuộc tính không có/);
  assert.match(errs(win([{ type: 'button', id: 'a', label: 'x' }, { type: 'button', id: 'a', label: 'y' }])), /bị trùng/);
  assert.match(errs(win([{ type: 'button', id: 'Bad Id', label: 'x' }])), /id phải dạng/);
  let deep = { type: 'col', children: [] }; const root = deep; for (let i = 0; i < 9; i++) { const n = { type: 'col', children: [] }; deep.children.push(n); deep = n; }
  assert.match(errs(win([root])), /sâu quá 8 tầng/);
  assert.match(errs(win(Array.from({ length: 301 }, () => ({ type: 'text', text: 'a' })))), /quá 300 nút/);
  assert.match(errs(win([{ type: 'table', columns: Array(9).fill('c'), rows: [] }])), /1–8 cột/);
  assert.match(errs(win([{ type: 'sidebar', items: ['a'] }, { type: 'col', children: [{ type: 'sidebar', items: ['b'] }] }])), /sidebar chỉ nằm trực tiếp trong window/);
});

test('bố cục tất định: phần tử có id tự thành đích; nút canh đáy với ô nhập có nhãn; vùng chính cuộn được; layout hai lần trùng byte', () => {
  const a = mockUi.layout(MINI_MOCK), b = mockUi.layout(JSON.parse(JSON.stringify(MINI_MOCK)));
  assert.equal(JSON.stringify(a), JSON.stringify(b));
  assert.deepEqual(Object.keys(a.targets).sort(), ['btn_ok', 'in_name', 'nav_channels', 'nav_home', 'tg_on']);
  assert.equal(a.targets.in_name.kind, 'field'); assert.equal(a.targets.nav_home.scroll, false); assert.equal(a.targets.in_name.scroll, true);
  const row = mockUi.layout(win([{ type: 'col', children: [{ type: 'row', children: [{ type: 'input', id: 'i', label: 'Tên' }, { type: 'button', id: 'b', label: 'Lưu' }] }] }]));
  assert.equal(row.targets.i.y + row.targets.i.h, row.targets.b.y + row.targets.b.h, 'đáy nút = đáy ô nhập (canh đáy trong row)');
  const tall = mockUi.layout(win([{ type: 'col', children: Array.from({ length: 30 }, (_, i) => ({ type: 'button', id: 'b' + i, label: 'Nút ' + i })) }]));
  assert.ok(tall.scrollMax > 0 && tall.contentH > 800);
});

test('sân khấu thật: <script>/onerror/URL trong CHỮ chỉ là chữ (textContent), không phần tử lạ, không gọi mạng; hộp DOM khớp đích Node', { skip: HAS }, async () => {
  const evil = '<script>window.__pwn=1</script><img src=//e.x onerror=a()>';   // ≤ 60 ký tự (giới hạn nhãn)
  const mock = win([{ type: 'col', children: [{ type: 'topbar', title: evil }, { type: 'text', id: 't_evil', text: evil }, { type: 'button', id: 'btn_x', label: 'Lưu', variant: 'primary' },
    { type: 'input', id: 'in_x', label: 'Tên', placeholder: 'javascript:alert(1)' }, { type: 'list', id: 'l', items: [{ id: 'li_a', label: evil, sub: 'https://evil.example' }] }] }]);
  assert.deepEqual(mockUi.validate(mock), [], 'chữ tuỳ ý là hợp lệ — vì chỉ được đặt bằng textContent');
  const plan = buildPlan({ kind: 'tutorial', fps: 30, cast: { 'CM-0001': { name: 'Vy' } }, clips: { 'LN-1': { duration_ms: 3000 } },
    lesson: { title: 'T', kind: 'tutorial', host: { mode: 'none' }, lines: [{ id: 'LN-1', who: 'CM-0001', say: 'Xin chào các bạn nhỏ nhé' }],
      screens: [{ id: 'SC-1', source: { mock }, chrome: 'browser', url_label: evil }],
      beats: [{ id: 'BT-0001', block: 'screen', anchor: { line: 'LN-1', word_index: 0 }, params: { screen: 'SC-1', transition: 'cut' } }] } });
  const errors = [], stage = await openStage({ errors });
  try {
    await stage.ev('window.__load(' + JSON.stringify(Object.assign({}, plan, { assetData: {} })) + ')');
    await stage.ev('window.__seek(1500)');
    const r = await stage.ev(`(function(){var L=document.getElementById('layerFull');
      var t=[].filter.call(L.querySelectorAll('.mu-text'),function(e){return e.textContent.indexOf('<script>')===0;})[0];
      return {scripts:L.querySelectorAll('script').length, imgs:L.querySelectorAll('img').length, iframes:L.querySelectorAll('iframe,object,embed,a').length,
        pwn:window.__pwn||0, text:t?t.textContent:null, url:document.querySelector('.sc-url').textContent,
        net:performance.getEntriesByType('resource').filter(function(e){return !/^file:/.test(e.name);}).length}})()`);
    assert.deepEqual([r.scripts, r.imgs, r.iframes, r.pwn, r.net], [0, 0, 0, 0, 0]);
    assert.equal(r.text, evil, 'nguyên văn là chữ'); assert.equal(r.url, evil);
    // bố cục Node == DOM: hộp nút btn_x trên khung (máy quay {960,540,1}) = rect màn + đích × s
    const sc = plan.screens[0], tb = sc.targets.btn_x;
    const want = { x: sc.rect.x + tb.x * sc.s, y: sc.rect.y + tb.y * sc.s, w: tb.w * sc.s, h: tb.h * sc.s };
    const got = await stage.ev(`(function(){var e=[].filter.call(document.querySelectorAll('#layerFull .mu-btn'),function(x){return x.textContent==='Lưu';})[0].getBoundingClientRect();return {x:e.x,y:e.y,w:e.width,h:e.height};})()`);
    for (const k of ['x', 'y', 'w', 'h']) assert.ok(Math.abs(got[k] - want[k]) < 1.5, `${k}: DOM ${got[k]} vs Node ${want[k]}`);
    assert.deepEqual(errors, []);
  } finally { await stage.close(); }
});
