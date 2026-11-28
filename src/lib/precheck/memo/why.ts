import type { Visit } from '@/types/precheck'
import { regionOf } from './chart'
import { FIXED_FALLBACK } from './engine'
import type { MemoCode, Phrases } from './types'

// 메모 줄마다 출처 찾기(claim-learn REQ-9306, design.md 8절). 순수 함수다. 메모 글은 바꾸지 않는다(AC-9306.3) [환자 자료 구역]
// 칸 → 탭·칸 이름은 설정 화면(components/settings/HospitalPhrases.tsx TABS, phrases/ProcTab·ReasonTab·CodesTab의 label, phrases/constants.ts REGIONS)을 옮겨 적었다.
// 두 곳이 같은지는 TASK-7의 fieldPlace.test.ts가 본다

/** 설정 › 병원 문구의 탭 키(주소 ptab 값) */
export type PhraseTab = 'basic' | 'proc' | 'codes' | 'rules' | 'reason' | 'words' | 'try' | 'learn'
/** 탭 키 → 탭 이름(설정 화면 TABS 그대로, '학습'은 claim-learn이 더하는 탭) */
export const PHRASE_TAB_LABELS: Readonly<Record<PhraseTab, string>> = { basic: '기본', proc: '시술별 문구와 약', codes: '처방코드', rules: '표기 규칙', reason: '사유 문장', words: '차트 줄임말', try: '메모 시험', learn: '학습' }

/** 설정 칸 하나의 자리: 탭 키·탭 이름·칸 이름 */
export type FieldPlace = { tab: PhraseTab; tabLabel: string; label: string }
const place = (tab: PhraseTab, label: string): FieldPlace => ({ tab, tabLabel: PHRASE_TAB_LABELS[tab], label })

/** TPL 칸(주소 field 값) → 설정 화면 자리. 칸마다 이름이 바뀌는 byProc·byRegion·코드별 메모 문구는 fieldPlace가 만든다 */
export const FIELD_PLACE: Readonly<Record<string, FieldPlace>> = {
  main: place('proc', '기본 시술 문구'),
  mainCentral: place('proc', 'Central 시술 문구'),
  mainPeripheral: place('proc', 'Peripheral 시술 문구'),
  cpb: place('proc', '경부 CPB'),
  snb: place('proc', 'SNB 문구'),
  icnb: place('proc', 'ICNB'),
  ara: place('proc', '연골주사'),
  klg: place('proc', 'K-L grade'),
  iaAra: place('proc', '연골주사 포함 IA'),
  iaEtc: place('proc', '일반 IA'),
  ts: place('proc', '건초내주사'),
  tsWords: place('proc', '건초내주사로 알아볼 차트 말'),
  itv: place('reason', '주사 간격 사유'),
  ia2: place('reason', '2부위 시술 사유'),
}
/** 부위별 문구(byRegion) 칸 이름: 설정 화면 REGIONS의 한글 이름 */
const REGION_LABELS: Readonly<Record<string, string>> = { shoulder: '어깨', cervical: '목(경추)', lumbar: '허리(요추)', knee: '무릎', ankle: '발목', elbow: '팔꿈치', wrist: '손목', hand: '손', hip: '고관절', chest: '갈비뼈', foot: '발', upper: '팔(상지)' }
/** 메모 줄을 만드는 TPL 글 칸. 이 차례가 출처가 같은 점수일 때의 차례다 */
const LINE_FIELDS = ['main', 'mainCentral', 'mainPeripheral', 'cpb', 'snb', 'icnb', 'ara', 'klg', 'iaAra', 'iaEtc', 'ts', 'itv', 'ia2'] as const

/** 설정 칸 키(FIELD_PLACE 키, `byProc.{이름}`, `byRegion.{부위 키}`, `CODEMAP.{코드}.memo`)의 자리. 모르는 키면 null */
export function fieldPlace(field: string): FieldPlace | null {
  if (Object.hasOwn(FIELD_PLACE, field)) return FIELD_PLACE[field]
  const region = /^byRegion\.(.+)$/.exec(field)?.[1]
  if (region !== undefined) return Object.hasOwn(REGION_LABELS, region) ? place('proc', REGION_LABELS[region]) : null
  const proc = /^byProc\.(.+)$/.exec(field)?.[1]
  if (proc !== undefined) return place('proc', proc)
  const code = /^CODEMAP\.(.+)\.memo$/.exec(field)?.[1]
  if (code !== undefined) return place('codes', `${code} 코드별 메모 문구`)
  return null
}

/** 줄 출처: 학습 · 병원 문구 칸 · 모름 */
export type WhySource = { kind: 'learn'; id: string; name: string } | { kind: 'field'; tab: PhraseTab; tabLabel: string; field: string; label: string } | { kind: 'none' }
/** 메모 줄 하나의 출처와, 그 줄의 처방 코드·차트 줄(찾으면) */
export type WhyLine = { line: string; source: WhySource; codes: string[]; chart: string | null }

const escape = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
const named = (line: string, name: string) => new RegExp(`(^|[^A-Za-z0-9가-힣])${escape(name)}(?![A-Za-z0-9가-힣])`, 'i').test(line)

