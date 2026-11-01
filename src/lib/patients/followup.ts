import { addDays, compareYmd, diffDays, isYmd, weekdayOf } from '@/lib/analytics/dates'
import { PatientsSourceError } from './sourceError'
import type {
  ChartVisit,
  FuNext,
  PasteOptions,
  PhoneBook,
  PhoneToken,
  PhoneTokens,
  PreparedPhones,
  PreparedSchedule,
  ScheduleOptions,
  VisitFilter,
  VisitKind,
} from '@/types/patients'

export type { ChartVisit, FuNext } from '@/types/patients'

// 원본 양지바른(seoseungkwan/shared@2a1069b) assets/revisit_schedule.html의 F/U 계산을 옮겼다.
// 줄은 원본 그대로 두고 바꾼 것은 셋뿐이다:
//  - 원본의 Date 값은 'YYYY-MM-DD' 글자로, 날짜 더하기·요일은 lib/analytics/dates.ts로(한국 날짜, 결과는 원본과 같다)
//  - 원본이 화면 칸·전역 값(document.getElementById·phoneMap·visits)에서 읽던 것은 인자로 받는다
//  - 해가 네 자리를 넘거나 NaN인 날은 날짜 없음으로 친다(dayAfter)
// 원본과 같은지는 goldenFollowup.test.ts가 원본 결과(fixtures/patients/golden)와 견준다. 원본에 없는 표현을 새로 읽지 않는다.

// ── 정규식(원본 그대로) ───────────────────────────────────

const WD: Record<string, number> = { 월: 0, 화: 1, 수: 2, 목: 3, 금: 4, 토: 5, 일: 6 }
const YOIL = ['월', '화', '수', '목', '금', '토', '일']
const COND_RE =
  /아프면|아파지면|호전\s*더디면|호전\s*없으면|호전\s*안되면|불편하면|불편해지면|안되면|심하면|악화되면|필요시|증상\s*있으면|재발하면/
const FU_RE = /재내원|f\s*\/\s*u|ㄹ\/u|주사\s*합|차\s*주사|차주사|dressing|드레싱|s\/o|오세요|옵니다|xr\s*f/i
const FU_DATE_RE = /\d+\s*주\s*(?:일\s*)?뒤|일\s*뒤|다음\s*주|담주|내일|모레|\d+\s*월\s*[초중말]/
const INJ_RE = /MBB|C-MBB|FNB|SNB|SSNB|ANB|DNA|epi|아라간|\bIA\b|root|크라이오|ESWT|주사|\bIM\b|TPI|prolo|시노비안|봉합|suture|캐스트|splint|부목/i
const INJ_EX_RE = /주사\s*합|차주사|주사\s*고려|주사합니다|재내원|f\/u|맞아왔|맞곤|하지\s*마/i
// 적어 둔 날짜: 10.17 · 10/19 · 10월 17일
const WRITTEN_RE = /(?<![0-9A-Za-z./])(\d{1,2})\s*(?:[./]\s*(\d{1,2})(?![0-9./])|월\s*(\d{1,2})\s*일)/g
const SCORE_BEFORE_RE = /(?:VAS|NRS|pain|통증|점수)\s*[:=]?\s*$/i

// 아라간(연골주사): 1차 → 1주 뒤 2차, 2차 → 1주 뒤 3차. 3차는 마지막이라 잡지 않는다
const ARAGAN_RE = /아라간|아르간|artrogen/i
const ARAGAN_LAST = 3

