// © 2026 Gen Labs — All rights reserved.
// Gói F7 (SPEC-0.2.0-F7 §3.2–3.5, §6.3, §9) — tỉ lệ khung của bài. Đăng ký qua ctx.ext (không sửa lõi):
//   • lessonExt 'aspect'  — cột lesson_versions.aspect. `resolve` (móc mới, CNS-330) chạy TRƯỚC mọi `validate` và GHI GIÁ TRỊ ĐÃ PHÂN GIẢI (lesson → lệnh → version trước → mặc định kênh → mặc định hệ thống);
//                           lỗi aspect_mismatch / aspect_unsupported / aspect_kind_unsupported (text_human tiếng Việt); `validate` báo block_aspect (khối chưa hỗ trợ tỉ lệ, CNS-342).
//                           Cảnh báo KHÔNG chặn (duration_over_platform, duration_off_target, subtitle_pages, aspect_kind_fallback…) nằm ở lv.out.aspect.warnings ⇒ validate_lesson trả về.
//   • bọc work_order.create — `aspect` của lệnh phải là tỉ lệ đang bật (sai ⇒ 400 aspect_unsupported). Chỉ ownerOrSystem tạo được lệnh (scheduler theo schedule.mix) ⇒ agent không đặt được.
//   • bọc channel.create|update — kiểm `default_aspect` và `schedule.mix` (Σn = per_run, tỉ lệ đang bật). Quyền: POLICY_FIELDS (chỉ owner), kiểm TRƯỚC khi kiểm giá trị để agent vẫn nhận forbidden.
// Module cũng export catalogFor() cho GET /api/aspects và get_capabilities.aspects (cùng một object, §3.5–3.6).
'use strict';
const A = require('../../render/aspects.js');
const registry = require('../../render/blocks/registry.js');
const { LEAD_MS } = require('../../render/engine/timeline.js');

// Công thức ước thời lượng = estimateMs của timeline.js (340 ms/âm tiết + 400) + LEAD/GAP/TAIL — chỉ để cảnh báo khi nộp; dựng thật dùng clip giọng đo được.
const GAP_MS = 500, TAIL_MS = 3600;
const estimateMs = (say) => Math.round(String(say || '').trim().split(/\s+/).filter(Boolean).length * 340 + 400);
function estimateS(lines) {
  const ls = (Array.isArray(lines) ? lines : []).filter((l) => l && typeof l === 'object');
  if (!ls.length) return 0;
  let t = LEAD_MS;
  ls.forEach((l, i) => { t += estimateMs(l.say) + (i ? GAP_MS : 0); });
  return Math.round(t + TAIL_MS) / 1000;
}
const fmtDur = (s) => { const m = Math.floor(s / 60), r = Math.round(s - m * 60); return m ? `${m} phút${r ? ' ' + r + ' giây' : ''}` : `${r} giây`; };
const PRESET_NAME = { yt_long: 'YouTube (video dài)', yt_shorts: 'YouTube Shorts', fb_reels: 'Facebook Reels', tiktok: 'TikTok' };
const presetName = (id) => PRESET_NAME[id] || id;

// khối hỗ trợ tỉ lệ nào: trường `aspects` của render/blocks/index.json (gói A2); thiếu ⇒ ['16:9'] (khối mới phải chủ động khai mới dùng được ở dọc, §4.5)
const blockAspects = (e) => (Array.isArray(e && e.aspects) && e.aspects.length ? e.aspects : ['16:9']);
function blocksOf(aspect) { return registry.all().filter((e) => e.enabled !== false && blockAspects(e).includes(aspect)).map((e) => e.name); }
function templatesOf(aspect) {
  const T = require('../../render/thumb.js');
  // A3: templatesOf(aspect) theo tỉ lệ; trước khi gộp A3 chỉ có templates() (toàn 16:9)
  if (typeof T.templatesOf === 'function') return T.templatesOf(aspect).map((t) => t.id);
  return T.templates().filter((t) => (t.aspect || '16:9') === aspect).map((t) => t.id);
}
// GET /api/aspects = get_capabilities.aspects (§3.6): MỘT object
const catalogFor = () => A.catalog({ blocksOf, templatesOf });
// tỉ lệ mặc định của kênh (default_aspect, bí danh cũ `aspect`); đã tắt/không có ⇒ mặc định hệ thống
function channelDefault(channelData) {
  const d = channelData || {};
  const v = d.default_aspect || d.aspect;
  const g = typeof v === 'string' ? A.get(v) : null;
  return g && g.enabled ? v : A.data().default;
}
const enabledIds = () => A.list({ enabledOnly: true }).map((a) => a.id);

