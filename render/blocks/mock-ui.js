// © 2026 Gen Labs — All rights reserved.
// Khối `mock-ui` (F4, SPEC-0.2.0 §6.4): DSL màn giả lập → bố cục TẤT ĐỊNH (thuần, chạy cả Node lẫn trình duyệt) + dựng DOM chỉ bằng textContent.
// Không phải nhịp agent đặt được (index.json agent:false; check() từ chối khi dùng làm beat): khối `screen` và render/engine/tutorial.js gọi qua API dưới đây.
//   validate(mock, opts?) → [lỗi tiếng Việt]   — danh sách ĐÓNG 16 thành phần (window, sidebar, topbar, tabs, row, col, card, text, button, input, textarea, table, list,
//                                                 badge, toggle, image); không nhận HTML, không nhận CSS tự do, không nhận URL; độ sâu ≤ 8, ≤ 300 nút; `id` /^[a-z][a-z0-9_]{0,31}$/ duy nhất.
//   layout(mock) → { w, h, theme, nodes:[{type, x,y,w,h, depth, scroll, p, items?, field?, cells?}], targets:{[id]:{x,y,w,h,label,kind,scroll,draggable}}, main:{x,y,w,h}, contentH, scrollMax }
//                  Toạ độ là px của màn (không phải khung 1920×1080). `scroll` = nút nằm trong vùng chính cuộn được (sidebar/thanh tiêu đề không cuộn).
//   build(rootEl, mock, lay, {assetUrl?}) → { fields:{[id]: {text, ph, caret, box}}, scroller, els:{[id]: phần tử}, lists:{[id mục]: {list, index, h}}, toggles:{[id]: {sw, knob, on}} }   — chỉ trình duyệt; mọi chữ đặt bằng textContent.
// Chữ ước độ rộng theo số ký tự (U.textW) nên bố cục giống hệt giữa Node (đích cho con trỏ, G-CURSOR) và sân khấu.
(function (root) {
  'use strict';
  var U = (typeof module === 'object' && module.exports) ? require('./util') : root.GSUtil;
  var TYPES = ['window', 'sidebar', 'topbar', 'tabs', 'row', 'col', 'card', 'text', 'button', 'input', 'textarea', 'table', 'list', 'badge', 'toggle', 'image'];
  // bảng màu theme là token trung tính (không phải brand) nằm ở render/stage/tutorial.css (.mu-theme-<tên> { --mu-*: … }); khối chỉ tham chiếu var(--mu-*)
  var THEMES = ['console-dark', 'console-light', 'plain-light'];
  var TK = ['bg', 'panel', 'panel2', 'border', 'text', 'muted', 'accent', 'onAccent', 'field', 'ok', 'warn', 'danger', 'info', 'sideActive', 'knob'];
  var T = {}; TK.forEach(function (k) { T[k] = 'var(--mu-' + k.replace(/[A-Z]/g, function (c) { return '-' + c.toLowerCase(); }) + ')'; });
  var LIMITS = { depth: 8, nodes: 300, w: [320, 3840], h: [240, 2400], text: 240, label: 60, items: 24, cols: 8, rows: 12 };
  var ID_RE = /^[a-z][a-z0-9_]{0,31}$/;
  var ASSET_RE = /^AS-\d+$/, PATH_RE = /^media\/[0-9a-f]{2}\/[0-9a-f]{64}\.[a-z0-9]{2,5}$/;
  // thuộc tính được phép theo loại (ngoài `type`); thuộc tính lạ (style, html, onerror, src, href…) ⇒ lỗi
  var PROPS = {
    window: ['title', 'children'], sidebar: ['title', 'items', 'active'], topbar: ['title', 'children'], tabs: ['id', 'items', 'active'],
    row: ['children', 'gap', 'align'], col: ['children', 'gap', 'pad'], card: ['id', 'title', 'children', 'gap', 'draggable'],
    text: ['id', 'text', 'size', 'weight', 'tone'], button: ['id', 'label', 'variant'], input: ['id', 'label', 'placeholder', 'value'],
    textarea: ['id', 'label', 'placeholder', 'value'], table: ['id', 'columns', 'rows', 'row_ids'], list: ['id', 'items'],
    badge: ['id', 'text', 'tone'], toggle: ['id', 'label', 'on'], image: ['id', 'asset', 'w', 'h', 'alt']
  };
  var CONTAINERS = { window: 1, row: 1, col: 1, card: 1, topbar: 1 };
  var ENUMS = { variant: ['primary', 'secondary', 'ghost', 'danger'], size: ['sm', 'md', 'lg', 'xl'], weight: ['normal', 'bold'], tone: ['normal', 'muted', 'accent', 'ok', 'warn', 'danger', 'info'], align: ['start', 'end', 'between'] };
  var FS = { sm: 14, md: 16, lg: 22, xl: 30 };
  var SIDEBAR_W = 240, TITLEBAR_H = 40, TOPBAR_H = 64, TABS_H = 48, BTN_H = 40, FIELD_H = 44, AREA_H = 112, LABEL_H = 26, ROW_H = 44, BADGE_H = 26, TOGGLE_H = 32, MAIN_PAD = 28;
  var tw = function (s, fs) { return Math.round(String(s).length * fs * 0.58); };
  var labelOf = function (it) { return typeof it === 'string' ? it : (it && it.label) || ''; };

  // ---------- kiểm DSL ----------
  function validate(mock, opts) {
    var errs = [], count = 0, ids = {};
    var assetOk = (opts && opts.assetOk) || function (a) { return ASSET_RE.test(a) || PATH_RE.test(a); };
    var E = function (p, t) { if (errs.length < 40) errs.push(p + ': ' + t); };
    if (!mock || typeof mock !== 'object' || Array.isArray(mock)) return ['mock: phải là đối tượng {w, h, theme, root}'];
    Object.keys(mock).forEach(function (k) { if (['w', 'h', 'theme', 'root'].indexOf(k) < 0) E('mock.' + k, 'thuộc tính không có trong DSL'); });
    if (!Number.isInteger(mock.w) || mock.w < LIMITS.w[0] || mock.w > LIMITS.w[1]) E('mock.w', 'phải là số nguyên ' + LIMITS.w.join('–'));
    if (!Number.isInteger(mock.h) || mock.h < LIMITS.h[0] || mock.h > LIMITS.h[1]) E('mock.h', 'phải là số nguyên ' + LIMITS.h.join('–'));
    if (mock.theme !== undefined && THEMES.indexOf(mock.theme) < 0) E('mock.theme', 'phải là một trong ' + THEMES.join(' | '));
    var str = function (p, v, max, req) {
      if (v === undefined || v === null) { if (req) E(p, 'còn thiếu'); return; }
      if (typeof v !== 'string') return E(p, 'phải là chữ (DSL không nhận HTML/đối tượng)');
      if (v.length > max) E(p, 'dài tối đa ' + max + ' ký tự');
    };
    var items = function (p, v, allowSub) {
      if (!Array.isArray(v) || !v.length) return E(p, 'phải là danh sách không rỗng');
      if (v.length > LIMITS.items) E(p, 'tối đa ' + LIMITS.items + ' mục');
      v.slice(0, LIMITS.items).forEach(function (it, i) {
        var q = p + '[' + i + ']';
        if (typeof it === 'string') return str(q, it, LIMITS.label, true);
        if (!it || typeof it !== 'object' || Array.isArray(it)) return E(q, 'phải là chữ hoặc {id, label}');
        Object.keys(it).forEach(function (k) { if (['id', 'label'].concat(allowSub ? ['sub', 'draggable'] : []).indexOf(k) < 0) E(q + '.' + k, 'thuộc tính không có trong DSL'); });
        str(q + '.label', it.label, LIMITS.label, true);
        if (allowSub) { str(q + '.sub', it.sub, LIMITS.label); if (it.draggable !== undefined && typeof it.draggable !== 'boolean') E(q + '.draggable', 'phải là đúng/sai'); }
        if (it.id !== undefined) idOf(q + '.id', it.id);
      });
    };
    function idOf(p, id) {
      if (typeof id !== 'string' || !ID_RE.test(id)) return E(p, 'id phải dạng chữ thường/số/_ (vd btn_save)');
      if (ids[id]) E(p, 'id "' + id + '" bị trùng'); ids[id] = 1;
    }
    function node(n, p, depth) {
      count++;
      if (count > LIMITS.nodes) { if (count === LIMITS.nodes + 1) E(p, 'quá ' + LIMITS.nodes + ' nút'); return; }
      if (depth > LIMITS.depth) return E(p, 'sâu quá ' + LIMITS.depth + ' tầng');
      if (!n || typeof n !== 'object' || Array.isArray(n)) return E(p, 'nút phải là đối tượng {type, …}');
      if (TYPES.indexOf(n.type) < 0) return E(p + '.type', 'phải là một trong ' + TYPES.join(', '));
      var allowed = PROPS[n.type];
      Object.keys(n).forEach(function (k) { if (k !== 'type' && allowed.indexOf(k) < 0) E(p + '.' + k, 'thuộc tính không có trong DSL của "' + n.type + '"'); });
      if (n.id !== undefined) idOf(p + '.id', n.id);
      ['variant', 'size', 'weight', 'tone', 'align'].forEach(function (k) { if (n[k] !== undefined && allowed.indexOf(k) >= 0 && ENUMS[k].indexOf(n[k]) < 0) E(p + '.' + k, 'phải là một trong ' + ENUMS[k].join(' | ')); });
      ['gap', 'pad'].forEach(function (k) { if (n[k] !== undefined && !(Number.isInteger(n[k]) && n[k] >= 0 && n[k] <= 64)) E(p + '.' + k, 'phải là số nguyên 0–64'); });
      ['title', 'alt'].forEach(function (k) { str(p + '.' + k, n[k], LIMITS.label); });
      if (n.type === 'text') str(p + '.text', n.text, LIMITS.text, true);
      if (n.type === 'badge') str(p + '.text', n.text, 24, true);
      if (['button', 'toggle'].indexOf(n.type) >= 0) str(p + '.label', n.label, 40, true);
      if (['input', 'textarea'].indexOf(n.type) >= 0) { str(p + '.label', n.label, LIMITS.label); str(p + '.placeholder', n.placeholder, 80); str(p + '.value', n.value, 120); }
      if (n.type === 'toggle' && n.on !== undefined && typeof n.on !== 'boolean') E(p + '.on', 'phải là đúng/sai');
      if (n.type === 'card' && n.draggable !== undefined && typeof n.draggable !== 'boolean') E(p + '.draggable', 'phải là đúng/sai');
      if (n.type === 'sidebar' || n.type === 'tabs') {
        items(p + '.items', n.items, false);
        if (n.active !== undefined && !(Number.isInteger(n.active) && n.active >= 0 && n.active < (n.items || []).length)) E(p + '.active', 'phải là chỉ số mục');
      }
      if (n.type === 'list') items(p + '.items', n.items, true);
      if (n.type === 'table') {
        if (!Array.isArray(n.columns) || !n.columns.length || n.columns.length > LIMITS.cols) E(p + '.columns', '1–' + LIMITS.cols + ' cột');
        else n.columns.forEach(function (c, i) { str(p + '.columns[' + i + ']', c, 40, true); });
        if (!Array.isArray(n.rows) || n.rows.length > LIMITS.rows) E(p + '.rows', 'tối đa ' + LIMITS.rows + ' hàng');
        else n.rows.forEach(function (r, i) {
          if (!Array.isArray(r) || r.length > LIMITS.cols) return E(p + '.rows[' + i + ']', 'mỗi hàng là danh sách ≤ ' + LIMITS.cols + ' ô chữ');
          r.forEach(function (c, j) { str(p + '.rows[' + i + '][' + j + ']', c, 60, true); });
        });
        if (n.row_ids !== undefined) {
          if (!Array.isArray(n.row_ids) || n.row_ids.length > (n.rows || []).length) E(p + '.row_ids', 'tối đa bằng số hàng');
          else n.row_ids.forEach(function (id, i) { if (id !== null) idOf(p + '.row_ids[' + i + ']', id); });
        }
      }
      if (n.type === 'image') {
        if (typeof n.asset !== 'string' || !assetOk(n.asset)) E(p + '.asset', 'phải là mã asset AS-… (không nhận URL/đường dẫn)');
        if (!Number.isInteger(n.w) || n.w < 16 || n.w > 3840) E(p + '.w', 'số nguyên 16–3840');
        if (!Number.isInteger(n.h) || n.h < 16 || n.h > 2400) E(p + '.h', 'số nguyên 16–2400');
      }
      if (n.children !== undefined || CONTAINERS[n.type]) {
        if (!CONTAINERS[n.type]) return E(p + '.children', '"' + n.type + '" không chứa nút con');
        if (n.children === undefined && n.type === 'topbar') return;
        if (!Array.isArray(n.children)) return E(p + '.children', 'phải là danh sách');
        n.children.forEach(function (c, i) {
          if (c && c.type === 'sidebar' && n.type !== 'window') E(p + '.children[' + i + ']', 'sidebar chỉ nằm trực tiếp trong window');
          if (c && c.type === 'window') E(p + '.children[' + i + ']', 'window chỉ là gốc');
          node(c, p + '.children[' + i + ']', depth + 1);
        });
      }
    }
    if (mock.root === undefined) E('mock.root', 'còn thiếu');
    else if (!mock.root || mock.root.type !== 'window') E('mock.root', 'gốc phải là {type:"window", …}');
    else node(mock.root, 'mock.root', 1);
    return errs;
  }

  // ---------- bố cục ----------
  function intrinsicW(n) {
    if (n.type === 'button') return Math.max(96, tw(n.label, 16) + 44);
    if (n.type === 'badge') return tw(n.text, 13) + 26;
    if (n.type === 'toggle') return 52 + 12 + tw(n.label, 16);
    if (n.type === 'image') return n.w;
    return null;
  }
  var isIntrinsic = function (n) { return intrinsicW(n) !== null; };

  function layout(mock) {
    var nodes = [], targets = {}, W = mock.w, H = mock.h, main = { x: 0, y: 0, w: W, h: H }, inMain = false;
    var add = function (n, x, y, w, h, depth) { var r = { type: n.type, x: Math.round(x), y: Math.round(y), w: Math.round(w), h: Math.round(h), depth: depth, scroll: inMain, p: n }; nodes.push(r); return r; };
    var target = function (id, b, label, kind, draggable) { if (id) targets[id] = { x: b.x, y: b.y, w: b.w, h: b.h, label: String(label || id).slice(0, 60), kind: kind, scroll: inMain, draggable: !!draggable }; };
    // dời cả cây con (canh đáy trong row)
    var shift = function (from, to, dy) {
      if (!dy) return;
      for (var i = from; i < to; i++) { nodes[i].y += dy; if (nodes[i].field) nodes[i].field.y += dy; (nodes[i].items || []).forEach(function (it) { it.y += dy; }); }
      Object.keys(targets).forEach(function (k) { if (targets[k]._i >= from && targets[k]._i < to) targets[k].y += dy; });
    };
    var mark = function (id, i) { if (id && targets[id]) targets[id]._i = i; };

    function place(n, x, y, w, depth) {   // → chiều cao
      var i0 = nodes.length, r, h;
      switch (n.type) {
        case 'col': case 'card': {
          var card = n.type === 'card', pad = card ? 20 : (n.pad === undefined ? 0 : n.pad), gap = n.gap === undefined ? 16 : n.gap;
          r = add(n, x, y, w, 0, depth); var cy = y + pad + (card && n.title ? 34 : 0), any = false;
          (n.children || []).forEach(function (c) { var cw = isIntrinsic(c) ? Math.min(intrinsicW(c), w - 2 * pad) : w - 2 * pad; cy += place(c, x + pad, cy, cw, depth + 1) + gap; any = true; });
          h = (any ? cy - gap : cy) + pad - y; r.h = Math.round(h);
          if (card) { target(n.id, r, n.title, 'card', n.draggable); mark(n.id, i0); }
          return h;
        }
        case 'row': {
          var g = n.gap === undefined ? 12 : n.gap, ch = n.children || [], fixed = 0, flex = 0;
          ch.forEach(function (c) { if (isIntrinsic(c)) fixed += intrinsicW(c); else flex++; });
          var fw = flex ? Math.max(80, (w - fixed - g * Math.max(0, ch.length - 1)) / flex) : 0;
          r = add(n, x, y, w, 0, depth);
          var cx = x, hs = [], starts = [];
          if (!flex && n.align === 'end') cx = x + w - fixed - g * Math.max(0, ch.length - 1);
          var between = !flex && n.align === 'between' && ch.length > 1 ? (w - fixed) / (ch.length - 1) : null;
          ch.forEach(function (c) { var cw = isIntrinsic(c) ? intrinsicW(c) : fw; starts.push(nodes.length); hs.push(place(c, cx, y, cw, depth + 1)); cx += cw + (between === null ? g : between); });
          h = Math.max.apply(null, [0].concat(hs)); r.h = Math.round(h);
          // canh đáy: nút bấm thẳng hàng với ô nhập có nhãn
          starts.push(nodes.length);
          for (var k = 0; k < ch.length; k++) shift(starts[k], starts[k + 1], Math.round(h - hs[k]));
          return h;
        }
        case 'topbar': {
          r = add(n, x, y, w, TOPBAR_H, depth); var rx = x + w - 20;
          (n.children || []).slice().reverse().forEach(function (c) { var cw = intrinsicW(c) || 120; rx -= cw; var j = nodes.length, ch2 = place(c, rx, y, cw, depth + 1); shift(j, nodes.length, Math.round((TOPBAR_H - ch2) / 2)); rx -= 10; });
          return TOPBAR_H;
        }
        case 'tabs': {
          r = add(n, x, y, w, TABS_H, depth); var tx = x; r.items = [];
          (n.items || []).forEach(function (it, i) { var iw = tw(labelOf(it), 16) + 36, b = { x: tx, y: y, w: iw, h: TABS_H }; r.items.push({ x: tx, y: y, w: iw, h: TABS_H, label: labelOf(it), active: i === (n.active || 0) }); if (it && it.id) { target(it.id, b, it.label, 'tab'); mark(it.id, i0); } tx += iw + 4; });
          target(n.id, r, '', 'tabs'); mark(n.id, i0);
          return TABS_H;
        }
        case 'text': {
          var fs = FS[n.size || 'md'], cpl = Math.max(1, Math.floor(w / (fs * 0.58))), lines = Math.min(4, Math.max(1, Math.ceil(String(n.text).length / cpl)));
          h = lines * Math.round(fs * 1.45); r = add(n, x, y, w, h, depth); r.fs = fs; target(n.id, r, n.text, 'text'); mark(n.id, i0); return h;
        }
        case 'button': r = add(n, x, y, w, BTN_H, depth); target(n.id, r, n.label, 'button'); mark(n.id, i0); return BTN_H;
        case 'badge': r = add(n, x, y, w, BADGE_H, depth); target(n.id, r, n.text, 'badge'); mark(n.id, i0); return BADGE_H;
        case 'toggle': r = add(n, x, y, w, TOGGLE_H, depth); target(n.id, { x: x, y: y, w: 52, h: TOGGLE_H }, n.label, 'toggle'); mark(n.id, i0); return TOGGLE_H;
        case 'input': case 'textarea': {
          var lh = n.label ? LABEL_H : 0, fh = n.type === 'input' ? FIELD_H : AREA_H;
          r = add(n, x, y, w, lh + fh, depth); r.field = { x: Math.round(x), y: Math.round(y + lh), w: Math.round(w), h: fh };
          target(n.id, r.field, n.label || n.placeholder, 'field'); mark(n.id, i0); return lh + fh;
        }
        case 'table': {
          var rows = n.rows || [], cols = n.columns || [], cw2 = w / Math.max(1, cols.length);
          h = ROW_H * (1 + rows.length); r = add(n, x, y, w, h, depth); r.cells = { colW: cw2, rowH: ROW_H };
          target(n.id, r, '', 'table'); mark(n.id, i0);
          (n.row_ids || []).forEach(function (id, i) { if (id) { target(id, { x: r.x, y: r.y + ROW_H * (i + 1), w: r.w, h: ROW_H }, (rows[i] || [])[0], 'row'); mark(id, i0); } });
          return h;
        }
        case 'list': {
          var its = n.items || [], hasSub = its.some(function (it) { return it && it.sub; }), ih = hasSub ? 60 : 46;
          h = ih * its.length; r = add(n, x, y, w, h, depth); r.items = [];
          its.forEach(function (it, i) { var b = { x: r.x, y: r.y + i * ih, w: r.w, h: ih }; r.items.push({ x: b.x, y: b.y, w: b.w, h: ih, label: labelOf(it), sub: (it && it.sub) || '' }); if (it && it.id) { target(it.id, b, it.label, 'item', it.draggable); mark(it.id, i0); } });
          target(n.id, r, '', 'list'); mark(n.id, i0);
          return h;
        }
        case 'image': { var iw2 = Math.min(n.w, w), ih2 = Math.round(n.h * iw2 / n.w); r = add(n, x, y, iw2, ih2, depth); target(n.id, r, n.alt, 'image'); mark(n.id, i0); return ih2; }
        default: return 0;
      }
    }

    // gốc window: thanh tiêu đề (tuỳ chọn) + con xếp ngang: sidebar cố định, phần còn lại chia đều = vùng chính (cuộn được)
    var win = mock.root, top = win.title ? TITLEBAR_H : 0;
    add(win, 0, 0, W, H, 1);
    var kids = win.children || [], sides = kids.filter(function (c) { return c.type === 'sidebar'; }), others = kids.filter(function (c) { return c.type !== 'sidebar'; });
    var mainW = W - SIDEBAR_W * sides.length, ox = 0, contentBottom = top, mainSet = false;
    var each = others.length ? mainW / others.length : 0;
    kids.forEach(function (c) {
      if (c.type === 'sidebar') {
        var i0 = nodes.length, r = add(c, ox, top, SIDEBAR_W, H - top, 2), iy = top + (c.title ? 64 : 16); r.items = [];
        (c.items || []).forEach(function (it, i) { var b = { x: ox + 12, y: iy, w: SIDEBAR_W - 24, h: 44 }; r.items.push({ x: b.x, y: b.y, w: b.w, h: b.h, label: labelOf(it), active: i === c.active }); if (it && it.id) { target(it.id, b, it.label, 'nav'); mark(it.id, i0); } iy += 48; });
        ox += SIDEBAR_W; return;
      }
      if (!mainSet) { main = { x: ox, y: top, w: mainW, h: H - top }; mainSet = true; }
      inMain = true;
      var h = place(c, ox + MAIN_PAD, top + MAIN_PAD, each - 2 * MAIN_PAD, 2);
      inMain = false;
      contentBottom = Math.max(contentBottom, top + MAIN_PAD + h + MAIN_PAD); ox += each;
    });
    Object.keys(targets).forEach(function (k) { delete targets[k]._i; });
    return { w: W, h: H, theme: mock.theme || 'console-dark', nodes: nodes, targets: targets, main: main, contentH: contentBottom, scrollMax: Math.max(0, contentBottom - H) };
  }

  // ---------- dựng DOM (trình duyệt) — chỉ textContent, không innerHTML từ dữ liệu ----------
  function build(rootEl, mock, lay, opts) {
    var doc = rootEl.ownerDocument;
    rootEl.classList.add('mu-theme-' + (THEMES.indexOf(lay.theme) >= 0 ? lay.theme : 'console-dark'));
    var mk = function (parent, cls, b, css) {
      var e = doc.createElement('div'); e.className = 'mu ' + cls;
      e.style.left = b.x + 'px'; e.style.top = b.y + 'px'; e.style.width = b.w + 'px'; e.style.height = b.h + 'px';
      if (css) Object.keys(css).forEach(function (k) { e.style[k] = css[k]; });
      parent.appendChild(e); return e;
    };
    var txt = function (e, s) { e.textContent = s === undefined || s === null ? '' : String(s); return e; };
    rootEl.style.background = T.bg; rootEl.style.color = T.text;
    // vùng chính: khung cắt + lớp trượt (cuộn = translateY của lớp trượt, chỉ transform)
    var clip = mk(rootEl, 'mu-main', lay.main, { overflow: 'hidden' }), scroller = mk(clip, 'mu-scroll', { x: 0, y: 0, w: lay.main.w, h: Math.max(lay.main.h, lay.contentH - lay.main.y) });
    var fields = {}, els = {}, lists = {}, toggles = {};
    var keep = function (id, e) { if (id && e) els[id] = e; return e; };
    lay.nodes.forEach(function (r) {
      var n = r.p, parent = r.scroll ? scroller : rootEl, b = r.scroll ? { x: r.x - lay.main.x, y: r.y - lay.main.y, w: r.w, h: r.h } : r, e;
      switch (r.type) {
        case 'window':
          rootEl.insertBefore(mk(rootEl, 'mu-win', b, { background: T.bg }), rootEl.firstChild);   // nền dưới cùng (vùng chính đã dựng trước)
          if (n.title) txt(mk(rootEl, 'mu-titlebar', { x: 0, y: 0, w: r.w, h: TITLEBAR_H }, { background: T.panel, borderBottom: '1px solid ' + T.border, color: T.muted }), n.title);
          break;
        case 'sidebar':
          e = mk(rootEl, 'mu-side', b, { background: T.panel, borderRight: '1px solid ' + T.border });
          if (n.title) txt(mk(rootEl, 'mu-side-title', { x: r.x + 20, y: r.y + 14, w: r.w - 40, h: 36 }, { color: T.text }), n.title);
          r.items.forEach(function (it, i) { var src = (n.items || [])[i]; keep(src && src.id, txt(mk(rootEl, 'mu-nav' + (it.active ? ' on' : ''), it, { color: it.active ? T.text : T.muted, background: it.active ? T.sideActive : 'transparent' }), it.label)); });
          break;
        case 'topbar':
          e = mk(parent, 'mu-topbar', b, { borderBottom: '1px solid ' + T.border });
          txt(mk(e, 'mu-topbar-t', { x: 0, y: 0, w: Math.max(40, r.w - 360), h: TOPBAR_H }, { color: T.text }), n.title);
          break;
        case 'tabs':
          e = mk(parent, 'mu-tabs', b, { borderBottom: '1px solid ' + T.border });
          r.items.forEach(function (it, i) { var src = (n.items || [])[i]; keep(src && src.id, txt(mk(e, 'mu-tab' + (it.active ? ' on' : ''), { x: it.x - r.x, y: 0, w: it.w, h: it.h }, { color: it.active ? T.text : T.muted, borderBottomColor: it.active ? T.accent : 'transparent' }), it.label)); });
          break;
        case 'card':
          e = keep(n.id, mk(parent, 'mu-card', b, { background: T.panel, border: '1px solid ' + T.border }));
          if (n.title) txt(mk(e, 'mu-card-t', { x: 20, y: 16, w: r.w - 40, h: 26 }, { color: T.text }), n.title);
          break;
        case 'text':
          e = txt(mk(parent, 'mu-text', b, { fontSize: r.fs + 'px', lineHeight: Math.round(r.fs * 1.45) + 'px', fontWeight: n.weight === 'bold' || n.size === 'xl' || n.size === 'lg' ? '700' : '400',
            color: n.tone === 'muted' ? T.muted : n.tone && T[n.tone] ? T[n.tone] : n.tone === 'accent' ? T.accent : T.text }), n.text);
          break;
        case 'button': {
          var v = n.variant || 'secondary';
          keep(n.id, txt(mk(parent, 'mu-btn ' + v, b, { background: v === 'primary' ? T.accent : v === 'danger' ? T.danger : v === 'ghost' ? 'transparent' : T.panel2,
            color: v === 'primary' || v === 'danger' ? T.onAccent : T.text, border: '1px solid ' + (v === 'primary' ? T.accent : v === 'danger' ? T.danger : T.border) }), n.label));
          break;
        }
        case 'badge':
          keep(n.id, txt(mk(parent, 'mu-badge', b, { color: T[n.tone] || T.muted, borderColor: T[n.tone] || T.border }), n.text));
          break;
        case 'toggle': {
          e = keep(n.id, mk(parent, 'mu-toggle', b));
          var sw = mk(e, 'mu-sw' + (n.on ? ' on' : ''), { x: 0, y: 4, w: 52, h: 24 }, { background: n.on ? T.accent : T.panel2, borderColor: T.border });
          var knob = mk(sw, 'mu-knob', { x: n.on ? 30 : 4, y: 3, w: 16, h: 16 }, { background: T.knob });
          if (n.id) toggles[n.id] = { sw: sw, knob: knob, on: !!n.on, onBg: T.accent, offBg: T.panel2 };
          txt(mk(e, 'mu-toggle-l', { x: 64, y: 0, w: r.w - 64, h: TOGGLE_H }, { color: T.text }), n.label);
          break;
        }
        case 'input': case 'textarea': {
          e = mk(parent, 'mu-input', b);
          if (n.label) txt(mk(e, 'mu-label', { x: 0, y: 0, w: r.w, h: LABEL_H }, { color: T.muted }), n.label);
          var fb = { x: 0, y: r.field.y - r.y, w: r.field.w, h: r.field.h };
          var box = mk(e, 'mu-field' + (r.type === 'textarea' ? ' area' : ''), fb, { background: T.field, borderColor: T.border });
          var val = txt(doc.createElement('span'), n.value || ''), ph = txt(doc.createElement('span'), n.value ? '' : (n.placeholder || '')), caret = doc.createElement('i');
          val.className = 'mu-val'; val.style.color = T.text; ph.className = 'mu-ph'; ph.style.color = T.muted; caret.className = 'mu-caret'; caret.style.background = T.accent; caret.style.opacity = '0';
          box.appendChild(val); box.appendChild(caret); box.appendChild(ph);
          if (n.id) fields[n.id] = { text: val, ph: ph, caret: caret, box: box, base: n.value || '', border: T.border, focus: T.accent };
          keep(n.id, box);
          break;
        }
        case 'table': {
          e = mk(parent, 'mu-table', b, { borderColor: T.border, background: T.panel });
          var cols = n.columns || [], cw = r.cells.colW;
          cols.forEach(function (c, j) { txt(mk(e, 'mu-th', { x: Math.round(j * cw), y: 0, w: Math.round(cw), h: ROW_H }, { color: T.muted, background: T.panel2 }), c); });
          (n.rows || []).forEach(function (row, i) { row.forEach(function (c, j) { txt(mk(e, 'mu-td', { x: Math.round(j * cw), y: ROW_H * (i + 1), w: Math.round(cw), h: ROW_H }, { color: T.text, borderTopColor: T.border }), c); }); });
          break;
        }
        case 'list':
          e = mk(parent, 'mu-list', b, { borderColor: T.border, background: T.panel });
          keep(n.id, e);
          r.items.forEach(function (it, i) {
            var li = mk(e, 'mu-li', { x: 0, y: it.y - r.y, w: it.w, h: it.h }, { borderTopColor: T.border, background: T.panel }), src = (n.items || [])[i];
            if (src && src.id) { keep(src.id, li); lists[src.id] = { list: n.id || ('L' + r.x + '_' + r.y), index: i, h: it.h }; }
            txt(mk(li, 'mu-li-l', { x: 16, y: it.sub ? 8 : 0, w: it.w - 32, h: it.sub ? 24 : it.h }, { color: T.text }), it.label);
            if (it.sub) txt(mk(li, 'mu-li-s', { x: 16, y: 32, w: it.w - 32, h: 20 }, { color: T.muted }), it.sub);
          });
          break;
        case 'image': {
          e = mk(parent, 'mu-img', b, { background: T.panel2 });
          var url = n.asset && opts && opts.assetUrl ? opts.assetUrl(n.asset) : '';
          if (url) { var im = doc.createElement('img'); im.alt = ''; im.src = url; e.appendChild(im); }
          break;
        }
        default: break;
      }
    });
    return { fields: fields, scroller: scroller, els: els, lists: lists, toggles: toggles };
  }

  var block = {
    name: 'mock-ui', version: 1, place: 'track', stackOn: [], peak: 0, settle: 0, internal: true,
    schema: { type: 'object', required: [], additionalProperties: true, properties: {} },
    check: function () { return ['mock-ui không dùng làm nhịp: khai màn giả lập trong screens[].source.mock (lesson.screens) rồi dùng khối "screen".']; },
    footprint: function () { return { w: 1920, h: 1080 }; },
    sfx: [],
    mount: function (layer) { var e = U.el('div', 'b-mock-ui'); e.style.display = 'none'; layer.appendChild(e); return e; },
    draw: function () {},
    TYPES: TYPES, THEMES: THEMES, LIMITS: LIMITS, validate: validate, layout: layout, build: build, textW: tw
  };
  if (typeof module === 'object' && module.exports) module.exports = block; else (root.GSBlockDefs = root.GSBlockDefs || {})[block.name] = block;
})(typeof self !== 'undefined' ? self : this);