// 부위(의학용어·약어 → 한글). 위 규칙이 먼저 나온다. 원본은 /gi + lastIndex=0으로 썼다(g 없이 test와 같다)
const SITE_RULES: readonly (readonly [RegExp, string])[] = [
  // 척추
  [/\bC[\s-]?(?:spine|sp|MBB|root|TFESI|ESI|IL)\b|\bC[1-7]\b|경추|목\s*디스크|cervical/i, '목'],
  [/\bT[\s-]?(?:spine|sp|MBB|root)\b|흉추|thoracic/i, '등'],
  [/\bL[\s-]?(?:spine|sp|MBB|root|TFESI|ESI|IL)\b|\bL[1-5]\b|\bL\/S\b|요추|허리|lumbar|\bLBP\b/i, '허리'],
  [/\bSIJ\b|\bSI\s*joint\b|sacroiliac|천장관절/i, '엉치'],
  [/미골|coccyx|꼬리뼈/i, '꼬리뼈'],
  // 상지
  [/shoulder|어깨|견관절|오십견|회전근개|rotator\s*cuff|\bSSNB\b|subacromial|\bSASD\b|\bAC\s*joint\b|adhesive\s*capsulitis|impingement/i, '어깨'],
  [/elbow|주관절|팔꿈치|epicondyl|외상과|내상과|테니스\s*엘보|골프\s*엘보/i, '팔꿈치'],
  [/wrist|손목|수근관|carpal|\bCTS\b|de\s*quervain|드퀘르벵|\bTFCC\b/i, '손목'],
  [/finger|손가락|수지|방아쇠|trigger\s*fin|thumb|엄지|\bMCP\b|\bPIP\b|\bDIP\b|손등|손바닥/i, '손가락'],
  // 하지
  [/\bhip\b|고관절|서혜부|groin|골반|pelvi/i, '골반'],
  [/knee|무릎|슬관절|슬개|patell|반월상|meniscus|\bACL\b|\bPCL\b|\bMCL\b|\bLCL\b/i, '무릎'],
  [/ankle|발목|족관절|\bATFL\b|\bCFL\b/i, '발목'],
  [/\bfoot\b|족저|plantar|발바닥|족부|\bMTP\b|무지외반|hallux|중족/i, '발'],
  [/heel|발뒤꿈치|종골|calcanea/i, '발뒤꿈치'],
  [/achilles|아킬레스/i, '아킬레스건'],
  [/calf|종아리|gastroc|비복근/i, '종아리'],
  [/thigh|대퇴|허벅지|hamstring|햄스트링/i, '허벅지'],
  [/정강이|tibia|shin/i, '정강이'],
  // 기타
  [/\bTMJ\b|턱관절/i, '턱'],
  [/\brib\b|늑골|갈비/i, '갈비뼈'],
  // 치료·약제로 알 수 있는 것
  [/아라간|아르간|artrogen/i, '연골'],
]

// 주사 / F/U: 이번에 무엇을 했는지가 아니라 다음에 왜 오는지(지시 문구)로 나눈다
const INJECT_RE = /주사|아라간|아르간|시노비안|히루안|연골|MBB|FNB|SNB|SSNB|ANB|\bDNA\b|\bepi\b|\bIA\b|TPI|prolo|블록|block/i
const ROUND_RE = /(^|[^회])\d\s*차/
const NOT_INJ_RE = /도수|물리치료|재활|ESWT|충격파|dressing|드레싱|주사\s*(는)?\s*(안|하지|말|없이)/i

// ── 날짜 ────────────────────────────────────────────────

const pad = (n: number, width = 2) => String(n).padStart(width, '0')
const dowMon = (ymd: string) => weekdayOf(ymd) - 1 // 월=0
const fmtY = (ymd: string) => `${ymd} (${YOIL[dowMon(ymd)]})`

// 진료 기록은 자유 글이라 '500000주 뒤'도 들어온다. 원본은 11609-06-18 (목) · NaN-NaN-NaN (undefined)을 찍지만
// 지어낸 날짜를 보이지 않고 줄 하나로 명단 전체가 멈추지도 않게, 쓸 수 없는 날은 null(날짜 없음)로 돌려준다(골든 knownDiffs)
function dayAfter(ymd: string, n: number): string | null {
  if (!Number.isInteger(n)) return null // 숫자가 너무 커서 무한대
  const day = addDays(ymd, n)
  return isYmd(day) ? day : null
}

