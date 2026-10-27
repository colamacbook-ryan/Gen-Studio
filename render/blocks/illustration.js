// © 2026 Gen Labs — All rights reserved.
// Khối `illustration`: hình riêng của bài (Asset SVG đã lọc allowlist hoặc ảnh) trong khung dán băng keo, kèm chú thích viết tay.
// Hình được nạp bằng thẻ <img> (data URL do render.js đọc từ đường dẫn file) nên SVG không chạy được mã.
// Tham số: { asset: string (≤400, đường dẫn file / data URL của Asset), caption?: string (≤90), fit?: 'contain'|'cover' (mặc định contain) }
(function (root) {
  'use strict';
  var U = (typeof module === 'object' && module.exports) ? require('./util') : root.GSUtil;
  var block = {
    name: 'illustration', version: 1, place: 'new', stackOn: [], peak: 0.6, settle: 3,
    schema: { type: 'object', required: ['asset'], additionalProperties: false, properties: {
      asset: { type: 'string', minLength: 1, maxLength: 400 }, caption: { type: 'string', maxLength: 90 }, fit: { type: 'string', enum: ['contain', 'cover'] } } },
    footprint: function () { return { w: 1100, h: 740 }; },
    sfx: [{ at: 'in', name: 'pop', vol: 0.35 }],
    mount: function (world, p, ctx) {
      var box = U.box(ctx.slot, 'b-illu'), url = ctx.assetUrl(p.asset);
      box.innerHTML = '<div class="fr"><i class="tape"></i><img alt=""><div class="cap hand"></div></div>';
      var img = box.querySelector('img'); img.style.objectFit = p.fit || 'contain'; if (url) img.src = url;
      box.querySelector('.cap').textContent = p.caption || '';
      world.appendChild(box); box._r = { fr: box.querySelector('.fr') };
      return box;
    },
    draw: function (el, t) { var s = U.eb(U.seg(t, 0, 0.6)); U.setT(el._r.fr, 'scale(' + U.lerp(0.7, 1, s) + ') rotate(' + ((1 - s) * -4 + -1) + 'deg)', U.clamp(s * 2)); }
  };
  if (typeof module === 'object' && module.exports) module.exports = block; else (root.GSBlockDefs = root.GSBlockDefs || {})[block.name] = block;
})(typeof self !== 'undefined' ? self : this);
