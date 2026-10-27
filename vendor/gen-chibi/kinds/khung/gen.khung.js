/* gen-chibi — BỘ KHUNG CHUẨN gen.khung (Xưởng · giai đoạn ①)
 * © 2026 Gen Labs — All rights reserved.
 * Không chủ đề: ma-nơ-canh đầu trọc không quần áo, vật phẩm và bối cảnh là KHỐI ĐẠI DIỆN (kiểu greybox của làm game).
 * Mỗi khối là quy cách vẽ thành hình: đúng điểm gắn, kích thước, lớp, góc nhìn, tham số. Asset chủ đề sinh ra bằng cách
 * chọn một khung → thêm tham số / chi tiết → qua cổng kiểm. Màu chỉ dùng token để "thay áo" không phải vẽ lại.
 * Quy cách chữ: docs/QUY-CACH-KHUNG.md
 */
(function (GC) {
  'use strict';
  var H = GC.helpers, stroke = H.stroke, shadow = H.shadow, line = H.line, mir = H.mir, res = H.res;
  var SRC = 'gen.khung · khung chuẩn vẽ bằng code';

  GC.pack({
    id: 'gen.khung', aliases: ['afi.khung'], name: 'Bộ khung chuẩn', owner: 'Gen Labs', group: 'frame', visibility: 'private', version: '0.1.0',
    license: '© 2026 Gen Labs — All rights reserved',
    description: 'Khối đại diện cho vật phẩm và bối cảnh, ma-nơ-canh mẫu, sân khấu chuẩn. Không chủ đề.'
  }, function (D) {
    function part(slot, id, label, draw, extra) {
      var p = { slot: slot, id: id, label: label, draw: draw, source: SRC, khung: true };
      for (var x in (extra || {})) p[x] = extra[x];
      D.part(p);
    }
    // đủ 4 dáng góc (45° · ngang · 3/4 sau · sau lưng); thiếu thì rơi về bản gần nhất
    function views(q45, q90, q135, q180) { return { q45: q45, q90: q90, q135: q135, q180: q180 }; }

    /* ================= VẬT PHẨM: khối đại diện theo dáng =================
     * Vật cầm tay neo ở lòng bàn tay (gripR 128,193 · gripL 72,193). Đồ mặc theo đúng lớp của bộ phận. */
    var LEN = { length: { label: 'Độ dài', min: 0.7, max: 1.3, step: 0.01, def: 1, type: 'scaleY', pivot: [128, 193] } };
    part('heldR', 'khoi-que-dai', 'Khối que dài (giáo, thương, gậy, đao cán dài)', function (C) {
      return { heldR: '<rect x="125" y="72" width="6" height="150" rx="3" fill="' + C.P.wood + '"' + stroke(2) + '/>' +
        '<path d="M120,74 L128,52 L136,74 Z" fill="' + C.P.metal + '"' + stroke(2) + '/>' + line('M128,58 L128,72', 1.2, '#fff', 0.5) };
    }, { params: LEN, tall: true, icon: { cx: 146, cy: 120, size: 190, rot: 32 } });
    part('heldR', 'khoi-que-ngan', 'Khối que ngắn (kiếm, dao, bút, gậy ngắn)', function (C) {
      return { heldR: '<g transform="rotate(24 128 193)"><rect x="124.5" y="118" width="7" height="54" rx="1.5" fill="' + C.P.metal + '"' + stroke(2) + '/>' +
        '<rect x="119" y="171" width="18" height="5" rx="2" fill="' + C.P.accent + '"' + stroke(1.8) + '/>' +
        '<rect x="126" y="176" width="4" height="20" rx="1.5" fill="' + C.P.wood + '"' + stroke(1.6) + '/></g>' };
    }, { params: { length: { label: 'Độ dài', min: 0.7, max: 1.4, step: 0.01, def: 1, type: 'scaleY', pivot: [128, 193] } }, tall: true, icon: { cx: 146, cy: 152, size: 120, rot: 21 } });
    var SIZE_L = { size: { label: 'Cỡ', min: 0.7, max: 1.4, step: 0.01, def: 1, type: 'scale', pivot: [72, 193] } };
    part('heldL', 'khoi-dia', 'Khối đĩa dẹt (khiên, quạt, gương)', function (C) {
      return { heldL: '<circle cx="60" cy="182" r="21" fill="' + C.P.metal + '"' + stroke(2.4) + '/>' +
        '<circle cx="60" cy="182" r="13" fill="none" stroke="#000" stroke-opacity=".14" stroke-width="2"/>' + shadow('M60,161 A21,21 0 0 1 60,203 A15,21 0 0 0 60,161 Z', 0.12) };
    }, { params: SIZE_L, icon: { cx: 62, cy: 180, size: 64 } });
    part('heldL', 'khoi-hop', 'Khối hộp (sách, hộp, thư)', function (C) {
      return { heldL: '<rect x="56" y="178" width="26" height="20" rx="2" fill="' + C.P.wood + '"' + stroke(2.2) + '/>' +
        '<path d="M56,183 L82,183" stroke="#000" stroke-opacity=".16" stroke-width="2"/>' };
    }, { params: SIZE_L, icon: { cx: 69, cy: 188, size: 50 } });
    part('heldL', 'khoi-cau', 'Khối cầu (bình, quả, bầu)', function (C) {
      return { heldL: '<circle cx="66" cy="199" r="11" fill="' + C.P.accent + '"' + stroke(2.2) + '/>' +
        '<rect x="62.5" y="183" width="7" height="7" rx="2" fill="' + C.P.wood + '"' + stroke(1.6) + '/>' + '<circle cx="62" cy="195" r="3" fill="#fff" fill-opacity=".4"/>' };
    }, { params: SIZE_L, icon: { cx: 66, cy: 196, size: 42 } });
    var HAT_H = { height: { label: 'Độ cao', min: 0.7, max: 1.4, step: 0.01, def: 1, type: 'scaleY', pivot: [100, 84] } };
    function cap(C, dx) {
      dx = dx || 0;
      return { hat: '<path d="M' + (54 + dx) + ',84 C' + (54 + dx) + ',52 ' + (76 + dx) + ',40 ' + (100 + dx) + ',40 C' + (124 + dx) + ',40 ' + (146 + dx) + ',52 ' + (146 + dx) + ',84 Z" fill="' + C.P.hat + '"' + stroke(2.6) + '/>' +
        '<path d="M' + (50 + dx) + ',82 L' + (150 + dx) + ',82 L' + (150 + dx) + ',90 L' + (50 + dx) + ',90 Z" fill="' + C.P.accent + '"' + stroke(2.2) + '/>' + shadow('M' + (130 + dx) + ',48 C' + (142 + dx) + ',58 ' + (146 + dx) + ',70 ' + (146 + dx) + ',84 L' + (134 + dx) + ',84 Z', 0.12) };
    }
    part('hat', 'khoi-mu', 'Khối đội đầu (mũ, khăn, nón)', function (C) { return cap(C); }, { params: HAT_H, views: views(function (C) { return cap(C, -6); }, function (C) { return cap(C, -8); }, function (C) { return cap(C, 4); }, function (C) { return cap(C, 0); }) });
    function cloth(C) {
      var c = C.P.robe;
      return res({
        body: '<path d="' + H.TORSO_UP + '" fill="' + c + '"' + stroke(3) + '/>' + shadow(H.TORSO_UP_SH, 0.1) +
          '<path d="M68,184 L132,184 L133,194 L67,194 Z" fill="' + C.P.trim + '"' + stroke(2.2) + '/>',
        hem: '<path d="' + H.HEM + '" fill="' + c + '"' + stroke(3) + '/>' + shadow(H.HEM_SH, 0.1)
      }, H.sleeves(C, c, C.P.trim));
    }
    part('outfit', 'khoi-ao', 'Khối khoác thân (áo, giáp, bào)', cloth, { params: { width: { label: 'Độ rộng', min: 0.88, max: 1.18, step: 0.01, def: 1, type: 'scaleX', pivot: [100, 180] } },
      views: views(cloth45, function (C) {
        var o = cloth(C), w = function (x) { return '<g transform="translate(96 0) scale(0.72 1) translate(-100 0)">' + x + '</g>'; };
        o.body = w(o.body); o.hem = w(o.hem); return o;
      }, cloth45, cloth) });
    function cloth45(C) { var o = cloth(C); o.body = o.body.replace(shadow(H.TORSO_UP_SH, 0.1), shadow('M108,146 L124,146 L132.7,194 L112,194 Z', 0.12)); return o; }
    function cape(C, dx) {
      dx = dx || 0;
      return { backItem: '<path d="M' + (76 + dx) + ',150 L' + (124 + dx) + ',150 L' + (148 + dx) + ',222 L' + (52 + dx) + ',222 Z" fill="' + C.P.cape + '"' + stroke(2.6) + '/>' + shadow('M' + (124 + dx) + ',150 L' + (148 + dx) + ',222 L' + (132 + dx) + ',222 Z', 0.15) };
    }
    part('back', 'khoi-choang', 'Khối sau lưng (áo choàng, bao, cánh)', function (C) { return cape(C); }, { views: views(function (C) { return cape(C, 8); }, function (C) {
      return { backItem: '<path d="M106,150 L122,150 L140,222 L112,222 Z" fill="' + C.P.cape + '"' + stroke(2.6) + '/>' };
    }, function (C) { return cape(C, 6); }, function (C) { return cape(C, 0); }) });
    function boots(C) {
      var b = '<rect x="77" y="214" width="21" height="13" rx="5" fill="' + C.P.boots + '"' + stroke(2.4) + '/>';
      return { footL: b, footR: mir(b) };
    }
    function bootsSide(C) {
      var b = '<rect x="75" y="215" width="24" height="12.5" rx="5" fill="' + C.P.boots + '"' + stroke(2.4) + '/>';
      return { footL: b, footR: '<g transform="translate(22 -1)">' + b + '</g>' };
    }
    part('shoes', 'khoi-giay', 'Khối giày (ủng, dép, guốc)', boots, { views: views(bootsSide, bootsSide, bootsSide, boots) });
    function band(C) { return { mask: '<path d="M56,98 C80,92 120,92 144,98 L144,116 C120,111 80,111 56,116 Z" fill="' + C.P.accent + '" fill-opacity=".85"/>' }; }
    part('mask', 'khoi-mat-na', 'Khối che mặt (mặt nạ, băng mắt, sơn mặt)', band, { views: views(mask45, mask45, function () { return null; }, function () { return null; }) });
    function mask45(C) { return { mask: H.face45(C, band(C).mask, true) }; }

    /* ================= NHÂN VẬT KHUNG ================= */
    D.asset({
      id: 'ma-no-canh', code: 'KH-0001', name: 'Ma-nơ-canh', han: '', faction: 'Khung', role: 'Khung chuẩn nhân vật', status: 'published', version: 1,
      persona: 'Ma-nơ-canh trung tính để soát khung: không chủ đề, không trang phục.',
      look: {
        eyes: 'round', brows: 'normal',
        parts: { head: 'gen.core/round', hair: 'gen.core/troc', beard: 'gen.core/none', hat: 'gen.core/none', mask: 'gen.core/none',
          outfit: 'gen.core/than-tran', back: 'gen.core/none', legwear: 'gen.core/chan-tran', shoes: 'gen.core/ban-chan', heldL: 'gen.core/none', heldR: 'gen.core/none' },
        params: {},
        palette: {}   // dùng bảng màu xám mặc định của khung lõi
      },
      expressions: {}, lines: {}, identity: { p1: 'Ma-nơ-canh đầu tròn, mặt trung tính', must: ['head:round'], source: 'Khung chuẩn Gen Labs' }
    });

    /* ================= VẬT PHẨM KHUNG (một khối = một item mẫu) ================= */
    [['khung-vu-khi-dai', 'Khung vũ khí dài', 'weapon', 'heldR', 'khoi-que-dai'],
     ['khung-vu-khi-ngan', 'Khung vũ khí ngắn', 'weapon', 'heldR', 'khoi-que-ngan'],
     ['khung-tay-phu-dia', 'Khung tay phụ dạng đĩa', 'offhand', 'heldL', 'khoi-dia'],
     ['khung-tay-phu-hop', 'Khung tay phụ dạng hộp', 'offhand', 'heldL', 'khoi-hop'],
     ['khung-tay-phu-cau', 'Khung tay phụ dạng cầu', 'offhand', 'heldL', 'khoi-cau'],
     ['khung-doi-dau', 'Khung đội đầu', 'helmet', 'hat', 'khoi-mu'],
     ['khung-khoac-than', 'Khung khoác thân', 'armor', 'outfit', 'khoi-ao'],
     ['khung-sau-lung', 'Khung sau lưng', 'cloak', 'back', 'khoi-choang'],
     ['khung-giay', 'Khung giày', 'boots', 'shoes', 'khoi-giay'],
     ['khung-che-mat', 'Khung che mặt', 'mask', 'mask', 'khoi-mat-na']].forEach(function (x) {
      D.item({ id: x[0], name: x[1], type: x[2], rarity: 'common', status: 'published', equip: { slot: x[3], part: 'gen.khung/' + x[4] },
        description: 'Khối đại diện — gốc để tạo vật phẩm cùng dáng.', icon: {} });
    });

    /* ================= BỐI CẢNH: khối đại diện ================= */
    function S(slot, id, label, draw, extra) { var o = { slot: slot, id: id, label: label, draw: draw, source: SRC, khung: true }; for (var k in extra || {}) o[k] = extra[k]; D.scenery(o); }
    S('sky', 'khung-troi', 'Khung trời', function (C) {
      var P = C.P;
      return '<defs><linearGradient id="gkSky' + C.time + '" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="' + P.sky + '"/><stop offset="1" stop-color="' + P.skyLow + '"/></linearGradient></defs>' +
        '<rect x="0" y="0" width="640" height="360" fill="url(#gkSky' + C.time + ')"/><circle cx="540" cy="70" r="22" fill="' + P.sun + '" stroke="' + C.ink + '" stroke-opacity=".25" stroke-width="2"/>';
    }, { outdoor: true });
    S('sky', 'khung-tuong', 'Khung tường (trong nhà)', function (C) {
      var P = C.P;
      return '<rect x="0" y="0" width="640" height="360" fill="' + P.wall + '"/><rect x="0" y="36" width="640" height="10" fill="' + P.woodDark + '" opacity=".6"/>' +
        '<rect x="420" y="70" width="110" height="90" fill="' + P.sky + '" stroke="' + P.woodDark + '" stroke-width="5"/>';
    }, { outdoor: false });
    S('far', 'khung-chan-troi', 'Khung chân trời', function (C) {
      return '<path d="M0,236 L120,214 L230,230 L360,206 L480,226 L640,212 L640,280 L0,280 Z" fill="' + C.P.hillFar + '"/>';
    });
    S('mid', 'khung-nha', 'Khung công trình (khối nhà)', function (C) {
      var P = C.P;
      return '<ellipse cx="480" cy="294" rx="100" ry="8" fill="#000" opacity=".08"/><rect x="410" y="206" width="140" height="88" fill="' + P.wall + '" stroke="' + C.ink + '" stroke-opacity=".35" stroke-width="2"/>' +
        '<path d="M396,210 L480,160 L564,210 Z" fill="' + P.roof + '" stroke="' + C.ink + '" stroke-opacity=".35" stroke-width="2"/>' +
        '<rect x="466" y="240" width="28" height="54" fill="' + P.woodDark + '" opacity=".7"/>';
    });
    S('ground', 'khung-nen', 'Khung nền đất (lưới tỉ lệ)', function (C) {
      var P = C.P, s = '<rect x="0" y="258" width="640" height="102" fill="' + P.ground + '"/><g stroke="#000" stroke-opacity=".1" stroke-width="1.2">';
      // lưới phối cảnh: đường dọc hội tụ về điểm tụ (320, 200), đường ngang đánh dấu hàng sau (280) và hàng trước (330)
      for (var x = -320; x <= 960; x += 80) s += '<line x1="' + (320 + (x - 320) * 0.36) + '" y1="258" x2="' + x + '" y2="360"/>';
      [266, 280, 300, 330, 360].forEach(function (y) { s += '<line x1="0" y1="' + y + '" x2="640" y2="' + y + '"/>'; });
      return s + '</g><g stroke="' + C.ink + '" stroke-opacity=".28" stroke-width="1.6" stroke-dasharray="6 6"><line x1="0" y1="280" x2="640" y2="280"/><line x1="0" y1="330" x2="640" y2="330"/></g>';
    });
    S('front', 'khung-tien-canh', 'Khung tiền cảnh', function (C) {
      return '<path d="M0,340 L70,326 L120,360 L0,360 Z M640,336 L566,328 L520,360 L640,360 Z" fill="' + C.P.stone + '" stroke="' + C.ink + '" stroke-opacity=".3" stroke-width="2"/>';
    });
    function blk(C, d, fill) { return '<path d="' + d + '" fill="' + fill + '" stroke="' + C.ink + '" stroke-opacity=".35" stroke-width="2"/>'; }
    S('deco', 'khoi-hop', 'Khối hộp (rương, tủ, thùng)', function (C) {
      return '<ellipse cx="0" cy="0" rx="34" ry="5" fill="#000" opacity=".1"/>' + blk(C, 'M-30,0 L-30,-44 L30,-44 L30,0 Z', C.P.wood) + blk(C, 'M-30,-44 L-18,-56 L42,-56 L30,-44 Z', C.P.stone) + blk(C, 'M30,0 L30,-44 L42,-56 L42,-12 Z', C.P.woodDark);
    });
    S('deco', 'khoi-tru', 'Khối trụ (cột, thùng, đèn)', function (C) {
      return '<ellipse cx="0" cy="0" rx="26" ry="6" fill="#000" opacity=".1"/>' + blk(C, 'M-20,0 L-20,-80 A20,6 0 0 1 20,-80 L20,0 A20,6 0 0 1 -20,0 Z', C.P.stone) +
        '<ellipse cx="0" cy="-80" rx="20" ry="6" fill="#fff" fill-opacity=".35" stroke="' + C.ink + '" stroke-opacity=".35" stroke-width="2"/>';
    });
    S('deco', 'khoi-cay', 'Khối cây (thân + tán)', function (C) {
      return '<ellipse cx="0" cy="0" rx="30" ry="5" fill="#000" opacity=".1"/>' + blk(C, 'M-7,0 L-7,-60 L7,-60 L7,0 Z', C.P.woodDark) +
        '<circle cx="0" cy="-96" r="42" fill="' + C.P.leaf + '" stroke="' + C.ink + '" stroke-opacity=".35" stroke-width="2"/>' + '<circle cx="-12" cy="-108" r="12" fill="#fff" fill-opacity=".18"/>';
    });
    S('deco', 'khoi-da', 'Khối đá (đá, bụi, gò)', function (C) {
      return '<ellipse cx="0" cy="0" rx="40" ry="5" fill="#000" opacity=".1"/>' + blk(C, 'M-36,0 Q-38,-30 -8,-34 Q30,-38 36,0 Z', C.P.stone);
    });
    S('deco', 'khoi-ban', 'Khối bàn (bàn, kệ, quầy)', function (C) {
      return '<ellipse cx="0" cy="0" rx="62" ry="6" fill="#000" opacity=".1"/>' + blk(C, 'M-50,0 L-50,-34 L-42,-34 L-42,0 Z M42,0 L42,-34 L50,-34 L50,0 Z', C.P.woodDark) +
        blk(C, 'M-60,-34 L-60,-44 L60,-44 L60,-34 Z', C.P.wood);
    });
    S('deco', 'khoi-co', 'Khối cờ / biển (cờ, biển hiệu, rèm)', function (C) {
      return '<ellipse cx="0" cy="0" rx="14" ry="4" fill="#000" opacity=".1"/>' + blk(C, 'M-3,0 L-3,-150 L3,-150 L3,0 Z', C.P.woodDark) + blk(C, 'M3,-146 L62,-146 L62,-96 L3,-96 Z', C.P.cloth);
    });

    /* ================= CẢNH KHUNG: sân khấu chuẩn ================= */
    var GREY = { sky: '#dfe4e8', skyLow: '#f3f2ee', sun: '#ffffff', cloud: '#ffffff', hillFar: '#cdd0d3', hill: '#bfc3c7', ground: '#d6d2ca',
      grass: '#c9c6bf', path: '#c4beb3', water: '#c3ccd3', stone: '#bdbab4', wood: '#b2aca2', woodDark: '#8b867e', roof: '#a5a9ae',
      wall: '#e4e1db', cloth: '#b7bcc2', leaf: '#b0b5ad', bamboo: '#b0b5ad', flower: '#d8cfc9', light: '#f1e6c8' };
    D.scene({ id: 'san-khau-chuan', name: 'Sân khấu chuẩn', han: '', status: 'published', time: 'day', weather: 'clear', palette: GREY,
      description: 'Bối cảnh khung: trời, chân trời, khối nhà, nền có lưới tỉ lệ, tiền cảnh, các khối đạo cụ. Hai vạch đứt là hàng sau và hàng trước.',
      layers: { sky: 'khung-troi', far: 'khung-chan-troi', mid: { part: 'khung-nha', dx: 20 }, ground: 'khung-nen', front: 'khung-tien-canh' },
      deco: [{ part: 'khoi-cay', x: 70, y: 280 }, { part: 'khoi-hop', x: 150, y: 278, scale: 0.7 }, { part: 'khoi-tru', x: 590, y: 300, z: 'mid', scale: 0.8 }, { part: 'khoi-co', x: 380, y: 272, scale: 0.7 }] });
    D.scene({ id: 'phong-chuan', name: 'Phòng chuẩn (trong nhà)', han: '', status: 'published', time: 'day', weather: 'clear', palette: GREY,
      description: 'Bối cảnh khung trong nhà: tường, cửa sổ, nền có lưới tỉ lệ, khối bàn và khối hộp.',
      layers: { sky: 'khung-tuong', ground: 'khung-nen' },
      deco: [{ part: 'khoi-ban', x: 320, y: 286, scale: 0.9 }, { part: 'khoi-hop', x: 90, y: 290 }, { part: 'khoi-da', x: 560, y: 300, scale: 0.7 }] });
  });
})(window.GenChibi);