// 원본 new Date(y, m-1, d)와 같은 날(0~99년은 1900년대, 넘친 날은 다음 달로). 한국은 서머타임이 없어 UTC 계산과 같다
function civilDate(year: number, month: number, day: number): string {
  const d = new Date(Date.UTC(year, month - 1, day))
  return `${pad(d.getUTCFullYear(), 4)}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`
}

// 엑셀 일련번호 → 날짜·시각. 원본에 들어 있는 SheetJS 0.18.5 SSF.parse_date_code(1900 날짜 체계)와 같은 계산
function excelDateCode(v: number): { y: number; m: number; d: number; H: number; M: number; S: number } | null {
  if (v > 2958465 || v < 0) return null
  let date = v | 0
  let time = Math.floor(86400 * (v - date))
  let u = 86400 * (v - date) - time
  if (Math.abs(u) < 1e-6) u = 0
  if (u > 0.9999) {
    if (++time === 86400) {
      time = 0
      ++date
    }
  }
  let ymd: [number, number, number]
  if (date === 60) ymd = [1900, 2, 29] // 엑셀(로터스)의 없는 날
  else if (date === 0) ymd = [1900, 1, 0]
  else {
    if (date > 60) --date
    const day = addDays('1899-12-31', date)
    ymd = [Number(day.slice(0, 4)), Number(day.slice(5, 7)), Number(day.slice(8, 10))]
  }
  const S = time % 60
  time = Math.floor(time / 60)
  return { y: ymd[0], m: ymd[1], d: ymd[2], H: Math.floor(time / 60), M: time % 60, S }
}

// 비트·엑셀 날짜 칸 → 'YYYYMMDD'(원본 그대로). YYYYMMDD[HHmm[ss]] · YYYY-MM-DD[ 시각] · 엑셀 일련번호
export function dateKey(raw: unknown): string | null {
  const value = String(raw ?? '').trim()
  let key = ''
  const compact = value.match(/^(\d{8})(?:(\d{2})(\d{2})(\d{2})?)?(?:\.0+)?$/)
  if (compact) {
    if (compact[2] !== undefined && (+compact[2] > 23 || +compact[3] > 59 || +(compact[4] || 0) > 59)) return null
    key = compact[1]
  } else if (/^\d{4}[-/.]\d{1,2}[-/.]\d{1,2}(?:[ T].*)?$/.test(value)) {
    if (/[ T]/.test(value)) {
      const time = value.match(/[ T](\d{1,2}):(\d{2})(?::(\d{2})(?:\.\d{1,3})?)?$/)
      if (!time || +time[1] > 23 || +time[2] > 59 || +(time[3] || 0) > 59) return null
    }
    const match = value.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})/)!
    key = match[1] + match[2].padStart(2, '0') + match[3].padStart(2, '0')
  } else if (typeof raw === 'number' && Number.isFinite(raw) && raw > 0 && raw < 100000) {
    const date = excelDateCode(raw)
    if (date) key = pad(date.y, 4) + pad(date.m) + pad(date.d)
  }
  if (!/^\d{8}$/.test(key)) return null
  const iso = `${key.slice(0, 4)}-${key.slice(4, 6)}-${key.slice(6, 8)}`
  const date = new Date(`${iso}T00:00:00Z`)
  return !isNaN(date.getTime()) && date.toISOString().slice(0, 10) === iso ? key : null
}

// 기록 시각 'YYYY-MM-DDTHH:mm:ss'. 시각이 없으면 ''
export function recordedStamp(raw: unknown): string {
  const key = dateKey(raw)
  if (!key) return ''
  const value = String(raw ?? '').trim()
  let hour = ''
  let minute = ''
  let second = '00'
  const compact = value.match(/^\d{8}(\d{2})(\d{2})(\d{2})?(?:\.0+)?$/)
  const iso = value.match(/^\d{4}[-/.]\d{1,2}[-/.]\d{1,2}[ T](\d{1,2}):(\d{2})(?::(\d{2})(?:\.\d{1,3})?)?$/)
  const m = compact || iso
  if (m) {
    hour = m[1].padStart(2, '0')
    minute = m[2]
    second = m[3] || '00'
  } else if (typeof raw === 'number' && raw > 0 && raw < 100000 && raw % 1) {
    const d = excelDateCode(raw)
    if (d) {
      hour = pad(d.H)
      minute = pad(d.M)
      second = pad(d.S)
    }
  }
  if (!hour || +hour > 23 || +minute > 59 || +second > 59) return ''
  return `${key.slice(0, 4)}-${key.slice(4, 6)}-${key.slice(6, 8)}T${hour}:${minute}:${second}`
}

