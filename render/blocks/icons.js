// © 2026 Gen Labs — All rights reserved.
// Bộ biểu tượng phẳng dùng chung cho khối hình (0.2.x: compare-split, morph, chat-bubble, agent-steps, checklist-card…). Tự vẽ — không asset bên thứ ba.
// Phong cách: viền mực 6 px bo tròn, ≤ 3 màu + màu nhấn, lấy màu từ biến CSS của sân khấu (nhận diện kênh đổi màu được). viewBox 0 0 120 120.
// API: names() → [tên] · has(name) · svg(name, size?, cls?) → chuỗi <svg> (tên lạ ⇒ chuỗi rỗng). Node + trình duyệt (window.GSIcons). Không đụng DOM.
// Lớp màu (render/stage/style.css .gi): y vàng · b xanh dịu · r san hô · w trắng · g xám · t da/gỗ · l lá · i mực · n không tô.
(function (root) {
  'use strict';
  var P = {
    key: '<circle class="y" cx="38" cy="44" r="24"/><circle class="w" cx="38" cy="44" r="9"/><path class="y" d="M56 58 L98 100 L88 110 L80 102 L74 108 L66 100 L72 94 L48 66 Z"/>',
    keys: '<g transform="rotate(-28 60 60)"><circle class="b" cx="40" cy="34" r="17"/><circle class="w" cx="40" cy="34" r="6"/><path class="b" d="M37 50 h7 v52 h-7 Z M44 82 h10 v7 h-10 Z M44 94 h8 v7 h-8 Z"/></g><g transform="rotate(10 60 60)"><circle class="l" cx="60" cy="30" r="17"/><circle class="w" cx="60" cy="30" r="6"/><path class="l" d="M57 46 h7 v56 h-7 Z M64 84 h11 v7 h-11 Z M64 96 h8 v7 h-8 Z"/></g><circle class="i" cx="52" cy="22" r="7"/>',
    phone: '<rect class="i" x="32" y="10" width="56" height="100" rx="12"/><rect class="b" x="38" y="22" width="44" height="70" rx="4"/><circle class="w" cx="60" cy="101" r="4" stroke="none"/>',
    handset: '<path class="i" d="M30 14 L46 34 L38 46 Q46 66 66 80 L78 72 L100 88 L92 104 Q80 112 62 104 Q26 84 14 46 Q10 26 30 14 Z"/>',
    envelope: '<rect class="w" x="12" y="28" width="96" height="66" rx="8"/><path class="n" d="M14 32 L60 68 L106 32"/><path class="n" d="M14 92 L46 62 M106 92 L74 62"/>',
    paperclip: '<path class="n" stroke-width="9" d="M74 30 L74 84 a18 18 0 0 1 -36 0 L38 26 a12 12 0 0 1 24 0 L62 80 a5 5 0 0 1 -10 0 L52 40"/>',
    tape: '<rect class="y" x="44" y="72" width="66" height="22" rx="3"/><path class="n" stroke-width="4" d="M56 72 v10 M68 72 v6 M80 72 v10 M92 72 v6 M104 72 v10"/><circle class="r" cx="44" cy="62" r="34"/><circle class="w" cx="44" cy="62" r="12"/>',
    pot: '<path class="n" stroke-width="5" d="M44 24 q-8 -9 0 -18 M60 26 q-8 -9 0 -18 M76 24 q-8 -9 0 -18"/><rect class="i" x="20" y="38" width="80" height="10" rx="5"/><path class="b" d="M24 48 h72 v34 a18 18 0 0 1 -18 18 h-36 a18 18 0 0 1 -18 -18 Z"/><path class="n" d="M24 58 h-12 M96 58 h12"/>',
    lock: '<path class="n" stroke-width="9" d="M38 54 V40 a22 22 0 0 1 44 0 V54"/><rect class="y" x="24" y="52" width="72" height="56" rx="10"/><circle class="i" cx="60" cy="76" r="7"/><path class="n" d="M60 80 v12"/>',
    safe: '<rect class="g" x="14" y="16" width="92" height="88" rx="10"/><rect class="w" x="24" y="26" width="72" height="68" rx="6"/><circle class="b" cx="60" cy="60" r="20"/><path class="n" d="M60 44 v8 M60 68 v8 M44 60 h8 M68 60 h8"/><rect class="r" x="92" y="48" width="8" height="24" rx="3"/><path class="n" d="M28 104 v8 M92 104 v8"/>',
    robot: '<path class="n" d="M60 22 V10"/><circle class="r" cx="60" cy="10" r="6"/><rect class="b" x="18" y="24" width="84" height="66" rx="30"/><rect class="w" x="30" y="40" width="60" height="32" rx="16"/><circle class="i" cx="48" cy="56" r="6"/><circle class="i" cx="72" cy="56" r="6"/><path class="n" d="M44 104 q16 10 32 0 M18 60 h-8 M102 60 h8"/>',
    doc: '<path class="w" d="M26 10 h48 l22 22 v78 h-70 Z"/><path class="g" d="M74 10 v22 h22 Z"/><path class="n" d="M38 52 h44 M38 68 h44 M38 84 h28"/>',
    sheet: '<rect class="w" x="12" y="18" width="96" height="84" rx="8"/><path class="l" d="M12 26 a8 8 0 0 1 8 -8 h80 a8 8 0 0 1 8 8 v12 h-96 Z"/><path class="n" d="M12 60 h96 M12 80 h96 M44 38 v64 M76 38 v64"/>',
    calendar: '<rect class="w" x="14" y="22" width="92" height="86" rx="10"/><path class="r" d="M14 32 a10 10 0 0 1 10 -10 h72 a10 10 0 0 1 10 10 v14 h-92 Z"/><path class="n" d="M38 12 v18 M82 12 v18"/><rect class="y" x="64" y="70" width="22" height="20" rx="4"/>',
    headset: '<path class="n" stroke-width="9" d="M22 66 V58 a38 38 0 0 1 76 0 V66"/><rect class="b" x="12" y="60" width="22" height="36" rx="9"/><rect class="b" x="86" y="60" width="22" height="36" rx="9"/><path class="n" d="M97 96 q0 16 -28 16"/><circle class="i" cx="64" cy="112" r="6"/>',
    chat: '<path class="w" d="M16 22 h88 a8 8 0 0 1 8 8 v50 a8 8 0 0 1 -8 8 h-48 l-22 20 v-20 h-18 a8 8 0 0 1 -8 -8 v-50 a8 8 0 0 1 8 -8 Z"/><circle class="i" cx="40" cy="55" r="6"/><circle class="i" cx="60" cy="55" r="6"/><circle class="i" cx="80" cy="55" r="6"/>',
    user: '<circle class="t" cx="60" cy="40" r="22"/><path class="b" d="M18 108 a42 38 0 0 1 84 0 Z"/>',
    boss: '<circle class="t" cx="60" cy="40" r="22"/><path class="i" d="M38 36 a22 22 0 0 1 44 0 q-14 -10 -44 0 Z"/><path class="g" d="M18 108 a42 38 0 0 1 84 0 Z"/><path class="r" d="M55 70 h10 l4 26 l-9 10 l-9 -10 Z"/>',
    shirt: '<path class="r" d="M40 14 L14 30 L24 54 L34 50 V106 H86 V50 L96 54 L106 30 L80 14 q-20 16 -40 0 Z"/><circle class="w" cx="46" cy="68" r="6"/><circle class="w" cx="72" cy="82" r="6"/><circle class="w" cx="60" cy="98" r="5"/>',
    check: '<circle class="l" cx="60" cy="60" r="46"/><path class="n" style="stroke:var(--v-on-ink)" stroke-width="11" d="M38 62 L54 78 L84 44"/>',
    cross: '<circle class="r" cx="60" cy="60" r="46"/><path class="n" style="stroke:var(--v-on-ink)" stroke-width="11" d="M42 42 L78 78 M78 42 L42 78"/>',
    warning: '<path class="y" d="M60 12 L110 100 H10 Z"/><path class="n" stroke-width="9" d="M60 44 V70"/><circle class="i" cx="60" cy="86" r="6"/>',
    hand: '<path class="t" d="M34 64 V34 a7 7 0 0 1 14 0 V56 V22 a7 7 0 0 1 14 0 V56 V26 a7 7 0 0 1 14 0 V58 V40 a7 7 0 0 1 14 0 V78 a32 32 0 0 1 -32 32 h-4 a26 26 0 0 1 -22 -12 L18 74 a7 7 0 0 1 12 -8 Z"/>',
    bell: '<path class="y" d="M30 84 V56 a30 30 0 0 1 60 0 V84 l10 10 H20 Z"/><path class="n" d="M50 102 a10 10 0 0 0 20 0"/><circle class="i" cx="60" cy="18" r="6"/>',
    search: '<circle class="w" cx="50" cy="50" r="32"/><path class="n" stroke-width="12" d="M74 74 L104 104"/>',
    folder: '<path class="y" d="M12 30 a8 8 0 0 1 8 -8 h26 l10 12 h44 a8 8 0 0 1 8 8 v56 a8 8 0 0 1 -8 8 h-80 a8 8 0 0 1 -8 -8 Z"/><path class="n" d="M12 46 h96"/>',
    send: '<path class="b" d="M10 56 L108 14 L80 106 L56 70 Z"/><path class="n" d="M56 70 L108 14"/>',
    gear: '<path class="g" d="M52 10 h16 l3 14 l12 6 l12 -8 l11 11 l-8 12 l6 12 l14 3 v16 l-14 3 l-6 12 l8 12 l-11 11 l-12 -8 l-12 6 l-3 14 h-16 l-3 -14 l-12 -6 l-12 8 l-11 -11 l8 -12 l-6 -12 l-14 -3 v-16 l14 -3 l6 -12 l-8 -12 l11 -11 l12 8 l12 -6 Z"/><circle class="w" cx="60" cy="60" r="16"/>',
    door: '<rect class="t" x="28" y="10" width="64" height="100" rx="4"/><rect class="w" x="38" y="20" width="44" height="34" rx="3"/><circle class="i" cx="80" cy="70" r="5"/><path class="n" d="M14 110 h92"/>',
    cup: '<path class="t" d="M30 34 h60 l-8 70 a6 6 0 0 1 -6 6 h-32 a6 6 0 0 1 -6 -6 Z"/><path class="n" d="M26 34 h68 M66 34 l8 -24 h12"/><circle class="i" cx="50" cy="94" r="4" stroke="none"/><circle class="i" cx="62" cy="88" r="4" stroke="none"/><circle class="i" cx="70" cy="98" r="4" stroke="none"/>',
    spark: '<path class="y" d="M60 8 L72 48 L112 60 L72 72 L60 112 L48 72 L8 60 L48 48 Z"/>',
    loop: '<path class="n" stroke-width="10" d="M88 44 A32 32 0 1 0 92 70"/><path class="i" d="M76 40 L100 30 L98 56 Z"/>',
    money: '<rect class="l" x="8" y="30" width="104" height="60" rx="8"/><circle class="w" cx="60" cy="60" r="16"/><path class="n" d="M22 44 v32 M98 44 v32"/>',
    question: '<circle class="b" cx="60" cy="60" r="48"/><path class="n" style="stroke:var(--v-on-ink)" stroke-width="11" d="M44 46 a16 16 0 1 1 22 15 q-6 3 -6 12"/><circle cx="60" cy="90" r="6" style="fill:var(--v-on-ink)" stroke="none"/>'
  };
  var NAMES = Object.keys(P);
  var I = {
    names: function () { return NAMES.slice(); },
    has: function (n) { return typeof n === 'string' && Object.prototype.hasOwnProperty.call(P, n); },
    svg: function (n, size, cls) {
      if (!I.has(n)) return '';
      var s = size ? ' width="' + size + '" height="' + size + '"' : '';
      return '<svg class="gi' + (cls ? ' ' + cls : '') + '" viewBox="0 0 120 120"' + s + ' aria-hidden="true">' + P[n] + '</svg>';
    }
  };
  if (typeof module === 'object' && module.exports) module.exports = I; else root.GSIcons = I;
})(typeof self !== 'undefined' ? self : this);
