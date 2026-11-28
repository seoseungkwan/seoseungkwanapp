import { applyLearned, learnLines, lineSlots, LEARN_REGIONS, regionLabel, slotWords, type AutoLearnInput, type LearnContext, type LearnDraftLine, type LineOrigin, type SlotWords } from '@/lib/precheck/memo/learn'
import type { LearnRule, LearnWhen, MemoCode, MemoVisit, Phrases } from '@/lib/precheck/memo/types'
import type { FirstLearnKind, LearnedTag, Visit, VisitMemo } from '@/types/precheck'

// 청구 메모 학습의 Worker 쪽 셈(specs/claim-learn design.md 4·5·5-1·7절) [환자 자료 구역]. 순수 함수만 있다: 메시지를 받고 보내는 것은 jobs.ts다.
// 학습은 엔진 글 위에 덧씌운다. 엔진 글·학습 글·출처는 진료마다 Worker 메모리에만 있다

/** 그 병원 문구의 학습 재료: 학습 목록·바뀌는 칸 글자·줄 모드·코드 사전 찾기 */
export type LearnSetup = { phrases: Phrases; rules: readonly LearnRule[]; words: SlotWords; lineJoin: string | undefined; codeInfo(code: string): MemoCode | null }
/**
 * 한 진료의 덧씌우기 결과. engine = 엔진 글(fullText), text·used·origins = 학습을 덧씌운 글·쓴 학습·줄 출처(쓸 수 없는 진료도 셈은 해 둔다: 학습 글로 완료했는지 알려고),
 * eligible = 학습을 메모 글에 쓰는 진료인가(완료하지 않았고 비트 메모가 없다, AC-9302.5)
 */
export type VisitLearn = { visit: MemoVisit; engine: string; text: string; used: string[]; origins: LineOrigin[]; eligible: boolean }

/** 학습 조건 처방 코드 모양(phrases.ts validCode와 같은 글자·길이, 대문자) */
const CODE_SHAPE = /^[\p{L}\p{N} ._+*(),/-]{1,40}$/u
const KIND_KEY_MAX = 120

export function learnSetup(phrases: Phrases): LearnSetup {
  const deleted = new Set(phrases.CODEMAP_DEL ?? [])
  const codemap = phrases.CODEMAP ?? {}
  return {
    phrases,
    rules: Array.isArray(phrases.learned) ? phrases.learned : [],
    words: slotWords(phrases),
    lineJoin: phrases.TPL.lineJoin,
    // 원본 cm과 같은 찾기: 글자 그대로 → 대문자 → 소문자. 지운 코드는 없는 코드다
    codeInfo(code) {
      for (const key of [code, code.toUpperCase(), code.toLowerCase()]) if (Object.hasOwn(codemap, key) && !deleted.has(key)) return codemap[key]
      return null
    },
  }
}

/** 그 진료의 처방 코드(대문자, 처방 차례, 겹침 없음): 시술(CODEMAP k proc)과 그 밖 */
export function visitCodes(visit: Visit, setup: LearnSetup): { codes: string[]; withCodes: string[] } {
  const codes: string[] = []
  const withCodes: string[] = []
  for (const line of visit.rx) {
    const code = line.code.trim().toUpperCase()
    if (!CODE_SHAPE.test(code) || codes.includes(code) || withCodes.includes(code)) continue
    ;(setup.codeInfo(line.code)?.k === 'proc' ? codes : withCodes).push(code)
  }
  return { codes, withCodes }
}

/** 그 진료의 부위 키(학습 조건으로 쓰는 키만, 나온 차례): 메모 분석의 부위 조각. 목+어깨 묶음(cx_sh)은 둘 다 */
export function visitRegions(visit: MemoVisit): string[] {
  const keys: string[] = []
  const add = (key: string) => {
    if (LEARN_REGIONS.includes(key) && !keys.includes(key)) keys.push(key)
  }
  for (const part of visit.memos) {
    if (part.rg === 'cx_sh') ['cervical', 'shoulder'].forEach(add)
    else add(part.rg)
    for (const sub of part.sub ?? []) add(sub.rg)
  }
  return keys
}

/** 저절로 학습의 조건(design.md 5-1절): 처방 코드(그 진료 시술 코드) + 부위(그 진료 부위), 나머지 칸은 비운다 */
export function learnWhenOf(visit: MemoVisit, setup: LearnSetup): LearnWhen {
  return { codes: visitCodes(visit, setup).codes, regions: visitRegions(visit), chartWords: [], withCodes: [], doctors: [] }
}

/** 덧씌울 때 보는 그 진료의 값(design.md 4절). codes는 그 진료의 모든 처방 코드 */
export function learnContext(visit: MemoVisit, setup: LearnSetup): LearnContext {
  return { codes: new Set(visit.rx.map((line) => line.code.toUpperCase())), regions: new Set(visitRegions(visit)), chartText: visit.lines.join('\n'), doctors: visit.doctors ?? [], words: setup.words }
}

/** 학습을 메모 글에 쓰는 진료인가(AC-9302.5): 완료(복사·입력)하지 않았고 비트 메모가 없다 */
export const learnEligible = (visit: Visit, finished: ReadonlySet<string> | undefined) => !finished?.has(visit.key) && !visit.memosInBit.some((memo) => memo.trim() !== '')

/** 한 진료의 덧씌우기(design.md 4절). 학습이 없으면 엔진 글 그대로다 */
export function overlayVisit(visit: MemoVisit, engine: string, setup: LearnSetup, eligible: boolean): VisitLearn {
  const result = applyLearned(engine, setup.rules, learnContext(visit, setup), setup.lineJoin, 'origins')
  return { visit, engine, text: result.text, used: result.used, origins: result.origins, eligible }
}

