// © 2026 Gen Labs — All rights reserved.
// Sinh danh mục 457 ô Bộ Neo (KIT-v1) từ các bảng "Tên ô" trong
// Second-Brain/01-projects/gen-kit/spec/STANDARD-KIT-v1.md (§2.1, §3, §4 — nguồn duy nhất, không gõ tay ở nơi khác).
// Chạy: `node seed/kit-slots.js` → ghi seed/kit-slots.json ({version, generated_at, count, slots:[{code,group_code,title_vi,title_en,added_in}]}).
// `cli/import-kit.js` đọc file JSON này rồi gọi write('kit.sync'); không đọc .md lúc chạy (tách sinh seed khỏi nạp DB, như BUILD-BRIEF).
'use strict';
const fs = require('node:fs');
const path = require('node:path');

const pad2 = (n) => String(n).padStart(2, '0');

// ---- §3 Nhóm nhân vật (NB-01 nhi / NB-02 vy / NB-03 ryan) — 3 × 65 ----
const CHARACTERS = [
  { prefix: 'nhi', group: 'NB-01', name: 'Nhi' },
  { prefix: 'vy', group: 'NB-02', name: 'Vy' },
  { prefix: 'ryan', group: 'NB-03', name: 'Ryan' },
];

const ID_SLOTS = [
  ['id.01', 'Mẫu gốc toàn thân', 'Base design, full body'],
  ['id.02', 'Xoay · chính diện', 'Turnaround · front'],
  ['id.03', 'Xoay · 3/4', 'Turnaround · three-quarter'],
  ['id.04', 'Xoay · nghiêng', 'Turnaround · side'],
  ['id.05', 'Xoay · sau lưng', 'Turnaround · back'],
];

const EXPR_SLOTS = [
  ['expr.01', 'Cười mỉm, miệng khép', 'Soft smile, mouth closed'],
  ['expr.02', 'Khẩu hình a', 'Mouth shape a'],
  ['expr.03', 'Khẩu hình á (mở to)', 'Mouth shape ah (wide open)'],
  ['expr.04', 'Khẩu hình o', 'Mouth shape o'],
  ['expr.05', 'Khẩu hình e/i', 'Mouth shape e/i'],
  ['expr.06', 'Khẩu hình m/b/p', 'Mouth shape m/b/p'],
  ['expr.07', 'Cười tít mắt ^_^', 'Eyes-closed grin ^_^'],
  ['expr.08', 'Cười lăn, nước mắt vui', 'Rolling laugh, happy tears'],
  ['expr.09', 'Cười che miệng', 'Laughing behind hand'],
  ['expr.10', 'Mắt sao lấp lánh', 'Sparkling star eyes'],
  ['expr.11', 'Mắt tim, tay ôm má', 'Heart eyes, hands on cheeks'],
  ['expr.12', 'Đắc ý hất cằm', 'Smug chin lift'],
  ['expr.13', 'Nháy mắt + chữ V', 'Wink + V sign'],
  ['expr.14', 'Vỗ tay phấn khích', 'Excited clapping'],
  ['expr.15', 'Há miệng ngạc nhiên', 'Surprised open mouth'],
  ['expr.16', 'Há hốc sốc', 'Jaw-drop shock'],
  ['expr.17', 'Hoá đá 石化', 'Turned to stone 石化'],
  ['expr.18', 'Mắt lồi', 'Bulging eyes'],
  ['expr.19', 'Phụng phịu sắp khóc', 'Pouting, about to cry'],
  ['expr.20', 'Khóc thác 宽面条泪', 'Waterfall tears 宽面条泪'],
  ['expr.21', 'Dỗi bĩu môi', 'Sulking pout'],
  ['expr.22', 'Phồng má 鼓腮', 'Puffed cheeks 鼓腮'],
  ['expr.23', 'Gân giận, nắm đấm', 'Anger vein, clenched fist'],
  ['expr.24', 'Khoanh tay quay đi', 'Arms crossed, turned away'],
  ['expr.25', 'Đỏ mặt ngượng', 'Blushing, embarrassed'],
  ['expr.26', 'Cười gượng, giọt mồ hôi', 'Awkward smile, sweat drop'],
  ['expr.27', 'Ôm mặt facepalm', 'Facepalm'],
  ['expr.28', 'Gãi đầu cười trừ', 'Scratching head, sheepish'],
  ['expr.29', 'Suy nghĩ, tay chống cằm', 'Thinking, hand on chin'],
  ['expr.30', 'Lú, nghiêng đầu', 'Confused, head tilt'],
  ['expr.31', 'Mắt xoáy chóng mặt', 'Spiral dizzy eyes'],
  ['expr.32', 'Bóng đèn ý tưởng', 'Idea light bulb'],
  ['expr.33', 'Quyết tâm, mắt lửa', 'Determined, fiery eyes'],
  ['expr.34', 'Sợ run, mặt xanh', 'Trembling, pale face'],
  ['expr.35', 'Chán, mắt lờ đờ', 'Bored, half-lidded eyes'],
  ['expr.36', 'Ngáp buồn ngủ', 'Sleepy yawn'],
  ['expr.37', 'Nhún vai', 'Shrug'],
  ['expr.38', 'Chỉ sang bên', 'Pointing aside'],
  ['expr.39', 'Ngón cái + cười', 'Thumbs up + smile'],
  ['expr.40', 'Ký hiệu OK', 'OK sign'],
];

