// © 2026 Gen Labs — All rights reserved.
// Khối `callout` (F4 tutorial) — STUB do gói P0a tạo; gói U (video hướng dẫn) thay bằng bản thật. Đang tắt (index.json: enabled=false): nạp vào sân khấu nhưng bài chưa nhận.
(function (root) {
  'use strict';
  var U = (typeof module === 'object' && module.exports) ? require('./util') : root.GSUtil;
  var block = {
    name: 'callout', version: 1, place: 'over', stackOn: [], peak: 0.2, impact: 0.2, settle: 1, stub: true,
    schema: { type: 'object', required: [], additionalProperties: true, properties: {} },
    footprint: function () { return { w: 400, h: 200 }; },
    sfx: [],
    mount: function (world, p, ctx) { var box = U.box(ctx.slot, 'b-callout'); world.appendChild(box); return box; },
    draw: function () {}
  };
  if (typeof module === 'object' && module.exports) module.exports = block; else (root.GSBlockDefs = root.GSBlockDefs || {})[block.name] = block;
})(typeof self !== 'undefined' ? self : this);