// ── F/U 날짜 읽기 ─────────────────────────────────────────

// 적어 둔 날짜(10.17 · 10/19 · 10월 17일): 진료일부터 120일 안의 실제 날짜만. VAS 7/10 같은 점수는 날짜가 아니다
export function writtenDate(visitDate: string, month: number, day: number, before: string): string | null {
  if (SCORE_BEFORE_RE.test(before)) return null
  if (month < 1 || month > 12 || day < 1 || day > 31) return null
  const year = Number(visitDate.slice(0, 4))
  for (const y of [year, year + 1]) {
    const ymd = `${pad(y, 4)}-${pad(month)}-${pad(day)}`
    if (!isYmd(ymd)) return null // 없는 날(2/30). 원본도 다음 해를 보지 않고 멈춘다. 다음 해가 다섯 자리여도 여기서 없음이 된다(원본은 그 날짜)
    const diff = diffDays(visitDate, ymd)
    if (diff >= 0 && diff <= 120) return ymd
  }
  return null
}

// 그 날의 지시 하나(먼저 오는 날짜 말). 날짜를 못 준 말(dayAfter가 null)은 안 맞은 것처럼 다음 말로 넘어간다
function instructionDate(visitDate: string, t: string): { date: string | null; label: string | null } {
  const weeks = t.match(/(\d+)\s*주\s*(?:일\s*)?뒤/) // 10주·12주도
  const near =
    (/일주일?\s*뒤/.test(t) ? dayAfter(visitDate, 7) : null) ??
    (weeks ? dayAfter(visitDate, 7 * Number(weeks[1])) : null) ??
    (/내일/.test(t) ? dayAfter(visitDate, 1) : null) ??
    (/모레/.test(t) ? dayAfter(visitDate, 2) : null)
  if (near) return { date: near, label: null }

  const cands: [number, string][] = []
  const m2 = t.match(/(다음\s*주|담주)\s*([월화수목금토일])/)
  const nextMon = m2 && dayAfter(visitDate, 7 - dowMon(visitDate))
  const d2 = m2 && nextMon && dayAfter(nextMon, WD[m2[2]])
  if (d2) cands.push([m2.index!, d2])
  const m3 = t.match(/([월화수목금토일])요일/)
  if (m3 && (!d2 || m3.index! < m2!.index!)) {
    let delta = (WD[m3[1]] - dowMon(visitDate) + 7) % 7
    if (delta === 0) delta = 7
    const d3 = dayAfter(visitDate, delta)
    if (d3) cands.push([m3.index!, d3])
  }
  for (const m4 of t.matchAll(WRITTEN_RE)) {
    const d4 = writtenDate(visitDate, Number(m4[1]), Number(m4[2] || m4[3]), t.slice(0, m4.index))
    if (d4) cands.push([m4.index!, d4])
  }
  if (cands.length) {
    cands.sort((a, b) => a[0] - b[0])
    return { date: cands[0][1], label: null }
  }
  const days = t.match(/(\d+)\s*일\s*뒤/)
  const d5 = days && dayAfter(visitDate, Number(days[1]))
  if (d5) return { date: d5, label: null }
  const month = t.match(/(\d+)\s*월\s*([초중말])/)
  if (month) return { date: null, label: `${month[1]}월 ${month[2]}` }
  if (/추후|필요시/.test(t)) return { date: null, label: '미정' }
  return { date: null, label: null }
}

