import {
  DEFAULT_INTERVAL_CODES,
  DEFAULT_MAIN_CENTRAL_CODES,
  DEFAULT_TWO_SITE_RULES,
  diffPhrases,
  type DrugChoice,
  type MemoCode,
  type PhraseDiffRow,
  type Phrases,
  type PhraseTemplates,
  type ProcedureDrugs,
} from '@/lib/precheck/memo'
import { fixedOf, kindKo, PLACE_LABELS, regionKo, REGIONS, SITE_FALLBACK } from './constants'

// 저장 전 비교 표의 줄(memo-settings AC-3007.5). diffPhrases(원본 이름표·memoRules 이름표) 위에서
// 코드 칸(CODEMAP.<코드>.<칸>)·지운 코드·시술별 약·부위 칸·고정 멘트를 쉬운 이름표로 바꾼다.
// 코드 칸 이름표는 AC-3006.2가 diffPhrases에 두라고 했지만 골든 phrases-engine '코드 줄'이 원본 이름표를 보아 화면에서 바꾼다(조정자 합의). 순수 함수다.
// 약 역할 깃발 셋은 '코드 · 역할' 한 줄로(clinic-profile AC-6608.5), 두 사유가 겹칠 때는 고르기 이름으로, 비운 코드 칸은 엔진 기본값으로 보인다(AC-6613.3)

const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b)
const compareText = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0)
const keysOf = (...maps: (Readonly<Record<string, unknown>> | undefined)[]) => [...new Set(maps.flatMap((map) => Object.keys(map ?? {})))].sort(compareText)

/** 약 역할 고르기(clinic-profile AC-6608.5): 'auto' = 세 깃발 없음(보험코드 성분으로), 'none' = 세 깃발 모두 false */
export type RoleChoice = 'auto' | 'steroid' | 'localAnesthetic' | 'cartilage' | 'none'
/** CODEMAP 줄의 역할 깃발(검사 CODE_KEYS에 있다). 둘 넘게 켜져 있으면 이 차례로 앞의 것이다 */
export const ROLE_FLAGS = ['steroid', 'localAnesthetic', 'cartilage'] as const
export const ROLE_OPTIONS: readonly { value: RoleChoice; label: string }[] = [
  { value: 'auto', label: '자동' },
  { value: 'steroid', label: '스테로이드' },
  { value: 'localAnesthetic', label: '마취약' },
  { value: 'cartilage', label: '연골주사' },
  { value: 'none', label: '아님' },
]
/** 코드 줄의 고른 역할: 켜진 깃발 → 그 역할, 셋 다 false → 아님, 그 밖(깃발 없음) → 자동 */
export function roleOf(entry: Partial<Record<(typeof ROLE_FLAGS)[number], unknown>> | undefined): RoleChoice {
  if (!entry) return 'auto'
  const on = ROLE_FLAGS.find((flag) => entry[flag] === true)
  if (on) return on
  return ROLE_FLAGS.every((flag) => entry[flag] === false) ? 'none' : 'auto'
}
/** 역할을 고른 코드 줄: 자동은 세 깃발을 지우고, 아님은 셋 다 false, 그 밖은 그 깃발만 true(나머지는 지운다) */
export function withRole(entry: MemoCode, role: RoleChoice): MemoCode {
  const next: MemoCode = { ...entry }
  for (const flag of ROLE_FLAGS) {
    if (role === 'none') next[flag] = false
    else if (role === flag) next[flag] = true
    else delete next[flag]
  }
  return next
}
const roleLabel = (role: RoleChoice) => ROLE_OPTIONS.find((option) => option.value === role)?.label ?? role
const isRoleFlag = (field: string) => (ROLE_FLAGS as readonly string[]).includes(field)

/** 두 사유가 겹칠 때(TPL.reasonPriority): 값 없음과 원본 기본값 'twoSite'는 같은 '2부위 사유 먼저'다(엔진이 같게 읽는다) */
export const REASON_PRIORITY_OPTIONS: readonly { value: string; label: string }[] = [
  { value: '', label: '2부위 사유 먼저' },
  { value: 'interval', label: '주사 간격 사유 먼저' },
  { value: 'both', label: '둘 다' },
]
const priorityShown = (value: unknown) => (value === undefined || value === 'twoSite' ? REASON_PRIORITY_OPTIONS[0].label : (REASON_PRIORITY_OPTIONS.find((option) => option.value === value)?.label ?? plainShown(value)))

