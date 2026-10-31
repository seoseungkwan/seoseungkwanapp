// Shared pieces for the proposal: icons, logo, sample data (all 예시), SVG charts, app shell.
export const C = {
  accent: '#2563EB', accentDark: '#1D4ED8', ret: '#8DB0F4', grid: '#E5E7EB', base: '#D1D5DB',
  muted: '#6B7280', ink2: '#374151', ink: '#111827', teal: '#0F766E', prev: '#9CA3AF', soft: '#EAF1FE',
}

const I = {
  shield: '<path d="M8 1.75 3 3.6v3.9c0 3 2.1 5.5 5 6.75 2.9-1.25 5-3.75 5-6.75V3.6L8 1.75z"/><path d="m5.9 8 1.5 1.5 2.8-2.9"/>',
  lock: '<rect x="3.25" y="7" width="9.5" height="7" rx="1"/><path d="M5.5 7V5.25a2.5 2.5 0 0 1 5 0V7"/>',
  clock: '<circle cx="8" cy="8" r="6"/><path d="M8 4.75V8l2.25 1.5"/>',
  cal: '<rect x="2.25" y="3.25" width="11.5" height="10.5" rx="1"/><path d="M2.25 6.5h11.5M5.5 1.75v3M10.5 1.75v3"/>',
  upload: '<path d="M8 10.25V2.75M5 5.5l3-2.75 3 2.75M2.75 10.5v2.75h10.5V10.5"/>',
  user: '<circle cx="8" cy="5.5" r="2.75"/><path d="M2.75 14c.6-2.5 2.7-3.9 5.25-3.9s4.65 1.4 5.25 3.9"/>',
  chev: '<path d="m4.75 6.25 3.25 3.25 3.25-3.25"/>',
  check: '<path d="m3.5 8.25 2.9 2.9 6.1-6.65"/>',
  x: '<path d="m4.75 4.75 6.5 6.5m0-6.5-6.5 6.5"/>',
  arrow: '<path d="M2.75 8h10.5M9.25 4l4 4-4 4"/>',
  arrowDown: '<path d="M8 2.75v10.5M4 9.25l4 4 4-4"/>',
  monitor: '<rect x="1.75" y="2.75" width="12.5" height="8.5" rx="1"/><path d="M5.5 13.75h5M8 11.25v2.5"/>',
  server: '<rect x="2.25" y="2.5" width="11.5" height="4.5" rx="1"/><rect x="2.25" y="9" width="11.5" height="4.5" rx="1"/><path d="M4.75 4.75h.5M4.75 11.25h.5"/>',
  sigma: '<path d="M12 3H4.25l4.25 5-4.25 5H12"/>',
  doc: '<path d="M4 1.75h5.25L12 4.5v9.75H4z"/><path d="M9.25 1.75V4.5H12M6 8h4M6 10.75h4"/>',
  stop: '<circle cx="8" cy="8" r="6"/><path d="m3.9 3.9 8.2 8.2"/>',
  menu: '<path d="M2.75 4.5h10.5M2.75 8h10.5M2.75 11.5h10.5"/>',
}
export const icon = (n, s = 16, cls = '') =>
  `<svg class="ic ${cls}" width="${s}" height="${s}" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${I[n]}</svg>`

export const tri = (dir) => dir === 'up'
  ? '<svg class="tri" width="8" height="8" viewBox="0 0 8 8" aria-hidden="true"><path d="M4 1.2 7.4 6.8H.6z" fill="currentColor"/></svg>'
  : '<svg class="tri" width="8" height="8" viewBox="0 0 8 8" aria-hidden="true"><path d="M4 6.8 7.4 1.2H.6z" fill="currentColor"/></svg>'

// Logo C③ — copied from src/components/common/LogoMark.tsx (fixed two colours, the one exception to one accent)
export const logo = (size = 24) =>
  `<svg class="logo" aria-hidden="true" width="${size}" height="${size}" viewBox="0 0 30 30"><rect x="3" y="3" width="24" height="24" rx="6" fill="none" stroke="#14C8BA" stroke-width="2.4"/><path d="M13.5 8h3a1 1 0 0 1 1 1v3.5H21a1 1 0 0 1 1 1v3a1 1 0 0 1-1 1h-3.5V21a1 1 0 0 1-1 1h-3a1 1 0 0 1-1-1v-3.5H9a1 1 0 0 1-1-1v-3a1 1 0 0 1 1-1h3.5V9a1 1 0 0 1 1-1z" fill="#6D5DF5"/></svg>`