/**
 * 메모 글의 빈 줄 아닌 줄마다 출처(design.md 8절). 학습이 쓴 줄(used의 line과 같은 줄)은 그 학습이다.
 * 그 밖은 줄을 만드는 칸(TPL 글 칸 → 시술 이름별 → 부위별 → 그 진료 처방의 코드별 메모 문구)마다 틀을 만들어 줄 앞 표시를 뗀 줄 전체가 맞는 칸 가운데
 * 고정 글자가 가장 긴 칸, 같으면 앞 칸이다. 틀의 {항목}은 빈 값도 되는 아무 글(.*?)이고 고정 멘트 {항목}은 그 글, 빈칸은 \s*다.
 * 고정 글자가 없는 틀({시술}만)은 그 줄에 그 진료의 시술 이름이 있을 때만 맞는다. 못 찾으면 { kind: 'none' }.
 * codes = 그 진료 처방 가운데 이름(n·templateKey)이 줄에 든 코드, chart = 그 이름이 든 첫 차트 줄 → 줄과 같은 부위의 첫 차트 줄 → null
 */
export function explainLines(text: string, used: { id: string; name: string; line: string }[], visit: Pick<Visit, 'rx' | 'lines'>, phrases: Phrases): WhyLine[] {
  const T = phrases.TPL
  const deleted = new Set(phrases.CODEMAP_DEL)
  const rowOf = (code: string): MemoCode | null => {
    for (const key of [code, code.toUpperCase(), code.toLowerCase()]) if (!deleted.has(key) && Object.hasOwn(phrases.CODEMAP, key)) return phrases.CODEMAP[key]
    return null
  }
  const rxCodes = [...new Set(visit.rx.map((row) => String(row.code ?? '').trim()).filter(Boolean))]
  const namesOf = (row: MemoCode | null) => (row ? [row.n, row.templateKey].map((name) => String(name ?? '').trim()).filter(Boolean) : [])

  const fixed = new Map((Array.isArray(T.fixedPhrases) ? T.fixedPhrases : FIXED_FALLBACK).filter((row) => row && row.token).map((row) => [row.token, row.on === false ? '' : String(row.text ?? '')]))
  const fields: { field: string; tpl: string }[] = [
    ...LINE_FIELDS.map((field) => ({ field, tpl: T[field] })),
    ...Object.entries(T.byProc ?? {}).map(([name, tpl]) => ({ field: `byProc.${name}`, tpl })),
    ...Object.entries(T.byRegion ?? {}).filter(([key]) => Object.hasOwn(REGION_LABELS, key)).map(([key, tpl]) => ({ field: `byRegion.${key}`, tpl })),
    ...rxCodes.map((code) => ({ code, row: rowOf(code) })).filter(({ row }) => row && row.k !== 'skip' && row.memo).map(({ code, row }) => ({ field: `CODEMAP.${code}.memo`, tpl: row!.memo })),
  ].filter((row): row is { field: string; tpl: string } => typeof row.tpl === 'string' && row.tpl.trim() !== '')
  const patterns = fields.map(({ field, tpl }) => {
    let source = ''
    let count = 0
    for (const part of tpl.split(/(\{[^{}]*\})/)) {
      const token = /^\{([^{}]*)\}$/.exec(part)?.[1]
      if (token !== undefined && !fixed.has(token)) {
        source += '.*?'
        continue
      }
      const literal = token !== undefined ? fixed.get(token)! : part
      count += literal.replace(/\s+/g, '').length
      source += literal.split(/\s+/).map(escape).join('\\s*')
    }
    return { field, re: new RegExp(`^\\s*${source}\\s*$`, 'i'), count }
  })

  const mark = (T.mark == null ? '◈' : String(T.mark)).trim()
  return text
    .split('\n')
    .filter((line) => line.trim())
    .map((line) => {
      const body = mark && line.trim().startsWith(mark) ? line.trim().slice(mark.length) : line.trim()
      const codes = rxCodes.filter((code) => namesOf(rowOf(code)).some((name) => named(line, name))).map((code) => code.toUpperCase())
      const procNamed = codes.some((code) => rowOf(code)?.k === 'proc')
      const names = codes.flatMap((code) => namesOf(rowOf(code)))
      const region = regionOf(body)
      const chart = visit.lines.find((row) => names.some((name) => named(row, name))) ?? (region ? visit.lines.find((row) => regionOf(row) === region) : undefined) ?? null
      const learned = used.find((row) => row.line.trim() === line.trim())
      if (learned) return { line, source: { kind: 'learn', id: learned.id, name: learned.name }, codes, chart }
      let best: { field: string; count: number } | null = null
      for (const pattern of patterns) {
        if ((pattern.count === 0 && !procNamed) || !pattern.re.test(body)) continue
        if (!best || pattern.count > best.count) best = pattern
      }
      const at = best ? fieldPlace(best.field) : null
      const source: WhySource = best && at ? { kind: 'field', tab: at.tab, tabLabel: at.tabLabel, field: best.field, label: at.label } : { kind: 'none' }
      return { line, source, codes, chart }
    })
}