export function parseFU(visitDate: string, lines: readonly string[]): FuNext {
  for (const raw of lines) {
    const t = String(raw).trim()
    if (!t) continue
    if (!(FU_RE.test(t) || FU_DATE_RE.test(t))) continue
    const cond = COND_RE.test(t)
    const { date, label } = instructionDate(visitDate, t)
    if (date === null && label === null) continue
    return { dateStr: label ?? fmtY(date!), sortDate: date, kind: cond ? '조건부' : '예정', evidence: t }
  }
  const ar = aragan(visitDate, lines)
  if (ar) return ar
  for (const raw of lines) {
    const t = String(raw).trim()
    if (COND_RE.test(t) && /재내원|오세요/.test(t)) return { dateStr: '미정', sortDate: null, kind: '조건부', evidence: t }
  }
  return { dateStr: '', sortDate: null, kind: '', evidence: '' }
}

// 날짜 지시가 없을 때 아라간 회차로 다음 날짜(+7일). 원본 반환 모양 그대로(없으면 null)
export function aragan(visitDate: string, lines: readonly string[]): FuNext | null {
  let round = 0
  let src = ''
  for (const raw of lines) {
    const t = String(raw).trim()
    if (!t || !ARAGAN_RE.test(t)) continue
    const m = t.match(/([1-9])\s*차/)
    if (!m) continue
    const n = Number(m[1])
    if (n > round) {
      round = n
      src = t
    }
  }
  if (!round || round >= ARAGAN_LAST) return null
  const d = dayAfter(visitDate, 7)
  if (!d) return null
  return { dateStr: fmtY(d), sortDate: d, kind: '예정', evidence: `${src} → 1주뒤 ${round + 1}차주사 (자동)` }
}

export function extractTx(lines: readonly string[]): string {
  const out: string[] = []
  for (const raw of lines) {
    const t = String(raw).trim()
    if (t && INJ_RE.test(t) && !INJ_EX_RE.test(t)) out.push(t)
    if (out.length >= 3) break
  }
  return out.join(' / ')
}

export function extractSite(lines: readonly string[]): string {
  const found: string[] = []
  for (const raw of lines) {
    const t = String(raw)
    if (!t.trim()) continue
    for (const [re, ko] of SITE_RULES) if (re.test(t) && !found.includes(ko)) found.push(ko)
  }
  return found.slice(0, 3).join(' · ')
}

export function visitKind(v: { next: FuNext }): VisitKind {
  const ev = (v.next && v.next.evidence) || ''
  if (!ev) return 'F/U'
  if (INJECT_RE.test(ev)) return NOT_INJ_RE.test(ev) && !/주사|아라간/.test(ev) ? 'F/U' : '주사'
  return ROUND_RE.test(ev) && !NOT_INJ_RE.test(ev) ? '주사' : 'F/U'
}

// ── 83 표(증상) → 내원 ─────────────────────────────────────

// 차트번호 표기 통일: 엑셀이 123을 "123.0"으로 주는 경우. 앞자리 0은 그대로 둔다
const normChart = (raw: unknown) => String(raw ?? '').trim().replace(/\.0+$/, '')
// 앞자리 0을 뗀 차트번호도 같은 사람으로 찾는다
function chartKeys(chart: string): string[] {
  const keys = [chart]
  const stripped = chart.replace(/^0+/, '')
  if (stripped && stripped !== chart) keys.push(stripped)
  return keys
}
const headerKey = (value: unknown) => String(value ?? '').replace(/\s/g, '')

// 비트 83 끝의 건수만 있는 총계 줄(【 총 계 】 · 1,295건)
function isChartSummaryRow(row: readonly unknown[], chartColumn: number): boolean {
  return (
    chartColumn > 0 &&
    String(row[0] ?? '').replace(/\s/g, '') === '【총계】' &&
    /^\d+(?:,\d{3})*건$/.test(String(row[chartColumn] ?? '').replace(/\s/g, '')) &&
    row.every((value, index) => index === 0 || index === chartColumn || String(value ?? '').trim() === '')
  )
}