export const gmark = (s = 18) =>
  `<svg width="${s}" height="${s}" viewBox="0 0 48 48" aria-hidden="true"><path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/><path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/><path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"/><path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/></svg>`

// ── Sample data (예시). Field names follow src/types/analysis.ts (series.week BucketRef totals / revisit, RxCompare, regions)
export const WEEKS = [
  { key: '9.7', range: '9월 7일 – 13일', n: 112, r: 524, c7: 44, c14: 58 },
  { key: '9.14', range: '9월 14일 – 20일', n: 118, r: 538, c7: 48, c14: 62 },
  { key: '9.21', range: '9월 21일 – 27일', n: 92, r: 431, c7: 34, c14: 45, note: '추석 연휴' },
  { key: '9.28', range: '9월 28일 – 10월 4일', n: 121, r: 556, c7: 51, c14: 65 },
  { key: '10.5', range: '10월 5일 – 11일', n: 109, r: 521, c7: 44, c14: 57, note: '한글날' },
  { key: '10.12', range: '10월 12일 – 18일', n: 126, r: 571, c7: 52, c14: null },
  { key: '10.19', range: '10월 19일 – 25일', n: 131, r: 583, c7: null, c14: null },
  { key: '10.26', range: '10월 26일 – 11월 1일', n: 98, r: 452, c7: null, c14: null, inprog: true },
]
const done = WEEKS.filter((w) => !w.inprog)
export const KPI = [
  { label: '환자 수', value: '714', unit: '명', diff: '17명', pct: '+2.4%', dir: 'up', spark: done.map((w) => w.n + w.r) },
  { label: '신환', value: '131', unit: '명', diff: '5명', pct: '+4.0%', dir: 'up', spark: done.map((w) => w.n) },
  { label: '재진', value: '583', unit: '명', diff: '12명', pct: '+2.1%', dir: 'up', spark: done.map((w) => w.r) },
  { label: '신환율', value: '18.3', unit: '%', diff: '0.3%p', pct: '', dir: 'up', spark: done.map((w) => (w.n / (w.n + w.r)) * 100) },
]
export const RX = [
  { name: '표층열치료', type: '물리', cur: 402, prev: 389, diff: 13, pct: '+3.3%', nr: 17, rr: 83, fr: 81 },
  { name: '간섭파전류치료', type: '물리', cur: 377, prev: 368, diff: 9, pct: '+2.4%', nr: 16, rr: 84, fr: 80 },
  { name: '도수치료 30분', type: '비급여', cur: 86, prev: 74, diff: 12, pct: '+16.2%', nr: 21, rr: 79, fr: 64 },
  { name: '관절강내주사', type: '주사', cur: 64, prev: 58, diff: 6, pct: '+10.3%', nr: 28, rr: 72, fr: 39 },
  { name: '견인치료', type: '물리', cur: 52, prev: 56, diff: -4, pct: '−7.1%', nr: 10, rr: 90, fr: 85 },
  { name: '체외충격파', type: '비급여', cur: 31, prev: 36, diff: -5, pct: '−13.9%', nr: 13, rr: 87, fr: 71 },
]
export const RISING = [['표층열치료', '13명', '+3.3%'], ['도수치료 30분', '12명', '+16.2%'], ['간섭파전류치료', '9명', '+2.4%']]
export const FALLING = [['체외충격파', '5명', '−13.9%'], ['견인치료', '4명', '−7.1%'], ['적외선치료', '2명', '−4.8%']]
export const REGIONS = [
  ['중앙동', 168], ['신정동', 131], ['남산동', 97], ['서부동', 74], ['동림동', 58], ['그 밖 동네', 164, 'rest'], ['주소 없음', 22, 'rest'],
]

const f1 = (v) => (Math.round(v * 10) / 10).toFixed(1)