const POSE_SLOTS = [
  ['pose.01', 'Đứng chờ thả lỏng', 'Relaxed idle'],
  ['pose.02', 'Chỉ tay trái', 'Pointing left'],
  ['pose.03', 'Chỉ tay phải', 'Pointing right'],
  ['pose.04', 'Vẫy chào', 'Waving hello'],
  ['pose.05', 'Khoanh tay', 'Arms crossed'],
  ['pose.06', 'Chống nạnh', 'Hands on hips'],
  ['pose.07', 'Ngồi ghế', 'Sitting in chair'],
  ['pose.08', 'Ngồi gõ máy tính', 'Typing at computer'],
  ['pose.09', 'Cầm điện thoại', 'Holding phone'],
  ['pose.10', 'Cầm tài liệu', 'Holding document'],
  ['pose.11', 'Đi bộ · bước 1', 'Walking · step 1'],
  ['pose.12', 'Đi bộ · bước 2', 'Walking · step 2'],
  ['pose.13', 'Chạy', 'Running'],
  ['pose.14', 'Nhảy ăn mừng', 'Jumping for joy'],
  ['pose.15', 'Vấp ngã', 'Tripping'],
  ['pose.16', 'Núp sau đồ vật', 'Hiding behind object'],
  ['pose.17', 'Ôm đầu hoảng', 'Panic, hands on head'],
  ['pose.18', 'Quỳ cầu xin', 'Kneeling, begging'],
  ['pose.19', 'Chắp tay cảm ơn', 'Hands together, thanks'],
  ['pose.20', 'Ngủ gật', 'Dozing off'],
];

// ---- §4.1 NB-04 Bối cảnh — 56 ô ----
const SCENES = [
  ['office', 'Văn phòng', 'Office'],
  ['meeting', 'Phòng họp', 'Meeting room'],
  ['boss', 'Phòng sếp', "Boss's office"],
  ['home', 'Nhà', 'Home'],
  ['cafe', 'Quán cà phê', 'Café'],
  ['street', 'Đường phố', 'Street'],
];
const SCENE_FRAMES = [
  ['wide-day', 'Toàn cảnh · ngày', 'Wide · day'],
  ['angle-1', 'Góc máy 1', 'Angle 1'],
  ['angle-2', 'Góc máy 2', 'Angle 2'],
  ['close-1', 'Cận 1', 'Close-up 1'],
  ['close-2', 'Cận 2', 'Close-up 2'],
  ['fg-1', 'Tiền cảnh 1', 'Foreground 1'],
  ['fg-2', 'Tiền cảnh 2', 'Foreground 2'],
  ['wide-night', 'Toàn cảnh · đêm', 'Wide · night'],
  ['angle-1-night', 'Góc máy 1 · đêm', 'Angle 1 · night'],
];

