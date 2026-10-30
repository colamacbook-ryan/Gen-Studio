// © 2026 Gen Labs — All rights reserved.
// Khối `compare-split` (K3): so sánh đời thường — 1 hoặc 2 khung phẳng (vd tổng đài viên | thư ký cầm chìa), 0–4 nhịp hành động neo theo chữ,
// cuối cùng gắn NHÃN thuật ngữ (CHATBOT / AGENT) lên từng khung — hình trước, chữ sau.
// Tham số: { panels: [{ title?: ≤24, art: tên biểu tượng (render/blocks/icons.js) | đường dẫn/mã asset, props?: ≤2 biểu tượng phụ, label?: ≤16, tone?: cool|warm|mint|rose|plain }] (1–2),
//   steps?: [{ panel: 0|1, text: ≤26, icon?: biểu tượng, at?: cue }] (≤4), label_at?: cue, vs?: ≤6 (mặc định "vs" khi 2 khung, "" = ẩn), source?: ≤90 (dòng nguồn trích dẫn dưới khung) }
// Nhịp mặc định: khung vào 0–0,7 s · nhịp i ở 1,4 + 1,6·i s · nhãn sau nhịp cuối 1,2 s. Mỗi nhịp ≤ 3 khớp động (thẻ nhịp, hình nảy, viền sáng).
// 9:16: cùng bố cục (khung nội dung 9:16 vẫn nằm ngang), chữ ≥ 40 px thế giới.
// Ngân sách (L-42): ≤ 8 phần tử động cùng lúc; chỉ transform/opacity; lắng sau nhãn 1 s.
(function (root) {
  'use strict';
  var isNode = typeof module === 'object' && module.exports;
  var U = isNode ? require('./util') : root.GSUtil, I = isNode ? require('./icons') : root.GSIcons;
  var TONES = ['cool', 'warm', 'mint', 'rose', 'plain'], SRC_H = 58;   // source?: dòng nguồn nhỏ dưới khung (≥ 28 px thế giới ⇒ ≥ 18 px@720)
  function lay(p, aspect) {
    var v = aspect === '9:16', n = p.panels.length, gap = v ? 70 : 90;
    var pw = n === 2 ? (v ? 470 : 610) : (v ? 760 : 900), W = n * pw + (n - 1) * gap;
    var per = [0, 0]; (p.steps || []).forEach(function (s) { if (s.panel < n) per[s.panel]++; });
    var rows = Math.max(per[0], per[1]), sfs = v ? 44 : 46, rowH = Math.round(sfs * 1.5), tfs = v ? 42 : 48;
    var H = v ? 600 : 640, artOf = function (k) { return Math.round(Math.max(v ? 150 : 180, Math.min(v ? 270 : 320, H - 48 - (tfs * 1.3 + 8) - k * (rowH + 28) - 20))); };
    return { v: v, n: n, pw: pw, W: W, H: H, gap: gap, sfs: sfs, tfs: tfs, rowH: rowH, art: artOf(rows), arts: [artOf(per[0]), artOf(per[1])], lfs: v ? 44 : 52 };
  }
  function timing(p, cues) {
    var st = (p.steps || []).map(function (s, i) { return cues && typeof cues[i] === 'number' ? cues[i] : 1.4 + 1.6 * i; });
    for (var i = 1; i < st.length; i++) st[i] = Math.max(st[i], st[i - 1] + 0.3);   // nhịp không chồng lên nhau
    var last = st.length ? st[st.length - 1] : 0.8, li = (p.steps || []).length;
    var lab = cues && typeof cues[li] === 'number' ? cues[li] : last + 1.2;
    return { steps: st, label: lab, hasLabel: p.panels.some(function (x) { return x.label; }) };
  }
  var artIsIcon = function (a) { return I.has(a); };
  var block = {
    name: 'compare-split', version: 1, place: 'new', stackOn: [], peak: 1.4, settle: 4,
    schema: { type: 'object', required: ['panels'], additionalProperties: false, properties: {
      panels: { type: 'array', minItems: 1, maxItems: 2, items: { type: 'object', required: ['art'], additionalProperties: false, properties: {
        title: { type: 'string', maxLength: 24 }, art: { type: 'string', minLength: 1, maxLength: 400 },
        props: { type: 'array', maxItems: 2, items: { type: 'string', enum: I.names() } },
        label: { type: 'string', maxLength: 16 }, tone: { type: 'string', enum: TONES } } } },
      steps: { type: 'array', maxItems: 4, items: { type: 'object', required: ['panel', 'text'], additionalProperties: false, properties: {
        panel: { type: 'integer', minimum: 0, maximum: 1 }, text: { type: 'string', minLength: 1, maxLength: 26 }, icon: { type: 'string', enum: I.names() }, at: { type: 'cue' } } } },
      label_at: { type: 'cue' }, vs: { type: 'string', maxLength: 6 }, source: { type: 'string', maxLength: 90 } } },
    check: function (p) {
      var e = [];
      if (Array.isArray(p.panels) && Array.isArray(p.steps)) p.steps.forEach(function (s, i) { if (s && typeof s.panel === 'number' && s.panel >= p.panels.length) e.push('params.steps[' + i + '].panel: chỉ có ' + p.panels.length + ' khung (đánh số từ 0)'); });
      return e;
    },
    cues: function (p) { return (p.steps || []).map(function (s) { return s.at; }).concat([p.label_at]); },
    // asset ngoài bộ biểu tượng (pipeline đổi mã AS-… → đường dẫn; render.js nạp thành data URL)
    assetsOf: function (p) { return (p.panels || []).map(function (x) { return x.art; }).filter(function (a) { return a && !artIsIcon(a); }); },
    mapAssets: function (p, fn) { return Object.assign({}, p, { panels: p.panels.map(function (x) { return artIsIcon(x.art) ? x : Object.assign({}, x, { art: fn(x.art) }); }) }); },
    settleFor: function (p, ctx) { return timing(p, ctx && ctx.cues).label + 1.0; },
    footprint: function (aspect, p) { var L = lay(p && p.panels ? p : { panels: [{ art: 'key' }, { art: 'key' }] }, aspect); return { w: L.W, h: L.H + (p && p.source ? SRC_H : 0) }; },
    sfx: [{ at: 'in', name: 'swish', vol: 0.3 }],
    sfxTimed: function (p, cues) {
      var T = timing(p, cues), out = [{ t: 0, name: 'swish', vol: 0.3 }];
      T.steps.forEach(function (s) { out.push({ t: s, name: 'pop', vol: 0.32 }); });
      if (T.hasLabel) out.push({ t: T.label, name: 'wham', vol: 0.4 });
      return out;
    },
    mount: function (world, p, ctx) {
      var L = lay(p, ctx.aspect), box = U.box(ctx.slot, 'b-cmp' + (L.v ? ' v' : '')), h = '';
      p.panels.forEach(function (x, i) {
        var A = L.arts[i], art = artIsIcon(x.art) ? I.svg(x.art, A) : '<img alt="" style="width:' + Math.round(Math.min(L.pw - 60, A * 1.5)) + 'px;height:' + A + 'px">';
        var props = (x.props || []).map(function (q) { return '<span class="cp-p">' + I.svg(q, Math.round(A * 0.45)) + '</span>'; }).join('');
        h += '<div class="cp-f t-' + (x.tone || (i ? 'warm' : 'cool')) + '" style="left:' + i * (L.pw + L.gap) + 'px;width:' + L.pw + 'px;height:' + L.H + 'px">' +
          '<div class="cp-t" style="font-size:' + L.tfs + 'px"></div><div class="cp-a" style="min-height:' + A + 'px"><span class="cp-m">' + art + '</span>' + props + '</div>' +
          '<div class="cp-s"></div><div class="cp-lb" style="font-size:' + L.lfs + 'px"></div><i class="cp-hl"></i></div>';
      });
      if (L.n === 2) { var vs = p.vs === undefined ? 'vs' : p.vs; if (vs) h += '<div class="cp-vs" style="left:' + (L.pw + L.gap / 2) + 'px;top:' + L.H / 2 + 'px"></div>'; }
      if (p.source) h += '<div class="cp-src" style="top:' + (L.H + 16) + 'px"></div>';
      box.innerHTML = h;
      if (p.source) box.querySelector('.cp-src').textContent = p.source;
      var fr = [].slice.call(box.querySelectorAll('.cp-f'));
      fr.forEach(function (f, i) {
        var x = p.panels[i]; f.querySelector('.cp-t').textContent = x.title || ''; f.querySelector('.cp-lb').textContent = x.label || '';
        if (!x.title) f.querySelector('.cp-t').style.display = 'none';
        if (!x.label) f.querySelector('.cp-lb').style.display = 'none';
        var img = f.querySelector('img'); if (img) { var u = ctx.assetUrl(x.art); if (u) img.src = u; }
      });
      var vsEl = box.querySelector('.cp-vs'); if (vsEl) vsEl.textContent = p.vs === undefined ? 'vs' : p.vs;
      var steps = (p.steps || []).map(function (s) {
        var e = U.el('div', 'cp-st'); e.style.fontSize = L.sfs + 'px'; e.style.minHeight = L.rowH + 'px';
        e.innerHTML = '<span class="cp-i">' + (s.icon ? I.svg(s.icon, Math.round(L.sfs * 1.05)) : '<b>✓</b>') + '</span><span class="cp-x"></span>';
        e.querySelector('.cp-x').textContent = s.text; fr[s.panel].querySelector('.cp-s').appendChild(e); return { e: e, panel: s.panel };
      });
      world.appendChild(box);
      box._r = { fr: fr.map(function (f) { return { f: f, m: f.querySelector('.cp-m'), lb: f.querySelector('.cp-lb'), hl: f.querySelector('.cp-hl'), t: f.querySelector('.cp-t') }; }), steps: steps, vs: vsEl };
      return box;
    },
    draw: function (el, t, ctx) {
      var r = el._r, p = ctx.chain[0].params, T = timing(p, ctx.cues);
      r.fr.forEach(function (F, i) {
        var a = i * 0.16, q = U.eo(U.seg(t, a, a + 0.65)), dir = r.fr.length === 2 ? (i ? 1 : -1) : 0;
        U.setT(F.f, 'translate(' + U.f3(dir * (1 - q) * 70) + 'px,' + U.f3(dir ? 0 : (1 - q) * 50) + 'px) scale(' + U.f3(U.lerp(0.94, 1, q)) + ')', U.f3(U.clamp(q * 1.6)));
        U.setT(F.t, 'translateY(' + U.f3((1 - U.eo(U.seg(t, a + 0.25, a + 0.7))) * 16) + 'px)', U.f3(U.eo(U.seg(t, a + 0.25, a + 0.7))));
        // hình chính: thở nhẹ (≤ 1,5 %) + nảy squash khi một nhịp của khung này bắt đầu; khung đang có nhịp được viền sáng
        var bump = 0, act = 0;
        T.steps.forEach(function (s, j) { if (r.steps[j].panel !== i) return; var d = t - s; if (d >= 0 && d < 0.5) bump = Math.max(bump, Math.sin(Math.PI * d / 0.5)); act = Math.max(act, U.win(t, s - 0.1, (T.steps[j + 1] !== undefined ? T.steps[j + 1] : T.label) + 0.1, 0.25, 0.25)); });
        var br = 1 + 0.012 * Math.sin((t - a) * 2.4);
        F.m.style.transform = 'translateY(' + U.f3(-bump * 14) + 'px) scale(' + U.f3(br * (1 + 0.07 * bump)) + ',' + U.f3(br * (1 - 0.04 * bump)) + ')';
        F.hl.style.opacity = U.f3(act * (1 - U.seg(t, T.label, T.label + 0.4)));
        if (p.panels[i].label) {
          var lq = U.seg(t, T.label + i * 0.18, T.label + i * 0.18 + 0.32);
          U.setTV(F.lb, 'translateX(-50%) rotate(' + U.f3(-6 + 3 * U.eo(lq)) + 'deg) scale(' + U.f3(U.lerp(1.9, 1, U.eo(lq))) + ')', U.f3(U.clamp(lq * 3)));
        }
      });
      r.steps.forEach(function (s, j) { var q = U.back(U.seg(t, T.steps[j], T.steps[j] + 0.45), 1.3); U.setTV(s.e, 'translateY(' + U.f3((1 - q) * 30) + 'px) scale(' + U.f3(U.lerp(0.85, 1, q)) + ')', U.f3(U.clamp(U.seg(t, T.steps[j], T.steps[j] + 0.25)))); });
      if (r.vs) { var vq = U.back(U.seg(t, 0.35, 0.8), 1.6); U.setT(r.vs, 'translate(-50%,-50%) rotate(' + U.f3((1 - vq) * -20) + 'deg) scale(' + U.f3(vq) + ')', U.f3(U.clamp(vq * 2))); }
    }
  };
  block.layout = lay; block.timing = timing;
  if (isNode) module.exports = block; else (root.GSBlockDefs = root.GSBlockDefs || {})[block.name] = block;
})(typeof self !== 'undefined' ? self : this);
