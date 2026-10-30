// © 2026 Gen Labs — All rights reserved.
// Khối `app-card` (clip dài 0.2.x): cửa sổ ứng dụng giả lập CHỮ TO đặt trên trang vở (hộp thư, bảng tính, văn bản, cài đặt quyền, ô lệnh cho agent).
// Khác `mock-ui` (màn tutorial phủ khung, chữ 14–30 px): khối này nằm trong vùng của bài thường, chữ 42–46 px thế giới ⇒ ≥ 22 px@720 sau máy quay (z ≥ 0,75).
// Tham số: { app: tên app (≤ 24), icon?: biểu tượng, title?: dòng tiêu đề (≤ 40), columns?: tiêu đề cột (bảng tính, ≤ 6),
//   rows?: [{cells: string[1–6], tone?: normal|bad|good|warn|muted, toggle?: boolean (công tắc cuối dòng), on?: trạng thái đầu của công tắc, mono?: boolean, hidden?: chữ ẩn (trắng trên trắng, lộ khi `reveal`)}] (≤ 6),
//   input?: {text (≤ 120), files?: string[≤3] (thẻ file mono), button?: chữ nút (mặc định "Gửi")},
//   typing_at?: cue (gõ chữ vào ô lệnh, 16 ký tự/giây) · send_at?: cue (bấm nút) · marks?: [{row, cell?, tone: bad|good|hl, label?, at}] (≤ 4: viền + nhãn)
//   toggles?: [{row, on, at}] (≤ 4: gạt công tắc) · reveal?: {row, at} (bôi đen lộ chữ ẩn) · stamp?: {text (≤ 16), tone?: bad|good, at} (con dấu nghiêng) }
// Mốc theo thứ tự cues(): typing_at, send_at, reveal.at, stamp.at, marks[0..3].at, toggles[0..3].at, files_at (thẻ file trượt vào ô lệnh; mặc định 0,9 s trước khi gõ). Thiếu ⇒ nhịp mặc định.
// Ngân sách (L-42): ≤ 8 phần tử động (thẻ, dòng đang vào, viền mark, công tắc, con trỏ gõ, nút, dấu, vùng chọn); chỉ transform/opacity/width + textContent ô gõ; lắng sau mốc cuối 1,2 s.
(function (root) {
  'use strict';
  var isNode = typeof module === 'object' && module.exports;
  var U = isNode ? require('./util') : root.GSUtil, I = isNode ? require('./icons') : root.GSIcons;
  var W = 1220, HEAD = 108, ROW = 92, COLH = 70, FS = 46, CPS = 16, MAXR = 6;
  var TONES = ['normal', 'bad', 'good', 'warn', 'muted'];
  function lay(p) {
    var nr = (p.rows || []).length, inH = p.input ? (p.input.files && p.input.files.length ? 236 : 164) + (String(p.input.text || '').length > 48 ? 60 : 0) + (String(p.input.text || '').length > 96 ? 60 : 0) : 0;
    var titleH = p.title ? 74 : 0, colH = p.columns ? COLH : 0;
    return { W: W, titleH: titleH, colH: colH, inH: inH, H: HEAD + titleH + colH + nr * ROW + (inH ? inH + 18 : 0) + 30 };
  }
  function cueList(p) {
    var c = [p.typing_at, p.send_at, p.reveal && p.reveal.at, p.stamp && p.stamp.at];
    for (var i = 0; i < 4; i++) c.push(p.marks && p.marks[i] ? p.marks[i].at : undefined);
    for (var j = 0; j < 4; j++) c.push(p.toggles && p.toggles[j] ? p.toggles[j].at : undefined);
    c.push(p.files_at);
    return c;
  }
  // nhịp (giây sau lúc khối vào): mặc định gõ ở 1,0 s; gửi sau khi gõ xong + 0,5 s; mark/công tắc lần lượt từ 1,6 s
  function timing(p, cues) {
    var at = function (i, d) { return cues && typeof cues[i] === 'number' ? cues[i] : d; };
    var typeA = at(0, 1.0), typeB = p.input ? typeA + String(p.input.text || '').length / CPS : typeA;
    var marks = (p.marks || []).map(function (m, i) { return at(4 + i, 1.6 + i * 1.2); });
    var toggles = (p.toggles || []).map(function (m, i) { return at(8 + i, 1.6 + i * 1.2); });
    var T = { files: at(12, typeA - 0.9), typeA: typeA, typeB: typeB, send: p.input ? at(1, typeB + 0.5) : null, reveal: p.reveal ? at(2, 1.6) : null, stamp: p.stamp ? at(3, 2.0) : null, marks: marks, toggles: toggles };
    var last = [0.9, p.input && p.input.files ? T.files + 0.5 + 0.3 * p.input.files.length : 0, p.input ? T.typeB : 0, T.send || 0, T.reveal ? T.reveal + 1.4 : 0, T.stamp || 0].concat(marks, toggles);
    T.end = Math.max.apply(null, last) + 1.2;
    return T;
  }
  var cueT = { type: 'cue' };
  var block = {
    name: 'app-card', version: 1, place: 'new', stackOn: [], peak: 0.9,
    schema: { type: 'object', required: ['app'], additionalProperties: false, properties: {
      app: { type: 'string', minLength: 1, maxLength: 24 }, icon: { type: 'string', enum: I.names() }, title: { type: 'string', maxLength: 40 },
      columns: { type: 'array', minItems: 1, maxItems: 6, items: { type: 'string', maxLength: 16 } },
      rows: { type: 'array', maxItems: MAXR, items: { type: 'object', required: ['cells'], additionalProperties: false, properties: {
        cells: { type: 'array', minItems: 1, maxItems: 6, items: { type: 'string', maxLength: 60 } }, tone: { type: 'string', enum: TONES },
        toggle: { type: 'boolean' }, on: { type: 'boolean' }, mono: { type: 'boolean' }, hidden: { type: 'string', maxLength: 70 } } } },
      input: { type: 'object', required: ['text'], additionalProperties: false, properties: {
        text: { type: 'string', maxLength: 120 }, files: { type: 'array', maxItems: 3, items: { type: 'string', minLength: 1, maxLength: 32 } }, button: { type: 'string', maxLength: 12 } } },
      typing_at: cueT, send_at: cueT, files_at: cueT,
      marks: { type: 'array', maxItems: 4, items: { type: 'object', required: ['row'], additionalProperties: false, properties: {
        row: { type: 'integer', minimum: 0, maximum: MAXR - 1 }, cell: { type: 'integer', minimum: 0, maximum: 5 }, tone: { type: 'string', enum: ['bad', 'good', 'hl'] },
        label: { type: 'string', maxLength: 22 }, at: cueT } } },
      toggles: { type: 'array', maxItems: 4, items: { type: 'object', required: ['row', 'on'], additionalProperties: false, properties: {
        row: { type: 'integer', minimum: 0, maximum: MAXR - 1 }, on: { type: 'boolean' }, at: cueT } } },
      reveal: { type: 'object', required: ['row'], additionalProperties: false, properties: { row: { type: 'integer', minimum: 0, maximum: MAXR - 1 }, at: cueT } },
      stamp: { type: 'object', required: ['text'], additionalProperties: false, properties: { text: { type: 'string', minLength: 1, maxLength: 16 }, tone: { type: 'string', enum: ['bad', 'good'] }, at: cueT } } } },
    check: function (p) {
      var e = [], n = (p.rows || []).length;
      (p.marks || []).forEach(function (m, i) { if (m.row >= n) e.push('params.marks[' + i + '].row: chỉ có ' + n + ' dòng'); if (m.cell !== undefined && p.rows[m.row] && m.cell >= p.rows[m.row].cells.length) e.push('params.marks[' + i + '].cell: dòng ' + m.row + ' chỉ có ' + p.rows[m.row].cells.length + ' ô'); });
      (p.toggles || []).forEach(function (m, i) { if (m.row >= n || !p.rows[m.row].toggle) e.push('params.toggles[' + i + '].row: dòng ' + m.row + ' không có công tắc'); });
      if (p.reveal && (p.reveal.row >= n || !p.rows[p.reveal.row].hidden)) e.push('params.reveal.row: dòng ' + p.reveal.row + ' không có chữ ẩn (hidden)');
      if ((p.typing_at !== undefined || p.send_at !== undefined) && !p.input) e.push('params.typing_at/send_at: cần ô lệnh (input)');
      return e;
    },
    cues: cueList,
    settleFor: function (p, ctx) { return timing(p, ctx && ctx.cues).end; },
    footprint: function (aspect, p) { var L = lay(p || {}); return { w: L.W, h: L.H }; },
    sfx: [{ at: 'in', name: 'pop', vol: 0.35 }],
    sfxTimed: function (p, cues) {
      var T = timing(p, cues), s = [{ t: 0, name: 'pop', vol: 0.3 }];
      if (T.send !== null) s.push({ t: T.send, name: 'swish', vol: 0.35 });
      if (T.stamp !== null) s.push({ t: T.stamp, name: 'wham', vol: 0.4 });
      if (T.reveal !== null) s.push({ t: T.reveal, name: 'zip', vol: 0.3 });
      T.marks.forEach(function (t) { s.push({ t: t, name: 'ding', vol: 0.25 }); });
      T.toggles.forEach(function (t) { s.push({ t: t, name: 'tick', vol: 0.4 }); });
      return s.sort(function (a, b) { return a.t - b.t; });
    },
    mount: function (world, p, ctx) {
      var L = lay(p), box = U.box(ctx.slot, 'b-app'), rows = p.rows || [];
      var h = '<div class="ap-c"><div class="ap-hd" style="height:' + HEAD + 'px"><span class="ap-ic">' + I.svg(p.icon || 'envelope', 50) + '</span><b class="ap-name"></b><i class="ap-dots"><i></i><i></i><i></i></i></div>';
      if (p.title) h += '<div class="ap-ti" style="height:' + L.titleH + 'px"></div>';
      if (p.columns) { h += '<div class="ap-row ap-cols grid" style="height:' + COLH + 'px">'; p.columns.forEach(function () { h += '<span class="ap-cell"></span>'; }); h += '</div>'; }
      rows.forEach(function (r, i) {
        h += '<div class="ap-row t-' + (r.tone || 'normal') + (r.mono ? ' mono' : '') + (r.hidden ? ' has-hid' : '') + (p.columns ? ' grid' : '') + '" style="height:' + ROW + 'px">';
        r.cells.forEach(function () { h += '<span class="ap-cell"></span>'; });
        if (r.hidden) h += '<span class="ap-hid"><i class="ap-sel"></i><span></span></span>';
        if (r.toggle) h += '<span class="ap-sw"><i></i></span>';
        h += '<i class="ap-mk"></i><b class="ap-lb"></b></div>';
      });
      if (p.input) {
        h += '<div class="ap-in" style="height:' + L.inH + 'px"><div class="ap-files"></div><div class="ap-tx"><span class="ap-typed"></span><i class="ap-caret"></i></div><b class="ap-btn"></b></div>';
      }
      h += '<div class="ap-stamp"></div></div>';
      box.innerHTML = h;
      box.querySelector('.ap-name').textContent = p.app;
      if (p.title) box.querySelector('.ap-ti').textContent = p.title;
      if (p.columns) [].forEach.call(box.querySelectorAll('.ap-cols .ap-cell'), function (c, i) { c.textContent = p.columns[i]; });
      var R = [].slice.call(box.querySelectorAll('.ap-row:not(.ap-cols)')).map(function (el, i) {
        var r = rows[i];
        [].forEach.call(el.querySelectorAll('.ap-cell'), function (c, j) { c.textContent = r.cells[j]; });
        if (p.columns) el.style.gridTemplateColumns = colTpl(p.columns.length);
        var o = { el: el, mk: el.querySelector('.ap-mk'), lb: el.querySelector('.ap-lb'), cells: [].slice.call(el.querySelectorAll('.ap-cell')) };
        if (r.toggle) { o.sw = el.querySelector('.ap-sw'); o.knob = o.sw.querySelector('i'); o.on = false; }
        if (r.hidden) { o.hid = el.querySelector('.ap-hid'); o.hid.querySelector('span').textContent = r.hidden; o.sel = o.hid.querySelector('.ap-sel'); }
        return o;
      });
      if (p.columns) box.querySelector('.ap-cols').style.gridTemplateColumns = colTpl(p.columns.length);
      var inp = null;
      if (p.input) {
        inp = { typed: box.querySelector('.ap-typed'), caret: box.querySelector('.ap-caret'), btn: box.querySelector('.ap-btn'), files: box.querySelector('.ap-files'), n: -1, chips: [] };
        inp.btn.textContent = p.input.button || 'Gửi';
        (p.input.files || []).forEach(function (f) { var c = U.el('span', 'ap-file'); c.innerHTML = I.svg('paperclip', 34); c.appendChild(document.createTextNode(f)); inp.files.appendChild(c); inp.chips.push(c); });
      }
      if (p.stamp) { var st = box.querySelector('.ap-stamp'); st.textContent = p.stamp.text; st.classList.add(p.stamp.tone === 'good' ? 'good' : 'bad'); }
      world.appendChild(box);
      box._r = { c: box.querySelector('.ap-c'), rows: R, inp: inp, stamp: box.querySelector('.ap-stamp') };
      return box;
    },
    draw: function (el, t, ctx) {
      var r = el._r, p = ctx.chain[0].params, T = timing(p, ctx.cues), rows = p.rows || [];
      var cq = U.spring(U.seg(t, 0, 0.9) * 1.6);
      U.setT(r.c, 'translateY(' + U.f3((1 - cq) * 70) + 'px) scale(' + U.f3(0.94 + 0.06 * cq) + ')', U.f3(U.clamp(U.seg(t, 0, 0.22))));
      r.rows.forEach(function (R, i) {
        var a = 0.25 + i * 0.09, q = U.eo(U.seg(t, a, a + 0.4));
        U.setT(R.el, 'translateX(' + U.f3((1 - q) * -26) + 'px)', U.f3(q));
        R.mk.style.opacity = 0; R.lb.style.opacity = 0;
      });
      (p.marks || []).forEach(function (m, i) {
        var R = r.rows[m.row], k = T.marks[i]; if (!R) return;
        var q = U.eo(U.seg(t, k, k + 0.35)), pulse = t >= k ? 1 + 0.035 * Math.sin(Math.PI * U.seg(t, k, k + 0.5)) : 1;
        var tone = m.tone || 'bad', cell = m.cell !== undefined ? R.cells[m.cell] : null;
        if (R._tone !== tone) { R._tone = tone; R.mk.className = 'ap-mk ' + tone; R.lb.className = 'ap-lb ' + tone; R.lb.textContent = m.label || ''; }
        if (cell && R._cell !== m.cell) { R._cell = m.cell; R.mk.style.left = (cell.offsetLeft - 8) + 'px'; R.mk.style.width = (cell.offsetWidth + 16) + 'px'; R.mk.style.right = 'auto'; }
        R.mk.style.opacity = U.f3(q); R.mk.style.transform = 'scale(' + U.f3(pulse) + ')';
        if (m.label) { R.lb.style.opacity = U.f3(q); R.lb.style.transform = 'translateY(' + U.f3((1 - q) * 14) + 'px)'; }
      });
      (p.toggles || []).forEach(function (g, i) {
        var R = r.rows[g.row]; if (!R || !R.sw) return;
        var k = T.toggles[i], q = U.eio(U.seg(t, k, k + 0.25)), from = !!p.rows[g.row].on, on = q > 0.5 ? g.on : from;
        R.knob.style.transform = 'translateX(' + U.f3(U.lerp(from ? 46 : 0, g.on ? 46 : 0, q)) + 'px)';
        if (R.on !== on) { R.on = on; R.sw.classList.toggle('on', on); }
      });
      // công tắc chưa có mốc gạt: trạng thái đầu = ngược với lần gạt đầu tiên của dòng đó, không có lần gạt ⇒ tắt
      r.rows.forEach(function (R, i) {
        if (!R.sw || (p.toggles || []).some(function (g) { return g.row === i; })) return;
        var on = !!rows[i].on;
        if (R.on !== on) { R.on = on; R.sw.classList.toggle('on', on); R.knob.style.transform = 'translateX(' + (on ? 46 : 0) + 'px)'; }
      });
      if (p.reveal) {
        var RR = r.rows[p.reveal.row];
        if (RR && RR.sel) { var w = U.eio(U.seg(t, T.reveal, T.reveal + 1.2)); RR.sel.style.transform = 'scaleX(' + U.f3(w) + ')'; RR.hid.classList.toggle('lit', w > 0.02); }
      }
      if (r.inp) {
        var n = Math.max(0, Math.min(p.input.text.length, Math.floor((t - T.typeA) * CPS)));
        if (t < T.typeA) n = 0;
        if (n !== r.inp.n) { r.inp.n = n; r.inp.typed.textContent = p.input.text.slice(0, n); }
        var blink = t >= T.typeA && t < T.typeB ? 1 : (Math.floor(t * 2) % 2 ? 0 : 1);
        r.inp.caret.style.opacity = T.send !== null && t > T.send ? 0 : blink;
        r.inp.chips.forEach(function (c, i) { var a = T.files + i * 0.3, q = U.back(U.seg(t, a, a + 0.45), 1.6); U.setT(c, 'translateY(' + U.f3((1 - q) * 40) + 'px) scale(' + U.f3(0.6 + 0.4 * q) + ')', U.f3(U.clamp(U.seg(t, a, a + 0.2)))); });
        if (T.send !== null) { var pr = Math.sin(Math.PI * U.seg(t, T.send, T.send + 0.3)); r.inp.btn.style.transform = 'scale(' + U.f3(1 - 0.12 * pr) + ')'; r.inp.btn.classList.toggle('sent', t >= T.send + 0.15); }
      }
      if (p.stamp) {
        var sq = U.seg(t, T.stamp, T.stamp + 0.32), s = sq <= 0 ? 0 : U.lerp(2.2, 1, U.eo(sq));
        U.setTV(r.stamp, 'translate(-50%,-50%) rotate(-9deg) scale(' + U.f3(s) + ')', U.f3(U.clamp(sq * 2.5)));
      }
    }
  };
  function colTpl(n) { return '1.5fr' + new Array(n).join(' 1fr'); }
  block.layout = lay; block.timing = timing;
  if (isNode) module.exports = block; else (root.GSBlockDefs = root.GSBlockDefs || {})[block.name] = block;
})(typeof self !== 'undefined' ? self : this);