const SCHEMA = {
  aspect: {
    type: ['string', 'null'],
    description: 'Tỉ lệ khung của bài ("16:9" video dài, "9:16" clip dọc cho Shorts/Reels/TikTok). KHÔNG bắt buộc: bỏ trống thì theo lệnh sản xuất (get_task → aspect), rồi theo mặc định kênh. Lệnh đã chỉ định tỉ lệ thì bài không được gửi tỉ lệ khác (aspect_mismatch). Xem get_capabilities → aspects (cỡ, nền tảng, vùng an toàn, khối và mẫu ảnh bìa hỗ trợ).',
  },
};

// ---- cảnh báo không chặn: thời lượng ước so với nền tảng, phụ đề dài ----
function softWarnings(aspect, lines) {
  const out = [], g = A.get(aspect);
  if (!g) return out;
  const s = estimateS(lines);
  if (s > 0) {
    const fit = A.fit(aspect, s);
    for (const p of A.presetsOf(aspect)) {
      if (fit[p.id] && !fit[p.id].ok) {
        out.push({ code: 'duration_over_platform', level: 'warn', detail: { preset: p.id, estimate_s: s, max_s: p.max_s },
          text_human: `Ước ${fmtDur(s)} — vượt ${presetName(p.id)} (${fmtDur(p.max_s)})${p.id === 'yt_shorts' ? ': YouTube sẽ xếp thành video dài' : ''}. Không chặn: chủ xưởng có thể chỉ đăng nền tảng khác.` });
      }
    }
    if (g.target_s && (s < g.target_s[0] || s > g.target_s[1])) {
      out.push({ code: 'duration_off_target', level: 'warn', detail: { estimate_s: s, target_s: g.target_s },
        text_human: `Ước ${fmtDur(s)} — ngoài khoảng nên dùng cho khung ${aspect} (${g.target_s[0]}–${g.target_s[1]} giây).` });
    }
  }
  // phụ đề lật trang (§4.2): chỉ báo thông tin khi một câu quá 4 trang (nhịp đọc nhanh)
  const sub = g.layout && g.layout.subtitle;
  if (sub && sub.paging && sub.chars_per_line && sub.lines_max) {
    const per = sub.chars_per_line * sub.lines_max;
    (Array.isArray(lines) ? lines : []).forEach((l, i) => {
      const pages = l && typeof l.say === 'string' ? Math.ceil(l.say.length / per) : 0;
      if (pages > 4) out.push({ code: 'subtitle_pages', level: 'info', detail: { line: l.id || i, pages },
        text_human: `Câu ${l.id || '#' + (i + 1)} dài khoảng ${pages} trang phụ đề ở khung ${aspect}; nhịp đọc sẽ nhanh. Cân nhắc tách câu.` });
    });
  }
  return out;
}

// kiểm giá trị tỉ lệ ở dữ liệu kênh (default_aspect, schedule.mix) — dữ liệu người gọi gửi, trước khi lưu
function checkChannelAspect(err, data) {
  if (!data || typeof data !== 'object') return;
  if ('default_aspect' in data && data.default_aspect !== null && data.default_aspect !== '') {
    const g = typeof data.default_aspect === 'string' ? A.get(data.default_aspect) : null;
    if (!g || !g.enabled) throw err('aspect_unsupported', `Tỉ lệ "${data.default_aspect}" không được hỗ trợ (đang bật: ${enabledIds().join(', ')}).`, { aspect: data.default_aspect, enabled: enabledIds() });
  }
  const sc = data.schedule;
  if (sc && typeof sc === 'object' && 'mix' in sc && sc.mix !== null && sc.mix !== undefined) {
    const bad = (t) => err('invalid', 'Lịch trộn tỉ lệ (schedule.mix) không hợp lệ: ' + t, { field: 'schedule.mix' });
    if (!Array.isArray(sc.mix) || !sc.mix.length) throw bad('phải là mảng [{aspect, n}] không rỗng.');
    const seen = new Set(); let sum = 0;
    for (const m of sc.mix) {
      if (!m || typeof m !== 'object' || typeof m.aspect !== 'string') throw bad('mỗi mục cần {aspect, n}.');
      const g = A.get(m.aspect);
      if (!g || !g.enabled) throw err('aspect_unsupported', `Tỉ lệ "${m.aspect}" trong schedule.mix không được hỗ trợ (đang bật: ${enabledIds().join(', ')}).`, { aspect: m.aspect, enabled: enabledIds() });
      if (!Number.isInteger(m.n) || m.n < 1) throw bad(`n của ${m.aspect} phải là số nguyên ≥ 1.`);
      if (seen.has(m.aspect)) throw bad(`tỉ lệ ${m.aspect} bị lặp.`);
      seen.add(m.aspect); sum += m.n;
    }
    const per = sc.per_run === undefined ? 1 : Number(sc.per_run);
    if (sum !== per) throw bad(`tổng n (${sum}) phải bằng per_run (${per}).`);
  }
}

