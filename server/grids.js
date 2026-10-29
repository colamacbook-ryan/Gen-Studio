// © 2026 Gen Labs — All rights reserved.
// Lưới dữ liệu: whitelist cột + parser ô truy vấn tham số hoá (DATABASE §5.2).
'use strict';

// ---------- tiện ích ----------
const now = () => new Date().toISOString();
function J(v) { if (typeof v === 'string') { try { return JSON.parse(v); } catch { return v; } } return v; }

// ---------- định nghĩa lưới: nạp từ server/grids/*.js (một file mỗi lưới, SPEC-0.2.0 §2.4) ----------
// Mỗi module export { name, grid }; module tên bắt đầu `_` là tiện ích, không nạp. Tên lưới trùng ⇒ ném lỗi lúc nạp.
const fs = require('node:fs');
const path = require('node:path');
const GRIDS = {};
const dir = path.join(__dirname, 'grids');
for (const f of fs.readdirSync(dir).filter((x) => x.endsWith('.js') && !x.startsWith('_')).sort()) {
  const m = require(path.join(dir, f));
  if (Object.hasOwn(GRIDS, m.name)) throw new Error('lưới trùng tên: ' + m.name);
  GRIDS[m.name] = m.grid;
}

// ---------- parser ô truy vấn ----------
function bad(text) { const e = new Error(text); e.code = 'invalid'; e.text_human = text; return e; }
const TOK = /\s*(-)?(?:([a-z_]+)(>=|<=|:|>|<)(?:"([^"]*)"|(\S+))|"([^"]*)"|(\S+))/y;
const esc = s => s.replace(/[\\%_]/g, c => '\\' + c);

// Trả {conds:[sql], params:[]} — luôn tham số hoá; tên cột phải nằm trong whitelist.
function parseQuery(grid, q) {
  const conds = [], params = [];
  const s = String(q || '').trim();
  if (s.length > 500) throw bad('Ô truy vấn quá dài.');
  TOK.lastIndex = 0;
  let m;
  while (TOK.lastIndex < s.length && (m = TOK.exec(s))) {
    const neg = !!m[1];
    let sql, p = [];
    if (m[2]) {
      const col = Object.hasOwn(grid.cols, m[2]) ? grid.cols[m[2]] : null;
      if (!col) throw bad('Cột không hợp lệ: ' + m[2] + '. Cột có thể dùng: ' + Object.keys(grid.cols).join(', '));
      const op = m[3], val = m[4] !== undefined ? m[4] : m[5];
      if (op === ':') {
        if (col.type === 'num' || col.type === 'ms') {
          const n = Number(val); if (!Number.isFinite(n)) throw bad('Giá trị số không hợp lệ cho cột ' + m[2]);
          sql = col.expr + ' = ?'; p = [n];
        } else if (col.type === 'bool') { sql = col.expr + ' = ?'; p = [/^(1|true|yes|co|có)$/i.test(val) ? 1 : 0]; }
        else if (col.type === 'text' || col.type === 'json') { sql = col.expr + " LIKE ? ESCAPE '\\'"; p = ['%' + esc(val) + '%']; }
        else if (col.type === 'date') { sql = col.expr + " LIKE ? ESCAPE '\\'"; p = [esc(val) + '%']; }
        else {
          const vs = val.split(',').filter(Boolean);
          sql = col.expr + ' COLLATE NOCASE IN (' + vs.map(() => '?').join(',') + ')'; p = vs;
        }
      } else {
        if (col.type === 'num' || col.type === 'ms') { const n = Number(val); if (!Number.isFinite(n)) throw bad('Giá trị số không hợp lệ cho cột ' + m[2]); sql = col.expr + ' ' + op + ' ?'; p = [n]; }
        else if (col.type === 'date') { sql = col.expr + ' ' + op + ' ?'; p = [val]; }
        else throw bad('Toán tử ' + op + ' chỉ dùng cho cột số hoặc ngày: ' + m[2]);
      }
    } else {
      const word = m[6] !== undefined ? m[6] : m[7];
      const sc = Object.values(grid.cols).filter(c => c.search);
      if (!sc.length) throw bad('Lưới này không hỗ trợ tìm theo chữ.');
      sql = '(' + sc.map(c => c.expr + " LIKE ? ESCAPE '\\'").join(' OR ') + ')'; p = sc.map(() => '%' + esc(word) + '%');
    }
    conds.push((neg ? 'NOT COALESCE(' : '(') + sql + (neg ? ', 0)' : ')'));
    params.push(...p);
  }
  return { conds, params };
}

function runGrid(db, name, { q, sort, limit } = {}) {
  const g = Object.hasOwn(GRIDS, name) ? GRIDS[name] : null;
  if (!g) { const e = new Error('Không có lưới ' + name); e.code = 'not_found'; e.text_human = 'Không có lưới "' + name + '".'; throw e; }
  const ws = db.ws;
  const { conds, params } = parseQuery(g, q);
  let sk = String(sort || g.sort || ''), desc = false;
  if (sk[0] === '-') { desc = true; sk = sk.slice(1); }
  if (!Object.hasOwn(g.cols, sk)) { if (sort) throw bad('Không sắp xếp được theo cột: ' + sk); sk = Object.keys(g.cols)[0]; }
  const select = Object.entries(g.cols).map(([k, c]) => c.expr + ' AS ' + k).join(', ');
  const sql = 'SELECT ' + select + ' FROM ' + g.from + ' WHERE ' + g.where + (conds.length ? ' AND ' + conds.join(' AND ') : '') +
    ' ORDER BY ' + g.cols[sk].expr + (desc ? ' DESC' : ' ASC') + ' LIMIT 5000';
  let rows = db.all(sql, ws, ...params);
  const jcols = Object.entries(g.cols).filter(([, c]) => c.type === 'json').map(([k]) => k);
  rows = rows.map(r => { const o = Object.assign({}, r); jcols.forEach(k => { o[k] = J(o[k]); }); return o; });
  const footer = g.footer(rows);
  const lim = Math.max(1, Math.min(500, Number(limit) || 200));
  return {
    columns: Object.entries(g.cols).map(([key, c]) => ({ key, label: c.label, type: c.type })),
    rows: rows.slice(0, lim).map(r => Object.assign({ id: r.display_id }, r)),
    footer: Object.assign({ matched: rows.length }, footer),
  };
}

module.exports = { GRIDS, parseQuery, runGrid, J, now };
