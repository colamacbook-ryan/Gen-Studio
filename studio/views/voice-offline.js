// © 2026 Gen Labs — All rights reserved.
// Giọng offline (gói L): bật nhà cung cấp `offline` (giọng + giám khảo, không khoá) và hiện trạng thái sidecar `voice` từ kết quả quét.
// Dùng chung cho bước "Giọng đọc" của thiết lập và màn Nhà cung cấp. Không render object: mọi giá trị qua toText().
import { h } from '../components/dom.js';
import { t, tOr } from '../i18n.js';
import { post, get } from '../components/api.js';
import { badge } from '../components/states.js';
import { toText } from '../components/util.js';
import { connectCard } from './lists.js';

export const PULL_CMD = 'genstudio voice pull';

// Tạo (nếu chưa có) hai nhà cung cấp offline: tts + judge. Không tạo trùng khi bấm lại / tải lại trang. → [display_id tts, display_id judge]
export async function ensureOffline() {
  const rows = ((await get('/api/grid/providers')).rows || []).filter((r) => r.vendor === 'offline');
  const out = [];
  for (const kind of ['tts', 'judge']) {
    const have = rows.find((r) => r.kind === kind);
    if (have) { out.push(have.display_id); continue; }
    const saved = await post('/api/providers', { vendor: 'offline', kind });
    out.push(saved && (saved.display_id || (saved.provider && saved.provider.display_id)));
  }
  return out;
}

const TONE = { ready: 'ok', loading: 'info', verifying: 'info', missing: 'warn', error: 'danger' };

// Khối trạng thái từ kết quả quét ({service:{state, detail, voices:[{id,name,gender}]}}) — state ≠ ready ⇒ kèm lệnh cần chạy trên máy chủ.
export function offlineStatus(scan) {
  const sv = (scan && (scan.service || (scan.scan && scan.scan.service))) || null;
  if (!sv) return null;
  const state = toText(sv.state || 'unknown');
  const box = h('div', { class: 'voice-offline' },
    h('div', { class: 'row' }, badge(tOr('voff.state.' + state, state), TONE[state] || 'idle'), sv.precision ? h('span', { class: 'muted mono' }, toText(sv.precision)) : null));
  if (state !== 'ready') {
    box.append(h('p', { class: 'muted small' }, t(state === 'error' ? 'voff.fix_error' : 'voff.need_pull')), connectCard(PULL_CMD));
    if (sv.detail) box.append(h('details', { class: 'detail' }, h('summary', null, t('err.detail')), h('pre', { class: 'mono' }, toText(sv.detail))));
  }
  const voices = Array.isArray(sv.voices) ? sv.voices : [];
  if (voices.length) {
    box.append(h('div', { class: 'muted small' }, t('voff.voices', { n: voices.length })),
      h('div', { class: 'voice-list' }, voices.map((v) => h('span', { class: 'chip', title: toText(v.id) },
        toText(v.name || v.id), v.gender ? h('span', { class: 'muted' }, ' · ' + tOr('voff.gender.' + toText(v.gender), toText(v.gender))) : null))));
  }
  return box;
}
