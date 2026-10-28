// © 2026 Gen Labs — All rights reserved.
// Khối `keystroke` (F4, SPEC-0.2.0 §6.5): phím tắt hiện giữa dưới, trên dải phụ đề, ≤ 1,6 s. Tham số: { keys: ["Ctrl","S"] (1–4 phím, tên trong danh sách KEYS) }.
// Lớp HUD (máy quay không kéo theo). Mỗi khung chỉ đổi transform/opacity.
(function (root) {
  'use strict';
  var isNode = typeof module === 'object' && module.exports;
  var U = isNode ? require('./util') : root.GSUtil;
  var KEYS = ['Ctrl', 'Cmd', 'Alt', 'Option', 'Shift', 'Enter', 'Esc', 'Tab', 'Space', 'Backspace', 'Delete', 'Up', 'Down', 'Left', 'Right', 'Home', 'End', 'PageUp', 'PageDown',
    'F1', 'F2', 'F3', 'F4', 'F5', 'F6', 'F7', 'F8', 'F9', 'F10', 'F11', 'F12', '/', '.', ',', '+', '-', '=', '[', ']', ';']
    .concat('ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'.split(''));
  var LABEL = { Cmd: '⌘ Cmd', Option: '⌥ Option', Shift: '⇧ Shift', Enter: '↵ Enter', Up: '↑', Down: '↓', Left: '←', Right: '→', Backspace: '⌫ Backspace', Tab: '⇥ Tab' };
  var block = {
    name: 'keystroke', version: 1, place: 'hud', stackOn: [], peak: 0.15, settle: 1.7, KEYS: KEYS,
    schema: { type: 'object', required: ['keys'], additionalProperties: false, properties: {
      keys: { type: 'array', minItems: 1, maxItems: 4, items: { type: 'string', enum: KEYS } } } },
    footprint: function () { return { w: 1920, h: 1080 }; },
    sfx: [],
    mount: function (layer, p, ctx) {
      var e = U.el('div', 'b-keys');
      p.keys.forEach(function (k, i) {
        if (i) { var plus = U.el('span', 'kplus'); plus.textContent = '+'; e.appendChild(plus); }
        var cap = U.el('span', 'kcap'); cap.textContent = LABEL[k] || k; e.appendChild(cap);
      });
      ctx.hud.appendChild(e); return e;
    },
    draw: function (el, tl) {
      var pin = U.eb(U.seg(tl, 0, 0.18)), pout = 1 - U.seg(tl, 1.4, 1.6);
      U.setT(el, 'translate(-50%,0) translateY(' + ((1 - pin) * 24) + 'px) scale(' + U.lerp(0.86, 1, pin) + ')', U.clamp(pin * 1.5) * pout);
    }
  };
  if (isNode) module.exports = block; else (root.GSBlockDefs = root.GSBlockDefs || {})[block.name] = block;
})(typeof self !== 'undefined' ? self : this);