// ── Charts (flat SVG, horizontal gridlines only, 12px muted axis labels, direct labels, no animation)
// Stacked 신환/재진 bars per week; the in-progress week is hatched and labelled 집계 중.
export function barsChart({ w, h = 300, compact = false, skip = false }) {
  const ml = compact ? 30 : 40, mr = compact ? 2 : 6, mt = compact ? 22 : 34, mb = compact ? 26 : 46
  const pw = w - ml - mr, ph = h - mt - mb, max = 800
  const y = (v) => +(mt + ph - (v / max) * ph).toFixed(1)
  const band = pw / WEEKS.length
  const bw = Math.round(compact ? Math.min(20, band * 0.56) : Math.min(40, band * 0.46))
  const ticks = compact ? [0, 400, 800] : [0, 200, 400, 600, 800]
  let s = `<svg class="chart" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}" role="img" aria-label="주별 환자 수, 신환과 재진을 쌓은 막대 (예시)">`
  s += `<text x="0" y="12" class="ax">(명)</text>`
  for (const t of ticks) {
    s += `<line x1="${ml}" x2="${w - mr}" y1="${y(t)}" y2="${y(t)}" stroke="${t ? C.grid : C.base}" stroke-width="1"/>`
    s += `<text x="${ml - 8}" y="${y(t) + 4}" text-anchor="end" class="ax">${t}</text>`
  }
  WEEKS.forEach((d, i) => {
    const cx = ml + band * i + band / 2, x = +(cx - bw / 2).toFixed(1), tot = d.n + d.r
    const last = d.key === '10.19'
    if (d.inprog) {
      s += `<rect x="${x + 0.5}" y="${y(tot) + 0.5}" width="${bw - 1}" height="${(y(0) - y(tot) - 1).toFixed(1)}" fill="url(#hatch)" stroke="${C.accent}" stroke-width="1"/>`
      s += `<text x="${cx}" y="${y(tot) - 8}" text-anchor="middle" class="lbl">${tot}</text>`
      if (!compact) s += `<text x="${cx}" y="${y(tot) - 24}" text-anchor="middle" class="ax">집계 중</text>`
    } else {
      const yr = y(d.r), yt = y(tot)
      s += `<rect x="${x}" y="${yr}" width="${bw}" height="${(y(0) - yr).toFixed(1)}" fill="${C.ret}"/>`
      s += `<rect x="${x}" y="${yt}" width="${bw}" height="${(yr - yt - 2).toFixed(1)}" fill="${C.accent}"/>`
      s += `<text x="${cx}" y="${yt - 8}" text-anchor="middle" class="lbl${last ? ' strong' : ''}">${tot}</text>`
    }
    if (!skip || i % 2 === 0) s += `<text x="${cx}" y="${h - mb + 18}" text-anchor="middle" class="ax">${d.key}</text>`
    if (!compact && d.note) s += `<text x="${cx}" y="${h - mb + 34}" text-anchor="middle" class="ax faint">${d.note}</text>`
  })
  s += '</svg>'
  // hidden data table for screen readers
  s += `<table class="sr-only"><caption>주별 환자 수 (예시)</caption><tr><th>주</th><th>신환</th><th>재진</th><th>상태</th></tr>${WEEKS.map((d) => `<tr><td>${d.range}</td><td>${d.n}</td><td>${d.r}</td><td>${d.inprog ? '집계 중' : '완료'}</td></tr>`).join('')}</table>`
  return s
}

export function spark(vals, { w = 88, h = 28 } = {}) {
  const min = Math.min(...vals), max = Math.max(...vals), pad = 3
  const xs = (i) => +(pad + (i * (w - 2 * pad)) / (vals.length - 1)).toFixed(1)
  const ys = (v) => +(h - pad - ((v - min) / (max - min || 1)) * (h - 2 * pad)).toFixed(1)
  const pts = vals.map((v, i) => `${xs(i)},${ys(v)}`)
  const area = `M${xs(0)},${h} L${pts.join(' L')} L${xs(vals.length - 1)},${h} Z`
  const lx = xs(vals.length - 1), ly = ys(vals[vals.length - 1])
  return `<svg class="spark" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" aria-hidden="true"><path d="${area}" fill="${C.soft}"/><polyline points="${pts.join(' ')}" fill="none" stroke="${C.accent}" stroke-width="1.5" stroke-linejoin="round"/><circle cx="${lx}" cy="${ly}" r="2.75" fill="${C.accent}" stroke="#fff" stroke-width="1.5"/></svg>`
}