// ---- §4.2 NB-05 Đạo cụ minh hoạ — 60 ô ----
const PROPS = {
  tech: ['Máy tính xách tay/Laptop', 'Điện thoại/Smartphone', 'Màn hình máy tính/Desktop monitor', 'Bàn phím/Keyboard',
    'Chuột máy tính/Computer mouse', 'Tai nghe/Headphones', 'Robot AI/AI robot', 'Chip xử lý/Processor chip',
    'Tủ máy chủ/Server rack', 'Đám mây dữ liệu/Data cloud', 'Máy tính bảng/Tablet', 'Đồng hồ thông minh/Smartwatch'],
  office: ['Chồng tài liệu/Document stack', 'Bìa hồ sơ/File folder', 'Bút/Pen', 'Sổ tay/Notebook', 'Giấy nhớ/Sticky notes',
    'Lịch để bàn/Desk calendar', 'Cốc cà phê/Coffee mug', 'Cặp công sở/Briefcase', 'Thẻ nhân viên/Staff ID badge', 'Bảng trắng/Whiteboard'],
  money: ['Đồng xu/Coin', 'Cọc tiền/Stack of cash', 'Ví/Wallet', 'Thẻ ngân hàng/Bank card', 'Heo đất/Piggy bank',
    'Túi tiền/Money bag', 'Biểu đồ đi lên/Rising chart', 'Hoá đơn/Receipt'],
  food: ['Trà sữa/Bubble tea', 'Bánh mì/Banh mi', 'Tô phở/Pho bowl', 'Cà phê sữa đá/Iced milk coffee', 'Hộp cơm/Lunch box',
    'Bánh ngọt/Cake slice', 'Đĩa trái cây/Fruit plate', 'Ly nước/Glass of water'],
  home: ['Ghế sofa/Sofa', 'Gối/Pillow', 'Đèn bàn/Desk lamp', 'Chậu cây/Potted plant', 'Đồng hồ báo thức/Alarm clock',
    'Giường/Bed', 'Tivi/TV', 'Chùm chìa khoá/Key ring'],
  idea: ['Bóng đèn ý tưởng/Idea light bulb', 'Bánh răng/Gear', 'Kính lúp/Magnifying glass', 'Cúp/Trophy', 'Khiên/Shield',
    'Ổ khoá/Padlock', 'Tên lửa/Rocket', 'Bia mục tiêu/Target'],
  sign: ['Biển cấm/No-entry sign', 'Biển cảnh báo/Warning sign', 'Mũi tên lên/Arrow up', 'Mũi tên xuống/Arrow down',
    'Mũi tên rẽ/Turn arrow', 'Cờ đích/Finish flag'],
};

// ---- §4.3 NB-06 Ký hiệu cảm xúc + chữ nổi — 30 ô ----
const FX_MANPU = [
  'Giọt mồ hôi/Sweat drop', 'Gân giận/Anger vein', 'Lấp lánh/Sparkles', 'Ba trái tim/Three hearts', 'Dấu hỏi/Question mark',
  'Dấu than/Exclamation mark', 'Dấu ?!/Interrobang ?!', 'Vạch má hồng/Blush lines', 'Vạch tối 黑线/Gloom lines 黑线',
  'Tia sốc/Shock lines', 'Xoáy chóng mặt/Dizzy spiral', 'Hai dòng nước mắt/Twin tear streams', 'Khói giận/Anger steam',
  'Zzz/Zzz', 'Nốt nhạc/Music notes', 'Bóng đèn/Light bulb', 'Dấu X đỏ/Red X', 'Dấu ✓ xanh/Green check',
  'Ngón cái/Thumbs up', 'Vạch tốc độ/Speed lines',
];
const FX_TEXT = [
  'Chữ nổi «Bùm!»/Pop text «Bùm!» (Boom!)', 'Chữ nổi «Hả?!»/Pop text «Hả?!» (Huh?!)', 'Chữ nổi «Ủa?»/Pop text «Ủa?» (Wait, what?)',
  'Chữ nổi «Wow»/Pop text «Wow»', 'Chữ nổi «Toang»/Pop text «Toang» (Busted)', 'Chữ nổi «Đỉnh!»/Pop text «Đỉnh!» (Awesome!)',
  'Chữ nổi «Xong!»/Pop text «Xong!» (Done!)', 'Chữ nổi «Ơ kìa»/Pop text «Ơ kìa» (Hey, look)', 'Chữ nổi «Cứu!»/Pop text «Cứu!» (Help!)',
  'Chữ nổi «Yeah!»/Pop text «Yeah!»',
];

// ---- §4.4 NB-07 Mảnh giao diện giả lập — 15 ô ----
const UI = {
  chat: ['Bong bóng chat gửi/Sent chat bubble', 'Bong bóng chat nhận/Received chat bubble', 'Khung chat AI/AI chat window'],
  phone: ['Màn hình khoá điện thoại/Phone lock screen', 'Màn hình ứng dụng/Phone app screen'],
  browser: ['Cửa sổ trình duyệt/Browser window', 'Trang kết quả tìm kiếm/Search results page'],
  notify: ['Thông báo đẩy/Push notification', 'Huy hiệu tin mới/New message badge'],
  dialog: ['Hộp báo lỗi/Error dialog', 'Hộp thành công/Success dialog'],
  chart: ['Biểu đồ cột/Bar chart', 'Biểu đồ đường/Line chart'],
  terminal: ['Cửa sổ dòng lệnh/Terminal window'],
  social: ['Thẻ bài đăng mạng xã hội/Social post card'],
};

