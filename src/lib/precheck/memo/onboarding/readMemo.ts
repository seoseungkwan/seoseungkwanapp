import { CARM_CHOICES, ENDING_CHOICES, MARK_CHOICES, SONO_CHOICES, type Answers, type KlgStyle, type LevelSep, type SideStyle } from './answers'

// 붙인 예전 메모 읽기(AC-6614.3). 정해 둔 값 목록에서만 고르고 메모 글은 결과에 넣지 않는다. 글은 받기만 하고 어디에도 두지 않는다 [환자 자료 구역]

/** 한 항목의 읽은 결과: 값 하나 · 'mixed'(값이 둘 이상, '섞여 있어요') · null(못 찾음) */
export type ReadResult<K extends keyof Answers> = { value: Answers[K] } | 'mixed' | null
export type MemoReading = { [K in keyof Answers]: ReadResult<K> }

/** AC-6614.3 규칙이 있는 항목. 나머지(연골주사 좌우 말·좌우 쓰는 경우·앞에 적힌 좌우)는 늘 못 찾음이다 */
export const READ_KEYS = ['sideStyle', 'carm', 'sono', 'ending', 'levelSep', 'klg', 'mark', 'lineJoin'] as const satisfies readonly (keyof Answers)[]

function verdict<V>(found: Set<V>): { value: V } | 'mixed' | null {
  if (!found.size) return null
  return found.size === 1 ? { value: [...found][0] } : 'mixed'
}

/**
 * 좌우 모양: Rt|Lt|both → Rt, RT|LT|BOTH → upper, Rt.|Lt. → dot, Bil → bil, 우측|좌측|양측 → ko.
 * 연골주사 줄은 '연골주사 좌우 말'을 따로 쓰므로 보지 않는다. Bil 모양도 한쪽은 Rt·Lt로 쓰므로 Bil이 있으면 Rt·Lt만으로는 Rt 모양이라 하지 않는다
 */
function sideStyles(lines: string[]): Set<SideStyle> {
  const found = new Set<SideStyle>()
  let single = false
  for (const line of lines) {
    if (/연골\s*주사/.test(line)) continue
    if (/우측|좌측|양측/.test(line)) found.add('ko')
    if (/\b(?:RT|LT|BOTH)\b/.test(line)) found.add('upper')
    if (/\b(?:Rt|Lt)\./.test(line)) found.add('dot')
    if (/\bBil\b/.test(line)) found.add('bil')
    if (/\bboth\b/.test(line)) found.add('Rt')
    if (/\b(?:Rt|Lt)\b(?!\.)/.test(line)) single = true
  }
  if (single && !found.has('bil')) found.add('Rt')
  return found
}

const LEVELS: [LevelSep, RegExp][] = [
  ['repeat', /\b[CTLS]\d{1,2}(?:, [CTLS]\d{1,2})+/],
  ['comma', /\b[CTLS]\d{1,2}(?:,[CTLS]?\d{1,2})+/],
  ['dash', /\b[CTLS]\d{1,2}(?:-[CTLS]?\d{1,2})+/],
]
const KLG: [KlgStyle, RegExp][] = [
  ['paren', /K-L\s*grade\s*\(\d\)\s*\/\s*\(\d\)/i],
  ['plain', /K-L\s*grade\s*\d\s*\/\s*\d/i],
  ['ko', /K-L\s*등급\s*\d\s*\/\s*\d/],
]
/** 줄 끝(또는 한 줄 이어쓰기의 쉼표 앞)의 끝맺음 낱말. 뒤에 붙은 (약)·마침표는 건너뛴다 */
const ENDING = /(?:^|\s)(시행하였음|시행함|시행)(?=\s*(?:\([^()]*\))?\s*[.。]?\s*(?:,|$))/g
/** 한 줄 이어쓰기를 알아보는 시술 말 */
const PROCEDURE = /\b(?:MBB|SNB|SSNB|SNRB|ICNB|CPB|FNB|ANB|MRU|PDNB|IA)\b|injection|block|차단|주사/i

function marks(lines: string[]): Set<string> {
  const heads = new Set<string>()
  // 사유 문장(마침표로 끝남)과 확인 표시([…])에는 엔진도 기호를 붙이지 않는다
  for (const line of lines.filter((item) => !/[.。]$/.test(item) && !item.startsWith('['))) {
    const mark = MARK_CHOICES.find((item) => line.startsWith(item))
    heads.add(mark ?? (/^[^\p{L}\p{N}\s([{]/u.test(line) ? '?' : ''))
  }
  return heads
}

/** 붙인 메모 글을 항목마다 읽는다(AC-6614.3). 결과에는 값 목록 안의 값만 있다 */
export function readMemo(text: string): MemoReading {
  const lines = String(text ?? '')
    .split(/\r?\n/)
    .map((line) => line.replace(/[ \t 　]+/g, ' ').trim())
    .filter(Boolean)
  const each = <V>(test: (line: string) => V[]): Set<V> => new Set(lines.flatMap(test))
  const choices = (list: readonly string[]) => each((line) => list.filter((choice) => line.toLowerCase().includes(choice.toLowerCase())))
  const heads = marks(lines)
  const mark = heads.size === 1 && heads.has('?') ? null : verdict(heads)
  return {
    sideStyle: verdict(sideStyles(lines)),
    cartilageSideLang: null,
    sideMode: null,
    sideSpread: null,
    carm: verdict(choices(CARM_CHOICES)),
    sono: verdict(choices(SONO_CHOICES)),
    ending: verdict(each((line) => [...line.matchAll(ENDING)].map((match) => match[1]).filter((word) => (ENDING_CHOICES as readonly string[]).includes(word)))),
    levelSep: verdict(each((line) => LEVELS.filter(([, re]) => re.test(line)).map(([key]) => key))),
    klg: verdict(each((line) => KLG.filter(([, re]) => re.test(line)).map(([key]) => key))),
    mark,
    lineJoin: lines.some((line) => line.split(/,\s+|，\s*/).filter((part) => PROCEDURE.test(part)).length >= 2) ? { value: 'oneLine' } : null,
  }
}