// 7일·14일 재방문율 by cohort week. 14일 needs 14 days to pass, so recent weeks are 집계 중.
export function revisitChart({ w, h = 176, compact = false }) {
  const ml = 34, mr = 8, mt = 14, mb = 24, lo = 30, hi = 60
  const pw = w - ml - mr, ph = h - mt - mb
  const band = pw / WEEKS.length
  const X = (i) => +(ml + band * i + band / 2).toFixed(1)
  const Y = (v) => +(mt + ph - ((v - lo) / (hi - lo)) * ph).toFixed(1)
  let s = `<svg class="chart" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}" role="img" aria-label="신환 7일·14일 재방문율 (예시)">`
  for (const t of [30, 40, 50, 60]) {
    s += `<line x1="${ml}" x2="${w - mr}" y1="${Y(t)}" y2="${Y(t)}" stroke="${t === 30 ? C.base : C.grid}"/>`
    s += `<text x="${ml - 6}" y="${Y(t) + 4}" text-anchor="end" class="ax">${t}%</text>`
  }
  const hx = ml + band * 6
  s += `<rect x="${hx}" y="${mt}" width="${(w - mr - hx).toFixed(1)}" height="${ph}" fill="url(#hatchSoft)"/>`
  s += `<text x="${(hx + (w - mr - hx) / 2).toFixed(1)}" y="${mt + 14}" text-anchor="middle" class="ax">집계 중</text>`
  const line = (key, col) => {
    const pts = WEEKS.map((d, i) => (d[key] == null ? null : [X(i), Y((d[key] / d.n) * 100)])).filter(Boolean)
    let p = `<polyline points="${pts.map((q) => q.join(',')).join(' ')}" fill="none" stroke="${col}" stroke-width="2" stroke-linejoin="round"/>`
    const [lx, ly] = pts[pts.length - 1]
    p += `<circle cx="${lx}" cy="${ly}" r="3.5" fill="${col}" stroke="#fff" stroke-width="2"/>`
    return { p, lx, ly }
  }
  const a = line('c14', C.teal), b = line('c7', C.accent)
  s += a.p + b.p
  s += `<text x="${a.lx}" y="${a.ly - 10}" text-anchor="middle" class="lbl strong">14일 52.3%</text>`
  s += `<text x="${b.lx}" y="${b.ly + 20}" text-anchor="middle" class="lbl strong">7일 41.3%</text>`
  WEEKS.forEach((d, i) => {
    if (compact && i % 2) return
    s += `<text x="${X(i)}" y="${h - 6}" text-anchor="middle" class="ax">${d.key}</text>`
  })
  s += '</svg>'
  s += `<table class="sr-only"><caption>신환 재방문율 (예시)</caption><tr><th>주</th><th>신환</th><th>7일 안</th><th>14일 안</th></tr>${WEEKS.map((d) => `<tr><td>${d.range}</td><td>${d.n}</td><td>${d.c7 ?? '집계 중'}</td><td>${d.c14 ?? '집계 중'}</td></tr>`).join('')}</table>`
  return s
}

// Inline bar for the prescription table: current = accent bar, previous = grey tick.
export function rxBar(cur, prev, { w = 140, max = 402 } = {}) {
  const cw = +((cur / max) * w).toFixed(1), px = +((prev / max) * w).toFixed(1)
  return `<svg class="rxbar" width="${w}" height="12" viewBox="0 0 ${w} 12" aria-hidden="true"><rect x="0" y="2" width="${cw}" height="8" fill="${C.accent}"/><rect x="${Math.max(0, px - 1)}" y="0" width="2" height="12" fill="${C.prev}"/></svg>`
}

export function regionsChart({ w, compact = false }) {
  const rowH = compact ? 30 : 32, nameW = compact ? 76 : 88, valW = compact ? 82 : 96
  const total = REGIONS.reduce((a, r) => a + r[1], 0), max = 168
  const bw = w - nameW - valW
  const h = REGIONS.length * rowH
  let s = `<svg class="chart" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}" role="img" aria-label="동네별 환자 수 (예시)">`
  REGIONS.forEach(([name, v, rest], i) => {
    const yy = i * rowH
    const len = +((v / max) * bw).toFixed(1)
    s += `<text x="0" y="${yy + rowH / 2 + 4}" class="tx${rest ? ' faint' : ''}">${name}</text>`
    s += `<rect x="${nameW}" y="${yy + rowH / 2 - 5}" width="${len}" height="10" fill="${rest ? C.base : C.accent}"/>`
    s += `<text x="${w}" y="${yy + rowH / 2 + 4}" text-anchor="end" class="tx num"><tspan class="strong">${v}명</tspan><tspan class="faint" dx="6">${f1((v / total) * 100)}%</tspan></text>`
  })
  s += '</svg>'
  return s
}