// ---- §4.5 NB-08 Âm thanh — 78 ô ----
const AUDIO_SFX_UI = ['Bấm chuột/Mouse click', 'Chạm nút/Button tap', 'Thông báo/Notification', 'Tin nhắn đến/Message received',
  'Gõ phím ngắn/Short typing', 'Gõ phím dài/Long typing', 'Bật/Toggle on', 'Tắt/Toggle off', 'Báo lỗi/Error beep', 'Thành công/Success chime'];
const AUDIO_SFX_COMIC = ['Boing/Boing', 'Trượt chân/Slip', 'Trống chốt câu/Rimshot', 'Kèn xìu/Sad trombone', 'Chạy vụt/Cartoon dash',
  'Rơi vèo/Falling whistle', 'Cốc đầu/Bonk', 'Chớp mắt/Eye blink', 'Cười đóng hộp/Canned laugh', 'Dế kêu im lặng/Crickets'];
const AUDIO_SFX_STING = ['Ting/Ting', 'Sốc/Shock sting', 'Buồn/Sad sting', 'Hồi hộp/Suspense sting', 'Lộ diện/Reveal sting',
  'Chiến thắng/Victory sting', 'Thất bại/Fail sting', 'Ý tưởng/Idea sting'];
const AUDIO_SFX_AMBIENCE = ['Nền văn phòng/Office ambience', 'Nền quán cà phê/Café ambience', 'Nền đường phố/Street ambience',
  'Nền nhà ban đêm/Home at night ambience', 'Nền phòng họp/Meeting room ambience', 'Tiếng mưa/Rain ambience'];
const AUDIO_BGM = ['Nhạc nền · mở đầu tò mò/Music · curious opening', 'Nhạc nền · giải thích nhẹ/Music · light explainer',
  'Nhạc nền · giải thích nhịp vừa/Music · mid-tempo explainer', 'Nhạc nền · căng dần/Music · building tension',
  'Nhạc nền · cao trào/Music · climax', 'Nhạc nền · hài nghịch/Music · playful comedy', 'Nhạc nền · hài khoa trương/Music · over-the-top comedy',
  'Nhạc nền · tủi buồn/Music · sad', 'Nhạc nền · bí ẩn/Music · mystery', 'Nhạc nền · ấm áp/Music · warm',
  'Nhạc nền · kết vui/Music · happy ending', 'Nhạc nền · kết lắng/Music · calm ending'];
const AUDIO_BRAND = ['Âm logo kênh/Channel logo sting', 'Âm chuyển đoạn/Segment transition', 'Âm kết kênh/Channel outro'];

// ---- §4.6 NB-09 Mẫu chuyển động — 20 ô ----
const MOTION_TRANS_TPL = ['Chuyển cảnh', 'Transition'];
const MOTION_TITLE_TPL = ['Tiêu đề động', 'Animated title'];
const MOTION_LOWER_TPL = ['Thanh tên', 'Lower third'];
const MOTION_SUB_TPL = ['Kiểu phụ đề', 'Subtitle style'];

// ---- §4.7 NB-10 Font — 3 ô ----
const FONT = [
  ['font.display', 'Chữ tiêu đề', 'Display font'],
  ['font.body', 'Chữ phụ đề', 'Body & subtitle font'],
  ['font.comic', 'Chữ nổi', 'Comic lettering font'],
];

function slot(code, group_code, title_vi, title_en, subject_rev) {
  return { code, group_code, title_vi, title_en, added_in: 'v1', subject_rev: subject_rev || null };
}
function splitVE(s) { const i = s.indexOf('/'); return [s.slice(0, i), s.slice(i + 1)]; }
function numbered(prefix, group, list) {
  return list.map((s, i) => { const [vi, en] = splitVE(s); return slot(`${prefix}.${pad2(i + 1)}`, group, vi, en); });
}
function templated(prefix, group, [viTpl, enTpl], n) {
  const out = [];
  for (let i = 1; i <= n; i++) out.push(slot(`${prefix}.${pad2(i)}`, group, `${viTpl} ${pad2(i)}`, `${enTpl} ${pad2(i)}`));
  return out;
}

