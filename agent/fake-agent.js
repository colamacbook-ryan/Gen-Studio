// © 2026 Gen Labs — All rights reserved.
// Agent giả (GS_FAKE_AGENT=1): nộp bài mẫu 3 câu (LN-0001/0003/0005 của BUILD-BRIEF §5) qua chính MCP rồi complete_task. Chỉ dùng cho e2e.
'use strict';

const LINES = [
  { name: 'Bé Hỏi', say: 'Anh Gen ơi, sao A.I. nói sai mà vẫn tự tin thế ạ?', terms: ['A.I.'], mood: 'unsure', subtitle: { en: "Gen, why does A.I. sound so sure when it's wrong?" } },
  { name: 'Anh Gen', say: 'Câu quen, như thủ đô Việt Nam là gì, thì Hà Nội chiếm tới chín mươi hai phần trăm.', terms: [], mood: 'calm', subtitle: { en: 'For a familiar question, Hanoi takes ninety-two percent.' } },
  { name: 'Bé Hỏi', say: 'À! Vậy là đoán, chứ không phải biết!', terms: [], mood: 'happy', subtitle: { en: 'Ah! So it guesses, it does not know!' } },
];

function sample(cast, task) {
  const find = (name, i) => (cast.find(m => m.name === name) || cast[i] || cast[0]).display_id;
  return {
    channel: task.channel.display_id,
    curriculum_node: task.curriculum_node ? task.curriculum_node.display_id : undefined,
    work_order: task.work_order,
    title: 'Vì sao A.I. sai mà vẫn tự tin?',
    lines: LINES.map((l, i) => ({ who: find(l.name, i % 2 ? 0 : 1), say: l.say, lang: 'vi', terms: l.terms, mood: l.mood, subtitle: l.subtitle })),
    beats: [
      { block: 'title', anchor: { line: 0, word: 'A.I.' }, params: { text: 'Vì sao A.I. sai mà vẫn tự tin?', highlight: ['A.I.'] } },
      { block: 'prob-card', anchor: { line: 1, word: 'Hà Nội' }, params: { prompt: 'Thủ đô của Việt Nam là', options: [['Hà Nội', 92], ['Huế', 4], ['TP.HCM', 3], ['Hải Phòng', 1]], pick: 0, chip: '✓ chắc chắn' } },
      { block: 'takeaway', anchor: { line: 2, word: 'đoán' }, params: { kind: 'eq', text: 'Đoán ≠ Biết' } },
    ],
  };
}

// client: {call(tool, args) → {isError, text, data}}
async function handleTask(client, task) {
  if (task.kind !== 'new_lesson') {
    await client.call('report_problem', { work_order: task.work_order, code: 'fake_unsupported', text: 'Agent giả chỉ làm việc new_lesson.' });
    return 'unsupported';
  }
  const must = async (name, args) => { const r = await client.call(name, args); if (r.isError) throw new Error(name + ' lỗi: ' + r.text); return r; };
  const cast = (await must('list_cast', { channel: task.channel.display_id })).data.cast;
  const lesson = sample(cast, task);
  const v = await must('validate_lesson', lesson);
  if (!v.data.ok) throw new Error('validate_lesson báo lỗi: ' + v.text);
  const s = await must('submit_lesson', lesson);
  await must('complete_task', { work_order: task.work_order, summary: 'Agent giả đã nộp ' + s.data.lesson + ' (3 câu).' });
  return 'done';
}

module.exports = { handleTask, sample, LINES };
