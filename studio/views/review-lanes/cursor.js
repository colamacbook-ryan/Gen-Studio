// © 2026 Gen Labs — All rights reserved.
// Làn "Con trỏ" của bàn dựng Phòng chiếu (SPEC-0.2.0 §6.12, CNS-097; gói UI-R2 theo F7 CNS-345) — FILE RIÊNG để cắt F4 sạch: xoá file này ⇒ Phòng chiếu bỏ qua êm.
// Chỉ hiện khi Render là bài hướng dẫn (plan có beat screen/cursor/focus/callout/keystroke). Vẽ từ plan rút gọn của API (beats: id, block, t_in, t_out):
//   chấm bấm/hành động con trỏ (cursor), vạch phóng (focus), chú thích (callout), phím tắt (keystroke), mốc đổi màn (screen). Bấm một mục ⇒ tua tới đó.
// G-CURSOR: bước có vi phạm (measure.violations[].beat) được viền đỏ + câu lý do trong title. Màu chỉ dùng token của styles.css (không hex).
// Nhãn: i18n `lane.cursor` (studio/i18n/lessons.js), loại bước `rv.cur.*` (studio/i18n/review.js).
const KINDS = { cursor: 'cur', focus: 'foc', callout: 'cal', keystroke: 'key', screen: 'scr' };
const POINT = new Set(['cur', 'scr', 'key']);

// vi phạm G-CURSOR theo beat → [câu…] (để đánh dấu đúng bước)
export function cursorViolations(gates) {
  const g = (gates || []).find((x) => x && x.gate === 'G-CURSOR');
  const out = new Map();
  const vs = g && g.measure && Array.isArray(g.measure.violations) ? g.measure.violations : [];
  for (const v of vs) {
    if (!v || v.beat == null) continue;
    const k = String(v.beat);
    if (!out.has(k)) out.set(k, []);
    out.get(k).push((v.check ? v.check + ': ' : '') + String(v.text || ''));
  }
  return out;
}

export function lane(env) {
  const beats = (env.beats || []).filter((b) => KINDS[b.block] && !/^AUTO-/.test(String(b.id)));
  if (!beats.length) return null;
  return {
    key: 'cursor', label: env.t('lane.cursor'),
    draw(e, track) {
      const total = e.total();
      const bad = cursorViolations(e.gates);
      beats.forEach((b, i) => {
        const kind = KINDS[b.block], point = POINT.has(kind);
        // chấm (hành động tức thời) dài ~ 1 % thời lượng để bấm được; vạch phóng/chú thích kéo tới hết beat (tối đa 6 s)
        const end = point ? b.t_in + Math.max(120, total * 0.008) : Math.min(b.t_out || b.t_in + 3000, b.t_in + 6000);
        const why = bad.get(String(b.id)) || bad.get(String(i)) || null;
        const title = String(b.id) + ' · ' + e.t('rv.cur.' + kind) + (why ? '\n' + why.map((w) => e.t('rv.cur.bad', { text: w })).join('\n') : '');
        e.addBlock(track, 'U:' + b.id, b.t_in, end, '', title, 'beat cur-blk x-' + kind + (point ? ' pt' : '') + (why ? ' bad' : ''), kind === 'foc' || kind === 'cal' ? 1 : 0);
      });
    },
  };
}
