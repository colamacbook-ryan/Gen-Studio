/* gen-chibi — KHUNG LÕI gen.core (Xưởng · giai đoạn ①)
 * © 2026 Gen Labs — All rights reserved. Mọi hình vẽ bằng code, không asset ngoài.
 * Chỉ chứa phần dùng chung mọi chủ đề: bộ phận, dáng đầu, khuôn mặt (mắt / mày / miệng), 18 biểu cảm, hiệu ứng,
 * tư thế / di chuyển / động tác / 32 hoạt động, đạo cụ dạng khối, thân ma-nơ-canh. Không trang phục chủ đề
 * (bản cũ có tóc, râu, áo bào, giáp… cất ở archive/tamquoc/). Khối vật phẩm / bối cảnh: kinds/khung/gen.khung.js.
 * Quy ước: toạ độ theo tư thế nghỉ của RIG (khung 200 × 240); neo đọc từ C.A.
 * Nét: viền ngoài 2.6–3.2, chi tiết trong 1.4–2. Đổ bóng: đen 8–14 % (hợp mọi màu nền).
 */
(function (GC) {
  'use strict';
  var INK = GC.INK;

  function mir(s) { return '<g transform="translate(200 0) scale(-1 1)">' + s + '</g>'; }
  function both(s) { return s + mir(s); }
  function f(n) { return Math.round(n * 100) / 100; }
  function stroke(w) { return ' stroke="' + INK + '" stroke-width="' + w + '" stroke-linejoin="round" stroke-linecap="round"'; }
  function shadow(d, o) { return '<path d="' + d + '" fill="#000" fill-opacity="' + (o || 0.1) + '"/>'; }
  function line(d, w, col, op) { return '<path d="' + d + '" fill="none" stroke="' + (col || INK) + '" stroke-width="' + (w || 1.6) + '"' + (op ? ' stroke-opacity="' + op + '"' : '') + ' stroke-linecap="round" stroke-linejoin="round"/>'; }
  function k() { var a = []; for (var i = 0; i < arguments.length; i += 2) a.push([arguments[i], arguments[i + 1]]); return a; }

  GC.helpers = { mir: mir, both: both, f: f, stroke: stroke, shadow: shadow, line: line, k: k };

  GC.pack({
    id: 'gen.core', aliases: ['afi.core'], name: 'Khung lõi', owner: 'Gen Labs', group: 'frame', visibility: 'private', version: '0.3.0',
    license: '© 2026 Gen Labs — All rights reserved', description: 'Khung lõi dùng chung mọi chủ đề: bộ phận, dáng đầu, khuôn mặt, 18 biểu cảm, chuyển động, 32 hoạt động, đạo cụ khối, thân ma-nơ-canh.'
  }, function (D) {

    // bảng màu mặc định của khung: xám trung tính (greybox). Asset chủ đề đổi token để "thay áo", không vẽ lại.
    D.defaults({
      skin: '#dcd6cc', skinShade: '#bcb4a7', hair: '#5e5a54', iris: '#3c3c3c', robe: '#b9bec4', inner: '#e4e2dd',
      trim: '#8e949b', accent: '#c9b98f', hat: '#a9aeb4', armor: '#a3a8ae', metal: '#d3d6d9', boots: '#7f8389',
      blush: '#d9c3b8', wood: '#a59d92', tassel: '#b3a59a', cape: '#9aa0a7', pants: '#a9a39a',
      // v0.26 (E7) — token cel shading: màu thật cho mảng bóng / sáng / viền sáng, thay cho "đen trong suốt". Giá trị dưới là mặc định cho khung xám;
      // nhân vật không khai báo thì engine DẪN XUẤT từ token gốc của chính nó (derive bên dưới), nhân vật khai báo thì dùng đúng màu đó
      hairShade: '#44413d', hairLight: '#99948d', rim: '#f1eee9', robeShade: '#8b9095', robeLight: '#d4d8dc', trimShade: '#6a6f75', glow: '#e9dfc7'
    });
    D.derive('hairShade', { from: 'hair', to: '#000000', t: 0.28 });
    D.derive('hairLight', { from: 'hair', to: '#ffffff', t: 0.35 });
    D.derive('rim', { from: 'skin', to: '#ffffff', t: 0.65 });
    D.derive('robeShade', { from: 'robe', to: '#000000', t: 0.25 });
    D.derive('robeLight', { from: 'robe', to: '#ffffff', t: 0.3 });
    D.derive('trimShade', { from: 'trim', to: '#000000', t: 0.25 });
    D.derive('glow', { from: 'accent', to: '#ffffff', t: 0.55 });

    /* ---------------- SLOT ---------------- */
    // mặc định = ma-nơ-canh (đầu trọc, thân trần) — asset chủ đề thay từng bộ phận
    [['head', 'Dáng đầu', 'round'], ['mask', 'Mặt nạ / màu mặt', 'none'], ['hair', 'Tóc', 'troc'],
     ['beard', 'Râu', 'none'], ['hat', 'Mũ / khăn', 'none'], ['outfit', 'Trang phục', 'than-tran'],
     ['back', 'Sau lưng', 'none'], ['legwear', 'Quần', 'chan-tran'], ['shoes', 'Giày', 'ban-chan'], ['heldL', 'Tay trái cầm', 'none'],
     ['heldR', 'Tay phải cầm', 'none']].forEach(function (s) { D.slot(s[0], { label: s[1], fallback: s[2] }); });

    function part(slot, id, label, draw, extra) {
      var p = { slot: slot, id: id, label: label, draw: draw, source: 'gen-chibi/kinds/character/gen.core.js' };
      for (var x in (extra || {})) p[x] = extra[x];
      D.part(p);
    }

    /* ---------------- ĐẦU (có bóng má phải + má hồng nhẹ) ---------------- */
    var HEADS = {
      round: { label: 'Tròn', ex: 50, d: 'M50,100 C50,68 72,54 100,54 C128,54 150,68 150,100 C150,130 128,147 100,147 C72,147 50,130 50,100 Z',
        sh: 'M150,100 C150,130 128,147 100,147 C122,140 141,124 144,100 Z' },
      square: { label: 'Hàm vuông', ex: 50, d: 'M50,96 C50,66 72,54 100,54 C128,54 150,66 150,96 L150,118 C150,138 130,149 100,149 C70,149 50,138 50,118 Z',
        sh: 'M150,100 L150,118 C150,138 130,149 100,149 C124,142 144,130 144,110 Z' },
      oval: { label: 'Trái xoan', ex: 54, d: 'M54,98 C54,68 74,54 100,54 C126,54 146,68 146,98 C146,124 128,145 100,149 C72,145 54,124 54,98 Z',
        sh: 'M146,98 C146,124 128,145 100,149 C120,138 138,122 140,98 Z' }
    };
    // Bản vẽ 45° (quay mặt sang trái màn hình): viền trái = gò má + cằm phía xa, viền phải = gáy; tai phía sau nằm trên mặt đầu.
    var HEADS45 = {
      round: { d: 'M146,100 C146,70 126,54 100,54 C74,54 52,68 52,98 C52,122 64,140 80,146 C86,148 92,148 98,147 C126,144 146,128 146,100 Z',
        sh: 'M146,100 C146,128 126,144 98,147 C120,138 138,124 140,100 Z' },
      square: { d: 'M146,96 C146,66 126,54 100,54 C74,54 52,66 52,94 L52,116 C52,134 64,146 84,149 C92,150 98,150 104,149 C130,146 146,136 146,118 Z',
        sh: 'M146,100 L146,118 C146,136 130,146 104,149 C126,140 140,128 140,110 Z' },
      oval: { d: 'M146,98 C146,68 126,54 100,54 C74,54 54,68 53,96 C52,118 60,136 74,145 C80,149 88,150 94,148 C122,144 146,126 146,98 Z',
        sh: 'M146,98 C146,126 122,144 94,148 C118,140 138,124 140,98 Z' }
    };
    // đầu tròn nhìn ngang: mũi nhỏ nhô ở mép trái (y ≈ 100–110)
    var HEAD90 = 'M146,100 C146,70 126,54 100,54 C76,54 58,66 54,88 C53,94 48,98 49,104 C50,108 54,110 55,114 C58,132 74,146 98,147 C126,146 146,128 146,100 Z';
    Object.keys(HEADS).forEach(function (id) {
      var h = HEADS[id], h45 = HEADS45[id];
      part('head', id, h.label, function (C) {
        var ear = '<ellipse cx="' + h.ex + '" cy="110" rx="8" ry="10" fill="' + C.P.skin + '"' + stroke(3) + '/>' +
          line('M' + (h.ex - 2) + ',105 q-3,5 1,10', 2, C.P.skinShade);
        return {
          ears: both(ear),
          head: '<path d="' + h.d + '" fill="' + C.P.skin + '"' + stroke(3.2) + '/>' +
            both('<ellipse cx="69" cy="126" rx="8" ry="4.5" fill="' + C.P.blush + '" fill-opacity=".28"/>'),
          shade: shadow(h.sh, 0.09) + line('M98,120 q2,2 4,0', 2.2, C.P.skinShade)
        };
      }, { shape: h.d, shape45: h45.d, shape90: id === 'round' ? HEAD90 : h45.d, views: { q90: function (C) {
        // nhìn ngang (quay trái): mũi nhô ở mép trái, tai giữa đầu, gáy bên phải
        var d = id === 'round' ? HEAD90 : h45.d;
        return {
          head: '<path d="' + d + '" fill="' + C.P.skin + '"' + stroke(3.2) + '/>' + '<ellipse cx="72" cy="127" rx="7" ry="4.2" fill="' + C.P.blush + '" fill-opacity=".28"/>',
          shade: shadow('M146,100 C146,128 126,145 98,147 C122,138 140,124 141,100 Z', 0.1) +
            '<ellipse cx="114" cy="112" rx="8" ry="10" fill="' + C.P.skin + '"' + stroke(2.8) + '/>' + line('M116,107 q3,5 -1,10', 2, C.P.skinShade)
        };
      }, q135: function (C) {
        // quay lưng chéo (mặt hướng vào trong, sang trái): thấy gáy, tai trái, mép má
        return {
          head: '<path d="' + h.d + '" fill="' + C.P.skin + '"' + stroke(3.2) + '/>' + shadow('M100,147 C126,146 146,128 148,104 C140,128 124,140 100,147 Z', 0.12),
          shade: '<ellipse cx="60" cy="112" rx="7" ry="9.5" fill="' + C.P.skin + '"' + stroke(2.8) + '/>' + line('M59,107 q-3,5 1,10', 2, C.P.skinShade) +
            line('M92,140 q14,4 26,-4', 1.6, '#000', 0.14)
        };
      }, q180: function (C) {
        // sau lưng: tròn đầu, hai tai nhỏ hai bên, gáy
        var ear = '<ellipse cx="' + (h.ex + 1) + '" cy="112" rx="6.5" ry="9" fill="' + C.P.skin + '"' + stroke(2.8) + '/>';
        return { ears: both(ear), head: '<path d="' + h.d + '" fill="' + C.P.skin + '"' + stroke(3.2) + '/>' + shadow(h.sh, 0.09),
          shade: line('M86,141 q14,5 28,0', 1.6, '#000', 0.14) };
      }, q45: function (C) {
        return {
          head: '<path d="' + h45.d + '" fill="' + C.P.skin + '"' + stroke(3.2) + '/>' +
            '<ellipse cx="106" cy="127" rx="8.5" ry="4.5" fill="' + C.P.blush + '" fill-opacity=".28"/><ellipse cx="62" cy="126" rx="4" ry="4" fill="' + C.P.blush + '" fill-opacity=".22"/>',
          shade: shadow(h45.sh, 0.09) + line('M79,120 q2,2 4,0', 2.2, C.P.skinShade) +
            '<ellipse cx="129" cy="113" rx="7.5" ry="9.5" fill="' + C.P.skin + '"' + stroke(2.8) + '/>' + line('M131,108 q3,5 -1,10', 2, C.P.skinShade)
        };
      } } });
    });

    var NONE_VIEWS = { q45: function () { return null; }, q90: function () { return null; }, q135: function () { return null; }, q180: function () { return null; } };
    part('mask', 'none', 'Không', function () { return null; }, { views: NONE_VIEWS });

    /* ---------------- RÂU ---------------- */
    part('beard', 'none', 'Không', function () { return null; }, { views: NONE_VIEWS });
    /* ---------------- MŨ / KHĂN chung ---------------- */
    part('hat', 'none', 'Không', function () { return null; }, { views: NONE_VIEWS });
    /* ---------------- TRANG PHỤC: thân + tay trên (armL) + tay dưới (foreL) ---------------- */
    var TORSO = 'M76,146 L124,146 L136,212 C120,219 80,219 64,212 Z';
    var TORSO_SH = 'M112,146 L124,146 L136,212 C130,215 124,216 118,217 Z';
    // Engine 0.3: thân trên (tới thắt lưng, y=194) và vạt áo (khớp hem, co giãn khi ngồi/chạy) tách riêng.
    // Mép trên của vạt nằm dưới thắt lưng nên không lộ đường nối.
    var TORSO_UP = 'M76,146 L124,146 L132.7,194 L67.3,194 Z';
    var TORSO_UP_SH = 'M112,146 L124,146 L132.7,194 L117,194 Z';
    var HEM = 'M68.4,188 L131.6,188 L136,212 C120,219 80,219 64,212 Z';
    var HEM_SH = 'M117,188 L131.6,188 L136,212 C130,215 124,216 118,217 Z';
    var UP = 'M69,151 C62,158 61,168 62,181 L86,181 C87,170 87,161 85,153 Z';
    var LOW = 'M62,174 C61,182 60,189 60,196 L86,198 C87,190 87,182 86,174 Z';
    var CUFF = 'M60,191 L86,193 L86,199 L60,197 Z';
    function sleeves(C, fill, cuff, padUp) {
      var up = '<path d="' + UP + '" fill="' + fill + '"' + stroke(2.8) + '/>' + shadow('M62,166 C61,172 62,178 62,181 L70,181 C68,176 67,170 68,164 Z', 0.1) + (padUp || '');
      var low = '<circle cx="74" cy="177" r="11.5" fill="' + fill + '"/>' + '<path d="' + LOW + '" fill="' + fill + '"' + stroke(2.8) + '/>' +
        line('M68,184 q4,3 10,2', 1.4, '#000', 0.22) + '<path d="' + CUFF + '" fill="' + cuff + '"' + stroke(2.2) + '/>';
      return { armL: up, foreL: low, armR: mir(up), foreR: mir(low) };
    }
    function res(a, b) { for (var x in b) a[x] = b[x]; return a; }
    GC.helpers.sleeves = sleeves; GC.helpers.TORSO = TORSO; GC.helpers.TORSO_SH = TORSO_SH; GC.helpers.res = res;
    GC.helpers.TORSO_UP = TORSO_UP; GC.helpers.TORSO_UP_SH = TORSO_UP_SH; GC.helpers.HEM = HEM; GC.helpers.HEM_SH = HEM_SH;

    /* ---- công cụ chiếu 45° (bản chuẩn quay mặt sang trái màn hình) — dùng chung cho mọi thư viện ----
     * face45: chi tiết BÁM MẶT (râu, ria, hoa văn mặt nạ). Nửa trái (phía xa) nén theo mắt xa, nửa phải dịch theo mắt gần;
     *   cùng phép chiếu engine dùng cho mắt/mày/miệng nên mọi thứ khớp nhau. clip = viền đầu 45° (cho mặt nạ).
     * body45: chi tiết TRÊN THÂN (cổ áo, đai, giáp ngực, đường giữa vạt). Dồn về đường giữa áo mới x = 88, phía xa nén,
     *   phía gần giãn, cắt theo dáng thân hoặc vạt. Dáng (silhouette) vẽ riêng, không chiếu. */
    function face45(C, svg, clip) {
      var r = GC.faceRemap(svg);
      if (!clip) return r;
      var id = 'gcH45' + String(C.view || '') + String(C.asset.key || C.asset.id).replace(/[^a-zA-Z0-9]/g, '');   // kèm góc: một SVG có thể chứa nhiều góc (bàn soát)
      return '<defs><clipPath id="' + id + '"><path d="' + C.shape + '"/></clipPath></defs><g clip-path="url(#' + id + ')">' + r + '</g>';
    }
    function body45(svg, shape) {
      var id = shape === HEM ? 'gcHem45' : 'gcTorso45';
      return '<defs><clipPath id="' + id + '"><path d="' + shape + '"/></clipPath>' +
        '<clipPath id="gcB45L"><rect x="-60" y="0" width="160" height="300"/></clipPath><clipPath id="gcB45R"><rect x="100" y="0" width="160" height="300"/></clipPath></defs>' +
        '<g clip-path="url(#' + id + ')"><g clip-path="url(#gcB45L)"><g transform="translate(88 0) scale(0.76 1) translate(-100 0)">' + svg + '</g></g>' +
        '<g clip-path="url(#gcB45R)"><g transform="translate(88 0) scale(1.12 1) translate(-100 0)">' + svg + '</g></g></g>';
    }
    GC.helpers.face45 = face45; GC.helpers.body45 = body45;
    var BODY_P = { width: { label: 'Độ rộng thân', min: 0.88, max: 1.18, step: 0.01, def: 1, type: 'scaleX', pivot: [100, 180] } };

    part('back', 'none', 'Không', function () { return null; }, { views: NONE_VIEWS });
    part('heldL', 'none', 'Không', function () { return null; });
    part('heldR', 'none', 'Không', function () { return null; });

    function q(fn) { return { q45: fn }; }
    /* ---------------- THÂN MA-NƠ-CANH (mặc định của mọi nhân vật) ---------------- */
    // Thân trần: thân trên + khối hông (vạt) + tay trần. Khớp vai / khuỷu lộ ra như ma-nơ-canh gỗ.
    var PELVIS = 'M68.4,188 L131.6,188 L133.5,204 C120,210 80,210 66.5,204 Z';
    function body(C) {
      var sk = C.P.skin, sd = C.P.skinShade;
      return res({
        body: '<path d="' + TORSO_UP + '" fill="' + sk + '"' + stroke(3) + '/>' + shadow(TORSO_UP_SH, 0.1) +
          line('M100,152 L100,186', 1.4, '#000', 0.16) + line('M84,166 q16,6 32,0', 1.4, '#000', 0.12) +
          '<circle cx="78" cy="154" r="5" fill="' + sd + '"' + stroke(1.6) + '/>' + '<circle cx="122" cy="154" r="5" fill="' + sd + '"' + stroke(1.6) + '/>',
        hem: '<path d="' + PELVIS + '" fill="' + sk + '"' + stroke(3) + '/>' + shadow('M117,188 L131.6,188 L133.5,204 C128,206 123,207 118,208 Z', 0.1) +
          line('M100,190 L100,206', 1.4, '#000', 0.14)
      }, sleeves(C, sk, sd));
    }
    function bodyQ90(C) {
      // nhìn ngang: thân hẹp lại quanh trục x 96, ngực nhô nhẹ về trước (trái)
      var o = body(C), w = function (s) { return '<g transform="translate(96 0) scale(0.72 1) translate(-100 0)">' + s + '</g>'; };
      o.body = w('<path d="' + TORSO_UP + '" fill="' + C.P.skin + '"' + stroke(3.4) + '/>' + shadow('M108,146 L124,146 L132.7,194 L112,194 Z', 0.14)) + line('M78,156 q-4,10 0,20', 1.4, '#000', 0.14);
      o.hem = w('<path d="' + PELVIS + '" fill="' + C.P.skin + '"' + stroke(3.4) + '/>');
      return o;
    }
    function bodyBack(C, x) {
      // thấy lưng: đường sống lưng + hai bả vai (x = vị trí sống lưng)
      var o = body(C);
      o.body = '<path d="' + TORSO_UP + '" fill="' + C.P.skin + '"' + stroke(3) + '/>' + shadow(TORSO_UP_SH, 0.1) +
        line('M' + x + ',150 L' + x + ',188', 1.6, '#000', 0.18) + line('M' + (x - 22) + ',158 q8,8 16,2 M' + (x + 6) + ',160 q8,-2 16,-8', 1.4, '#000', 0.14);
      o.hem = '<path d="' + PELVIS + '" fill="' + C.P.skin + '"' + stroke(3) + '/>' + line('M' + x + ',190 L' + x + ',206', 1.4, '#000', 0.16);
      return o;
    }
    part('outfit', 'than-tran', 'Thân trần (ma-nơ-canh)', body, { khung: true, views: { q90: bodyQ90, q135: function (C) { return bodyBack(C, 110); }, q180: function (C) { return bodyBack(C, 100); }, q45: (function (C) {
      var o = body(C);
      o.body = '<path d="' + TORSO_UP + '" fill="' + C.P.skin + '"' + stroke(3) + '/>' + shadow('M108,146 L124,146 L132.7,194 L112,194 Z', 0.12) +
        line('M88,152 L88,186', 1.4, '#000', 0.16) + '<circle cx="74" cy="154" r="4.4" fill="' + C.P.skinShade + '"' + stroke(1.6) + '/>';
      o.hem = '<path d="' + PELVIS + '" fill="' + C.P.skin + '"' + stroke(3) + '/>' + shadow('M112,188 L131.6,188 L133.5,204 C126,207 120,208 114,208 Z', 0.12) +
        line('M88,190 L88,207', 1.4, '#000', 0.14);
      return o;
    }) } });
    function legs(C) {
      var th = '<rect x="83" y="198" width="14" height="17" rx="6" fill="' + C.P.skin + '"' + stroke(2.4) + '/>';
      var sh = '<rect x="84" y="208" width="11" height="14" rx="5" fill="' + C.P.skin + '"' + stroke(2.2) + '/>' +
        '<circle cx="89.5" cy="210" r="3.2" fill="' + C.P.skinShade + '"' + stroke(1.2) + '/>';
      return { thighL: th, shinL: sh, thighR: mir(th), shinR: mir(sh) };
    }
    part('legwear', 'chan-tran', 'Chân trần (ma-nơ-canh)', legs, { khung: true, views: { q45: legs, q90: legs, q135: legs, q180: legs } });
    function feet(C) {
      var b = '<ellipse cx="87" cy="221.5" rx="9.5" ry="5.5" fill="' + C.P.skin + '"' + stroke(2.2) + '/>';
      return { footL: b, footR: mir(b) };
    }
    function feetSide(C) {
      var b = '<path d="M77,222 C77,216 85,216 93,217.5 C98,219 98,226 93,227 L82,227 C79,227 77,225 77,222 Z" fill="' + C.P.skin + '"' + stroke(2.2) + '/>';
      return { footL: b, footR: '<g transform="translate(22 -1)">' + b + '</g>' };
    }
    part('shoes', 'ban-chan', 'Bàn chân trần', feet, { khung: true, views: { q45: feetSide, q90: feetSide, q135: feetSide, q180: feet } });
    part('hair', 'troc', 'Đầu trọc', function () { return null; }, { khung: true, views: NONE_VIEWS });

    /* ---------------- MẮT: KIỂU × DÁNG ---------------- */
    D.eyeStyle('round', { label: 'Tròn to', w: 9, h: 11 });
    D.eyeStyle('calm', { label: 'Hiền, khép hờ', w: 9, h: 9, lid: 0.32 });
    D.eyeStyle('bulge', { label: 'Mắt ốc', w: 11.5, h: 11.5, small: true });
    D.eyeStyle('phoenix', { label: 'Mắt phượng', w: 12, h: 6.5, slant: 14 });
    D.eyeStyle('narrow', { label: 'Mắt nheo xếch', w: 11, h: 5, slant: 16 });

    function rotS(S, side, x, y) { var a = (S.slant || 0) * (side < 0 ? 1 : -1); return a ? ' transform="rotate(' + a + ' ' + x + ' ' + y + ')"' : ''; }
    function lid(x, y, w, h, frac, C) {
      var ly = f(y - h + 2 * h * frac);
      return '<path d="M' + f(x - w - 2) + ',' + f(y - h - 3) + ' L' + f(x + w + 2) + ',' + f(y - h - 3) + ' L' + f(x + w + 2) + ',' + ly +
        ' L' + f(x - w - 2) + ',' + ly + ' Z" fill="' + C.P.eyeArea + '"/>' +
        '<path d="M' + f(x - w - 0.5) + ',' + ly + ' Q' + x + ',' + f(ly - 1.5) + ' ' + f(x + w + 0.5) + ',' + ly + '" fill="none"' + stroke(3.2) + '/>';
    }
    function openEye(S, side, x, y, C, o) {
      o = o || {};
      var w = S.w, h = S.h, rI = Math.min(w, h) * (o.irisK || 0.8);
      var cx = f(x + (o.dx || 0) * w), cy = f(y + h * 0.15 + (o.dy || 0) * h);
      var s = '<g' + rotS(S, side, x, y) + '><ellipse cx="' + x + '" cy="' + y + '" rx="' + w + '" ry="' + h + '" fill="#fff"' + stroke(2.4) + '/>';
      if (S.small || o.dot) {
        s += '<circle cx="' + cx + '" cy="' + f(cy - 1) + '" r="' + (o.dot ? 2 : 3.6) + '" fill="' + INK + '"/>' + (o.dot ? '' : '<circle cx="' + f(cx - 1.4) + '" cy="' + f(cy - 2.2) + '" r="1.2" fill="#fff"/>');
      } else {
        s += '<circle cx="' + cx + '" cy="' + cy + '" r="' + f(rI) + '" fill="' + C.P.iris + '"/>' +
          '<path d="M' + f(cx - rI) + ',' + cy + ' A' + f(rI) + ',' + f(rI) + ' 0 0 1 ' + f(cx + rI) + ',' + cy + ' Z" fill="#000" fill-opacity=".28"/>' +
          '<circle cx="' + cx + '" cy="' + cy + '" r="' + f(rI * 0.5) + '" fill="#120d0b"/>' +
          '<circle cx="' + f(cx - rI * 0.35) + '" cy="' + f(cy - rI * 0.3) + '" r="' + f(rI * 0.34) + '" fill="#fff"/>' +
          '<circle cx="' + f(cx + rI * 0.35) + '" cy="' + f(cy + rI * 0.4) + '" r="' + f(rI * 0.14) + '" fill="#fff" fill-opacity=".85"/>';
      }
      var lf = o.lid !== undefined ? o.lid : S.lid;
      if (lf) s += lid(x, y, w, h, lf, C);
      else s += '<path d="M' + f(x - w - 0.8) + ',' + f(y - h * 0.15) + ' Q' + x + ',' + f(y - h - 2.6) + ' ' + f(x + w + 0.8) + ',' + f(y - h * 0.15) + '" fill="none"' + stroke(3.2) + '/>';
      return s + '</g>';
    }
    function big(S, kk) { return { w: Math.max(S.w, 9) * kk, h: Math.max(S.h, 9) * kk }; }
    GC.helpers.openEye = openEye;

    D.eyePose('normal', function (S, side, x, y, C) { return openEye(S, side, x, y, C); });
    D.eyePose('happy', function (S, side, x, y) {
      var w = Math.max(S.w, 8), h = Math.max(S.h, 7);
      return line('M' + f(x - w) + ',' + f(y + 3) + ' Q' + x + ',' + f(y - h * 1.5) + ' ' + f(x + w) + ',' + f(y + 3), 3.4);
    });
    D.eyePose('closed', function (S, side, x, y) { var w = Math.max(S.w, 8); return line('M' + f(x - w) + ',' + (y - 1) + ' Q' + x + ',' + f(y + 7) + ' ' + f(x + w) + ',' + (y - 1), 3.2); });
    D.eyePose('shut', function (S, side, x, y) {
      var w = Math.max(S.w, 9) * 0.75, h = Math.max(S.h, 9) * 0.65, s = side < 0 ? 1 : -1;
      return line('M' + f(x - s * w) + ',' + f(y - h) + ' L' + f(x + s * w) + ',' + y + ' L' + f(x - s * w) + ',' + f(y + h), 3.8);
    });
    D.eyePose('wide', function (S, side, x, y) {
      var b = big(S, 1.35);
      return '<ellipse cx="' + x + '" cy="' + y + '" rx="' + f(b.w) + '" ry="' + f(b.h * 1.08) + '" fill="#fff"' + stroke(3) + '/><circle cx="' + x + '" cy="' + y + '" r="2.6" fill="' + INK + '"/>';
    });
    D.eyePose('empty', function (S, side, x, y) {
      var b = big(S, 1.1);
      return '<ellipse cx="' + x + '" cy="' + y + '" rx="' + f(b.w) + '" ry="' + f(b.h) + '" fill="#fff"' + stroke(2.6) + '/>' +
        '<circle cx="' + f(x + side * 2) + '" cy="' + f(y + 2) + '" r="1.4" fill="' + INK + '"/>' + line('M' + f(x - b.w) + ',' + f(y - b.h * 0.2) + ' L' + f(x + b.w) + ',' + f(y - b.h * 0.2), 2.4);
    });
    D.eyePose('teary', function (S, side, x, y, C) {
      var b = big(S, 1.18), r = Math.min(b.w, b.h) * 0.86;
      return '<ellipse cx="' + x + '" cy="' + y + '" rx="' + f(b.w) + '" ry="' + f(b.h * 1.1) + '" fill="#fff"' + stroke(2.8) + '/>' +
        '<circle cx="' + x + '" cy="' + f(y + 1.5) + '" r="' + f(r) + '" fill="' + C.P.iris + '"/>' +
        '<circle cx="' + x + '" cy="' + f(y + 1.5) + '" r="' + f(r * 0.45) + '" fill="#120d0b"/>' +
        '<circle cx="' + f(x - r * 0.38) + '" cy="' + f(y - r * 0.35) + '" r="' + f(r * 0.4) + '" fill="#fff"/>' +
        '<circle cx="' + f(x + r * 0.38) + '" cy="' + f(y + r * 0.42) + '" r="' + f(r * 0.18) + '" fill="#fff"/>' +
        '<path class="chb-quiver" d="M' + f(x - b.w * 0.9) + ',' + f(y + b.h * 0.55) + ' q' + f(b.w * 0.45) + ',-3 ' + f(b.w * 0.9) + ',0 q' + f(b.w * 0.45) + ',3 ' + f(b.w * 0.9) + ',0" fill="none" stroke="#7cc4f2" stroke-width="2.4" stroke-linecap="round"/>';
    });
    D.eyePose('money', function (S, side, x, y) {
      var b = big(S, 1.15);
      return '<ellipse cx="' + x + '" cy="' + y + '" rx="' + f(b.w) + '" ry="' + f(b.h * 1.08) + '" fill="#fff"' + stroke(2.8) + '/>' +
        '<text class="chb-pulse" x="' + x + '" y="' + f(y + b.h * 0.62) + '" text-anchor="middle" font-size="' + f(b.h * 1.9) +
        '" font-weight="900" font-family="Arial Black, Arial, Helvetica, sans-serif" fill="#1f9a52" stroke="' + INK + '" stroke-width=".8">$</text>';
    });
    D.eyePose('angry', function (S, side, x, y, C) {
      var w = S.w, h = Math.max(S.h, 6), inner = side < 0;
      var hiIn = f(y - h * 0.05), hiOut = f(y - h * 0.8), top = f(y - h - 4);
      var lp = inner
        ? 'M' + f(x - w - 3) + ',' + top + ' L' + f(x + w + 3) + ',' + top + ' L' + f(x + w + 3) + ',' + hiIn + ' L' + f(x - w - 3) + ',' + hiOut + ' Z'
        : 'M' + f(x - w - 3) + ',' + top + ' L' + f(x + w + 3) + ',' + top + ' L' + f(x + w + 3) + ',' + hiOut + ' L' + f(x - w - 3) + ',' + hiIn + ' Z';
      var ln = inner ? 'M' + f(x - w - 1) + ',' + hiOut + ' L' + f(x + w + 1) + ',' + hiIn : 'M' + f(x - w - 1) + ',' + hiIn + ' L' + f(x + w + 1) + ',' + hiOut;
      return openEye(S, side, x, y, C, { irisK: 0.6, lid: 0 }) + '<path d="' + lp + '" fill="' + C.P.eyeArea + '"/>' + line(ln, 3.6);
    });
    D.eyePose('smug', function (S, side, x, y, C) { return openEye(S, side, x, y, C, { lid: 0.52, dx: 0.35, dy: 0.1 }); });
    D.eyePose('half', function (S, side, x, y, C) { return openEye(S, side, x, y, C, { lid: 0.6, dy: 0.15 }); });
    D.eyePose('focus', function (S, side, x, y, C) { return openEye(S, side, x, y, C, { lid: 0.36, dy: 0.3, irisK: 0.7 }); });
    D.eyePose('lookSide', function (S, side, x, y, C) { return openEye(S, side, x, y, C, { dx: -0.42, lid: 0.18 }); });
    D.eyePose('lookUp', function (S, side, x, y, C) { return openEye(S, side, x, y, C, { dy: -0.5, dx: 0.25, lid: 0 }); });
    D.eyePose('fierce', function (S, side, x, y, C) {
      return GC.LIB.eyePoses.angry(S, side, x, y, C) +
        '<path class="chb-twinkle" d="M' + f(x + 4) + ',' + f(y - 6) + ' l1.6,3 3,1.6 -3,1.6 -1.6,3 -1.6,-3 -3,-1.6 3,-1.6 z" fill="#fff6c9" stroke="#c99a1a" stroke-width=".8"/>';
    });
    D.eyePose('spiral', function (S, side, x, y) {
      var b = big(S, 1);
      return '<ellipse cx="' + x + '" cy="' + y + '" rx="' + f(b.w) + '" ry="' + f(b.h) + '" fill="#fff"' + stroke(2.6) + '/>' +
        '<path d="M' + x + ',' + y + ' m-1,0 a1,1 0 1,1 2,0 a3,3 0 1,1 -6,0 a5,5 0 1,1 10,0 a7,7 0 1,1 -14,0" fill="none" stroke="' + INK + '" stroke-width="1.8"/>';
    });
    D.eyePose('star', function (S, side, x, y) {
      var R = Math.max(S.w, 9) * 1.2, r = R * 0.45, pts = [];
      for (var i = 0; i < 10; i++) { var a = -Math.PI / 2 + i * Math.PI / 5, rr = i % 2 ? r : R; pts.push(f(x + Math.cos(a) * rr) + ',' + f(y + Math.sin(a) * rr)); }
      return '<polygon class="chb-pulse" points="' + pts.join(' ') + '" fill="#ffd23a"' + stroke(2.2) + '/>';
    });

    /* ---------------- LÔNG MÀY ---------------- */
    D.browStyle('thin', { label: 'Mảnh', w: 2.6, len: 13 });
    D.browStyle('normal', { label: 'Vừa', w: 3.8, len: 14 });
    D.browStyle('bushy', { label: 'Rậm', w: 6.5, len: 17 });
    D.browStyle('silkworm', { label: 'Mày tằm', w: 7.5, len: 18 });
    D.browPose('neutral', { label: 'Bình thường', rot: 0, dy: 0, arc: 2 });
    D.browPose('angry', { label: 'Giận', rot: 24, dy: 4, arc: -1 });
    D.browPose('sad', { label: 'Buồn', rot: -20, dy: -3, arc: 2 });
    D.browPose('raised', { label: 'Nhướng cao', rot: -4, dy: -11, arc: 4 });
    D.browPose('smug', { label: 'Đắc ý (lệch)', rot: -10, dy: -7, rotR: 10, dyR: 2 });
    D.browPose('determined', { label: 'Quyết tâm', rot: 15, dy: 2, arc: 0 });
    D.browPose('think', { label: 'Nhíu một bên', rot: -12, dy: -8, rotR: 8, dyR: 1 });
    D.browPose('worried', { label: 'Lo lắng', rot: -14, dy: -5, rotR: -4, dyR: -1 });

    /* ---------------- MIỆNG ---------------- */
    var DARK = '#6b1f2a', TONGUE = '#e8707a';
    function mp(d, fill, w) { return '<path d="' + d + '" fill="' + (fill || 'none') + '"' + stroke(w || 2.8) + '/>'; }
    D.mouth('smile', function () { return mp('M90,128 Q100,138 110,128'); });
    D.mouth('flat', function () { return mp('M92,132 L108,131'); });
    D.mouth('cat', function () { return mp('M89,128 q5.5,6 11,0 q5.5,6 11,0'); });
    D.mouth('oSmall', function () { return '<ellipse cx="101" cy="133" rx="4" ry="5" fill="' + DARK + '"' + stroke(2.4) + '/>'; });
    D.mouth('oBig', function () { return '<ellipse cx="100" cy="135" rx="9.5" ry="13" fill="' + DARK + '"' + stroke(2.8) + '/><path d="M93,143 Q100,137 107,143 Q104,148 100,148 Q96,148 93,143 Z" fill="' + TONGUE + '"/>'; });
    D.mouth('grin', function () {
      return mp('M83,125 Q100,128 117,121 Q113,141 98,141 Q85,139 83,125 Z', DARK) + '<path d="M85,126 Q100,129 116,122 L115,129 Q100,133 86,131 Z" fill="#fff"/>' +
        '<path d="M86,126 L87,131 M93,127 L93,132 M100,127 L100,132 M107,126 L107,131 M113,124 L113,129" stroke="' + INK + '" stroke-width="1"/>';
    });
    D.mouth('laugh', function () {
      return mp('M83,124 L117,124 Q117,147 100,147 Q83,147 83,124 Z', DARK) + '<path d="M89,140 Q100,131 111,140 Q105,147 100,147 Q95,147 89,140 Z" fill="' + TONGUE + '"/>' +
        '<path d="M85,125 L115,125 L114,130 L86,130 Z" fill="#fff"/>';
    });
    D.mouth('shout', function () {
      return mp('M81,121 L119,121 L113,151 Q100,158 87,151 Z', DARK) + '<path d="M89,146 Q100,138 111,146 Q106,154 100,154 Q94,154 89,146 Z" fill="' + TONGUE + '"/>' +
        '<path d="M83,122 L117,122 L116,127 L112,124 L108,128 L104,124 L100,128 L96,124 L92,128 L88,124 L84,127 Z" fill="#fff"/>';
    });
    D.mouth('wail', function () {
      return '<g class="chb-quiver">' + mp('M79,124 Q90,117 100,123 Q110,117 121,124 L114,152 Q100,160 86,152 Z', DARK) +
        '<path d="M90,148 Q100,140 110,148 Q105,156 100,156 Q95,156 90,148 Z" fill="' + TONGUE + '"/>' +
        '<path d="M82,124 Q90,119 100,124.5 Q110,119 118,124 L117,129 Q100,127 83,129 Z" fill="#fff"/><path d="M100,129 q-2,6 0,8 q2,-2 0,-8" fill="' + TONGUE + '"/></g>';
    });
    D.mouth('wavy', function () { return mp('M85,132 q3.75,-4.5 7.5,0 q3.75,4.5 7.5,0 q3.75,-4.5 7.5,0 q3.75,4.5 7.5,0'); });
    D.mouth('drool', function () {
      return mp('M85,125 Q100,127 115,125 Q113,143 100,143 Q87,143 85,125 Z', DARK) + '<path d="M90,137 Q100,131 110,137 Q105,143 100,143 Q95,143 90,137 Z" fill="' + TONGUE + '"/>' +
        '<path class="chb-drip" d="M112,135 C110,142 110,150 114,153 C118,150 117,142 114,135 Z" fill="#c4e8ff" stroke="#5aa9d6" stroke-width="1.6"/>';
    });
    D.mouth('bite', function () {
      return '<rect x="84" y="122" width="32" height="17" rx="6" fill="#fff"' + stroke(2.8) + '/><path d="M84,130.5 L116,130.5 M92,122 L92,139 M100,122 L100,139 M108,122 L108,139" stroke="' + INK + '" stroke-width="1.4"/>';
    });
    D.mouth('tongueOut', function () {
      return mp('M90,130 Q99,135 109,129') + '<path d="M104,132 C104,139 110,141 112,136 C113,133 110,131 108,131 Z" fill="' + TONGUE + '"' + stroke(2) + '/>';
    });

    /* ---------------- HIỆU ỨNG ---------------- */
    function fx(id, label, layer, draw) { D.fx(id, { label: label, layer: layer, draw: draw }); }
    fx('tears', 'Thác nước mắt', 'fxHead', function () {
      var s = '<path d="M71,118 C67,141 61,167 56,194 L71,194 C74,167 80,141 86,118 Z" fill="#8fd2ff" fill-opacity=".92" stroke="#3a8fc8" stroke-width="2"/>' +
        '<path class="chb-flow" d="M78,124 C75,146 70,168 64,190" fill="none" stroke="#fff" stroke-width="2.4" stroke-dasharray="6 6" stroke-linecap="round"/>' +
        '<g class="chb-bob"><circle cx="54" cy="200" r="3.4" fill="#8fd2ff" stroke="#3a8fc8" stroke-width="1.4"/><circle cx="72" cy="203" r="2.6" fill="#8fd2ff" stroke="#3a8fc8" stroke-width="1.4"/></g>';
      return { fxHead: both(s) };
    });
    function drop(x, y, s, cls, dl) {
      return '<g class="' + cls + '" style="animation-delay:' + (dl || 0) + 's"><path d="M' + x + ',' + y + ' C' + (x - 7 * s) + ',' + (y + 11 * s) + ' ' + (x - 8 * s) + ',' + (y + 18 * s) + ' ' + x + ',' + (y + 20 * s) +
        ' C' + (x + 8 * s) + ',' + (y + 18 * s) + ' ' + (x + 7 * s) + ',' + (y + 11 * s) + ' ' + x + ',' + y + ' Z" fill="#c9ecff" stroke="#3f97cc" stroke-width="2"/><circle cx="' + (x - 2 * s) + '" cy="' + (y + 14 * s) + '" r="' + (1.6 * s) + '" fill="#fff"/></g>';
    }
    fx('sweat', 'Giọt mồ hôi', 'fxHead', function () { return { fxHead: drop(150, 70, 1, 'chb-sweat') }; });
    fx('sweatMany', 'Mồ hôi tung toé', 'fxHead', function () { return { fxHead: drop(150, 66, 1, 'chb-sweat') + drop(46, 70, 0.8, 'chb-sweat', -0.5) + drop(160, 92, 0.7, 'chb-sweat', -0.9) + drop(38, 94, 0.6, 'chb-sweat', -1.2) }; });
    fx('vein', 'Gân giận', 'fxHead', function () {
      return { fxHead: '<g class="chb-pulse"><path d="M127,58 q8,4 7,11 M145,58 q-8,4 -7,11 M127,79 q8,-4 7,-11 M145,79 q-8,-4 -7,-11" fill="none" stroke="#e23a3a" stroke-width="3.6" stroke-linecap="round"/></g>' };
    });
    fx('blush', 'Đỏ mặt', 'cheeks', function (C) {
      return { cheeks: both('<ellipse cx="69" cy="124" rx="9" ry="5" fill="' + C.P.blush + '" fill-opacity=".75"/><path d="M64,121 l-3,6 M69,121 l-3,6 M74,121 l-3,6" stroke="#d65a6d" stroke-width="1.4" stroke-linecap="round"/>') };
    });
    fx('gloomLines', 'Mặt tái', 'fxHead', function () {
      var d = '';
      for (var x = 66; x <= 134; x += 8) d += 'M' + x + ',' + (60 + Math.abs(100 - x) * 0.2) + ' L' + x + ',92 ';
      return { fxHead: '<path d="' + d + '" stroke="#5a6fbf" stroke-opacity=".6" stroke-width="2.2" stroke-linecap="round"/>' };
    });
    fx('gloom', 'Mây đen mưa', 'fxFront', function () {
      return {
        fxFront: '<g class="chb-bob"><path d="M64,0 C60,-12 74,-18 82,-12 C86,-22 106,-24 112,-14 C120,-20 138,-14 136,-2 C144,0 144,10 134,12 L70,12 C58,12 56,2 64,0 Z" fill="#59606e"' + stroke(2.4) + '/></g>' +
          '<g class="chb-rain"><path d="M76,18 l-3,8 M92,20 l-3,8 M108,18 l-3,8 M124,20 l-3,8" stroke="#6fa8dc" stroke-width="2.4" stroke-linecap="round"/></g>'
      };
    });
    fx('coins', 'Tiền xu bay', 'fxFront', function () {
      var s = '';
      [[34, 118, 0], [166, 106, -0.3], [26, 168, -0.6], [174, 160, -0.15], [52, 66, -0.45], [150, 54, -0.75]].forEach(function (c) {
        s += '<g class="chb-coin" style="animation-delay:' + c[2] + 's"><circle cx="' + c[0] + '" cy="' + c[1] + '" r="8.5" fill="#ffd34d" stroke="#9a6a12" stroke-width="2.2"/>' +
          '<rect x="' + (c[0] - 2.7) + '" y="' + (c[1] - 2.7) + '" width="5.4" height="5.4" fill="#9a6a12"/></g>';
      });
      return { fxFront: s };
    });
    function spark(x, y, s, dl) {
      return '<path class="chb-twinkle" style="animation-delay:' + dl + 's" d="M' + x + ',' + (y - s) + ' Q' + f(x + s * 0.18) + ',' + f(y - s * 0.18) + ' ' + (x + s) + ',' + y +
        ' Q' + f(x + s * 0.18) + ',' + f(y + s * 0.18) + ' ' + x + ',' + (y + s) + ' Q' + f(x - s * 0.18) + ',' + f(y + s * 0.18) + ' ' + (x - s) + ',' + y +
        ' Q' + f(x - s * 0.18) + ',' + f(y - s * 0.18) + ' ' + x + ',' + (y - s) + ' Z" fill="#ffe27a" stroke="#c99a1a" stroke-width="1.2"/>';
    }
    fx('sparkles', 'Lấp lánh', 'fxFront', function () { return { fxFront: spark(40, 70, 9, 0) + spark(164, 84, 7, -0.4) + spark(32, 140, 6, -0.7) + spark(170, 30, 8, -0.2) }; });
    var FIRE = 'M40,226 C30,190 40,160 30,130 C48,146 50,120 46,96 C62,112 64,84 70,64 C78,86 84,70 92,48 C98,70 108,54 112,40 C118,64 126,58 134,48 C138,72 150,74 156,64 C156,92 164,104 172,100 C166,128 176,150 170,170 C178,190 172,210 162,226 Z';
    fx('fire', 'Lửa giận', 'fxBack', function () {
      return { fxBack: '<g class="chb-flicker"><path d="' + FIRE + '" fill="#ff6a2b" fill-opacity=".85"/><path d="' + FIRE + '" fill="#ffc23a" transform="translate(100 226) scale(.78 .8) translate(-100 -226)"/></g>' };
    });
    fx('aura', 'Hào quang', 'fxBack', function () {
      return { fxBack: '<g class="chb-flicker"><ellipse cx="100" cy="130" rx="86" ry="104" fill="#ffd96b" fill-opacity=".38"/><ellipse cx="100" cy="134" rx="66" ry="86" fill="#fff1b8" fill-opacity=".45"/></g>' };
    });
    fx('speed', 'Tia sốc', 'fxBack', function () {
      var d = '';
      for (var a = 0; a < 360; a += 20) { var r = a * Math.PI / 180; d += 'M' + f(100 + Math.cos(r) * 92) + ',' + f(124 + Math.sin(r) * 104) + ' L' + f(100 + Math.cos(r) * 116) + ',' + f(124 + Math.sin(r) * 128) + ' '; }
      return { fxBack: '<path class="chb-flash" d="' + d + '" stroke="' + INK + '" stroke-opacity=".55" stroke-width="2.6" stroke-linecap="round"/>' };
    });
    fx('steam', 'Bốc khói', 'fxHead', function () {
      var p = function (x, y, dl) { return '<g class="chb-puff" style="animation-delay:' + dl + 's"><circle cx="' + x + '" cy="' + y + '" r="7" fill="#f4f4f2"' + stroke(2) + '/></g>'; };
      return { fxHead: p(42, 84, 0) + p(36, 72, -0.45) + p(158, 84, -0.2) + p(164, 72, -0.65) };
    });
    function txt(C, cls, x, y, size, fill, t, dl) {
      var el = txt0(cls, x, y, size, fill, t, dl);
      return C && C.flip ? '<g transform="translate(' + (2 * x) + ' 0) scale(-1 1)">' + el + '</g>' : el;
    }
    function txt0(cls, x, y, size, fill, t, dl) {
      return '<text class="' + cls + '"' + (dl ? ' style="animation-delay:' + dl + 's"' : '') + ' x="' + x + '" y="' + y + '" font-size="' + size + '" font-weight="900" font-family="Arial Black, Arial, Helvetica, sans-serif" fill="' + fill + '" stroke="' + INK + '" stroke-width="1.4">' + t + '</text>';
    }
    fx('zzz', 'Zzz', 'fxFront', function (C) { return { fxFront: txt(C, 'chb-zzz', 146, 44, 14, '#6f8fc9', 'z', 0) + txt(C, 'chb-zzz', 158, 28, 18, '#6f8fc9', 'z', -0.8) + txt(C, 'chb-zzz', 172, 10, 22, '#6f8fc9', 'z', -1.6) }; });
    fx('snot', 'Bong bóng mũi', 'fxHead', function () { return { fxHead: '<circle class="chb-bubble" cx="108" cy="121" r="7" fill="#d4f0ff" fill-opacity=".85" stroke="#5aa9d6" stroke-width="1.8"/>' }; });
    fx('gum', 'Thổi kẹo cao su', 'fxHead', function () { return { fxHead: '<circle class="chb-bubble" cx="112" cy="133" r="9" fill="#ff9ec7" fill-opacity=".9" stroke="#d14d8a" stroke-width="1.8"/><circle cx="109" cy="130" r="2" fill="#fff" fill-opacity=".8"/>' }; });
    fx('dots', 'Bong bóng suy nghĩ', 'fxFront', function () {
      return {
        fxFront: '<circle cx="142" cy="52" r="3" fill="#fff"' + stroke(1.8) + '/><circle cx="153" cy="40" r="5" fill="#fff"' + stroke(1.8) + '/>' +
          '<g class="chb-bob"><ellipse cx="175" cy="18" rx="22" ry="15" fill="#fff"' + stroke(2.2) + '/>' +
          '<circle cx="166" cy="18" r="2.4" fill="' + INK + '"/><circle cx="175" cy="18" r="2.4" fill="' + INK + '"/><circle cx="184" cy="18" r="2.4" fill="' + INK + '"/></g>'
      };
    });
    fx('exclaim', 'Chấm than', 'fxFront', function (C) { return { fxFront: txt(C, 'chb-pop', 164, 46, 34, '#e5604d', '!!') }; });
    fx('question', 'Dấu hỏi', 'fxFront', function (C) { return { fxFront: txt(C, 'chb-pop', 160, 46, 34, '#6fa8dc', '?') + txt(C, 'chb-pop', 34, 40, 22, '#6fa8dc', '?', -0.3) }; });
    fx('stars', 'Sao quay quanh đầu', 'fxHead', function () {
      return { fxHead: '<g class="chb-orbit">' + spark(60, 52, 7, 0) + spark(140, 52, 7, 0) + spark(100, 34, 6, 0) + '</g>' };
    });
    fx('bandage', 'Băng đầu + băng dán', 'fxHead', function () {
      return {
        fxHead: '<path d="M52,78 C72,66 128,66 148,78 L148,90 C128,78 72,78 52,90 Z" fill="#fbfbf7"' + stroke(2.2) + '/>' + line('M70,74 L72,84 M90,70 L91,80 M110,70 L109,80 M130,74 L128,84', 1.2, '#c9c4b8') +
          '<g transform="rotate(-20 130 124)"><rect x="120" y="119" width="20" height="9" rx="3" fill="#f2d4a6"' + stroke(1.6) + '/></g>' +
          '<g transform="rotate(25 130 124)"><rect x="120" y="119" width="20" height="9" rx="3" fill="#f2d4a6"' + stroke(1.6) + '/></g>'
      };
    });
    fx('crown', 'Vương miện #1', 'fxFront', function (C) {
      return { fxFront: '<g class="chb-bob"><path d="M76,22 L82,2 L92,14 L100,-4 L108,14 L118,2 L124,22 Z" fill="#ffd23a"' + stroke(2.4) + '/><circle cx="100" cy="10" r="3" fill="#e5604d"/>' + txt(C, '', 92, 38, 16, '#ffd23a', '#1') + '</g>' };
    });
    fx('confetti', 'Pháo giấy', 'fxFront', function () {
      var s = '', cols = ['#e5604d', '#ffd23a', '#4cb782', '#6fa8dc', '#b97bd0'];
      for (var i = 0; i < 12; i++) {
        var x = 20 + (i * 37) % 170, y = 10 + (i * 23) % 70;
        s += '<rect class="chb-fall" style="animation-delay:' + (-i * 0.13).toFixed(2) + 's" x="' + x + '" y="' + y + '" width="6" height="10" rx="1" fill="' + cols[i % 5] + '"/>';
      }
      return { fxFront: s };
    });
    fx('soul', 'Hồn lìa khỏi xác', 'fxFront', function () {
      return { fxFront: '<g class="chb-rise"><path d="M100,128 C88,126 84,112 90,100 C94,90 108,88 112,98 C118,110 112,122 104,124 C110,128 106,136 100,128 Z" fill="#ffffff" fill-opacity=".9" stroke="#9fb6d9" stroke-width="2"/><circle cx="96" cy="104" r="1.6" fill="#5a6fbf"/><circle cx="104" cy="104" r="1.6" fill="#5a6fbf"/></g>' };
    });

    /* ---------------- ĐỘNG TÁC (keyframe trên khớp; có khuỷu tay) ---------------- */
    var BOB = { y: k(0, 0, 0.5, -1.2, 1, 0) };
    function M(id, label, dur, still, tracks, extra) {
      var d = { label: label, dur: dur, still: still, tracks: tracks };
      for (var x in (extra || {})) d[x] = extra[x];
      D.motion(id, d);
    }
    M('idle', 'Đứng thở', 2.8, 0.25, { body: BOB, head: { rot: k(0, 0, 0.25, -2.5, 0.75, 2.5, 1, 0) },
      armL: { rot: k(0, 3, 0.5, 7, 1, 3) }, foreL: { rot: k(0, -4, 0.5, -8, 1, -4) }, armR: { rot: k(0, -3, 0.5, -7, 1, -3) }, foreR: { rot: k(0, 4, 0.5, 8, 1, 4) } });
    M('fanWave', 'Phe phẩy quạt', 1.4, 0.25, { body: BOB, head: { rot: k(0, -2, 0.5, 2, 1, -2) },
      armL: { rot: k(0, 4, 1, 4) }, armR: { rot: k(0, -6, 0.5, 8, 1, -6) }, foreR: { rot: k(0, -10, 0.5, -20, 1, -10) }, handR: { rot: k(0, -8, 0.5, 30, 1, -8) } });
    M('strokeBeard', 'Vuốt râu', 1.8, 0.5, { body: BOB, head: { rot: k(0, 3, 0.5, 6, 1, 3) },
      armL: { rot: k(0, -152, 0.5, -124, 1, -152) }, armR: { rot: k(0, -4, 1, -4) } }, { hide: ['heldL'] });
    M('snicker', 'Che miệng cười khúc khích', 0.5, 0.25, { body: { y: k(0, 0, 0.5, -2.5, 1, 0), rot: k(0, -2, 0.5, 2, 1, -2) }, head: { rot: k(0, -4, 0.5, 4, 1, -4) },
      armL: { rot: k(0, -150, 0.5, -144, 1, -150) }, armR: { rot: k(0, 16, 0.5, 20, 1, 16) }, foreR: { rot: k(0, 50, 0.5, 58, 1, 50) } }, { hide: ['heldL', 'tallR'] });
    M('fanSmirk', 'Che miệng cười, tay kia phẩy quạt', 0.5, 0.25, { body: { y: k(0, 0, 0.5, -2.5, 1, 0), rot: k(0, -2, 0.5, 2, 1, -2) }, head: { rot: k(0, -4, 0.5, 4, 1, -4) },
      armL: { rot: k(0, -150, 0.5, -144, 1, -150) }, armR: { rot: k(0, -10, 0.5, 4, 1, -10) }, handR: { rot: k(0, -12, 0.5, 18, 1, -12) } }, { hide: ['heldL'] });
    M('sob', 'Gào khóc vung tay', 0.6, 0.5, { body: { y: k(0, 0, 0.5, 3, 1, 0), sy: k(0, 1, 0.5, 0.95, 1, 1) },
      head: { y: k(0, 2, 1, 2), rot: k(0, -4, 0.25, 4, 0.5, -4, 0.75, 4, 1, -4) },
      armL: { rot: k(0, 128, 0.5, 150, 1, 128) }, foreL: { rot: k(0, 20, 0.5, 40, 1, 20) }, armR: { rot: k(0, -128, 0.5, -150, 1, -128) }, foreR: { rot: k(0, -20, 0.5, -40, 1, -20) } });
    var STOMP = { rot: k(0, -3, 0.5, 3, 1, -3), y: k(0, 0, 0.25, -6, 0.5, 0, 0.75, -6, 1, 0) };
    M('stomp', 'Giậm chân vung nắm đấm', 0.42, 0.25, { root: { sx: k(0, 1.04, 1, 1.04), sy: k(0, 1.04, 1, 1.04) }, body: STOMP, head: { rot: k(0, 4, 0.5, -4, 1, 4) },
      armL: { rot: k(0, 120, 0.5, 140, 1, 120) }, foreL: { rot: k(0, 30, 0.5, 10, 1, 30) }, armR: { rot: k(0, -120, 0.5, -140, 1, -120) }, foreR: { rot: k(0, -30, 0.5, -10, 1, -30) } });
    M('spearShake', 'Vung binh khí', 0.42, 0.25, { root: { sx: k(0, 1.04, 1, 1.04), sy: k(0, 1.04, 1, 1.04) }, body: STOMP, head: { rot: k(0, 4, 0.5, -4, 1, 4) },
      armL: { rot: k(0, 120, 0.5, 140, 1, 120) }, foreL: { rot: k(0, 30, 0.5, 10, 1, 30) }, armR: { rot: k(0, -70, 0.5, -92, 1, -70) }, handR: { rot: k(0, 40, 0.5, 62, 1, 40) } });
    M('spearRaise', 'Giơ cao binh khí', 0.7, 0.25, { body: { y: k(0, 0, 0.5, -6, 1, 0) }, head: { rot: k(0, -3, 0.5, 3, 1, -3) },
      armL: { rot: k(0, -30, 1, -30) }, foreL: { rot: k(0, -60, 1, -60) }, armR: { rot: k(0, -150, 0.5, -165, 1, -150) }, handR: { rot: k(0, 140, 0.5, 155, 1, 140) } });
    M('jolt', 'Giật nảy người', 0.3, 0, { root: { y: k(0, -12, 0.5, -9, 1, -12) }, body: { sx: k(0, 0.94, 0.5, 0.97, 1, 0.94), sy: k(0, 1.07, 0.5, 1.04, 1, 1.07) },
      head: { y: k(0, -3, 1, -3), rot: k(0, -1.5, 0.5, 1.5, 1, -1.5) },
      armL: { rot: k(0, 110, 0.5, 118, 1, 110) }, foreL: { rot: k(0, 30, 1, 30) }, armR: { rot: k(0, -110, 0.5, -118, 1, -110) }, foreR: { rot: k(0, -30, 1, -30) } });
    M('rubHands', 'Xoa tay hám lợi', 0.38, 0.25, { body: { y: k(0, 0, 0.5, -3, 1, 0) }, head: { rot: k(0, -3, 0.5, 3, 1, -3) },
      armL: { rot: k(0, -22, 0.5, -30, 1, -22) }, foreL: { rot: k(0, -40, 0.5, -52, 1, -40) }, armR: { rot: k(0, 30, 0.5, 22, 1, 30) }, foreR: { rot: k(0, 52, 0.5, 40, 1, 52) } }, { hide: ['heldL', 'heldR'] });
    M('kowtow', 'Chắp tay vái lia lịa', 0.75, 0.5, { body: { y: k(0, 0, 0.5, 7, 1, 0), sy: k(0, 1, 0.5, 0.93, 1, 1) }, head: { y: k(0, 0, 0.5, 5, 1, 0), rot: k(0, -7, 0.5, -2, 1, -7) },
      armL: { rot: k(0, -60, 0.5, -70, 1, -60) }, foreL: { rot: k(0, -70, 0.5, -80, 1, -70) }, armR: { rot: k(0, 60, 0.5, 70, 1, 60) }, foreR: { rot: k(0, 70, 0.5, 80, 1, 70) } }, { hide: ['heldL', 'heldR'] });
    M('fistPump', 'Đấm tay lên trời', 0.65, 0.5, { body: { y: k(0, 0, 0.5, -6, 1, 0) }, head: { rot: k(0, -3, 0.5, 3, 1, -3) },
      armL: { rot: k(0, -30, 1, -30) }, foreL: { rot: k(0, -70, 1, -70) }, armR: { rot: k(0, -100, 0.5, -150, 1, -100) }, foreR: { rot: k(0, -60, 0.5, -20, 1, -60) } });
    M('chinHand', 'Chống cằm suy tư', 3.2, 0.25, { body: { rot: k(0, 1, 0.5, -1, 1, 1) }, head: { rot: k(0, 6, 0.5, 9, 1, 6) },
      armL: { rot: k(0, -150, 0.5, -146, 1, -150) }, armR: { rot: k(0, 20, 1, 20) }, foreR: { rot: k(0, 60, 1, 60) } }, { hide: ['heldL', 'tallR'] });
    M('chinHandFan', 'Chống cằm, quạt hờ', 3.2, 0.25, { body: { rot: k(0, 1, 0.5, -1, 1, 1) }, head: { rot: k(0, 6, 0.5, 9, 1, 6) },
      armL: { rot: k(0, -150, 0.5, -146, 1, -150) }, armR: { rot: k(0, -6, 0.5, 2, 1, -6) }, handR: { rot: k(0, -8, 0.5, 8, 1, -8) } }, { hide: ['heldL'] });
    M('doze', 'Gà gật', 3.6, 0.6, { body: { sy: k(0, 1, 0.5, 1.02, 1, 1) }, head: { rot: k(0, 0, 0.6, 13, 0.66, -2, 1, 0), y: k(0, 0, 0.6, 5, 0.66, 0, 1, 0) },
      armL: { rot: k(0, 9, 1, 9) }, armR: { rot: k(0, -9, 1, -9) } });
    M('shrug', 'Nhún vai', 1.2, 0.5, { body: { y: k(0, 0, 0.5, -3, 1, 0) }, head: { rot: k(0, -6, 0.5, 6, 1, -6) },
      armL: { rot: k(0, 34, 0.5, 44, 1, 34) }, foreL: { rot: k(0, 64, 0.5, 80, 1, 64) }, armR: { rot: k(0, -34, 0.5, -44, 1, -34) }, foreR: { rot: k(0, -64, 0.5, -80, 1, -64) } }, { hide: ['tallR'] });
    M('typing', 'Gõ phím lia lịa', 0.24, 0.5, { body: { y: k(0, 0, 0.5, -1, 1, 0) }, head: { rot: k(0, 3, 1, 3), y: k(0, 3, 1, 3) },
      armL: { rot: k(0, -14, 0.5, -20, 1, -14) }, foreL: { rot: k(0, -58, 0.5, -74, 1, -58) }, armR: { rot: k(0, 20, 0.5, 14, 1, 20) }, foreR: { rot: k(0, 74, 0.5, 58, 1, 74) } }, { hide: ['heldL', 'heldR'] });
    M('slouch', 'Nằm ườn tay gối đầu', 3, 0.25, { body: { rot: k(0, -5, 0.5, -6, 1, -5) }, head: { rot: k(0, -8, 0.5, -11, 1, -8) },
      armL: { rot: k(0, -20, 1, -20) }, foreL: { rot: k(0, -40, 1, -40) }, armR: { rot: k(0, -160, 1, -160) }, foreR: { rot: k(0, -60, 0.5, -70, 1, -60) } }, { hide: ['heldR'] });
    M('wobble', 'Loạng choạng', 1.4, 0.25, { body: { rot: k(0, -6, 0.5, 6, 1, -6) }, head: { rot: k(0, 8, 0.5, -8, 1, 8) },
      armL: { rot: k(0, 20, 0.5, -10, 1, 20) }, armR: { rot: k(0, 10, 0.5, -20, 1, 10) } });
    M('panicRun', 'Hoảng loạn chạy quanh', 0.36, 0.25, { root: { x: k(0, -8, 0.5, 8, 1, -8), y: k(0, 0, 0.25, -6, 0.5, 0, 0.75, -6, 1, 0) }, body: { rot: k(0, -5, 0.5, 5, 1, -5) },
      head: { rot: k(0, 6, 0.5, -6, 1, 6) },
      armL: { rot: k(0, 130, 0.5, 170, 1, 130) }, foreL: { rot: k(0, 40, 0.5, 0, 1, 40) }, armR: { rot: k(0, -170, 0.5, -130, 1, -170) }, foreR: { rot: k(0, 0, 0.5, -40, 1, 0) } });
    M('limp', 'Rã rời vì thương', 2.4, 0.4, { body: { sy: k(0, 0.95, 0.5, 0.93, 1, 0.95), rot: k(0, 3, 1, 3) }, head: { rot: k(0, 8, 0.5, 11, 1, 8), y: k(0, 4, 1, 4) },
      armL: { rot: k(0, -24, 1, -24) }, foreL: { rot: k(0, -64, 1, -64) }, armR: { rot: k(0, -4, 1, -4) } });
    M('victory', 'Giơ hai tay chiến thắng', 0.6, 0.5, { root: { y: k(0, 0, 0.5, -8, 1, 0) }, body: { sy: k(0, 0.97, 0.5, 1.04, 1, 0.97) }, head: { rot: k(0, -3, 0.5, 3, 1, -3) },
      armL: { rot: k(0, 150, 0.5, 162, 1, 150) }, foreL: { rot: k(0, 10, 1, 10) }, armR: { rot: k(0, -150, 0.5, -162, 1, -150) }, foreR: { rot: k(0, -10, 1, -10) } });
    M('deflate', 'Xẹp lép kiệt sức', 3, 0.5, { body: { sy: k(0, 0.9, 0.5, 0.88, 1, 0.9), sx: k(0, 1.04, 1, 1.04) }, head: { y: k(0, 7, 0.5, 8, 1, 7), rot: k(0, -4, 0.5, -6, 1, -4) },
      armL: { rot: k(0, 6, 1, 6) }, armR: { rot: k(0, -6, 1, -6) } });

    // hiệu ứng bám mặt: ở góc 45° engine ánh xạ theo vị trí mắt gần/xa
    ['tears', 'blush', 'gloomLines', 'snot', 'gum'].forEach(function (id) { if (GC.LIB.fx[id]) GC.LIB.fx[id].face = true; });

    /* ================= ENGINE 0.3: TƯ THẾ · DI CHUYỂN · ĐỘNG TÁC · ĐẠO CỤ · HOẠT ĐỘNG =================
     * Một khung hình = tư thế nền × di chuyển × động tác (tay) × biểu cảm (mặt) + đạo cụ.
     * Không vẽ tay từng tổ hợp: ghép lớp như animation layer của game engine.
     * Toạ độ đạo cụ theo sân khấu (stage, không chạy theo nhân vật); mặt đất y = 228.
     */
    // đạo cụ của hoạt động là KHỐI XÁM (greybox) — đúng vị trí và kích thước theo tư thế; chủ đề thay hình sau
    var G1 = '#c9c5bd', G2 = '#a8a49c', G3 = '#8d8982', WATER = '#b9c6cf';

    /* ---------------- hiệu ứng cho di chuyển ---------------- */
    fx('dust', 'Bụi chân', 'fxBack', function () {
      var p = function (x, y, r, dl) { return '<g class="chb-puff" style="animation-delay:' + dl + 's"><circle cx="' + x + '" cy="' + y + '" r="' + r + '" fill="#efe8dc"' + stroke(1.8) + '/></g>'; };
      return { fxBack: p(44, 222, 8, 0) + p(28, 214, 6, -0.3) + p(56, 226, 5, -0.55) };
    });
    fx('speedLines', 'Vệt tốc độ', 'fxBack', function () {
      return { fxBack: '<g class="chb-flash">' + line('M2,120 L34,120 M-8,146 L30,146 M6,172 L40,172 M-4,196 L28,196', 2.6, INK, 0.45) + '</g>' };
    });
    fx('wind', 'Gió (bay)', 'fxBack', function () {
      return { fxBack: '<g class="chb-flow" stroke-dasharray="10 14">' + line('M-10,150 C20,140 40,160 70,150 M-16,186 C14,176 34,196 60,186 M0,214 C24,206 40,222 66,214', 2.4, '#7fa8c9', 0.8) + '</g>' };
    });
    fx('splash', 'Bọt nước', 'fxFront', function () {
      var d = function (x, y, dl) { return '<g class="chb-sweat" style="animation-delay:' + dl + 's"><path d="M' + x + ',' + y + ' q-4,7 0,9 q4,-2 0,-9 Z" fill="#d4f0ff" stroke="#3c8dbc" stroke-width="1.4"/></g>'; };
      return { fxFront: d(52, 136, 0) + d(40, 128, -0.5) + d(148, 136, -0.25) + d(160, 128, -0.8) };
    });
    fx('tremble', 'Run cầm cập', 'fxBack', function () {
      return { fxBack: line('M44,120 q-6,8 0,16 q6,8 0,16 M156,120 q6,8 0,16 q-6,8 0,16', 2.2, INK, 0.5) };
    });
    D.mouth('chew', function () {
      return '<path d="M90,128 q5,5 10,0 q5,5 10,0" fill="none" stroke="' + INK + '" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/>' +
        '<circle cx="117" cy="133" r="1.8" fill="#fff" stroke="' + INK + '" stroke-width="1"/>';
    });

    /* ---------------- đạo cụ (khối) ---------------- */
    function prop(id, label, draw) { D.prop(id, { label: label, draw: draw }); }
    function box(x, y, w, h, fill, r) { return '<rect x="' + x + '" y="' + y + '" width="' + w + '" height="' + h + '" rx="' + (r || 2) + '" fill="' + fill + '"' + stroke(2.2) + '/>'; }
    prop('stool', 'Khối ghế', function () {
      return { propBack: box(66, 208, 7, 20, G3) + box(127, 208, 7, 20, G3) + box(58, 199, 84, 11, G2, 3) };
    });
    prop('cushion', 'Khối nệm ngồi', function () {
      return { propBack: '<ellipse cx="100" cy="225" rx="60" ry="10" fill="' + G2 + '"' + stroke(2.4) + '/>' };
    });
    prop('bedroll', 'Khối chiếu + gối', function () {
      return { propBack: box(-14, 214, 228, 12, G1, 4) + '<ellipse cx="34" cy="206" rx="34" ry="11" fill="' + G1 + '"' + stroke(2.4) + '/>' };
    });
    // chăn khớp tư thế nằm: cổ x≈114 → chân x≈192, dải y 124–212 (toạ độ sân khấu); phủ từ cổ tới chân, tay nắm mép chăn
    prop('blanket', 'Khối chăn', function (C) {
      var top = 'M110,218 L110,124 C114,110 126,104 140,104 C156,104 164,114 176,118 C184,120 188,112 198,112 C210,112 216,128 216,150 L216,218 Z';
      return { propFront: '<path d="' + top + '" fill="' + G2 + '"' + stroke(2.8) + '/>' + shadow('M140,202 C164,208 192,208 216,200 L216,218 L110,218 L110,206 Z', 0.12) +
        '<path d="M106,218 L106,122 C108,110 118,105 128,108 C133,128 130,176 133,218 Z" fill="' + G1 + '"' + stroke(2.6) + '/>' +
        '<circle cx="131" cy="150" r="7.5" fill="' + C.P.skin + '"' + stroke(2.4) + '/>' };
    });
    prop('desk', 'Khối bàn thấp', function () {
      return { propMid: box(50, 206, 8, 22, G3) + box(142, 206, 8, 22, G3) + box(36, 196, 128, 11, G2, 3) + box(78, 190, 40, 6, G1, 1) };
    });
    prop('water', 'Khối mặt nước', function () {
      return {
        propBack: '<rect x="-24" y="182" width="248" height="16" fill="' + WATER + '" fill-opacity=".6"/>',
        propFront: '<g class="chb-wave"><path d="M-40,188 q12,-7 24,0 t24,0 t24,0 t24,0 t24,0 t24,0 t24,0 t24,0 t24,0 t24,0 t24,0 t24,0 L248,262 L-40,262 Z" fill="' + WATER + '" fill-opacity=".86"' + stroke(2.4) + '/></g>'
      };
    });
    prop('bowl', 'Khối bát (tay trái)', function () {
      return { heldL: '<path d="M58,186 L86,186 Q85,200 72,201 Q59,200 58,186 Z" fill="' + G1 + '"' + stroke(2.2) + '/>' };
    });
    prop('chopsticks', 'Khối que đôi (tay phải)', function () {
      return { heldR: line('M126,198 L112,166 M131,197 L119,165', 2.6, G3) };
    });
    prop('cup', 'Khối chén (tay phải)', function () {
      return { heldR: '<path d="M119,180 L137,180 L134,195 L122,195 Z" fill="' + G1 + '"' + stroke(2.2) + '/>' };
    });
    prop('book', 'Khối sách (hai tay)', function () {
      return { heldL: '<g transform="rotate(-8 72 193)">' + '<path d="M64,170 L100,174 L100,206 L64,202 Z" fill="' + G2 + '"' + stroke(2.2) + '/></g>' };
    });
    prop('brush', 'Khối bút (tay phải)', function () {
      return { heldR: '<path d="M125,196 L117,214" stroke="' + G3 + '" stroke-width="3.6" stroke-linecap="round"/>' };
    });

    /* ---------------- tư thế nền (thân dưới + vị trí) ----------------
     * base: giá trị tuyệt đối trên khớp. handsBusy: tay dùng để bò/bơi, động tác tay bị bỏ qua.
     * shadow.sx: độ rộng bóng; lift0: độ cao coi như vẫn chạm đất (nằm).
     */
    function posture(id, label, base, extra) { var d = { label: label, base: base }; for (var x in (extra || {})) d[x] = extra[x]; D.posture(id, d); }
    posture('stand', 'Đứng', {});
    posture('stance', 'Đứng tấn', { root: { y: 3 }, thighL: { rot: 18 }, shinL: { rot: -18 }, thighR: { rot: -18 }, shinR: { rot: 18 }, hem: { sx: 1.08, sy: 0.92 } }, { shadow: { sx: 1.1 } });
    posture('sit-chair', 'Ngồi ghế', { root: { y: 6 }, thighL: { sy: 0.35, rot: 8 }, thighR: { sy: 0.35, rot: -8 }, shinL: { rot: -8 }, shinR: { rot: 8 }, hem: { sx: 1.12, sy: 0.55 } }, { props: ['stool'] });
    posture('sit-floor', 'Ngồi xếp bằng', { root: { y: 13 }, thighL: { rot: 62, sy: 0.7 }, shinL: { rot: -122, sy: 0.9 }, thighR: { rot: -62, sy: 0.7 }, shinR: { rot: 122, sy: 0.9 }, hem: { sx: 1.3, sy: 0.6 } }, { props: ['cushion'], shadow: { sx: 1.3 } });
    posture('kneel', 'Quỳ', { root: { y: 11 }, thighL: { sy: 0.3 }, thighR: { sy: 0.3 }, shinL: { sy: 0.01 }, shinR: { sy: 0.01 }, footL: { sy: 0.01 }, footR: { sy: 0.01 }, hem: { sx: 1.1, sy: 0.72 } }, { shadow: { sx: 1.1 } });
    posture('squat', 'Ngồi xổm', { root: { y: 10 }, thighL: { rot: 58, sy: 0.9 }, shinL: { rot: -64 }, thighR: { rot: -58, sy: 0.9 }, shinR: { rot: 64 }, hem: { sx: 1.18, sy: 0.5 }, body: { sy: 0.97 } }, { shadow: { sx: 1.2 } });
    posture('cower', 'Co rúm', { root: { y: 8 }, body: { sy: 0.9, sx: 1.04 }, head: { y: 5 }, thighL: { rot: 14, sy: 0.6 }, shinL: { rot: -14 }, thighR: { rot: -14, sy: 0.6 }, shinR: { rot: 14 }, hem: { sx: 1.1, sy: 0.7 } });
    posture('lie', 'Nằm', { root: { rot: -90, x: 92, y: -60 }, hem: { sy: 1.02 } }, { noLegLift: true, props: ['bedroll'], hideHeld: true, shadow: { sx: 2.1, dx: -6, lift0: 60, op: 0.7 }, crop: [6, 120, 132, 132] });
    posture('crawl', 'Bò', { root: { y: 20 }, body: { sy: 0.88, sx: 1.04 }, head: { y: 4 }, thighL: { sy: 0.2, rot: 30 }, thighR: { sy: 0.2, rot: -30 }, shinL: { sy: 0.3 }, shinR: { sy: 0.3 }, hem: { sx: 1.22, sy: 0.46 },
      armL: { rot: 22, sy: 1.25 }, foreL: { rot: 8 }, armR: { rot: -22, sy: 1.25 }, foreR: { rot: -8 } }, { handsBusy: true, shadow: { sx: 1.25 } });
    posture('air', 'Trên không', { root: { y: -26 }, thighL: { rot: 12, sy: 0.7 }, shinL: { rot: -38 }, thighR: { rot: -12, sy: 0.7 }, shinR: { rot: 38 }, hem: { sx: 1.06, sy: 0.9 } });
    posture('fly', 'Bay', { root: { y: -34 }, body: { rot: 8 }, head: { rot: -4 }, thighL: { rot: 24 }, thighR: { rot: 20 }, shinL: { rot: 10 }, shinR: { rot: 12 }, hem: { rot: 14, sx: 0.96 },
      armL: { rot: 40 }, armR: { rot: -150 }, foreR: { rot: -10 } }, { noLegLift: true });
    posture('swim', 'Bơi', { root: { y: 46 } }, { noLegLift: true, props: ['water'], handsBusy: true, shadow: { op: 0 } });

    /* ---------------- di chuyển (chu kỳ cộng dồn lên tư thế) ---------------- */
    function move(id, label, dur, tracks, extra) { var d = { label: label, dur: dur, tracks: tracks, still: 0.25 }; for (var x in (extra || {})) d[x] = extra[x]; D.move(id, d); }
    var LIFT = function (a) { return k(0, 1, 0.25, a, 0.5, 1, 1, 1); };
    var LIFT2 = function (a) { return k(0, 1, 0.5, 1, 0.75, a, 1, 1); };
    move('walk', 'Đi bộ', 0.8, {
      root: { y: k(0, 0, 0.25, -2, 0.5, 0, 0.75, -2, 1, 0) }, body: { rot: k(0, -2, 0.5, 2, 1, -2) }, hem: { rot: k(0, -3, 0.5, 3, 1, -3) },
      thighL: { sy: LIFT(0.55) }, footL: { y: k(0, 0, 0.25, -3, 0.5, 0, 1, 0) }, thighR: { sy: LIFT2(0.55) }, footR: { y: k(0, 0, 0.5, 0, 0.75, -3, 1, 0) },
      armL: { rot: k(0, -12, 0.5, 14, 1, -12) }, armR: { rot: k(0, -14, 0.5, 12, 1, -14) }
    }, { postures: ['stand', 'stance'] });
    move('run', 'Chạy', 0.42, {
      root: { y: k(0, 0, 0.25, -6, 0.5, 0, 0.75, -6, 1, 0) }, body: { rot: k(0, 7, 0.5, 9, 1, 7) }, head: { rot: k(0, -3, 0.5, -5, 1, -3) },
      hem: { rot: k(0, -8, 0.5, -2, 1, -8), sy: k(0, 0.9, 1, 0.9) },
      thighL: { sy: LIFT(0.35), rot: k(0, 0, 0.25, 10, 0.5, 0, 1, 0) }, shinL: { rot: k(0, 0, 0.25, -20, 0.5, 0, 1, 0) },
      thighR: { sy: LIFT2(0.35), rot: k(0, 0, 0.75, -10, 1, 0) }, shinR: { rot: k(0, 0, 0.75, 20, 1, 0) },
      armL: { rot: k(0, -34, 0.5, 40, 1, -34) }, foreL: { rot: k(0, -50, 0.5, -30, 1, -50) }, armR: { rot: k(0, -40, 0.5, 34, 1, -40) }, foreR: { rot: k(0, 30, 0.5, 50, 1, 30) }
    }, { postures: ['stand'], fx: ['dust', 'speedLines'] });
    move('sneak', 'Rón rén', 1.3, {
      root: { x: k(0, -2, 0.5, 2, 1, -2), y: k(0, 0, 0.25, -2, 0.5, 0, 0.75, -2, 1, 0) }, body: { rot: k(0, -3, 0.5, 3, 1, -3) },
      thighL: { sy: LIFT(0.6) }, thighR: { sy: LIFT2(0.6) },
      armL: { rot: k(0, -40, 1, -40) }, foreL: { rot: k(0, -60, 1, -60) }, armR: { rot: k(0, 40, 1, 40) }, foreR: { rot: k(0, 60, 1, 60) }
    }, { postures: ['squat', 'stand'] });
    move('hop', 'Nhảy', 0.75, {
      root: { y: k(0, 0, 0.14, 5, 0.5, -22, 0.86, 5, 1, 0), sy: k(0, 1, 0.14, 0.9, 0.3, 1.06, 0.5, 1, 0.86, 0.9, 1, 1) },
      thighL: { rot: k(0, 0, 0.5, 14, 1, 0), sy: k(0, 1, 0.5, 0.7, 1, 1) }, shinL: { rot: k(0, 0, 0.5, -40, 1, 0) },
      thighR: { rot: k(0, 0, 0.5, -14, 1, 0), sy: k(0, 1, 0.5, 0.7, 1, 1) }, shinR: { rot: k(0, 0, 0.5, 40, 1, 0) },
      hem: { sy: k(0, 0.9, 0.5, 1.04, 1, 0.9) },
      armL: { rot: k(0, 20, 0.5, 130, 1, 20) }, armR: { rot: k(0, -20, 0.5, -130, 1, -20) }
    }, { postures: ['stand'], still: 0.5 });
    move('crawl', 'Bò', 0.9, {
      root: { x: k(0, -2, 0.5, 2, 1, -2) }, body: { rot: k(0, -3, 0.5, 3, 1, -3) }, head: { rot: k(0, 3, 0.5, -3, 1, 3) },
      armL: { sy: k(0, 1, 0.25, 0.82, 0.5, 1, 1, 1), rot: k(0, 0, 0.25, -6, 0.5, 0, 1, 0) }, armR: { sy: k(0, 1, 0.5, 1, 0.75, 0.82, 1, 1), rot: k(0, 0, 0.75, 6, 1, 0) }
    }, { postures: ['crawl'] });
    move('swim', 'Bơi', 1.1, {
      root: { y: k(0, 0, 0.5, -3, 1, 0), rot: k(0, -3, 0.5, 3, 1, -3) }, head: { rot: k(0, 4, 0.5, -4, 1, 4) },
      armL: { rot: k(0, 20, 0.25, 170, 0.5, 120, 0.75, 20, 1, 20), sy: k(0, 1, 0.25, 1.45, 0.5, 1.2, 0.75, 1, 1, 1) }, foreL: { rot: k(0, 0, 0.25, -10, 0.5, -50, 1, 0) },
      armR: { rot: k(0, -20, 0.5, -20, 0.75, -170, 0.9, -120, 1, -20), sy: k(0, 1, 0.5, 1, 0.75, 1.45, 0.9, 1.2, 1, 1) }, foreR: { rot: k(0, 0, 0.75, 10, 0.9, 50, 1, 0) }
    }, { postures: ['swim'], fx: ['splash'], still: 0.25 });
    move('fly', 'Bay lượn', 1.6, {
      root: { y: k(0, 0, 0.5, -6, 1, 0) }, body: { rot: k(0, -2, 0.5, 2, 1, -2) }, hem: { rot: k(0, -5, 0.5, 5, 1, -5) },
      thighL: { rot: k(0, -4, 0.5, 4, 1, -4) }, thighR: { rot: k(0, 4, 0.5, -4, 1, 4) }
    }, { postures: ['fly'], fx: ['wind'] });
    move('float', 'Lơ lửng', 1.4, { root: { y: k(0, 0, 0.5, -4, 1, 0) }, hem: { rot: k(0, -3, 0.5, 3, 1, -3) } }, { postures: ['air', 'fly'] });
    move('tremble', 'Run rẩy', 0.12, { root: { x: k(0, -1.4, 0.5, 1.4, 1, -1.4) } }, { fx: ['tremble'] });
    move('bounce', 'Nhún nhảy', 0.5, { root: { y: k(0, 0, 0.5, -5, 1, 0) }, body: { rot: k(0, -4, 0.5, 4, 1, -4) }, hem: { rot: k(0, 4, 0.5, -4, 1, 4) } }, { postures: ['stand', 'stance', 'air'] });

    /* ---------------- động tác tay mới (thân trên) ---------------- */
    M('eat', 'Ăn (bát + đũa)', 0.9, 0.5, { head: { rot: k(0, 2, 0.5, -2, 1, 2) },
      armL: { rot: k(0, -34, 1, -34) }, foreL: { rot: k(0, -76, 1, -76) },
      armR: { rot: k(0, 70, 0.45, 146, 0.6, 146, 1, 70) }, foreR: { rot: k(0, 40, 0.45, 6, 0.6, 6, 1, 40) } }, { hold: { L: 'bowl', R: 'chopsticks' } });
    M('drink', 'Uống (chén)', 1.8, 0.5, { head: { rot: k(0, 0, 0.45, -6, 0.75, -6, 1, 0) },
      armL: { rot: k(0, 22, 1, 22) }, foreL: { rot: k(0, 60, 1, 60) },
      armR: { rot: k(0, 70, 0.4, 142, 0.75, 142, 1, 70) }, foreR: { rot: k(0, 40, 0.4, 10, 0.75, 10, 1, 40) } }, { hold: { R: 'cup' } });
    M('read', 'Đọc sách', 2.6, 0.25, { head: { rot: k(0, 3, 0.5, 5, 1, 3), y: k(0, 2, 1, 2) },
      armL: { rot: k(0, -30, 1, -30) }, foreL: { rot: k(0, -66, 1, -66) }, armR: { rot: k(0, 30, 1, 30) }, foreR: { rot: k(0, 70, 0.5, 74, 1, 70) } }, { hold: { L: 'book' }, hide: ['heldR'] });
    M('write', 'Viết (bút lông)', 0.8, 0.25, { head: { rot: k(0, 4, 1, 4), y: k(0, 3, 1, 3) },
      armL: { rot: k(0, -24, 1, -24) }, foreL: { rot: k(0, -44, 1, -44) },
      armR: { rot: k(0, 30, 0.5, 38, 1, 30) }, foreR: { rot: k(0, 44, 0.5, 52, 1, 44) } }, { hold: { R: 'brush' }, hide: ['heldL'] });
    M('slash', 'Chém', 0.6, 0.3, { root: { x: k(0, -2, 0.5, 6, 1, -2) }, body: { rot: k(0, -6, 0.5, 9, 1, -6) }, head: { rot: k(0, -3, 0.5, 4, 1, -3) },
      armL: { rot: k(0, 40, 0.5, 20, 1, 40) }, foreL: { rot: k(0, 40, 1, 40) },
      armR: { rot: k(0, -165, 0.35, -170, 0.55, 40, 0.8, 50, 1, -165) }, foreR: { rot: k(0, -20, 0.55, 20, 1, -20) }, handR: { rot: k(0, 150, 0.35, 160, 0.55, 30, 0.8, 20, 1, 150) } });
    M('thrust', 'Đâm giáo', 0.55, 0.5, { root: { x: k(0, -4, 0.5, 8, 1, -4), y: k(0, 0, 0.5, 2, 1, 0) }, body: { rot: k(0, -4, 0.5, 8, 1, -4) },
      armL: { rot: k(0, -30, 0.5, -50, 1, -30) }, foreL: { rot: k(0, -50, 1, -50) },
      armR: { rot: k(0, -40, 0.5, -84, 1, -40) }, foreR: { rot: k(0, -10, 0.5, 0, 1, -10) }, handR: { rot: k(0, 90, 0.5, 90, 1, 90) } });
    M('block', 'Đỡ đòn', 0.5, 0.25, { root: { x: k(0, 0, 0.5, -1.5, 1, 0) }, head: { y: k(0, 3, 1, 3) },
      armL: { rot: k(0, -110, 0.5, -106, 1, -110) }, foreL: { rot: k(0, -64, 1, -64) }, armR: { rot: k(0, 110, 0.5, 106, 1, 110) }, foreR: { rot: k(0, 64, 1, 64) } }, { hide: ['tallL', 'tallR'] });
    M('coverHead', 'Ôm đầu', 0.25, 0.25, { root: { x: k(0, -1.2, 0.5, 1.2, 1, -1.2) }, head: { rot: k(0, -2, 0.5, 2, 1, -2) },
      armL: { rot: k(0, -168, 1, -168) }, foreL: { rot: k(0, -52, 1, -52) }, armR: { rot: k(0, 168, 1, 168) }, foreR: { rot: k(0, 52, 1, 52) } }, { hide: ['heldL', 'heldR'] });
    M('wave', 'Vẫy chào', 0.8, 0.25, { head: { rot: k(0, -3, 0.5, 3, 1, -3) }, armL: { rot: k(0, 4, 1, 4) },
      armR: { rot: k(0, -150, 0.5, -132, 1, -150) }, foreR: { rot: k(0, -24, 0.5, 22, 1, -24) } }, { hide: ['heldR'] });
    M('point', 'Chỉ tay', 1.4, 0.25, { body: { rot: k(0, 2, 0.5, 3, 1, 2) }, head: { rot: k(0, -2, 1, -2) },
      armL: { rot: k(0, 26, 1, 26) }, foreL: { rot: k(0, 64, 1, 64) }, armR: { rot: k(0, -96, 0.5, -100, 1, -96) }, foreR: { rot: k(0, -4, 1, -4) } }, { hide: ['heldR'] });
    M('bow', 'Cúi chào', 1.8, 0.45, { body: { sy: k(0, 1, 0.4, 0.92, 0.7, 0.92, 1, 1) }, head: { y: k(0, 0, 0.4, 9, 0.7, 9, 1, 0), rot: k(0, 0, 0.4, 3, 1, 0) },
      armL: { rot: k(0, -18, 1, -18) }, foreL: { rot: k(0, -40, 1, -40) }, armR: { rot: k(0, 18, 1, 18) }, foreR: { rot: k(0, 40, 1, 40) } }, { hide: ['heldL', 'heldR'] });
    M('salute', 'Ôm quyền thi lễ', 1.2, 0.5, { body: { sy: k(0, 1, 0.5, 0.96, 1, 1) }, head: { y: k(0, 0, 0.5, 4, 1, 0) },
      armL: { rot: k(0, -46, 1, -46) }, foreL: { rot: k(0, -72, 1, -72) }, armR: { rot: k(0, 46, 1, 46) }, foreR: { rot: k(0, 72, 1, 72) } }, { hide: ['heldL', 'heldR'] });
    M('cheer', 'Cổ vũ', 0.5, 0.25, { head: { rot: k(0, -3, 0.5, 3, 1, -3) },
      armL: { rot: k(0, 150, 0.5, 120, 1, 150) }, foreL: { rot: k(0, 10, 1, 10) }, armR: { rot: k(0, -120, 0.5, -150, 1, -120) }, foreR: { rot: k(0, -10, 1, -10) } });
    M('flail', 'Vung tay hoảng loạn', 0.3, 0.25, { head: { rot: k(0, 5, 0.5, -5, 1, 5) },
      armL: { rot: k(0, 140, 0.5, 170, 1, 140) }, foreL: { rot: k(0, 40, 0.5, 0, 1, 40) }, armR: { rot: k(0, -170, 0.5, -140, 1, -170) }, foreR: { rot: k(0, 0, 0.5, -40, 1, 0) } }, { hide: ['tallL', 'tallR'] });
    // ---- ngôn ngữ cơ thể của 18 cảm xúc (v0.15): hình bóng toàn thân khác nhau rõ — khối thân nghiêng, co / giãn, nảy, tay bất đối xứng,
    //      tay "cao su" (sy > 1) khi vươn; không còn dáng hai tay chữ V. Đo bằng GC.poseDistance (tools/test.sh 2h). Động tác cũ giữ cho hoạt động.
    M('ponder', 'Chống cằm, dồn trọng tâm', 3.2, 0.5, {
      pelvis: { x: k(0, 5, 0.5, 6, 1, 5), rot: k(0, 6, 0.5, 7, 1, 6) },
      body: { rot: k(0, -12, 0.5, -14, 1, -12) },
      head: { rot: k(0, 12, 0.5, 15, 1, 12), y: k(0, 1, 1, 1) },
      armL: { rot: k(0, -128, 0.5, -122, 1, -128), sy: k(0, 1.08, 1, 1.08) },
      foreL: { rot: k(0, -52, 0.5, -46, 1, -52) },
      armR: { rot: k(0, 64, 1, 64) },
      foreR: { rot: k(0, 84, 1, 84) } }, { hide: ['heldL', 'heldR'] });
    M('gloat', 'Ngả người che miệng, chống nạnh', 0.9, 0.5, {
      root: { sy: k(0, 1.02, 0.5, 1.04, 1, 1.02) },
      pelvis: { x: k(0, -4, 1, -4) },
      body: { rot: k(0, 9, 0.5, 11, 1, 9) },
      head: { rot: k(0, -10, 0.5, -6, 1, -10) },
      armL: { rot: k(0, -146, 0.5, -140, 1, -146) },
      foreL: { rot: k(0, -40, 1, -40) },
      armR: { rot: k(0, -48, 1, -48) },
      foreR: { rot: k(0, 118, 1, 118) } }, { hide: ['heldL', 'heldR'] });
    M('grind', 'Cắm cúi gõ', 0.24, 0.5, {
      root: { sy: k(0, 0.93, 1, 0.93), y: k(0, 2, 1, 2) },
      body: { rot: k(0, 4, 1, 4), sy: k(0, 0.94, 1, 0.94) },
      head: { y: k(0, 5, 1, 5), rot: k(0, 4, 0.5, 2, 1, 4) },
      armL: { rot: k(0, -40, 0.5, -30, 1, -40) },
      foreL: { rot: k(0, -70, 0.5, -82, 1, -70) },
      armR: { rot: k(0, 40, 0.5, 30, 1, 40) },
      foreR: { rot: k(0, 82, 0.5, 70, 1, 82) } }, { hide: ['heldL', 'heldR'] });
    M('covet', 'Khom người xoa tay, kiễng chân', 0.5, 0.5, {
      root: { y: k(0, 0, 0.5, -7, 1, 0), sy: k(0, 1.04, 0.5, 0.96, 1, 1.04) },
      body: { rot: k(0, -8, 0.5, 8, 1, -8), sy: k(0, 0.95, 1, 0.95) },
      head: { rot: k(0, 6, 0.5, -6, 1, 6), y: k(0, 2, 1, 2) },
      armL: { rot: k(0, -78, 0.5, -64, 1, -78) },
      foreL: { rot: k(0, -78, 0.5, -96, 1, -78) },
      armR: { rot: k(0, 64, 0.5, 78, 1, 64) },
      foreR: { rot: k(0, 96, 0.5, 78, 1, 96) } }, { hide: ['heldL', 'heldR'] });
    M('nodOff', 'Gục đầu ngủ gật, người đổ lắc', 3.6, 0.5, {
      root: { y: k(0, 4, 0.5, 6, 1, 4), sy: k(0, 0.95, 0.5, 0.93, 1, 0.95) },
      pelvis: { x: k(0, -4, 0.5, 4, 1, -4) },
      body: { rot: k(0, -13, 0.5, 13, 1, -13) },
      head: { rot: k(0, 20, 0.45, 26, 0.55, -26, 1, 20), y: k(0, 7, 0.5, 9, 1, 7) },
      armL: { rot: k(0, -6, 0.5, 6, 1, -6), sy: k(0, 1.12, 1, 1.12) },
      armR: { rot: k(0, -6, 0.5, 6, 1, -6), sy: k(0, 1.12, 1, 1.12) } }, { hide: ['tallR', 'heldL'] });
    M('reel', 'Lảo đảo dang tay giữ thăng bằng', 1.4, 0.5, {
      root: { x: k(0, -6, 0.25, 0, 0.5, 6, 0.75, 0, 1, -6), y: k(0, 0, 0.25, 3, 0.5, 0, 0.75, 3, 1, 0) },
      pelvis: { rot: k(0, 8, 0.5, -8, 1, 8) },
      body: { rot: k(0, -16, 0.5, 16, 1, -16) },
      head: { rot: k(0, 14, 0.5, -14, 1, 14) },
      armL: { rot: k(0, 70, 0.5, 40, 1, 70), sy: k(0, 1.2, 1, 1.2) },
      foreL: { rot: k(0, -20, 1, -20) },
      armR: { rot: k(0, -40, 0.5, -70, 1, -40), sy: k(0, 1.2, 1, 1.2) },
      foreR: { rot: k(0, 20, 1, 20) } });
    M('collapse', 'Xẹp người gục về trước', 3, 0.5, {
      root: { y: k(0, 8, 0.5, 10, 1, 8), sy: k(0, 0.86, 0.5, 0.84, 1, 0.86), sx: k(0, 1.08, 1, 1.08) },
      body: { rot: k(0, 10, 0.5, 12, 1, 10), sy: k(0, 0.9, 1, 0.9) },
      head: { rot: k(0, 16, 0.5, 18, 1, 16), y: k(0, 9, 1, 9) },
      armL: { rot: k(0, 4, 1, 4), sy: k(0, 1.25, 1, 1.25) },
      armR: { rot: k(0, -2, 1, -2), sy: k(0, 1.25, 1, 1.25) } });
    M('nurse', 'Nghiêng người ôm hông đau', 2.4, 0.5, {
      root: { y: k(0, 5, 0.3, 8, 0.6, 5, 1, 5), sy: k(0, 0.95, 1, 0.95) },
      pelvis: { x: k(0, -7, 1, -7), rot: k(0, -8, 0.3, -11, 1, -8) },
      body: { rot: k(0, 20, 0.3, 24, 1, 20) },
      head: { rot: k(0, -8, 1, -8) },
      armR: { rot: k(0, 30, 1, 30) },
      foreR: { rot: k(0, 96, 1, 96) },
      armL: { rot: k(0, 14, 0.5, 22, 1, 14), sy: k(0, 1.1, 1, 1.1) },
      shinL: { rot: k(0, -18, 0.3, -26, 1, -18) } }, { hide: ['tallR', 'heldL'] });
    M('loaf', 'Ngả người gối đầu', 3, 0.5, {
      root: { sy: k(0, 0.97, 1, 0.97) },
      pelvis: { x: k(0, 6, 1, 6), rot: k(0, -6, 1, -6) },
      body: { rot: k(0, -14, 0.5, -16, 1, -14) },
      head: { rot: k(0, -12, 0.5, -9, 1, -12) },
      armL: { rot: k(0, -168, 1, -168), sy: k(0, 1.2, 1, 1.2) },
      foreL: { rot: k(0, -70, 1, -70) },
      armR: { rot: k(0, 168, 1, 168), sy: k(0, 1.2, 1, 1.2) },
      foreR: { rot: k(0, 70, 1, 70) },
      thighR: { rot: k(0, -18, 1, -18) } }, { hide: ['heldR', 'heldL'] });
    M('fury', 'Chồm tới, một nắm đấm vươn cao', 0.42, 0.5, {
      root: { y: k(0, 0, 0.25, -6, 0.5, 0, 0.75, -3, 1, 0), sx: k(0, 1.05, 1, 1.05), sy: k(0, 1.03, 0.25, 0.96, 0.5, 1.03, 1, 1.03) },
      pelvis: { x: k(0, -3, 1, -3) },
      body: { rot: k(0, 12, 0.5, 15, 1, 12) },
      head: { rot: k(0, -6, 0.5, -2, 1, -6) },
      armR: { rot: k(0, -158, 0.5, -146, 1, -158), sy: k(0, 1.35, 1, 1.35) },
      foreR: { rot: k(0, -8, 0.5, 6, 1, -8) },
      armL: { rot: k(0, 24, 1, 24) },
      foreL: { rot: k(0, 62, 1, 62) },
      thighR: { rot: k(0, 0, 0.25, -22, 0.5, 0, 1, 0) } });
    M('weep', 'Dụi mắt nấc', 0.6, 0.5, {
      root: { y: k(0, 2, 0.5, 5, 1, 2), sy: k(0, 0.96, 0.5, 0.91, 1, 0.96) },
      body: { rot: k(0, -7, 0.5, -9, 1, -7) },
      head: { rot: k(0, 10, 0.25, 13, 0.5, 8, 0.75, 13, 1, 10), y: k(0, 3, 1, 3) },
      armL: { rot: k(0, -132, 0.5, -124, 1, -132) },
      foreL: { rot: k(0, -48, 0.5, -60, 1, -48) },
      armR: { rot: k(0, 6, 1, 6), sy: k(0, 1.15, 1, 1.15) },
      foreR: { rot: k(0, 6, 1, 6) } }, { hide: ['heldL', 'tallR'] });
    M('recoil', 'Bật ngửa, hai tay văng lệch', 0.3, 0.5, {
      root: { y: k(0, -16, 0.5, -12, 1, -16), sy: k(0, 1.1, 0.5, 1.06, 1, 1.1), sx: k(0, 0.94, 1, 0.94) },
      body: { rot: k(0, -16, 0.5, -13, 1, -16) },
      head: { rot: k(0, -12, 1, -12) },
      armL: { rot: k(0, 118, 0.5, 112, 1, 118), sy: k(0, 1.3, 1, 1.3) },
      foreL: { rot: k(0, 30, 1, 30) },
      armR: { rot: k(0, -62, 0.5, -70, 1, -62), sy: k(0, 1.25, 1, 1.25) },
      foreR: { rot: k(0, -24, 1, -24) },
      thighL: { rot: k(0, 26, 1, 26) },
      shinL: { rot: k(0, -40, 1, -40) } });
    M('chestOut', 'Ưỡn ngực chống nạnh', 1.2, 0.5, {
      root: { sy: k(0, 1.05, 0.5, 1.07, 1, 1.05), sx: k(0, 0.97, 1, 0.97), y: k(0, 0, 0.5, -2, 1, 0) },
      pelvis: { x: k(0, 3, 1, 3) },
      body: { rot: k(0, -6, 0.5, -7, 1, -6) },
      head: { rot: k(0, -10, 0.5, -12, 1, -10) },
      armL: { rot: k(0, 46, 1, 46) },
      foreL: { rot: k(0, -118, 1, -118) },
      armR: { rot: k(0, 58, 0.5, 66, 1, 58) },
      foreR: { rot: k(0, 92, 0.5, 100, 1, 92) } });
    M('scramble', 'Chạy cuống, tay vung luân phiên', 0.36, 0.5, {
      root: { y: k(0, 0, 0.25, -7, 0.5, 0, 0.75, -7, 1, 0) },
      body: { rot: k(0, 14, 0.5, 18, 1, 14) },
      head: { rot: k(0, -14, 0.5, -8, 1, -14) },
      armL: { rot: k(0, 150, 0.5, 40, 1, 150), sy: k(0, 1.25, 1, 1.25) },
      foreL: { rot: k(0, 20, 0.5, -30, 1, 20) },
      armR: { rot: k(0, -40, 0.5, -150, 1, -40), sy: k(0, 1.25, 1, 1.25) },
      foreR: { rot: k(0, 30, 0.5, -20, 1, 30) },
      thighL: { rot: k(0, 0, 0.25, 24, 0.5, 0, 1, 0) },
      thighR: { rot: k(0, 0, 0.5, 0, 0.75, -24, 1, 0) } });
    M('resolve', 'Tấn vững, đấm thẳng tới trước', 0.65, 0.5, {
      root: { sx: k(0, 1.06, 1, 1.06), sy: k(0, 0.97, 0.5, 1, 1, 0.97), y: k(0, 2, 0.5, 0, 1, 2) },
      body: { rot: k(0, 8, 1, 8) },
      head: { rot: k(0, -4, 1, -4) },
      armR: { rot: k(0, -96, 0.5, -104, 1, -96), sy: k(0, 1.35, 0.5, 1.45, 1, 1.35) },
      foreR: { rot: k(0, -12, 1, -12) },
      armL: { rot: k(0, 30, 1, 30) },
      foreL: { rot: k(0, -100, 1, -100) },
      thighL: { rot: k(0, 18, 1, 18) },
      thighR: { rot: k(0, -18, 1, -18) } });
    M('waver', 'Nhún vai nghiêng đầu, lùi nửa người', 1.2, 0.5, {
      root: { y: k(0, 0, 0.5, -3, 1, 0), sy: k(0, 1, 0.5, 0.94, 1, 1) },
      pelvis: { x: k(0, -6, 1, -6) },
      body: { rot: k(0, -13, 0.5, -15, 1, -13) },
      head: { rot: k(0, 14, 0.5, 18, 1, 14) },
      armL: { rot: k(0, 58, 0.5, 70, 1, 58) },
      foreL: { rot: k(0, -78, 0.5, -90, 1, -78) },
      armR: { rot: k(0, -34, 0.5, -46, 1, -34) },
      foreR: { rot: k(0, 70, 0.5, 84, 1, 70) } }, { hide: ['tallR'] });
    M('plead', 'Khuỵu gối chắp tay run', 0.5, 0.5, {
      root: { y: k(0, 10, 0.5, 11, 1, 10), sy: k(0, 0.88, 1, 0.88) },
      body: { rot: k(0, 4, 0.5, 6, 1, 4), sy: k(0, 0.92, 1, 0.92) },
      head: { y: k(0, 6, 1, 6), rot: k(0, 6, 0.5, 4, 1, 6) },
      armL: { rot: k(0, -118, 0.5, -112, 1, -118) },
      foreL: { rot: k(0, -64, 0.5, -70, 1, -64) },
      armR: { rot: k(0, 118, 0.5, 112, 1, 118) },
      foreR: { rot: k(0, 64, 0.5, 70, 1, 64) },
      shinL: { rot: k(0, -22, 1, -22) },
      shinR: { rot: k(0, 22, 1, 22) } }, { hide: ['heldL', 'heldR'] });
    // nói chuyện / lắng nghe (v0.14 "Phim sống"): lời thoại thường không còn đứng trơ — tay khoa theo câu nói, người nghe gật gù
    M('talk', 'Khoa tay khi nói', 1.5, 0.25, { body: { y: k(0, 0, 0.5, -1.2, 1, 0), rot: k(0, -1.5, 0.5, 1.5, 1, -1.5) },
      head: { rot: k(0, -3, 0.25, 2, 0.5, -2, 0.75, 3, 1, -3) },
      armL: { rot: k(0, 8, 0.33, 24, 0.66, 12, 1, 8) }, foreL: { rot: k(0, 10, 0.33, 46, 0.66, 20, 1, 10) },
      armR: { rot: k(0, -10, 0.25, -36, 0.5, -16, 0.75, -42, 1, -10) }, foreR: { rot: k(0, -12, 0.25, -58, 0.5, -22, 0.75, -66, 1, -12) } });
    M('nod', 'Gật gù lắng nghe', 1.6, 0.25, { body: { y: k(0, 0, 0.5, -1, 1, 0) },
      head: { y: k(0, 0, 0.2, 2.5, 0.4, 0, 0.6, 2, 0.8, 0, 1, 0), rot: k(0, 0, 0.2, 3, 0.4, 0, 0.6, 2, 0.8, 0, 1, 0) },
      armL: { rot: k(0, 4, 1, 4) }, armR: { rot: k(0, -4, 1, -4) } });
    M('rest', 'Thả lỏng', 3, 0.25, { armL: { rot: k(0, 8, 0.5, 10, 1, 8) }, armR: { rot: k(0, -8, 0.5, -10, 1, -8) }, head: { rot: k(0, 0, 0.5, 2, 1, 0) } });

    /* ---------------- 18 TRẠNG THÁI = mắt + mày + miệng + hiệu ứng + động tác ---------------- */
    function S(id, label, hint, eyes, brows, mouth, fxs, motion) { D.state(id, { label: label, hint: hint, eyes: eyes, brows: brows, mouth: mouth, fx: fxs, motion: motion }); }
    S('normal', 'Bình thường', 'rảnh hoặc làm việc êm', 'normal', 'neutral', 'smile', [], 'idle');
    S('work', 'Đang làm', 'đang tập trung làm việc', 'focus', 'determined', 'tongueOut', ['sweat'], 'grind');
    S('think', 'Suy tư ông cụ non', 'đang nghĩ, phân vân', 'lookUp', 'think', 'flat', ['dots'], 'ponder');
    S('unsure', 'Nói không chắc', 'trả lời mà không chắc chắn', 'lookSide', 'worried', 'wavy', ['sweat', 'question'], 'waver');
    S('smug', 'Cười đê tiện', 'thắng kèo, mưu vừa thành, khoái chí', 'smug', 'smug', 'grin', ['blush', 'sparkles'], 'gloat');
    S('greedy', 'Tham tiền', 'nhận thưởng, thấy tiền', 'money', 'raised', 'drool', ['coins', 'blush'], 'covet');
    S('proud', 'Lên #1', 'đứng đầu bảng, chiến thắng', 'happy', 'raised', 'laugh', ['crown', 'confetti'], 'chestOut');
    S('vow', 'Hứa quyết tâm', 'nhận việc lớn, thề chạy deadline', 'fierce', 'determined', 'shout', ['aura', 'sparkles'], 'resolve');
    S('beg', 'Van xin năn nỉ', 'chờ duyệt, xin thêm quota, xin tha', 'teary', 'sad', 'wavy', ['sweat', 'sparkles'], 'plead');
    S('shock', 'Kinh ngạc', 'tin sét đánh, kết quả bất ngờ', 'wide', 'raised', 'oBig', ['speed', 'sweat', 'gloomLines', 'exclaim'], 'recoil');
    S('panic', 'Hoảng loạn', 'sự cố, đổi công cụ gấp', 'wide', 'raised', 'shout', ['sweatMany', 'speed', 'exclaim'], 'scramble');
    S('rage', 'Nổi trận lôi đình', 'bị chơi xấu, bị cướp công', 'angry', 'angry', 'shout', ['vein', 'fire', 'steam'], 'fury');
    S('dizzy', 'Choáng váng (lỗi)', 'gặp lỗi, đầu óc quay cuồng', 'spiral', 'sad', 'wavy', ['stars', 'sweat'], 'reel');
    S('cry', 'Khóc thê thảm', 'bị phạt, thua lỗ, mất đồ', 'shut', 'sad', 'wail', ['tears', 'gloom'], 'weep');
    S('injured', 'Nghỉ dưỡng thương', 'kiệt quỹ, đang hồi phục', 'half', 'sad', 'wavy', ['bandage', 'gloomLines'], 'nurse');
    S('exhausted', 'Hết quota', 'cạn sức, hồn lìa khỏi xác', 'empty', 'sad', 'oSmall', ['soul', 'gloomLines'], 'collapse');
    S('lazy', 'Rảnh rỗi lười', 'không có việc, nằm ườn', 'half', 'neutral', 'cat', ['gum'], 'loaf');
    S('sleep', 'Ngủ say', 'ngoài giờ, không có việc', 'closed', 'neutral', 'oSmall', ['zzz', 'snot'], 'nodOff');


    /* ---------------- HOẠT ĐỘNG: tổ hợp đặt tên sẵn (agent gọi theo tên; vẫn ghép tự do được) ---------------- */
    function A(id, group, label, hint, def) { def.label = label; def.group = group; def.hint = hint; D.activity(id, def); }
    A('stand', 'Tư thế', 'Đứng', 'đứng yên', { posture: 'stand' });
    A('sit-chair', 'Tư thế', 'Ngồi ghế', 'ngồi chờ, ngồi nghe', { posture: 'sit-chair', action: 'rest' });
    A('sit-floor', 'Tư thế', 'Ngồi xếp bằng', 'ngồi thiền, ngồi bệt', { posture: 'sit-floor', action: 'rest' });
    A('kneel', 'Tư thế', 'Quỳ', 'quỳ chờ lệnh', { posture: 'kneel', action: 'rest' });
    A('squat', 'Tư thế', 'Ngồi xổm', 'ngồi xổm quan sát', { posture: 'squat', action: 'rest' });
    A('lie', 'Tư thế', 'Nằm nghỉ', 'nằm nghỉ, nằm ườn', { posture: 'lie', action: 'rest', state: 'lazy' });
    A('walk', 'Di chuyển', 'Đi bộ', 'đi lại, đi tới', { move: 'walk' });
    A('run', 'Di chuyển', 'Chạy', 'chạy nhanh, gấp gáp', { move: 'run', state: 'vow' });
    A('sneak', 'Di chuyển', 'Rón rén', 'lén lút, trinh sát', { posture: 'squat', move: 'sneak', state: 'smug' });
    A('jump', 'Di chuyển', 'Nhảy', 'nhảy cẫng, nhảy qua', { move: 'hop', face: { eyes: 'happy', mouth: 'laugh' }, state: 'normal' });
    A('crawl', 'Di chuyển', 'Bò', 'bò qua chỗ hẹp, bò lết', { posture: 'crawl', move: 'crawl', state: 'work' });
    A('fly', 'Di chuyển', 'Bay', 'bay lượn, khinh công', { posture: 'fly', move: 'fly', state: 'vow' });
    A('swim', 'Di chuyển', 'Bơi', 'bơi qua sông', { posture: 'swim', move: 'swim', state: 'work' });
    A('flee', 'Di chuyển', 'Bỏ chạy', 'tháo chạy, chạy trốn', { move: 'run', action: 'flail', state: 'panic' });
    A('eat', 'Sinh hoạt', 'Ăn cơm', 'ăn uống, liên hoan', { posture: 'sit-floor', action: 'eat', face: { mouth: 'chew' }, state: 'normal' });
    A('drink', 'Sinh hoạt', 'Uống trà', 'uống trà, uống rượu', { posture: 'sit-chair', action: 'drink', state: 'normal' });
    A('sleep', 'Sinh hoạt', 'Ngủ', 'ngủ đêm, ngủ trưa', { posture: 'lie', action: 'rest', props: ['blanket'], state: 'sleep' });
    A('study', 'Sinh hoạt', 'Đọc sách', 'học, đọc binh thư', { posture: 'sit-floor', action: 'read', state: 'think' });
    A('write', 'Sinh hoạt', 'Viết', 'viết thư, soạn kế, làm việc giấy tờ', { posture: 'sit-floor', action: 'write', props: ['desk'], state: 'work' });
    A('attack', 'Chiến đấu', 'Tấn công (chém)', 'xông vào chém', { posture: 'stance', action: 'slash', state: 'rage' });
    A('thrust', 'Chiến đấu', 'Đâm giáo', 'đâm thương, đâm giáo', { posture: 'stance', action: 'thrust', state: 'vow' });
    A('defend', 'Chiến đấu', 'Phòng thủ', 'đỡ đòn, chống đỡ', { posture: 'squat', action: 'block', state: 'work' });
    A('charge', 'Chiến đấu', 'Xông lên', 'xung phong', { move: 'run', action: 'spearRaise', state: 'vow' });
    A('victory', 'Chiến đấu', 'Ăn mừng', 'thắng trận', { move: 'hop', action: 'cheer', state: 'proud' });
    A('scared', 'Cảm xúc', 'Sợ hãi', 'sợ run, co rúm', { posture: 'cower', move: 'tremble', action: 'coverHead', state: 'panic' });
    A('faint', 'Cảm xúc', 'Ngất xỉu', 'ngã lăn ra, choáng', { posture: 'lie', action: 'rest', state: 'dizzy' });
    A('bow', 'Giao tiếp', 'Cúi chào', 'chào hỏi, cảm ơn', { action: 'bow', state: 'normal' });
    A('salute', 'Giao tiếp', 'Ôm quyền thi lễ', 'bái kiến, nhận lệnh', { action: 'salute', state: 'vow' });
    A('kowtow', 'Giao tiếp', 'Quỳ lạy', 'xin tha, cầu xin', { posture: 'kneel', action: 'kowtow', state: 'beg' });
    A('wave', 'Giao tiếp', 'Vẫy chào', 'chào, gọi', { action: 'wave', state: 'normal' });
    A('point', 'Giao tiếp', 'Chỉ tay ra lệnh', 'ra lệnh, chỉ hướng', { posture: 'stance', action: 'point', state: 'vow' });
    A('cheer', 'Giao tiếp', 'Cổ vũ', 'reo hò, cổ vũ', { move: 'bounce', action: 'cheer', state: 'proud' });

    /* ---------------- TRAIT: hành vi đi theo BỘ PHẬN ---------------- */
    D.trait({ id: 'bulge-eyes', label: 'Mắt ốc → hét to hơn', if: { eyes: ['bulge'] }, over: { rage: { fxAdd: ['exclaim'] }, vow: { fxAdd: ['exclaim'] } } });

    /* ---------------- HỒ SƠ ÁNH XẠ cho ứng dụng dùng asset ---------------- */
    D.profile('gen-agents', {
      label: 'Gen-Agents (16 trạng thái Role)',
      map: [
        ['Lỗi', 'dizzy'], ['Đổi CLI', 'panic'], ['Bị phạt', 'cry'], ['Hết quota', 'exhausted'], ['Nghỉ dưỡng thương', 'injured'],
        ['Chờ duyệt', 'beg'], ['Kinh ngạc', 'shock'], ['Lên #1', 'proud'], ['Nhận thưởng', 'greedy'], ['Hứa quyết tâm', 'vow'],
        ['Nói không chắc', 'unsure'], ['Suy tư', 'think'], ['Đang làm', 'work'], ['Rảnh', 'lazy'], ['Ngủ', 'sleep'], ['Bình thường', 'normal']
      ]
    });
  });
})(window.GenChibi);