function buildSlots() {
  const out = [];

  // NB-01..03 — nhân vật; subject_rev = phiên bản mẫu gốc hiện hành (STANDARD-KIT-v1 §6, bản đầu 'r1' cho cả 3)
  for (const ch of CHARACTERS) {
    const rev = `${ch.prefix}@r1`;
    for (const [suf, vi, en] of ID_SLOTS) out.push(slot(`${ch.prefix}.${suf}`, ch.group, `${ch.name} · ${vi}`, `${ch.name} · ${en}`, rev));
    for (const [suf, vi, en] of EXPR_SLOTS) out.push(slot(`${ch.prefix}.${suf}`, ch.group, `${ch.name} · ${vi}`, `${ch.name} · ${en}`, rev));
    for (const [suf, vi, en] of POSE_SLOTS) out.push(slot(`${ch.prefix}.${suf}`, ch.group, `${ch.name} · ${vi}`, `${ch.name} · ${en}`, rev));
  }

  // NB-04 — bối cảnh (56)
  for (const [sKey, sVi, sEn] of SCENES) {
    for (const [fKey, fVi, fEn] of SCENE_FRAMES) out.push(slot(`scene.${sKey}.${fKey}`, 'NB-04', `${sVi} · ${fVi}`, `${sEn} · ${fEn}`));
  }
  out.push(slot('scene.abstract.title', 'NB-04', 'Nền trừu tượng · tiêu đề', 'Abstract background · title'));
  out.push(slot('scene.abstract.explain', 'NB-04', 'Nền trừu tượng · giải thích', 'Abstract background · explainer'));

  // NB-05 — đạo cụ (60)
  for (const [group, list] of Object.entries(PROPS)) out.push(...numbered(`prop.${group}`, 'NB-05', list));

  // NB-06 — ký hiệu + chữ nổi (30)
  out.push(...numbered('fx.manpu', 'NB-06', FX_MANPU));
  out.push(...numbered('fx.text', 'NB-06', FX_TEXT));

  // NB-07 — giao diện giả lập (15)
  for (const [group, list] of Object.entries(UI)) out.push(...numbered(`ui.${group}`, 'NB-07', list));

  // NB-08 — âm thanh (78)
  out.push(...templated('audio.sfx.whoosh', 'NB-08', ['Tiếng vút', 'Whoosh'], 10));
  out.push(...templated('audio.sfx.pop', 'NB-08', ['Tiếng bụp', 'Pop'], 8));
  out.push(...templated('audio.sfx.impact', 'NB-08', ['Va chạm', 'Impact'], 8));
  out.push(...numbered('audio.sfx.ui', 'NB-08', AUDIO_SFX_UI));
  out.push(...numbered('audio.sfx.comic', 'NB-08', AUDIO_SFX_COMIC));
  out.push(...numbered('audio.sfx.sting', 'NB-08', AUDIO_SFX_STING));
  out.push(...numbered('audio.sfx.ambience', 'NB-08', AUDIO_SFX_AMBIENCE));
  out.push(...numbered('audio.bgm', 'NB-08', AUDIO_BGM));
  out.push(...numbered('audio.brand', 'NB-08', AUDIO_BRAND));
  out.push(slot('audio.voice.nhi', 'NB-08', 'Giọng Nhi', "Nhi's voice"));
  out.push(slot('audio.voice.vy', 'NB-08', 'Giọng Vy', "Vy's voice"));
  out.push(slot('audio.voice.ryan', 'NB-08', 'Giọng Ryan', "Ryan's voice"));

  // NB-09 — mẫu chuyển động (20)
  out.push(...templated('motion.trans', 'NB-09', MOTION_TRANS_TPL, 8));
  out.push(...templated('motion.title', 'NB-09', MOTION_TITLE_TPL, 6));
  out.push(...templated('motion.lower', 'NB-09', MOTION_LOWER_TPL, 3));
  out.push(...templated('motion.sub', 'NB-09', MOTION_SUB_TPL, 3));

  // NB-10 — font (3)
  for (const [code, vi, en] of FONT) out.push(slot(code, 'NB-10', vi, en));

  return out;
}

function main() {
  const slots = buildSlots();
  const codes = new Set(slots.map((s) => s.code));
  if (codes.size !== slots.length) throw new Error(`Mã ô trùng: ${slots.length - codes.size} mã.`);
  if (slots.length !== 457) throw new Error(`Tổng ô = ${slots.length}, STANDARD-KIT-v1 §1 đòi 457.`);
  for (const s of slots) {
    if (!/^[a-z]+(\.[a-z0-9-]+){1,3}$/.test(s.code)) throw new Error(`Mã ô sai ngữ pháp §2.1: ${s.code}`);
    if (!s.title_vi || !s.title_en) throw new Error(`Ô ${s.code} thiếu title_vi/title_en.`);
  }
  const out = { version: 'KIT-v1', generated_at: new Date().toISOString(), count: slots.length, slots };
  const dest = path.join(__dirname, 'kit-slots.json');
  fs.writeFileSync(dest, JSON.stringify(out, null, 2) + '\n');
  console.log(`seed/kit-slots.json: ${slots.length} ô (KIT-v1).`);
}

module.exports = { buildSlots };
if (require.main === module) main();
