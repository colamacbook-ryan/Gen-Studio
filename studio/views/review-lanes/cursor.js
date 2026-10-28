// © 2026 Gen Labs — All rights reserved.
// Làn "Con trỏ" của bàn dựng Phòng chiếu (SPEC-0.2.0 §6.12, CNS-097) — FILE RIÊNG để cắt F4 sạch: xoá file này ⇒ Phòng chiếu bỏ qua êm.
// Chỉ hiện khi Render là bài hướng dẫn (plan có beat screen/cursor/focus/callout/keystroke). Vẽ từ plan rút gọn của API (beats: id, block, t_in, t_out):
//   chấm bấm/hành động con trỏ (beat cursor), vạch phóng (focus), chú thích (callout), phím tắt (keystroke), mốc đổi màn (screen). Bấm một mục ⇒ tua tới đó + ghim ghi chú vào BT-.
// Nhãn đọc i18n `lane.cursor` (gói UI-TUT thêm vào studio/i18n/lessons.js); chưa có khoá thì dùng chữ dự phòng theo ngôn ngữ trang.
const KINDS = { cursor: 'cur', focus: 'foc', callout: 'cal', keystroke: 'key', screen: 'scr' };

export function lane(env) {
  const beats = (env.beats || []).filter((b) => KINDS[b.block] && !/^AUTO-/.test(String(b.id)));
  if (!beats.length) return null;
  const k = env.t('lane.cursor');
  const label = k !== 'lane.cursor' ? k : (document.documentElement.lang === 'en' ? 'Cursor' : 'Con trỏ');
  return {
    key: 'cursor', label,
    draw(e, track) {
      const total = e.total();
      beats.forEach((b) => {
        const kind = KINDS[b.block], point = kind === 'cur' || kind === 'scr' || kind === 'key';
        // chấm (hành động tức thời) dài ~ 1 % thời lượng để bấm được; vạch phóng/chú thích kéo tới hết beat (tối đa 6 s)
        const end = point ? b.t_in + Math.max(120, total * 0.008) : Math.min(b.t_out || b.t_in + 3000, b.t_in + 6000);
        const blk = e.addBlock(track, 'U:' + b.id, b.t_in, end, '', String(b.id) + ' · ' + b.block, 'beat x-' + kind, kind === 'foc' || kind === 'cal' ? 1 : 0);
        blk.style.background = kind === 'cur' ? 'var(--ember, #FF6F59)' : kind === 'foc' ? 'var(--lane-beat)' : kind === 'cal' ? 'var(--lane-voice)' : kind === 'key' ? 'var(--lane-sfx)' : 'var(--muted, #8E99B2)';
        if (point) { blk.style.borderRadius = '50%'; blk.style.width = '10px'; blk.style.height = '10px'; blk.style.padding = '0'; }
      });
    },
  };
}