/** 이 메모에 학습이 쓰였나: 학습이 쓰인 글이 그대로 보이고 사람이 고친 글이 아니다(AC-9302.6·AC-9318.1) */
export const usesLearning = (learn: VisitLearn | undefined, shown: string, drafted: boolean): learn is VisitLearn => !!learn && learn.used.length > 0 && !drafted && shown === learn.text

/** 쓰인 학습의 꼬리표(쓴 차례). 목록에 없는 번호는 뺀다 */
export function learnedTags(used: readonly string[], rules: readonly LearnRule[]): LearnedTag[] {
  return used.flatMap((id) => {
    const rule = rules.find((item) => item.id === id)
    return rule ? [{ id, name: rule.name, left: rule.left }] : []
  })
}

/**
 * 보이던 글의 줄 출처(design.md 5-1절 '보이던 글'): 학습 글 그대로면 그 출처, 아니면 줄마다 학습 글·엔진 글의 같은 줄을 찾는다.
 * 못 찾은 줄(사람이 전에 고친 줄)은 바탕 엔진 줄이 없다
 */
export function shownOrigins(shown: string, learn: VisitLearn): LineOrigin[] {
  if (shown === learn.text) return learn.origins
  const pools: LineOrigin[][] = [learn.origins, learn.engine.split('\n').map((line) => ({ line, engine: line, rule: null }))]
  const cursors = pools.map(() => 0)
  return shown.split('\n').map((line) => {
    const key = line.trim()
    for (const [p, pool] of pools.entries()) {
      for (let i = cursors[p]; i < pool.length; i++) {
        if (pool[i].line.trim() !== key) continue
        cursors[p] = i + 1
        return { ...pool[i], line }
      }
    }
    return { line, engine: null, rule: null }
  })
}

/** 그 진료의 환자 이름·차트번호(앞 0을 뺀 것도): 학습에 저장하면 안 되는 글(AC-9301.5) */
export function forbiddenOf(visit: Visit): string[] {
  return [...new Set([visit.name, visit.chart, visit.chart.replace(/^0+(?=\d)/, '')].map((value) => value.trim()).filter((value) => value.length >= 2))]
}

/** autoLearn·learnLines 재료 */
export function learnInput(learn: VisitLearn, shown: string, edited: string, setup: LearnSetup): AutoLearnInput {
  return {
    shown,
    origins: shownOrigins(shown, learn),
    edited,
    when: learnWhenOf(learn.visit, setup),
    slotsOf: (line) => lineSlots(line, setup.words),
    words: setup.words,
    phrases: setup.phrases,
    rules: setup.rules,
    forbidden: forbiddenOf(learn.visit),
  }
}

/** 학습 창의 줄 차이(AC-9301.2): 저절로 학습과 같은 셈 */
export function draftLines(learn: VisitLearn, shown: string, edited: string, setup: LearnSetup): LearnDraftLine[] {
  return learnLines(learnInput(learn, shown, edited, setup))
}

/** 처음 학습 종류 열쇠(design.md 7절): 시술 코드(정렬) + '|' + 부위 키(정렬), 120자까지 */
export function kindKey(codes: readonly string[], regions: readonly string[]): string {
  return `${[...codes].sort().join('+')}|${[...regions].sort().join(',')}`.slice(0, KIND_KEY_MAX)
}

/**
 * 처음 학습 종류(AC-9305.1·AC-9305.3): 고른 기간에서 메모가 필요한 진료를 종류 열쇠로 묶어 진료 수 많은 차례(같으면 열쇠 차례).
 * total = 메모가 필요한 진료 수. 시술 코드도 부위도 없는 진료는 종류가 없다(덮은 비율의 분모에만 든다). done = 병원 문구 learnKinds에 있다.
 * 예시 진료는 완료하지 않은 진료가 먼저이고 차트 줄·처방·지금 메모를 싣는다
 */
export function firstLearnKinds(rows: readonly VisitMemo[], visitOf: ReadonlyMap<string, MemoVisit>, setup: LearnSetup, finished: ReadonlySet<string>): { total: number; kinds: FirstLearnKind[] } {
  const known = new Set(Array.isArray(setup.phrases.learnKinds) ? setup.phrases.learnKinds : [])
  const groups = new Map<string, { codes: string[]; regions: string[]; rows: VisitMemo[] }>()
  let total = 0
  for (const row of rows) {
    const visit = visitOf.get(row.key)
    if (!row.hasMemo || !visit) continue
    total++
    const codes = [...visitCodes(visit, setup).codes].sort()
    const regions = [...visitRegions(visit)].sort()
    if (!codes.length && !regions.length) continue
    const key = kindKey(codes, regions)
    const group = groups.get(key) ?? { codes, regions, rows: [] }
    group.rows.push(row)
    groups.set(key, group)
  }
  const kinds = [...groups].map(([key, group]): FirstLearnKind => {
    const sample = group.rows.find((row) => !finished.has(row.key)) ?? group.rows[0]
    const visit = visitOf.get(sample.key)!
    // 이름은 코드 이름 차례(열쇠는 코드 차례): 같은 종류면 늘 같은 이름이다
    const names = group.codes.map((code) => setup.codeInfo(code)?.n || code).sort()
    return {
      key,
      name: [names.join(' + '), group.regions.map(regionLabel).join(', ')].filter(Boolean).join(' · '),
      count: group.rows.length,
      done: known.has(key),
      example: { visitKey: sample.key, chart: [...visit.lines], rx: visit.rx.map((line) => ({ code: line.code, name: line.name, qty: line.qty })), memo: sample.text },
    }
  })
  kinds.sort((a, b) => b.count - a.count || (a.key < b.key ? -1 : a.key > b.key ? 1 : 0))
  return { total, kinds }
}