// 머리줄(20줄 안). 칸 이름은 빈칸을 빼고 '포함'으로 찾는다. 필수 칸이 둘이면 멈춘다
function headerFor(rows: readonly (readonly unknown[])[], required: readonly string[]) {
  for (let i = 0; i < Math.min(rows.length, 20); i++) {
    const head = rows[i].map(headerKey)
    if (required.every((key) => head.some((cell) => cell.includes(key)))) {
      if (required.some((key) => head.filter((cell) => cell.includes(key)).length !== 1)) {
        throw new PatientsSourceError('header-duplicate')
      }
      return { index: i, col: (key: string) => head.findIndex((cell) => cell.includes(key)) }
    }
  }
  throw new PatientsSourceError('header-missing')
}

// 내원번호·차트번호로 묶고 증상 줄을 이어 붙인다. 날짜 → 내원번호 순서, 차트번호별 마지막 내원
export function prepareSchedule(rows: readonly (readonly unknown[])[]): PreparedSchedule {
  const h = headerFor(rows, ['차트번호', '환자명', '증상', '기록날짜'])
  const iVisit = h.col('내원번호')
  const iChart = h.col('차트번호')
  const iName = h.col('환자명')
  const iSym = h.col('증상')
  const iDate = h.col('기록날짜')
  type Group = Omit<ChartVisit, 'next' | 'tx' | 'site'>
  const groups = new Map<string, Group>()
  const identity = new Map<string, string>()
  for (const row of rows.slice(h.index + 1)) {
    const name = String(row[iName] ?? '').trim()
    const chart = normChart(row[iChart])
    const sym = String(row[iSym] ?? '').trim()
    if (!name && !chart && !sym) continue
    if (isChartSummaryRow(row, iChart)) continue
    const day = dateKey(row[iDate])
    if (!name || !chart || !day) throw new PatientsSourceError('row-unreadable')
    const visitNo = iVisit >= 0 ? String(row[iVisit] ?? '').trim().replace(/\.0$/, '') : `${chart}_${day}`
    if (!visitNo) throw new PatientsSourceError('visit-number-empty')
    const previous = identity.get(visitNo)
    const identityKey = JSON.stringify([chart, day, name])
    if (previous && previous !== identityKey) throw new PatientsSourceError('visit-conflict')
    identity.set(visitNo, identityKey)
    const key = `${visitNo}|${chart}`
    // 원본은 selectWorkbook이 붙인 row.nmRecordedAt을 먼저 본다. 표 줄(JSON 배열)에는 없어 기록날짜 칸에서 바로 읽는다
    const stamp = recordedStamp(row[iDate])
    const group = groups.get(key)
    if (!group) {
      const date = civilDate(+day.slice(0, 4), +day.slice(4, 6), +day.slice(6, 8))
      groups.set(key, { date, recordedAt: stamp, visitNo, chart, name, lines: sym ? [sym] : [] })
      continue
    }
    if (stamp > group.recordedAt) group.recordedAt = stamp
    if (sym) group.lines.push(sym)
  }
  const sorted = [...groups.values()].sort(
    (a, b) => compareYmd(a.date, b.date) || a.visitNo.localeCompare(b.visitNo, undefined, { numeric: true }),
  )
  if (!sorted.length) throw new PatientsSourceError('no-visits')
  const latest: Record<string, ChartVisit> = Object.create(null)
  const visits = sorted.map((g): ChartVisit => {
    const visit = { ...g, next: parseFU(g.date, g.lines), tx: extractTx(g.lines), site: extractSite(g.lines) }
    latest[visit.chart] = visit
    return visit
  })
  return { visits, latest }
}

// ── 47 표(전화) ──────────────────────────────────────────

// 환자 연락처 칸 이름만(팩스·전화번호 확인일 같은 칸은 아니다)
export function phoneColumn(header: unknown): boolean {
  const key = headerKey(header)
  if (/fax|팩스/i.test(key)) return false
  return /^(?:보호자)?(?:휴대폰(?:번호)?|휴대전화(?:번호)?|핸드폰(?:번호)?|이동전화(?:번호)?|연락처|전화번호)(?:[12]|\([12]\))?$/.test(key)
}

