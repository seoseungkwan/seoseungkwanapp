import { diffPhrases, type DrugChoice, type MemoCode, type PhraseDiffRow, type Phrases, type PhraseTemplates, type ProcedureDrugs } from '@/lib/precheck/memo'
import { fixedOf, kindKo, PLACE_LABELS, regionKo, REGIONS, SITE_FALLBACK } from './constants'

// 저장 전 비교 표의 줄(memo-settings AC-3007.5). diffPhrases(원본 이름표·memoRules 이름표) 위에서
// 코드 칸(CODEMAP.<코드>.<칸>)·지운 코드·시술별 약·부위 칸·고정 멘트를 쉬운 이름표로 바꾼다.
// 코드 칸 이름표는 AC-3006.2가 diffPhrases에 두라고 했지만 골든 phrases-engine '코드 줄'이 원본 이름표를 보아 화면에서 바꾼다(조정자 합의). 순수 함수다

const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b)
const compareText = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0)
const keysOf = (...maps: (Readonly<Record<string, unknown>> | undefined)[]) => [...new Set(maps.flatMap((map) => Object.keys(map ?? {})))].sort(compareText)

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
    for (const field of keysOf(a, b)) {
      if (same(a?.[field], b?.[field])) continue
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
    else out.push(row)
  }
  return out
}