// Small specimen for the rules strip: 그 전 주 grey vs 지난주 accent, plus a hatched 집계 중 bar.
export function specimenChart(w = 360, h = 168) {
  const ml = 30, mr = 4, mt = 18, mb = 26, pw = w - ml - mr, ph = h - mt - mb, max = 400
  const y = (v) => +(mt + ph - (v / max) * ph).toFixed(1)
  const groups = [['표층열치료', 389, 402], ['간섭파', 368, 377], ['도수 30분', 74, 86]]
  const band = pw / 4
  let s = `<svg class="chart" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}" role="img" aria-label="차트 규칙 견본">`
  for (const t of [0, 200, 400]) {
    s += `<line x1="${ml}" x2="${w - mr}" y1="${y(t)}" y2="${y(t)}" stroke="${t ? C.grid : C.base}"/>`
    s += `<text x="${ml - 6}" y="${y(t) + 4}" text-anchor="end" class="ax">${t}</text>`
  }
  groups.forEach(([n, p, c], i) => {
    const cx = ml + band * i + band / 2
    s += `<rect x="${cx - 19}" y="${y(p)}" width="16" height="${(y(0) - y(p)).toFixed(1)}" fill="${C.prev}"/>`
    s += `<rect x="${cx + 3}" y="${y(c)}" width="16" height="${(y(0) - y(c)).toFixed(1)}" fill="${C.accent}"/>`
    s += `<text x="${cx + 11}" y="${y(c) - 5}" text-anchor="middle" class="lbl">${c}</text>`
    s += `<text x="${cx}" y="${h - 8}" text-anchor="middle" class="ax">${n}</text>`
  })
  const cx = ml + band * 3 + band / 2
  s += `<rect x="${cx - 8.5}" y="${y(250) + 0.5}" width="17" height="${(y(0) - y(250) - 1).toFixed(1)}" fill="url(#hatch)" stroke="${C.accent}"/>`
  s += `<text x="${cx}" y="${y(250) - 5}" text-anchor="middle" class="ax">집계 중</text>`
  s += `<text x="${cx}" y="${h - 8}" text-anchor="middle" class="ax">이번 주</text>`
  s += '</svg>'
  return s
}

// ── App shell (header + horizontal tabs, sticky together)
export const TABS = ['대시보드', '통계', 'AI 리포트', '매출', '재고', '급여', '일일마감·보고', '월간 PDF', '설정']
export function appHeader({ phone = false }) {
  if (phone) {
    return `<div class="a-hdr ph"><div class="row g8 minw0">${logo(22)}<span class="clinic ell">예시정형외과의원</span></div><button class="iconbtn" aria-label="계정 manager@example.com">${icon('user', 18)}</button></div>`
  }
  return `<div class="a-hdr"><div class="wrap-app row sb"><div class="row g12">${logo(24)}<span class="clinic">예시정형외과의원</span></div><div class="row g16"><span class="t-small muted num">2026년 10월 30일 (금) 09:42</span><button class="btn btn-secondary btn-sm">${icon('user')}<span>manager@example.com</span>${icon('chev')}</button></div></div></div>`
}
export function tabBar({ active = '대시보드', phone = false, tip = false, shift = 0, pin = '' }) {
  const items = TABS.map((t) => {
    const on = t === active, enabled = t === '대시보드'
    const cls = on ? 'tab on' : enabled ? 'tab' : 'tab off'
    const tipHtml = tip && t === '통계' ? '<span class="tip">준비 중</span>' : ''
    return `<span class="${cls}">${t}${tipHtml}</span>`
  }).join('')
  const admin = `<span class="tab-sep"></span><span class="tab${active === '관리자' ? ' on' : ''}">관리자</span>`
  const inner = `<div class="tabs-in" style="${shift ? `transform:translateX(-${shift}px)` : ''}">${items}${admin}</div>`
  if (phone) return `<div class="a-tabs ph">${inner}</div>`
  return `<div class="a-tabs"><div class="wrap-app rel">${inner}${pin}</div></div>`
}