const PHONE_RE =
  /(?<![\d+*xX-])(?:\+[1-9]\d{6,14}|\+[1-9]\d{0,2}(?:[- \t]\d{1,4}){1,3}[- \t]\d{3,4}|02[- \t]?\d{3,4}[- \t]?\d{4}|0[13-9]\d[- \t]?\d{3,4}[- \t]?\d{4})(?![\d*xX]|-\d)/g

// 한 칸의 번호들. 주석 숫자('(보호자 2)')는 번호에 붙이지 않는다. 번호 밖에 숫자·가림 글자가 남으면 invalid
export function phoneTokens(raw: unknown): PhoneTokens {
  const values: PhoneToken[] = []
  let invalid = false
  const source = String(raw ?? '').replace(/\([^()]*[A-Za-z가-힣][^()]*\)/g, ' ')
  for (const text of source
    .split(/[/,;·|\r\n]|\s{2,}/)
    .map((s) => s.trim())
    .filter(Boolean)) {
    let found = false
    const rest = text.replace(PHONE_RE, (value) => {
      const number = value.replace(/[- \t]/g, '')
      if (number.startsWith('+') && !/^\+[1-9]\d{6,14}$/.test(number)) return value
      values.push({ number, raw: value })
      found = true
      return ' '
    })
    if (!found || /[\d*●○□]/.test(rest)) invalid = true
  }
  return { values, invalid: invalid || !values.length }
}

// 차트번호 → 번호. 번호가 하나인 차트만 map에 넣는다(여럿이면 고르지 않는다). 같은 차트에 다른 번호면 멈춘다
export function preparePhones(rows: readonly (readonly unknown[])[], allowMissing = false): PreparedPhones {
  const h = headerFor(rows, ['차트번호'])
  const iChart = h.col('차트번호')
  const columns = rows[h.index]
    .map((value, index) => ({ index, label: String(value ?? '').trim(), key: headerKey(value) }))
    .filter((column) => phoneColumn(column.key))
  const map: Record<string, string> = Object.create(null)
  if (!columns.length) {
    if (!allowMissing) throw new PatientsSourceError('phone-column-missing')
    return { map, loaded: false, count: 0, missing: true }
  }
  if (new Set(columns.map((column) => column.key)).size !== columns.length) throw new PatientsSourceError('phone-column-duplicate')
  const contacts: Record<string, number> = Object.create(null) // 차트번호 → 번호 수(원본 contacts 목록의 길이)
  const identities = new Map<string, string>()
  for (const row of rows.slice(h.index + 1)) {
    const chart = normChart(row[iChart])
    if (!chart || chart === '0') continue
    if (!(chart in contacts)) contacts[chart] = 0
    const rowContacts: PhoneToken[] = []
    for (const { index } of columns) {
      const raw = String(row[index] ?? '').trim()
      if (!raw) continue
      for (const value of phoneTokens(raw).values) {
        if (!rowContacts.some((item) => item.number === value.number)) rowContacts.push(value)
      }
    }
    if (!rowContacts.length) continue
    const keys = chartKeys(chart)
    const signature = JSON.stringify(rowContacts.map((item) => item.number).sort())
    if (keys.some((key) => identities.has(key) && identities.get(key) !== signature)) throw new PatientsSourceError('phone-conflict')
    keys.forEach((key) => identities.set(key, signature))
    if (!contacts[chart]) contacts[chart] = rowContacts.length
    if (rowContacts.length === 1 && !map[chart]) {
      map[chart] = rowContacts[0].raw
      keys.forEach((key) => {
        if (!map[key]) map[key] = map[chart]
      })
    }
  }
  const count = Object.values(contacts).filter((n) => n > 0).length
  return { map, loaded: true, count, missing: false }
}

