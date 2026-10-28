// © 2026 Gen Labs — All rights reserved.
// Agent giả (GS_FAKE_AGENT=1): nộp bài mẫu 3 câu (LN-0001/0003/0005 của BUILD-BRIEF §5) qua chính MCP rồi complete_task. Chỉ dùng cho e2e.
'use strict';

const fs = require('node:fs');
const path = require('node:path');

// Mẫu bài đọc từ agent/samples/<id>.json (SPEC-0.2.0 §13.2): lesson.json là mẫu gốc 3 câu; gói T thêm lesson-thumb.json (bài có ảnh bìa), gói U thêm tutorial.json.
// GS_FAKE_SAMPLE=<id> chọn mẫu (mặc định "lesson"). Thư mục nằm trong agent/ nên image agent mang theo.
const SAMPLES_DIR = path.join(__dirname, 'samples');
function listSamples() { return fs.readdirSync(SAMPLES_DIR).filter(f => f.endsWith('.json')).map(f => f.slice(0, -5)).sort(); }
function loadSample(id) {
  const name = String(id || 'lesson');
  if (!/^[a-z0-9][a-z0-9_-]*$/i.test(name)) throw new Error('GS_FAKE_SAMPLE không hợp lệ: ' + name);
  const f = path.join(SAMPLES_DIR, name + '.json');
  if (!fs.existsSync(f)) throw new Error('Không có mẫu agent giả "' + name + '" (có: ' + listSamples().join(', ') + ').');
  return JSON.parse(fs.readFileSync(f, 'utf8'));
}
const BASE = loadSample('lesson');
const LINES = BASE.lines;            // giữ export cũ
const SAMPLE_CAST = BASE.cast;       // kênh mới (thiết lập lần đầu) chưa có nhân vật: agent giả tự tạo nhân vật mẫu qua MCP, như agent thật phải làm

// "$cast:<Tên>" ở bất kỳ chỗ nào trong `extra` → mã nhân vật cùng tên của kênh
function resolveCast(v, find) {
  if (typeof v === 'string') { const m = /^\$cast:(.+)$/.exec(v); return m ? find(m[1]) : v; }
  if (Array.isArray(v)) return v.map(x => resolveCast(x, find));
  if (v && typeof v === 'object') return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, resolveCast(x, find)]));
  return v;
}

function sample(cast, task, spec = BASE) {
  const find = (name, i) => (cast.find(m => m.name === name) || cast[i] || cast[0]).display_id;
  return Object.assign({}, resolveCast(spec.extra || {}, n => find(n, 0)), {
    channel: task.channel.display_id,
    curriculum_node: task.curriculum_node ? task.curriculum_node.display_id : undefined,
    work_order: task.work_order,
    title: spec.title,
    lines: spec.lines.map((l, i) => ({ who: find(l.name, i % 2 ? 0 : 1), say: l.say, lang: 'vi', terms: l.terms, mood: l.mood, subtitle: l.subtitle })),
    beats: JSON.parse(JSON.stringify(spec.beats)),
  });
}

// client: {call(tool, args) → {isError, text, data}}
async function handleTask(client, task) {
  if (!['new_lesson', 'manual'].includes(task.kind)) {
    await client.call('report_problem', { work_order: task.work_order, code: 'fake_unsupported', text: 'Agent giả chỉ làm việc new_lesson hoặc manual.' });
    return 'unsupported';
  }
  const must = async (name, args) => { const r = await client.call(name, args); if (r.isError) throw new Error(name + ' lỗi: ' + r.text); return r; };
  let spec = loadSample(process.env.GS_FAKE_SAMPLE);
  // 0.2.0 (gói T): kênh bật policy.thumbnail_required (kênh TẠO MỚI mặc định bật) mà mẫu chưa có ảnh bìa ⇒ nộp ảnh bìa của mẫu lesson-thumb, như agent thật phải làm (get_capabilities → thumbnail.required)
  if (!(spec.extra && spec.extra.thumbnail)) {
    const caps = await must('get_capabilities', { channel: task.channel.display_id });
    if (caps.data.thumbnail && caps.data.thumbnail.required) {
      const th = JSON.parse(JSON.stringify(loadSample('lesson-thumb').extra.thumbnail)), last = Math.max(0, spec.beats.length - 1);
      th.variants.forEach(v => { if (v.visual && Number.isInteger(v.visual.beat)) v.visual.beat = Math.min(v.visual.beat, last); });
      spec = Object.assign({}, spec, { extra: Object.assign({}, spec.extra, { thumbnail: th }) });
    }
  }
  let cast = (await must('list_cast', { channel: task.channel.display_id })).data.cast;
  if (!cast.length) {
    for (const m of spec.cast || SAMPLE_CAST) {
      await must('save_cast_member', { channel: task.channel.display_id, name: m.name, role_label: m.role_label, note: 'agent giả tạo nhân vật mẫu',
        data: { look: { archetype: m.archetype }, voice: { provider: 'gemini', model: 'gemini-3.1-flash-tts-preview', voice: m.voice } } });
    }
    cast = (await must('list_cast', { channel: task.channel.display_id })).data.cast;
  }
  const lesson = sample(cast, task, spec);
  const v = await must('validate_lesson', lesson);
  if (!v.data.ok) throw new Error('validate_lesson báo lỗi: ' + v.text);
  const s = await must('submit_lesson', lesson);
  await must('complete_task', { work_order: task.work_order, summary: 'Agent giả đã nộp ' + s.data.lesson + ' (' + spec.lines.length + ' câu).' });
  return 'done';
}

module.exports = { handleTask, sample, LINES, loadSample, listSamples };
