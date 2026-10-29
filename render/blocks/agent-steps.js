// © 2026 Gen Labs — All rights reserved.
// Khối `agent-steps` (K5): bảng các bước agent đang chạy — chờ ○ → đang chạy (vòng quay) → kết quả: xong ✓ · DỪNG (viền cam) · Cần bạn duyệt (nút Duyệt / Từ chối) · lỗi ✗.
// Trạng thái chung ở đầu bảng (Đang chạy / Cần bạn duyệt / Đã dừng / Xong…) đổi bằng mờ chéo; con trỏ "Bạn" tự lướt tới bấm nút khi có `decision`.
// Tham số: { title?: ≤30 (mặc định "Trợ lý Agent"), task?: ≤60 (lệnh của bạn, bong bóng đầu bảng), steps: [{ text ≤36, tool?: ≤28 (chữ mono), result?: done|stop|await|fail (mặc định done),
//   note?: ≤32 (hiện sau kết quả), at?: cue }] (1–5), step_s?: 1–8 (giãn cách mặc định 3,5 s — kịch bản: mỗi bước 3–5 s), decision?: approve|reject, decide_at?: cue }
// Lịch: bước i bắt đầu ở at (hoặc 0,8 + i·step_s), chạy min(1,4 s, 45 % khoảng tới bước sau) rồi ra kết quả; quyết định mặc định 2 s sau khi hiện nút.
// 9:16: bảng rộng 1000, chữ ≥ 40 px thế giới. Dùng lại trong `split-compare-run` (K19) qua block.panel.
// Ngân sách (L-42): ≤ 8 phần tử động cùng lúc (vòng quay, hàng đang chạy, huy hiệu, nút, con trỏ, pill trạng thái); chỉ transform/opacity (+ dashoffset dấu tick).
(function (root) {
  'use strict';
  var isNode = typeof module === 'object' && module.exports;
  var U = isNode ? require('./util') : root.GSUtil, I = isNode ? require('./icons') : root.GSIcons;
  var RES = ['done', 'stop', 'await', 'fail'];
  var BADGE = { stop: 'DỪNG', await: 'Cần bạn duyệt', fail: 'Lỗi' };
  var STATUS = { run: 'Đang chạy', await: 'Cần bạn duyệt', stop: 'Đã dừng', fail: 'Gặp lỗi', done: 'Xong', approved: 'Đã duyệt', rejected: 'Đã từ chối', idle: 'Sẵn sàng' };
  var STEPS_SCHEMA = { type: 'array', minItems: 1, maxItems: 5, items: { type: 'object', required: ['text'], additionalProperties: false, properties: {
    text: { type: 'string', minLength: 1, maxLength: 36 }, tool: { type: 'string', maxLength: 28 }, result: { type: 'string', enum: RES },
    note: { type: 'string', maxLength: 32 }, at: { type: 'cue' } } } };

  function lay(p, aspect, W0) {
    // 9:16: khung nội dung chỉ cao 460 px khung ⇒ hàng một dòng (ẩn dòng mono/ghi chú và bong bóng lệnh), chữ phụ 38 px ⇒ ≥ 28 px sau zoom
    var v = aspect === '9:16', W = W0 || (v ? 1000 : 1200), n = p.steps.length, tfs = v ? 44 : 42, mfs = v ? 38 : 34;
    var rowH = v ? Math.round(tfs * 1.25 + 34) : Math.round(tfs * 1.25 + mfs * 1.3 + 30), head = v ? 92 : 100, task = p.task && !v ? 92 : 0;
    return { v: v, W: W, H: head + task + n * (rowH + 10) + 24, head: head, task: task, rowH: rowH, tfs: tfs, mfs: mfs, hfs: v ? 42 : 46 };
  }
  // lịch thuần (draw + âm dùng chung). cues = [at_0..at_n-1, decide_at]
  function timing(p, cues) {
    var n = p.steps.length, gap = p.step_s || 3.5, st = [];
    for (var i = 0; i < n; i++) st.push(cues && typeof cues[i] === 'number' ? cues[i] : 0.8 + i * gap);
    for (i = 1; i < n; i++) st[i] = Math.max(st[i], st[i - 1] + 0.6);
    var res = st.map(function (s, j) { return s + (j + 1 < n ? Math.min(1.4, 0.45 * (st[j + 1] - s)) : 1.2); });
    var aw = -1; p.steps.forEach(function (s, j) { if (s.result === 'await' && aw < 0) aw = j; });
    var dec = p.decision && aw >= 0 ? (cues && typeof cues[n] === 'number' ? Math.max(cues[n], res[aw] + 0.6) : res[aw] + 2.0) : -1;
    return { st: st, res: res, aw: aw, dec: dec };
  }
  // trạng thái chung theo thời gian: [{t, k}] (k ∈ STATUS) — pill đổi bằng mờ chéo 0,2 s
  function statusEvents(p, T) {
    var ev = [{ t: 0, k: 'idle' }];
    p.steps.forEach(function (s, i) {
      ev.push({ t: T.st[i], k: 'run' });
      var r = s.result || 'done';
      ev.push({ t: T.res[i], k: r === 'done' ? (i === p.steps.length - 1 ? 'done' : 'run') : r });
    });
    if (T.dec >= 0) ev.push({ t: T.dec + 0.25, k: p.decision === 'approve' ? 'approved' : 'rejected' });
    ev.sort(function (a, b) { return a.t - b.t; });
    var out = []; ev.forEach(function (e) { if (!out.length || out[out.length - 1].k !== e.k) out.push(e); else if (e.t < out[out.length - 1].t) out[out.length - 1].t = e.t; });
    return out;
  }

  // ---- dựng một bảng (dùng chung với split-compare-run): trả {html} + gắn ref sau khi vào DOM ----
  function html(p, L, cls) {
    var h = '<div class="as-w' + (L.v ? ' v' : '') + (cls ? ' ' + cls : '') + '" style="width:' + L.W + 'px;height:' + L.H + 'px">' +
      '<div class="as-hd" style="height:' + L.head + 'px"><span class="as-app">' + I.svg('spark', 44) + '</span><b class="as-ti" style="font-size:' + L.hfs + 'px"></b><span class="as-pills">';
    Object.keys(STATUS).forEach(function (k) { h += '<span class="as-pill k-' + k + '">' + STATUS[k] + '</span>'; });
    h += '</span></div>';
    if (L.task) h += '<div class="as-task" style="height:' + L.task + 'px"><span></span></div>';
    p.steps.forEach(function (s, i) {
      h += '<div class="as-r" style="top:' + (L.head + L.task + 12 + i * (L.rowH + 10)) + 'px;height:' + L.rowH + 'px"><i class="as-bg"></i>' +
        '<span class="as-ic"><i class="ring"></i><svg class="spin" viewBox="0 0 60 60"><circle cx="30" cy="30" r="22"/></svg>' +
        '<i class="ok">' + I.svg('check', 54) + '</i><i class="st">' + I.svg('hand', 46) + '</i><i class="aw">' + I.svg('bell', 46) + '</i><i class="fl">' + I.svg('cross', 54) + '</i></span>' +
        '<span class="as-tx" style="font-size:' + L.tfs + 'px"></span><span class="as-sub" style="font-size:' + L.mfs + 'px"><code class="as-tool"></code><span class="as-note"></span></span>' +
        (BADGE[s.result] ? '<span class="as-bd r-' + s.result + '"></span>' : '') +
        (s.result === 'await' ? '<span class="as-btns"><span class="as-b ok">Duyệt</span><span class="as-b no">Từ chối</span></span><span class="as-dec"></span>' : '') + '</div>';
    });
    return h + '<span class="as-cur">' + '<svg viewBox="0 0 40 48" width="48" height="58"><path d="M4 2 L4 38 L14 29 L21 45 L28 42 L21 26 L35 26 Z" style="fill:var(--v-card);stroke:var(--v-ink)" stroke-width="3.5" stroke-linejoin="round"/></svg><b>Bạn</b></span></div>';
  }
  function refs(w, p) {
    w.querySelector('.as-ti').textContent = p.title === undefined ? 'Trợ lý Agent' : p.title;
    var tk = w.querySelector('.as-task span'); if (tk) { tk.textContent = p.task || ''; if (!p.task) tk.style.visibility = 'hidden'; }   // bảng đôi (K19): giữ chỗ để hai bên thẳng hàng
    var rows = [].slice.call(w.querySelectorAll('.as-r')).map(function (r, i) {
      var s = p.steps[i]; r.querySelector('.as-tx').textContent = s.text;
      var tool = r.querySelector('.as-tool'); if (s.tool) tool.textContent = s.tool; else tool.style.display = 'none';
      r.querySelector('.as-note').textContent = s.note || '';
      var bd = r.querySelector('.as-bd'); if (bd) bd.textContent = BADGE[s.result];
      var dec = r.querySelector('.as-dec'); if (dec) { dec.textContent = p.decision === 'reject' ? 'Đã từ chối' : 'Đã duyệt'; dec.className = 'as-dec ' + (p.decision === 'reject' ? 'no' : 'ok'); }
      r.querySelector('.as-bg').className = 'as-bg' + (s.result === 'stop' ? ' b-stop' : s.result === 'await' ? ' b-await' : s.result === 'fail' ? ' b-fail' : '');
      return { r: r, bg: r.querySelector('.as-bg'), ring: r.querySelector('.ring'), spin: r.querySelector('.spin'), ok: r.querySelector('.ok'), st: r.querySelector('.st'), aw: r.querySelector('.aw'), fl: r.querySelector('.fl'),
        tool: tool, note: r.querySelector('.as-note'), bd: bd, btns: r.querySelector('.as-btns'), bok: r.querySelector('.as-b.ok'), bno: r.querySelector('.as-b.no'), dec: dec };
    });
    var pills = {}; [].forEach.call(w.querySelectorAll('.as-pill'), function (e) { pills[e.className.replace(/^.*k-/, '')] = e; });
    return { w: w, rows: rows, pills: pills, task: w.querySelector('.as-task'), cur: w.querySelector('.as-cur') };
  }
  var op = function (e, v) { e.style.opacity = U.f3(v); };
  // vẽ một bảng ở thời điểm t (giây) — t0: lúc bảng vào (hiệu ứng mở bảng)
  function paint(R, p, T, t, ev) {
    var wq = U.eo(U.seg(t, 0, 0.55));
    U.setT(R.w, 'translateY(' + U.f3((1 - wq) * 40) + 'px) scale(' + U.f3(U.lerp(0.96, 1, wq)) + ')', U.f3(U.clamp(wq * 1.5)));
    if (R.task) { var kq = U.eo(U.seg(t, 0.25, 0.7)); U.setT(R.task, 'translateX(' + U.f3((1 - kq) * 40) + 'px)', U.f3(kq)); }
    ev.forEach(function (e, i) { var nx = ev[i + 1] ? ev[i + 1].t : Infinity; op(R.pills[e.k], i === 0 ? (nx === Infinity ? 1 : 1 - U.seg(t, nx - 0.1, nx + 0.1)) : U.win(t, e.t - 0.1, nx === Infinity ? Infinity : nx + 0.1, 0.2, 0.2)); });
    Object.keys(R.pills).forEach(function (k) { if (!ev.some(function (e) { return e.k === k; })) op(R.pills[k], 0); });
    R.rows.forEach(function (o, i) {
      var s = p.steps[i], r = s.result || 'done', a = T.st[i], b = T.res[i];
      var shown = U.eo(U.seg(t, 0.3 + i * 0.08, 0.7 + i * 0.08));
      var run = U.win(t, a - 0.1, b + 0.1, 0.2, 0.2), done = U.eio(U.seg(t, b - 0.05, b + 0.25));
      var rejected = T.dec >= 0 && i === T.aw && p.decision === 'reject', dq = T.dec >= 0 && i === T.aw ? U.eio(U.seg(t, T.dec + 0.15, T.dec + 0.45)) : 0;
      U.setT(o.r, 'translateY(' + U.f3((1 - shown) * 18) + 'px)', U.f3(shown * (t < a ? 0.55 : 1) * (rejected ? 1 - 0.35 * dq : 1)));
      op(o.ring, 1 - U.seg(t, a - 0.1, a + 0.1)); op(o.spin, run);
      o.spin.style.transform = 'rotate(' + U.f3(((t - a) * 400) % 360) + 'deg)';
      var fin = r === 'await' && dq > 0 ? (p.decision === 'approve' ? 'done' : 'fail') : r;
      op(o.ok, fin === 'done' ? (r === 'done' ? done : dq) : 0); op(o.st, r === 'stop' ? done : 0); op(o.aw, r === 'await' ? done * (1 - dq) : 0); op(o.fl, r === 'fail' ? done : rejected ? dq : 0);
      [o.ok, o.st, o.aw, o.fl].forEach(function (e) { e.style.transform = 'scale(' + U.f3(U.lerp(0.6, 1, U.back(U.seg(t, b - 0.05, b + 0.35), 1.6))) + ')'; });
      // nền hàng: vàng nhạt khi chạy, viền cam (dừng) / vàng (chờ duyệt) sau kết quả
      op(o.bg, Math.max(run, r === 'done' ? 0 : done * (1 - dq)));
      op(o.note, s.note ? done : 0); op(o.tool, s.tool ? (s.note ? 1 - done : 1) : 0);
      if (o.bd) { var bq = U.back(U.seg(t, b, b + 0.4), 1.5); U.setTV(o.bd, 'scale(' + U.f3(U.lerp(0.5, 1, bq)) + ')', U.f3(U.clamp(bq * 2) * (1 - dq))); }
      if (o.btns) {
        var nb = U.eo(U.seg(t, b + 0.2, b + 0.6)); U.setT(o.btns, 'translateY(' + U.f3((1 - nb) * 16) + 'px)', U.f3(nb * (1 - dq)));
        var press = T.dec >= 0 ? Math.sin(Math.PI * U.seg(t, T.dec - 0.08, T.dec + 0.16)) : 0, tgt = p.decision === 'reject' ? o.bno : o.bok;
        if (tgt) tgt.style.transform = 'scale(' + U.f3(1 - 0.1 * press) + ')';
        if (o.dec) U.setTV(o.dec, 'scale(' + U.f3(U.lerp(0.7, 1, U.back(dq, 1.5))) + ')', U.f3(dq));
      }
    });
    // con trỏ "Bạn": lướt từ góc dưới phải tới nút trong 0,8 s trước khi bấm, nhấn, rồi mờ đi
    if (T.dec >= 0 && R.rows[T.aw] && R.rows[T.aw].btns) {
      var row = R.rows[T.aw], btn = p.decision === 'reject' ? row.bno : row.bok;
      var tx = row.r.offsetLeft + row.btns.offsetLeft + btn.offsetLeft + btn.offsetWidth * 0.55, ty = row.r.offsetTop + row.btns.offsetTop + btn.offsetTop + btn.offsetHeight * 0.6;
      var mq = U.eio(U.seg(t, T.dec - 0.9, T.dec - 0.05)), cx = U.lerp(R.w.offsetWidth + 80, tx, mq), cy = U.lerp(R.w.offsetHeight + 60, ty, mq) - Math.sin(Math.PI * mq) * 40;
      var pr = Math.sin(Math.PI * U.seg(t, T.dec - 0.08, T.dec + 0.16));
      U.setTV(R.cur, 'translate(' + U.f3(cx) + 'px,' + U.f3(cy) + 'px) scale(' + U.f3(1 - 0.12 * pr) + ')', U.f3(U.win(t, T.dec - 0.95, T.dec + 1.1, 0.25, 0.4)));
    } else R.cur.style.opacity = 0;
  }

  var block = {
    name: 'agent-steps', version: 1, place: 'new', stackOn: [], peak: 0.8,
    schema: { type: 'object', required: ['steps'], additionalProperties: false, properties: {
      title: { type: 'string', maxLength: 30 }, task: { type: 'string', maxLength: 60 }, steps: STEPS_SCHEMA,
      step_s: { type: 'number', minimum: 1, maximum: 8 }, decision: { type: 'string', enum: ['approve', 'reject'] }, decide_at: { type: 'cue' } } },
    check: function (p) {
      var e = [];
      if (Array.isArray(p.steps)) {
        var aw = p.steps.filter(function (s) { return s && s.result === 'await'; }).length;
        if (p.decision && !aw) e.push('params.decision: cần một bước có result "await" (chờ bạn duyệt) để bấm Duyệt/Từ chối');
        if (aw > 1) e.push('params.steps: chỉ một bước được chờ duyệt (result "await") trong một bảng');
        if (p.decide_at !== undefined && !p.decision) e.push('params.decide_at: cần khai decision (approve | reject)');
      }
      return e;
    },
    cues: function (p) { return p.steps.map(function (s) { return s.at; }).concat([p.decide_at]); },
    settleFor: function (p, ctx) { var T = timing(p, ctx && ctx.cues); return Math.max(T.res[T.res.length - 1], T.dec) + 1.6; },
    footprint: function (aspect, p) { var L = lay(p && p.steps ? p : { steps: [{}, {}, {}] }, aspect); return { w: L.W, h: L.H }; },
    sfx: [{ at: 'in', name: 'slide-up', vol: 0.25 }],
    sfxTimed: function (p, cues) {
      var T = timing(p, cues), out = [{ t: 0, name: 'slide-up', vol: 0.25 }];
      p.steps.forEach(function (s, i) { var r = s.result || 'done'; out.push({ t: T.res[i], name: r === 'done' ? 'tick' : r === 'stop' ? 'bonk' : r === 'await' ? 'ding' : 'sad', vol: r === 'done' ? 0.3 : 0.4 }); });
      if (T.dec >= 0) out.push({ t: T.dec, name: 'tick', vol: 0.35 });
      return out.sort(function (a, b) { return a.t - b.t; });
    },
    mount: function (world, p, ctx) {
      var L = lay(p, ctx.aspect), box = U.box(ctx.slot, 'b-asteps' + (L.v ? ' v' : ''));
      box.innerHTML = html(p, L); world.appendChild(box);
      box._r = refs(box.querySelector('.as-w'), p);
      return box;
    },
    draw: function (el, t, ctx) { var p = ctx.chain[0].params, T = timing(p, ctx.cues); el._ev = el._ev || statusEvents(p, T); paint(el._r, p, T, t, el._ev); }
  };
  block.panel = { lay: lay, timing: timing, statusEvents: statusEvents, html: html, refs: refs, paint: paint, STEPS_SCHEMA: STEPS_SCHEMA };
  if (isNode) module.exports = block; else (root.GSBlockDefs = root.GSBlockDefs || {})[block.name] = block;
})(typeof self !== 'undefined' ? self : this);
