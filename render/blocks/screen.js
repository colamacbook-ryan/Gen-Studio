// © 2026 Gen Labs — All rights reserved.
// Khối `screen` (F4, SPEC-0.2.0 §6.4–6.5): đổi màn hình ứng dụng phủ cả khung (place 'fullbleed' — KHÔNG nằm trong trang vở; tự áp máy quay theo vùng plan.camera).
// Tham số: { screen: "SC-2" (id trong lesson.screens), transition?: "fade" (mặc định, 400 ms) | "slide" | "cut" }.
// Màn giả lập dựng bằng mock-ui (chỉ textContent); ảnh chụp nạp <img> data URL TRỄ (chỉ màn hiện tại + màn sắp tới — CNS-114), che thông tin bằng khối đặc/khảm (không filter).
// Mỗi khung chỉ đổi transform/opacity (máy quay, cuộn, mờ dần) + textContent ô đang gõ (L-42). `cut: true` ⇒ pipeline cho phép cắt cảnh ở mốc beat (G-MOTION).
(function (root) {
  'use strict';
  var isNode = typeof module === 'object' && module.exports;
  var U = isNode ? require('./util') : root.GSUtil;
  var CHROME_H = { browser: 52, desktop: 34, none: 0 };
  var eio = function (x) { return x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2; };
  function camSample(keys, t) {
    if (root.GSCamera) return root.GSCamera.sample(keys, t);
    return { x: 960, y: 540, z: 1 };
  }
  function scrollAt(tut, id, t) {
    var y = 0;
    (tut.scrolls || []).forEach(function (a) { if (a.screen !== id || t < a.t0) return; y = t >= a.t1 ? a.to : a.from + (a.to - a.from) * eio((t - a.t0) / (a.t1 - a.t0)); });
    return y;
  }
  // trạng thái giao diện suy từ bước con trỏ (chỉ transform/opacity/màu — L-42)
  function interactions(r, t) {
    r.clicks.forEach(function (c, i) {
      var e = r.els[c.target]; if (!e || r.toggles[c.target]) return;
      var on = t >= c.t && t < c.t + 160, key = 'c' + i;
      if (r.fx[key] !== on) { r.fx[key] = on; e.style.transform = on ? 'scale(0.96)' : ''; }
    });
    Object.keys(r.toggles).forEach(function (id) {
      var tg = r.toggles[id], st = tg.on, last = -Infinity;
      r.clicks.forEach(function (c) { if (c.target === id && t >= c.t) { st = !st; last = c.t; } });
      var p = U.eo(U.clamp((t - last) / 160)), X = function (on) { return on ? 30 : 4; }, x = U.lerp(X(!st), X(st), p) - X(tg.on);
      var key = 'tg:' + id, v = x.toFixed(1) + (st && p > 0.5);
      if (r.fx[key] !== v) { r.fx[key] = v; tg.knob.style.transform = 'translateX(' + x.toFixed(1) + 'px)'; tg.sw.style.background = (p > 0.5 ? st : !st) ? tg.onBg : tg.offBg; }
    });
    if (!r.drags.length) return;
    var pos = {}, lastDone = null, prev = null;
    Object.keys(r.lists).forEach(function (id) { pos[id] = r.lists[id].index; });
    r.drags.forEach(function (d) {
      var e = r.els[d.target]; if (e) { var lift = t >= d.t0 && t < d.t1; if (r.fx['lift' + d.beat] !== lift) { r.fx['lift' + d.beat] = lift; e.style.opacity = lift ? 0.35 : 1; } }
      if (t < d.t1) return;
      prev = Object.assign({}, pos);
      var L = r.lists[d.target].list, a = pos[d.target], b = pos[d.to];
      Object.keys(pos).forEach(function (id) {
        if (r.lists[id].list !== L) return;
        var i = pos[id];
        if (id === d.target) pos[id] = b; else if (a > b && i >= b && i < a) pos[id] = i + 1; else if (a < b && i > a && i <= b) pos[id] = i - 1;
      });
      lastDone = d;
    });
    var ease = lastDone ? U.eio(U.clamp((t - lastDone.t1) / 260)) : 1;
    Object.keys(pos).forEach(function (id) {
      var el = r.els[id]; if (!el) return;
      var from = prev ? prev[id] : r.lists[id].index, y = (U.lerp(from, pos[id], ease) - r.lists[id].index) * r.lists[id].h, key = 'li:' + id, v = y.toFixed(1);
      if (r.fx[key] !== v) { r.fx[key] = v; el.style.transform = y ? 'translateY(' + v + 'px)' : ''; }
    });
  }
  function px(e, b) { e.style.left = b.x + 'px'; e.style.top = b.y + 'px'; e.style.width = b.w + 'px'; e.style.height = b.h + 'px'; return e; }

  var block = {
    name: 'screen', version: 1, place: 'fullbleed', stackOn: [], peak: 0.2, settle: Infinity, cut: true,
    schema: { type: 'object', required: ['screen'], additionalProperties: false, properties: {
      screen: { type: 'string', minLength: 1, maxLength: 24 }, transition: { type: 'string', enum: ['fade', 'slide', 'cut'] } } },
    footprint: function () { return { w: 1920, h: 1080 }; },
    sfx: [],
    mount: function (layer, p, ctx) {
      var plan = ctx.plan, tut = plan.tutorial || {}, sc = (plan.screens || []).filter(function (s) { return s.id === p.screen; })[0];
      var el = U.el('div', 'b-screen'); el.style.display = 'none'; layer.appendChild(el);
      if (!sc) { console.error('screen: không có màn ' + p.screen); return el; }
      var cam = U.el('div', 'sc-cam'); el.appendChild(cam);
      var dev = px(U.el('div', 'sc-device ch-' + sc.chrome), sc.device); cam.appendChild(dev);
      var chH = CHROME_H[sc.chrome] || 0;
      if (chH) {
        var bar = px(U.el('div', 'sc-chrome'), { x: 0, y: 0, w: sc.device.w, h: chH }); dev.appendChild(bar);
        bar.appendChild(U.el('i', 'dot d1')); bar.appendChild(U.el('i', 'dot d2')); bar.appendChild(U.el('i', 'dot d3'));
        if (sc.chrome === 'browser') { var url = U.el('div', 'sc-url'); url.textContent = sc.url_label || ''; bar.appendChild(url); }
      }
      var view = px(U.el('div', 'sc-view'), { x: 0, y: chH, w: sc.rect.w, h: sc.rect.h }); dev.appendChild(view);
      // nội dung theo px màn, thu về khung bằng scale(s)
      var inner = px(U.el('div', 'sc-inner'), { x: 0, y: 0, w: sc.view[0], h: sc.view[1] }); inner.style.transform = 'scale(' + sc.s + ')'; view.appendChild(inner);
      var r = { sc: sc, cam: cam, inner: inner, fields: {}, scroller: null, img: null, overlays: {}, lastScroll: -1, typed: {}, shown: false, els: {}, lists: {}, toggles: {}, fx: {} };
      if (sc.kind === 'mock') {
        var MU = isNode ? require('./mock-ui') : (root.GSBlockDefs || {})['mock-ui'];
        var lay = MU.layout(sc.mock), built = MU.build(inner, sc.mock, lay, { assetUrl: ctx.assetUrl });
        r.fields = built.fields; r.scroller = built.scroller; r.els = built.els; r.lists = built.lists; r.toggles = built.toggles;
      } else {
        var sw = px(U.el('div', 'sc-scroll'), { x: 0, y: 0, w: sc.size[0], h: sc.size[1] }); inner.appendChild(sw);
        var img = U.el('img', 'sc-img'); img.alt = ''; px(img, { x: 0, y: 0, w: sc.size[0], h: sc.size[1] }); sw.appendChild(img);
        (sc.redact || []).forEach(function (b, i) {
          var rd = px(U.el('div', 'sc-redact ' + b.style), b); sw.appendChild(rd);
          if (b.style === 'mosaic') {   // khảm = lưới khối đặc tạo sẵn (không filter blur — L-42)
            var cell = Math.max(12, Math.round(Math.min(b.w, b.h) / 4)), html = '';
            for (var yy = 0; yy < b.h; yy += cell) for (var xx = 0; xx < b.w; xx += cell) { var g = 120 + ((xx * 7 + yy * 13 + i * 31) % 70); html += '<i style="left:' + xx + 'px;top:' + yy + 'px;width:' + cell + 'px;height:' + cell + 'px;background:rgb(' + g + ',' + g + ',' + (g + 8) + ')"></i>'; }
            rd.innerHTML = html;
          }
        });
        r.scroller = sw; r.img = img; r.assetUrl = ctx.assetUrl;
        // gõ chữ trên ảnh chụp: vẽ đè vào vùng đích, cỡ chữ 0,55 × chiều cao đích
        (plan.cursor && plan.cursor.typing || []).filter(function (x) { return x.screen === sc.id; }).forEach(function (x) {
          var b = sc.targets[x.target]; if (!b || r.overlays[x.target]) return;
          var ov = px(U.el('div', 'sc-type'), { x: b.x + 8, y: b.y, w: b.w - 16, h: b.h }); ov.style.fontSize = Math.round(b.h * 0.55) + 'px'; ov.style.lineHeight = b.h + 'px';
          var tx = U.el('span', 'mu-val'), caret = U.el('i', 'mu-caret'); caret.style.opacity = '0'; ov.appendChild(tx); ov.appendChild(caret); sw.appendChild(ov);
          r.overlays[x.target] = { text: tx, ph: null, caret: caret, base: '' };
        });
        r.fields = r.overlays;
      }
      // mốc ẩn: khi màn kế tiếp đã hiện xong
      var line = tut.screenline || [], me = -1;
      line.forEach(function (s, i) { if (s.beat === ctx.beat.id) me = i; });
      var nx = line[me + 1];
      r.hideAt = nx ? nx.t0 + (nx.fade || 0) + 34 : Infinity; r.fade = me >= 0 ? line[me].fade : 400; r.transition = me >= 0 ? line[me].transition : 'fade';
      r.typing = (plan.cursor && plan.cursor.typing || []).filter(function (x) { return x.screen === sc.id; });
      // phản hồi giao diện của màn giả lập: nút co khi bấm, công tắc lật, mục danh sách đổi chỗ sau khi kéo, ô đang gõ sáng viền
      r.clicks = (tut.steps || []).filter(function (x) { return x.screen === sc.id && /click$/.test(x.action); }).map(function (x) { return { t: x.t, target: x.target, n: x.action === 'double_click' ? 2 : 1 }; });
      r.drags = (tut.drags || []).filter(function (d) { return d.screen === sc.id && r.lists[d.target] && r.lists[d.to] && r.lists[d.target].list === r.lists[d.to].list; });
      el._r = r;
      return el;
    },
    draw: function (el, tl, ctx) {
      var r = el._r; if (!r) return;
      var plan = ctx.plan, t = ctx.beat.t_in + tl * 1000, on = t < r.hideAt;
      if (!on) { if (r.shown) { el.style.display = 'none'; r.shown = false; if (r.img && r.img.getAttribute('src')) r.img.removeAttribute('src'); } return; }
      if (!r.shown) { el.style.display = ''; r.shown = true; }
      // ảnh chụp: chỉ giải mã khi màn sắp/đang hiện
      if (r.img && !r.img.getAttribute('src')) { var u = r.assetUrl(r.sc.asset); if (u) r.img.src = u; }
      var f = r.fade ? U.clamp(tl * 1000 / r.fade) : 1, e = U.eo(f);
      var c = camSample(plan.camera, t);
      el.style.opacity = f;
      r.cam.style.transform = 'translate(' + (960 - c.x * c.z + (r.transition === 'slide' ? (1 - e) * 120 : 0)) + 'px,' + (540 - c.y * c.z) + 'px) scale(' + c.z + ')';
      var y = scrollAt(plan.tutorial || {}, r.sc.id, t);
      if (y !== r.lastScroll) { r.lastScroll = y; if (r.scroller) r.scroller.style.transform = 'translateY(' + (-y) + 'px)'; }
      // gõ chữ: textContent của ô (chỉ đổi khi số ký tự đổi) + con nháy nhấp 530 ms
      interactions(r, t);
      // nhiều lần gõ vào cùng một ô: nối tiếp (lần trước đã xong + phần đang gõ của lần mới nhất)
      var acc = {}, last = {};
      r.typing.forEach(function (x) {
        if (t < x.t0 || !r.fields[x.target]) return;
        var n = 0; for (var i = 0; i < x.at.length; i++) if (x.at[i] <= t) n = i + 1;
        acc[x.target] = (acc[x.target] || '') + x.text.slice(0, n); last[x.target] = x;
      });
      Object.keys(last).forEach(function (k) {
        var fld = r.fields[k], x = last[k], s = (fld.base || '') + acc[k];
        if (r.typed[k] !== s) { r.typed[k] = s; fld.text.textContent = s; if (fld.ph) fld.ph.style.display = s ? 'none' : ''; }
        var live = t <= x.t1 + 1400;
        if (fld.box && fld.focus && r.fx['f:' + k] !== live) { r.fx['f:' + k] = live; fld.box.style.borderColor = live ? fld.focus : fld.border; }
        fld.caret.style.opacity = live && (t <= x.t1 || Math.floor((t - x.t1) / 530) % 2 === 1) ? 1 : 0;
      });
    }
  };
  if (isNode) module.exports = block; else (root.GSBlockDefs = root.GSBlockDefs || {})[block.name] = block;
})(typeof self !== 'undefined' ? self : this);
