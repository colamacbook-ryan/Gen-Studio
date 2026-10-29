// © 2026 Gen Labs — All rights reserved.
// UI-D0 (SPEC-0.2.0 §7.3) — biểu đồ SVG thuần, không thư viện. Mỗi biểu đồ kèm bảng số ẩn cho trình đọc màn hình (role=table);
// màu luôn đi cùng chữ (chú giải có số). Ngân sách (§7.5): ≤ 400 nút SVG mỗi biểu đồ — test e-ui-d0 kiểm bằng hàm hình học thuần.
// Phần thuần (Node test được): niceMax, barGeometry, donutArcs, stackGeometry. Phần DOM: barChart, donutChart, stackBars, srTable.
import { h, append } from './dom.js';
import { toText } from './util.js';

const SVG_NS = 'http://www.w3.org/2000/svg';

// ---------------- thuần ----------------

// Trần trục "đẹp" ≥ n: 1, 2, 5 × 10^k (0 ⇒ 1)
export function niceMax(n) {
  const v = Math.max(0, Number(n) || 0);
  if (v <= 1) return 1;
  const p = Math.pow(10, Math.floor(Math.log10(v)));
  for (const m of [1, 2, 5, 10]) if (m * p >= v) return m * p;
  return 10 * p;
}

// Cột tuần so với mục tiêu. items = [{value, target?}] → {max, bars:[{x,y,w,h}], target:{y}|null, ticks:[{v,y}]}
// target: lấy target lớn nhất (mọi tuần cùng một mục tiêu theo công thức per_run×7; khác nhau thì vẽ theo từng cột — targets[])
export function barGeometry(items, { width = 360, height = 140, padL = 24, padR = 4, padT = 8, padB = 18, gap = 0.36 } = {}) {
  const vals = items.map((x) => Math.max(0, Number(x && x.value) || 0));
  const tgts = items.map((x) => (x && x.target != null && Number.isFinite(Number(x.target)) ? Number(x.target) : null));
  const max = niceMax(Math.max(1, ...vals, ...tgts.filter((v) => v != null)));
  const plotW = width - padL - padR, plotH = height - padT - padB;
  const slot = items.length ? plotW / items.length : plotW;
  const bw = Math.max(2, slot * (1 - gap));
  const y = (v) => padT + plotH - (v / max) * plotH;
  const bars = vals.map((v, i) => { const top = y(v); return { x: padL + i * slot + (slot - bw) / 2, y: top, w: bw, h: padT + plotH - top, cx: padL + i * slot + slot / 2 }; });
  const same = tgts.length && tgts.every((v) => v != null && v === tgts[0]);
  const targets = tgts.map((v, i) => (v == null ? null : { y: y(v), x0: padL + i * slot, x1: padL + (i + 1) * slot }));
  const ticks = [0, max / 2, max].map((v) => ({ v, y: y(v) }));
  return { max, bars, target: same && tgts[0] > 0 ? { y: y(tgts[0]), x0: padL, x1: width - padR } : null, targets: same ? [] : targets.filter(Boolean), ticks, base: padT + plotH, plotH };
}

// Donut: values ≥ 0 → cung (độ dài nét) trên vòng tròn chu vi C, bắt đầu 12 giờ. → {C, arcs:[{len, offset}]}
export function donutArcs(values, r = 40) {
  const C = 2 * Math.PI * r;
  const vs = values.map((v) => Math.max(0, Number(v) || 0));
  const total = vs.reduce((a, b) => a + b, 0);
  let acc = 0;
  const arcs = vs.map((v) => { const len = total ? (v / total) * C : 0; const a = { len, offset: -acc }; acc += len; return a; });
  return { C, total, arcs };
}

// Thanh xếp chồng: values → [{x, w}] trên chiều rộng width (tổng 0 ⇒ mọi đoạn rộng 0)
export function stackGeometry(values, width = 200, total) {
  const vs = values.map((v) => Math.max(0, Number(v) || 0));
  const tot = total != null ? Math.max(Number(total) || 0, vs.reduce((a, b) => a + b, 0)) : vs.reduce((a, b) => a + b, 0);
  let x = 0;
  return vs.map((v) => { const w = tot ? (v / tot) * width : 0; const s = { x, w }; x += w; return s; });
}

