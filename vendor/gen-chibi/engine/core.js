/* gen-chibi engine — core 0.2
 * © 2026 Gen Labs — All rights reserved.
 *
 * Lõi không phụ thuộc thư viện ngoài. Gồm:
 *   1. RIG     khung xương chung của loại asset "character" (khớp, điểm neo, thứ tự lớp vẽ)
 *   2. PACK    mọi linh kiện, biểu cảm, động tác, nhân vật đều thuộc một thư viện có chủ + license
 *   3. RESOLVE trạng thái cuối = kho → trait (theo bộ phận) → nhân vật → đạo diễn, có ghi nguồn
 *   4. COMPOSE công thức + trạng thái → SVG theo từng lớp; tham số linh kiện thành transform
 *   5. MOTION  động tác là dữ liệu keyframe trên khớp
 *   6. DIRECTOR schema tự sinh từ kho, validator
 *   7. GATES   cổng kiểm tự động
 * Tầng vẽ (ảnh cache / thở / diễn đủ, ngân sách hiệu năng) nằm ở engine/render.js.
 */
(function (G) {
  'use strict';

  var INK = '#2b211d';
  var VERSION = '0.5.0';
  // NGÔN NGỮ (ADR 0007): câu engine sinh vẫn là TIẾNG VIỆT (msgid) — Studio / server dịch ở chỗ hiển thị.
  // N_(msgid, vars): đánh dấu msgid cho tools/i18n-scan.mjs + điền {biến} — KHÔNG dịch, câu ra giống hệt phép cộng chuỗi cũ.
  // Câu có biến dịch được bằng t(msgid, vars) (cổng kiểm trả kèm labelId / labelVars, detailId / detailVars) hoặc khớp ngược mẫu (engine/i18n-msg.js).
  function N_(id, vars) { return !vars ? id : id.replace(/\{([A-Za-z0-9_]+)\}/g, function (m, k) { return Object.prototype.hasOwnProperty.call(vars, k) ? String(vars[k]) : m; }); }
  // một mục cổng kiểm; label / detail là chuỗi hoặc [msgid, vars] (câu có số đếm) → thêm labelId / labelVars (detailId / detailVars) để hiển thị dịch được
  function gateRow(o, label, detail) {
    if (Array.isArray(label)) { o.label = N_(label[0], label[1]); o.labelId = label[0]; o.labelVars = label[1]; } else o.label = label;
    if (Array.isArray(detail)) { o.detail = N_(detail[0], detail[1]); o.detailId = detail[0]; o.detailVars = detail[1]; } else o.detail = detail || '';
    return o;
  }

  /* ---------------------------------------------------------------- 1. RIG */
  var RIG = {
    box: [-24, -18, 248, 258],
    crop: [34, 20, 132, 132],
    // stage: sân khấu đứng yên (đạo cụ: ghế, bàn, chiếu, nước). root: cả nhân vật. pelvis: hông.
    // hem: vạt áo dưới thắt lưng (co giãn khi ngồi, chạy). Chân: đùi → cẳng → bàn chân.
    joints: {
      stage: { parent: null,    pivot: [100, 228] },
      root:  { parent: null,    pivot: [100, 228] },
      pelvis: { parent: 'root', pivot: [100, 200] },
      body:  { parent: 'pelvis', pivot: [100, 214] },
      hem:   { parent: 'pelvis', pivot: [100, 192] },
      thighL: { parent: 'pelvis', pivot: [90, 203] },
      shinL: { parent: 'thighL', pivot: [89, 212] },
      footL: { parent: 'shinL', pivot: [87, 221] },
      thighR: { parent: 'pelvis', pivot: [110, 203] },
      shinR: { parent: 'thighR', pivot: [111, 212] },
      footR: { parent: 'shinR', pivot: [113, 221] },
      head:  { parent: 'body',  pivot: [100, 150] },
      armL:  { parent: 'body',  pivot: [78, 160] },
      foreL: { parent: 'armL',  pivot: [74, 177] },
      handL: { parent: 'foreL', pivot: [72, 193] },
      armR:  { parent: 'body',  pivot: [122, 160] },
      foreR: { parent: 'armR',  pivot: [126, 177] },
      handR: { parent: 'foreR', pivot: [128, 193] }
    },
    anchors: {
      ground: [100, 228], waist: [100, 186], chest: [100, 168],
      face: [100, 100], crown: [100, 54], forehead: [100, 76],
      eyeL: [80, 108], eyeR: [120, 108], browL: [80, 90], browR: [120, 90],
      mouth: [100, 131], chin: [100, 146], cheekL: [69, 124], cheekR: [131, 124],
      elbowL: [74, 177], elbowR: [126, 177], gripL: [72, 193], gripR: [128, 193],
      hipL: [90, 203], hipR: [110, 203], kneeL: [89, 212], kneeR: [111, 212], ankleL: [87, 221], ankleR: [113, 221]
    },
    // [lớp, khớp]. Thứ tự vẽ tách khỏi cây khớp (như slot của Spine).
    layers: [
      ['propBack', 'stage'], ['fxBack', 'root'], ['hairBack', 'head'], ['backItem', 'body'],
      // tay phía xa khi quay 3/4: engine chuyển nội dung tay sang các lớp này (sau thân)
      ['armLb', 'armL'], ['foreLb', 'foreL'], ['heldLb', 'handL'], ['handLb', 'handL'],
      ['armRb', 'armR'], ['foreRb', 'foreR'], ['heldRb', 'handR'], ['handRb', 'handR'],
      ['legs', 'root'],
      ['thighL', 'thighL'], ['shinL', 'shinL'], ['footL', 'footL'], ['thighR', 'thighR'], ['shinR', 'shinR'], ['footR', 'footR'],
      ['hem', 'hem'], ['body', 'body'], ['ears', 'head'], ['head', 'head'], ['mask', 'head'], ['shade', 'head'],
      ['cheeks', 'head'], ['eyes', 'head'], ['brows', 'head'], ['beard', 'head'],
      ['mouth', 'head'], ['mustache', 'head'], ['hairFront', 'head'], ['hat', 'head'],
      ['fxHead', 'head'],
      ['propMid', 'stage'],
      ['armL', 'armL'], ['foreL', 'foreL'], ['heldL', 'handL'], ['handL', 'handL'],
      ['armR', 'armR'], ['foreR', 'foreR'], ['heldR', 'handR'], ['handR', 'handR'],
      ['fxFront', 'root'], ['propFront', 'stage']
    ]
  };
  var JOINT_IDS = Object.keys(RIG.joints);
  var LAYER_IDS = RIG.layers.map(function (l) { return l[0]; });
  var CHANNELS = ['x', 'y', 'rot', 'sx', 'sy'];

  /* --------------------------------------------------------------- 2. PACK */
  var PACKS = {};
  var LIB = {
    slots: {}, parts: {}, eyeStyles: {}, eyePoses: {}, browStyles: {}, browPoses: {},
    mouths: {}, fx: {}, motions: {}, states: {}, stateOrder: [], traits: [], defaults: {}, profiles: {},
    postures: {}, moves: {}, props: {}, activities: {}, activityOrder: [],
    derive: {}, tokenOwner: {}   // v0.26: token màu dẫn xuất (hairShade = hair pha đen…) + gói nào đăng ký token nào
  };
  var ASSETS = {};      // 'pack/id' → asset nhân vật
  var ASSET_ORDER = [];
  var ITEMS = {};       // 'pack/id' → item trang bị (loại asset thứ hai)
  var ITEM_ORDER = [];
  var SCENES = {};      // 'pack/id' → cảnh (loại asset thứ ba)
  var SCENE_ORDER = [];

  // Đổi tên thư viện (vd. gen.core → gen.core, 2026-10-18): tên cũ là ALIAS — dữ liệu cũ vẫn đọc được, lưu mới ghi tên mới
  var PACK_ALIAS = {};
  function canonPack(id) { return typeof id === 'string' && own(PACK_ALIAS, id) ? PACK_ALIAS[id] : id; }
  function canon(ref) { if (typeof ref !== 'string') return ref; var i = ref.indexOf('/'); return i > 0 ? canonPack(ref.slice(0, i)) + ref.slice(i) : ref; }
  // ĐỒ CỦA GEN LABS (ADR 0007, CNS-154 / CNS-158) — x: mục dữ liệu (nhân vật, vật phẩm, cảnh, linh kiện, đòn, âm…) hoặc id pack.
  // true khi mục thuộc pack nhóm "frame" (khung lõi gen.core, bộ khung chuẩn gen.khung), bộ đòn khung (choreo.FRAME_PACK) hay bộ âm chuẩn (sounds.FRAME):
  // chữ của chúng là msgid tiếng Việt → dịch được. Còn lại — "Của tôi", bộ mẫu đã nhập (ADR 0007 §4: giữ nội dung gốc), gói nhập, gói của người dùng —
  // là NỘI DUNG: không dịch, kể cả khi trùng msgid (nhân vật "Nam" không thành "Male", vật phẩm "Đạt" không thành "Approved")
  function isGenLabs(x) {
    var pk = x && typeof x === 'object' ? x.pack : x, E = G.GenChibi;
    if (typeof pk !== 'string' || !pk) return false;
    pk = canonPack(pk);
    if (own(PACKS, pk)) return PACKS[pk].group === 'frame';
    return !!E && !!((E.choreo && pk === E.choreo.FRAME_PACK) || (E.sounds && pk === E.sounds.FRAME));
  }
  // Mỗi mục đăng ký mang theo `pack` để biết chủ, license, nhóm thư viện.
  function pack(meta, fill) {
    if (!meta || !/^[a-z0-9]+(\.[a-z0-9-]+)+$/.test(meta.id)) throw new Error(N_('id thư viện phải dạng chu.ten: {id}', { id: meta && meta.id }));
    var P = PACKS[meta.id] = {
      id: meta.id, name: meta.name, owner: meta.owner, group: meta.group || 'community',
      visibility: meta.visibility || 'private', license: meta.license, version: meta.version || '0.0.1',
      description: meta.description || '', counts: {}, aliases: (meta.aliases || []).slice()
    };
    P.aliases.forEach(function (a) { PACK_ALIAS[a] = P.id; });
    function tag(o, kind) { o.pack = P.id; P.counts[kind] = (P.counts[kind] || 0) + 1; return o; }
    var D = {
      slot: function (id, def) { LIB.slots[id] = tag(def, 'slot'); },
      part: function (def) {
        if (!LIB.slots[def.slot]) throw new Error(N_('slot lạ: {slot}', { slot: def.slot }));
        def.license = def.license || P.license;
        LIB.parts[P.id + '/' + def.slot + ':' + def.id] = tag(def, 'part');
      },
      eyeStyle: function (id, def) { LIB.eyeStyles[id] = tag(def, 'eyeStyle'); },
      eyePose: function (id, fn) { fn.pack = P.id; LIB.eyePoses[id] = fn; P.counts.eyePose = (P.counts.eyePose || 0) + 1; },
      browStyle: function (id, def) { LIB.browStyles[id] = tag(def, 'browStyle'); },
      browPose: function (id, def) { LIB.browPoses[id] = tag(def, 'browPose'); },
      mouth: function (id, fn) { fn.pack = P.id; LIB.mouths[id] = fn; P.counts.mouth = (P.counts.mouth || 0) + 1; },
      fx: function (id, def) { LIB.fx[id] = tag(typeof def === 'function' ? { draw: def } : def, 'fx'); },
      motion: function (id, def) { def.id = id; LIB.motions[id] = tag(def, 'motion'); },
      state: function (id, def) { def.id = id; LIB.states[id] = tag(def, 'state'); if (LIB.stateOrder.indexOf(id) < 0) LIB.stateOrder.push(id); },
      trait: function (def) { LIB.traits.push(tag(def, 'trait')); },
      profile: function (id, def) { def.id = id; LIB.profiles[id] = tag(def, 'profile'); },
      posture: function (id, def) { def.id = id; LIB.postures[id] = tag(def, 'posture'); },
      move: function (id, def) { def.id = id; LIB.moves[id] = tag(def, 'move'); },
      prop: function (id, def) { def.id = id; LIB.props[id] = tag(def, 'prop'); },
      activity: function (id, def) { def.id = id; LIB.activities[id] = tag(def, 'activity'); if (LIB.activityOrder.indexOf(id) < 0) LIB.activityOrder.push(id); },
      defaults: function (pal) { for (var k in pal) { LIB.defaults[k] = pal[k]; LIB.tokenOwner[k] = P.id; } },
      // v0.26 (E7): token dẫn xuất — nhân vật không khai báo thì engine tính từ token gốc: derive('hairShade', { from: 'hair', to: '#000000', t: 0.28 })
      derive: function (id, rule) { rule.pack = P.id; LIB.derive[id] = rule; LIB.tokenOwner[id] = P.id; },
      asset: function (def) { registerAsset(P.id, def); },
      item: function (def) { var r = registerItem(P.id, def); if (r.errors.length) throw new Error('item ' + def.id + ': ' + r.errors.join('; ')); },
      // phông (linh kiện của cảnh): draw(C) → chuỗi SVG trong khung 640×360 (đạo cụ cảnh: gốc toạ độ ở chân vật)
      scenery: function (def) {
        if (!own(SCENE.slots, def.slot)) throw new Error(N_('bộ phận cảnh lạ: {slot}', { slot: def.slot }));
        def.kind = 'scenery'; def.license = def.license || P.license;
        LIB.parts[P.id + '/' + def.slot + ':' + def.id] = tag(def, 'scenery');
      },
      scene: function (def) { var r = registerScene(P.id, def); if (r.errors.length) throw new Error(N_('cảnh {id}: {list}', { id: def.id, list: r.errors.join('; ') })); }
    };
    fill(D);
    return P;
  }

  function registerAsset(packId, def) {
    packId = canonPack(packId);
    def = migrate(def);
    def.pack = packId;
    def.key = packId + '/' + def.id;
    if (!ASSETS[def.key]) ASSET_ORDER.push(def.key);
    ASSETS[def.key] = def;
    if (PACKS[packId]) PACKS[packId].counts.character = (PACKS[packId].counts.character || 0) + 1;
    return def;
  }

  // Công thức 0.1 (eyes/brows/parts/palette ở ngoài) → 0.2 (gom vào look)
  function migrate(a) {
    if (a.look) return a;
    a.look = { eyes: a.eyes, brows: a.brows, parts: a.parts || {}, params: {}, palette: a.palette || {} };
    delete a.eyes; delete a.brows; delete a.parts; delete a.palette;
    a.kind = 'character';
    a.version = a.version || 1;
    a.status = a.status || 'draft';
    a.expressions = a.expressions || {};
    a.lines = a.lines || {};
    return a;
  }

  // Tham chiếu linh kiện: "id" (tìm trong thư viện của asset rồi các thư viện khác) hoặc "pack/id"
  function getPart(slot, ref, preferPack) {
    if (!ref) return null;
    ref = canon(ref); preferPack = canonPack(preferPack);
    if (ref.indexOf('/') > 0) {
      var sp = ref.split('/');
      return LIB.parts[sp[0] + '/' + slot + ':' + sp[1]] || null;
    }
    if (preferPack && LIB.parts[preferPack + '/' + slot + ':' + ref]) return LIB.parts[preferPack + '/' + slot + ':' + ref];
    var keys = Object.keys(LIB.parts);
    for (var i = 0; i < keys.length; i++) {
      var p = LIB.parts[keys[i]];
      if (p.slot === slot && p.id === ref) return p;
    }
    return null;
  }
  function partsOfSlot(slot) {
    return Object.keys(LIB.parts).map(function (k) { return LIB.parts[k]; }).filter(function (p) { return p.slot === slot; });
  }
  // Nhân vật mặc item (look.equip.<slot> = "pack/id") → linh kiện, tham số, bảng màu của item thắng look.parts
  function equipped(asset, slot) {
    var ref = asset.look && asset.look.equip && asset.look.equip[slot];
    var it = typeof ref === 'string' ? getItem(ref, asset.pack) : null;
    return it && it.equip.slot === slot ? it : null;   // item đổi bộ phận sau khi đã mặc → bỏ qua, không làm vỡ nhân vật
  }
  function partRef(asset, slot) { var it = equipped(asset, slot); return it ? it.equip.part : asset.look.parts[slot] || (LIB.slots[slot] || {}).fallback; }

  /* ------------------------------------------------------------ 3. RESOLVE */
  var SRC = { lib: 'Kho', asset: 'Nhân vật', director: 'Đạo diễn' };

  function traitsOf(asset) {
    return LIB.traits.filter(function (t) {
      return Object.keys(t.if).every(function (slot) {
        var v = slot === 'eyes' ? asset.look.eyes : partRef(asset, slot);
        return t.if[slot].indexOf(v) >= 0;
      });
    });
  }

  function resolveState(asset, stateId, director) {
    var base = LIB.states[stateId] || LIB.states.normal;
    var st = {
      id: base.id, eyes: base.eyes, brows: base.brows, mouth: base.mouth,
      fx: (base.fx || []).slice(), motion: base.motion, traits: [],
      posture: 'stand', move: null, facing: 'right', turn: 0, props: [], activity: null, explicitMotion: false,
      src: { eyes: SRC.lib, brows: SRC.lib, mouth: SRC.lib, fx: SRC.lib, motion: SRC.lib, posture: SRC.lib, move: SRC.lib }
    };
    traitsOf(asset).forEach(function (t) {
      var o = t.over[base.id];
      if (!o) return;
      st.traits.push(t.id);
      ['eyes', 'brows', 'mouth', 'motion'].forEach(function (k) { if (o[k]) { st[k] = o[k]; st.src[k] = N_('Trait · {label}', { label: t.label }); } });
      if (o.fxAdd) { st.fx = st.fx.concat(o.fxAdd); st.src.fx = 'Kho + trait'; }
    });
    var ov = (asset.expressions || {})[base.id];
    if (ov) {
      ['eyes', 'brows', 'mouth', 'motion'].forEach(function (k) { if (ov[k]) { st[k] = ov[k]; st.src[k] = SRC.asset; } });
      if (ov.fx) { st.fx = ov.fx.slice(); st.src.fx = SRC.asset; }
      if (ov.fxAdd) { st.fx = st.fx.concat(ov.fxAdd); st.src.fx = SRC.asset; }
      if (ov.fxRemove) { st.fx = st.fx.filter(function (f) { return ov.fxRemove.indexOf(f) < 0; }); st.src.fx = SRC.asset; }
    }
    // hoạt động = tổ hợp đặt tên sẵn (tư thế + di chuyển + động tác + đạo cụ + nét mặt), đạo diễn vẫn ghi đè từng trục
    var act = director && director.activity && LIB.activities[director.activity];
    if (act) {
      st.activity = act.id;
      var A = N_('Hoạt động · {label}', { label: act.label });
      if (act.posture) { st.posture = act.posture; st.src.posture = A; }
      if (act.move) { st.move = act.move; st.src.move = A; }
      if (act.action) { st.motion = act.action; st.src.motion = A; st.explicitMotion = true; }
      ['eyes', 'brows', 'mouth'].forEach(function (k) { if (act.face && act.face[k]) { st[k] = act.face[k]; st.src[k] = A; } });
      if (act.fx) st.fx = st.fx.concat(act.fx);
      if (act.props) st.props = st.props.concat(act.props);
    }
    if (director) {
      ['eyes', 'brows', 'mouth'].forEach(function (k) { if (director[k]) { st[k] = director[k]; st.src[k] = SRC.director; } });
      if (director.motion) { st.motion = director.motion; st.src.motion = SRC.director; st.explicitMotion = true; }
      if (director.posture && LIB.postures[director.posture]) { st.posture = director.posture; st.src.posture = SRC.director; }
      if (director.move !== undefined) { st.move = LIB.moves[director.move] ? director.move : null; st.src.move = SRC.director; }
      if (director.facing === 'left' || director.facing === 'right') st.facing = director.facing;
      // góc nhìn: front | left (3/4 quay sang trái màn hình) | right; hoặc turn số trong [-1, 1]
      if (director.view) st.turn = VIEWS[director.view] !== undefined ? VIEWS[director.view] : 0;
      if (typeof director.turn === 'number' && isFinite(director.turn)) st.turn = Math.max(-1, Math.min(1, director.turn));
      st.viewSet = !!director.view || typeof director.turn === 'number';
      if (VIEW_KIND[director.view]) { st.kind = VIEW_KIND[director.view]; st.view = director.view; }
      if (director.fx) { st.fx = st.fx.concat(director.fx); st.src.fx = SRC.director; }
    }
    var pz = LIB.postures[st.posture] || {}, mv = st.move && LIB.moves[st.move];
    if (mv && mv.postures && mv.postures.indexOf(st.posture) < 0) st.posture = mv.postures[0];   // di chuyển kéo theo tư thế hợp lệ
    pz = LIB.postures[st.posture] || {};
    st.props = (pz.props || []).concat(st.props, (mv && mv.props) || [], ((LIB.motions[st.motion] || {}).props) || []);
    st.props = st.props.filter(function (x, i) { return st.props.indexOf(x) === i && LIB.props[x]; });
    if (mv && mv.fx) st.fx = st.fx.concat(mv.fx);
    // đang di chuyển mà chưa chọn góc: nghiêng 3/4 về hướng đi (đọc ra "đang đi tới" rõ hơn chính diện)
    if (mv && !st.viewSet && !mv.front) st.turn = st.facing === 'left' ? -1 : 1;
    // góc nhìn tính theo MÀN HÌNH; khi quay trái cả hình bị lật gương nên đổi dấu sang hệ toạ độ của nhân vật
    st.turnLocal = st.facing === 'left' ? -st.turn : st.turn;
    // lật gương: góc 45° do góc nhìn quyết định (bản chuẩn quay trái); các góc khác theo hướng di chuyển
    if (st.kind === 'q180') { st.mirror = true; st.turnLocal = 0; st.facing = 'right'; }   // sau lưng: hai bên đổi chỗ như nhìn từ phía sau
    else if (TURNED[st.kind]) { st.mirror = /^right/.test(st.view); st.turnLocal = -1; st.facing = st.mirror ? 'right' : 'left'; }
    else st.mirror = st.facing === 'left';
    st.fx = st.fx.filter(function (f, i) { return st.fx.indexOf(f) === i; });
    return st;
  }

  /* ----------------------------------------------------- 3b. GÓC NHÌN 3/4 */
  // Quay kiểu parallax (như Live2D/Spine cho chibi): đầu chibi gần như hình cầu nên viền đầu giữ nguyên,
  // các lớp trên mặt trượt theo độ sâu trên cầu: x = R·sin(θ − φ). θ là góc của chi tiết, φ là góc quay.
  // Mắt xa hẹp lại (cos giảm), mắt gần rộng ra; tóc sau, tai trượt ngược; thân quay ít hơn đầu; tay xa ra sau thân.
  var VIEWS = { front: 0, left: -1, right: 1, left45: -1, right45: 1, left90: -1, right90: 1, left135: -1, right135: 1, back: 0 };
  // 8 hướng (kiểu game RPG) — vẽ 5, lật gương ra 8. Bản chuẩn của mỗi góc quay sang TRÁI màn hình; *right* = lật gương.
  //   q45 nghiêng 45° · q90 nghiêng hẳn (nhìn ngang) · q135 quay lưng chéo · q180 sau lưng
  var VIEW_ORDER = ['front', 'left', 'right', 'left45', 'right45', 'left90', 'right90', 'left135', 'right135', 'back'];
  var VIEW_KIND = { left45: 'q45', right45: 'q45', left90: 'q90', right90: 'q90', left135: 'q135', right135: 'q135', back: 'q180' };
  var VIEW_KINDS = ['q45', 'q90', 'q135', 'q180'];
  // linh kiện chưa có bản vẽ góc này → dùng bản gần nhất (cổng kiểm báo thiếu)
  var VIEW_FALLBACK = { q45: ['q45'], q90: ['q90', 'q45'], q135: ['q135', 'q180', 'q45'], q180: ['q180'] };
  var TURNED = { q45: 1, q90: 1, q135: 1 };          // thân xoay sang trái (tay xa ra sau thân)
  var BACK_KINDS = { q135: 1, q180: 1 };             // thấy lưng: không vẽ khuôn mặt
  var FACE_LAYERS = ['eyes', 'brows', 'mouth', 'mustache', 'beard', 'cheeks', 'mask'];
  // nhìn ngang (q90): chỉ thấy một mắt, sát mép trước của mặt
  var Q90 = { eye: { x: 62, sx: 0.55 }, brow: { x: 64, sx: 0.55 }, mouth: { dx: -32, sx: 0.6 } };
  var TURN = { phi: 22, R: 48, body: 0.55 };
  // Góc 45° VẼ THẬT ở mức linh kiện: part.views.q45(C, st, vals). Bản vẽ chuẩn quay mặt sang TRÁI màn hình
  // (tay phải màn hình ở phía gần); 45° phải = lật gương. Linh kiện chưa có bản vẽ 45° thì engine trượt parallax (phi 32°).
  // Vị trí mặt 45° (mắt gần/xa, mày, miệng) thuộc engine nên mọi kiểu mắt/mày/miệng đều hưởng.
  var Q45 = {
    phi: 32, body: 0.8,
    eye: { L: { x: 64, sx: 0.62 }, R: { x: 96, sx: 1 } },   // 64 + 20·0.62 ≈ 96 − 20: hai nửa mặt liền nhau ở giữa
    brow: { L: { x: 66, sx: 0.62 }, R: { x: 96, sx: 1 } },
    mouth: { dx: -19, sx: 0.85 }
  };
  function sphereShift(x0, turn, R) {
    var phi = TURN.phi * turn * Math.PI / 180, r = R || TURN.R;
    var th = Math.asin(Math.max(-0.99, Math.min(0.99, (x0 - 100) / r)));
    return { dx: r * Math.sin(th + phi) - (x0 - 100), sx: Math.cos(th + phi) / Math.cos(th) };
  }
  function turnWrap(content, dx, sx, cx) {
    if (!content || (Math.abs(dx) < 0.01 && Math.abs(sx - 1) < 0.001)) return content;
    return '<g transform="translate(' + (cx + dx).toFixed(2) + ' 0) scale(' + sx.toFixed(3) + ' 1) translate(' + (-cx) + ' 0)">' + content + '</g>';
  }
  // [lớp, x của chi tiết trên mặt cầu, bán kính hiệu dụng (vĩ độ cao → nhỏ), hệ số]
  var TURN_LAYERS = [
    ['mouth', 100, 40, 1], ['beard', 100, 40, 1], ['mustache', 100, 42, 1], ['cheeks', 100, 46, 0.9],
    ['hairFront', 100, 40, 0.75], ['hat', 100, 46, 0.45], ['fxHead', 100, 48, 0.5],
    ['ears', 100, 48, -0.25], ['hairBack', 100, 48, -0.45]
  ];
  // Hiệu ứng bám mặt (nước mắt, má hồng…) ở 45°: nửa trái ánh xạ theo mắt xa, nửa phải theo mắt gần — mọi hiệu ứng mặt tự đúng, không vẽ lại
  function faceRemap(c) {
    if (!c) return c;
    var L = Q45.eye.L, R = Q45.eye.R, d = '<defs><clipPath id="gcFaceL"><rect x="-60" y="-60" width="160" height="340"/></clipPath><clipPath id="gcFaceR"><rect x="100" y="-60" width="160" height="340"/></clipPath></defs>';
    return d + '<g clip-path="url(#gcFaceL)"><g transform="translate(' + L.x + ' 0) scale(' + L.sx + ' 1) translate(-80 0)">' + c + '</g></g>' +
      '<g clip-path="url(#gcFaceR)"><g transform="translate(' + R.x + ' 0) scale(' + R.sx + ' 1) translate(-120 0)">' + c + '</g></g>';
  }
  function layerShift(layer, turn, phi) {
    var save = TURN.phi; TURN.phi = phi;
    var r = null;
    TURN_LAYERS.forEach(function (t) {
      if (t[0] !== layer) return;
      var sh = sphereShift(t[1], turn, t[2]);
      r = { dx: sh.dx * t[3], sx: t[3] > 0 ? 1 - (1 - Math.abs(Math.cos(phi * turn * Math.PI / 180))) * 0.6 : 1, cx: t[1] };
    });
    if (!r && (layer === 'body' || layer === 'hem' || layer === 'backItem' || layer === 'head' || layer === 'shade' || layer === 'mask')) {
      var k = layer === 'body' ? 1 : layer === 'hem' ? 0.6 : layer === 'backItem' ? -0.5 : layer === 'shade' ? 0.3 : 0;
      var bs = sphereShift(100, turn * (phi === Q45.phi ? Q45.body : TURN.body), 36);
      r = { dx: bs.dx * k, sx: layer === 'body' || layer === 'hem' ? 0.95 : 1, cx: 100 };
    }
    TURN.phi = save;
    return r;
  }
  // phía sau đầu lộ ra khi quay là TÓC, không phải da: lưỡi liềm = hình đầu − chính nó dịch theo hướng quay, chỉ phần trên tai
  function crescentOf(C, turn, phi) {
    if (!C.shape) return '';
    var save = TURN.phi; TURN.phi = phi;
    var d = sphereShift(100, turn, 40).dx * 1.15;
    TURN.phi = save;
    var id = 'gcT' + String(C.asset.key || C.asset.id).replace(/[^a-zA-Z0-9]/g, '') + (turn < 0 ? 'l' : 'r') + phi;
    return '<defs><clipPath id="' + id + 'c"><path d="' + C.shape + '"/></clipPath>' +
      '<mask id="' + id + 'm" maskUnits="userSpaceOnUse" x="0" y="0" width="200" height="200"><path d="M0,0 L200,0 L200,104 C176,104 160,112 150,128 L50,128 C40,112 24,104 0,104 Z" fill="#fff"/>' +
      '<path transform="translate(' + d.toFixed(2) + ' 0)" d="' + C.shape + '" fill="#000"/></mask></defs>' +
      '<g clip-path="url(#' + id + 'c)"><g mask="url(#' + id + 'm)"><rect x="0" y="0" width="200" height="200" fill="' + C.P.hair + '"/>' +
      '<path transform="translate(' + d.toFixed(2) + ' 0)" d="' + C.shape + '" fill="none" stroke="' + INK + '" stroke-width="5"/></g></g>';
  }
  // tay phía xa (phía đang quay về) ra sau thân — chỉ khi tay đó đang buông; tay giơ lên/vươn ra thì vẫn ở trước
  function farArmBack(out, st, C, far) {
    var still = poseAt(C.asset, st, 0, true);
    if (Math.abs(still['arm' + far].rot) >= 50) return;
    ['arm', 'fore', 'held', 'hand'].forEach(function (k) { out[k + far + 'b'] = out[k + far]; out[k + far] = ''; });
    st.farArm = far;
  }
  function applyTurn(out, turn, st, C) {
    if (!turn || st.kind) return;   // góc vẽ thật (q45…q180) không trượt parallax
    // phía sau đầu lộ ra khi quay là TÓC, không phải da: lưỡi liềm = hình đầu − chính nó dịch theo hướng quay, chỉ phần trên tai
    var crescent = out.hairFront ? crescentOf(C, turn, TURN.phi) : '';
    TURN_LAYERS.forEach(function (t) {
      var sh = sphereShift(t[1], turn, t[2]);
      out[t[0]] = turnWrap(out[t[0]], sh.dx * t[3], t[3] > 0 ? 1 - (1 - Math.abs(Math.cos(TURN.phi * turn * Math.PI / 180))) * 0.6 : 1, t[1]);
    });
    if (crescent) out.hairFront = crescent + out.hairFront;   // sau bước trượt: dải tóc bám mép đầu, không trượt theo mái
    // thân quay ít hơn đầu: chi tiết giữa ngực (cổ áo, đai) trượt, thân hẹp lại một chút
    var bs = sphereShift(100, turn * TURN.body, 36);
    out.body = turnWrap(out.body, bs.dx, 0.95, 100);
    out.hem = turnWrap(out.hem, bs.dx * 0.6, 0.95, 100);
    out.backItem = turnWrap(out.backItem, -bs.dx * 0.5, 1, 100);
    farArmBack(out, st, C, turn < 0 ? 'L' : 'R');
  }

  /* ------------------------------------------------------------ 4. COMPOSE */
  var HEX = /^#[0-9a-fA-F]{3,8}$/;
  // pha hai màu hex (#rgb / #rrggbb, bỏ alpha): mixHex(a, b, t) = a·(1−t) + b·t. Màu không đọc được → trả a
  function hexRGB(h) {
    h = String(h || '');
    if (/^#[0-9a-fA-F]{3,4}$/.test(h)) return [parseInt(h[1] + h[1], 16), parseInt(h[2] + h[2], 16), parseInt(h[3] + h[3], 16)];
    if (/^#[0-9a-fA-F]{6}([0-9a-fA-F]{2})?$/.test(h)) return [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
    return null;
  }
  function mixHex(a, b, t) {
    var A = hexRGB(a), B = hexRGB(b);
    if (!A || !B) return a;
    return '#' + A.map(function (v, i) { var x = Math.round(v + (B[i] - v) * t); return (x < 16 ? '0' : '') + Math.max(0, Math.min(255, x)).toString(16); }).join('');
  }
  function palette(asset) {
    var P = {}, k;
    for (k in LIB.defaults) P[k] = LIB.defaults[k];
    // chỉ nhận mã màu hex: công thức có thể do người hoặc AI viết, không cho chèn markup vào SVG
    var src = asset.look.palette || {};
    for (k in src) if (HEX.test(String(src[k]))) P[k] = src[k];
    // token dẫn xuất (E7): nhân vật không tự khai báo thì tính từ token gốc của chính nó — cel shading theo màu thật, không dùng đen trong suốt
    for (k in LIB.derive) {
      var r = LIB.derive[k];
      if (!(own(src, k) && HEX.test(String(src[k]))) && own(P, r.from)) P[k] = mixHex(P[r.from], r.to, r.t);
    }
    return P;
  }
  // TÂM TRẠNG (E4): nhóm nét mặt đang hiện, suy từ mắt / mày / miệng đã resolve (đạo diễn ghi đè nét mặt thì tâm trạng đổi theo).
  // Linh kiện dữ liệu khai báo variants.mood.<mood | state id> để đổi lớp vẽ (tóc dựng, tai mèo cụp…) — engine chọn theo bảng này.
  var MOODS = ['calm', 'happy', 'shock', 'think', 'sad', 'angry', 'smug'];
  function moodOf(st) {
    var e = st.eyes, m = st.mouth, b = st.brows;
    if (e === 'angry' || e === 'fierce' || b === 'angry') return 'angry';
    if (e === 'wide' || m === 'oBig' || m === 'shout') return 'shock';
    if (e === 'spiral' || b === 'think' || st.id === 'think' || st.id === 'unsure') return 'think';
    if (e === 'empty' || e === 'teary' || m === 'wail' || m === 'wavy' || b === 'sad' || b === 'worried') return 'sad';
    if (e === 'smug') return 'smug';
    if (e === 'happy' || e === 'star' || m === 'laugh' || m === 'grin') return 'happy';
    return 'calm';
  }

  function num(v, def, min, max) {
    var n = typeof v === 'number' && isFinite(v) ? v : def;
    return Math.max(min, Math.min(max, n));
  }
  // Giá trị tham số đã kẹp vào khoảng cho phép
  function paramValues(asset, slot, defs) {
    var it = equipped(asset, slot);
    var raw = (it ? it.equip.params : ((asset.look.params || {})[slot])) || {}, out = {};
    for (var k in defs) out[k] = num(raw[k], defs[k].def, defs[k].min, defs[k].max);
    return out;
  }
  // Tham số kiểu transform: scale / scaleX / scaleY quanh pivot, dx / dy
  function paramTransform(defs, vals) {
    var t = '';
    for (var k in defs) {
      var d = defs[k], v = vals[k];
      if (v === d.def || !d.type) continue;
      var p = d.pivot || [100, 100];
      if (d.type === 'dx') t += ' translate(' + v + ' 0)';
      else if (d.type === 'dy') t += ' translate(0 ' + v + ')';
      else {
        var sx = d.type === 'scaleY' ? 1 : v, sy = d.type === 'scaleX' ? 1 : v;
        t += ' translate(' + p[0] + ' ' + p[1] + ') scale(' + sx + ' ' + sy + ') translate(' + (-p[0]) + ' ' + (-p[1]) + ')';
      }
    }
    return t.trim();
  }

  // copts.ink (v0.26): màu viền INK cho lần dựng này — thắng palette.ink của nhân vật, thắng hằng INK của engine
  function compose(asset, stateId, director, copts) {
    var st = resolveState(asset, stateId, director);
    st.mood = moodOf(st);
    var P = palette(asset);
    var ink = copts && HEX.test(String(copts.ink || '')) ? copts.ink : HEX.test(String(P.ink || '')) ? P.ink : INK;
    P.ink = ink;
    var head = getPart('head', partRef(asset, 'head'), asset.pack) || getPart('head', 'round');
    var mask = getPart('mask', partRef(asset, 'mask'), asset.pack);
    P.eyeArea = (mask && mask.eyeArea) || P.skin;
    var K = st.kind || null, Q = K === 'q45', BACK = !!BACK_KINDS[K];
    var shape = K === 'q90' ? head.shape90 || head.shape45 : K === 'q135' ? head.shape135 || head.shape : K === 'q45' ? head.shape45 : null;
    var C = { P: P, A: RIG.anchors, shape: shape || head.shape, ink: ink, asset: asset, flip: !!st.mirror, st: st, view: K || 'front' };
    var out = {};
    LAYER_IDS.forEach(function (l) { out[l] = ''; });

    // fb: linh kiện chưa có bản vẽ 45° → trượt parallax theo lớp
    function put(res, wrap, fb) {
      if (!res) return;
      for (var layer in res) {
        if (!(layer in out)) throw new Error(N_('lớp lạ: {id}', { id: layer }));
        var c = wrap ? '<g transform="' + wrap + '">' + res[layer] + '</g>' : res[layer];
        if (fb && c) { var sh = layerShift(layer, -1, Q45.phi); if (sh) c = turnWrap(c, sh.dx, sh.sx, sh.cx); }
        out[layer] += c;
      }
    }
    var fbSlots = [];

    Object.keys(LIB.slots).forEach(function (slot) {
      var ref = partRef(asset, slot);
      if (!ref) return;
      var p = getPart(slot, ref, asset.pack);
      if (!p) throw new Error(N_('thiếu linh kiện {slot}:{key}', { slot: slot, key: ref }));
      var vals = p.params ? paramValues(asset, slot, p.params) : {};
      var vk = K ? VIEW_FALLBACK[K].filter(function (k) { return p.views && p.views[k]; })[0] : null;
      var held = /^held[LR]$/.test(slot);
      var it = equipped(asset, slot);
      var Cs = it && it.equip.palette ? Object.assign({}, C, { P: Object.assign({}, C.P, it.equip.palette) }) : C;   // màu item chỉ áp lên linh kiện của nó
      var res = (vk ? p.views[vk] : p.draw)(Cs, st, vals);
      // 135° mượn bản sau lưng (cùng là góc thấy lưng) là bản vẽ thật, không phải dự phòng — không đè tóc bằng lớp tóc sau
      if (K && vk !== K && !(BACK && BACK_KINDS[vk]) && res && !held) fbSlots.push(slot + ':' + p.id);
      // không có bản vẽ nghiêng nào: trượt parallax tạm (chỉ các góc thấy mặt)
      put(res, p.params ? paramTransform(p.params, vals) : '', K && !vk && !held && !BACK);
    });

    // đạo cụ của tư thế / di chuyển / động tác / hoạt động. Đạo cụ GẮN KHỚP TAY (E8: prop.anchor, z mặc định 'front') vẽ SAU bàn tay → xếp hàng, không bị đồ cầm tay / bàn tay đè
    var late = [];
    function putProp(id, side) { var pr = LIB.props[id]; if (pr.anchor && pr.anchor.z !== 'held') late.push([pr, side]); else put(pr.draw(C, st, side)); }
    st.props.forEach(function (id) { putProp(id); });

    // đồ cầm tay: động tác cần tay trống thì cất; đồ dài cất khi tay đưa vào giữa mặt;
    // động tác cầm đạo cụ riêng (bát, sách, bút…) thì thay đồ của nhân vật
    var mo = LIB.motions[st.motion] || {};
    var hide = (mo.hide || []).concat(director && Array.isArray(director.hide) ? director.hide.filter(function (x) { return /^(held|tall)[LR]$/.test(x); }) : []);   // biên đạo (choreo) cất / rút binh khí
    if (handsBusy(st)) hide.push('heldL', 'heldR');
    ['L', 'R'].forEach(function (s) {
      var pid = mo.hold && mo.hold[s];
      if (pid && LIB.props[pid] && !handsBusy(st)) { out['held' + s] = ''; putProp(pid, s); hide = hide.filter(function (x) { return x !== 'held' + s; }); hide.push('keep' + s); }
    });
    st.upright = {};
    ['L', 'R'].forEach(function (s) {
      var ref = partRef(asset, 'held' + s);
      var p = ref && ref !== 'none' ? getPart('held' + s, ref, asset.pack) : null;
      st.upright[s] = !!p && p.upright !== false;
      if (hide.indexOf('keep' + s) >= 0) { st.upright[s] = false; return; }
      if (hide.indexOf('held' + s) >= 0 || (p && p.tall && hide.indexOf('tall' + s) >= 0)) out['held' + s] = '';
    });
    out.handL += hand(C, 'L');
    out.handR += hand(C, 'R');
    late.forEach(function (x) { put(x[0].draw(C, st, x[1])); });

    // khuôn mặt = kiểu (theo công thức, có tham số) × dáng (theo trạng thái)
    var es = LIB.eyeStyles[asset.look.eyes] || LIB.eyeStyles.round;
    var ep = (es.poses && own(es.poses, st.eyes) && es.poses[st.eyes]) || LIB.eyePoses[st.eyes];   // E9: kiểu mắt có thể mang bộ dáng mắt riêng
    if (!ep) throw new Error(N_('thiếu dáng mắt {id}', { id: st.eyes }));
    var ev = paramValues(asset, 'eyes', EYE_PARAMS);
    if (!BACK) [-1, 1].forEach(function (side) {
      if (K === 'q90' && side < 0) return;   // nhìn ngang: mắt xa khuất sau sống mũi
      var a = side < 0 ? C.A.eyeL : C.A.eyeR;
      var x = a[0] + side * ev.gap, y = a[1] + ev.y;
      var tw = K === 'q90' ? { dx: Q90.eye.x - x, sx: Q90.eye.sx } : Q ? { dx: Q45.eye[side < 0 ? 'L' : 'R'].x + side * ev.gap - x, sx: Q45.eye[side < 0 ? 'L' : 'R'].sx } : st.turnLocal ? sphereShift(x, st.turnLocal) : { dx: 0, sx: 1 };
      out.eyes += turnWrap('<g transform="translate(' + x + ' ' + y + ') scale(' + ev.size + ') translate(' + (-x) + ' ' + (-y) + ')">' + ep(es, side, x, y, C) + '</g>', tw.dx, tw.sx, x);
    });
    // Chớp mắt chạy trên nhóm con này. KHÔNG đặt animation CSS lên chính nhóm lớp (data-l):
    // thuộc tính CSS transform sẽ đè transform của khung xương và lớp đó đứng yên khi đầu chuyển động.
    out.eyes = '<g class="gc-eyes">' + out.eyes + '</g>';

    var bs = LIB.browStyles[asset.look.brows] || LIB.browStyles.normal;
    var bp = LIB.browPoses[st.brows];
    if (!bp) throw new Error(N_('thiếu dáng mày {id}', { id: st.brows }));
    var bv = paramValues(asset, 'brows', BROW_PARAMS);
    if (!BACK) [-1, 1].forEach(function (side) {
      if (K === 'q90' && side < 0) return;
      var bx = (side < 0 ? C.A.browL : C.A.browR)[0];
      var tw = K === 'q90' ? { dx: Q90.brow.x - bx, sx: Q90.brow.sx } : Q ? { dx: Q45.brow[side < 0 ? 'L' : 'R'].x - bx, sx: Q45.brow[side < 0 ? 'L' : 'R'].sx } : st.turnLocal ? sphereShift(bx, st.turnLocal, 46) : { dx: 0, sx: 1 };
      out.brows += turnWrap(brow(bs, bp, side, C, bv), tw.dx, tw.sx, bx);
    });

    var m = LIB.mouths[st.mouth];
    if (!m) throw new Error(N_('thiếu dáng miệng {id}', { id: st.mouth }));
    var mv = paramValues(asset, 'mouth', MOUTH_PARAMS);
    var mouthG = '<g transform="translate(0 ' + mv.y + ') translate(100 131) scale(' + mv.size + ') translate(-100 -131)">' + m(C) + '</g>';
    if (!BACK) out.mouth += K === 'q90' ? turnWrap(mouthG, Q90.mouth.dx, Q90.mouth.sx, 100) : Q ? turnWrap(mouthG, Q45.mouth.dx, Q45.mouth.sx, 100) : mouthG;

    st.fx.forEach(function (id) {
      var f = LIB.fx[id];
      if (!f) throw new Error(N_('thiếu hiệu ứng {id}', { id: id }));
      if (f.face && BACK) return;   // hiệu ứng bám mặt không thấy từ phía sau
      if (f.face && (Q || K === 'q90')) { var r = f.draw(C); for (var l in r) out[l] += faceRemap(r[l]); }
      else put(f.draw(C), '', true);
    });
    applyTurn(out, st.turnLocal, st, C);
    if (TURNED[K]) {
      // tóc chưa có bản vẽ góc này: thêm lưỡi liềm tóc phía sau đầu; tay xa ra sau thân; hiệu ứng nền (bụi, gió) đổi phía
      if (!BACK && fbSlots.some(function (x) { return x.indexOf('hair:') === 0; })) out.hairFront = crescentOf(C, -1, Q45.phi) + out.hairFront;
      farArmBack(out, st, C, 'L');
      if (out.fxBack) out.fxBack = '<g transform="translate(200 0) scale(-1 1)">' + out.fxBack + '</g>';
    }
    if (BACK) {
      // thấy lưng: không khuôn mặt; đồ sau lưng (áo choàng, bao) ra trước thân; tóc phía sau thành lớp trước đầu
      FACE_LAYERS.forEach(function (l) { out[l] = ''; });
      if (out.backItem) { out.body += out.backItem; out.backItem = ''; }
      // tóc chưa có bản lưng: lớp tóc sau lên trước; không có cả lớp đó thì khung tự phủ mảng tóc theo viền đầu (không để đầu trọc — CNS-024)
      if (fbSlots.some(function (x) { return x.indexOf('hair:') === 0; })) {
        out.hairFront = out.hairBack || '<path d="' + C.shape + '" fill="' + (C.P.hair || '#2a2420') + '" stroke="' + INK + '" stroke-width="2.8" stroke-linejoin="round"/>';
        out.hairBack = '';
      }
      // sau lưng hẳn: đồ cầm tay khuất sau thân
      if (K === 'q180') ['L', 'R'].forEach(function (s) { out['held' + s + 'b'] += out['held' + s]; out['held' + s] = ''; });
    }
    if (K) st.fallback45 = fbSlots;
    if (ink !== INK) for (var il in out) if (out[il]) out[il] = out[il].split(INK).join(ink);   // mã engine vẽ bằng hằng INK → đổi sang màu viền của lần dựng
    // nằm: cả người xoay theo root; hiệu ứng ở fxFront/fxBack (chữ Zzz, !!, pháo giấy) xoay ngược quanh đầu để luôn đứng thẳng
    var rr = ((LIB.postures[st.posture] || {}).base || {}).root;
    if (rr && rr.rot) ['fxFront', 'fxBack'].forEach(function (l) {
      if (out[l]) out[l] = '<g transform="rotate(' + (-rr.rot) + ' 100 100)">' + out[l] + '</g>';
    });
    return { layers: out, state: st, ink: ink };
  }

  // Tham số khuôn mặt của engine (mọi kiểu mắt/mày/miệng đều hưởng)
  var EYE_PARAMS = {
    size: { label: 'Cỡ mắt', min: 0.7, max: 1.45, step: 0.05, def: 1 },
    gap: { label: 'Khoảng cách hai mắt', min: -5, max: 6, step: 0.5, def: 0 },
    y: { label: 'Độ cao mắt', min: -6, max: 6, step: 0.5, def: 0 }
  };
  var BROW_PARAMS = {
    y: { label: 'Độ cao mày', min: -6, max: 6, step: 0.5, def: 0 },
    weight: { label: 'Độ dày mày', min: 0.6, max: 1.8, step: 0.1, def: 1 }
  };
  var MOUTH_PARAMS = {
    size: { label: 'Cỡ miệng', min: 0.7, max: 1.4, step: 0.05, def: 1 },
    y: { label: 'Độ cao miệng', min: -4, max: 5, step: 0.5, def: 0 }
  };
  // size: E2 — hạ cận dưới 0,85 → 0,6 (đầu ≈ thân kiểu mascot dùng 0,9; tỉ lệ cao dùng 0,72). Mặc định 1 giữ nguyên.
  // legs: E3 — chân dài (đùi giãn, cẳng giữ nguyên, thân nâng đúng phần chân dôi ra); 1 = như cũ
  var HEAD_PARAMS = {
    size: { label: 'Cỡ đầu (tỉ lệ chibi)', min: 0.6, max: 1.2, step: 0.01, def: 1 },
    legs: { label: 'Chân dài', min: 1, max: 1.8, step: 0.05, def: 1 }
  };
  var FACE_PARAMS = { eyes: EYE_PARAMS, brows: BROW_PARAMS, mouth: MOUTH_PARAMS, rig: HEAD_PARAMS };

  function hand(C, side) {
    var g = side === 'L' ? C.A.gripL : C.A.gripR;
    return '<circle cx="' + g[0] + '" cy="' + g[1] + '" r="7.5" fill="' + C.P.skin + '" stroke="' + INK + '" stroke-width="2.6"/>' +
      '<path d="M' + (g[0] - 4) + ',' + (g[1] + 2) + ' q4,3 8,0" fill="none" stroke="' + C.P.skinShade + '" stroke-width="1.6" stroke-linecap="round"/>';
  }

  function brow(S, pose, side, C, bv) {
    var c = side < 0 ? C.A.browL : C.A.browR;
    // rot > 0 = đầu trong cụp xuống (giận); mày phải lấy rotR/dyR nếu dáng lệch hai bên
    var rIn = side > 0 && pose.rotR !== undefined ? pose.rotR : (pose.rot || 0);
    var dy = side > 0 && pose.dyR !== undefined ? pose.dyR : (pose.dy || 0);
    var x = c[0], y = c[1] + dy + bv.y;
    var rot = side < 0 ? rIn : -rIn;
    var half = S.len / 2, arc = pose.arc === undefined ? 2 : pose.arc;
    var d = 'M' + (x - half) + ',' + y + ' Q' + x + ',' + (y - arc) + ' ' + (x + half) + ',' + y;
    return '<path d="' + d + '" fill="none" stroke="' + (C.P.brow || C.P.hair) + '" stroke-width="' + (S.w * bv.weight).toFixed(2) +
      '" stroke-linecap="round" transform="rotate(' + rot + ' ' + x + ' ' + y + ')"/>';
  }

  /* ------------------------------------------------------------- 5. MOTION */
  function neutralPose() {
    var p = {};
    JOINT_IDS.forEach(function (j) { p[j] = { x: 0, y: 0, rot: 0, sx: 1, sy: 1 }; });
    return p;
  }

  function sampleKeys(keys, u) {
    if (keys.length === 1 || u <= keys[0][0]) return keys[0][1];
    for (var i = 0; i < keys.length - 1; i++) {
      var a = keys[i], b = keys[i + 1];
      if (u <= b[0]) {
        var s = (u - a[0]) / Math.max(1e-6, b[0] - a[0]);
        s = s * s * (3 - 2 * s);
        return a[1] + (b[1] - a[1]) * s;
      }
    }
    return keys[keys.length - 1][1];
  }

  function handsBusy(st) { var z = LIB.postures[st.posture] || {}; return !!(z.handsBusy || z.hideHeld); }
  function isArm(j) { return /^(arm|fore|hand)[LR]$/.test(j); }
  function phase(def, t, still) {
    if (still) return def.still || 0;
    return def.loop === false ? Math.min(1, t / def.dur) : (t % def.dur) / def.dur;
  }
  function addTracks(pose, tracks, u, skip) {
    for (var j in tracks) {
      if (!pose[j] || (skip && skip(j))) continue;
      for (var ch in tracks[j]) {
        var v = sampleKeys(tracks[j][ch], u);
        if (ch === 'sx' || ch === 'sy') pose[j][ch] *= v; else pose[j][ch] += v;
      }
    }
  }

  // Tư thế đích tại thời điểm t (giây). still = khung đứng yên đại diện (dùng cho ảnh cache).
  // Ghép 4 lớp như animation layer của game engine:
  //   tư thế nền (đặt giá trị) → di chuyển (cộng dồn) → động tác (tay: thay thế; thân, đầu: cộng dồn) → hướng nhìn.
  // Tay: động tác thay thế, trừ khi tư thế bận tay (bò, bơi) hoặc động tác chỉ là mặc định của biểu cảm mà di chuyển có vung tay.
  function poseAt(asset, st, t, still) {
    var m = LIB.motions[st.motion] || LIB.motions.idle;
    var pz = LIB.postures[st.posture] || LIB.postures.stand || {};
    var mv = st.move && LIB.moves[st.move];
    var pose = neutralPose();
    var base = pz.base || {};
    for (var bj in base) for (var bc in base[bj]) if (pose[bj]) pose[bj][bc] = base[bj][bc];
    var mvArms = false;
    if (mv) {
      addTracks(pose, mv.tracks, phase(mv, t, still));
      mvArms = Object.keys(mv.tracks).some(isArm);
    }
    var u = phase(m, t, still);
    // động tác mặc định của biểu cảm (không ai chọn rõ) nhường tay cho di chuyển; động tác được chọn rõ thì giữ tay
    var armsOff = pz.handsBusy || (mvArms && !st.explicitMotion);
    for (var j in m.tracks) {
      if (!pose[j]) continue;
      if (isArm(j)) {
        if (armsOff) continue;
        for (var ch in m.tracks[j]) {
          var v = sampleKeys(m.tracks[j][ch], u);
          pose[j][ch] = (ch === 'sx' || ch === 'sy') ? (base[j] && base[j][ch] !== undefined ? base[j][ch] : 1) * v : (base[j] && base[j][ch] || 0) + v;
        }
      } else addTrackJoint(pose, j, m.tracks[j], u);
    }
    if (m.breath !== false && !still && !pz.noBreath) pose.body.sy *= 1 + Math.sin(t * 2.4) * 0.012;
    if (TURNED[st.kind]) {
      // bản chuẩn 45° / 90° / 135° quay trái: dữ liệu động tác viết cho hướng phải → đảo x/góc của thân để nghiêng, lắc về phía trước mặt
      ['root', 'pelvis', 'body', 'head', 'hem'].forEach(function (j) { pose[j].x = -pose[j].x; pose[j].rot = -pose[j].rot; });
    }
    // "trọng lực" cho đồ cầm tay: nếu động tác không tự điều khiển bàn tay,
    // bàn tay xoay ngược tổng góc các khớp cha để binh khí luôn đứng thẳng
    ['L', 'R'].forEach(function (s) {
      if (!st.upright || !st.upright[s] || (!armsOff && m.tracks['hand' + s] && m.tracks['hand' + s].rot)) return;
      pose['hand' + s].rot = -(pose['arm' + s].rot + pose['fore' + s].rot + pose.body.rot + pose.pelvis.rot + pose.root.rot);
    });
    return finishPose(asset, st, pose);
  }
  // bước chung cuối mọi tư thế (động tác lặp lẫn biên đạo choreo): cỡ đầu theo tham số, vai / hông trượt khi quay 3/4, lật gương
  function finishPose(asset, st, pose) {
    var rv = paramValues(asset, 'rig', HEAD_PARAMS), hs = rv.size;
    pose.head.sx *= hs; pose.head.sy *= hs;
    if (rv.legs !== 1) stretchLegs(st, pose, rv.legs);
    if (st.turnLocal) {
      // thân quay ít hơn đầu: vai và hông trượt về phía quay, vai xa thu vào trong nhiều hơn
      var tb = st.turnLocal * (TURNED[st.kind] ? Q45.body : TURN.body), near = st.turnLocal < 0 ? 'R' : 'L', far = near === 'R' ? 'L' : 'R';
      var inward = function (s) { return s === 'L' ? 1 : -1; };
      pose['arm' + far].x += inward(far) * 9 * Math.abs(tb) + tb * -4;
      pose['arm' + near].x += inward(near) * 3 * Math.abs(tb) + tb * -4;
      pose['thigh' + far].x += inward(far) * 4 * Math.abs(tb);
      pose['thigh' + near].x += tb * -2;
      if (TURNED[st.kind]) ['L', 'R'].forEach(function (sd) {
        var a = Math.abs(pose['arm' + sd].rot);
        if (a > 110) pose['arm' + sd].x += (st.kind === 'q90' ? Q90 : Q45).mouth.dx * Math.min(1, (a - 110) / 30);
      });
      // nhìn ngang: vai và hông phía xa thu hẳn vào sau thân
      if (st.kind === 'q90') { pose.armL.x += 7; pose.thighL.x += 5; pose.thighR.x -= 2; }
    }
    if (st.mirror) pose.root.sx *= -1;
    return pose;
  }
  // Chân dài (E3): đùi giãn L lần dọc trục đùi, cẳng co lại 1/L để cẳng + bàn chân giữ nguyên cỡ (đoạn chân dôi ra = 9·(L−1) đơn vị: từ gối y=203 → 212);
  // thân nâng đúng đoạn đó × mức chân đang chống đất (đùi đang co lại khi ngồi / nhấc chân thì nâng ít hơn) để bàn chân vẫn chạm đất.
  // Tư thế nằm / bay / bơi (posture.noLegLift) không nâng: không có mặt đất dưới chân.
  var LEG_UNIT = 9;
  function stretchLegs(st, pose, L) {
    var support = Math.max(0, Math.min(1, Math.max(pose.thighL.sy, pose.thighR.sy)));
    ['L', 'R'].forEach(function (s) { pose['thigh' + s].sy *= L; pose['shin' + s].sy /= L; });
    if (!(LIB.postures[st.posture] || {}).noLegLift) pose.root.y -= LEG_UNIT * (L - 1) * support;
  }
  function addTrackJoint(pose, j, chans, u) {
    for (var ch in chans) {
      var v = sampleKeys(chans[ch], u);
      if (ch === 'sx' || ch === 'sy') pose[j][ch] *= v; else pose[j][ch] += v;
    }
  }
  // Bóng đổ: co lại khi nhân vật rời mặt đất (nhảy, bay), giãn khi nằm
  function shadowOf(st, pose) {
    var sh = (LIB.postures[st.posture] || {}).shadow || {};
    var lift = Math.max(0, -pose.root.y - (sh.lift0 || 0));
    var k = Math.max(0.3, 1 - lift / 70);
    return { rx: 46 * (sh.sx || 1) * k, ry: 7 * k, op: (sh.op === undefined ? 1 : sh.op) * k, cx: 100 + (sh.dx || 0) * (st.mirror ? -1 : 1) };
  }

  function jointLocal(j, p) {
    var pv = RIG.joints[j].pivot;
    return 'translate(' + (pv[0] + p.x).toFixed(2) + ' ' + (pv[1] + p.y).toFixed(2) + ') rotate(' +
      p.rot.toFixed(2) + ') scale(' + p.sx.toFixed(3) + ' ' + p.sy.toFixed(3) + ') translate(' + (-pv[0]) + ' ' + (-pv[1]) + ')';
  }
  // điểm mốc cơ thể của một tư thế (toạ độ khung 200×240): ghép ma trận affine theo chuỗi khớp — đúng phép biến đổi SVG ở chainTransforms.
  // Dùng đo KHOẢNG CÁCH HÌNH BÓNG giữa các tư thế (v0.15: tư thế phải khác nhau rõ, không chỉ khác khuôn mặt — Ryan)
  var KEYPOINTS = { head: ['head', 100, 96], chest: ['body', 100, 170], pelvis: ['pelvis', 100, 202], elbowL: ['foreL', 74, 177], elbowR: ['foreR', 126, 177],
    handL: ['handL', 72, 193], handR: ['handR', 128, 193], kneeL: ['shinL', 89, 212], kneeR: ['shinR', 111, 212], footL: ['footL', 87, 225], footR: ['footR', 113, 225] };
  function matMul(A, B) { return [A[0] * B[0] + A[2] * B[1], A[1] * B[0] + A[3] * B[1], A[0] * B[2] + A[2] * B[3], A[1] * B[2] + A[3] * B[3], A[0] * B[4] + A[2] * B[5] + A[4], A[1] * B[4] + A[3] * B[5] + A[5]]; }
  // ma trận affine [a b c d e f] của từng khớp (toạ độ khung → toạ độ khung đã biến đổi) — choreo dùng tìm mũi binh khí, chân, đầu
  function jointMatrices(pose) {
    var M = {};
    JOINT_IDS.forEach(function (j) {
      var p = pose[j], pv = RIG.joints[j].pivot, par = RIG.joints[j].parent, r = p.rot * Math.PI / 180, c = Math.cos(r), s = Math.sin(r);
      var a = c * p.sx, b = s * p.sx, c2 = -s * p.sy, d = c * p.sy, tx = pv[0] + p.x, ty = pv[1] + p.y;
      var L = [a, b, c2, d, tx - (a * pv[0] + c2 * pv[1]), ty - (b * pv[0] + d * pv[1])];
      M[j] = par ? matMul(M[par], L) : L;
    });
    return M;
  }
  function keyPoints(pose) {
    var M = jointMatrices(pose), out = {};
    for (var k in KEYPOINTS) { var q = KEYPOINTS[k], m = M[q[0]]; out[k] = [m[0] * q[1] + m[2] * q[2] + m[4], m[1] * q[1] + m[3] * q[2] + m[5]]; }
    return out;
  }
  function poseDistance(p1, p2) {
    var a = keyPoints(p1), b = keyPoints(p2), s = 0, n = 0;
    for (var k in a) { s += Math.sqrt(Math.pow(a[k][0] - b[k][0], 2) + Math.pow(a[k][1] - b[k][1], 2)); n++; }
    return s / n;
  }
  function chainTransforms(pose) {
    var chain = {};
    JOINT_IDS.forEach(function (j) {
      var par = RIG.joints[j].parent;
      chain[j] = (par ? chain[par] + ' ' : '') + jointLocal(j, pose[j]);
    });
    return chain;
  }

  // SVG tĩnh hoàn chỉnh (dùng cho ảnh cache, xuất file, gate). Không cần DOM.
  function svgString(asset, stateId, opts) {
    opts = opts || {};
    var vb = (opts.crop ? RIG.crop : RIG.box).join(' ');
    return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="' + vb + '"' + (opts.size ? ' width="' + opts.size + '" height="' + opts.size + '"' : '') + '>' + svgBody(asset, stateId, opts) + '</svg>';
  }
  // Ruột SVG của nhân vật (toạ độ khung xương, chân ở 100,228) — để cảnh đặt nhân vật vào chỗ đứng
  function svgBody(asset, stateId, opts) {
    opts = opts || {};
    var c = compose(asset, stateId, opts.director, opts);
    // opts.t: vẽ đúng khung hình tại giây thứ t (xuất sprite sheet, kiểm chuyển động); mặc định khung đứng yên đại diện
    var pose = poseAt(asset, c.state, opts.t || 0, typeof opts.t !== 'number');
    var chain = chainTransforms(pose);
    var s = '';
    if (!opts.noShadow && !opts.crop) {
      var sd = shadowOf(c.state, pose);
      s += '<ellipse cx="' + sd.cx.toFixed(1) + '" cy="229" rx="' + sd.rx.toFixed(1) + '" ry="' + sd.ry.toFixed(1) + '" fill="rgba(20,24,22,' + (0.16 * sd.op).toFixed(3) + ')"/>';
    }
    // E6: viền ngoài + viền dán nướng vào path — vẽ lại hình bóng các lớp (stroke rộng) NẰM DƯỚI mọi lớp thật, không dùng filter
    var ol = normalizeOutline(opts.outline, c.ink);
    if (ol) {
      var parts = outlineParts(c.layers, ol, jointScales(pose)), w = '', k = '';
      JOINT_IDS.forEach(function (j) { if (parts[j]) { w += parts[j][0] ? '<g transform="' + chain[j] + '">' + parts[j][0] + '</g>' : ''; k += '<g transform="' + chain[j] + '">' + parts[j][1] + '</g>'; } });
      s += '<g class="gc-outline">' + w + k + '</g>';
    }
    RIG.layers.forEach(function (l) {
      if (c.layers[l[0]]) s += '<g transform="' + chain[l[1]] + '">' + c.layers[l[0]] + '</g>';
    });
    return s;
  }

  /* ------------------------------------------- 5b. VIỀN NƯỚNG VÀO PATH (E6) */
  // opts.outline = { color?, width?, sticker? } — color mặc định = màu INK của lần dựng · width 0,5–12 (mặc định 3, tính bằng đơn vị khung, KHÔNG đổi theo cỡ khớp)
  // sticker: true | số (độ dày dải trắng, mặc định 3,4) | { width?, color? } · skip: ['fxBack', …] lớp không viền.
  // Viền = chính các hình vẽ của từng lớp, tô lại bằng một màu + stroke rộng (trắng rồi ink), đặt DƯỚI các lớp thật → không có filter (L-42).
  // Chi tiết mờ (opacity < 0,5: đổ bóng, má hồng) và nét mảnh (stroke < 3,5, không tô) bị bỏ khỏi hình bóng cho nhẹ — chúng nằm trong thân.
  function normalizeOutline(o, ink) {
    if (!o) return null;
    if (o === true) o = {};
    if (typeof o !== 'object') return null;
    var st = o.sticker, r = { width: num(o.width, 3, 0.5, 12), color: HEX.test(String(o.color || '')) ? o.color : ink, sticker: null, skip: {} };
    if (st === true) r.sticker = { width: 3.4, color: '#ffffff' };
    else if (typeof st === 'number' && isFinite(st) && st > 0) r.sticker = { width: num(st, 3.4, 0.5, 12), color: '#ffffff' };
    else if (st && typeof st === 'object') r.sticker = { width: num(st.width, 3.4, 0.5, 12), color: HEX.test(String(st.color || '')) ? st.color : '#ffffff' };
    (Array.isArray(o.skip) ? o.skip : []).forEach(function (l) { if (LAYER_IDS.indexOf(l) >= 0) r.skip[l] = 1; });
    return r;
  }
  var SIL_DROP = /^(defs|clipPath|mask|linearGradient|radialGradient|filter|style|title|desc|symbol|pattern|marker)$/;
  var SIL_SHAPE = /^(path|circle|ellipse|rect|polygon|polyline|line|text)$/;
  var SIL_TAG = /<(\/?)([A-Za-z][\w:-]*)((?:"[^"]*"|'[^']*'|[^>"'])*?)(\/?)>/g;
  var SIL_ATTR = /([A-Za-z_:][\w:.-]*)\s*=\s*"([^"]*)"/g;
  var SIL_PAINT = { fill: 1, stroke: 1, 'stroke-width': 1, 'fill-opacity': 1, 'stroke-opacity': 1, opacity: 1, 'stroke-linecap': 1, 'stroke-linejoin': 1, 'stroke-dasharray': 1, 'stroke-dashoffset': 1 };
  // hình bóng của một mảng SVG: specs = [{ color, grow }] → chuỗi SVG cho từng spec (dựng cùng một lượt duyệt)
  function silhouette(svg, specs) {
    var outs = specs.map(function () { return ''; }), drop = 0, inText = 0, last = 0, m, i;
    SIL_TAG.lastIndex = 0;
    while ((m = SIL_TAG.exec(svg))) {
      var gap = svg.slice(last, m.index); last = SIL_TAG.lastIndex;
      if (inText && !drop && gap) for (i = 0; i < outs.length; i++) outs[i] += gap;
      var close = m[1] === '/', tag = m[2], self = m[4] === '/';
      if (drop) { if (close) drop--; else if (!self) drop++; continue; }
      if (close) {
        if (tag === 'g' || tag === 'text') { if (tag === 'text') inText = 0; for (i = 0; i < outs.length; i++) outs[i] += '</' + tag + '>'; }
        continue;
      }
      if (SIL_DROP.test(tag)) { if (!self) drop = 1; continue; }
      if (tag === 'g') { for (i = 0; i < outs.length; i++) outs[i] += '<g' + m[3] + (self ? '/>' : '>'); continue; }
      if (!SIL_SHAPE.test(tag)) continue;
      var rest = '', a = {}, am;
      SIL_ATTR.lastIndex = 0;
      while ((am = SIL_ATTR.exec(m[3]))) { if (SIL_PAINT[am[1]]) a[am[1]] = am[2]; else rest += ' ' + am[1] + '="' + am[2] + '"'; }
      var filled = tag !== 'line' && a.fill !== 'none', sw = a['stroke-width'] !== undefined ? +a['stroke-width'] : 1;
      var hasStroke = a.stroke !== undefined && a.stroke !== 'none';
      if ((a['fill-opacity'] !== undefined && +a['fill-opacity'] < 0.5 && filled) || (a.opacity !== undefined && +a.opacity < 0.5)) continue;   // đổ bóng, má hồng: nằm trong thân
      var base;
      if (filled) base = hasStroke && isFinite(sw) ? sw : 0;
      else { if (!hasStroke || !isFinite(sw) || sw < 3.5) continue; base = sw; }   // nét mảnh không tô: chi tiết trong thân
      for (i = 0; i < outs.length; i++) {
        outs[i] += '<' + tag + rest + (filled ? ' fill="' + specs[i].color + '"' : ' fill="none"') + ' stroke="' + specs[i].color + '" stroke-width="' + f1n(base + 2 * specs[i].grow) +
          '" stroke-linejoin="round" stroke-linecap="round"' + (self ? '/>' : '>');
      }
      if (tag === 'text' && !self) inText = 1;
    }
    return outs;
  }
  // độ co giãn đều của từng khớp (căn bậc hai |det|, kẹp 0,6–1,8) — để bề dày viền tính ở không gian màn hình: đầu thu 0,9 vẫn viền đủ dày
  function jointScales(pose) {
    var M = jointMatrices(pose), r = {};
    JOINT_IDS.forEach(function (j) { var m = M[j], d = Math.sqrt(Math.abs(m[0] * m[3] - m[1] * m[2])); r[j] = Math.max(0.6, Math.min(1.8, d || 1)); });
    return r;
  }
  // → { khớp: [chuỗi viền dán (trắng) hoặc '', chuỗi viền ink] } — gộp mọi lớp cùng khớp (hợp hình bóng không cần thứ tự lớp)
  function outlineParts(layers, ol, scales) {
    var by = {}, st = ol.sticker;
    RIG.layers.forEach(function (l) {
      var c = layers[l[0]];
      if (!c || ol.skip[l[0]]) return;
      var j = l[1], k = scales ? scales[j] : 1;
      var specs = st ? [{ color: st.color, grow: (ol.width + st.width) / k }, { color: ol.color, grow: ol.width / k }] : [{ color: ol.color, grow: ol.width / k }];
      var r = silhouette(c, specs);
      if (!r[0] && (!r[1] || !r[1].length)) return;
      var e = by[j] || (by[j] = ['', '']);
      if (st) { e[0] += r[0]; e[1] += r[1]; } else e[1] += r[0];
    });
    return by;
  }

  /* ----------------------------------------------------------- 6. DIRECTOR */
  function castIds(cast) { return cast.map(function (a) { return a.id; }); }
  // từ vựng dàn dựng phim (engine/player.js dùng; âm thanh tổng hợp ở engine/audio.js)
  var FILM_CAMERAS = ['auto', 'wide', 'two', 'close'];
  var FILM_BUBBLES = ['say', 'shout', 'think', 'whisper'];
  // 17 tên âm cũ (v0.17) — từ vựng công khai, luôn hợp lệ; từ v0.18 step.sfx nhận MỌI tên trong thư viện âm (engine/sounds.js: bộ chuẩn + gói của dự án)
  var FILM_SFX = ['pop', 'whoosh', 'step', 'sting', 'hit', 'boing', 'sparkle', 'rumble', 'drip', 'sad', 'snore', 'party', 'hmm', 'gong', 'chime', 'swish', 'tick'];
  // âm đưa vào lược đồ / lời nhắc đạo diễn: GC.sounds.allowedSounds — cùng MỘT hàm với S6 (lint) và bộ phát (CNS-104): dự án quyết theo o.project / o.work (tác phẩm),
  // không có thì dự phòng theo dàn diễn viên; không cả cast lẫn dự án thì mọi âm đã nạp. Chưa nạp sounds.js thì 17 tên cũ.
  // Bộ kiểm (validateEvent) nhận mọi âm đã nạp; âm của dự án khác bị luật S6 của lintSoundTrack chặn lúc lưu tác phẩm.
  function filmSounds() { return G.GenChibi && G.GenChibi.sounds || null; }
  function filmSfx(cast, o) {
    var S = filmSounds();
    if (!S) return FILM_SFX.slice();
    if (!cast && !(o && (o.work || typeof o.project === 'string'))) return S.names();
    return S.allowedSounds({ work: o && o.work, project: o && o.project, cast: cast });
  }
  // từ vựng HÀNH ĐỘNG (biên đạo, v0.15) nằm ở engine/choreo.js + kinds/character/gen.choreo.js — chưa nạp thì kịch bản không có action
  // cast (tuỳ chọn): chỉ đòn của KHUNG + đòn của gói động tác thuộc dự án của dàn diễn viên (prompt / lược đồ không phình theo mọi gói — CNS-046);
  // bộ kiểm vẫn nhận mọi đòn đã nạp (gọi không kèm cast)
  function filmActions(cast) {
    var C = G.GenChibi && G.GenChibi.choreo, all = (C && C.ACTIONS) || {}, act = all;
    if (cast && C && C.PACKS) {
      var pj = {}; cast.forEach(function (a) { pj[a.project || ''] = 1; });
      act = {}; Object.keys(all).forEach(function (k) { var pk = all[k].pack, P = C.PACKS[pk]; if (pk === C.FRAME_PACK || !P || !P.project || pj[P.project]) act[k] = all[k]; });   // gói không thuộc dự án nào = gói chung
    }
    return { act: act, react: (C && C.REACTS) || {} };
  }
  // o (tuỳ chọn) = { project | work }: dự án của TÁC PHẨM quyết âm nào được mời (xem filmSfx)
  function directorSchema(cast, o) {
    var FA = filmActions(cast);
    return {
      $schema: 'https://json-schema.org/draft/2020-12/schema',
      title: 'gen-chibi event', type: 'object', required: ['title', 'steps'], additionalProperties: false,
      properties: {
        title: { type: 'string', maxLength: 60 },
        scene: { enum: SCENE_ORDER.slice() },
        steps: {
          type: 'array', minItems: 1, maxItems: 12,
          items: {
            type: 'object', required: ['actor', 'state', 'say'], additionalProperties: false,
            properties: {
              actor: { enum: castIds(cast) },
              state: { enum: LIB.stateOrder.slice() },
              motion: { enum: Object.keys(LIB.motions) },
              activity: { enum: LIB.activityOrder.slice() },
              posture: { enum: Object.keys(LIB.postures) },
              move: { enum: Object.keys(LIB.moves) },
              facing: { enum: ['left', 'right'] },
              view: { enum: VIEW_ORDER.slice() },
              spot: { enum: SCENE.spotOrder.slice() },
              fx: { type: 'array', maxItems: 3, items: { enum: Object.keys(LIB.fx) } },
              say: { type: 'string', maxLength: 120 },
              hold: { type: 'number', minimum: 0.8, maximum: 6 },
              // dàn dựng (tuỳ chọn — thiếu thì đạo diễn tự động của bộ phát tự quyết): nói với ai, máy quay, kiểu bong bóng, âm thanh
              to: { enum: castIds(cast) },
              camera: { enum: FILM_CAMERAS.slice() },
              bubble: { enum: FILM_BUBBLES.slice() },
              sfx: { type: 'array', maxItems: 3, items: { enum: filmSfx(cast, o) } },
              // hành động (biên đạo): đòn đánh cần target; người bị đánh phản ứng đúng khung va chạm (chưa nạp biên đạo → enum rỗng = không dùng được)
              action: { enum: Object.keys(FA.act) },
              target: { enum: castIds(cast) },
              react: { enum: Object.keys(FA.react) }
            }
          }
        }
      }
    };
  }
  function validateEvent(ev, cast) {
    var errs = [], S = directorSchema(cast).properties.steps.items.properties;
    if (!ev || typeof ev !== 'object') return [N_('Kịch bản phải là một object JSON.')];
    if (typeof ev.title !== 'string' || !ev.title) errs.push('title: ' + N_('thiếu "title".'));
    var evScene = ev.scene !== undefined ? getScene(ev.scene) : null;
    if (ev.scene !== undefined && !evScene) errs.push('scene: ' + N_('cảnh "{ref}" không có (xem list_scenes).', { ref: String(ev.scene).slice(0, 60) }));
    var at = {};   // diễn viên → chỗ đứng hiện tại (giữ nguyên đến khi bước sau đổi)
    if (!Array.isArray(ev.steps) || !ev.steps.length) return errs.concat('steps: ' + N_('thiếu "steps" (mảng ít nhất 1 bước).'));
    if (ev.steps.length > 12) errs.push('steps: ' + N_('tối đa 12 bước.'));
    ev.steps.forEach(function (s, i) {
      var n = 'steps[' + i + ']: ', pathOf = function (k) { return 'steps[' + i + '].' + k + ': '; };   // đường dẫn máy đọc được (agent sửa đúng chỗ; Studio đặt lỗi cạnh hàng)
      if (!s || typeof s !== 'object') { errs.push(n + N_('phải là object.')); return; }
      Object.keys(s).forEach(function (k) { if (!S[k]) errs.push(pathOf(String(k).slice(0, 60)) + N_('khoá lạ "{key}".', { key: String(k).slice(0, 60) })); });
      if (S.actor.enum.indexOf(s.actor) < 0) errs.push(pathOf('actor') + N_('diễn viên "{ref}" không có trong dàn diễn viên.', { ref: String(s.actor).slice(0, 60) }));
      if (S.state.enum.indexOf(s.state) < 0) errs.push(pathOf('state') + N_('trạng thái "{ref}" không có trong kho.', { ref: String(s.state).slice(0, 60) }));
      if (s.motion !== undefined && S.motion.enum.indexOf(s.motion) < 0) errs.push(pathOf('motion') + N_('động tác "{ref}" không có trong kho.', { ref: String(s.motion).slice(0, 60) }));
      ['activity', 'posture', 'move', 'facing', 'view', 'spot'].forEach(function (k) {
        if (s[k] !== undefined && S[k].enum.indexOf(s[k]) < 0) errs.push(pathOf(k) + N_('{key} "{ref}" không có trong kho.', { key: k, ref: String(s[k]).slice(0, 60) }));
      });
      var mvd = s.move && LIB.moves[s.move];
      if (mvd && mvd.postures && s.posture && mvd.postures.indexOf(s.posture) < 0) errs.push(pathOf('move') + N_('di chuyển "{move}" không đi với tư thế "{posture}" (hợp: {ids}).', { move: String(s.move).slice(0, 60), posture: String(s.posture).slice(0, 60), ids: mvd.postures.join(', ') }));
      if (s.fx !== undefined) {
        if (!Array.isArray(s.fx) || s.fx.length > 3) errs.push(pathOf('fx') + N_('fx phải là mảng tối đa 3 phần tử.'));
        else s.fx.forEach(function (f) { if (S.fx.items.enum.indexOf(f) < 0) errs.push(pathOf('fx') + N_('hiệu ứng "{ref}" không có trong kho.', { ref: String(f).slice(0, 60) })); });
      }
      if (s.spot !== undefined && S.spot.enum.indexOf(s.spot) >= 0) {
        if (ev.scene === undefined) errs.push(pathOf('spot') + N_('"spot" chỉ dùng khi kịch bản có "scene".'));
        else if (evScene && evScene.spots.indexOf(s.spot) < 0) errs.push(pathOf('spot') + N_('chỗ đứng "{ref}" không mở trong cảnh này ({ids}).', { ref: s.spot, ids: evScene.spots.join(', ') }));
        else if (Object.keys(at).some(function (a) { return a !== s.actor && at[a] === s.spot; })) errs.push(pathOf('spot') + N_('chỗ đứng "{ref}" đang có diễn viên khác.', { ref: s.spot }));
        else if (typeof s.actor === 'string') at[s.actor] = s.spot;
      }
      if (typeof s.say !== 'string') errs.push(pathOf('say') + N_('thiếu "say".'));
      else if (s.say.length > 120) errs.push(pathOf('say') + N_('"say" dài quá 120 ký tự.'));
      if (s.hold !== undefined && !(typeof s.hold === 'number' && s.hold >= 0.8 && s.hold <= 6)) errs.push(pathOf('hold') + N_('"hold" phải trong khoảng 0.8–6 giây.'));
      if (s.to !== undefined && (S.to.enum.indexOf(s.to) < 0 || s.to === s.actor)) errs.push(pathOf('to') + N_('"to" phải là một diễn viên khác trong dàn diễn viên.'));
      if (s.camera !== undefined && FILM_CAMERAS.indexOf(s.camera) < 0) errs.push(pathOf('camera') + N_('camera chọn: {ids}.', { ids: FILM_CAMERAS.join(', ') }));
      if (s.bubble !== undefined && FILM_BUBBLES.indexOf(s.bubble) < 0) errs.push(pathOf('bubble') + N_('bubble chọn: {ids}.', { ids: FILM_BUBBLES.join(', ') }));
      if (s.sfx !== undefined) {
        var SS = filmSounds();
        if (!Array.isArray(s.sfx) || s.sfx.length > 3) errs.push(pathOf('sfx') + (SS ? N_('sfx: mảng tối đa 3 tên âm trong thư viện âm (get_sound_spec · list_sounds).') : N_('sfx: mảng tối đa 3 tên âm trong thư viện âm: {ids}.', { ids: FILM_SFX.join(', ') })));
        else s.sfx.forEach(function (x) {
          if (typeof x === 'string' && (SS ? SS.has(x) : FILM_SFX.indexOf(x) >= 0)) return;
          var sg = SS && typeof x === 'string' ? SS.suggest(x, '') : null;
          errs.push(pathOf('sfx') + (sg ? N_('âm "{ref}" không có trong thư viện âm — gần nhất: "{alt}" (list_sounds).', { ref: String(x).slice(0, 32), alt: sg }) : N_('âm "{ref}" không có trong thư viện âm (list_sounds).', { ref: String(x).slice(0, 32) })));
        });
      }
      var FA = filmActions(), ac = s.action !== undefined && own(FA.act, s.action) ? FA.act[s.action] : null;
      if (s.action !== undefined && !ac) errs.push(pathOf('action') + N_('action "{ref}" không có (chọn: {ids}).', { ref: String(s.action).slice(0, 40), ids: Object.keys(FA.act).join(', ') }));
      if (ac && ac.attack && s.target === undefined) errs.push(pathOf('target') + N_('đòn "{ref}" cần "target" (người bị đánh).', { ref: s.action }));
      // needs (v0.16): đòn binh khí chỉ cho người cầm binh khí — gợi ý đòn thay thế người này làm được
      var who = cast.filter(function (a) { return a.id === s.actor; })[0], CH = G.GenChibi && G.GenChibi.choreo;
      if (ac && who && CH && CH.canDo && !CH.canDo(who, ac)) errs.push(pathOf('action') + N_('"{actor}" không {what} nên không làm được "{ref}" (làm được: {ids}).', { actor: s.actor, what: CH.MOTION.needs[ac.needs] || ac.needs, ref: s.action, ids: CH.actionsFor(who).filter(function (k) { return !!FA.act[k].attack === !!ac.attack; }).join(', ') }));
      if (s.target !== undefined && (S.target.enum.indexOf(s.target) < 0 || s.target === s.actor)) errs.push(pathOf('target') + N_('"target" phải là một diễn viên khác trong dàn diễn viên.'));
      if (s.target !== undefined && !(ac && ac.attack)) errs.push(pathOf('target') + N_('"target" chỉ đi với đòn đánh ({ids}).', { ids: Object.keys(FA.act).filter(function (k) { return FA.act[k].attack; }).join(', ') }));
      if (s.react !== undefined && !own(FA.react, s.react)) errs.push(pathOf('react') + N_('react chọn: {ids}.', { ids: Object.keys(FA.react).join(', ') }));
      else if (s.react !== undefined && s.target === undefined) errs.push(pathOf('react') + N_('"react" là phản ứng của "target" — cần có target.'));
    });
    return errs;
  }
  // Lời nhắc đạo diễn cho LLM (ai.js director, MCP get_director_schema) — viết TIẾNG ANH (CNS-067); nhãn dữ liệu của kho đưa bằng tiếng Anh nếu bảng
  // locales/en có (GC.i18n), tên / mô tả cảnh do người dùng đặt giữ nguyên. Lời thoại: người gọi dặn thêm ngôn ngữ (ai.js: theo ngôn ngữ của mô tả sự kiện).
  function directorPrompt(cast, o) {
    var L = [], I = G.GenChibi && G.GenChibi.i18n, E = function (t) { return I && t ? I.labelIn('en', t) : t; };
    L.push('You are the comedy director for the chibi cast of gen-chibi.');
    L.push('Write a short script (3–6 beats) for the event described at the end. Expressions are always exaggerated and funny — no violence, no blood.');
    L.push('Return ONLY ONE JSON object that matches the schema — no explanation, no markdown.');
    L.push('', 'Actors:');
    var G0 = function (x, t) { return isGenLabs(x) ? E(t) : t; };   // chữ của bộ khung (ma-nơ-canh, sân khấu chuẩn) tiếng Anh; tên / tính cách người dùng đặt giữ nguyên (CNS-154/158)
    cast.forEach(function (a) { L.push('- ' + a.id + ': ' + G0(a, a.name) + ' — ' + G0(a, a.persona || '')); });
    L.push('', 'States (state):');
    LIB.stateOrder.forEach(function (id) { L.push('- ' + id + ': ' + E(LIB.states[id].label) + ' — ' + E(LIB.states[id].hint)); });
    L.push('', 'Activities (activity, optional — preset posture + move + motion + props; state still decides the face):');
    LIB.activityOrder.forEach(function (id) { var a = LIB.activities[id]; L.push('- ' + id + ': ' + E(a.label) + (a.hint ? ' — ' + E(a.hint) : '')); });
    L.push('', 'To combine freely use posture (base pose), move (movement), motion (hand motion), facing (left/right):');
    L.push('- posture: ' + Object.keys(LIB.postures).map(function (k) { return k + ' (' + E(LIB.postures[k].label) + ')'; }).join(', '));
    L.push('- view: front | left / right (slight 3/4 turn) | left45 / right45 (45° turn — good when two characters talk to each other) | left90 / right90 (profile, walking across) | left135 / right135 (back three-quarter, walking away) | back (fully turned away)');
    L.push('- move: ' + Object.keys(LIB.moves).map(function (k) { var m = LIB.moves[k]; return k + ' (' + E(m.label) + (m.postures ? '; postures: ' + m.postures.join('/') : '') + ')'; }).join(', '));
    if (SCENE_ORDER.length) {
      L.push('', 'Scenes (scene, optional — put the whole event in an existing scene; each step picks spot = where the actor stands):');
      var one = function (t) { return String(t || '').replace(/\s+/g, ' ').trim(); };   // chữ do người dùng / agent đặt không tạo được dòng giả trong prompt
      SCENE_ORDER.forEach(function (k) { var x = SCENES[k]; L.push('- ' + k + ': ' + one(G0(x, x.name)) + (x.description ? ' — ' + one(G0(x, x.description)) : '')); });
      L.push('- spot: ' + SCENE.spotOrder.map(function (k) { return k + ' (' + E(SCENE.spots[k].label) + ')'; }).join(', '));
    }
    L.push('', 'Film staging (optional — the player stages it automatically if left empty: characters walk on, walk to a new place when the spot changes, turn to the listener, gesture while talking, the camera closes in on the speaker, lip sync, own voice):');
    L.push('- to: id of the listener (default: the previous speaker) · camera: ' + FILM_CAMERAS.join(' | ') + ' (close = close-up on the speaker, two = two-shot, wide = wide shot)');
    L.push('- bubble: ' + FILM_BUBBLES.join(' | ') + ' (default: shout for rage/shock/panic/vow with "!", think for think/sleep)');
    var SP = filmSounds();
    if (SP) {
      // âm thanh: để TRỐNG gần hết các bước (bộ phát tự gán âm theo cảm xúc / hiệu ứng / hoạt động); chỉ đặt sfx khi muốn NHẤN — luật ghép ở GC.sounds (một nguồn)
      L.push('- sfx (optional, array of ≤ ' + SP.RULES.maxPerStep + ' names): the player AUTO-assigns sounds from state / fx / activity — leave it EMPTY on most steps, only set sfx to ACCENT a moment (≤ ' + SP.RULES.maxAccent + ' accent sound per step, never an accent sound on a step with dialogue); sfx: [] = a silent step. Sound names by group:');
      var fs = filmSfx(cast, o);
      SP.CATS.forEach(function (c) { var xs = fs.filter(function (n) { return SP.get(n).cat === c[0]; }); if (xs.length) L.push('  · ' + E(c[1]) + (SP.ACCENT.indexOf(c[0]) >= 0 ? ' (ACCENT)' : '') + ': ' + xs.join(', ')); });
    } else L.push('- sfx: ' + FILM_SFX.join(', '));
    L.push('- Change spot between steps so characters move around the stage (do not leave everyone standing still the whole shot); mix in activities (bow, salute, point, wave, cheer, attack…) for lines with action.');
    var FA = filmActions(cast);
    if (Object.keys(FA.act).length) {
      L.push('', 'Actions (action, optional — martial-arts / full-body choreography with camera, slow motion, hit-stop on impact, effects, sound):');
      var tag = function (k) { var a = FA.act[k]; return k + ' (' + E(a.label) + (a.needs ? ', needs a weapon' : '') + (a.ranged ? ', thrown from afar' : '') + ')'; };
      L.push('- attacks (need target = the one being hit): ' + Object.keys(FA.act).filter(function (k) { return FA.act[k].attack; }).map(tag).join(', '));
      L.push('- solo: ' + Object.keys(FA.act).filter(function (k) { return !FA.act[k].attack; }).map(tag).join(', '));
      var CH = G.GenChibi.choreo;
      if (CH && CH.actionsFor) L.push('- Who can do what ("needs a weapon" attacks are only for actors holding a weapon): ' + cast.map(function (a) { return a.id + ' → ' + CH.actionsFor(a).filter(function (k) { return FA.act[k]; }).join(', '); }).join(' · '));
      L.push('- react (the target\'s reaction, default hit): ' + Object.keys(FA.react).map(function (k) { return k + ' (' + E(FA.react[k].label) + ')'; }).join(', '));
      L.push('- Fight scenes: both fighters on the front row (left, midLeft, center, midRight, right), at least one spot apart; the attacker closes in / backs off by itself to land the hit. "say" can be "" when only attacking, or a short shout. At most 3 attacks per shot; put lines between attacks. Martial-arts-movie comedy, no blood.');
    }
    L.push('', 'Schema:', JSON.stringify(directorSchema(cast, o), null, 2), '', 'Event: <event description here>');
    return L.join('\n');
  }

  /* -------------------------------------------------------------- 7. GATES */
  function finite(n) { return typeof n === 'number' && isFinite(n); }
  // opts.poses: kiểm thêm việc dựng đủ mọi hoạt động (nặng hơn — dùng ở hồ sơ asset, khi lưu qua MCP, trong test; không dùng cho danh sách hàng trăm nhân vật)
  function gate(asset, opts) {
    var res = [];
    function add(id, label, ok, detail) { res.push(gateRow({ id: id, ok: ok }, label, detail)); }
    var look = asset.look || {};

    var missing = [];
    Object.keys(look.parts || {}).forEach(function (slot) {
      if (!LIB.slots[slot]) missing.push(N_('slot lạ {slot}', { slot: slot }));
      else if (!getPart(slot, look.parts[slot], asset.pack)) missing.push(slot + ':' + look.parts[slot]);
    });
    if (!LIB.eyeStyles[look.eyes]) missing.push('eyes:' + look.eyes);
    Object.keys(look.equip || {}).forEach(function (slot) {
      var it = getItem(look.equip[slot], asset.pack);
      if (!it) missing.push('equip.' + slot + ':' + look.equip[slot]);
      else if (it.equip.slot !== slot) missing.push('equip.' + slot + ': ' + N_('item {key} mặc ở {slot}', { key: it.key, slot: it.equip.slot }));
    });
    if (!LIB.browStyles[look.brows]) missing.push('brows:' + look.brows);
    add('parts', 'Linh kiện có trong thư viện', !missing.length, missing.join(', '));

    var noLic = [], packs = {};
    Object.keys(look.parts || {}).forEach(function (slot) {
      var p = getPart(slot, look.parts[slot], asset.pack);
      if (!p) return;
      packs[p.pack] = 1;
      if (!p.license || !PACKS[p.pack]) noLic.push(slot + ':' + p.id);
    });
    add('license', 'License + thư viện nguồn rõ ràng', !noLic.length, noLic.length ? noLic.join(', ') : Object.keys(packs).join(', '));

    var bad = [];
    Object.keys(look.params || {}).forEach(function (slot) {
      var defs = FACE_PARAMS[slot] || ((getPart(slot, partRef(asset, slot), asset.pack) || {}).params);
      if (!defs) { bad.push(slot + ': ' + N_('không có tham số')); return; }
      Object.keys(look.params[slot]).forEach(function (k) {
        var d = defs[k], v = look.params[slot][k];
        if (!d) bad.push(N_('{key} không tồn tại', { key: slot + '.' + k }));
        else if (!finite(v) || v < d.min || v > d.max) bad.push(N_('{key}={v} ngoài [{min}, {max}]', { key: slot + '.' + k, v: v, min: d.min, max: d.max }));
      });
    });
    add('params', 'Tham số trong khoảng cho phép', !bad.length, bad.join('; '));

    var must = (asset.identity && asset.identity.must) || [];
    var lost = must.filter(function (m) {
      var sp = m.split(':');
      // so theo mã linh kiện: "hat:ci-hat" khớp cả "ci-hat" lẫn "local.my/ci-hat"
      var id = function (r) { return String(r || '').split('/').pop(); };
      return sp[0] === 'eyes' ? look.eyes !== sp[1] : id(partRef(asset, sp[0])) !== id(sp[1]);
    });
    add('identity', ['Dấu nhận diện bắt buộc ({n})', { n: must.length }], must.length > 0 && !lost.length,
      must.length ? lost.join(', ') : 'chưa khai báo identity.must');

    var sbad = [];
    LIB.stateOrder.forEach(function (sid) {
      try {
        var c = compose(asset, sid), size = 0;
        for (var l in c.layers) size += c.layers[l].length;
        if (size > 60000) sbad.push(N_('{id} quá nặng ({n} ký tự)', { id: sid, n: size }));
        var m = LIB.motions[c.state.motion];
        if (!m) sbad.push(sid + ': ' + N_('thiếu động tác {id}', { id: c.state.motion }));
      } catch (e) { sbad.push(sid + ': ' + e.message); }
    });
    var ovs = Object.keys(asset.expressions || {}).filter(function (k) { return !LIB.states[k]; });
    if (ovs.length) sbad.push(N_('ghi đè cho trạng thái lạ: {ids}', { ids: ovs.join(', ') }));
    add('states', ['Dựng đủ {n} trạng thái', { n: LIB.stateOrder.length }], !sbad.length, sbad.join('; '));

    var mbad = [];
    LIB.stateOrder.forEach(function (sid) {
      var st = resolveState(asset, sid);
      var m = LIB.motions[st.motion];
      if (!m) return;
      Object.keys(m.tracks).forEach(function (j) {
        if (!RIG.joints[j]) mbad.push(st.motion + ': ' + N_('khớp lạ {id}', { id: j }));
        Object.keys(m.tracks[j]).forEach(function (ch) {
          var ks = m.tracks[j][ch];
          if (CHANNELS.indexOf(ch) < 0) mbad.push(st.motion + ': ' + N_('kênh lạ {id}', { id: ch }));
          for (var i = 0; i < ks.length; i++) {
            if (!finite(ks[i][0]) || !finite(ks[i][1]) || ks[i][0] < 0 || ks[i][0] > 1 || (i && ks[i][0] < ks[i - 1][0])) {
              mbad.push(N_('{key} khoá sai', { key: st.motion + '.' + j + '.' + ch })); break;
            }
          }
        });
      });
      for (var s = 0; s < 16; s++) {
        var p = poseAt(asset, st, s * 0.17, false);
        for (var jj in p) for (var ch in p[jj]) if (!finite(p[jj][ch])) { mbad.push(st.motion + ' ra NaN'); s = 99; break; }
      }
    });
    add('motion', 'Động tác hợp lệ trên khung xương', !mbad.length, mbad.filter(function (x, i, a) { return a.indexOf(x) === i; }).join('; '));
    // độ phủ góc nhìn: linh kiện nào đã có bản vẽ thật cho 45° / 90° / sau-45° / sau lưng (thiếu thì engine dùng bản gần nhất) — thông tin, không chặn
    var cov = [], miss = [], miss8 = [];
    Object.keys(LIB.slots).forEach(function (slot) {
      var ref = partRef(asset, slot), p = ref && getPart(slot, ref, asset.pack);
      if (!p || ref === 'none' || /^held[LR]$/.test(slot)) return;
      (p.views && p.views.q45 ? cov : miss).push(slot + ':' + p.id);
      var lack = VIEW_KINDS.filter(function (k) { return !(p.views && p.views[k]); });
      if (lack.length) miss8.push(slot + ':' + p.id + ' (' + lack.join(', ') + ')');
    });
    res.push(gateRow({ id: 'view45', ok: true, info: true }, ['Bản vẽ nghiêng 45°: {n}/{total} linh kiện', { n: cov.length, total: cov.length + miss.length }],
      miss.length ? ['chưa có (dùng trượt): {list}', { list: miss.join(', ') }] : 'đủ — nghiêng 45° vẽ thật'));
    res.push(gateRow({ id: 'views8', ok: true, info: true }, 'Bản vẽ 8 hướng (45° · 90° · sau-45° · sau lưng)',
      miss8.length ? ['thiếu: {list}', { list: miss8.slice(0, 6).join('; ') }] : 'đủ — 8 hướng vẽ thật'));
    var pbad = [];
    if (opts && opts.poses) LIB.activityOrder.forEach(function (id) {
      var a = LIB.activities[id];
      try {
        var c = compose(asset, a.state || 'normal', { activity: id });
        [0, 0.37].forEach(function (t) {
          var p = poseAt(asset, c.state, t, t === 0);
          JOINT_IDS.forEach(function (j) { CHANNELS.forEach(function (ch) { if (!finite(p[j][ch])) pbad.push(id + ': ' + N_('{key} không phải số', { key: j + '.' + ch })); }); });
        });
      } catch (e) { pbad.push(id + ': ' + e.message); }
    });
    if (opts && opts.poses) add('poses', ['Dựng đủ {n} hoạt động (tư thế × di chuyển × động tác)', { n: LIB.activityOrder.length }], !pbad.length, pbad.slice(0, 6).join('; '));
    return res;
  }


  // Trạng thái (Ryan 2026-10-18): NHÁP = dùng ngay trong dự án, không cần duyệt · PHÁT HÀNH = được đưa vào gói bán.
  // Giá trị cũ: approved → published; review và mọi giá trị khác → draft.
  function statusOf(s) { return s === 'published' || s === 'approved' ? 'published' : 'draft'; }
  // Luật chặn DUY NHẤT cho mọi lối ghi (MCP, Studio/HTTP, AI trong chatroom):
  // lỗi cấu trúc/an toàn chặn ở mọi trạng thái; dấu nhận diện bắt buộc khi PHÁT HÀNH; mục thông tin không chặn.
  function blockingGates(gates, status) {
    return gates.filter(function (g) { return !g.ok && !g.info && !(g.id === 'identity' && statusOf(status) === 'draft'); });
  }


  /* -------------------------------------------- 8. ITEM TRANG BỊ (loại asset thứ hai) */
  // Item = mặc được (trỏ tới một linh kiện + tham số + bảng màu riêng) + tự đứng được (icon, thẻ: tên, độ hiếm, chỉ số).
  // Không vẽ lại: một linh kiện → nhiều item (đao sắt thường / Thanh Long đao huyền thoại chỉ khác màu, chỉ số, độ hiếm).
  var ITEM = {
    types: {
      weapon: { label: 'Vũ khí', slots: ['heldR'] }, offhand: { label: 'Tay phụ', slots: ['heldL'] },
      talisman: { label: 'Pháp khí', slots: ['heldR', 'heldL'] }, helmet: { label: 'Mũ / khăn', slots: ['hat'] },
      armor: { label: 'Áo giáp / áo', slots: ['outfit'] }, cloak: { label: 'Áo choàng', slots: ['back'] },
      boots: { label: 'Giày', slots: ['shoes'] }, mask: { label: 'Mặt nạ', slots: ['mask'] }
    },
    rarity: {
      common: { label: 'Thường', color: '#9aa0a6', glow: '#e9eaec' }, uncommon: { label: 'Tốt', color: '#4caf6a', glow: '#dff3e4' },
      rare: { label: 'Hiếm', color: '#3d7fd1', glow: '#dde9f8' }, epic: { label: 'Sử thi', color: '#9b5cd0', glow: '#efe3f8' },
      legendary: { label: 'Huyền thoại', color: '#e08a1e', glow: '#fdecd2' }
    },
    rarityOrder: ['common', 'uncommon', 'rare', 'epic', 'legendary'],
    stats: { atk: 'Công', def: 'Thủ', spd: 'Tốc', int: 'Trí', hp: 'Sinh lực', luk: 'Vận may' },
    // khung icon theo bộ phận (toạ độ tư thế nghỉ): tâm, cạnh vuông, góc xoay để vật dài nằm chéo như icon túi đồ
    frames: {
      heldR: { cx: 146, cy: 112, size: 200, rot: 32 }, heldL: { cx: 66, cy: 150, size: 120, rot: 0 },
      hat: { cx: 100, cy: 66, size: 150, rot: 0 }, outfit: { cx: 100, cy: 182, size: 108, rot: 0 }, back: { cx: 100, cy: 188, size: 116, rot: 0 },
      shoes: { cx: 100, cy: 221, size: 70, rot: 0 }, mask: { cx: 100, cy: 100, size: 116, rot: 0 }
    }
  };
  function esc(t) { return String(t).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  // Tra asset đã đăng ký: "pack/id" hoặc "id" (ưu tiên thư viện preferPack, rồi theo thứ tự đăng ký)
  function lookup(MAP, ORDER, ref, preferPack) {
    if (!ref || typeof ref !== 'string') return null;
    ref = canon(ref); preferPack = canonPack(preferPack);
    if (ref.indexOf('/') > 0) return own(MAP, ref) ? MAP[ref] : null;
    if (preferPack && own(MAP, preferPack + '/' + ref)) return MAP[preferPack + '/' + ref];
    for (var i = 0; i < ORDER.length; i++) if (MAP[ORDER[i]].id === ref) return MAP[ORDER[i]];
    return null;
  }
  function getItem(ref, preferPack) { return lookup(ITEMS, ITEM_ORDER, ref, preferPack); }
  // Chữ thuần: bỏ ký tự điều khiển (XML không nhận) rồi cắt độ dài
  // Dự án chủ đề (giai đoạn ②): mọi asset của người dùng gắn một dự án — slug ngắn; rỗng = chưa xếp dự án
  var PROJECT_ID = /^[a-z0-9][a-z0-9-]{0,39}$/;
  function projectId(v) { return typeof v === 'string' && PROJECT_ID.test(v) ? v : ''; }
  function plain(t, n) { return String(t == null ? '' : t).replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '').slice(0, n); }
  // Kiểm + chuẩn hoá item (dữ liệu thuần: chữ được escape khi vẽ, màu chỉ nhận hex, linh kiện phải có thật và đúng bộ phận)
  function checkItem(def) {
    var errs = [], d = {};
    if (!def || typeof def !== 'object') return { errors: [N_('item phải là object')], def: null };
    if (!/^[a-z0-9][a-z0-9-]{1,63}$/.test(String(def.id || ''))) errs.push('id: ' + N_('chữ thường, số, gạch nối, 2–64 ký tự'));
    d.id = String(def.id || ''); d.name = plain(def.name || def.id, 40); d.han = plain(def.han, 12);
    if (typeof def.type !== 'string' || !own(ITEM.types, def.type)) errs.push('type: ' + N_('chọn {ids}', { ids: Object.keys(ITEM.types).join(' | ') }));
    if (typeof def.rarity !== 'string' || !own(ITEM.rarity, def.rarity)) errs.push('rarity: ' + N_('chọn {ids}', { ids: ITEM.rarityOrder.join(' | ') }));
    d.type = def.type; d.rarity = def.rarity;
    var eq = def.equip || {};
    var slot = typeof eq.slot === 'string' ? eq.slot : (own(ITEM.types, def.type) ? ITEM.types[def.type].slots[0] : '');
    if (own(ITEM.types, def.type) && ITEM.types[def.type].slots.indexOf(slot) < 0) errs.push(N_('equip.slot "{slot}" không hợp với loại {type} ({ids})', { slot: slot, type: def.type, ids: ITEM.types[def.type].slots.join('/') }));
    var part = slot && typeof eq.part === 'string' && getPart(slot, eq.part);
    if (!part) errs.push(N_('equip.part "{ref}" không có trong bộ phận {slot} (xem get_catalog › slots)', { ref: eq.part, slot: slot }));
    d.equip = { slot: slot, part: part ? part.pack + '/' + part.id : String(eq.part || ''), params: {}, palette: {} };
    if (eq.params && typeof eq.params === 'object' && part && part.params) Object.keys(eq.params).forEach(function (k) {
      if (!own(part.params, k)) { errs.push('equip.params.' + k + ': ' + N_('linh kiện không có tham số này')); return; }
      d.equip.params[k] = num(eq.params[k], part.params[k].def, part.params[k].min, part.params[k].max);
    });
    if (eq.palette && typeof eq.palette === 'object') Object.keys(eq.palette).slice(0, 12).forEach(function (k) {
      if (!own(LIB.defaults, k)) { errs.push('equip.palette.' + k + ': ' + N_('token màu lạ')); return; }
      if (!HEX.test(String(eq.palette[k]))) { errs.push('equip.palette.' + k + ': ' + N_('cần mã hex')); return; }
      d.equip.palette[k] = String(eq.palette[k]);
    });
    d.stats = {};
    Object.keys(def.stats || {}).forEach(function (k) {
      if (!own(ITEM.stats, k)) { errs.push('stats.' + k + ': ' + N_('chỉ số lạ ({ids})', { ids: Object.keys(ITEM.stats).join(', ') })); return; }
      var v = def.stats[k];
      if (typeof v !== 'number' || !isFinite(v) || v < 0 || v > 999) { errs.push('stats.' + k + ': ' + N_('số 0–999')); return; }
      d.stats[k] = Math.round(v);
    });
    d.description = plain(def.description, 200); d.lore = plain(def.lore, 600);
    var ic = def.icon || {};
    d.icon = { zoom: num(ic.zoom, 1, 0.5, 2.5), dx: num(ic.dx, 0, -80, 80), dy: num(ic.dy, 0, -80, 80), rot: num(ic.rot, 0, -180, 180) };
    if (def.project != null && def.project !== '' && !projectId(def.project)) errs.push('project: ' + N_('slug dự án (chữ thường, số, gạch nối, ≤ 40 ký tự)'));
    d.project = projectId(def.project);
    d.kind = 'item'; d.status = statusOf(def.status);
    return { errors: errs, def: errs.length ? null : d };
  }
  function registerItem(packId, def) {
    packId = canonPack(packId);
    var c = checkItem(def);
    if (c.errors.length) return c;
    var d = c.def; d.pack = packId; d.key = packId + '/' + d.id; d.version = def.version || 1;
    if (!own(ITEMS, d.key)) ITEM_ORDER.push(d.key);
    ITEMS[d.key] = d;
    if (PACKS[packId]) PACKS[packId].counts.item = ITEM_ORDER.filter(function (k) { return k.indexOf(packId + '/') === 0; }).length;
    return { errors: [], def: d };
  }
  // Vẽ riêng một linh kiện (không có nhân vật) ở tư thế nghỉ — nền cho icon / thẻ item
  function partAlone(slot, ref, palette, params, view) {
    var p = getPart(slot, ref);
    if (!p) return '';
    var P = Object.assign({}, LIB.defaults, palette || {});
    var C = { P: P, A: RIG.anchors, shape: (getPart('head', 'round') || {}).shape, ink: INK, asset: { key: 'item/' + slot + '-' + p.id, id: 'item' }, flip: false, st: {}, view: view || 'front' };
    var vals = {};
    if (p.params) Object.keys(p.params).forEach(function (k) { vals[k] = num((params || {})[k], p.params[k].def, p.params[k].min, p.params[k].max); });
    var kind = VIEW_KIND[view] || view, fn = p.draw;   // nhận cả tên góc (left90…) lẫn dáng góc (q90…)
    if (p.views && VIEW_FALLBACK[kind]) VIEW_FALLBACK[kind].some(function (k) { return p.views[k] && (fn = p.views[k]); });
    var res = fn(C, {}, vals) || {};
    var wrap = p.params ? paramTransform(p.params, vals) : '';
    var out = '';
    RIG.layers.forEach(function (l) { if (res[l[0]]) out += wrap ? '<g transform="' + wrap + '">' + res[l[0]] + '</g>' : res[l[0]]; });
    return out;
  }
  // mode: icon (vuông, nền theo độ hiếm) | card (thẻ 240×330: icon, tên, loại, độ hiếm, chỉ số, mô tả)
  function itemSvg(item, opts) {
    opts = opts || {};
    // khung icon là thuộc tính của LINH KIỆN (part.icon) — vẽ một lần, mọi item dùng nó đều hưởng; khung theo bộ phận chỉ là mặc định
    var pp = getPart(item.equip.slot, item.equip.part);
    var R = ITEM.rarity[item.rarity] || ITEM.rarity.common, F = (pp && pp.icon) || ITEM.frames[item.equip.slot] || { cx: 100, cy: 120, size: 200, rot: 0 };
    var art = partAlone(item.equip.slot, item.equip.part, item.equip.palette, item.equip.params, opts.view);
    var sz = F.size / item.icon.zoom, cx = F.cx - item.icon.dx, cy = F.cy - item.icon.dy, rot = F.rot + item.icon.rot;
    var id = 'gi' + String(item.key || item.id).replace(/[^a-zA-Z0-9]/g, '');
    function icon(x, y, w) {
      return '<svg x="' + x + '" y="' + y + '" width="' + w + '" height="' + w + '" viewBox="' + (cx - sz / 2).toFixed(1) + ' ' + (cy - sz / 2).toFixed(1) + ' ' + sz.toFixed(1) + ' ' + sz.toFixed(1) + '">' +
        '<g transform="rotate(' + rot + ' ' + cx + ' ' + cy + ')">' + art + '</g></svg>';
    }
    var tile = function (x, y, w) {
      return '<defs><radialGradient id="' + id + 'g"><stop offset="0" stop-color="#fff"/><stop offset="1" stop-color="' + R.glow + '"/></radialGradient></defs>' +
        '<rect x="' + x + '" y="' + y + '" width="' + w + '" height="' + w + '" rx="' + (w * 0.12) + '" fill="url(#' + id + 'g)" stroke="' + R.color + '" stroke-width="' + Math.max(2, w * 0.025) + '"/>';
    };
    if (opts.mode !== 'card') {
      var W = opts.size || 128;
      return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ' + W + ' ' + W + '" width="' + W + '" height="' + W + '">' + tile(2, 2, W - 4) + icon(W * 0.08, W * 0.08, W * 0.84) + '</svg>';
    }
    var s = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 240 330" width="240" height="330" font-family="Arial, Helvetica, sans-serif">' +
      '<rect x="1.5" y="1.5" width="237" height="327" rx="14" fill="#fbfaf7" stroke="' + R.color + '" stroke-width="3"/>' +
      '<rect x="1.5" y="1.5" width="237" height="26" rx="12" fill="' + R.color + '"/><rect x="1.5" y="16" width="237" height="12" fill="' + R.color + '"/>' +
      '<text x="12" y="19" font-size="12" font-weight="700" fill="#fff">' + esc(R.label.toUpperCase()) + '</text>' +
      '<text x="228" y="19" font-size="11" text-anchor="end" fill="#fff">' + esc((ITEM.types[item.type] || {}).label || item.type) + '</text>' +
      tile(50, 36, 140) + icon(58, 44, 124) +
      '<text x="120" y="200" font-size="17" font-weight="700" text-anchor="middle" fill="#2b211d">' + esc(item.name) + '</text>' +
      (item.han ? '<text x="120" y="218" font-size="12" text-anchor="middle" fill="#8a7f72">' + esc(item.han) + '</text>' : '');
    var y = 236;
    ITEM_STAT_KEYS().forEach(function (k) {
      if (!(k in item.stats)) return;
      var v = item.stats[k];
      s += '<text x="16" y="' + (y + 9) + '" font-size="11" fill="#5b524a">' + esc(ITEM.stats[k]) + '</text>' +
        '<rect x="74" y="' + y + '" width="120" height="10" rx="5" fill="#ece8df"/><rect x="74" y="' + y + '" width="' + Math.max(4, Math.min(120, v / 100 * 120)).toFixed(1) + '" height="10" rx="5" fill="' + R.color + '"/>' +
        '<text x="224" y="' + (y + 9) + '" font-size="11" text-anchor="end" fill="#2b211d">' + v + '</text>';
      y += 15;
    });
    if (item.description) s += '<text x="120" y="' + Math.min(318, y + 14) + '" font-size="10.5" text-anchor="middle" fill="#6d645a">' + esc(item.description.slice(0, 44)) + '</text>';
    return s + '</svg>';
  }
  function ITEM_STAT_KEYS() { return Object.keys(ITEM.stats); }
  // Cổng kiểm item — cùng tinh thần cổng nhân vật: linh kiện có thật, license rõ, 45° của linh kiện, dựng được icon/thẻ
  function itemGate(item) {
    var res = [], c = checkItem(item);
    res.push({ id: 'data', label: 'Dữ liệu item hợp lệ (loại, độ hiếm, linh kiện, màu, chỉ số)', ok: !c.errors.length, detail: c.errors.slice(0, 4).join('; ') });
    if (c.errors.length) return res;
    var p = getPart(c.def.equip.slot, c.def.equip.part);
    res.push({ id: 'license', label: 'License linh kiện rõ ràng', ok: !!(p && p.license), detail: p ? p.pack + ' · ' + (p.license || N_('thiếu')) : '' });
    res.push({ id: 'view45', label: 'Linh kiện có bản 45°', ok: true, info: true,
      detail: /^held[LR]$/.test(c.def.equip.slot) ? 'vật cầm tay: dùng chung mọi góc nhìn' : p && p.views && p.views.q45 ? 'có' : 'chưa (engine trượt tạm)' });
    var okR = true; try { itemSvg(Object.assign({ key: 'gate' }, c.def), { mode: 'card' }); } catch (e) { okR = false; }
    res.push({ id: 'render', label: 'Dựng được icon và thẻ', ok: okR, detail: '' });
    return res;
  }

  /* --------------------------------------------- 7. LINH KIỆN DẠNG DỮ LIỆU */
  // Linh kiện do người dùng / agent tạo (qua MCP, Studio) là DỮ LIỆU, không phải code:
  // SVG thuộc tập con chặt, màu là hex hoặc token bảng màu {robe}, 45° chọn chế độ drawn | same | face45 | body45.
  // Bộ lọc ĐỌC rồi DỰNG LẠI SVG từ những gì đã kiểm (không chép nguyên văn đầu vào) → không chèn được script/link/style.
  var SVG_TAGS = { g: 1, path: 1, circle: 1, ellipse: 1, rect: 1, line: 1, polyline: 1, polygon: 1 };
  var NUM = /^-?(?:\d{1,5}(?:\.\d{1,4})?|\.\d{1,4})$/;   // nhận cả ".25" (dạng SVG hợp lệ, rất hay gặp)
  var SVG_ATTRS = {
    d: /^[MmLlHhVvCcSsQqTtAaZz0-9eE.,\-\s]{1,8000}$/, points: /^[0-9eE.,\-\s]{1,4000}$/,
    cx: NUM, cy: NUM, r: NUM, rx: NUM, ry: NUM, x: NUM, y: NUM, width: NUM, height: NUM, x1: NUM, y1: NUM, x2: NUM, y2: NUM,
    'stroke-width': NUM, opacity: NUM, 'fill-opacity': NUM, 'stroke-opacity': NUM,
    'stroke-linecap': /^(butt|round|square)$/, 'stroke-linejoin': /^(miter|round|bevel)$/, 'fill-rule': /^(nonzero|evenodd)$/,
    // mỗi vòng bắt đầu bằng chữ và chỉ có \s* ở CUỐI → không chồng lấn, không backtracking mũ (ReDoS)
    transform: /^(?:(?:translate|rotate|scale|skewX|skewY|matrix)\([-0-9.eE, ]{1,80}\) ?){1,6}$/,
    fill: 'paint', stroke: 'paint', class: /^(chb-bob|chb-flicker|chb-twinkle|chb-quiver|chb-pulse)$/
  };
  var PART_LAYERS_DENY = /^(prop|fx|stage)|b$/;
  function own(o, k) { return Object.prototype.hasOwnProperty.call(o, k); }   // tra bảng không dính prototype (constructor, toString…)
  function paintOk(v, T) { return /^#[0-9a-fA-F]{3,8}$/.test(v) || v === 'none' || (/^\{[a-zA-Z]{1,20}\}$/.test(v) && (v === '{ink}' || own(T, v.slice(1, -1)))); }
  // tokens: bảng token màu hợp lệ (nhân vật: LIB.defaults; phông cảnh: SCENE.defaults)
  // opts.shape: cho d="{shape}" (viền đầu của nhân vật, đổi theo dáng đầu và góc nhìn) · opts.marks: cho <g class="gc-f45|gc-f45c|gc-b45t|gc-b45h">
  // (đánh dấu chiếu 45°: engine thay bằng phép chiếu mặt / thân thật lúc dựng — dữ liệu không cần clipPath, url())
  var MARK_CLASS = /^gc-(f45c?|b45[th])$/;
  function sanitizeSvg(src, errs, where, tokens, opts) {
    var T = tokens || PENDING_T || LIB.defaults, O = opts || {};
    src = String(src || '');
    if (src.length > 20000) { errs.push(where + ': ' + N_('quá 20 000 ký tự')); return ''; }
    src = src.replace(/\s+/g, ' ');   // gộp khoảng trắng: regex tách thẻ chạy tuyến tính, không bậc hai
    var out = '', stack = [], inMark = [], last = 0, m, re = /<\s*(\/?)\s*([a-zA-Z]+)((?:\s+[a-zA-Z:-]+\s*=\s*"[^"<>]*")*)\s*(\/?)\s*>/g;
    while ((m = re.exec(src))) {
      if (src.slice(last, m.index).trim()) { errs.push(where + ': ' + N_('có chữ hoặc thẻ không hợp lệ gần "{text}"', { text: src.slice(last, m.index).trim().slice(0, 30) })); return ''; }
      last = re.lastIndex;
      var close = m[1] === '/', tag = m[2], selfClose = m[4] === '/';
      if (!own(SVG_TAGS, tag)) { errs.push(where + ': ' + N_('thẻ <{tag}> không được phép (chỉ g, path, circle, ellipse, rect, line, polyline, polygon)', { tag: tag })); return ''; }
      if (close) {
        if (stack.pop() !== tag) { errs.push(where + ': ' + N_('thẻ đóng </{tag}> sai cặp', { tag: tag })); return ''; }
        inMark.pop();
        out += '</' + tag + '>'; continue;
      }
      var attrs = '', am, ar = /([a-zA-Z:-]+)\s*=\s*"([^"<>]*)"/g, seen = {}, isMark = false;
      while ((am = ar.exec(m[3]))) {
        var k = am[1], v = am[2].trim(), rule = own(SVG_ATTRS, k) ? SVG_ATTRS[k] : null;
        if (own(seen, k)) { errs.push(where + ': ' + N_('thuộc tính "{key}" lặp lại', { key: k })); return ''; }
        seen[k] = 1;
        if (!rule) { errs.push(where + ': ' + N_('thuộc tính "{key}" không được phép', { key: k })); return ''; }
        var special = (k === 'd' && v === '{shape}' && O.shape) || (k === 'class' && MARK_CLASS.test(v) && O.marks && tag === 'g');
        if (k === 'class' && MARK_CLASS.test(v) && !special) { errs.push(where + ': ' + N_('đánh dấu chiếu "{code}" chỉ dùng trên <g> trong views (góc nghiêng) của linh kiện nhân vật', { code: v })); return ''; }
        if (!special && (rule === 'paint' ? !paintOk(v, T) : !rule.test(v))) { errs.push(where + ': ' + N_('giá trị {key}="{value}" không hợp lệ', { key: k, value: v.slice(0, 40) })); return ''; }
        if (k === 'class' && MARK_CLASS.test(v)) isMark = true;
        attrs += ' ' + k + '="' + v + '"';
      }
      // đánh dấu chiếu: một nhóm có nội dung, class là thuộc tính duy nhất, KHÔNG lồng trong đánh dấu khác
      // (phép chiếu nhân đôi nội dung — lồng d tầng sẽ phình 2^d lần → treo trình duyệt / server)
      if (isMark && (selfClose || Object.keys(seen).length !== 1)) { errs.push(where + ': ' + N_('<g class="gc-…"> phải là nhóm có nội dung và chỉ có thuộc tính class')); return ''; }
      if (isMark && inMark.some(Boolean)) { errs.push(where + ': ' + N_('đánh dấu chiếu không được lồng trong đánh dấu chiếu khác')); return ''; }
      if (selfClose && tag === 'g') { out += '<g' + attrs + '></g>'; continue; }   // chuẩn hoá: không có <g/> trong đầu ra
      out += '<' + tag + attrs + (selfClose ? '/>' : '>');
      if (!selfClose) { if (tag !== 'g') { errs.push(where + ': ' + N_('<{tag}> phải tự đóng (/>)', { tag: tag })); return ''; } stack.push(tag); inMark.push(isMark); }
    }
    if (src.slice(last).trim()) { errs.push(where + ': ' + N_('có chữ thừa ở cuối')); return ''; }
    if (stack.length) { errs.push(where + ': ' + N_('thiếu </g>')); return ''; }
    return out;
  }
  var PART_PARAM_TYPES = { scale: 1, scaleX: 1, scaleY: 1, dx: 1, dy: 1 };
  // Kiểm + chuẩn hoá một linh kiện dữ liệu. Trả { errors, def } — def đã lọc sạch, sẵn để lưu hoặc đăng ký.
  function checkDataPart(def) {
    var errs = [], d = {};
    if (!def || typeof def !== 'object') return { errors: [N_('linh kiện phải là object')], def: null };
    if (typeof def.slot === 'string' && own(SCENE.slots, def.slot)) return checkScenery(def);   // phông cảnh: cùng lối ghi, luật riêng
    if (!/^[a-z0-9][a-z0-9-]{1,39}$/.test(String(def.id || ''))) errs.push('id: ' + N_('chữ thường, số, gạch nối, 2–40 ký tự'));
    if (typeof def.slot !== 'string' || !own(LIB.slots, def.slot)) errs.push(N_('slot "{slot}" không có; chọn trong: {ids} (phông cảnh: {ids2})', { slot: def.slot, ids: Object.keys(LIB.slots).join(', '), ids2: Object.keys(SCENE.slots).join(', ') }));
    d.id = String(def.id || ''); d.slot = def.slot; d.label = String(def.label || def.id || '').slice(0, 40);
    d.description = String(def.description || '').slice(0, 300);
    function layers(src, where, marks) {
      var o = {}, n = 0;
      if (!src || typeof src !== 'object') { errs.push(where + ': ' + N_('cần object { lớp: svg }')); return o; }
      Object.keys(src).forEach(function (l) {
        if (LAYER_IDS.indexOf(l) < 0 || PART_LAYERS_DENY.test(l)) { errs.push(where + ': ' + N_('lớp "{id}" không dùng được cho linh kiện', { id: l })); return; }
        var c = sanitizeSvg(src[l], errs, where + '.' + l, null, { shape: true, marks: marks });
        if (c) { o[l] = c; n++; }
      });
      if (!n) errs.push(where + ': ' + N_('chưa có lớp nào vẽ được'));
      return o;
    }
    d.layers = layers(def.layers, 'layers');
    // E4: variants.mood = { <tâm trạng | id trạng thái>: { lớp: svg } } — engine chọn theo nét mặt đang hiện; mode 'replace' (mặc định: thay lớp cùng tên) | 'append' (vẽ thêm lên trên lớp gốc)
    function variants(src, where, marks) {
      if (src == null) return undefined;
      var v = { mode: 'replace', mood: {} }, n = 0;
      if (typeof src !== 'object' || Array.isArray(src) || !src.mood || typeof src.mood !== 'object' || Array.isArray(src.mood)) { errs.push(where + ': ' + N_('cần { mood: { <tâm trạng>: { lớp: svg } } }')); return undefined; }
      if (src.mode !== undefined) { if (src.mode === 'replace' || src.mode === 'append') v.mode = src.mode; else errs.push(where + '.mode: ' + N_('chọn replace | append')); }
      Object.keys(src.mood).slice(0, 24).forEach(function (m) {
        if (MOODS.indexOf(m) < 0 && !own(LIB.states, m)) { errs.push(where + '.mood.' + String(m).slice(0, 30) + ': ' + N_('không phải tâm trạng ({moods}) hay id trạng thái trong kho', { moods: MOODS.join(', ') })); return; }
        var L = layers(src.mood[m], where + '.mood.' + m, marks);
        if (Object.keys(L).length) { v.mood[m] = L; n++; }
      });
      if (!n) errs.push(where + ': ' + N_('chưa có tâm trạng nào vẽ được'));
      return v;
    }
    if (def.variants !== undefined) { var vv = variants(def.variants, 'variants', false); if (vv) d.variants = vv; }
    // dáng đầu (E5): linh kiện slot head khai báo viền đầu — mọi <path d="{shape}"> trong linh kiện khác (mặt nạ, tóc sau gáy) khít theo viền này
    if (d.slot === 'head') {
      ['shape', 'shape45', 'shape90', 'shape135'].forEach(function (k) {
        var v = def[k];
        if (v === undefined) { if (k === 'shape') errs.push('shape: ' + N_('dáng đầu cần viền đầu shape (path d, toạ độ khung 200 × 240)')); return; }
        if (typeof v !== 'string' || !SVG_ATTRS.d.test(v) || v.length > 2000 || !/^\s*M/.test(v)) errs.push(k + ': ' + N_('cần path d hợp lệ, bắt đầu bằng M, tối đa 2000 ký tự'));
        else d[k] = v.replace(/\s+/g, ' ').trim();
      });
    } else if (def.shape !== undefined || def.shape45 !== undefined || def.shape90 !== undefined || def.shape135 !== undefined) errs.push('shape: ' + N_('chỉ dáng đầu (slot head) mới có viền đầu'));
    if (def.icon) {   // khung icon khi linh kiện được dùng làm item (vật cầm tay…)
      var ic = def.icon;
      if (![ic.cx, ic.cy, ic.size].every(function (x) { return typeof x === 'number' && isFinite(x); })) errs.push('icon: ' + N_('cần cx, cy, size (số)'));
      else d.icon = { cx: num(ic.cx, 100, -50, 250), cy: num(ic.cy, 120, -50, 300), size: num(ic.size, 120, 20, 320), rot: num(ic.rot, 0, -180, 180) };
    }
    var v = (def.views && def.views.q45) || null;
    var mode = v && (typeof v === 'string' ? v : v.mode);
    if (['drawn', 'same', 'face45', 'body45'].indexOf(mode) < 0) errs.push('views.q45: ' + N_('bắt buộc, chọn mode drawn (kèm layers) | same | face45 | body45 — xem quy trình 45°'));
    d.views = { q45: { mode: mode } };
    if (mode === 'drawn') { d.views.q45.layers = layers(v.layers, 'views.q45.layers', true); var qv = variants(v.variants, 'views.q45.variants', true); if (qv) d.views.q45.variants = qv; }
    // 8 hướng (tuỳ chọn): q90 nghiêng hẳn · q135 sau-45° · q180 sau lưng. drawn | same (= bản 45°) | front (= bản chính diện) | hide
    ['q90', 'q135', 'q180'].forEach(function (k) {
      var w = def.views && def.views[k];
      if (w == null) return;
      var m = typeof w === 'string' ? w : w.mode;
      if (['drawn', 'same', 'front', 'hide'].indexOf(m) < 0) { errs.push('views.' + k + ': ' + N_('mode drawn (kèm layers) | same | front | hide')); return; }
      d.views[k] = { mode: m };
      if (m === 'drawn') { d.views[k].layers = layers(w.layers, 'views.' + k + '.layers', true); var wv = variants(w.variants, 'views.' + k + '.variants', true); if (wv) d.views[k].variants = wv; }
    });
    // thuộc tính riêng theo bộ phận: mặt nạ tô vùng quanh mắt (mặt nạ kinh kịch) · vật cầm tay dài (giấu khi động tác cần hai tay) / cầm nghiêng
    if (def.eyeArea !== undefined) { if (d.slot === 'mask' && /^#[0-9a-fA-F]{6}$/.test(String(def.eyeArea))) d.eyeArea = def.eyeArea; else errs.push('eyeArea: ' + N_('chỉ cho mặt nạ (mask), mã hex #rrggbb')); }
    if (def.tall !== undefined || def.upright !== undefined) {
      if (d.slot !== 'heldL' && d.slot !== 'heldR') errs.push(N_('tall / upright: chỉ cho vật cầm tay (heldL, heldR)'));
      else { if (def.tall === true) d.tall = true; if (def.upright === false) d.upright = false; }
    }
    // grip (v0.16, CNS-044): vật cầm tay là gì — weapon (binh khí: mở các đòn "cần binh khí") · tool (dụng cụ) · prop (đạo cụ: quạt, sách…)
    if (def.grip !== undefined) {
      if (d.slot !== 'heldL' && d.slot !== 'heldR') errs.push('grip: ' + N_('chỉ cho vật cầm tay (heldL, heldR)'));
      else if (['weapon', 'tool', 'prop'].indexOf(def.grip) < 0) errs.push('grip: ' + N_('chọn weapon | tool | prop'));
      else d.grip = def.grip;
    }
    if (def.params) {
      d.params = {};
      Object.keys(def.params).slice(0, 6).forEach(function (k) {
        var q = def.params[k] || {};
        if (!/^[a-zA-Z]{1,20}$/.test(k) || own(Object.prototype, k) || !own(PART_PARAM_TYPES, q.type) || !isFinite(q.min) || !isFinite(q.max) || !(q.min < q.max)) { errs.push('params.' + k + ': ' + N_('cần type (scale|scaleX|scaleY|dx|dy), min < max')); return; }
        var def0 = isFinite(q.def) ? +q.def : (q.type === 'dx' || q.type === 'dy' ? 0 : 1);
        d.params[k] = { label: String(q.label || k).slice(0, 30), type: q.type, min: +q.min, max: +q.max, step: isFinite(q.step) ? +q.step : 0.01,
          def: Math.max(+q.min, Math.min(+q.max, def0)), pivot: Array.isArray(q.pivot) && q.pivot.length === 2 && q.pivot.every(isFinite) ? [+q.pivot[0], +q.pivot[1]] : [100, 100] };
      });
    }
    return { errors: errs, def: errs.length ? null : d };
  }
  // lời khuyên (không chặn) cho linh kiện dữ liệu — những lỗi qua được cổng nhưng lộ ra khi nhìn: rút từ bài thử khung Tam Quốc
  function partAdvice(d) {
    var w = [];
    if (!d || d.kind === 'scenery') return w;
    if (d.slot === 'hair' && !d.views.q180 && !d.views.q135) w.push(d.layers.hairBack
      ? N_('Tóc chưa có bản sau lưng (views.q180 / q135): khi nhân vật quay lưng engine chỉ phủ một mảng tóc trơn theo viền đầu (hoặc dùng lớp hairBack) — búi, dải buộc, tóc dài sẽ mất. Vẽ views.q180 = { mode: "drawn", layers: { hairFront: … } }, dùng <path d="{shape}" fill="{hair}"/> cho mảng tóc sau gáy (khít mọi dáng đầu), và views.q135 tương tự.')
      : N_('Tóc chưa có bản sau lưng (views.q180 / q135): khi nhân vật quay lưng engine chỉ phủ một mảng tóc trơn theo viền đầu — búi, dải buộc, tóc dài sẽ mất. Vẽ views.q180 = { mode: "drawn", layers: { hairFront: … } }, dùng <path d="{shape}" fill="{hair}"/> cho mảng tóc sau gáy (khít mọi dáng đầu), và views.q135 tương tự.'));
    if (d.slot === 'mask' && JSON.stringify(d.layers).indexOf('{shape}') < 0 && d.eyeArea) w.push(N_('Mặt nạ tô kín mặt nên vẽ viền bằng d="{shape}" để khít đầu tròn / vuông / oval ở mọi góc.'));
    if ((d.slot === 'heldL' || d.slot === 'heldR') && !d.icon) w.push(N_('Vật cầm tay chưa có icon { cx, cy, size, rot }: thẻ trang bị sẽ lấy khung mặc định.'));
    return w;
  }
  function fillTokens(svg, P, shape) { return svg.replace(/\{([a-zA-Z]{1,20})\}/g, function (_, k) { return k === 'ink' ? (P && typeof P.ink === 'string' && HEX.test(P.ink) ? P.ink : INK) : k === 'shape' ? shape || 'M100,100Z' : (own(P, k) && HEX.test(P[k]) ? P[k] : '#ff00ff'); }); }
  // thay đánh dấu chiếu <g class="gc-…">…</g> bằng phép chiếu thật (helpers của thư viện lõi). Vòng lặp tuyến tính, KHÔNG đệ quy vào
  // nội dung (bộ lọc đã cấm lồng; đệ quy + phép chiếu nhân đôi = phình luỹ thừa); bỏ qua <g …/> tự đóng khi đếm cặp; nhóm không cân → để nguyên
  function expandMarks(svg, C) {
    if (svg.indexOf('<g class="gc-') < 0) return svg;
    var H = G.GenChibi.helpers, out = '', pos = 0, re = /<g\b[^>]*?(\/?)>|<\/g>/g, i, m, x;
    while ((i = svg.indexOf('<g class="gc-', pos)) >= 0) {
      m = /^<g class="gc-(f45c?|b45[th])">/.exec(svg.slice(i, i + 24));
      if (!m) { out += svg.slice(pos, i + 1); pos = i + 1; continue; }
      var start = i + m[0].length, depth = 1;
      re.lastIndex = start;
      while ((x = re.exec(svg))) { if (x[0] === '</g>') { if (!--depth) break; } else if (!x[1]) depth++; }
      if (!x) break;
      var inner = svg.slice(start, x.index), k = m[1];
      out += svg.slice(pos, i) + (k === 'f45' ? H.face45(C, inner) : k === 'f45c' ? H.face45(C, inner, true) : H.body45(inner, k === 'b45h' ? H.HEM : H.TORSO_UP));
      pos = x.index + 4;
    }
    return out + svg.slice(pos);
  }
  var SHAPE_EL = /<path\b[^>]*\bd="\{shape\}"[^>]*\/>/g;   // viền đầu, mọi thứ tự thuộc tính
  // Đăng ký linh kiện dữ liệu vào một thư viện (pack phải có sẵn). Kiểm lại dù đã kiểm lúc lưu (phòng thủ nhiều lớp).
  function registerDataPart(packId, def) {
    packId = canonPack(packId);
    var c = checkDataPart(def);
    if (c.errors.length) return c;
    var d = c.def, P = PACKS[packId];
    if (!P) return { errors: [N_('thư viện {pack} chưa có', { pack: packId })], def: null };
    if (d.kind === 'scenery') {
      var sp = { slot: d.slot, id: d.id, label: d.label, kind: 'scenery', outdoor: d.outdoor, data: d, source: 'data:' + packId, license: P.license, pack: packId,
        draw: function (C) { return fillTokens(d.svg, C.P); } };
      LIB.parts[packId + '/' + d.slot + ':' + d.id] = sp;
      P.counts.scenery = Object.keys(LIB.parts).filter(function (k) { return k.indexOf(packId + '/') === 0 && LIB.parts[k].kind === 'scenery'; }).length;
      return { errors: [], def: d, part: sp };
    }
    // E4: biến thể theo tâm trạng — khoá tâm trạng suy từ nét mặt đang hiện (moodOf) thắng id trạng thái; không khớp thì giữ lớp gốc
    function pick(V, C) {
      if (!V) return null;
      var st = C.st || {}, m = st.mood || moodOf(st);
      return own(V.mood, m) ? V.mood[m] : own(V.mood, st.id) ? V.mood[st.id] : null;
    }
    function layersOf(L, V, C) {
      var ov = pick(V, C);
      if (!ov) return L;
      var src = {}, l;
      for (l in L) src[l] = L[l];
      for (l in ov) src[l] = V.mode === 'append' && L[l] ? L[l] + ov[l] : ov[l];
      return src;
    }
    function draw(L, V) { return function (C) { var o = {}, src = V ? layersOf(L, V, C) : L; for (var l in src) o[l] = expandMarks(fillTokens(src[l], C.P, C.shape), C); return o; }; }
    var front = draw(d.layers, d.variants), q = d.views.q45, q45;
    if (q.mode === 'drawn') q45 = draw(q.layers, q.variants);
    else if (q.mode === 'same') q45 = front;
    // face45: viền đầu {shape} giữ nguyên (đã là dáng đầu 45°), chỉ chiếu phần hoạ tiết bám mặt
    else if (q.mode === 'face45') q45 = function (C) {
      var o = {}, src = layersOf(d.layers, d.variants, C);
      for (var l in src) { var raw = src[l], base = (raw.match(SHAPE_EL) || []).join(''); o[l] = fillTokens(base, C.P, C.shape) + G.GenChibi.helpers.face45(C, fillTokens(raw.replace(SHAPE_EL, ''), C.P, C.shape), l === 'mask'); }
      return o;
    };
    else q45 = function (C) { var o = front(C), H = G.GenChibi.helpers; for (var l in o) o[l] = l === 'hem' ? H.body45(o[l], H.HEM) : l === 'body' ? H.body45(o[l], H.TORSO_UP) : o[l]; return o; };
    var views = { q45: q45 };
    ['q90', 'q135', 'q180'].forEach(function (k) {
      var w = d.views[k];
      if (!w) return;
      views[k] = w.mode === 'drawn' ? draw(w.layers, w.variants) : w.mode === 'same' ? q45 : w.mode === 'front' ? front : function () { return null; };
    });
    var part = { slot: d.slot, id: d.id, label: d.label, draw: front, views: views, params: d.params, data: d, icon: d.icon,
      eyeArea: d.eyeArea, tall: d.tall, upright: d.upright, grip: d.grip, source: 'data:' + packId, license: P.license, pack: packId };
    if (d.slot === 'head') { part.shape = d.shape; if (d.shape45) part.shape45 = d.shape45; if (d.shape90) part.shape90 = d.shape90; if (d.shape135) part.shape135 = d.shape135; }
    LIB.parts[packId + '/' + d.slot + ':' + d.id] = part;
    P.counts.part = Object.keys(LIB.parts).filter(function (k) { return k.indexOf(packId + '/') === 0 && LIB.parts[k].kind !== 'scenery'; }).length;
    return { errors: [], def: d, part: part };
  }

  /* ------------------------------------------- 7b. GÓI DỮ LIỆU (v0.26, E5 / E7 / E8 / E9) */
  // Một gói (pack) THUẦN JSON: token màu, kiểu mắt (kèm bộ dáng mắt riêng), dáng mắt, kiểu / dáng mày, miệng, linh kiện (kể cả dáng đầu, biến thể tâm trạng),
  // đạo cụ (gắn khớp tay), hiệu ứng, động tác, hoạt động, nhân vật. Không mã, không hàm: mọi SVG đi qua sanitizeSvg, mọi con số qua bộ biểu thức an toàn.
  // checkDataPack(def) kiểm TRỌN gói trước khi đụng kho (lỗi → không đăng ký gì); registerDataPack(def) kiểm rồi đăng ký, nhân vật phải qua cổng gate.
  var PENDING_T = null;   // bảng token tạm trong lúc kiểm một gói (token của gói chưa vào LIB.defaults)
  var EXPR_FN = {
    min: Math.min, max: Math.max, abs: Math.abs, sqrt: Math.sqrt, round: Math.round, floor: Math.floor, ceil: Math.ceil, sin: Math.sin, cos: Math.cos,
    pow: Math.pow, clamp: function (v, a, b) { return Math.max(a, Math.min(b, v)); }, iff: function (c, a, b) { return c ? a : b; }
  };
  // Biểu thức số an toàn (KHÔNG eval / Function): số, tên biến, + − * / %, so sánh, && || !, c ? a : b, hàm (min max abs sqrt round floor ceil sin cos pow clamp iff), ngoặc.
  // names: bảng tên biến hợp lệ (kiểm lúc biên dịch). Trả hàm (ctx) → số. Ném Error có thông điệp tiếng Việt khi sai.
  function compileExpr(src, names) {
    src = String(src);
    if (src.length > 200) throw new Error(N_('biểu thức quá dài (tối đa 200 ký tự)'));
    var toks = [], re = /\s*(?:(\d+\.?\d*|\.\d+)|([A-Za-z_]\w*)|(<=|>=|==|!=|&&|\|\||[-+*\/%()<>?:,!]))/y, pos = 0, m;
    while (pos < src.length) {
      re.lastIndex = pos; m = re.exec(src);
      if (!m) { if (!src.slice(pos).trim()) break; throw new Error(N_('ký tự lạ trong biểu thức gần "{text}"', { text: src.slice(pos, pos + 12) })); }
      pos = re.lastIndex;
      toks.push(m[1] !== undefined ? { n: +m[1] } : m[2] !== undefined ? { id: m[2] } : { op: m[3] });
    }
    if (!toks.length) throw new Error(N_('biểu thức rỗng'));
    var i = 0, depth = 0;
    function isOp(o) { return toks[i] && toks[i].op === o; }
    function eat(o) { if (!isOp(o)) throw new Error(N_('thiếu "{op}" trong biểu thức', { op: o })); i++; }
    function level(next, table) {
      return function () {
        var l = next();
        while (toks[i] && toks[i].op && own(table, toks[i].op)) {
          var g = table[toks[i].op]; i++;
          l = (function (a, b, h) { return function (x) { return h(a(x), b(x)); }; })(l, next(), g);
        }
        return l;
      };
    }
    function unary() {
      if (isOp('-')) { i++; var a = unary(); return function (x) { return -a(x); }; }
      if (isOp('+')) { i++; return unary(); }
      if (isOp('!')) { i++; var b = unary(); return function (x) { return b(x) ? 0 : 1; }; }
      return primary();
    }
    function primary() {
      var t = toks[i];
      if (!t) throw new Error(N_('biểu thức cụt'));
      if (++depth > 24) throw new Error(N_('biểu thức lồng quá sâu'));
      var r;
      if (t.n !== undefined) { i++; r = (function (v) { return function () { return v; }; })(t.n); }
      else if (t.id !== undefined) {
        i++;
        if (isOp('(')) {
          if (!own(EXPR_FN, t.id)) throw new Error(N_('hàm lạ "{id}" (có: {ids})', { id: t.id, ids: Object.keys(EXPR_FN).join(', ') }));
          i++;
          var args = [];
          if (!isOp(')')) { do { args.push(ternary()); } while (isOp(',') && ++i); }
          eat(')');
          var fn = EXPR_FN[t.id];
          r = function (x) { return fn.apply(null, args.map(function (a) { return a(x); })); };
        } else {
          if (!own(names, t.id)) throw new Error(N_('biến lạ "{id}" (có: {ids})', { id: t.id, ids: Object.keys(names).slice(0, 14).join(', ') }));
          r = (function (k) { return function (x) { var v = x[k]; return typeof v === 'number' ? v : 0; }; })(t.id);
        }
      } else if (isOp('(')) { i++; r = ternary(); eat(')'); }
      else throw new Error(N_('"{op}" không đứng được ở đây trong biểu thức', { op: t.op }));
      depth--;
      return r;
    }
    var mul = level(unary, { '*': function (a, b) { return a * b; }, '/': function (a, b) { return b ? a / b : 0; }, '%': function (a, b) { return b ? a % b : 0; } });
    var add = level(mul, { '+': function (a, b) { return a + b; }, '-': function (a, b) { return a - b; } });
    var rel = level(add, { '<': function (a, b) { return a < b ? 1 : 0; }, '>': function (a, b) { return a > b ? 1 : 0; }, '<=': function (a, b) { return a <= b ? 1 : 0; }, '>=': function (a, b) { return a >= b ? 1 : 0; } });
    var eq = level(rel, { '==': function (a, b) { return a === b ? 1 : 0; }, '!=': function (a, b) { return a !== b ? 1 : 0; } });
    var and = level(eq, { '&&': function (a, b) { return a && b ? 1 : 0; } });
    var or = level(and, { '||': function (a, b) { return a || b ? 1 : 0; } });
    function ternary() {
      var c = or();
      if (isOp('?')) { i++; var a = ternary(); eat(':'); var b = ternary(); return function (x) { return c(x) ? a(x) : b(x); }; }
      return c;
    }
    var out = ternary();
    if (i < toks.length) throw new Error(N_('thừa "{op}" cuối biểu thức', { op: toks[i].op || toks[i].id || toks[i].n }));
    return out;
  }
  function f1n(v) { v = Math.max(-9999, Math.min(9999, v)); return String(Math.round(v * 100) / 100); }
  function fnum(v) { return isFinite(v) ? f1n(v) : '0'; }
  // Mẫu SVG có chỗ điền số: {=biểu thức} (số) · {token} (màu bảng màu) · {ink}. Kiểm bằng cách dựng thử với số mẫu rồi cho qua sanitizeSvg:
  // đầu ra thật chỉ khác đầu ra thử ở các con số (đã kẹp ±9999, làm tròn 2 số lẻ) nên vẫn đi qua bộ lọc.
  function compileTpl(src, names, errs, where, T) {
    src = String(src == null ? '' : src);
    if (src.length > 6000) { errs.push(where + ': ' + N_('quá 6 000 ký tự')); return null; }
    var segs = [], last = 0, re = /\{=([^{}]{1,200})\}/g, m, dummy = {}, k;
    for (k in names) dummy[k] = 7;
    while ((m = re.exec(src))) {
      segs.push(src.slice(last, m.index));
      try { segs.push(compileExpr(m[1], names)); } catch (e) { errs.push(where + ': ' + e.message); return null; }
      last = re.lastIndex;
    }
    segs.push(src.slice(last));
    var tpl = { segs: segs }, n0 = errs.length;
    sanitizeSvg(runTpl(tpl, dummy), errs, where, T);
    return errs.length > n0 ? null : tpl;
  }
  function runTpl(tpl, ctx) {
    var s = '', i, g;
    for (i = 0; i < tpl.segs.length; i++) { g = tpl.segs[i]; s += typeof g === 'string' ? g : fnum(g(ctx)); }
    return s;
  }
  // svg: chuỗi | mảng phần tử (chuỗi | { if: biểu thức, svg: chuỗi }) — phần có "if" chỉ vẽ khi biểu thức khác 0
  function compileParts(items, names, errs, where, T) {
    if (typeof items === 'string') items = [items];
    if (!Array.isArray(items) || !items.length || items.length > 24) { errs.push(where + ': ' + N_('cần svg — một chuỗi hoặc mảng 1–24 phần')); return null; }
    var out = [], total = 0, n0 = errs.length;
    items.forEach(function (it, i) {
      var w = where + '[' + i + ']', cond = null, svg = it;
      if (it && typeof it === 'object' && !Array.isArray(it)) {
        Object.keys(it).forEach(function (k) { if (k !== 'svg' && k !== 'if') errs.push(w + ': ' + N_('khoá lạ "{key}"', { key: String(k).slice(0, 30) })); });
        svg = it.svg;
        if (it['if'] !== undefined) { try { cond = compileExpr(it['if'], names); } catch (e) { errs.push(w + '.if: ' + e.message); return; } }
      }
      if (typeof svg !== 'string') { errs.push(w + ': ' + N_('svg phải là chuỗi')); return; }
      total += svg.length;
      var tpl = compileTpl(svg, names, errs, w, T);
      if (tpl) out.push({ cond: cond, tpl: tpl });
    });
    if (total > 12000) errs.push(where + ': ' + N_('tổng svg quá 12 000 ký tự'));
    return errs.length > n0 ? null : out;
  }
  function runParts(parts, ctx, P) {
    var s = '', i;
    for (i = 0; i < parts.length; i++) if (!parts[i].cond || parts[i].cond(ctx)) s += runTpl(parts[i].tpl, ctx);
    return fillTokens(s, P);
  }
  // biến: { tên: số | biểu thức } — tính tuần tự (biến sau dùng được biến trước). Trả danh sách đã biên dịch + bảng tên (bản sao, có thêm tên biến)
  var VAR_NAME = /^[a-zA-Z][a-zA-Z0-9]{0,15}$/;
  function compileVars(vars, names, reserved, errs, where) {
    var list = [], nm = Object.assign({}, names);
    if (vars === undefined) return { list: list, names: nm };
    if (!vars || typeof vars !== 'object' || Array.isArray(vars) || Object.keys(vars).length > 16) { errs.push(where + ': ' + N_('vars phải là object { tên: số | biểu thức }, tối đa 16 biến')); return { list: list, names: nm }; }
    Object.keys(vars).forEach(function (k) {
      var v = vars[k], w = where + '.' + k;
      if (!VAR_NAME.test(k) || own(reserved, k) || own(EXPR_FN, k)) { errs.push(w + ': ' + N_('tên biến chỉ gồm chữ + số (≤ 16), không trùng biến có sẵn / tên hàm')); return; }
      try {
        if (typeof v === 'number' && isFinite(v)) list.push({ k: k, v: v });
        else if (typeof v === 'string') list.push({ k: k, fn: compileExpr(v, nm) });
        else { errs.push(w + ': ' + N_('cần số hoặc biểu thức')); return; }
        nm[k] = 1;
      } catch (e) { errs.push(w + ': ' + e.message); }
    });
    return { list: list, names: nm };
  }
  function evalVars(list, ctx) { for (var i = 0; i < list.length; i++) ctx[list[i].k] = list[i].fn ? +fnum(list[i].fn(ctx)) : list[i].v; }
  function evalTokens() { var T = Object.assign({}, PENDING_T || LIB.defaults); T.ink = 1; T.eyeArea = 1; return T; }   // màu dùng được trong mắt / miệng / đạo cụ: bảng màu + {ink} + vùng quanh mắt
  var DATA_ID = /^[a-z][a-zA-Z0-9-]{1,29}$/;
  function idErr(errs, where, id) { if (!DATA_ID.test(String(id || ''))) errs.push(where + '.id: ' + N_('chữ thường đầu, chữ + số + gạch nối, 2–30 ký tự')); }
  function lbl(v, id, n) { return plain(v == null ? id : v, n || 40) || id; }
  function numIn(errs, where, v, lo, hi, def) {
    if (v === undefined) return def;
    if (typeof v !== 'number' || !isFinite(v) || v < lo || v > hi) { errs.push(where + ': ' + N_('số trong [{min}, {max}]', { min: lo, max: hi })); return def; }
    return v;
  }
  function knownKeys(o, ok, errs, where) { Object.keys(o).forEach(function (k) { if (ok.indexOf(k) < 0) errs.push(where + ': ' + N_('khoá lạ "{key}"', { key: String(k).slice(0, 30) })); }); }
  function isObj(x) { return !!x && typeof x === 'object' && !Array.isArray(x); }

  // --- dáng mắt (global hoặc riêng của một kiểu mắt) ---
  // biến có sẵn: x, y = tâm mắt · w, h = nửa rộng / nửa cao của kiểu mắt · side = −1 mắt trái, +1 mắt phải · lid, slant = của kiểu mắt (0 nếu không có)
  var EYE_NAMES = { x: 1, y: 1, w: 1, h: 1, side: 1, lid: 1, slant: 1 };
  // Thứ tự tính của một dáng thuộc kiểu mắt: style.vars (mặc định) → pose.vars (ghi đè) → style.calc (tính SAU khi dáng đã chọn xong biến) → vẽ svg
  function checkEyePose(p, where, errs, T, styleNames, calcNames) {
    if (!isObj(p)) { errs.push(where + ': ' + N_('dáng mắt phải là object')); return null; }
    knownKeys(p, ['id', 'label', 'vars', 'svg'], errs, where);
    var cv = compileVars(p.vars, styleNames || EYE_NAMES, EYE_NAMES, errs, where + '.vars');
    return { vlist: cv.list, names: Object.assign({}, cv.names, calcNames || {}), parts: p.svg === undefined ? null : compileParts(p.svg, Object.assign({}, cv.names, calcNames || {}), errs, where + '.svg', T), hasSvg: p.svg !== undefined };
  }
  function eyeFn(style, d) {
    return function (S, side, x, y, C) {
      var ctx = { x: x, y: y, w: S.w, h: S.h, side: side, lid: S.lid || 0, slant: S.slant || 0 };
      if (style) evalVars(style.vlist, ctx);
      evalVars(d.vlist, ctx);
      if (style) evalVars(style.calc, ctx);
      return runParts(d.parts, ctx, C.P);
    };
  }
  function checkEyeStyle(s, where, errs, T) {
    var d = { poses: {} };
    if (!isObj(s)) { errs.push(where + ': ' + N_('kiểu mắt phải là object')); return null; }
    knownKeys(s, ['id', 'label', 'w', 'h', 'lid', 'slant', 'small', 'vars', 'calc', 'template', 'poses'], errs, where);
    idErr(errs, where, s.id);
    d.id = String(s.id || ''); d.label = lbl(s.label, d.id);
    d.w = numIn(errs, where + '.w', s.w, 3, 24, 9); d.h = numIn(errs, where + '.h', s.h, 2, 24, 11);
    if (s.lid !== undefined) d.lid = numIn(errs, where + '.lid', s.lid, 0, 0.9, 0);
    if (s.slant !== undefined) d.slant = numIn(errs, where + '.slant', s.slant, -30, 30, 0);
    if (s.small !== undefined) d.small = !!s.small;
    var sv = compileVars(s.vars, EYE_NAMES, EYE_NAMES, errs, where + '.vars');
    d.vlist = sv.list;
    var P = s.poses;
    if (P !== undefined && (!isObj(P) || Object.keys(P).length > 40)) { errs.push(where + '.poses: ' + N_('object { id dáng: { vars?, svg? } }, tối đa 40 dáng')); P = undefined; }
    // tên biến dùng được trong mẫu chung = biến của kiểu mắt ∪ biến của mọi dáng (dáng không khai thì biến đó = 0)
    var all = Object.assign({}, sv.names);
    Object.keys(P || {}).forEach(function (k) { var v = P[k] && P[k].vars; if (isObj(v)) Object.keys(v).forEach(function (n) { if (VAR_NAME.test(n) && !own(EYE_NAMES, n)) all[n] = 1; }); });
    // calc: biến tính sau khi dáng đã đặt xong biến của nó (vd. nửa rộng mắt = w · k, với k do từng dáng quyết định)
    var cc = compileVars(s.calc, all, EYE_NAMES, errs, where + '.calc');
    d.calc = cc.list;
    var tpl = null;
    if (s.template !== undefined) tpl = compileParts(s.template, cc.names, errs, where + '.template', T);
    Object.keys(P || {}).forEach(function (k) {
      var w = where + '.poses.' + k;
      if (!DATA_ID.test(k)) { errs.push(w + ': ' + N_('id dáng mắt: chữ thường đầu, chữ + số + gạch nối, 2–30 ký tự')); return; }
      var q = checkEyePose(P[k], w, errs, T, sv.names, cc.names);
      if (!q) return;
      if (!q.hasSvg) { if (tpl) q.parts = tpl; else if (s.template === undefined) errs.push(w + ': ' + N_('cần svg hoặc template chung của kiểu mắt')); }
      if (q.parts) d.poses[k] = q;
    });
    return d;
  }
  function checkBrowStyle(s, where, errs) {
    if (!isObj(s)) { errs.push(where + ': ' + N_('kiểu mày phải là object')); return { id: '' }; }
    knownKeys(s, ['id', 'label', 'w', 'len'], errs, where);
    idErr(errs, where, s.id);
    var id = String(s.id || '');
    return { id: id, label: lbl(s.label, id), w: numIn(errs, where + '.w', s.w, 1, 14, 3.8), len: numIn(errs, where + '.len', s.len, 6, 40, 14) };
  }
  function checkBrowPose(s, where, errs) {
    if (!isObj(s)) { errs.push(where + ': ' + N_('dáng mày phải là object')); return { id: '' }; }
    knownKeys(s, ['id', 'label', 'rot', 'dy', 'arc', 'rotR', 'dyR'], errs, where);
    idErr(errs, where, s.id);
    var id = String(s.id || ''), d = { id: id, label: lbl(s.label, id) };
    d.rot = numIn(errs, where + '.rot', s.rot, -60, 60, 0); d.dy = numIn(errs, where + '.dy', s.dy, -24, 24, 0); d.arc = numIn(errs, where + '.arc', s.arc, -12, 12, 2);
    if (s.rotR !== undefined) d.rotR = numIn(errs, where + '.rotR', s.rotR, -60, 60, 0);
    if (s.dyR !== undefined) d.dyR = numIn(errs, where + '.dyR', s.dyR, -24, 24, 0);
    return d;
  }
  var MOUTH_NAMES = { x: 1, y: 1 };   // mỏ neo miệng (100, 131)
  function checkMouth(s, where, errs, T) {
    var d = {};
    if (!isObj(s)) { errs.push(where + ': ' + N_('miệng phải là object')); return null; }
    knownKeys(s, ['id', 'label', 'vars', 'svg'], errs, where);
    idErr(errs, where, s.id);
    d.id = String(s.id || ''); d.label = lbl(s.label, d.id);
    var cv = compileVars(s.vars, MOUTH_NAMES, MOUTH_NAMES, errs, where + '.vars');
    d.vlist = cv.list; d.parts = compileParts(s.svg, cv.names, errs, where + '.svg', T);
    return d;
  }
  // --- đạo cụ, hiệu ứng ---
  var PROP_LAYERS = ['propBack', 'propMid', 'propFront', 'heldL', 'heldR', 'held'];
  var FX_LAYERS = ['fxBack', 'fxHead', 'fxFront', 'cheeks'];
  function plainLayers(src, allow, where, errs, T) {
    var o = {}, n = 0;
    if (!isObj(src)) { errs.push(where + ': ' + N_('cần object { lớp: svg }')); return o; }
    Object.keys(src).forEach(function (l) {
      if (allow.indexOf(l) < 0) { errs.push(where + '.' + String(l).slice(0, 24) + ': ' + N_('lớp không dùng được ở đây (chọn {ids})', { ids: allow.join(', ') })); return; }
      var c = sanitizeSvg(src[l], errs, where + '.' + l, T);
      if (c) { o[l] = c; n++; }
    });
    if (!n) errs.push(where + ': ' + N_('chưa có lớp nào vẽ được'));
    return o;
  }
  // anchor (E8): { joint: handL | handR | hand (theo tay đang cầm, mặc định phải), dx?, dy?, rot?, scale?, z?: front | held }. Lớp "held" vẽ trong toạ độ CỤC BỘ của bàn tay:
  // gốc (0, 0) = điểm nắm (RIG.anchors.gripL / gripR), nằm trên khớp handL / handR nên đi cùng cánh tay ở mọi tư thế; z "front" (mặc định) = trên bàn tay, "held" = lớp đồ cầm tay (bị cất khi động tác cất tay).
  function checkProp(s, where, errs, T) {
    if (!isObj(s)) { errs.push(where + ': ' + N_('đạo cụ phải là object')); return null; }
    knownKeys(s, ['id', 'label', 'anchor', 'layers'], errs, where);
    idErr(errs, where, s.id);
    var d = { id: String(s.id || ''), label: lbl(s.label, String(s.id || '')) };
    d.layers = plainLayers(s.layers, PROP_LAYERS, where + '.layers', errs, T);
    if (s.anchor !== undefined) {
      var a = s.anchor;
      if (!isObj(a)) errs.push(where + '.anchor: ' + N_('cần object { joint, dx?, dy?, rot?, scale?, z? }'));
      else {
        knownKeys(a, ['joint', 'dx', 'dy', 'rot', 'scale', 'z'], errs, where + '.anchor');
        if (['handL', 'handR', 'hand'].indexOf(a.joint) < 0) errs.push(where + '.anchor.joint: ' + N_('chọn handL | handR | hand'));
        if (a.z !== undefined && ['front', 'held'].indexOf(a.z) < 0) errs.push(where + '.anchor.z: ' + N_('chọn front | held'));
        d.anchor = { joint: a.joint, dx: numIn(errs, where + '.anchor.dx', a.dx, -120, 120, 0), dy: numIn(errs, where + '.anchor.dy', a.dy, -120, 120, 0),
          rot: numIn(errs, where + '.anchor.rot', a.rot, -360, 360, 0), scale: numIn(errs, where + '.anchor.scale', a.scale, 0.05, 6, 1), z: a.z || 'front' };
      }
    }
    if (own(d.layers, 'held') && !d.anchor) errs.push(where + '.layers.held: ' + N_('lớp "held" (toạ độ cục bộ của bàn tay) cần anchor'));
    if (d.anchor && !own(d.layers, 'held')) errs.push(where + '.anchor: ' + N_('anchor chỉ đi với lớp "held"'));
    return d;
  }
  function propFn(d) {
    var A = d.anchor, ly = d.layers;
    return function (C, st, side) {
      var o = {}, l, s = A ? (A.joint === 'handL' ? 'L' : A.joint === 'handR' ? 'R' : side === 'L' ? 'L' : 'R') : '';
      for (l in ly) {
        var c = fillTokens(ly[l], C.P);
        if (l === 'held') {
          var g = s === 'L' ? C.A.gripL : C.A.gripR, k = (A.z === 'held' ? 'held' : 'hand') + s;
          o[k] = (o[k] || '') + '<g transform="translate(' + f1n(g[0] + A.dx) + ' ' + f1n(g[1] + A.dy) + ')' + (A.rot ? ' rotate(' + f1n(A.rot) + ')' : '') + (A.scale !== 1 ? ' scale(' + f1n(A.scale) + ')' : '') + '">' + c + '</g>';
        } else o[l] = (o[l] || '') + c;
      }
      return o;
    };
  }
  function checkFx(s, where, errs, T) {
    if (!isObj(s)) { errs.push(where + ': ' + N_('hiệu ứng phải là object')); return null; }
    knownKeys(s, ['id', 'label', 'face', 'layers'], errs, where);
    idErr(errs, where, s.id);
    var d = { id: String(s.id || ''), label: lbl(s.label, String(s.id || '')), face: !!s.face };
    d.layers = plainLayers(s.layers, FX_LAYERS, where + '.layers', errs, T);
    d.layer = Object.keys(d.layers)[0] || 'fxHead';
    return d;
  }
  // --- động tác, hoạt động ---
  var CH_RANGE = { x: [-300, 300], y: [-300, 300], rot: [-1080, 1080], sx: [0.01, 6], sy: [0.01, 6] };
  function checkMotion(s, where, errs, hasProp) {
    if (!isObj(s)) { errs.push(where + ': ' + N_('động tác phải là object')); return null; }
    knownKeys(s, ['id', 'label', 'dur', 'still', 'breath', 'loop', 'tracks', 'hide', 'hold', 'props'], errs, where);
    idErr(errs, where, s.id);
    var d = { id: String(s.id || ''), label: lbl(s.label, String(s.id || '')), dur: numIn(errs, where + '.dur', s.dur, 0.1, 12, 1), still: numIn(errs, where + '.still', s.still, 0, 1, 0.25), tracks: {} };
    if (s.breath === false) d.breath = false;
    if (s.loop === false) d.loop = false;
    var T = s.tracks, nj = 0;
    if (!isObj(T)) errs.push(where + '.tracks: ' + N_('cần object { khớp: { kênh: [[t, giá trị], …] } }'));
    else Object.keys(T).forEach(function (j) {
      if (!own(RIG.joints, j) || j === 'stage') { errs.push(where + '.tracks.' + String(j).slice(0, 20) + ': ' + N_('khớp lạ (chọn {ids})', { ids: JOINT_IDS.join(', ') })); return; }
      if (++nj > 18) return;
      var ch = T[j];
      if (!isObj(ch)) { errs.push(where + '.tracks.' + j + ': ' + N_('cần object { kênh: khoá }')); return; }
      d.tracks[j] = {};
      Object.keys(ch).forEach(function (c) {
        var w = where + '.tracks.' + j + '.' + String(c).slice(0, 8), ks = ch[c];
        if (!own(CH_RANGE, c)) { errs.push(w + ': ' + N_('kênh lạ (chọn x, y, rot, sx, sy)')); return; }
        if (!Array.isArray(ks) || !ks.length || ks.length > 16) { errs.push(w + ': ' + N_('1–16 khoá [t, giá trị]')); return; }
        var out = [], bad = false;
        ks.forEach(function (k, i) {
          if (!Array.isArray(k) || k.length !== 2 || !finite(k[0]) || !finite(k[1]) || k[0] < 0 || k[0] > 1 || (i && k[0] < ks[i - 1][0]) || k[1] < CH_RANGE[c][0] || k[1] > CH_RANGE[c][1]) bad = true;
          else out.push([k[0], k[1]]);
        });
        if (bad) errs.push(w + ': ' + N_('khoá sai: t tăng dần trong [0, 1], giá trị trong [{min}, {max}]', { min: CH_RANGE[c][0], max: CH_RANGE[c][1] }));
        else d.tracks[j][c] = out;
      });
    });
    if (s.hide !== undefined) {
      if (!Array.isArray(s.hide) || s.hide.length > 8 || s.hide.some(function (x) { return !/^(held|tall)[LR]$/.test(String(x)); })) errs.push(where + '.hide: ' + N_('mảng heldL | heldR | tallL | tallR'));
      else d.hide = s.hide.slice();
    }
    if (s.hold !== undefined) {
      if (!isObj(s.hold)) errs.push(where + '.hold: ' + N_('object { L?: đạo cụ, R?: đạo cụ }'));
      else { d.hold = {}; Object.keys(s.hold).forEach(function (sd) { if ((sd !== 'L' && sd !== 'R') || !hasProp(s.hold[sd])) errs.push(where + '.hold.' + String(sd).slice(0, 8) + ': ' + N_('L | R trỏ tới đạo cụ có thật')); else d.hold[sd] = s.hold[sd]; }); }
    }
    if (s.props !== undefined) {
      if (!Array.isArray(s.props) || s.props.length > 6 || !s.props.every(function (x) { return hasProp(x); })) errs.push(where + '.props: ' + N_('mảng đạo cụ có thật'));
      else d.props = s.props.slice();
    }
    return d;
  }
  function checkActivity(s, where, errs, R) {
    if (!isObj(s)) { errs.push(where + ': ' + N_('hoạt động phải là object')); return null; }
    knownKeys(s, ['id', 'label', 'group', 'hint', 'posture', 'move', 'action', 'state', 'face', 'fx', 'props'], errs, where);
    idErr(errs, where, s.id);
    var id = String(s.id || ''), d = { id: id, label: lbl(s.label, id), group: lbl(s.group, 'Gói', 30), hint: plain(s.hint || '', 80) };
    var CH = G.GenChibi && G.GenChibi.choreo;
    if (own(LIB.states, id)) errs.push(where + '.id: ' + N_('trùng tên trạng thái (state) của kịch bản — đổi tên'));
    if (CH && CH.ACTIONS && own(CH.ACTIONS, id)) errs.push(where + '.id: ' + N_('trùng tên đòn của biên đạo — đổi tên'));
    [['posture', function (x) { return own(LIB.postures, x); }], ['move', function (x) { return own(LIB.moves, x); }], ['action', R.motion], ['state', function (x) { return own(LIB.states, x); }]].forEach(function (p) {
      if (s[p[0]] === undefined) return;
      if (typeof s[p[0]] !== 'string' || !p[1](s[p[0]])) errs.push(where + '.' + p[0] + ': ' + N_('"{ref}" không có trong kho', { ref: String(s[p[0]]).slice(0, 30) }));
      else d[p[0]] = s[p[0]];
    });
    if (s.face !== undefined) {
      if (!isObj(s.face)) errs.push(where + '.face: ' + N_('object { eyes?, brows?, mouth? }'));
      else {
        d.face = {};
        [['eyes', R.eye], ['brows', R.brow], ['mouth', R.mouth]].forEach(function (p) {
          if (s.face[p[0]] === undefined) return;
          if (typeof s.face[p[0]] !== 'string' || !p[1](s.face[p[0]])) errs.push(where + '.face.' + p[0] + ': ' + N_('"{ref}" không có trong kho', { ref: String(s.face[p[0]]).slice(0, 30) }));
          else d.face[p[0]] = s.face[p[0]];
        });
      }
    }
    if (s.fx !== undefined) { if (!Array.isArray(s.fx) || s.fx.length > 8 || !s.fx.every(function (x) { return typeof x === 'string' && R.fx(x); })) errs.push(where + '.fx: ' + N_('mảng hiệu ứng có thật')); else d.fx = s.fx.slice(); }
    if (s.props !== undefined) { if (!Array.isArray(s.props) || s.props.length > 6 || !s.props.every(function (x) { return typeof x === 'string' && R.prop(x); })) errs.push(where + '.props: ' + N_('mảng đạo cụ có thật')); else d.props = s.props.slice(); }
    return d;
  }
  // --- token màu (E7): "#hex" cố định, hoặc { from, to?, t? } = dẫn xuất (from pha t phần với to; nhân vật không khai báo thì engine tính) ---
  var TOKEN_RESERVED = { ink: 1, shape: 1, eyeArea: 1 };
  function checkTokens(src, errs, packId) {
    var out = {};
    if (src === undefined) return out;
    if (!isObj(src) || Object.keys(src).length > 32) { errs.push('tokens: ' + N_('object { tên: "#hex" | { from, to?, t? } }, tối đa 32 token')); return out; }
    Object.keys(src).forEach(function (k) {
      var v = src[k], w = 'tokens.' + String(k).slice(0, 20);
      if (!/^[a-zA-Z]{1,20}$/.test(k) || own(TOKEN_RESERVED, k)) { errs.push(w + ': ' + N_('tên token chỉ gồm chữ (≤ 20), không dùng ink / shape / eyeArea')); return; }
      if (own(LIB.tokenOwner, k) && LIB.tokenOwner[k] !== packId) { errs.push(w + ': ' + N_('token đã thuộc thư viện {pack}', { pack: LIB.tokenOwner[k] })); return; }
      if (typeof v === 'string' && HEX.test(v)) { out[k] = { value: v }; return; }
      if (isObj(v)) {
        knownKeys(v, ['from', 'to', 't'], errs, w);
        var to = v.to === undefined ? '#000000' : v.to, t = numIn(errs, w + '.t', v.t, 0, 1, 0.3);
        var fromHex = typeof v.from === 'string' && own(src, v.from) && typeof src[v.from] === 'string' && HEX.test(src[v.from]);
        var fromLib = typeof v.from === 'string' && own(LIB.defaults, v.from) && !own(LIB.derive, v.from) && !(own(src, v.from));
        if (!fromHex && !fromLib) { errs.push(w + '.from: ' + N_('token gốc phải có sẵn trong kho (không dẫn xuất) hoặc là token "#hex" của gói')); return; }
        if (typeof to !== 'string' || !HEX.test(to)) { errs.push(w + '.to: ' + N_('mã màu hex')); return; }
        out[k] = { value: mixHex(fromHex ? src[v.from] : LIB.defaults[v.from], to, t), rule: { from: v.from, to: to, t: t } };
        return;
      }
      errs.push(w + ': ' + N_('"#hex" hoặc { from, to?, t? }'));
    });
    return out;
  }

  var PACK_KEYS = ['format', 'id', 'name', 'owner', 'license', 'version', 'description', 'tokens', 'eyeStyles', 'eyePoses', 'browStyles', 'browPoses', 'mouths', 'parts', 'props', 'fx', 'motions', 'activities', 'assets'];
  var PACK_LISTS = { eyeStyles: 40, eyePoses: 60, browStyles: 20, browPoses: 40, mouths: 40, parts: 120, props: 40, fx: 40, motions: 60, activities: 60, assets: 20 };
  // id đã thuộc gói KHÁC (cùng gói = nạp lại, được phép)
  function foreign(map, id, packId) { return own(map, id) && !!map[id] && map[id].pack !== undefined && map[id].pack !== packId; }
  // Kiểm trọn một gói. → { errors, warnings, def } — def = bản đã chuẩn hoá (chuỗi / số sạch + hàm đã biên dịch), sẵn để đăng ký. KHÔNG đụng kho.
  function checkDataPack(def) {
    var errs = [], warn = [], d = {};
    if (!isObj(def)) return { errors: [N_('gói phải là object')], warnings: [], def: null };
    if (JSON.stringify(def).length > 1500000) return { errors: [N_('gói quá lớn (tối đa 1,5 MB)')], warnings: [], def: null };
    knownKeys(def, PACK_KEYS, errs, 'pack');
    if (def.format !== undefined && def.format !== 'gen-chibi.pack/1') errs.push('format: ' + N_('chỉ "gen-chibi.pack/1"'));
    if (!/^[a-z0-9]+(\.[a-z0-9-]+)+$/.test(String(def.id || ''))) errs.push('id: ' + N_('id thư viện phải dạng chu.ten: {id}', { id: String(def.id || '').slice(0, 40) }));
    var packId = canonPack(String(def.id || ''));
    if (own(PACKS, packId) && PACKS[packId].group === 'frame') errs.push('id: ' + N_('không đè thư viện của khung ({id})', { id: packId }));
    d.id = packId; d.name = lbl(def.name, packId, 60); d.owner = lbl(def.owner, '', 60); d.version = plain(def.version || '0.0.1', 20); d.description = plain(def.description || '', 300);
    d.license = plain(def.license || '', 160);
    if (!d.license) errs.push('license: ' + N_('bắt buộc'));
    if (!d.owner) errs.push('owner: ' + N_('bắt buộc'));
    var L = {};
    Object.keys(PACK_LISTS).forEach(function (k) {
      if (def[k] === undefined) L[k] = [];
      else if (!Array.isArray(def[k]) || def[k].length > PACK_LISTS[k]) { errs.push(k + ': ' + N_('mảng tối đa {n} mục', { n: PACK_LISTS[k] })); L[k] = []; }
      else L[k] = def[k];
    });
    d.tokens = checkTokens(def.tokens, errs, packId);
    var save = PENDING_T;
    PENDING_T = Object.assign({}, LIB.defaults);
    Object.keys(d.tokens).forEach(function (k) { PENDING_T[k] = d.tokens[k].value; });
    try {
      var T = evalTokens(), seen = {};
      var dup = function (kind, id, where) { var key = kind + ':' + id; if (seen[key]) errs.push(where + ': ' + N_('id "{id}" trùng trong gói', { id: String(id).slice(0, 30) })); seen[key] = 1; };
      var each = function (k, fn) { L[k].forEach(function (x, i) { fn(x, k + '[' + i + ']', i); }); };
      // kho chung: id của gói KHÁC không được đè
      var clash = function (map, id, where, what) { if (foreign(map, id, packId)) errs.push(where + '.id: ' + N_('{what} "{id}" đã thuộc thư viện {pack}', { what: what, id: id, pack: map[id].pack })); };
      d.browStyles = []; each('browStyles', function (x, w) { var r = checkBrowStyle(x, w, errs); dup('browStyle', r.id, w); clash(LIB.browStyles, r.id, w, 'kiểu mày'); d.browStyles.push(r); });
      d.browPoses = []; each('browPoses', function (x, w) { var r = checkBrowPose(x, w, errs); dup('browPose', r.id, w); clash(LIB.browPoses, r.id, w, 'dáng mày'); d.browPoses.push(r); });
      d.eyePoses = []; each('eyePoses', function (x, w) {
        var r = checkEyePose(x, w, errs, T, null);
        if (!r) return;
        var id = String((x && x.id) || '');
        idErr(errs, w, id);
        if (!r.hasSvg) errs.push(w + ': ' + N_('cần svg'));
        dup('eyePose', id, w); clash(LIB.eyePoses, id, w, 'dáng mắt');
        r.id = id; d.eyePoses.push(r);
      });
      d.eyeStyles = []; each('eyeStyles', function (x, w) { var r = checkEyeStyle(x, w, errs, T); if (!r) return; dup('eyeStyle', r.id, w); clash(LIB.eyeStyles, r.id, w, 'kiểu mắt'); d.eyeStyles.push(r); });
      var eyeIds = Object.keys(LIB.eyePoses).concat(d.eyePoses.map(function (p) { return p.id; }));
      d.eyeStyles.forEach(function (s, i) { Object.keys(s.poses).forEach(function (k) { if (eyeIds.indexOf(k) < 0) errs.push('eyeStyles[' + i + '].poses.' + k + ': ' + N_('dáng mắt này chưa có trong kho — thêm vào eyePoses của gói để trạng thái dùng được')); }); });
      d.mouths = []; each('mouths', function (x, w) { var r = checkMouth(x, w, errs, T); if (!r) return; dup('mouth', r.id, w); clash(LIB.mouths, r.id, w, 'miệng'); d.mouths.push(r); });
      var ids = function (k) { var o = {}; L[k].forEach(function (x) { if (isObj(x) && typeof x.id === 'string') o[x.id] = 1; }); return o; };
      var propIds = ids('props'), fxIds = ids('fx'), motIds = ids('motions');
      d.props = []; each('props', function (x, w) { var r = checkProp(x, w, errs, T); if (!r) return; dup('prop', r.id, w); clash(LIB.props, r.id, w, 'đạo cụ'); d.props.push(r); });
      d.fx = []; each('fx', function (x, w) { var r = checkFx(x, w, errs, T); if (!r) return; dup('fx', r.id, w); clash(LIB.fx, r.id, w, 'hiệu ứng'); d.fx.push(r); });
      var hasProp = function (x) { return typeof x === 'string' && (own(LIB.props, x) || own(propIds, x)); };
      d.motions = []; each('motions', function (x, w) { var r = checkMotion(x, w, errs, hasProp); if (!r) return; dup('motion', r.id, w); clash(LIB.motions, r.id, w, 'động tác'); d.motions.push(r); });
      var R = {
        motion: function (x) { return own(LIB.motions, x) || own(motIds, x); }, prop: hasProp,
        fx: function (x) { return own(LIB.fx, x) || own(fxIds, x); }, eye: function (x) { return eyeIds.indexOf(x) >= 0; },
        brow: function (x) { return own(LIB.browPoses, x) || d.browPoses.some(function (p) { return p.id === x; }); },
        mouth: function (x) { return own(LIB.mouths, x) || d.mouths.some(function (p) { return p.id === x; }); }
      };
      d.activities = []; each('activities', function (x, w) { var r = checkActivity(x, w, errs, R); if (!r) return; dup('activity', r.id, w); clash(LIB.activities, r.id, w, 'hoạt động'); d.activities.push(r); });
      d.parts = []; each('parts', function (x, w) {
        var c = checkDataPart(x);
        c.errors.forEach(function (e) { errs.push(w + (x && x.id ? '(' + String(x.id).slice(0, 30) + ')' : '') + ': ' + e); });
        if (!c.def) return;
        if (c.def.kind === 'scenery') { errs.push(w + ': ' + N_('gói nhân vật không chứa phông cảnh')); return; }
        dup('part', c.def.slot + ':' + c.def.id, w); d.parts.push(c.def);
        partAdvice(c.def).forEach(function (a) { warn.push(w + '(' + c.def.id + '): ' + a); });
      });
      d.assets = [];
      each('assets', function (x, w) {
        if (!isObj(x)) { errs.push(w + ': ' + N_('nhân vật phải là object')); return; }
        if (!/^[a-z0-9][a-z0-9-]{1,39}$/.test(String(x.id || ''))) errs.push(w + '.id: ' + N_('chữ thường, số, gạch nối, 2–40 ký tự'));
        if (!isObj(x.look)) errs.push(w + '.look: ' + N_('bắt buộc'));
        dup('asset', x.id, w);
        d.assets.push(x);
      });
    } finally { PENDING_T = save; }
    return { errors: errs, warnings: warn, def: errs.length ? null : d };
  }

  // gỡ MỌI mục của một gói khỏi kho (nạp lại gói / hoàn tác đăng ký lỗi). Sửa mảng tại chỗ — các nơi khác giữ tham chiếu tới ASSET_ORDER / activityOrder
  function unregisterPack(id) {
    id = canonPack(id);
    if (!PACKS[id]) return false;
    ['eyeStyles', 'eyePoses', 'browStyles', 'browPoses', 'mouths', 'fx', 'motions', 'props', 'activities', 'derive'].forEach(function (m) {
      Object.keys(LIB[m]).forEach(function (k) { if (LIB[m][k] && LIB[m][k].pack === id) delete LIB[m][k]; });
    });
    for (var i = LIB.activityOrder.length - 1; i >= 0; i--) if (!LIB.activities[LIB.activityOrder[i]]) LIB.activityOrder.splice(i, 1);
    Object.keys(LIB.parts).forEach(function (k) { if (k.indexOf(id + '/') === 0) delete LIB.parts[k]; });
    Object.keys(LIB.tokenOwner).forEach(function (k) { if (LIB.tokenOwner[k] === id) { delete LIB.tokenOwner[k]; delete LIB.defaults[k]; } });
    Object.keys(ASSETS).forEach(function (k) { if (k.indexOf(id + '/') === 0) delete ASSETS[k]; });
    for (var j = ASSET_ORDER.length - 1; j >= 0; j--) if (!ASSETS[ASSET_ORDER[j]]) ASSET_ORDER.splice(j, 1);
    delete PACKS[id];
    return true;
  }
  // Kiểm rồi đăng ký trọn gói (thay bản cũ cùng id). Lỗi ở bất kỳ bước nào → gói được gỡ sạch. Nhân vật của gói phải qua cổng gate (nháp: không chặn identity).
  function registerDataPack(def) {
    var c = checkDataPack(def);
    if (c.errors.length) return { errors: c.errors, warnings: c.warnings, pack: null };
    var d = c.def, errs = [];
    unregisterPack(d.id);
    try {
      pack({ id: d.id, name: d.name, owner: d.owner, group: 'community', visibility: 'private', license: d.license, version: d.version, description: d.description }, function (D) {
        Object.keys(d.tokens).forEach(function (k) {
          var t = d.tokens[k];
          LIB.defaults[k] = t.value; LIB.tokenOwner[k] = d.id;
          if (t.rule) D.derive(k, { from: t.rule.from, to: t.rule.to, t: t.rule.t });
        });
        d.browStyles.forEach(function (s) { D.browStyle(s.id, { label: s.label, w: s.w, len: s.len }); });
        d.browPoses.forEach(function (s) { var o = { label: s.label, rot: s.rot, dy: s.dy, arc: s.arc }; if (s.rotR !== undefined) o.rotR = s.rotR; if (s.dyR !== undefined) o.dyR = s.dyR; D.browPose(s.id, o); });
        d.eyePoses.forEach(function (p) { D.eyePose(p.id, eyeFn(null, p)); });
        d.eyeStyles.forEach(function (s) {
          var o = { label: s.label, w: s.w, h: s.h, poses: {} };
          if (s.lid !== undefined) o.lid = s.lid;
          if (s.slant !== undefined) o.slant = s.slant;
          if (s.small !== undefined) o.small = s.small;
          Object.keys(s.poses).forEach(function (k) { var fn = eyeFn(s, s.poses[k]); fn.pack = d.id; o.poses[k] = fn; });
          if (!Object.keys(o.poses).length) delete o.poses;
          D.eyeStyle(s.id, o);
        });
        d.mouths.forEach(function (m) { D.mouth(m.id, function (C) { var ctx = { x: C.A.mouth[0], y: C.A.mouth[1] }; evalVars(m.vlist, ctx); return runParts(m.parts, ctx, C.P); }); });
        d.props.forEach(function (p) { var o = { label: p.label, draw: propFn(p) }; if (p.anchor) o.anchor = p.anchor; D.prop(p.id, o); });
        d.fx.forEach(function (x) {
          D.fx(x.id, { label: x.label, layer: x.layer, face: x.face, draw: (function (ly) { return function (C) { var o = {}; for (var l in ly) o[l] = fillTokens(ly[l], C.P); return o; }; })(x.layers) });
        });
        d.motions.forEach(function (m) { var o = { label: m.label, dur: m.dur, still: m.still, tracks: m.tracks }; ['hide', 'hold', 'props', 'breath', 'loop'].forEach(function (k) { if (m[k] !== undefined) o[k] = m[k]; }); D.motion(m.id, o); });
        d.activities.forEach(function (a) { var o = { label: a.label, group: a.group, hint: a.hint }; ['posture', 'move', 'action', 'state', 'face', 'fx', 'props'].forEach(function (k) { if (a[k] !== undefined) o[k] = a[k]; }); D.activity(a.id, o); });
        d.parts.forEach(function (p) { var r = registerDataPart(d.id, p); if (r.errors.length) errs.push('part ' + p.id + ': ' + r.errors.join('; ')); });
        d.assets.forEach(function (a) { registerAsset(d.id, JSON.parse(JSON.stringify(a))); });
      });
    } catch (e) { errs.push(e.message); }
    var counts = PACKS[d.id] ? Object.assign({}, PACKS[d.id].counts) : {};
    if (!errs.length) d.assets.forEach(function (a) {
      var as = ASSETS[d.id + '/' + a.id];
      blockingGates(gate(as, {}), as.status).forEach(function (g) { errs.push('assets(' + a.id + ') · ' + (g.label && typeof g.label === 'string' ? g.label : g.id) + ': ' + (g.detail || '')); });
    });
    if (errs.length) { unregisterPack(d.id); return { errors: errs, warnings: c.warnings, pack: null }; }
    return { errors: [], warnings: c.warnings, pack: PACKS[d.id], counts: counts };
  }

  /* ------------------------------------------------- 9. CẢNH (loại asset thứ ba) */
  // Cảnh = phối phông có sẵn (trời, cảnh xa, công trình, mặt đất, đạo cụ, tiền cảnh) + bảng màu + giờ + thời tiết.
  // Không vẽ lại: một phông dùng cho nhiều cảnh; đổi giờ chỉ đổi token màu. Chỗ đứng thuộc ENGINE (mọi cảnh cùng một bộ)
  // → mọi dàn diễn viên đặt được vào mọi cảnh; nhân vật dựng bằng đúng svgBody (đủ 45°, hoạt động, trang bị).
  var SCENE = {
    W: 640, H: 360,
    slots: {
      sky: { label: 'Trời / tường', canvas: true, required: true }, far: { label: 'Cảnh xa', canvas: true },
      mid: { label: 'Công trình', canvas: true }, ground: { label: 'Mặt đất', canvas: true, required: true },
      deco: { label: 'Đạo cụ cảnh', canvas: false }, front: { label: 'Tiền cảnh', canvas: true }
    },
    layerOrder: ['sky', 'far', 'mid', 'ground', 'front'],
    // token màu của phông (tách khỏi bảng màu nhân vật)
    defaults: {
      sky: '#bfe0ef', skyLow: '#f4ecd4', sun: '#fff1b8', cloud: '#ffffff',
      hillFar: '#c9dccd', hill: '#9cc3a2', ground: '#d8c79c', grass: '#93bf6b', path: '#cdb489',
      water: '#86bcd8', stone: '#a9a49b', wood: '#9b6b44', woodDark: '#6e4a2f', roof: '#b9a36c',
      wall: '#efe4ca', cloth: '#c8463a', leaf: '#5e9a58', bamboo: '#7fae5a', flower: '#f2a7b8', light: '#ffd27a'
    },
    // giờ: đổi token trời + phủ một lớp màu lên CẢ cảnh (nhân vật cũng nhuốm đêm / hoàng hôn → hợp khối)
    times: {
      day: { label: 'Ban ngày', P: {}, tint: null },
      dawn: { label: 'Bình minh', P: { sky: '#cdd7ee', skyLow: '#ffd7bf', sun: '#ffe0b0', cloud: '#fff3ea' }, tint: ['#ffb08a', 0.07] },
      dusk: { label: 'Hoàng hôn', P: { sky: '#f0a06a', skyLow: '#ffd89c', sun: '#ff8448', cloud: '#ffd2b0', hillFar: '#d9a98f' }, tint: ['#ff7a3d', 0.12] },
      night: { label: 'Ban đêm', P: { sky: '#1e2a52', skyLow: '#3b3f72', sun: '#f3f0d2', cloud: '#4a5585', hillFar: '#3e4a6e' }, tint: ['#14204a', 0.34] }
    },
    timeOrder: ['day', 'dawn', 'dusk', 'night'],
    // back: vẽ sau diễn viên (sương nằm trên sông / chân núi, không che mặt); overTint: sáng trên lớp màu giờ (đom đóm)
    weathers: {
      clear: { label: 'Quang', n: 0 }, rain: { label: 'Mưa', n: 56 }, snow: { label: 'Tuyết', n: 54 },
      petals: { label: 'Hoa rơi', n: 26 }, leaves: { label: 'Lá bay', n: 20 }, mist: { label: 'Sương', n: 5, back: true },
      fireflies: { label: 'Đom đóm', n: 22, overTint: true }
    },
    weatherOrder: ['clear', 'rain', 'snow', 'petals', 'leaves', 'mist', 'fireflies'],
    // chỗ đứng: chân nhân vật ở (x, y), tỉ lệ k; face: hướng quay khi có từ hai diễn viên (1: sang phải, -1: sang trái, 0: chính diện)
    spots: {
      left: { label: 'Trái', x: 100, y: 330, k: 0.8, face: 1 }, midLeft: { label: 'Giữa trái', x: 210, y: 330, k: 0.8, face: 1 },
      center: { label: 'Giữa', x: 320, y: 330, k: 0.8, face: 0 }, midRight: { label: 'Giữa phải', x: 430, y: 330, k: 0.8, face: -1 },
      right: { label: 'Phải', x: 540, y: 330, k: 0.8, face: -1 },
      backLeft: { label: 'Sau trái', x: 205, y: 280, k: 0.62, face: 1 }, back: { label: 'Sau giữa', x: 320, y: 280, k: 0.62, face: 0 },
      backRight: { label: 'Sau phải', x: 435, y: 280, k: 0.62, face: -1 }
    },
    spotOrder: ['left', 'midLeft', 'center', 'midRight', 'right', 'backLeft', 'back', 'backRight'],
    // ngân sách (L-42): cảnh là TẦNG ẢNH (SVG tĩnh); diễn viên ≤ 8 (= diễn đủ ≤ 8), đạo cụ ≤ 10, hạt thời tiết ≤ 60
    budget: { cast: 8, deco: 10, particles: 60 }
  };
  function getScene(ref, preferPack) { return lookup(SCENES, SCENE_ORDER, ref, preferPack); }
  function getAsset(ref, preferPack) { return lookup(ASSETS, ASSET_ORDER, ref, preferPack); }
  function sceneryOk(slot, ref) { var p = typeof ref === 'string' && getPart(slot, ref); return p && p.kind === 'scenery' ? p : null; }
  // Phông dạng dữ liệu (agent / người dùng tạo): MỘT chuỗi SVG cùng bộ lọc với linh kiện, token màu là token cảnh
  function checkScenery(def) {
    var errs = [], d = {};
    if (!/^[a-z0-9][a-z0-9-]{1,39}$/.test(String(def.id || ''))) errs.push('id: ' + N_('chữ thường, số, gạch nối, 2–40 ký tự'));
    d.id = String(def.id || ''); d.slot = def.slot; d.kind = 'scenery';
    d.label = plain(def.label || def.id, 40); d.description = plain(def.description, 300);
    if (def.layers && def.svg === undefined) errs.push(N_('phông cảnh dùng "svg" (một chuỗi SVG), không dùng "layers"'));
    else {
      d.svg = sanitizeSvg(def.svg, errs, 'svg', SCENE.defaults);
      if (!d.svg && !errs.length) errs.push('svg: ' + N_('chưa có gì để vẽ'));
    }
    if (d.slot === 'sky') d.outdoor = def.outdoor !== false;
    return { errors: errs, def: errs.length ? null : d };
  }
  // Kiểm + chuẩn hoá cảnh (dữ liệu thuần: phông phải có thật đúng bộ phận, màu hex theo token cảnh, số kẹp khoảng)
  function checkScene(def) {
    var errs = [], d = {};
    if (!def || typeof def !== 'object') return { errors: [N_('cảnh phải là object')], def: null };
    if (!/^[a-z0-9][a-z0-9-]{1,63}$/.test(String(def.id || ''))) errs.push('id: ' + N_('chữ thường, số, gạch nối, 2–64 ký tự'));
    d.id = String(def.id || ''); d.name = plain(def.name || def.id, 40); d.han = plain(def.han, 12); d.description = plain(def.description, 300);
    var L = def.layers && typeof def.layers === 'object' ? def.layers : {};
    d.layers = {};
    Object.keys(L).slice(0, 12).forEach(function (slot) {
      if (!own(SCENE.slots, slot) || !SCENE.slots[slot].canvas) { errs.push('layers.' + String(slot).slice(0, 40) + ': ' + N_('lớp lạ (chọn {ids}; đạo cụ đặt trong deco)', { ids: SCENE.layerOrder.join(', ') })); return; }
      var r = typeof L[slot] === 'string' ? { part: L[slot] } : L[slot] || {};
      var p = sceneryOk(slot, r.part);
      if (!p) { errs.push('layers.' + slot + ': ' + N_('phông "{ref}" không có trong bộ phận {slot} (xem get_catalog › scenery)', { ref: String(r.part).slice(0, 40), slot: slot })); return; }
      d.layers[slot] = { part: p.pack + '/' + p.id, dx: num(r.dx, 0, -320, 320), flip: r.flip === true };
    });
    SCENE.layerOrder.forEach(function (k) { if (SCENE.slots[k].required && !own(L, k)) errs.push('layers.' + k + ': ' + N_('bắt buộc ({label})', { label: SCENE.slots[k].label })); });
    d.deco = [];
    if (def.deco !== undefined && !Array.isArray(def.deco)) errs.push('deco: ' + N_('cần mảng'));
    (Array.isArray(def.deco) ? def.deco : []).forEach(function (x, i) {
      if (i >= SCENE.budget.deco) { if (i === SCENE.budget.deco) errs.push('deco: ' + N_('tối đa {n} đạo cụ (ngân sách hiệu năng)', { n: SCENE.budget.deco })); return; }
      var r = typeof x === 'string' ? { part: x } : x || {};
      var p = sceneryOk('deco', r.part);
      if (!p) { errs.push('deco[' + i + ']: ' + N_('đạo cụ "{ref}" không có (xem get_catalog › scenery.deco)', { ref: String(r.part).slice(0, 40) })); return; }
      d.deco.push({ part: p.pack + '/' + p.id, x: num(r.x, 320, 0, 640), y: num(r.y, 300, 150, 360), scale: num(r.scale, 1, 0.3, 2.5),
        flip: r.flip === true, z: ['back', 'mid', 'front'].indexOf(r.z) >= 0 ? r.z : 'back' });
    });
    d.palette = {};
    if (def.palette && typeof def.palette === 'object') Object.keys(def.palette).slice(0, 24).forEach(function (k) {
      if (!own(SCENE.defaults, k)) { errs.push('palette.' + String(k).slice(0, 40) + ': ' + N_('token màu cảnh lạ ({ids})', { ids: Object.keys(SCENE.defaults).join(', ') })); return; }
      if (!HEX.test(String(def.palette[k]))) { errs.push('palette.' + k + ': ' + N_('cần mã hex')); return; }
      d.palette[k] = String(def.palette[k]);
    });
    if (def.time !== undefined && (typeof def.time !== 'string' || !own(SCENE.times, def.time))) errs.push('time: ' + N_('chọn {ids}', { ids: SCENE.timeOrder.join(' | ') }));
    if (def.weather !== undefined && (typeof def.weather !== 'string' || !own(SCENE.weathers, def.weather))) errs.push('weather: ' + N_('chọn {ids}', { ids: SCENE.weatherOrder.join(' | ') }));
    d.time = own(SCENE.times, def.time) ? def.time : 'day'; d.weather = own(SCENE.weathers, def.weather) ? def.weather : 'clear';
    d.spots = SCENE.spotOrder.slice();
    if (def.spots !== undefined) {
      if (!Array.isArray(def.spots) || !def.spots.length) errs.push('spots: ' + N_('mảng chỗ đứng, ít nhất 1 ({ids})', { ids: SCENE.spotOrder.join(', ') }));
      else {
        var bad = def.spots.filter(function (x) { return SCENE.spotOrder.indexOf(x) < 0; });
        if (bad.length) errs.push('spots: ' + N_('chỗ đứng lạ {refs} (chọn {ids})', { refs: bad.slice(0, 5).map(function (x) { return String(x).slice(0, 40); }).join(', '), ids: SCENE.spotOrder.join(', ') }));
        d.spots = SCENE.spotOrder.filter(function (x) { return def.spots.indexOf(x) >= 0; });
      }
    }
    if (def.project != null && def.project !== '' && !projectId(def.project)) errs.push('project: ' + N_('slug dự án (chữ thường, số, gạch nối, ≤ 40 ký tự)'));
    d.project = projectId(def.project);
    d.kind = 'scene'; d.status = statusOf(def.status);
    return { errors: errs.slice(0, 20), def: errs.length ? null : d };
  }
  function registerScene(packId, def) {
    packId = canonPack(packId);
    var c = checkScene(def);
    if (c.errors.length) return c;
    var d = c.def; d.pack = packId; d.key = packId + '/' + d.id; d.version = def.version || 1;
    if (!own(SCENES, d.key)) SCENE_ORDER.push(d.key);
    SCENES[d.key] = d;
    if (PACKS[packId]) PACKS[packId].counts.scene = SCENE_ORDER.filter(function (k) { return k.indexOf(packId + '/') === 0; }).length;
    return { errors: [], def: d };
  }
  // Dàn diễn viên đặt vào cảnh: [{ character, spot, state?, activity?, posture?, move?, motion?, facing?, view?, t? }]
  var CAST_KEYS = ['activity', 'posture', 'move', 'motion', 'facing', 'view'];
  function checkCast(cast, scene) {
    var errs = [], used = {}, S = directorSchema([]).properties.steps.items.properties;
    var spots = (scene && scene.spots) || SCENE.spotOrder;
    if (!Array.isArray(cast)) return ['cast: ' + N_('cần mảng')];
    if (cast.length > SCENE.budget.cast) return ['cast: ' + N_('tối đa {n} diễn viên (ngân sách diễn đủ ≤ 8)', { n: SCENE.budget.cast })];
    cast.forEach(function (m, i) {
      var n = 'cast[' + i + ']: ';
      if (!m || typeof m !== 'object') { errs.push(n + N_('cần object')); return; }
      if (!m.asset && !getAsset(m.character)) errs.push(n + N_('không có nhân vật "{ref}" (xem list_characters)', { ref: String(m.character).slice(0, 40) }));
      if (typeof m.spot !== 'string' || spots.indexOf(m.spot) < 0) errs.push(n + N_('chỗ đứng "{ref}" không có trong cảnh ({ids})', { ref: String(m.spot).slice(0, 40), ids: spots.join(', ') }));
      else if (own(used, m.spot)) errs.push(n + N_('chỗ đứng "{ref}" đã có người', { ref: m.spot }));
      else used[m.spot] = 1;
      if (m.state !== undefined && LIB.stateOrder.indexOf(m.state) < 0) errs.push(n + N_('trạng thái "{ref}" không có trong kho', { ref: m.state }));
      CAST_KEYS.forEach(function (k) { if (m[k] !== undefined && S[k].enum.indexOf(m[k]) < 0) errs.push(n + N_('{key} "{ref}" không có trong kho', { key: k, ref: String(m[k]).slice(0, 40) })); });
      if (m.t !== undefined && !(typeof m.t === 'number' && isFinite(m.t) && m.t >= 0 && m.t <= 60)) errs.push(n + 't: ' + N_('số giây 0–60'));
    });
    return errs;
  }
  // số giả ngẫu nhiên có hạt giống: cùng cảnh → cùng mưa/tuyết (ảnh cache ổn định, test so được)
  function seeded(seed) {
    var a = 0;
    for (var i = 0; i < seed.length; i++) a = (a * 31 + seed.charCodeAt(i)) | 0;
    return function () { a = (a + 0x6D2B79F5) | 0; var t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  }
  function f1(n) { return n.toFixed(1); }
  function weatherSvg(w, seed, P) {
    var W = SCENE.weathers[w];
    if (!W || !W.n) return '';
    var r = seeded(seed + ':' + w), s = '', n = Math.min(W.n, SCENE.budget.particles);
    for (var i = 0; i < n; i++) {
      var x = r() * 660 - 10, y = r() * 370 - 10;
      if (w === 'rain') s += '<line x1="' + f1(x) + '" y1="' + f1(y) + '" x2="' + f1(x - 5) + '" y2="' + f1(y + 17) + '" stroke="#dbe8f5" stroke-width="1.4" stroke-linecap="round" opacity="' + (0.4 + r() * 0.4).toFixed(2) + '"/>';
      else if (w === 'snow') s += '<circle cx="' + f1(x) + '" cy="' + f1(y) + '" r="' + (1.2 + r() * 2.4).toFixed(2) + '" fill="#ffffff" opacity="' + (0.7 + r() * 0.3).toFixed(2) + '"/>';
      else if (w === 'petals') s += '<ellipse cx="' + f1(x) + '" cy="' + f1(y) + '" rx="3.6" ry="1.9" fill="' + P.flower + '" opacity="0.9" transform="rotate(' + Math.round(r() * 180) + ' ' + f1(x) + ' ' + f1(y) + ')"/>';
      else if (w === 'leaves') s += '<path d="M' + f1(x) + ',' + f1(y) + ' q4,-5 9,0 q-4,5 -9,0 Z" fill="' + (i % 2 ? '#d98a3a' : '#b9c45a') + '" transform="rotate(' + Math.round(r() * 360) + ' ' + f1(x + 4) + ' ' + f1(y) + ')"/>';
      else if (w === 'mist') s += '<ellipse cx="' + f1(x) + '" cy="' + f1(212 + i * 14) + '" rx="' + f1(170 + r() * 120) + '" ry="' + f1(15 + r() * 9) + '" fill="#ffffff" opacity="' + (0.24 + r() * 0.12).toFixed(2) + '"/>';
      else if (w === 'fireflies') { y = 120 + r() * 220; s += '<circle cx="' + f1(x) + '" cy="' + f1(y) + '" r="6" fill="' + P.light + '" opacity="0.22"/><circle cx="' + f1(x) + '" cy="' + f1(y) + '" r="1.7" fill="#fff6c8"/>'; }
    }
    return '<g>' + s + '</g>';
  }
  function starsSvg(seed) {
    var r = seeded(seed + ':stars'), s = '';
    for (var i = 0; i < 34; i++) s += '<circle cx="' + f1(r() * 640) + '" cy="' + f1(r() * 150) + '" r="' + (0.6 + r() * 1.1).toFixed(2) + '" fill="#fffbe6" opacity="' + (0.5 + r() * 0.5).toFixed(2) + '"/>';
    return '<g>' + s + '</g>';
  }
  // Dựng cảnh: phông theo lớp → đạo cụ sau → hàng sau → đạo cụ giữa → hàng trước → đạo cụ trước → tiền cảnh → thời tiết → màu giờ.
  // opts: cast (xem checkCast), time / weather (xem thử, không đổi cảnh), size (bề ngang px),
  //       part: 'back' | 'front' — tách lớp cho sân khấu có diễn viên sống (Studio đặt diễn viên giữa hai ảnh)
  function sceneSvg(scene, opts) {
    opts = opts || {};
    var time = own(SCENE.times, opts.time) ? opts.time : scene.time, weather = own(SCENE.weathers, opts.weather) ? opts.weather : scene.weather;
    var T = SCENE.times[time] || SCENE.times.day;
    var P = Object.assign({}, SCENE.defaults, scene.palette || {}, T.P);
    var C = { P: P, W: SCENE.W, H: SCENE.H, time: time, ink: INK };
    var seed = String(scene.key || scene.id);
    function part(slot, ref) { var p = sceneryOk(slot, ref); if (!p) throw new Error(N_('thiếu phông {slot}:{key}', { slot: slot, key: ref })); return p; }
    function layer(slot) {
      var L = scene.layers[slot];
      if (!L) return '';
      var art = part(slot, L.part).draw(C) || '';
      var tf = L.flip ? 'translate(' + (SCENE.W + L.dx) + ' 0) scale(-1 1)' : L.dx ? 'translate(' + L.dx + ' 0)' : '';
      return tf ? '<g transform="' + tf + '">' + art + '</g>' : art;
    }
    function deco(z) {
      return (scene.deco || []).filter(function (x) { return x.z === z; }).map(function (x) {
        return '<g transform="translate(' + x.x + ' ' + x.y + ') scale(' + (x.flip ? -x.scale : x.scale) + ' ' + x.scale + ')">' + part('deco', x.part).draw(C) + '</g>';
      }).join('');
    }
    var cast = (opts.cast || []).slice(0, SCENE.budget.cast);
    function actor(m) {
      var a = m.asset || getAsset(m.character);
      if (!a) throw new Error(N_('không có nhân vật {key}', { key: m.character }));
      var sp = own(SCENE.spots, m.spot) ? SCENE.spots[m.spot] : SCENE.spots.center, dir = {};
      CAST_KEYS.forEach(function (k) { if (m[k] !== undefined) dir[k] = m[k]; });
      // từ hai diễn viên: tự quay 45° về phía giữa sân khấu (đứng nói chuyện với nhau), trừ khi đã chọn góc
      if (!dir.view && cast.length > 1 && sp.face) dir.view = sp.face > 0 ? 'right45' : 'left45';
      if (!dir.facing && sp.face) dir.facing = sp.face > 0 ? 'right' : 'left';
      return '<g transform="translate(' + sp.x + ' ' + sp.y + ') scale(' + sp.k + ') translate(-100 -228)">' + svgBody(a, m.state || 'normal', { director: dir, t: m.t }) + '</g>';
    }
    function row(back) { return cast.filter(function (m) { return /^back/.test(m.spot) === back; }).map(actor).join(''); }
    var W = opts.size || 0;
    var s = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ' + SCENE.W + ' ' + SCENE.H + '"' + (W ? ' width="' + W + '" height="' + Math.round(W * SCENE.H / SCENE.W) + '"' : '') + '>';
    var sky = scene.layers.sky && part('sky', scene.layers.sky.part);
    var Wt = SCENE.weathers[weather] || {};
    var only = opts.part;
    if (only !== 'front') {
      s += layer('sky') + (time === 'night' && sky && sky.outdoor ? starsSvg(seed) : '') + layer('far') + (Wt.back ? weatherSvg(weather, seed, P) : '') + layer('mid') + layer('ground');
      s += deco('back') + row(true) + deco('mid') + row(false);
      if (only === 'back') return s + '</svg>';
    }
    s += deco('front') + layer('front');
    if (!Wt.overTint && !Wt.back) s += weatherSvg(weather, seed, P);
    if (T.tint) s += '<rect x="0" y="0" width="' + SCENE.W + '" height="' + SCENE.H + '" fill="' + T.tint[0] + '" opacity="' + T.tint[1] + '"/>';
    if (Wt.overTint) s += weatherSvg(weather, seed, P);
    return s + '</svg>';
  }
  // Từng lớp phông riêng (chuỗi SVG, chưa bọc <svg>) — máy quay có thị sai (choreo) cuộn mỗi lớp một tốc độ
  function sceneLayers(scene, opts) {
    opts = opts || {};
    var time = own(SCENE.times, opts.time) ? opts.time : scene.time, weather = own(SCENE.weathers, opts.weather) ? opts.weather : scene.weather;
    var T = SCENE.times[time] || SCENE.times.day, P = Object.assign({}, SCENE.defaults, scene.palette || {}, T.P);
    var C = { P: P, W: SCENE.W, H: SCENE.H, time: time, ink: INK }, out = {}, seed = String(scene.key || scene.id);
    Object.keys(SCENE.slots).forEach(function (slot) {
      var L = scene.layers[slot], p = L && sceneryOk(slot, L.part);
      if (!p) return;
      var art = p.draw(C) || '', tf = L.flip ? 'translate(' + (SCENE.W + (L.dx || 0)) + ' 0) scale(-1 1)' : L.dx ? 'translate(' + L.dx + ' 0)' : '';
      out[slot] = tf ? '<g transform="' + tf + '">' + art + '</g>' : art;
    });
    out.weather = weatherSvg(weather, seed, P);
    out.tint = T.tint ? '<rect x="0" y="0" width="' + SCENE.W + '" height="' + SCENE.H + '" fill="' + T.tint[0] + '" opacity="' + T.tint[1] + '"/>' : '';
    return out;
  }
  // Cổng kiểm cảnh — cùng tinh thần cổng nhân vật / item: dữ liệu, license phông, dựng được, đặt được diễn viên ở MỌI chỗ đứng, ngân sách
  function sceneGate(scene) {
    var res = [], c = checkScene(scene);
    res.push({ id: 'data', label: 'Dữ liệu cảnh hợp lệ (phông, đạo cụ, màu, giờ, thời tiết, chỗ đứng)', ok: !c.errors.length, detail: c.errors.slice(0, 4).join('; ') });
    if (c.errors.length) return res;
    var d = Object.assign({ key: scene.key || 'gate/' + c.def.id }, c.def);
    var refs = Object.keys(d.layers).map(function (k) { return getPart(k, d.layers[k].part); }).concat(d.deco.map(function (x) { return getPart('deco', x.part); }));
    var noLic = refs.filter(function (p) { return !p || !p.license; });
    res.push(gateRow({ id: 'license', ok: !noLic.length }, 'License phông rõ ràng', noLic.length ? ['{n} phông thiếu license', { n: noLic.length }] : ['{n} phông', { n: refs.length }]));
    var okR = true, er = '';
    try { sceneSvg(d); } catch (e) { okR = false; er = e.message; }
    res.push({ id: 'render', label: 'Dựng được cảnh', ok: okR, detail: er });
    var demo = ASSETS['gen.khung/ma-no-canh'] || ASSETS[ASSET_ORDER[0]], okC = true, ec = '';
    if (demo) {
      try { sceneSvg(d, { cast: d.spots.map(function (sp) { return { asset: demo, spot: sp }; }) }); } catch (e) { okC = false; ec = e.message; }
      res.push(gateRow({ id: 'cast', ok: okC }, 'Đặt được diễn viên ở mọi chỗ đứng', ec || ['{n} chỗ đứng', { n: d.spots.length }]));
    }
    var sky = d.layers.sky && getPart('sky', d.layers.sky.part);
    res.push(gateRow({ id: 'budget', ok: true, info: true }, 'Ngân sách hiệu năng (tầng ảnh)',
      ['{deco}/{decoMax} đạo cụ · {fx}/{fxMax} hạt · diễn viên ≤ {cast}', { deco: d.deco.length, decoMax: SCENE.budget.deco, fx: Math.min((SCENE.weathers[d.weather] || {}).n || 0, SCENE.budget.particles), fxMax: SCENE.budget.particles, cast: SCENE.budget.cast }]));
    if (d.weather !== 'clear' && sky && !sky.outdoor) res.push(gateRow({ id: 'indoor', ok: true, info: true }, 'Thời tiết trong nhà', ['phông trời "{label}" là trong nhà — kiểm lại thời tiết', { label: sky.label }]));
    return res;
  }

  G.GenChibi = {
    version: VERSION, INK: INK, RIG: RIG, LIB: LIB, PACKS: PACKS, ASSETS: ASSETS, ASSET_ORDER: ASSET_ORDER,
    FACE_PARAMS: FACE_PARAMS, SRC: SRC,
    pack: pack, registerAsset: registerAsset, migrate: migrate,
    getPart: getPart, partsOfSlot: partsOfSlot, partRef: partRef, traitsOf: traitsOf,
    resolveState: resolveState, palette: palette, paramValues: paramValues,
    compose: compose, poseAt: poseAt, finishPose: finishPose, jointMatrices: jointMatrices, chainTransforms: chainTransforms, keyPoints: keyPoints, poseDistance: poseDistance, neutralPose: neutralPose, svgString: svgString,
    shadowOf: shadowOf, handsBusy: handsBusy, Q45: Q45, Q90: Q90, faceRemap: faceRemap, VIEW_ORDER: VIEW_ORDER, VIEW_KIND: VIEW_KIND, VIEW_KINDS: VIEW_KINDS, FILM: { cameras: FILM_CAMERAS, bubbles: FILM_BUBBLES, sfx: FILM_SFX },
    checkDataPart: checkDataPart, registerDataPart: registerDataPart, partAdvice: partAdvice, blockingGates: blockingGates,
    checkDataPack: checkDataPack, registerDataPack: registerDataPack, unregisterPack: unregisterPack, compileExpr: compileExpr,
    moodOf: moodOf, MOODS: MOODS, mixHex: mixHex, normalizeOutline: normalizeOutline, outlineParts: outlineParts, silhouette: silhouette, jointScales: jointScales,
    ITEM: ITEM, ITEMS: ITEMS, ITEM_ORDER: ITEM_ORDER, items: function () { return ITEM_ORDER.map(function (k) { return ITEMS[k]; }); },
    SCENE: SCENE, SCENES: SCENES, SCENE_ORDER: SCENE_ORDER, scenes: function () { return SCENE_ORDER.map(function (k) { return SCENES[k]; }); },
    getScene: getScene, getAsset: getAsset, checkScene: checkScene, registerScene: registerScene, sceneSvg: sceneSvg, sceneLayers: sceneLayers, sceneGate: sceneGate,
    checkCast: checkCast, checkScenery: checkScenery, svgBody: svgBody,
    scenery: function (slot) { return Object.keys(LIB.parts).map(function (k) { return LIB.parts[k]; }).filter(function (p) { return p.kind === 'scenery' && (!slot || p.slot === slot); }); },
    canon: canon, canonPack: canonPack, isGenLabs: isGenLabs, statusOf: statusOf, projectId: projectId, getItem: getItem, checkItem: checkItem, registerItem: registerItem, itemSvg: itemSvg, itemGate: itemGate, partAlone: partAlone, sanitizeSvg: function (s0) { var e = []; var r = sanitizeSvg(s0, e, 'svg'); return { svg: r, errors: e }; },
    assets: function () { return ASSET_ORDER.map(function (k) { return ASSETS[k]; }); },
    director: { schema: directorSchema, validate: validateEvent, prompt: directorPrompt },
    gate: gate,
    JOINT_IDS: JOINT_IDS, LAYER_IDS: LAYER_IDS, CHANNELS: CHANNELS
  };
})(window);