// 그대로 → 앞자리 0 뗀 값 순으로 찾는다
export function phoneOf(map: Readonly<Record<string, string>>, chart: string): string {
  for (const key of chartKeys(chart)) if (map[key]) return map[key]
  return ''
}

// ── 명단 ────────────────────────────────────────────────

// 자료의 마지막 진료일. 이 날부터의 예정을 보인다(원본은 자료가 없으면 오늘이었다 — 자료가 없으면 명단도 없어 '')
export function baseDate(visits: readonly ChartVisit[]): string {
  return visits.length ? visits[visits.length - 1].date : ''
}

// 내원 예정: 날짜가 잡힌 지시만, 날짜 → 차트번호 순서
export function scheduleRows(latest: Readonly<Record<string, ChartVisit>>, o: ScheduleOptions): ChartVisit[] {
  return Object.values(latest)
    .filter((v) => v.next.sortDate)
    .filter((v) => (o.includeCond ? true : v.next.kind === '예정'))
    .filter((v) => (o.includePast ? true : v.next.sortDate! >= o.base))
    .sort(
      (a, b) =>
        compareYmd(a.next.sortDate!, b.next.sortDate!) || a.chart.localeCompare(b.chart, undefined, { numeric: true }),
    )
}

// 날짜 미정: 지시 글은 있는데 날짜가 안 잡힌 것(미정 · 9월 초 · 10월 말), 진료일 순서
export function undecidedRows(latest: Readonly<Record<string, ChartVisit>>): ChartVisit[] {
  return Object.values(latest)
    .filter((v) => v.next.dateStr && !v.next.sortDate)
    .sort((a, b) => compareYmd(a.date, b.date))
}

const compactDay = (ymd: string | undefined) => (ymd ?? '').replace(/-/g, '')

// 구분(주사/F/U)·기간 거르기. 기간은 useDate일 때만 보고, 날짜가 없는 줄은 기간이 있으면 빠진다
export function passFilters(v: ChartVisit, f: VisitFilter, useDate: boolean): boolean {
  if (f.kind && visitKind(v) !== f.kind) return false
  if (useDate) {
    const from = compactDay(f.from)
    const to = compactDay(f.to)
    const d = v.next && v.next.sortDate ? compactDay(v.next.sortDate) : ''
    if (from && (!d || d < from)) return false
    if (to && (!d || d > to)) return false
  }
  return true
}

// 붙여넣기 4칸 명단: 이름 · 전화 · 이름 · (주사면 부위 / 그 밖에는 fu).
// list는 scheduleRows 결과를 화면의 구분으로 거른 것(passFilters(v, f, false))이다. 여기서는 원본처럼
// 전화 자료가 있으면 번호 없는 사람을 빼고, 기간으로 거르고, 하루 안에서 주사 먼저·날짜가 바뀌면 빈 줄을 넣는다
export function pasteRows(list: readonly ChartVisit[], phones: PhoneBook, o: PasteOptions): string[][] {
  const from = compactDay(o.from)
  const to = compactDay(o.to)
  const byDay = new Map<string, ChartVisit[]>()
  for (const v of list) {
    const d = v.next.sortDate
    if (!d) continue // scheduleRows 줄은 늘 날짜가 있다
    if (phones.loaded && !phoneOf(phones.map, v.chart).trim()) continue
    const day = compactDay(d)
    if ((from && day < from) || (to && day > to)) continue
    if (!byDay.has(d)) byDay.set(d, [])
    byDay.get(d)!.push(v)
  }
  const out: string[][] = []
  const line = (v: ChartVisit, last: string) => [v.name, phoneOf(phones.map, v.chart), v.name, last]
  for (const [d, arr] of byDay) {
    if (out.length) out.push(['', '', '', ''])
    if (o.withDate) out.push([`${d} (${YOIL[dowMon(d)]}) — ${arr.length}명`, '', '', ''])
    arr.filter((v) => visitKind(v) === '주사').forEach((v) => out.push(line(v, v.site || '')))
    arr.filter((v) => visitKind(v) !== '주사').forEach((v) => out.push(line(v, 'fu')))
  }
  return out
}