// ---------------- DOM ----------------
function svgEl(tag, attrs, text) {
  const n = document.createElementNS(SVG_NS, tag);
  for (const [k, v] of Object.entries(attrs || {})) if (v != null) n.setAttribute(k, String(v));
  if (text != null) n.textContent = toText(text);
  return n;
}
function svgRoot(width, height, label) {
  const s = svgEl('svg', { viewBox: `0 0 ${width} ${height}`, width: '100%', class: 'ch-svg', 'aria-hidden': 'true', focusable: 'false', preserveAspectRatio: 'xMidYMid meet' });
  if (label) s.setAttribute('data-label', label);
  return s;
}

// Bảng số ẩn (trình đọc màn hình): caption + hàng tiêu đề + các hàng — div role=table (Data Console, không <table>)
export function srTable(caption, headers, rows) {
  const t = h('div', { class: 'sr-only', role: 'table', 'aria-label': caption });
  t.append(h('div', { role: 'row' }, headers.map((x) => h('span', { role: 'columnheader' }, toText(x)))));
  for (const r of rows) t.append(h('div', { role: 'row' }, r.map((x) => h('span', { role: 'cell' }, toText(x)))));
  return t;
}

// Cột + đường mục tiêu nét đứt. items = [{label, value, target?, title?}]. opts: {width, height, caption, headers, fmt}
export function barChart(items, opts = {}) {
  const width = opts.width || 360, height = opts.height || 140;
  const g = barGeometry(items, { width, height });
  const svg = svgRoot(width, height, opts.caption);
  for (const tk of g.ticks) {
    svg.appendChild(svgEl('line', { x1: 22, x2: width - 4, y1: tk.y, y2: tk.y, class: 'ch-grid' }));
    svg.appendChild(svgEl('text', { x: 18, y: tk.y + 3, class: 'ch-tick', 'text-anchor': 'end' }, Number.isInteger(tk.v) ? tk.v : tk.v.toFixed(1)));
  }
  g.bars.forEach((b, i) => {
    const it = items[i] || {};
    const met = it.target != null && it.value >= it.target && it.target > 0;
    const rect = svgEl('rect', { x: b.x, y: b.h > 0 ? b.y : g.base - 1, width: b.w, height: Math.max(1, b.h), rx: 1.5, class: 'ch-bar' + (met ? ' met' : '') + (i === g.bars.length - 1 ? ' now' : '') });
    rect.appendChild(svgEl('title', null, it.title || (toText(it.label) + ': ' + toText(it.value))));
    svg.appendChild(rect);
    if (it.value > 0 && b.h > 12) svg.appendChild(svgEl('text', { x: b.cx, y: b.y + 11, class: 'ch-val', 'text-anchor': 'middle' }, it.value));
    svg.appendChild(svgEl('text', { x: b.cx, y: height - 5, class: 'ch-lbl' + (i === g.bars.length - 1 ? ' now' : ''), 'text-anchor': 'middle' }, it.label));
  });
  if (g.target) svg.appendChild(svgEl('line', { x1: g.target.x0, x2: g.target.x1, y1: g.target.y, y2: g.target.y, class: 'ch-target' }));
  for (const tg of g.targets) svg.appendChild(svgEl('line', { x1: tg.x0 + 2, x2: tg.x1 - 2, y1: tg.y, y2: tg.y, class: 'ch-target' }));
  const fig = h('figure', { class: 'ch ch-bars' });
  fig.append(svg, srTable(opts.caption || '', opts.headers || ['', ''], items.map((it) => [it.label, it.value, it.target == null ? '—' : it.target])));
  return fig;
}