/** 칸이 없으면 엔진이 쓰는 기본값(engineDefaults.ts): 비운 칸은 이 값으로 메모를 만든다 */
const ENGINE_DEFAULTS: Readonly<Record<string, string>> = {
  'TPL.mainCentralCodes': DEFAULT_MAIN_CENTRAL_CODES,
  'TPL.intervalCodes': DEFAULT_INTERVAL_CODES,
  'TPL.twoSiteRules': DEFAULT_TWO_SITE_RULES,
}
const tplOf = (tpl: PhraseTemplates, path: string): unknown => (tpl as Record<string, unknown>)[path.slice('TPL.'.length)]

const CODE_FIELDS: Readonly<Record<string, string>> = {
  n: '메모 이름',
  k: '구분',
  rg: '부위',
  memo: '메모 문구',
  add: '빠진 항목 자동 보충',
  cartilage: '연골주사 약',
  cartilageMemo: '연골주사 메모 문구',
  displayName: '비트 등록 이름',
  bitName: '비트 이름',
  bitKind: '비트 종류',
  bitActive: '비트에서 쓰는 코드',
  standardCode: '보험 코드',
  steroid: '스테로이드',
  localAnesthetic: '국소마취제',
  carm: 'C-arm 투시',
  injectionDrug: '주사약',
  pendingReview: '분류 확인 대기',
  templateKey: '시술 이름별 문구 이름',
}

function plainShown(value: unknown): string {
  if (value === undefined) return '(없음)'
  if (value === true) return '켬'
  if (value === false) return '끔'
  if (value === '') return '(빈 칸)'
  return typeof value === 'string' ? value : JSON.stringify(value)
}

function codeShown(field: string, value: unknown): string {
  if (value === undefined) return '(없음)'
  if (field === 'k') return kindKo(value)
  if (field === 'rg') return value === null || value === '' ? '자동' : regionKo(value)
  return plainShown(value)
}

function codeRows(before: Readonly<Record<string, MemoCode>>, after: Readonly<Record<string, MemoCode>>): PhraseDiffRow[] {
  const rows: PhraseDiffRow[] = []
  for (const code of keysOf(before, after)) {
    const a = before[code] as Record<string, unknown> | undefined
    const b = after[code] as Record<string, unknown> | undefined
    if (same(a, b)) continue
    let roleDone = false
    for (const field of keysOf(a, b)) {
      if (same(a?.[field], b?.[field])) continue
      if (isRoleFlag(field)) {
        if (roleDone) continue
        roleDone = true
        const [was, now] = [roleOf(a), roleOf(b)]
        if (was !== now) rows.push({ path: `CODEMAP.${code}.role`, label: `${code} · 역할`, before: roleLabel(was), after: roleLabel(now) })
        continue
      }
      rows.push({ path: `CODEMAP.${code}.${field}`, label: `${code} · ${CODE_FIELDS[field] ?? field}`, before: codeShown(field, a?.[field]), after: codeShown(field, b?.[field]) })
    }
  }
  return rows
}

function choiceShown(choice: DrugChoice | undefined): string {
  if (!choice) return '(안 정함)'
  if (choice.use === 'exclude') return '빼기'
  return ['넣기', choice.place ? (PLACE_LABELS[choice.place] ?? choice.place) : null, choice.label ? `표기 ${choice.label}` : null].filter(Boolean).join(' · ')
}

function drugRows(before: ProcedureDrugs, after: ProcedureDrugs): PhraseDiffRow[] {
  const rows: PhraseDiffRow[] = []
  for (const proc of keysOf(before, after)) {
    for (const drug of keysOf(before[proc], after[proc])) {
      const a = before[proc]?.[drug]
      const b = after[proc]?.[drug]
      if (!same(a, b)) rows.push({ path: `procedureDrugs.${proc}.${drug}`, label: `${proc} · ${drug}`, before: choiceShown(a), after: choiceShown(b) })
    }
  }
  return rows
}

