// © 2026 Gen Labs — All rights reserved.
// Sổ đăng ký khối hình. Node: require() nạp 9 khối MVP. Trình duyệt: nạp util.js + các khối + file này, gắn window.GSBlocks.
// API: list() → [{name, version, schema}] · validate(name, params) → {ok, errors:[chuỗi tiếng Việt]} · get(name) → khối · names()
(function (root) {
  'use strict';
  var NAMES = ['title', 'concept-chip', 'token-row', 'prob-card', 'stamp', 'takeaway', 'lesson-map', 'end-card', 'illustration'];
  var isNode = typeof module === 'object' && module.exports;
  var U = isNode ? require('./util') : root.GSUtil;
  var defs = {};
  NAMES.forEach(function (n) { defs[n] = isNode ? require('./' + n) : (root.GSBlockDefs || {})[n]; });
  var api = {
    names: function () { return NAMES.slice(); },
    get: function (name) { return defs[name] || null; },
    list: function () { return NAMES.filter(function (n) { return defs[n]; }).map(function (n) { return { name: n, version: defs[n].version, schema: defs[n].schema }; }); },
    // danh sách hiệu ứng âm của một beat (khối có thể đổi theo tham số / khi morph)
    sfxOf: function (name, params, morph) {
      var d = defs[name]; if (!d) return [];
      if (morph && d.morphSfx) return d.morphSfx;
      return d.sfxFor ? d.sfxFor(params) : (d.sfx || []);
    },
    validate: function (name, params) {
      var d = defs[name];
      if (!d) return { ok: false, errors: ['khối "' + name + '" không có trong sổ (có: ' + NAMES.join(', ') + ')'] };
      var errors = U.validate(d.schema, params === undefined ? {} : params, 'params');
      if (!errors.length && d.check) errors = d.check(params);
      return { ok: errors.length === 0, errors: errors };
    }
  };
  if (isNode) module.exports = api; else root.GSBlocks = api;
})(typeof self !== 'undefined' ? self : this);
