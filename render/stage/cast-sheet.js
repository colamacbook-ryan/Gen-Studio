// © 2026 Gen Labs — All rights reserved.
// GSStill.cast(payload) → measures | Promise<measures> — chế độ `cast` của renderStill (SPEC-0.2.0 §3.9/§3.10, CNS-120). Gói K sở hữu file này.
// Bảng nhân vật 1920×1080 dựng bằng ĐÚNG trang sân khấu + engine vendor (không harness riêng, §3.4.7): mỗi nhân vật một khối gồm 5 hướng nhìn,
// 16 mood (bảng §3.6, mỗi ô là một tư thế động tác), lời thoại/gag; hàng dưới: bóng xám + bóng đen ở 64/32 px kèm số XOR, hai KOL cạnh nhau trên nền brand,
// mock ảnh bìa (ô ảnh Ryan + KOL sidekick) và mặt cắt 168×94 của chính mock đó.
// payload = { cast:{[id]:công thức}, packs?:[{json, outline}], parts?:[linh kiện → pack local.my], ink?:'#hex' (opts.ink của engine = brand.tokens.ink),
//             outline?:{width,sticker} (mặc định theo gói), brand?:{tokens:{bg,ink,hl}}, title?, subtitle?, mock?:{title, sub},
//             layout?:'sheet'|'solo', solo?:{id, state, director, t, x, scale} }.
//   'solo' = đúng một nhân vật đặt như trên sân khấu (.hud > .actor) để so pixel với khung sân khấu cùng t (F1-9e).
// measures = { mode:'cast', stub:false, chars:[{id,name,views,moods,svg_max}], masks:{'64':{w,h,chars:{[id]:base64 (1 byte/điểm, 0|1)}}, '32':{…}},
//              xor:{'64':0..1,'32':0..1} (cặp đầu — Node đo lại từ masks), crop:{w:168,h:94}, outline }.
// Không có payload.cast ⇒ bản giữ chỗ (stub:true) như P0a. Không dùng `filter` trong SVG nhân vật; chỉ thang xám CSS ở bảng tĩnh.
(function () {
  'use strict';
  var GS = window.GSStill = window.GSStill || {};
  var GC = window.GenChibi;
  var NS_VIEWS = [['front', 'Chính diện', null], ['q45', 'Nghiêng 45°', 'left45'], ['q90', 'Nghiêng 90°', 'left90'], ['q135', 'Sau 135°', 'left135'], ['q180', 'Sau lưng', 'back']];
  // SPEC §3.6: mood → state Gen-Chibi + động tác khi nói (đồng bộ bảng moods.json của gói V; ở đây chỉ để dựng bảng)
  var MOODS = [
    ['neutral', 'Bình thường', 'normal', 'talk', 0.3], ['explain', 'Giải thích', 'normal', 'point', 0.4], ['excited', 'Hào hứng', 'proud', 'fistPump', 0.5], ['shock', 'Sốc', 'shock', 'recoil', 0.4],
    ['think', 'Suy nghĩ', 'think', 'chinHand', 0.5], ['unsure', 'Phân vân', 'unsure', 'shrug', 0.5], ['smug', 'Đắc ý', 'smug', 'gloat', 0.4], ['sad', 'Buồn', 'cry', 'weep', 0.4],
    ['angry', 'Giận', 'rage', 'stomp', 0.4], ['panic', 'Hoảng', 'panic', 'flail', 0.4], ['greedy', 'Tham', 'greedy', 'rubHands', 0.4], ['beg', 'Van xin', 'beg', 'plead', 0.5],
    ['proud', 'Tự hào', 'proud', 'chestOut', 0.5], ['vow', 'Thề', 'vow', 'resolve', 0.5], ['bored', 'Chán', 'lazy', 'slouch', 0.5], ['yell', 'Gào', 'rage', 'fury', 0.4]
  ];
  var FULL = '-26 -34 252 276', BUST = '8 -30 184 180', WIDE_R = 252 / 276;
  var W = 1920, H = 1080;

  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  function el(tag, css, html) { var e = document.createElement(tag); if (css) e.style.cssText = css; if (html !== undefined) e.innerHTML = html; return e; }
  function box(parent, x, y, w, h, css, html) { var e = el('div', 'position:absolute;left:' + x + 'px;top:' + y + 'px;width:' + w + 'px;height:' + h + 'px;' + (css || ''), html); parent.appendChild(e); return e; }
  function setView(svg, vb, extra) { return svg.replace(/viewBox="[^"]*"/, 'viewBox="' + vb + '"').replace('<svg ', '<svg preserveAspectRatio="xMidYMax meet" style="width:100%;height:100%;display:block;overflow:hidden" ' + (extra || '')); }

  // ---- đăng ký gói + công thức (cùng luật với registerCast của stage.js) ----
  function register(payload, castKey) {
    if (!GC.PACKS['local.my']) GC.pack({ id: 'local.my', name: 'Của tôi', owner: 'Gen Labs', group: 'mine', visibility: 'private', license: '© 2026 Gen Labs' }, function () {});
    var errs = [], outlineOf = {};
    (payload.parts || []).forEach(function (p) { var r = GC.registerDataPart('local.my', p); if (r && r.errors && r.errors.length) errs.push('part ' + p.id + ': ' + r.errors.join('; ')); });
    (payload.packs || []).forEach(function (p) {
      var r = GC.registerDataPack(p.json);
      if (r && r.errors && r.errors.length) errs.push('pack ' + (p.json && p.json.id) + ': ' + r.errors.join('; '));
      else if (p.outline) outlineOf[p.json.id] = p.outline;
    });
    var chars = [];
    Object.keys(payload[castKey]).forEach(function (cid) {
      var r = JSON.parse(JSON.stringify(payload[castKey][cid]));
      r.id = r.id || cid.toLowerCase(); r.kind = r.kind || 'character'; r.version = r.version || 1; r.status = r.status || 'draft'; r.expressions = r.expressions || {}; r.lines = r.lines || {};
      GC.registerAsset('local.my', r);
      var asset = GC.ASSETS['local.my/' + r.id];
      if (!asset) { errs.push('nhân vật ' + cid + ' không đăng ký được'); return; }
      var outline = payload.outline === undefined ? null : payload.outline, parts = (r.look && r.look.parts) || {};
      if (payload.outline === undefined) for (var s in parts) { var o = outlineOf[String(parts[s]).split('/')[0]]; if (o) { outline = o; break; } }
      chars.push({ key: cid, id: r.id, recipe: r, asset: asset, outline: outline });
    });
    if (errs.length) throw new Error(errs.join(' | '));
    return chars;
  }
  function svgOf(c, state, director, t, payload, extra) {
    var o = { t: t || 0, director: director || {}, noShadow: true };
    if (c.outline) { o.outline = c.outline; var ink = payload.ink || (payload.brand && payload.brand.tokens && payload.brand.tokens.ink); if (ink) o.ink = ink; }
    if (extra) for (var k in extra) o[k] = extra[k];
    return GC.svgString(c.asset, state || 'normal', o);
  }

  // ---- bóng: raster hoá SVG → mặt nạ 0|1 (supersample ×4), tính XOR ----
  var SS = 4;
  function raster(svg, w, h) {
    return new Promise(function (resolve, reject) {
      var s = svg.replace(/viewBox="[^"]*"/, 'viewBox="' + FULL + '"').replace(/<svg /, '<svg width="' + w * SS + '" height="' + h * SS + '" preserveAspectRatio="xMidYMax meet" ');
      var img = new Image();
      img.onload = function () {
        var cv = document.createElement('canvas'); cv.width = w * SS; cv.height = h * SS;
        var cx = cv.getContext('2d'); cx.drawImage(img, 0, 0, w * SS, h * SS);
        var d = cx.getImageData(0, 0, w * SS, h * SS).data, m = new Uint8Array(w * h), y, x, a, i, j;
        for (y = 0; y < h; y++) for (x = 0; x < w; x++) {
          a = 0; for (j = 0; j < SS; j++) for (i = 0; i < SS; i++) a += d[((y * SS + j) * w * SS + x * SS + i) * 4 + 3];
          m[y * w + x] = a / (SS * SS * 255) >= 0.5 ? 1 : 0;
        }
        resolve(m);
      };
      img.onerror = function () { reject(new Error('không raster hoá được SVG nhân vật')); };
      img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
    });
  }
  function b64(u8) { var s = ''; for (var i = 0; i < u8.length; i += 0x8000) s += String.fromCharCode.apply(null, u8.subarray(i, i + 0x8000)); return btoa(s); }
  function xorOf(a, b) { var x = 0, u = 0; for (var i = 0; i < a.length; i++) { if (a[i] !== b[i]) x++; if (a[i] || b[i]) u++; } return u ? x / u : 0; }
  function maskUrl(m, w, h, rgb) {
    var cv = document.createElement('canvas'); cv.width = w; cv.height = h; var cx = cv.getContext('2d'), im = cx.createImageData(w, h);
    for (var i = 0; i < m.length; i++) { im.data[i * 4] = rgb[0]; im.data[i * 4 + 1] = rgb[1]; im.data[i * 4 + 2] = rgb[2]; im.data[i * 4 + 3] = m[i] ? 255 : 0; }
    cx.putImageData(im, 0, 0); return cv.toDataURL('image/png');
  }
  function overlayUrl(a, b, w, h) {
    var cv = document.createElement('canvas'); cv.width = w; cv.height = h; var cx = cv.getContext('2d'), im = cx.createImageData(w, h);
    for (var i = 0; i < a.length; i++) {
      var c = a[i] && b[i] ? [150, 150, 160] : a[i] ? [230, 60, 80] : b[i] ? [40, 120, 230] : null;
      if (c) { im.data[i * 4] = c[0]; im.data[i * 4 + 1] = c[1]; im.data[i * 4 + 2] = c[2]; im.data[i * 4 + 3] = 255; }
    }
    cx.putImageData(im, 0, 0); return cv.toDataURL('image/png');
  }

  // ---- bảng ----
  function palDots(r) {
    var p = (r.look && r.look.palette) || {}, keys = ['robe', 'accent', 'hair', 'skin'];
    return keys.filter(function (k) { return /^#[0-9a-fA-F]{6}$/.test(p[k] || ''); }).map(function (k) { return '<i style="display:inline-block;width:26px;height:26px;border-radius:50%;margin-left:6px;background:' + p[k] + ';border:3px solid #14121A"></i>'; }).join('');
  }
  function mockThumb(parent, x, y, scale, chars, payload, tk, vb) {
    var host = box(parent, x, y, Math.round(1280 * scale), Math.round(720 * scale), 'overflow:hidden;border-radius:' + Math.round(10 * scale * 3) + 'px');
    var inner = box(host, 0, 0, 1280, 720, 'transform-origin:0 0;transform:scale(' + scale + ');background:' + tk.bg + ';overflow:hidden');
    box(inner, 0, 0, 1280, 720, 'background:linear-gradient(120deg,' + tk.hl + ' 0 38%,transparent 38%)');
    // ô ảnh Ryan (giữ chỗ: khung bo + hình người trung tính; ảnh thật do chủ xưởng đặt khi dựng ảnh bìa, §5)
    var ph = box(inner, 40, 70, 480, 580, 'background:#E7E9F2;border:10px solid ' + tk.ink + ';border-radius:36px;overflow:hidden');
    ph.innerHTML = '<svg viewBox="0 0 100 120" style="width:100%;height:100%;display:block"><circle cx="50" cy="44" r="22" fill="#B9BFD3"/><path d="M12,120 C12,84 30,72 50,72 C70,72 88,84 88,120 Z" fill="#B9BFD3"/></svg>';
    box(ph, 0, 520, 460, 50, 'display:flex;align-items:center;justify-content:center;font:800 34px/1 var(--f-display);color:' + tk.ink + ';letter-spacing:.04em', 'ẢNH RYAN');
    var mock = payload.mock || {};
    box(inner, 560, 50, 690, 200, 'font:900 90px/1.02 var(--f-display);color:' + tk.ink + ';-webkit-text-stroke:0;letter-spacing:-.02em', esc(mock.title || 'TIÊU ĐỀ MẪU'));
    box(inner, 560, 262, 690, 60, 'font:800 42px/1.1 var(--f-display);color:' + tk.ink + ';background:' + tk.hl + ';display:inline-block;padding:6px 18px;border-radius:14px;width:auto', esc(mock.sub || 'phụ đề mẫu'));
    var slots = [[540, 345], [880, 345]];
    chars.slice(0, 2).forEach(function (c, i) {
      box(inner, slots[i][0], slots[i][1], 340, 360, '', setView(svgOf(c, i ? 'proud' : 'smug', { facing: 'right' }, 0.2, payload), vb));
    });
  }
  function cell(parent, x, y, w, h, svg, vb, label, css) {
    var c = box(parent, x, y, w, h, css || '');
    box(c, 0, 0, w, h - (label ? 16 : 0), '', setView(svg, vb));
    if (label) box(c, 0, h - 16, w, 16, 'font:600 12px/16px var(--f-display);text-align:center;color:#14121A;white-space:nowrap', esc(label));
    return c;
  }

  // khung nhìn ôm sát nhân vật: hợp bbox (đơn vị SVG) của mọi nhân vật hiển thị ở tư thế đứng, cùng một khung ⇒ cùng tỉ lệ giữa các hàng
  function fitBoxes(chars, payload, root) {
    var u = null, t = el('div', 'position:absolute;left:-4000px;top:0;width:600px;height:600px'); root.appendChild(t);
    chars.forEach(function (c) {
      t.innerHTML = svgOf(c, 'normal', {}, 0, payload);
      var bb = t.querySelector('svg').getBBox();
      u = u ? { x0: Math.min(u.x0, bb.x), y0: Math.min(u.y0, bb.y), x1: Math.max(u.x1, bb.x + bb.width), y1: Math.max(u.y1, bb.y + bb.height) } : { x0: bb.x, y0: bb.y, x1: bb.x + bb.width, y1: bb.y + bb.height };
    });
    root.removeChild(t);
    var pad = 8, w = u.x1 - u.x0 + 2 * pad, h = u.y1 - u.y0 + 2 * pad;
    // BUST: nửa trên (đầu + vai) — đủ chỗ cho hiệu ứng phía trên đầu
    var bw = Math.max(w * 0.84, (h * 0.58) * (108 / 88));
    return { full: [u.x0 - pad, u.y0 - pad, w, h].join(' '), bust: [(u.x0 + u.x1) / 2 - bw / 2, u.y0 - pad - 4, bw, h * 0.58].join(' ') };
  }

  function sheet(payload, chars, refs, resolve, reject) {
    var root = document.getElementById('stage'); root.innerHTML = '';
    var VB = fitBoxes(chars, payload, root);
    var tk = (payload.brand && payload.brand.tokens) || {}; tk = { bg: tk.bg || '#FFF8E3', ink: tk.ink || '#14121A', hl: tk.hl || '#FFC800' };
    var page = box(root, 0, 0, W, H, 'background:#FFF8E3;color:#14121A;font-family:var(--f-display);overflow:hidden');
    // đầu trang
    box(page, 0, 0, W, 52, 'background:#14121A;color:#fff', '');
    box(page, 20, 0, 1100, 52, 'font:800 28px/52px var(--f-display);color:#fff;letter-spacing:-.01em', esc(payload.title || 'Bảng nhân vật'));
    box(page, 1000, 0, 900, 52, 'font:500 14px/52px var(--f-display);color:#fff;text-align:right;opacity:.85', esc(payload.subtitle || 'Dựng bằng renderStill(mode: cast) · Gen-Chibi ' + (GC.VERSION || '')));
    var metas = [], rowH = 352, y0 = 58;
    chars.forEach(function (c, ci) {
      var y = y0 + ci * rowH, pal = (c.recipe.look && c.recipe.look.palette) || {};
      var blk = box(page, 12, y, W - 24, rowH - 6, 'background:#fff;border:3px solid #14121A;border-radius:18px;overflow:hidden');
      box(blk, 0, 0, 78, rowH - 6, 'background:' + (pal.robe || '#58CC02') + ';color:#fff;display:flex;flex-direction:column;align-items:center;justify-content:center;font:900 20px/1.1 var(--f-display);text-shadow:0 2px 0 rgba(0,0,0,.35)', esc(String(c.recipe.name || c.id).toUpperCase()) + '<small style="font:600 11px/1.2 var(--f-display);margin-top:4px;text-shadow:none">' + esc((c.recipe.persona && c.recipe.persona.role) || '') + '</small>');
      var n = 0;
      NS_VIEWS.forEach(function (v, i) {
        var s = svgOf(c, 'normal', v[2] ? { view: v[2] } : {}, 0, payload); n++;
        cell(blk, 86 + i * 168, 6, 164, 228, s, VB.full, v[1]);
      });
      // chú thích
      var cap = box(blk, 86 + 5 * 168 + 8, 6, W - 24 - (86 + 5 * 168 + 8) - 12, 228, 'font:500 15px/1.35 var(--f-display)');
      var r = c.recipe, g = r.running_gag || {}, id = r.identity || {};
      cap.innerHTML = '<div style="font:900 30px/1.1 var(--f-display)">' + esc(r.name) + '<span style="font:600 15px var(--f-display);margin-left:10px;opacity:.75">' + esc(r.role || '') + '</span><span style="float:right">' + palDots(r) + '</span></div>' +
        '<div style="font:900 26px/1.15 var(--f-display);color:' + (pal.robe || '#58CC02') + ';margin:6px 0 4px">“' + esc((r.catchphrase && r.catchphrase.vi) || '') + '”</div>' +
        '<p style="margin:3px 0"><b>Tính cách:</b> ' + esc(r.persona ? [r.persona.role, r.persona.energy, r.persona.temperament, 'cười ' + r.persona.laugh, 'tật ' + r.persona.tic].join(' · ') : '') + '</p>' +
        '<p style="margin:3px 0"><b>Nhận dạng:</b> ' + esc(id.p1 || '') + '</p>' +
        '<p style="margin:3px 0"><b>Running gag:</b> ' + esc(g.text || '') + (g.max_per_min ? ' (≤ ' + g.max_per_min + '/phút)' : '') + '</p>' +
        '<p style="margin:3px 0"><b>Giọng:</b> ' + esc(r.voice ? r.voice.provider + ' · ' + r.voice.voice : '') + ' — ' + esc((r.voice && r.voice.style) || '') + '</p>';
      // 16 mood
      MOODS.forEach(function (m, i) {
        var s = svgOf(c, m[2], { motion: m[3] }, m[4], payload); n++;
        cell(blk, 86 + i * 111, 238, 108, 104, s, VB.bust, m[1]);
      });
      metas.push({ id: c.id, name: r.name, views: NS_VIEWS.length, moods: MOODS.length });
    });
    // ---- hàng dưới ----
    var by = y0 + 2 * rowH + 2, bh = H - by - 8;
    var sp = box(page, 12, by, 604, bh, 'background:#fff;border:3px solid #14121A;border-radius:18px;overflow:hidden');
    box(sp, 12, 6, 580, 22, 'font:800 15px/22px var(--f-display)', 'Bóng ở 64 px và 32 px · màu · thang xám · bóng đen · chồng XOR');
    var sizes = [64, 32], masks = {}, xor = {}, pending = [];
    sizes.forEach(function (S, si) {
      var w = Math.round(S * WIDE_R), gap = 8, yy = 38 + (si ? 112 : 0), n = chars.length;
      var items = chars.map(function (c) { return { c: c, svg: svgOf(c, 'normal', {}, 0, payload) }; });
      var X = function (slot) { return 12 + slot * (w + gap); };
      items.forEach(function (it, ii) {   // màu · thang xám (CSS grayscale chỉ ở bảng tĩnh; SVG nhân vật không có filter)
        box(sp, X(ii), yy, w, S, '', setView(it.svg, FULL));
        box(sp, X(n + ii), yy, w, S, 'filter:grayscale(1)', setView(it.svg, FULL));
      });
      var more = refs.map(function (c) { return { c: c, svg: svgOf(c, 'normal', {}, 0, payload) }; });   // nhân vật tham chiếu (cast cũ): chỉ đo, không vẽ lên bảng
      pending.push(Promise.all(items.concat(more).map(function (it) { return raster(it.svg, w, S); })).then(function (ms) {
        masks[S] = { w: w, h: S, chars: {} };
        more.forEach(function (it, k) { masks[S].chars[it.c.id] = b64(ms[items.length + k]); });
        items.forEach(function (it, ii) {
          masks[S].chars[it.c.id] = b64(ms[ii]);
          box(sp, X(2 * n + ii), yy, w, S, '', '<img alt="" src="' + maskUrl(ms[ii], w, S, [20, 18, 26]) + '" style="width:' + w + 'px;height:' + S + 'px;display:block">');
        });
        if (ms.length >= 2) {
          var xr = xorOf(ms[0], ms[1]); xor[S] = xr;
          box(sp, X(3 * n), yy, w, S, '', '<img alt="" src="' + overlayUrl(ms[0], ms[1], w, S) + '" style="width:' + w + 'px;height:' + S + 'px;display:block;image-rendering:pixelated">');
          box(sp, X(3 * n + 1) - 2, yy + S - 34, 120, 34, 'font:800 13px/1.25 var(--f-display);color:#14121A', 'XOR<br>' + (xr * 100).toFixed(1) + ' %');
        }
      }));
      box(sp, 12, yy + S + 3, 580, 14, 'font:600 11px/14px var(--f-display);color:#55608F', S + ' px cao · màu · thang xám · bóng đen · chồng (đỏ/xanh = chỉ một người)');
    });
    // hai KOL cạnh nhau trên nền brand
    var duo = box(page, 628, by, 430, bh, 'background:' + tk.bg + ';border:3px solid #14121A;border-radius:18px;overflow:hidden');
    box(duo, 12, 6, 400, 20, 'font:800 15px/20px var(--f-display);color:' + tk.ink, 'Hai KOL cạnh nhau trên nền brand');
    chars.slice(0, 2).forEach(function (c, i) { box(duo, 12 + i * 200, 30, 206, bh - 36, '', setView(svgOf(c, i ? 'smug' : 'normal', i ? { facing: 'left' } : {}, 0.2, payload), VB.full)); });
    // mock ảnh bìa + mặt cắt 168×94
    var mk = box(page, 1070, by, 430, bh, 'background:#fff;border:3px solid #14121A;border-radius:18px;overflow:hidden');
    box(mk, 12, 6, 400, 20, 'font:800 15px/20px var(--f-display)', 'Mock ảnh bìa 1280×720 · ô ảnh Ryan + KOL sidekick');
    mockThumb(mk, 12, 34, 0.31, chars, payload, tk, VB.full);
    var cr = box(page, 1512, by, 396, bh, 'background:#fff;border:3px solid #14121A;border-radius:18px;overflow:hidden');
    box(cr, 12, 6, 370, 20, 'font:800 15px/20px var(--f-display)', 'Mặt cắt 168×94 (ảnh nhỏ trên điện thoại)');
    mockThumb(cr, 12, 34, 168 / 1280, chars, payload, tk, VB.full);
    box(cr, 196, 34, 190, 94, 'font:500 13px/1.35 var(--f-display)', 'Cùng mock ở đúng 168×94 điểm ảnh: phải còn đọc được ai là ai và tiêu đề.');
    box(cr, 12, 140, 372, 60, 'font:500 13px/1.4 var(--f-display)', chars.map(function (c) { var p = (c.recipe.look && c.recipe.look.palette) || {}; return '<b>' + esc(c.recipe.name) + '</b> sắc nhận diện ' + esc(p.robe || '') + ' · viền ' + esc((payload.ink || p.ink || '#2b211d')); }).join('<br>'));
    Promise.all(pending).then(function () {
      var svgMax = 0; root.querySelectorAll('svg').forEach(function (s) { svgMax = Math.max(svgMax, s.outerHTML.length); });
      resolve({ mode: 'cast', stub: false, chars: metas, masks: masks, xor: xor, crop: { w: 168, h: 94 }, moods: MOODS.map(function (m) { return { mood: m[0], state: m[2], motion: m[3] }; }), views: NS_VIEWS.map(function (v) { return v[0]; }), svg_nodes: root.querySelectorAll('svg').length,
        outline: chars.map(function (c) { return !!c.outline; }), version: GC.VERSION });
    }, reject);
  }

  // ---- một nhân vật đặt như trên sân khấu (F1-9e) ----
  function solo(payload, chars) {
    var s = payload.solo || {}, c = chars.filter(function (x) { return x.id === s.id || x.key === s.id; })[0] || chars[0];
    var root = document.getElementById('stage'); root.innerHTML = '';
    var shake = el('div'), hud = el('div'), a = el('div');
    shake.className = 'shake'; hud.className = 'hud'; a.className = 'actor';   // đúng lớp CSS của sân khấu (style.css)
    a.style.left = (typeof s.x === 'number' ? s.x : -40) + 'px';
    a.style.transform = 'translate(0px,' + (s.y || 0) + 'px) scale(' + (s.scale || 1) + ')';
    var svg = svgOf(c, s.state || 'normal', s.director || {}, s.t || 0, payload, { noShadow: false });
    a.innerHTML = svg; hud.appendChild(a); shake.appendChild(hud); root.appendChild(shake);
    return { mode: 'cast', stub: false, layout: 'solo', svg_len: svg.length, svg: a.innerHTML };
  }

  GS.cast = function (payload) {
    payload = payload || {};
    if (!payload.cast || !Object.keys(payload.cast).length) {   // không có nhân vật: giữ chỗ (như P0a)
      var r0 = document.getElementById('stage'); r0.innerHTML = '';
      r0.appendChild(el('div', 'position:absolute;inset:0;display:flex;align-items:center;justify-content:center;font:700 64px sans-serif;color:#1D2A6E;background:#F6F7FC', 'still:cast' + (payload.label ? ' · ' + payload.label : '')));
      return { mode: 'cast', stub: true };
    }
    var chars = register(payload, 'cast'), refs = payload.refs && Object.keys(payload.refs).length ? register(payload, 'refs') : [];
    if (payload.layout === 'solo') return solo(payload, chars);
    return new Promise(function (resolve, reject) { try { sheet(payload, chars, refs, resolve, reject); } catch (e) { reject(e); } });
  };
  GS.cast.stub = false;
  GS.cast.MOODS = MOODS;
})();