/** 메모가 실제로 쓰는 부위 영어 표기: 칸이 있으면 그 표(없는 부위는 빈 칸), 없으면 처음 값 */
const siteOf = (tpl: PhraseTemplates, key: string) => (tpl.siteNames && typeof tpl.siteNames === 'object' ? (tpl.siteNames[key] ?? '') : SITE_FALLBACK[key])

function siteRows(before: PhraseTemplates, after: PhraseTemplates): PhraseDiffRow[] {
  return REGIONS.filter(({ key }) => siteOf(before, key) !== siteOf(after, key)).map(({ key, ko }) => ({ path: `TPL.siteNames.${key}`, label: `부위 영어 표기 · ${ko}`, before: plainShown(siteOf(before, key)), after: plainShown(siteOf(after, key)) }))
}

const fixedShown = (tpl: PhraseTemplates) =>
  fixedOf(tpl)
    .map((row) => `{${row.token}} ${row.text}${row.on === false ? ' (끔)' : ''}`)
    .join(' · ') || '(없음)'

function mapRows(path: string, labelOf: (key: string) => string, before: Readonly<Record<string, string>> | undefined, after: Readonly<Record<string, string>> | undefined): PhraseDiffRow[] {
  return keysOf(before, after)
    .filter((key) => before?.[key] !== after?.[key])
    .map((key) => ({ path: `${path}.${key}`, label: labelOf(key), before: plainShown(before?.[key]), after: plainShown(after?.[key]) }))
}

const BY_REGION = (key: string) => `부위별 문구 · ${regionKo(key)}`
const BY_PROC = (key: string) => `시술 이름별 문구 · ${key}`

/** 비교 표 줄: 바뀐 칸마다 이름·전·후. 바뀐 것이 없으면 빈 목록이다 */
export function saveDiffRows(before: Phrases, after: Phrases): PhraseDiffRow[] {
  const out: PhraseDiffRow[] = []
  const done = new Set<string>()
  const once = (group: string, rows: () => PhraseDiffRow[]) => {
    if (done.has(group)) return
    done.add(group)
    out.push(...rows())
  }
  for (const row of diffPhrases(before, after)) {
    const { path } = row
    if (path === 'CODEMAP' || path.startsWith('CODEMAP.')) once('codes', () => codeRows(before.CODEMAP, after.CODEMAP))
    else if (path === 'CODEMAP_DEL') out.push({ ...row, label: '지운 코드', before: before.CODEMAP_DEL.join(', ') || '(없음)', after: after.CODEMAP_DEL.join(', ') || '(없음)' })
    else if (path === 'procedureDrugs' || path.startsWith('procedureDrugs.')) once('drugs', () => drugRows(before.procedureDrugs, after.procedureDrugs))
    else if (path === 'TPL.siteNames' || path.startsWith('TPL.siteNames.')) once('sites', () => siteRows(before.TPL, after.TPL))
    else if (path === 'TPL.fixedPhrases' || path.startsWith('TPL.fixedPhrases.')) once('fixed', () => (fixedShown(before.TPL) === fixedShown(after.TPL) ? [] : [{ path: 'TPL.fixedPhrases', label: '고정 멘트', before: fixedShown(before.TPL), after: fixedShown(after.TPL) }]))
    else if (path === 'TPL.byRegion' || path.startsWith('TPL.byRegion.')) once('byRegion', () => mapRows('TPL.byRegion', BY_REGION, before.TPL.byRegion, after.TPL.byRegion))
    else if (path === 'TPL.byProc' || path.startsWith('TPL.byProc.')) once('byProc', () => mapRows('TPL.byProc', BY_PROC, before.TPL.byProc, after.TPL.byProc))
    else if (path === 'TPL.reasonPriority') {
      const shown = { before: priorityShown(before.TPL.reasonPriority), after: priorityShown(after.TPL.reasonPriority) }
      if (shown.before !== shown.after) out.push({ ...row, ...shown })
    } else if (Object.hasOwn(ENGINE_DEFAULTS, path)) {
      const shown = (value: unknown) => (value === undefined ? `기본값: ${ENGINE_DEFAULTS[path]}` : plainShown(value))
      out.push({ ...row, before: shown(tplOf(before.TPL, path)), after: shown(tplOf(after.TPL, path)) })
    } else out.push(row)
  }
  return out
}