function register(op, ctx) {
  const { ext, err, around, checkPolicy } = ctx;

  ext.lessonExt.register({
    name: 'aspect', columns: ['aspect'], schema: { properties: SCHEMA },
    // CNS-330: phân giải TRƯỚC validate; giá trị trả là thứ được lưu vào lesson_versions.aspect
    resolve(lv) {
      const given = lv.payload && lv.payload.aspect;   // chỉ cái agent GỬI (lv.values.aspect đã gộp kế thừa nên không phân biệt được)
      const r = A.resolve({ lesson: { aspect: given }, workOrder: lv.workOrder || null, channelData: lv.channelData, kind: lv.kind,
        previous: lv.prev ? { aspect: lv.prev.aspect } : null });
      const warnings = (r.warnings || []).map((w) => Object.assign({ level: 'warn' }, w)).concat(softWarnings(r.aspect, lv.lines));
      lv.out.aspect = { value: r.aspect, source: r.source, inherited: !!r.inherited, presets: A.presetsOf(r.aspect),
        fit_estimate: { duration_s: estimateS(lv.lines), fit: A.fit(r.aspect, estimateS(lv.lines)), target_s: (A.get(r.aspect) || {}).target_s || null }, warnings };
      return r.aspect;
    },
    // khối hình phải hỗ trợ tỉ lệ (§4.5, CNS-342) — không sửa đoạn kiểm khối của write.js
    validate(lv) {
      const asp = lv.out.aspect && lv.out.aspect.value;
      if (!asp) return [];   // resolve đã báo lỗi
      const def = new Map(registry.all().map((e) => [e.name, e]));
      const errs = [];
      (Array.isArray(lv.beats) ? lv.beats : []).forEach((b, i) => {
        const e = b && def.get(b.block);
        if (!e || e.enabled === false) return;   // khối lạ/tắt: write.js đã báo
        if (!blockAspects(e).includes(asp)) {
          errs.push({ path: `beats[${i}].block`, code: 'block_aspect',
            text: `block_aspect: Khối "${b.block}" chưa dựng được ở khung ${asp} (khối dùng được: ${blocksOf(asp).join(', ') || 'không có'}). Đổi khối hoặc để tỉ lệ 16:9.` });
        }
      });
      return errs;
    },
  });

  // ---- lệnh sản xuất: aspect do owner/scheduler đặt (§3.2, §9) ----
  around('work_order.create', (prev) => (c) => {
    const v = c.p.aspect;
    if (v === undefined || v === null || v === '') { delete c.p.aspect; return prev(c); }
    const g = typeof v === 'string' ? A.get(v) : null;
    if (!g || !g.enabled) throw err('aspect_unsupported', `Tỉ lệ "${v}" không được hỗ trợ (đang bật: ${enabledIds().join(', ')}).`, { aspect: v, enabled: enabledIds() });
    return prev(c);
  });

  // ---- kênh: default_aspect + schedule.mix (chỉ owner — POLICY_FIELDS; kiểm quyền TRƯỚC giá trị) ----
  const guard = (prev) => (c) => {
    const d = c.p && c.p.data;
    if (d && typeof d === 'object') { checkPolicy(c.a, d, c.p); checkChannelAspect(err, d); }
    return prev(c);
  };
  around('channel.create', guard);
  around('channel.update', guard);
}

module.exports = { register, OWNER: 'F7', SCHEMA, catalogFor, channelDefault, blocksOf, templatesOf, estimateS, softWarnings, checkChannelAspect };
