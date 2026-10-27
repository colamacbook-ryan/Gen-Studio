// © 2026 Gen Labs — All rights reserved.
// Khối `takeaway`: điều cần nhớ. kind 'eq' = phương trình lớn (ký hiệu ≠ = ≈ → nhuộm san hô, vd "Đoán ≠ Biết");
// kind 'habit' = thẻ "thói quen" có ô tick vẽ dần ở mốc peak. Các takeaway liền nhau xếp chồng trong một vùng.
// Tham số: { kind: 'eq'|'habit', text: string (≤70), sub?: string (≤60: chú thích viết tay của eq, hoặc nhãn trên thẻ habit) }
(function (root) {
  'use strict';
  var U = (typeof module === 'object' && module.exports) ? require('./util') : root.GSUtil;
  var OPS = /([≠=≈→+−×÷<>])/;
  function eqFs(text) { return U.clamp(120 * 12 / Math.max(1, text.length), 56, 120); }
  var block = {
    name: 'takeaway', version: 1, place: 'stack', stackOn: ['takeaway'], peak: 0.9, settle: 3,
    schema: { type: 'object', required: ['kind', 'text'], additionalProperties: false, properties: {
      kind: { type: 'string', enum: ['eq', 'habit'] },
      text: { type: 'string', minLength: 1, maxLength: 70 }, sub: { type: 'string', maxLength: 60 } } },
    footprint: function (aspect, p) {
      p = p || { kind: 'eq', text: 'Đoán ≠ Biết' };
      if (p.kind === 'habit') return { w: 760, h: Math.round(150 + 53 * Math.max(1, Math.ceil(p.text.length * 25 / 620))) };
      var fs = eqFs(p.text); return { w: Math.round(U.clamp(U.textW(p.text, fs) + 120, 600, 1500)), h: Math.round(fs * 1.35 + (p.sub ? 70 : 0)) };
    },
    sfx: [{ at: 'in', name: 'ta-da', vol: 0.4 }],
    habitSfx: [{ at: 'in', name: 'pop', vol: 0.35 }, { at: 'peak', name: 'chime', vol: 0.45 }],
    sfxFor: function (p) { return p && p.kind === 'habit' ? this.habitSfx : this.sfx; },
    mount: function (world, p, ctx) {
      var box = U.box(ctx.slot, 'b-take');
      if (p.kind === 'habit') {
        box.innerHTML = '<div class="habit"><div class="k"></div><div class="t"><span class="bx"><svg width="58" height="58" viewBox="0 0 58 58"><path d="M12 30 L25 43 L48 14" fill="none" stroke="#23926A" stroke-width="9" stroke-linecap="round" stroke-linejoin="round" pathLength="1" stroke-dasharray="1" stroke-dashoffset="1"/></svg></span><span class="tx"></span></div></div>';
        box.querySelector('.k').textContent = p.sub || 'Thói quen'; box.querySelector('.tx').textContent = p.text;
        box._r = { kind: 'habit', card: box.querySelector('.habit'), tick: box.querySelector('path') };
      } else {
        var fs = eqFs(p.text), h = p.text.split(OPS).map(function (x) { return OPS.test(x) && x.length === 1 ? '<span class="ne">' + x + '</span>' : U.esc(x); }).join('');
        box.innerHTML = '<div class="eq" style="font-size:' + fs + 'px">' + h + '</div><div class="eqs hand"></div>';
        box.querySelector('.eqs').textContent = p.sub || '';
        box._r = { kind: 'eq', eq: box.querySelector('.eq'), sub: box.querySelector('.eqs') };
      }
      world.appendChild(box); return box;
    },
    draw: function (el, t, ctx) {
      var r = el._r;
      if (r.kind === 'habit') {
        var hb = U.eo(U.seg(t, 0, 0.6)); U.setT(r.card, 'translateY(' + ((1 - hb) * 120) + 'px)', hb); U.dash(r.tick, U.eo(U.seg(t, ctx.peak, ctx.peak + 0.4)));
      } else {
        var qp = U.eb(U.seg(t, 0, 0.5)); U.setT(r.eq, 'scale(' + qp + ') rotate(' + ((1 - qp) * 10) + 'deg)', U.clamp(qp * 2));
        var sp = U.eo(U.seg(t, 0.5, 1.0)); U.setT(r.sub, 'translateY(' + ((1 - sp) * 20) + 'px)', sp);
      }
    }
  };
  if (typeof module === 'object' && module.exports) module.exports = block; else (root.GSBlockDefs = root.GSBlockDefs || {})[block.name] = block;
})(typeof self !== 'undefined' ? self : this);
