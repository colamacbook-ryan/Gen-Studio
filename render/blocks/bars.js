// © 2026 Gen Labs — All rights reserved.
// Khối `bars` (K20): 2–3 thanh thời gian nằm ngang để so (vd "Agent tự gửi: 2 giây" vs "Chờ bạn duyệt: 30 giây"), thanh mọc dần lệch nhau 0,3 s,
// số hiện ở đầu thanh khi mọc xong; chân khối luôn có nhãn «thời gian minh hoạ» (kịch bản: số trên màn là đạo cụ).
// Tham số: { bars: [{ label: ≤24, value: số > 0 (cùng đơn vị giữa các thanh), text?: ≤14 (chữ hiện, mặc định = value), tone?: good|bad|neutral }] (2–3),
//   title?: ≤40, note?: ≤40 (mặc định "thời gian minh hoạ"; "" = ẩn — chỉ khi số là thật), at?: cue (lúc bắt đầu mọc; mặc định 0,6 s) }
// Ngân sách (L-42): ≤ 7 phần tử động (≤ 3 thanh + 3 số + tiêu đề); chỉ transform (scaleX) / opacity; lắng sau thanh cuối 1 s.
(function (root) {
  'use strict';
  var U = (typeof module === 'object' && module.exports) ? require('./util') : root.GSUtil;
  var lay = function (p, aspect) { var v = aspect === '9:16', n = p.bars.length; return { v: v, W: v ? 1000 : 1300, lw: v ? 300 : 380, fs: v ? 42 : 50, row: v ? 116 : 128, H: (p.title ? (v ? 90 : 100) : 0) + n * (v ? 116 : 128) + 70 }; };
  var timing = function (p, cues) { var a = cues && typeof cues[0] === 'number' ? cues[0] : 0.6; return { grow: p.bars.map(function (_, i) { return Math.max(0.3, a) + i * 0.3; }), dur: 1.1 }; };
  var block = {
    name: 'bars', version: 1, place: 'new', stackOn: [], peak: 0.6,
    schema: { type: 'object', required: ['bars'], additionalProperties: false, properties: {
      bars: { type: 'array', minItems: 2, maxItems: 3, items: { type: 'object', required: ['label', 'value'], additionalProperties: false, properties: {
        label: { type: 'string', minLength: 1, maxLength: 24 }, value: { type: 'number', minimum: 0.001, maximum: 1e6 }, text: { type: 'string', maxLength: 14 }, tone: { type: 'string', enum: ['good', 'bad', 'neutral'] } } } },
      title: { type: 'string', maxLength: 40 }, note: { type: 'string', maxLength: 40 }, at: { type: 'cue' } } },
    cues: function (p) { return [p.at]; },
    settleFor: function (p, ctx) { var T = timing(p, ctx && ctx.cues); return T.grow[T.grow.length - 1] + T.dur + 1; },
    footprint: function (aspect, p) { var L = lay(p && p.bars ? p : { bars: [{}, {}] }, aspect); return { w: L.W, h: L.H }; },
    sfx: [{ at: 'in', name: 'pop', vol: 0.3 }],
    sfxTimed: function (p, cues) { var T = timing(p, cues); return [{ t: 0, name: 'pop', vol: 0.3 }].concat(T.grow.map(function (g) { return { t: g, name: 'zip', vol: 0.25 }; })); },
    mount: function (world, p, ctx) {
      var L = lay(p, ctx.aspect), box = U.box(ctx.slot, 'b-bars' + (L.v ? ' v' : '')), max = Math.max.apply(null, p.bars.map(function (b) { return b.value; }));
      var h = p.title ? '<div class="br-ti"></div>' : '';
      p.bars.forEach(function (b, i) {
        h += '<div class="br-r t-' + (b.tone || (i ? 'bad' : 'good')) + '" style="height:' + L.row + 'px"><span class="br-l" style="width:' + L.lw + 'px;font-size:' + L.fs + 'px"></span>' +
          '<span class="br-tr"><i class="br-f" style="width:' + U.f3(Math.max(2, 100 * b.value / max)) + '%"></i><b class="br-v" style="left:' + U.f3(Math.max(2, 100 * b.value / max)) + '%;font-size:' + L.fs + 'px"></b></span></div>';
      });
      h += '<div class="br-n hand"></div>';
      box.innerHTML = h;
      if (p.title) box.querySelector('.br-ti').textContent = p.title;
      var rows = [].slice.call(box.querySelectorAll('.br-r')).map(function (r, i) {
        var b = p.bars[i], v = r.querySelector('.br-v'); r.querySelector('.br-l').textContent = b.label; v.textContent = b.text || String(b.value);
        if (b.value / max > 0.72) v.className = 'br-v in';   // thanh dài: số nằm TRONG đầu thanh (không tràn khung)
        return { r: r, f: r.querySelector('.br-f'), v: v };
      });
      var note = box.querySelector('.br-n'); note.textContent = p.note === undefined ? '* thời gian minh hoạ' : p.note; if (!note.textContent) note.style.display = 'none';
      world.appendChild(box);
      box._r = { ti: box.querySelector('.br-ti'), rows: rows, note: note };
      return box;
    },
    draw: function (el, t, ctx) {
      var r = el._r, p = ctx.chain[0].params, T = timing(p, ctx.cues);
      if (r.ti) { var tq = U.eo(U.seg(t, 0, 0.45)); U.setT(r.ti, 'translateY(' + U.f3((1 - tq) * 24) + 'px)', U.f3(tq)); }
      r.rows.forEach(function (R, i) {
        var rq = U.eo(U.seg(t, 0.15 + i * 0.1, 0.55 + i * 0.1)), g = U.eio(U.seg(t, T.grow[i], T.grow[i] + T.dur)), vq = U.back(U.seg(t, T.grow[i] + T.dur - 0.15, T.grow[i] + T.dur + 0.3), 1.6);
        U.setT(R.r, 'translateX(' + U.f3((1 - rq) * -30) + 'px)', U.f3(rq));
        R.f.style.transform = 'scaleX(' + U.f3(g) + ')';
        U.setTV(R.v, 'translateY(-50%) scale(' + U.f3(U.lerp(0.6, 1, vq)) + ')', U.f3(U.clamp(vq * 2)));
      });
      r.note.style.opacity = U.f3(U.eo(U.seg(t, 0.5, 1.0)));
    }
  };
  block.layout = lay; block.timing = timing;
  if (typeof module === 'object' && module.exports) module.exports = block; else (root.GSBlockDefs = root.GSBlockDefs || {})[block.name] = block;
})(typeof self !== 'undefined' ? self : this);
