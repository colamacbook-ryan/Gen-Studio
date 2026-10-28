// © 2026 Gen Labs — All rights reserved.
// Bộ nhận diện kênh (SPEC-0.2.0 §4.3–4.5, gói B). Thuần (không DOM, không I/O), chạy cả Node lẫn trình duyệt.
//   normalize(channelData) → brand | null — gộp preset + mặc định + dữ liệu kênh; null ⇒ kênh CHƯA có nhận diện ⇒ giao diện mặc định v0.1.x (plan.style.brand = null),
//     nên bản dựng của kênh cũ giữ nguyên từng điểm ảnh. `style.palette: "paper"` cũ: đúng là giao diện mặc định v0.1.x (cùng bảng màu preset `giay-o-ly`)
//     ⇒ vẫn trả null (đọc thành preset sẽ đổi viền nhân vật sang mực của brand và phá tính "bản cũ không đổi"); muốn nhận diện thật, kênh khai `brand`.
//   Kết quả đã làm sạch (giá trị sai ⇒ rơi về mặc định của preset; check() mới là nơi báo lỗi), kèm `vars` (biến CSS đã tính sẵn để sân khấu chỉ việc đặt) và `hash`.
//   hash(brand) → 16 hex (manifest.brand_hash; đổi brand ⇒ đổi hash; không tính `hash` và `vars`)
//   check(brand) → [{path, text, ratio?, need?}] — lược đồ + tương phản WCAG theo từng token (rỗng = hợp lệ); nhận bản thô (đã gộp patch) hoặc đã chuẩn hoá
//   cssVars(brand) → {'--v-paper': …, '--f-display': …} · PRESETS · FONT_PAIRS · TOKEN_KEYS · contrast(hexA, hexB)
(function (root) {
  'use strict';
  var isNode = typeof module === 'object' && module.exports;
  var isObj = function (v) { return v !== null && typeof v === 'object' && !Array.isArray(v); };
  var HEX = /^#[0-9A-Fa-f]{6}$/;

  var TOKEN_KEYS = ['paper', 'rule', 'rule_strong', 'margin', 'ink', 'ink_soft', 'hl', 'accent', 'accent2', 'leaf', 'card', 'en'];
  var TOKEN_LABELS = { paper: 'nền giấy', rule: 'ô ly mảnh', rule_strong: 'ô ly đậm', margin: 'lề', ink: 'mực', ink_soft: 'mực nhạt', hl: 'nhấn vàng', accent: 'nhấn', accent2: 'nhấn 2', leaf: 'xanh lá', card: 'thẻ', en: 'thuật ngữ' };

  // ---- preset: bảng màu + cặp phông. `giay-o-ly` = đúng giao diện v0.1.x. `tron` không vẽ ô ly (rule/lề trùng nền). ----
  var PRESETS = {
    'giay-o-ly': { label: 'Giấy ô ly', fonts: 'be-vietnam+patrick-hand', tokens: {
      paper: '#F6F7FC', rule: '#DCD8F3', rule_strong: '#B9B0EA', margin: '#F2A7B3', ink: '#1D2A6E', ink_soft: '#55608F',
      hl: '#FFD84A', accent: '#E8A33D', accent2: '#FF6F59', leaf: '#23926A', card: '#FFFFFF', en: '#7A4FD6' } },
    'console': { label: 'Console', fonts: 'plex-sans+plex-mono', tokens: {
      paper: '#F3F5F7', rule: '#DCE1E7', rule_strong: '#B9C2CD', margin: '#9FB4C9', ink: '#101820', ink_soft: '#4A5663',
      hl: '#7FE0B6', accent: '#1F8A70', accent2: '#D6453D', leaf: '#1F7A4D', card: '#FFFFFF', en: '#2F5FD0' } },
    'tron': { label: 'Trơn', fonts: 'be-vietnam+be-vietnam', tokens: {
      paper: '#FFFFFF', rule: '#FFFFFF', rule_strong: '#FFFFFF', margin: '#FFFFFF', ink: '#1A1A1A', ink_soft: '#555555',
      hl: '#FFE066', accent: '#E8A33D', accent2: '#E0533D', leaf: '#2E8B57', card: '#FFFFFF', en: '#6A45C9' } }
  };
  var DEFAULT_PRESET = 'giay-o-ly';

  // ---- phông: chỉ phông đã vendor (OFL) — không nhận phông tải lên ở 0.2.0 (license, Q-11) ----
  var STACKS = {
    'be-vietnam': '"Be Vietnam Pro", "Inter", "Noto Sans", "DejaVu Sans", "Segoe UI", system-ui, sans-serif',
    'patrick-hand': '"Patrick Hand", "Comic Neue", "Comic Sans MS", "Noto Sans", "DejaVu Sans", sans-serif',
    'plex-sans': '"IBM Plex Sans", "Be Vietnam Pro", "Noto Sans", "DejaVu Sans", system-ui, sans-serif',
    'plex-mono': '"IBM Plex Mono", "DejaVu Sans Mono", ui-monospace, monospace'
  };
  // pair = "<phông tiêu đề/nội dung>+<phông chữ tay/ghi chú>"
  var FONT_PAIRS = {
    'be-vietnam+patrick-hand': { label: 'Be Vietnam Pro + Patrick Hand', display: 'be-vietnam', hand: 'patrick-hand' },
    'be-vietnam+plex-mono': { label: 'Be Vietnam Pro + IBM Plex Mono', display: 'be-vietnam', hand: 'plex-mono' },
    'plex-sans+plex-mono': { label: 'IBM Plex Sans + IBM Plex Mono', display: 'plex-sans', hand: 'plex-mono' },
    'be-vietnam+be-vietnam': { label: 'Be Vietnam Pro', display: 'be-vietnam', hand: 'be-vietnam' }
  };

  // ---- lược đồ phần còn lại: enum / số nguyên có biên / bool / chuỗi ----
  var CORNERS = ['tl', 'tr', 'bl', 'br'];
  var SFX = ['none', 'pop', 'swish', 'chime', 'whoosh', 'ta-da', 'slide-up', 'rimshot'];
  var LOGO_SHOW = ['video', 'thumb', 'end_card'];
  var SPEC = {
    logo: { corner: ['enum', CORNERS, 'tr'], size: ['enum', ['s', 'm'], 's'] },
    lower_third: { enabled: ['bool', false], style: ['enum', ['chip', 'bar', 'tag'], 'chip'], when: ['enum', ['first_line_of_speaker'], 'first_line_of_speaker'], duration_ms: ['int', 800, 6000, 2500],
      text: ['str', 60, '{name} · {role}'] },
    subtitle: { size: ['enum', ['s', 'm', 'l'], 'm'], plate: ['enum', ['none', 'card'], 'none'], max_chars_line: ['int', 20, 60, 42], position: ['enum', ['bottom', 'top'], 'bottom'] },
    intro: { enabled: ['bool', false], kind: ['enum', ['none', 'logo-pop', 'title-wipe'], 'none'], duration_ms: ['int', 300, 3000, 1800], sfx: ['enum', SFX, 'pop'] },
    outro: { kind: ['enum', ['end-card'], 'end-card'], hold_ms: ['int', 1000, 6000, 2100] },
    thumb: { corner: ['enum', CORNERS, 'tl'], kicker_style: ['enum', ['plate', 'plain'], 'plate'] },
    end_card: { cta: ['str', 40, ''], next_hint: ['bool', true] }
  };
  var TOP_KEYS = ['preset', 'tokens', 'fonts', 'logo'].concat(Object.keys(SPEC).filter(function (k) { return k !== 'logo'; }), ['vars', 'hash']);
  var SUB_LABEL = { logo: 'logo', lower_third: 'lower-third', subtitle: 'phụ đề', intro: 'intro', outro: 'outro', thumb: 'ảnh bìa', end_card: 'thẻ kết' };

  function typeOk(def, v) {
    switch (def[0]) {
      case 'enum': return def[1].indexOf(v) >= 0;
      case 'bool': return typeof v === 'boolean';
      case 'int': return typeof v === 'number' && isFinite(v) && Math.floor(v) === v && v >= def[1] && v <= def[2];
      case 'str': return typeof v === 'string' && v.length <= def[1];
    }
    return false;
  }
  function dflt(def) { return def[0] === 'enum' ? def[2] : def[0] === 'bool' ? def[1] : def[0] === 'int' ? def[3] : def[2]; }
  function describe(def) {
    switch (def[0]) {
      case 'enum': return 'một trong: ' + def[1].join(', ');
      case 'bool': return 'true/false';
      case 'int': return 'số nguyên ' + def[1] + '–' + def[2];
      case 'str': return 'chữ ≤ ' + def[1] + ' ký tự';
    }
    return '';
  }
  // gộp một nhóm theo lược đồ: giá trị đúng kiểu giữ lại, sai/thiếu ⇒ mặc định
  function section(spec, raw) {
    var out = {}, o = isObj(raw) ? raw : {};
    Object.keys(spec).forEach(function (k) { out[k] = o[k] !== undefined && typeOk(spec[k], o[k]) ? o[k] : dflt(spec[k]); });
    return out;
  }

  // nhóm thumb: lược đồ + (gói T) faces hợp lệ được giữ lại
  function thumbOf(raw) {
    var t = section(SPEC.thumb, raw);
    if (isObj(raw) && Array.isArray(raw.faces)) t.faces = raw.faces.filter(function (f) { return isObj(f) && typeof f.asset === 'string' && /^AS-\d+$/.test(f.asset) && typeof f.mood === 'string' && /^[a-z]{2,16}$/.test(f.mood); }).slice(0, 10).map(function (f) { return { asset: f.asset, mood: f.mood }; });
    return t;
  }

  function stable(v) {
    if (Array.isArray(v)) return '[' + v.map(stable).join(',') + ']';
    if (v && typeof v === 'object') return '{' + Object.keys(v).sort().map(function (k) { return JSON.stringify(k) + ':' + stable(v[k]); }).join(',') + '}';
    return JSON.stringify(v);
  }

  // ---- màu ----
  function rgb(h) { return [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)]; }
  function lum(h) {
    var c = rgb(h).map(function (x) { x /= 255; return x <= 0.03928 ? x / 12.92 : Math.pow((x + 0.055) / 1.055, 2.4); });
    return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
  }
  function contrast(a, b) { var la = lum(a), lb = lum(b); return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05); }
  function mix(a, b, t) {   // t = phần của b
    var x = rgb(a), y = rgb(b);
    return '#' + [0, 1, 2].map(function (i) { var v = Math.round(x[i] + (y[i] - x[i]) * t); return (v < 16 ? '0' : '') + v.toString(16); }).join('').toUpperCase();
  }
  function rgba(h, al) { var c = rgb(h); return 'rgba(' + c[0] + ',' + c[1] + ',' + c[2] + ',' + al + ')'; }

  // (nền, chữ, token bị báo, ngưỡng, nhãn)
  var CONTRAST_RULES = [
    ['paper', 'ink', 'ink', 7, 'Mực trên nền giấy'],
    ['paper', 'ink_soft', 'ink_soft', 4.5, 'Mực nhạt trên nền giấy'],
    ['paper', 'en', 'en', 4.5, 'Chữ thuật ngữ trên nền giấy'],
    ['card', 'ink', 'card', 7, 'Mực trên thẻ'],
    ['hl', 'ink', 'hl', 4.5, 'Mực trên nhấn vàng']
  ];

  // lõi chuẩn hoá: `raw` = brand thô, `data` = dữ liệu kênh (lấy thêm end_card, lower_third_text). Chưa có vars/hash.
  function build(raw, data) {
    var b = isObj(raw) ? raw : {}, d = isObj(data) ? data : {};
    var preset = PRESETS[b.preset] ? b.preset : DEFAULT_PRESET, P = PRESETS[preset];
    var tokens = {}, bt = isObj(b.tokens) ? b.tokens : {};
    TOKEN_KEYS.forEach(function (k) { tokens[k] = typeof bt[k] === 'string' && HEX.test(bt[k]) ? bt[k].toUpperCase() : P.tokens[k]; });
    var pair = isObj(b.fonts) && FONT_PAIRS[b.fonts.pair] ? b.fonts.pair : P.fonts;
    var logo = null;
    if (isObj(b.logo) && typeof b.logo.asset === 'string' && /^AS-\d+$/.test(b.logo.asset)) {
      var show = Array.isArray(b.logo.show) ? b.logo.show.filter(function (x, i, a) { return LOGO_SHOW.indexOf(x) >= 0 && a.indexOf(x) === i; }) : LOGO_SHOW.slice();
      logo = Object.assign({ asset: b.logo.asset }, section(SPEC.logo, b.logo), { show: show });
      if (b.logo.ref && typeof b.logo.ref === 'string') logo.ref = b.logo.ref;   // đường dẫn asset đã phân giải (hook plan.after của gói B), không nằm trong dữ liệu kênh
    }
    var lt = Object.assign({}, isObj(b.lower_third) ? b.lower_third : {});
    if (lt.text === undefined && typeof d.lower_third_text === 'string') lt.text = d.lower_third_text;
    var ec = isObj(b.end_card) ? b.end_card : (isObj(d.end_card) ? d.end_card : {});
    return { preset: preset, tokens: tokens, fonts: { pair: pair }, logo: logo,
      lower_third: section(SPEC.lower_third, lt), subtitle: section(SPEC.subtitle, b.subtitle), intro: section(SPEC.intro, b.intro),
      outro: section(SPEC.outro, b.outro), thumb: thumbOf(b.thumb), end_card: section(SPEC.end_card, ec) };
  }

  function hash(brand) {
    if (!brand) return null;
    var o = Object.assign({}, brand); delete o.hash; delete o.vars;
    return isNode ? require('node:crypto').createHash('sha256').update(stable(o)).digest('hex').slice(0, 16) : stable(o).length.toString(16);
  }

  var SUB_PX = { s: 32, m: 37, l: 44 }, LOGO_PX = { s: 96, m: 160 };
  function cssVars(brand) {
    var n = build(brand, {}), t = n.tokens, pair = FONT_PAIRS[n.fonts.pair];
    var px = SUB_PX[n.subtitle.size], v = {};
    TOKEN_KEYS.forEach(function (k) { v['--v-' + k.replace(/_/g, '-')] = t[k]; });
    v['--v-coral'] = t.accent2;   // bí danh cũ
    v['--f-display'] = STACKS[pair.display]; v['--f-hand'] = STACKS[pair.hand];
    // màu dẫn xuất (nền chữ trên mực, vạch nền, chữ tên người nói…) — tính từ token để đổi brand là đổi cả bộ
    v['--v-track'] = mix(t.card, t.rule, 0.5); v['--v-on-ink'] = t.card; v['--v-sub-bg'] = rgba(t.ink, 0.93);
    v['--v-who0'] = mix(t.rule_strong, t.card, 0.55); v['--v-who1'] = mix(t.accent2, t.card, 0.45); v['--v-en-dark'] = mix(t.en, t.card, 0.6);
    v['--v-tape'] = rgba(t.hl, 0.85); v['--v-stamp-bg'] = rgba(t.card, 0.92);
    v['--sub-size'] = px + 'px'; v['--sub-who-size'] = Math.round(px * 0.97) + 'px'; v['--sub-tr-size'] = Math.round(px * 0.78) + 'px';
    v['--sub-maxw'] = Math.max(600, Math.min(1700, Math.round(n.subtitle.max_chars_line * px * 0.78))) + 'px';
    var lg = n.logo ? LOGO_PX[n.logo.size] : 0, onVideo = n.logo && n.logo.show.indexOf('video') >= 0;   // --logo-px dùng cho mọi nơi hiện logo; chip tiêu đề chỉ nhường chỗ khi logo hiện trên video
    v['--logo-px'] = lg + 'px';
    v['--chip-left'] = (onVideo && n.logo.corner === 'tl' ? 40 + lg + 24 : 40) + 'px';
    return v;
  }

  function normalize(data) {
    var b = data && data.brand;
    if (!isObj(b)) return null;
    var out = build(b, data);
    out.vars = cssVars(out);
    out.hash = hash(out);
    return out;
  }

  // ---- kiểm: lược đồ (trên bản thô) + tương phản (trên bảng màu đã gộp preset) ----
  function check(brand) {
    var errs = [], add = function (path, text, extra) { errs.push(Object.assign({ path: path, text: text }, extra || {})); };
    if (!isObj(brand)) { add('brand', 'Nhận diện phải là một object.'); return errs; }
    Object.keys(brand).forEach(function (k) { if (TOP_KEYS.indexOf(k) < 0) add(k, 'Trường "' + k + '" không có trong lược đồ nhận diện.'); });
    if (brand.preset !== undefined && !PRESETS[brand.preset]) add('preset', 'Preset "' + brand.preset + '" không có (có: ' + Object.keys(PRESETS).join(', ') + ').');
    if (brand.tokens !== undefined) {
      if (!isObj(brand.tokens)) add('tokens', 'tokens phải là object.');
      else Object.keys(brand.tokens).forEach(function (k) {
        if (TOKEN_KEYS.indexOf(k) < 0) add('tokens.' + k, 'Token "' + k + '" không có (có: ' + TOKEN_KEYS.join(', ') + ').');
        else if (typeof brand.tokens[k] !== 'string' || !HEX.test(brand.tokens[k])) add('tokens.' + k, 'Màu ' + TOKEN_LABELS[k] + ' phải là mã HEX dạng #RRGGBB.');
      });
    }
    if (brand.fonts !== undefined) {
      if (!isObj(brand.fonts) || (brand.fonts.pair !== undefined && !FONT_PAIRS[brand.fonts.pair])) add('fonts.pair', 'Cặp phông phải là một trong: ' + Object.keys(FONT_PAIRS).join(', ') + '.');
    }
    if (brand.logo !== undefined && brand.logo !== null) {
      var lg = brand.logo;
      if (!isObj(lg)) add('logo', 'logo phải là object hoặc null.');
      else {
        if (typeof lg.asset !== 'string' || !/^AS-\d+$/.test(lg.asset)) add('logo.asset', 'logo.asset phải là mã asset dạng AS-0007.');
        Object.keys(lg).forEach(function (k) { if (['asset', 'corner', 'size', 'show', 'ref'].indexOf(k) < 0) add('logo.' + k, 'Trường logo.' + k + ' không có trong lược đồ.'); });
        Object.keys(SPEC.logo).forEach(function (k) { if (lg[k] !== undefined && !typeOk(SPEC.logo[k], lg[k])) add('logo.' + k, 'logo.' + k + ' phải là ' + describe(SPEC.logo[k]) + '.'); });
        if (lg.show !== undefined && (!Array.isArray(lg.show) || lg.show.some(function (x) { return LOGO_SHOW.indexOf(x) < 0; }))) add('logo.show', 'logo.show chỉ gồm: ' + LOGO_SHOW.join(', ') + '.');
      }
    }
    Object.keys(SPEC).forEach(function (sec) {
      if (sec === 'logo' || brand[sec] === undefined) return;
      if (!isObj(brand[sec])) return add(sec, 'Nhóm ' + SUB_LABEL[sec] + ' phải là object.');
      Object.keys(brand[sec]).forEach(function (k) {
        if (sec === 'thumb' && k === 'faces') return;   // gói T: ảnh mặt chủ kênh, kiểm riêng bên dưới
        if (!SPEC[sec][k]) add(sec + '.' + k, 'Trường ' + sec + '.' + k + ' không có trong lược đồ.');
        else if (!typeOk(SPEC[sec][k], brand[sec][k])) add(sec + '.' + k, sec + '.' + k + ' phải là ' + describe(SPEC[sec][k]) + '.');
      });
    });
    if (isObj(brand.thumb) && brand.thumb.faces !== undefined) {   // gói T (SPEC §5.4): thumb.faces = [{asset:"AS-…", mood}] ≤ 10 — ảnh mặt thật của chủ kênh (PNG tách nền) cho ảnh bìa
      var fc = brand.thumb.faces;
      if (!Array.isArray(fc) || fc.length > 10) add('thumb.faces', 'thumb.faces phải là danh sách ≤ 10 mục {asset, mood}.');
      else fc.forEach(function (f, i) { if (!isObj(f) || typeof f.asset !== 'string' || !/^AS-\d+$/.test(f.asset) || typeof f.mood !== 'string' || !/^[a-z]{2,16}$/.test(f.mood)) add('thumb.faces[' + i + ']', 'Mỗi ảnh mặt cần {asset: "AS-…", mood: chữ thường}.'); });
    }
    if (isObj(brand.intro) && brand.intro.enabled === true && brand.intro.kind === 'none') add('intro.kind', 'Intro đang bật nhưng kind là "none".');
    // tương phản: chỉ kiểm cặp mà cả hai màu đều hợp lệ (màu sai định dạng đã báo ở trên)
    var t = build(brand, {}).tokens;
    CONTRAST_RULES.forEach(function (r) {
      var ratio = contrast(t[r[0]], t[r[1]]);
      if (ratio + 1e-9 < r[3]) {
        add('tokens.' + r[2], r[4] + ' chỉ ' + (Math.round(ratio * 10) / 10).toString().replace('.', ',') + ':1 — cần ≥ ' + String(r[3]).replace('.', ',') + ':1.', { ratio: Math.round(ratio * 100) / 100, need: r[3] });
      }
    });
    return errs;
  }

  var api = { PRESETS: PRESETS, FONT_PAIRS: FONT_PAIRS, TOKEN_KEYS: TOKEN_KEYS, SFX: SFX, DEFAULT_PRESET: DEFAULT_PRESET, SPEC: SPEC,
    normalize: normalize, hash: hash, check: check, cssVars: cssVars, contrast: contrast, mix: mix };
  if (isNode) module.exports = api; else root.GSBrandData = api;
})(typeof self !== 'undefined' ? self : this);