// Donut + chú giải có số. segments = [{key, label, value, tone}] (tone ⇒ class màu .ch-tone-<tone>); center = {value, label}
export function donutChart(segments, opts = {}) {
  const size = opts.size || 112, stroke = opts.stroke || 14, r = (size - stroke) / 2;
  const { C, total, arcs } = donutArcs(segments.map((s) => s.value), r);
  const svg = svgRoot(size, size, opts.caption);
  svg.setAttribute('width', String(size)); svg.setAttribute('height', String(size));
  const cx = size / 2;
  svg.appendChild(svgEl('circle', { cx, cy: cx, r, class: 'ch-ring', 'stroke-width': stroke, fill: 'none' }));
  segments.forEach((s, i) => {
    if (!arcs[i].len) return;
    const c = svgEl('circle', { cx, cy: cx, r, fill: 'none', 'stroke-width': stroke, class: 'ch-arc ch-tone-' + (s.tone || 'idle'),
      'stroke-dasharray': `${Math.max(0, arcs[i].len - (segments.filter((x) => x.value > 0).length > 1 ? 1.5 : 0))} ${C}`, 'stroke-dashoffset': arcs[i].offset,
      transform: `rotate(-90 ${cx} ${cx})` });
    c.appendChild(svgEl('title', null, s.label + ': ' + s.value));
    svg.appendChild(c);
  });
  svg.appendChild(svgEl('text', { x: cx, y: cx + 2, class: 'ch-center', 'text-anchor': 'middle' }, opts.center ? opts.center.value : total));
  if (opts.center && opts.center.label) svg.appendChild(svgEl('text', { x: cx, y: cx + 16, class: 'ch-center-sub', 'text-anchor': 'middle' }, opts.center.label));
  const legend = h('ul', { class: 'ch-legend' });
  for (const s of segments) {
    const li = h('li', { class: s.value ? null : 'zero' }, h('i', { class: 'ch-key ch-tone-' + (s.tone || 'idle'), 'aria-hidden': 'true' }), h('span', null, s.label), h('span', { class: 'mono' }, String(s.value)));
    if (s.href) legend.append(h('a', { href: s.href, class: 'ch-legend-link' }, li)); else legend.append(li);
  }
  const fig = h('figure', { class: 'ch ch-donut' });
  fig.append(h('div', { class: 'ch-donut-row' }, svg, legend), srTable(opts.caption || '', opts.headers || ['', ''], segments.map((s) => [s.label, s.value])));
  return fig;
}

// Thanh xếp chồng theo hàng (tiến độ giáo trình). rows = [{label, sub?, href?, parts:[{key, label, value, tone}], total}]
export function stackBars(rows, opts = {}) {
  const width = opts.width || 200, bh = opts.barHeight || 8;
  const fig = h('figure', { class: 'ch ch-stack' });
  const list = h('div', { class: 'ch-stack-rows' });
  for (const r of rows) {
    const geo = stackGeometry(r.parts.map((p) => p.value), width, r.total);
    const svg = svgRoot(width, bh, r.label);
    svg.setAttribute('preserveAspectRatio', 'none'); svg.setAttribute('height', String(bh));
    svg.appendChild(svgEl('rect', { x: 0, y: 0, width, height: bh, rx: 2, class: 'ch-track' }));
    r.parts.forEach((p, i) => { if (geo[i].w > 0) svg.appendChild(svgEl('rect', { x: geo[i].x, y: 0, width: geo[i].w, height: bh, class: 'ch-seg ch-tone-' + (p.tone || 'idle') })); });
    const head = h('div', { class: 'ch-stack-head' }, h('span', { class: 'ch-stack-label' }, toText(r.label)), r.sub ? h('span', { class: 'mono muted' }, toText(r.sub)) : null);
    list.append(h('div', { class: 'ch-stack-row' }, r.href ? h('a', { href: r.href }, head) : head, svg));
  }
  const keys = rows.length ? rows[0].parts : [];
  const legend = h('ul', { class: 'ch-legend inline' });
  for (const p of keys) legend.append(h('li', null, h('i', { class: 'ch-key ch-tone-' + (p.tone || 'idle'), 'aria-hidden': 'true' }), h('span', null, p.label)));
  append(fig, [list, opts.legend === false ? null : legend,
    srTable(opts.caption || '', [opts.rowHeader || '', ...keys.map((p) => p.label)], rows.map((r) => [r.label, ...r.parts.map((p) => p.value)]))]);
  return fig;
}
