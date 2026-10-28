// © 2026 Gen Labs — All rights reserved.
// Gói T (SPEC-0.2.0 §5.5): ảnh bìa trên trang sân khấu. Nạp SAU still.js, brand.js.
//   GSThumb.render(spec) — dựng DOM TĨNH 1920×1080 (khung 1280×720 phóng 1,5): nền brand, mặt chính (ảnh chủ kênh <img> hoặc KOL Gen-Chibi), sidekick, một hình chủ đạo
//                          (khối của beat ở trạng thái đã lắng, hoặc một asset), tiêu đề tự co trong hộp (không nhỏ hơn font_px_min), nhãn phụ, dấu kênh.
//                          Trả bbox từng phần (toạ độ 1280) + cỡ chữ thật + số dòng + độ cao đầu — render/thumb.js evaluateVariant đo T1–T11 từ đó.
//   GSThumb.textOff()    — ẩn lớp chữ (tiêu đề + nhãn phụ) để Node đo tương phản bằng hiệu hai ảnh (SPEC §5.5). GSStill.thumb(spec) hiểu spec.textOff === true: bố cục GIỮ NGUYÊN, chỉ ẩn chữ.
// Tất định (F3-5): không ngẫu nhiên, không đồng hồ; nhân vật vẽ ở t = 0,9 s, khối ở trạng thái lắng. Ngân sách (L-42): 1 mặt chính + ≤ 1 sidekick + 1 khối + chữ (≤ 2 actor).
(function () {
  'use strict';
  var GS = window.GSStill = window.GSStill || {};
  var W = 1280, H = 720, SC = 1.5, CHAR_T = 0.9;
  var lastAssets = {};   // assetData của plan đã __load (renderPlan dựng ảnh bìa trong CÙNG phiên, spec không mang theo dữ liệu asset)

  // bắt assetData khi sân khấu nạp plan (không sửa stage.js)
  if (typeof window.__load === 'function' && !window.__load._thumbWrapped) {
    var orig = window.__load;
    window.__load = function (plan) { lastAssets = (plan && plan.assetData) || {}; return orig.apply(this, arguments); };
    window.__load._thumbWrapped = true;
  }

  var CSS = [
    '.th-root{position:absolute;left:0;top:0;width:1280px;height:720px;transform:scale(1.5);transform-origin:0 0;overflow:hidden;font-family:var(--f-display,"Be Vietnam Pro","Inter","Noto Sans","DejaVu Sans",sans-serif)}',
    '.th-abs{position:absolute;box-sizing:border-box}',
    '.th-headline{display:flex;flex-direction:column;justify-content:center}',
    '.th-fit{font-weight:900;line-height:1.02;letter-spacing:-.025em;width:100%}',
    '.th-w{display:inline-block;white-space:pre}',
    '.th-kick{display:inline-block;font-weight:900;font-size:30px;line-height:1.15;letter-spacing:.04em;text-transform:uppercase;padding:4px 16px;border-radius:10px;white-space:nowrap;transform:rotate(-1.5deg)}',
    '.th-fig{position:absolute;left:0;top:0;width:100%;height:100%;overflow:hidden}',
    '.th-sticker{filter:drop-shadow(5px 0 0 #fff) drop-shadow(-5px 0 0 #fff) drop-shadow(0 5px 0 #fff) drop-shadow(0 -5px 0 #fff) drop-shadow(0 14px 16px rgba(0,0,0,.38))}',
    '.th-card{background:#fff;border:6px solid #fff;border-radius:18px;box-shadow:0 12px 26px rgba(0,0,0,.45);overflow:hidden}',
    '.th-ph{border:5px dashed currentColor;border-radius:20px;display:flex;flex-direction:column;align-items:center;justify-content:center;font-weight:900;text-align:center}',
    '.th-brand{display:flex;align-items:center;justify-content:center}',
    '.th-bname{display:block;max-width:100%;padding:8px 14px;border-radius:12px;font-weight:900;font-size:26px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;letter-spacing:-.01em}'
  ].join('\n');
  function ensureCss() {
    if (document.getElementById('gs-thumb-css')) return;
    var s = document.createElement('style'); s.id = 'gs-thumb-css'; s.textContent = CSS; document.head.appendChild(s);
  }
  function el(tag, cls, css) { var e = document.createElement(tag); if (cls) e.className = cls; if (css) e.style.cssText = css; return e; }
  function px(b) { return 'left:' + b.x + 'px;top:' + b.y + 'px;width:' + b.w + 'px;height:' + b.h + 'px;'; }
  function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  function rectOf(e) {   // bbox trong toạ độ 1280 (root đang phóng SC)
    var r = e.getBoundingClientRect();
    return { x: r.left / SC, y: r.top / SC, w: r.width / SC, h: r.height / SC };
  }
  function union(rs) {
    if (!rs.length) return null;
    var x0 = Math.min.apply(null, rs.map(function (r) { return r.x; })), y0 = Math.min.apply(null, rs.map(function (r) { return r.y; }));
    var x1 = Math.max.apply(null, rs.map(function (r) { return r.x + r.w; })), y1 = Math.max.apply(null, rs.map(function (r) { return r.y + r.h; }));
    return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
  }
  function clipTo(r, box) {   // phần nhìn thấy của r trong hộp (phần tràn mép bị cắt bởi overflow:hidden)
    var x0 = Math.max(r.x, box.x), y0 = Math.max(r.y, box.y), x1 = Math.min(r.x + r.w, box.x + box.w), y1 = Math.min(r.y + r.h, box.y + box.h);
    return { x: x0, y: y0, w: Math.max(0, x1 - x0), h: Math.max(0, y1 - y0) };
  }
  // hình chữ nhật con nằm giữa hộp b sao cho bbox SAU KHI xoay `deg` độ vẫn lọt trong b (T9: lề an toàn tính trên pixel thật)
  function rotFit(b, deg) {
    var a = Math.abs(deg) * Math.PI / 180, c = Math.cos(a), sn = Math.sin(a);
    var k = Math.min(b.w / (b.w * c + b.h * sn), b.h / (b.w * sn + b.h * c)), w = b.w * k, h = b.h * k;
    return { x: b.x + (b.w - w) / 2, y: b.y + (b.h - h) / 2, w: w, h: h };
  }
  function assetUrl(spec, a) {
    var u = (spec.assetData && spec.assetData[a]) || lastAssets[a] || (/^data:/.test(a) ? a : '');
    if (!u) console.error('thumb: không nạp được asset ' + String(a).slice(0, 80));
    return u;
  }

  // ---------- nền ----------
  function starburst(cx, cy, r1, r2, n) {
    var p = [], i, a, r;
    for (i = 0; i < n * 2; i++) { a = Math.PI * i / n; r = i % 2 ? r2 : r1; p.push((cx + Math.cos(a) * r).toFixed(1) + ',' + (cy + Math.sin(a) * r).toFixed(1)); }
    return p.join(' ');
  }
  function drawBg(root, spec) {
    var t = spec.template, P = spec.palette, bgc = (t.bg || {}), dark = P.light === false;
    root.style.background = P.bg;
    var pat = bgc.pattern;
    if (pat === 'dots') root.style.backgroundImage = 'radial-gradient(' + P.rule + '33 2.4px, transparent 3px)', root.style.backgroundSize = '26px 26px';
    else if (pat === 'rule') root.style.backgroundImage = 'linear-gradient(' + P.ink + '1c 2px, transparent 2px)', root.style.backgroundSize = '100% 34px';
    var bb = bgc.burst_box || { x: 0, y: 0, w: W, h: H };
    var f = t.boxes.face, cx = f.x + f.w / 2 - bb.x, cy = f.y + f.h * 0.55 - bb.y;
    // tia nắng mờ dần ra rìa hộp burst (không cắt thẳng) + sao nổ sau mặt: hai SVG tĩnh
    var wrap = el('div', 'th-abs', px(bb) + 'overflow:hidden;-webkit-mask-image:radial-gradient(ellipse farthest-side at ' + cx + 'px ' + cy + 'px,#000 35%,transparent 100%);mask-image:radial-gradient(ellipse farthest-side at ' + cx + 'px ' + cy + 'px,#000 35%,transparent 100%);');
    var rays = '', n = 18, i, R = 1200, rc = dark ? '#ffffff' : '#ffffff', ro = dark ? '.12' : '.38';
    for (i = 0; i < n; i++) {
      var a0 = (i * 360 / n) * Math.PI / 180, a1 = a0 + (180 / n) * Math.PI / 180;
      rays += '<path d="M' + cx + ',' + cy + ' L' + (cx + Math.cos(a0) * R).toFixed(1) + ',' + (cy + Math.sin(a0) * R).toFixed(1) + ' L' + (cx + Math.cos(a1) * R).toFixed(1) + ',' + (cy + Math.sin(a1) * R).toFixed(1) + ' Z" fill="' + rc + '" fill-opacity="' + ro + '"/>';
    }
    wrap.innerHTML = '<svg width="' + bb.w + '" height="' + bb.h + '" viewBox="0 0 ' + bb.w + ' ' + bb.h + '">' + rays + '</svg>';
    root.appendChild(wrap);
    // sao nổ ngay sau mặt (nằm gọn trong hộp mặt để không đè chữ)
    var sb = Math.min(f.w, f.h) / 2 * (f.frame ? 1.2 : 0.97), fcx = f.x + f.w / 2, fcy = f.y + f.h * (f.frame ? 0.5 : 0.55);
    var star = el('div', 'th-abs', 'left:0;top:0;width:' + W + 'px;height:' + H + 'px;');
    star.innerHTML = '<svg width="' + W + '" height="' + H + '" viewBox="0 0 ' + W + ' ' + H + '"><polygon points="' + starburst(fcx, fcy, sb, sb * 0.8, 14) + '" fill="' + P.burst + '" stroke="#fff" stroke-width="7" stroke-linejoin="round"/></svg>';
    root.appendChild(star);
    // dải chéo trang trí cạnh dưới (không phải chữ)
    root.appendChild(el('div', 'th-abs', 'left:-40px;bottom:-30px;width:1360px;height:58px;background:' + P.burst + ';transform:rotate(-1.2deg);opacity:.9;'));
  }

  // ---------- nhân vật Gen-Chibi ----------
  function castAsset(spec, cid) {
    var GC = window.GenChibi;
    if (!GC.PACKS['local.my']) GC.pack({ id: 'local.my', name: 'Của tôi', owner: 'Gen Labs', group: 'mine', visibility: 'private', license: '© 2026 Gen Labs' }, function () {});
    (spec.parts || []).forEach(function (p) { var r = GC.registerDataPart('local.my', p); if (r && r.errors && r.errors.length) console.error('part ' + p.id + ': ' + r.errors.join('; ')); });
    var r = JSON.parse(JSON.stringify(spec.cast[cid]));
    r.id = r.id || cid.toLowerCase(); r.kind = r.kind || 'character'; r.version = r.version || 1; r.status = r.status || 'draft'; r.expressions = r.expressions || {}; r.lines = r.lines || {};
    GC.registerAsset('local.my', r);
    var a = GC.ASSETS['local.my/' + r.id];
    if (!a) throw new Error('nhân vật ' + cid + ' không đăng ký được');
    return a;
  }
  // SVG nhân vật có đánh dấu khớp (data-j) để đo ĐẦU thật; dựng giống GC.svgBody nhưng không bóng đổ
  function castSvg(spec, cid, state, view, brand) {
    var GC = window.GenChibi, asset = castAsset(spec, cid);
    var c = GC.compose(asset, state, { motion: 'idle' }), pose = GC.poseAt(asset, c.state, CHAR_T, false), chain = GC.chainTransforms(pose), body = '';
    GC.RIG.layers.forEach(function (l) { if (c.layers[l[0]]) body += '<g data-j="' + l[1] + '" transform="' + chain[l[1]] + '">' + c.layers[l[0]] + '</g>'; });
    var svg = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="' + view.join(' ') + '" preserveAspectRatio="xMidYMax meet" width="100%" height="100%" style="overflow:visible">' + body + '</svg>';
    if (brand && window.GSBrand && window.GSBrand.inkFilter) svg = window.GSBrand.inkFilter(svg, brand);
    return svg;
  }
  // khung nhìn (toạ độ khung xương, chân ở y=228): đầu + vai (mặt chính) / đầu nhỏ (sidekick)
  var VIEW_FACE = [8, -6, 184, 196], VIEW_SIDE = [8, -6, 184, 196], VIEW_SIDE_FRAMED = [-14, -30, 228, 262];
  function headRect(svgEl) {
    var gs = svgEl.querySelectorAll('g[data-j="head"]'), rs = [], i;
    for (i = 0; i < gs.length; i++) { var r = gs[i].getBoundingClientRect(); if (r.width > 0 && r.height > 0) rs.push({ x: r.left / SC, y: r.top / SC, w: r.width / SC, h: r.height / SC }); }
    return union(rs);
  }
  function hasAlpha(img) {
    try {
      var c = document.createElement('canvas'), w = Math.min(96, img.naturalWidth), h = Math.min(96, img.naturalHeight);
      c.width = w; c.height = h; var x = c.getContext('2d'); x.drawImage(img, 0, 0, w, h);
      var d = x.getImageData(0, 0, w, h).data, i;
      for (i = 3; i < d.length; i += 4) if (d[i] < 250) return true;
      return false;
    } catch (e) { return null; }
  }

  function drawFace(root, spec, M) {
    var b = spec.template.boxes.face, P = spec.palette, f = spec.face, host = el('div', 'th-abs', px(b));
    var frame = b.frame;
    if (frame) {   // khung bo/tròn: viền dày + nền tia nắng, mặt neo đáy trong khung
      var d = Math.min(b.w, b.h), fx = b.x + (b.w - (frame === 'circle' ? d : b.w)) / 2, fy = b.y + (b.h - (frame === 'circle' ? d : b.h)) / 2;
      host.style.cssText = px({ x: fx, y: fy, w: frame === 'circle' ? d : b.w, h: frame === 'circle' ? d : b.h }) + 'border:10px solid #fff;box-shadow:0 14px 30px rgba(0,0,0,.45);overflow:hidden;background:' + P.burst + ';border-radius:' + (frame === 'circle' ? '50%' : '34px') + ';';
    } else host.style.overflow = 'hidden';
    root.appendChild(host);
    var fig = el('div', 'th-fig'); host.appendChild(fig);
    var vis;   // phần nhìn thấy
    if (f.kind === 'owner') {
      var img = el('img', 'th-sticker', 'position:absolute;left:0;bottom:0;width:100%;height:100%;object-fit:contain;object-position:center bottom;');
      img.src = assetUrl(spec, f.asset); fig.appendChild(img);
      M.pending.push(img.decode ? img.decode().catch(function () { console.error('thumb: ảnh mặt không giải mã được'); }) : Promise.resolve());
      M.after.push(function () {
        var nw = img.naturalWidth, nh = img.naturalHeight, hb = rectOf(host), bw = hb.w - (frame ? 20 : 0), bh = hb.h - (frame ? 20 : 0);
        var s = Math.min(bw / nw, bh / nh), rw = nw * s, rh = nh * s;
        M.face = { kind: 'owner', x: hb.x + (hb.w - rw) / 2, y: hb.y + hb.h - (frame ? 10 : 0) - rh, w: rw, h: rh, head_h: rh, alpha: hasAlpha(img), mood: f.mood, frame: frame || null };
      });
    } else if (f.kind === 'cast') {
      fig.innerHTML = castSvg(spec, f.cast, f.state, VIEW_FACE, spec.brand.data);
      fig.firstChild.classList.add('th-sticker');
      M.after.push(function () {
        var hb = rectOf(host), hr = headRect(fig.firstChild), vr = rectOf(fig.firstChild), cl = clipTo(vr, hb);
        M.face = { kind: 'cast', x: cl.x, y: cl.y, w: cl.w, h: cl.h, head_h: hr ? clipTo(hr, hb).h : cl.h * 0.5, alpha: true, mood: f.mood, frame: frame || null, cast: f.cast };
      });
    } else {   // khung giữ chỗ có nhãn (không qua G-THUMB)
      var ph = el('div', 'th-ph th-abs', 'left:14px;top:14px;right:14px;bottom:14px;color:' + P.ink + ';background:rgba(255,255,255,.92);font-size:34px;line-height:1.15;');
      ph.innerHTML = '<svg width="150" height="150" viewBox="0 0 100 100"><circle cx="50" cy="34" r="20" fill="currentColor" opacity=".55"/><path d="M12 98c0-26 17-40 38-40s38 14 38 40z" fill="currentColor" opacity=".55"/></svg><div>' + esc(f.label || 'ẢNH MẶT CHỦ KÊNH') + '</div>';
      fig.appendChild(ph);
      M.after.push(function () { var hb = rectOf(host); M.face = { kind: 'placeholder', x: hb.x, y: hb.y, w: hb.w, h: hb.h, head_h: hb.h * 0.7, alpha: null, mood: f.mood }; });
    }
  }
  function drawSidekick(root, spec, M) {
    var sk = spec.sidekick; if (!sk) return;
    var b = spec.template.boxes.sidekick, P = spec.palette, frame = b.frame, d = Math.min(b.w, b.h);
    var fb = frame === 'circle' ? { x: b.x + (b.w - d) / 2, y: b.y + (b.h - d) / 2, w: d, h: d } : b;   // khung tròn nằm giữa hộp
    var host = el('div', 'th-abs', px(fb) + 'overflow:hidden;' + (frame ? 'border:7px solid #fff;box-shadow:0 10px 22px rgba(0,0,0,.45);background:' + P.burst + ';border-radius:' + (frame === 'circle' ? '50%' : '24px') + ';' : ''));
    var fig = el('div', 'th-fig');
    host.appendChild(fig); root.appendChild(host);
    fig.innerHTML = castSvg(spec, sk.cast, sk.state, frame ? VIEW_SIDE_FRAMED : VIEW_SIDE, spec.brand.data);
    fig.firstChild.classList.add('th-sticker');
    M.after.push(function () {
      var hb = rectOf(host), hr = headRect(fig.firstChild), cl = clipTo(rectOf(fig.firstChild), hb);
      M.sidekick = { x: hb.x, y: hb.y, w: hb.w, h: hb.h, head_h: hr ? clipTo(hr, hb).h : cl.h * 0.5, mood: sk.mood, cast: sk.cast, frame: frame || null };
    });
  }

  // ---------- hình chủ đạo ----------
  function drawVisual(root, spec, M) {
    var v = spec.visual; if (!v) return;
    var b = spec.template.boxes.visual, P = spec.palette;
    var cb = rotFit(b, 2.5), card = el('div', 'th-abs th-card', px(cb) + 'transform:rotate(-2.5deg);');
    root.appendChild(card);
    var iw = cb.w - 12, ih = cb.h - 12;   // trong viền
    if (v.kind === 'asset') {
      var img = el('img', '', 'width:100%;height:100%;object-fit:contain;display:block;background:' + P.paper + ';');
      img.src = assetUrl(spec, v.asset); card.appendChild(img);
      M.pending.push(img.decode ? img.decode().catch(function () { console.error('thumb: hình chủ đạo không giải mã được'); }) : Promise.resolve());
    } else {
      var Bk = window.GSBlocks, def = Bk && Bk.get(v.block);
      if (!def) throw new Error('khối "' + v.block + '" không có trên sân khấu');
      var pad = 50, ww = v.w + 2 * pad, wh = v.h + 2 * pad;   // lề quanh khung khối (chip/dấu/bóng có thể nhô ra khỏi footprint)
      var s = Math.min(iw / ww, ih / wh), clip = el('div', '', 'position:absolute;inset:0;overflow:hidden;background:' + P.paper + ';');
      var world = el('div', 'world', 'left:' + ((iw - ww * s) / 2) + 'px;top:' + ((ih - wh * s) / 2) + 'px;width:' + ww + 'px;height:' + wh + 'px;transform:scale(' + s + ');transform-origin:0 0;');
      clip.appendChild(world); card.appendChild(clip);
      var peak = def.peak || 0, tSettle = def.settle !== undefined ? def.settle + 0.2 : peak + 1.5;
      var beat = { id: v.beat, block: v.block, params: v.params, slot: { x: pad, y: pad, w: v.w, h: v.h }, t_in: 0, peak_ms: peak * 1000 };
      var ctx = { beat: beat, slot: beat.slot, plan: { beats: [beat], style: { zones: [], world: { w: ww, h: wh }, brand: null } }, chain: [{ beat: beat, params: v.params, t: 0, peak: peak }], peak: peak,
        terms: [], zones: [], world: world, hud: clip, assetUrl: function (a) { return assetUrl(spec, a); }, layers: { full: clip, track: clip, hud: clip, pip: clip } };
      var node = def.mount(world, v.params, ctx);
      if (def.draw) def.draw(node, tSettle, ctx);
      var imgs = [].slice.call(world.querySelectorAll('img')); imgs.forEach(function (i) { if (i.decode) M.pending.push(i.decode().catch(function () { console.error('thumb: ảnh trong khối không giải mã được'); })); });
    }
    M.after.push(function () { var r = rectOf(card); M.visual = { kind: v.kind, x: r.x, y: r.y, w: r.w, h: r.h, block: v.block || null }; });
  }

  // ---------- chữ ----------
  function drawHeadline(root, spec, M) {
    var hb = spec.template.boxes.headline, P = spec.palette;
    var box = el('div', 'th-abs th-headline th-text', px(hb) + 'text-align:' + (hb.align || 'left') + ';');
    var fit = el('div', 'th-fit'); box.appendChild(fit); root.appendChild(box);
    var words = spec.headline.split(/\s+/).filter(Boolean), hl = (spec.highlight || '').toLowerCase().replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, '');
    var spans = words.map(function (w, i) {
      var s = el('span', 'th-w'), isHl = hl && w.toLowerCase().replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, '') === hl;
      s.textContent = w; fit.appendChild(s); fit.appendChild(document.createTextNode(i < words.length - 1 ? ' ' : ''));
      s.style.color = isHl ? (P.hlMode === 'plate' ? P.bg : P.hl) : P.text;
      if (isHl && P.hlMode === 'plate') { s.style.background = P.hlPlate; s.style.padding = '0 .14em'; s.style.borderRadius = '.12em'; }
      if (P.light === false) s.style.textShadow = '0 6px 0 ' + P.shadow;   // bóng đặc chỉ trên nền tối (trên nền sáng sẽ kéo tương phản đo được xuống)
      return s;
    });
    var fmin = hb.font_px_min, fmax = hb.font_px_max || fmin, lmax = hb.lines_max || 2, fs = fmin, ok = false;
    // co chữ từ fmax xuống fmin (bước 2 px) tới khi vừa hộp: ≤ lines_max dòng, không tràn cao/rộng; không vừa ở fmin ⇒ overflow (G-THUMB T3 bắt)
    function refit() {
      ok = false;
      for (fs = fmax; fs >= fmin; fs -= 2) {
        fit.style.fontSize = fs + 'px';
        var tops = {}, right = 0;
        spans.forEach(function (s) { var r = rectOf(s); tops[Math.round(r.y / 4)] = 1; right = Math.max(right, r.x + r.w); });
        var fh = rectOf(fit);
        if (Object.keys(tops).length <= lmax && fh.h <= hb.h + 0.5 && right - hb.x <= hb.w + 0.5) { ok = true; break; }
      }
      if (!ok) { fs = fmin; fit.style.fontSize = fs + 'px'; }
    }
    refit(); M.refit.push(refit);
    M.after.push(function () {
      var rs = spans.map(rectOf), u = union(rs), tops = {}; rs.forEach(function (r) { tops[Math.round(r.y / 4)] = 1; });
      var bx = rectOf(box);
      M.headline = { x: u.x, y: u.y, w: u.w, h: u.h, font_px: fs, lines: Object.keys(tops).length, overflow: !ok || u.x + u.w > hb.x + hb.w + 0.5 || u.y + u.h > hb.y + hb.h + 0.5 || u.x < hb.x - 0.5 || u.y < hb.y - 0.5, words: words.length, text: spec.headline, box: { x: bx.x, y: bx.y, w: bx.w, h: bx.h } };
    });
  }
  function drawKicker(root, spec, M) {
    if (!spec.kicker) return;
    var kb = spec.template.boxes.kicker, P = spec.palette;
    var box = el('div', 'th-abs th-text', px(kb) + 'padding:5px 0 0 4px;'), k = el('span', 'th-kick');
    k.textContent = spec.kicker;
    var plate = spec.brand.kicker_style === 'plate';
    k.style.background = plate ? P.kickBg : 'transparent'; k.style.color = plate ? P.kickFg : P.text;
    box.appendChild(k); root.appendChild(box);
    M.after.push(function () { var r = rectOf(k); M.kicker = { x: r.x, y: r.y, w: r.w, h: r.h, overflow: r.x + r.w > kb.x + kb.w + 0.5 || r.h > kb.h + 0.5, words: spec.kicker.split(/\s+/).length }; });
  }
  function drawBrand(root, spec, M) {
    var bb = spec.brand.box, P = spec.palette, box = el('div', 'th-abs th-brand', px(bb));
    root.appendChild(box);
    var target;
    if (spec.brand.logo) {
      var img = el('img', '', 'max-width:100%;max-height:100%;object-fit:contain;display:block;');
      img.src = assetUrl(spec, spec.brand.logo); box.appendChild(img); target = img;
      M.pending.push(img.decode ? img.decode().catch(function () { console.error('thumb: logo không giải mã được'); }) : Promise.resolve());
    } else if (spec.brand.name) {
      var n = el('span', 'th-bname'); n.textContent = spec.brand.name; n.style.background = P.paper; n.style.color = P.ink; box.appendChild(n); target = n;
    } else {   // chưa có tên/logo: dấu hình thoi trung tính (không đặt tên kênh cứng — INT-09)
      var m = el('div', '', 'width:44px;height:44px;'); m.innerHTML = '<svg width="44" height="44" viewBox="0 0 44 44"><rect x="7" y="7" width="30" height="30" rx="6" transform="rotate(45 22 22)" fill="' + P.hlToken + '" stroke="#fff" stroke-width="4"/></svg>'; box.appendChild(m); target = m;
    }
    M.after.push(function () { var r = rectOf(target); M.brand = { x: r.x, y: r.y, w: r.w, h: r.h, corner: spec.brand.corner, kind: spec.brand.logo ? 'logo' : spec.brand.name ? 'text' : 'mark' }; });
  }

  // ---------- chính ----------
  function render(spec) {
    if (!spec || !spec.template || !spec.template.boxes || !spec.palette) throw new Error('payload không phải đặc tả ảnh bìa đã phân giải (cần template, palette, face…): dùng render/thumb.js resolveThumbs hoặc tool preview_thumbnail.');
    ensureCss();
    if (spec.fontCss && !document.getElementById('gs-thumb-font')) { var fs0 = document.createElement('style'); fs0.id = 'gs-thumb-font'; fs0.textContent = spec.fontCss; document.head.appendChild(fs0); }
    var stage = document.getElementById('stage'); stage.innerHTML = '';
    var root = el('div', 'th-root'); stage.appendChild(root);
    var M = { pending: [], after: [], refit: [], mode: 'thumb', stub: false, template: spec.template.id, size: [W, H] };
    drawBg(root, spec);
    drawFace(root, spec, M);
    drawSidekick(root, spec, M);
    drawVisual(root, spec, M);
    drawKicker(root, spec, M);
    drawHeadline(root, spec, M);
    drawBrand(root, spec, M);
    var fonts = document.fonts && document.fonts.ready ? document.fonts.ready : Promise.resolve();
    return Promise.all([fonts].concat(M.pending)).then(function () {
      M.refit.forEach(function (fn) { fn(); });   // phông (nếu có @font-face) đã sẵn sàng ⇒ co chữ lại theo bề rộng thật
      M.after.forEach(function (fn) { fn(); });
      delete M.pending; delete M.after; delete M.refit;
      if (spec.textOff) GT.textOff();
      return M;
    });
  }
  var GT = window.GSThumb = {
    stub: false, render: render,
    textOff: function () { [].slice.call(document.querySelectorAll('.th-text')).forEach(function (e) { e.style.visibility = 'hidden'; }); }
  };
  GS.thumb = function (payload) { return GT.render(payload || {}); };
  GS.thumb.stub = false;
})();
