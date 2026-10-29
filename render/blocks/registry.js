// © 2026 Gen Labs — All rights reserved.
// Sổ đăng ký khối hình — đọc render/blocks/index.json (nguồn duy nhất, SPEC-0.2.0 §2.3). Node: require() index.json + từng khối.
// Trình duyệt: nạp util.js + các khối (thẻ <script> do tools/gen-stage.js sinh) + file này, gắn window.GSBlocks; định nghĩa index lấy từ window.GSBlockIndex.
// Khối `enabled:false` vẫn nạp (get() trả được) nhưng không nhận trong bài: validate() từ chối, names()/list() không liệt kê.
// API: list(kind?) → [{name, version, schema}] · validate(name, params, kind?) → {ok, errors:[chuỗi tiếng Việt]} · get(name) → khối · names(kind?) · all() → mọi mục của index.json · isEnabled(name, kind?)
// list()/names() không có kind = 'lesson' (giữ đúng API 0.1.x); isEnabled/validate không có kind = mọi loại bài.
// F7 (SPEC-0.2.0-F7 §4.5): mỗi mục index.json có `aspects` (tỉ lệ khối dựng được); thiếu ⇒ ["16:9"] (khối mới phải chủ động khai mới dùng ở dọc).
//   names(kind?, aspect?) · list(kind?, aspect?) · validate(name, params, kind?, aspect?) · supports(name, aspect) · aspectsOf(name). Không truyền aspect ⇒ không lọc (API cũ).
(function (root) {
  'use strict';
  var isNode = typeof module === 'object' && module.exports;
  var U = isNode ? require('./util') : root.GSUtil;
  var INDEX = isNode ? require('./index.json') : (root.GSBlockIndex || []);
  var defs = {}, meta = {};
  INDEX.forEach(function (e) { meta[e.name] = e; defs[e.name] = isNode ? require('./' + e.file) : (root.GSBlockDefs || {})[e.name]; });
  // khối nhận được trong bài loại `kind` (bỏ kind = mọi loại): đã bật + có định nghĩa nạp được
  function usable(e, kind, aspect) { return e.enabled !== false && !!defs[e.name] && (!kind || (e.kinds || []).indexOf(kind) >= 0) && (!aspect || aspectsOf(e).indexOf(aspect) >= 0); }
  function aspectsOf(e) { return Array.isArray(e.aspects) && e.aspects.length ? e.aspects : ['16:9']; }
  // không truyền kind ⇒ 'lesson' (ngữ nghĩa 0.1.x: tác giả/agent cũ chỉ biết bài thường; khối tutorial chỉ hiện khi hỏi đúng kind — gói U, 0.2.0)
  var DEFAULT_KIND = 'lesson';
  var NAMES = INDEX.filter(function (e) { return usable(e, DEFAULT_KIND); }).map(function (e) { return e.name; });
  var api = {
    names: function (kind, aspect) { return INDEX.filter(function (e) { return usable(e, kind || DEFAULT_KIND, aspect); }).map(function (e) { return e.name; }); },
    supports: function (name, aspect) { return !!meta[name] && aspectsOf(meta[name]).indexOf(aspect || '16:9') >= 0; },
    aspectsOf: function (name) { return meta[name] ? aspectsOf(meta[name]).slice() : []; },
    all: function () { return INDEX.map(function (e) { return Object.assign({}, e); }); },
    isEnabled: function (name, kind) { return !!meta[name] && usable(meta[name], kind); },
    get: function (name) { return defs[name] || null; },
    list: function (kind, aspect) { return INDEX.filter(function (e) { return usable(e, kind || DEFAULT_KIND, aspect); }).map(function (e) { return { name: e.name, version: defs[e.name].version, schema: defs[e.name].schema }; }); },
    // danh sách hiệu ứng âm của một beat (khối có thể đổi theo tham số / khi morph)
    sfxOf: function (name, params, morph) {
      var d = defs[name]; if (!d) return [];
      if (morph && d.morphSfx) return d.morphSfx;
      return d.sfxFor ? d.sfxFor(params) : (d.sfx || []);
    },
    validate: function (name, params, kind, aspect) {
      var d = defs[name];
      if (!d || !meta[name]) return { ok: false, errors: ['khối "' + name + '" không có trong sổ (có: ' + NAMES.join(', ') + ')'] };
      if (meta[name].enabled === false) return { ok: false, errors: ['khối "' + name + '" chưa được bật (có: ' + NAMES.join(', ') + ')'] };
      if (kind && (meta[name].kinds || []).indexOf(kind) < 0) return { ok: false, errors: ['khối "' + name + '" không dùng được cho bài loại "' + kind + '" (có: ' + api.names(kind).join(', ') + ')'] };
      if (aspect && aspectsOf(meta[name]).indexOf(aspect) < 0) return { ok: false, errors: ['khối "' + name + '" chưa hỗ trợ tỉ lệ ' + aspect + ' (có: ' + api.names(kind, aspect).join(', ') + ')'] };
      var errors = U.validate(d.schema, params === undefined ? {} : params, 'params');
      if (!errors.length && d.check) errors = d.check(params);
      return { ok: errors.length === 0, errors: errors };
    }
  };
  if (isNode) module.exports = api; else root.GSBlocks = api;
})(typeof self !== 'undefined' ? self : this);
