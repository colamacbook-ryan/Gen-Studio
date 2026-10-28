// © 2026 Gen Labs — All rights reserved.
// Tool MCP về bài học: validate_lesson · submit_lesson · update_lesson · get_lesson · list_lessons. Chuyển NGUYÊN TRẠNG từ server/mcp.js (P0b).
// Móc lessonExt (SPEC-0.2.0 §2.4): thuộc tính của mọi phần mở rộng đã đăng ký (thumbnail, kind/variant/screens/host/music…) tự vào inputSchema của 3 tool ghi và đi
// thẳng vào lesson.submit; gói T/U không phải sửa file này. update_lesson KHÔNG gửi lại các cột ext thì write() kế thừa từ version trước.
'use strict';
const grids = require('../grids.js');
const { kit } = require('./_kit.js');

function tools(ctx) {
  const { db, write, api, S, N, O, arr, fail, need, actorOf, assigned, ext } = kit(ctx);
  const extProps = () => (ext ? ext.lessonExt.schemaProps() : {});
  const extCols = () => (ext ? ext.lessonExt.columns() : []);
  const pickExt = (a) => Object.fromEntries(['kind', ...extCols()].filter((k) => a[k] !== undefined).map((k) => [k, a[k]]));

  // illustration.params.asset chỉ nhận mã AS-… của asset có thật trong workspace (pipeline đổi thành đường dẫn tương đối khi dựng)
  const illusErrors = (a) => arr(a.beats).map((b, i) => {
    if (!b || b.block !== 'illustration' || !b.params || b.params.asset === undefined) return null;
    const ok = typeof b.params.asset === 'string' && /^AS-\d+$/.test(b.params.asset) && db.get('SELECT 1 AS x FROM assets WHERE workspace_id=? AND display_id=?', db.ws, b.params.asset);
    return ok ? null : { path: `beats[${i}].params.asset`, text: 'Asset phải là mã AS-… của asset đã tải lên (upload_asset).' };
  }).filter(Boolean);
  const assertIllus = (a) => { const e = illusErrors(a); if (e.length) throw fail('invalid', 'Bài nộp có lỗi asset. ' + e[0].path + ': ' + e[0].text, { errors: e }); };
  const lessonPayload = (a, c) => Object.assign({}, a, { work_order: a.work_order || (assigned(c) ? assigned(c).display_id : undefined) });

  const base = { channel: S, curriculum_node: S, lesson: S, title: S, lines: { type: 'array' }, beats: { type: 'array' }, camera_hints: O, work_order: S };
  // schema là HÀM: lessonExt có thể đăng ký sau khi tool được dựng (ops/*.js nạp trước createMcp, nhưng test có thể đăng ký muộn)
  const withExt = (props) => () => Object.assign({}, props, extProps());

  return [
    { name: 'validate_lesson', scope: 'compose', description: 'Kiểm bài (chạy khô, không lưu gì): trả ok hoặc danh sách lỗi theo đường dẫn.', schema: withExt(base), required: ['title', 'lines', 'beats'], handler: (a, c) => {
      class Dry extends Error {}
      const ie = illusErrors(a);
      if (ie.length) return { text: 'Bài chưa hợp lệ:\n' + ie.map((x) => `- ${x.path}: ${x.text}`).join('\n'), data: { ok: false, errors: ie } };
      try {
        db.tx(() => { write(actorOf(c), 'lesson.submit', JSON.parse(JSON.stringify(lessonPayload(a, c)))); throw new Dry('dry'); });
      } catch (e) {
        if (e instanceof Dry) return { text: `Bài hợp lệ: ${arr(a.lines).length} câu, ${arr(a.beats).length} nhịp. Có thể submit_lesson.`, data: { ok: true, errors: [] } };
        if (e && e.code === 'invalid') {
          const errs = (e.detail && e.detail.errors) || [{ path: '', text: e.text_human }];
          return { text: 'Bài chưa hợp lệ:\n' + errs.map((x) => `- ${x.path}: ${x.text}`).join('\n'), data: { ok: false, errors: errs } };
        }
        throw e;
      }
      throw fail('internal', 'validate_lesson không chạy khô được.');
    } },
    { name: 'submit_lesson', scope: 'compose', description: 'Nộp bài (lesson mới hoặc version mới nếu có lesson) — tự tạo Render và tự chạy pipeline.', schema: withExt({ ...base, note: S }), required: ['title', 'lines', 'beats'], handler: (a, c) => {
      assertIllus(a);
      const out = write(actorOf(c), 'lesson.submit', lessonPayload(a, c));
      return { text: `Đã nộp bài ${out.lesson.display_id} v${out.version.version}; bản dựng ${out.render.display_id} đã vào hàng đợi.`, data: { lesson: out.lesson.display_id, version: out.version.version, render: out.render.display_id } };
    } },
    { name: 'update_lesson', scope: 'compose', description: 'Sửa bài: gửi phần thay đổi (title/lines/beats/camera_hints); phần không gửi giữ nguyên. Tạo version mới + Render mới.', schema: withExt({ lesson: S, title: S, lines: { type: 'array' }, beats: { type: 'array' }, camera_hints: O, work_order: S, note: S }), required: ['lesson'], handler: (a, c) => {
      const l = need('lessons', a.lesson, 'bài học');
      const cur = api.lessonDoc(db, l);
      const p = {
        lesson: l.display_id, title: a.title || l.title, note: a.note, work_order: a.work_order || (assigned(c) ? assigned(c).display_id : undefined),
        lines: a.lines || cur.lines.map((x) => ({ id: x.id, who: x.who, say: x.say, lang: x.lang, terms: x.terms, subtitle: x.subtitle, mood: x.mood })),
        beats: a.beats || cur.beats.map((b) => ({ id: b.id, block: b.block, params: b.params, anchor: b.anchor, asset_ids: b.asset_ids })),
        camera_hints: a.camera_hints !== undefined ? a.camera_hints : cur.camera_hints,
        ...pickExt(a),
      };
      assertIllus(p);
      const out = write(actorOf(c), 'lesson.submit', p);
      return { text: `Đã sửa bài ${out.lesson.display_id} lên v${out.version.version}; bản dựng ${out.render.display_id} đã vào hàng đợi.`, data: { lesson: out.lesson.display_id, version: out.version.version, render: out.render.display_id } };
    } },
    { name: 'get_lesson', scope: 'read', description: 'Xem bài (câu, nhịp, version).', schema: { lesson: S, version: N }, required: ['lesson'], handler: (a) => {
      const l = need('lessons', a.lesson, 'bài học');
      const doc = api.lessonDoc(db, l, a.version);
      const renders = db.all('SELECT r.display_id, r.state, lv.version FROM renders r JOIN lesson_versions lv ON lv.id=r.lesson_version_id WHERE lv.lesson_id=? ORDER BY r.created_at', l.id);
      return { text: `Bài ${l.display_id} "${l.title}" v${doc.version}:\n` + doc.lines.map((x) => `${x.id} ${x.who}: ${x.say}`).join('\n') + '\nNhịp: ' + doc.beats.map((b) => `${b.id} ${b.block}@${b.anchor.line}#${b.anchor.word_index}`).join(', ') + '\nRender: ' + renders.map((r) => `${r.display_id}(${r.state})`).join(', '),
        data: { lesson: { display_id: l.display_id, title: l.title, current_version: l.current_version }, doc, renders } };
    } },
    { name: 'list_lessons', scope: 'read', description: 'Danh sách bài học.', schema: { channel: S, limit: N }, required: [], handler: (a) => {
      const g = grids.runGrid(db, 'lessons', { q: a.channel ? 'channel:' + a.channel : '', limit: a.limit || 50 });
      return { text: g.rows.map((r) => `${r.display_id} "${r.title}" v${r.version} ${r.render || '—'} ${r.state || ''}`).join('\n') || 'Chưa có bài.', data: { lessons: g.rows } };
    } },
  ];
}

module.exports = { tools };
