import { describe, expect, it } from 'vitest'
import type { RxLine, Visit } from '@/types/precheck'
import { createMemoEngine, fullText, ourClinicPhrases, prepareVisit, unfinished, validatePhrases, type DrugChoice, type Phrases, type ProcedureDrugs } from './index'

// 약 규칙(design.md 19-4). 원본과 일부러 다른 곳이 있어 표마다 시험을 적는다. 이 표가 clinic-memo-plan.md의 옛 글보다 앞선다

const NO_TABLES = {}
const INCLUDE: DrugChoice = { use: 'include', place: 'afterProc' }
const EXCLUDE: DrugChoice = { use: 'exclude' }
const AFTER_ENDING: DrugChoice = { use: 'include', place: 'afterEnding' }
const OWN_LINE: DrugChoice = { use: 'include', place: 'ownLine' }
const rx = (code: string, qty: number | null = 1): RxLine => ({ code, name: code, qty, benefit: true, pay: '급여' })
const rxNoPay = (code: string): RxLine => ({ code, name: code, qty: 1, benefit: false, pay: '비급여' })
const visit = (lines: string[], rows: RxLine[]): Visit => ({ key: 't1', chart: '900001', date: '2026-10-12', month: '2026-10', name: '가상환자01', lines, hints: lines.map(() => null), rx: rows, dx: [], memosInBit: [] })
function phrases(procedureDrugs: ProcedureDrugs, patch: Record<string, unknown> = {}): Phrases {
  const value = ourClinicPhrases()
  value.procedureDrugs = procedureDrugs
  Object.assign(value.TPL, patch)
  return value
}
const text = (lines: string[], rows: RxLine[], procedureDrugs: ProcedureDrugs, patch: Record<string, unknown> = {}) => {
  const p = phrases(procedureDrugs, patch)
  return fullText(prepareVisit(visit(lines, rows), p, NO_TABLES), p, NO_TABLES)
}

const SHOULDER_IA = ['Rt shoulder pain', 'Rt shoulder IA']

describe('AC-014.9 시술 종류가 하나인 진료', () => {
  it('AC-014.9: 넣기: 틀의 {약제} 자리에 넣는다(자리 afterProc)', () => {
    expect(text(SHOULDER_IA, [rx('KK090'), rx('A21')], { KK090: { 트리암: INCLUDE } })).toBe('◈IA injection of - shoulder(트리암)')
  })

  it('AC-014.9: 넣기: 표기는 설정의 label을 쓴다', () => {
    expect(text(SHOULDER_IA, [rx('KK090'), rx('A21')], { KK090: { 트리암: { ...INCLUDE, label: 'triam' } } })).toBe('◈IA injection of - shoulder(triam)')
  })

  it('AC-014.9: 넣기 afterProc: 틀에 {약제}가 없으면 시술 바로 뒤에 넣는다', () => {
    const lines = ['Rt shoulder pain', 'Rt SSNB']
    expect(text(lines, [rx('LA247'), rx('A21')], { LA247: { 트리암: INCLUDE } }, { mainPeripheral: '{Sono} {시술} {시행함}' })).toBe('◈Sono guide 하에 SSNB(트리암) 시행함')
  })

  it('AC-014.5 AC-014.9: 같은 시술 줄이 둘이면 약 자리를 잡아 다시 써도 한 줄이다', () => {
    const lines = ['MBB L4,5 Rt', 'MBB L4,5 Rt']
    expect(text(lines, [rx('LA358'), rx('A21')], { LA358: { 트리암: INCLUDE } })).toBe('◈MBB L4,5 Rt(트리암)')
  })

  it('AC-014.9: 넣기 afterProc: 약 자리는 첫 시술 줄 하나뿐이다', () => {
    const lines = ['MBB L4,5 Rt', 'MBB L1,2 Lt']
    expect(text(lines, [rx('LA358'), rx('A21')], { LA358: { 트리암: INCLUDE } })).toBe('◈MBB L4,5 Rt(트리암)\n◈MBB L1,2 Lt')
  })

  it('AC-014.9: 넣기 afterEnding: 끝맺음 뒤에 넣는다', () => {
    const lines = ['Rt shoulder pain', 'Rt SSNB']
    expect(text(lines, [rx('LA247'), rx('A21')], { LA247: { 트리암: { use: 'include', place: 'afterEnding' } } }, { mainPeripheral: '{Sono} {시술} {시행함}' })).toBe('◈Sono guide 하에 SSNB 시행함 (트리암)')
  })

  it('AC-014.9: 넣기 ownLine: 따로 한 줄로 넣는다', () => {
    const lines = ['Rt shoulder pain', 'Rt SSNB']
    expect(text(lines, [rx('LA247'), rx('A21')], { LA247: { 트리암: { use: 'include', place: 'ownLine' } } })).toBe('◈SSNB\n◈약: 트리암')
  })

  it('AC-014.9: afterEnding·ownLine은 마지막 시술 줄에 붙는다(첫 시술 줄이 아니다)', () => {
    const lines = ['MBB L4,5 Rt', 'MBB L1,2 Lt']
    expect(text(lines, [rx('LA358'), rx('A21')], { LA358: { 트리암: AFTER_ENDING } })).toBe('◈MBB L4,5 Rt\n◈MBB L1,2 Lt (트리암)')
    expect(text(lines, [rx('LA358'), rx('A21')], { LA358: { 트리암: OWN_LINE } })).toBe('◈MBB L4,5 Rt\n◈MBB L1,2 Lt\n◈약: 트리암')
  })

  it('AC-014.9: afterEnding·ownLine은 시술 줄이 아닌 줄에 붙지 않는다(메모 코드 줄·K-L grade 줄)', () => {
    const shoulder = ['Rt shoulder pain', 'Rt SSNB']
    const rows = [rx('LA247'), rx('HA280'), rx('A21')]
    expect(text(shoulder, rows, { LA247: { 트리암: AFTER_ENDING } })).toBe('◈SSNB (트리암)\n◈관절조영 시행')
    expect(text(shoulder, rows, { LA247: { 트리암: OWN_LINE } })).toBe('◈SSNB\n◈약: 트리암\n◈관절조영 시행')
    const knee = ['Rt knee OA', 'KLG 3/3', '아라간 Rt knee 2차']
    expect(text(knee, [rx('KK090'), rx('A49')], { KK090: { 아라간: AFTER_ENDING } })).toBe('◈우측 슬관절 강내 연골주사 2회차 (아라간)\n◈K-L grade (3)/(3)')
    expect(text(knee, [rx('KK090'), rx('A49')], { KK090: { 아라간: OWN_LINE } })).toBe('◈우측 슬관절 강내 연골주사 2회차\n◈약: 아라간\n◈K-L grade (3)/(3)')
  })

  it('AC-014.9: afterEnding·ownLine은 시술 줄이 없으면 쓰지 않는다', () => {
    const rows = [rxNoPay('LA247'), rx('HA280'), rx('A21')]
    expect(text(['관절조영'], rows, { LA247: { 트리암: AFTER_ENDING } })).toBe('◈관절조영 시행')
    expect(text(['관절조영'], rows, { LA247: { 트리암: OWN_LINE } })).toBe('◈관절조영 시행')
  })

  it('AC-014.9: 빼기: 뺀다', () => {
    expect(text(SHOULDER_IA, [rx('KK090'), rx('A21')], { KK090: { 트리암: EXCLUDE } })).toBe('◈IA injection of - shoulder')
  })

  it('AC-014.9: 아직 안 정한 약은 넣거나 빼지 않고 [약 확인: 약 이름]을 남긴다', () => {
    const out = text(SHOULDER_IA, [rx('KK090'), rx('A21')], { KK090: {} })
    expect(out).toBe('◈IA injection of - shoulder\n[약 확인: 트리암]')
    expect(unfinished(out)).toBe(true)
  })

  it('AC-014.9: 다른 시술에만 정한 약도 그 시술에서는 아직 안 정한 약이다', () => {
    expect(text(SHOULDER_IA, [rx('KK090'), rx('A21')], { LA247: { 트리암: EXCLUDE } })).toBe('◈IA injection of - shoulder\n[약 확인: 트리암]')
  })

  it('AC-014.9: 국소마취제 빼기·넣기·설정에 없음(이름이나 역할로 짐작하지 않는다)', () => {
    const rows = [rx('KK090'), rx('A15')]
    expect(text(SHOULDER_IA, rows, { KK090: { 리도카인: EXCLUDE } })).toBe('◈IA injection of - shoulder')
    expect(text(SHOULDER_IA, rows, { KK090: { 리도카인: INCLUDE } })).toBe('◈IA injection of - shoulder(리도카인)')
    expect(text(SHOULDER_IA, rows, { KK090: {} })).toBe('◈IA injection of - shoulder\n[약 확인: 리도카인]')
  })

  it('AC-014.9: 설정에 없는 새 시술에도 마취제를 짐작하지 않는다', () => {
    const lines = ['Rt shoulder pain', 'Rt SSNB']
    expect(text(lines, [rx('LA247'), rx('A15')], {})).toBe('◈SSNB\n[약 확인: 리도카인]')
  })

  it('AC-014.9: 연골주사약 넣기: 연골주사 줄을 쓴다', () => {
    const lines = ['Rt knee OA', '아라간 Rt knee 2차']
    expect(text(lines, [rx('KK090'), rx('A49')], { KK090: { 아라간: INCLUDE } })).toBe('◈우측 슬관절 강내 연골주사 2회차')
  })

  it('AC-014.9: 연골주사약 넣기 ownLine·afterEnding: 줄에 더해 약 이름을 고른 자리에 쓴다', () => {
    const lines = ['Rt knee OA', '아라간 Rt knee 2차']
    expect(text(lines, [rx('KK090'), rx('A49')], { KK090: { 아라간: { use: 'include', place: 'ownLine' } } })).toBe('◈우측 슬관절 강내 연골주사 2회차\n◈약: 아라간')
    expect(text(lines, [rx('KK090'), rx('A49')], { KK090: { 아라간: { use: 'include', place: 'afterEnding' } } })).toBe('◈우측 슬관절 강내 연골주사 2회차 (아라간)')
  })

  it('AC-014.9: 연골주사약 빼기: 연골주사 줄은 시술 줄이라 쓴다(빼기는 약 이름만 뺀다)', () => {
    const lines = ['Rt knee OA', '아라간 Rt knee 2차']
    const out = text(lines, [rx('KK090'), rx('A49')], { KK090: { 아라간: EXCLUDE } })
    expect(out).toBe('◈우측 슬관절 강내 연골주사 2회차')
    expect(unfinished(out)).toBe(false)
    expect(text(['Rt knee OA', 'KLG 3/3', '아라간 Rt knee 2차'], [rx('KK090'), rx('A49')], { KK090: { 아라간: EXCLUDE } })).toBe('◈우측 슬관절 강내 연골주사 2회차\n◈K-L grade (3)/(3)')
  })

  it('AC-014.9: 연골주사약 빼기: 약마다 고른 틀(cartilageMemo)의 {약제}도 비운다', () => {
    const p = phrases({ KK090: { 아라간: EXCLUDE } })
    p.CODEMAP.A49 = { ...p.CODEMAP.A49, cartilageMemo: '{좌우} knee {회차}회차 {약제}' }
    const out = fullText(prepareVisit(visit(['Rt knee OA', '아라간 Rt knee 2차'], [rx('KK090'), rx('A49')]), p, NO_TABLES), p, NO_TABLES)
    expect(out).toBe('◈우측 knee 2회차')
    expect(unfinished(out)).toBe(false)
  })

  it('AC-014.9: 연골주사약 빼기: 공통 틀(TPL.ara)의 {약제}도 비운다', () => {
    const out = text(['Rt knee OA', '히알 Rt knee 2차'], [rx('KK090'), rx('A49')], { KK090: { 아라간: EXCLUDE } }, { ara: '{좌우} knee {회차}회차 {약제}' })
    expect(out).toBe('◈우측 knee 2회차')
    expect(unfinished(out)).toBe(false)
  })

  it('AC-014.9: 연골주사약이 섞인 날(빼기 하나·안 정함 하나): 차트의 연골주사 줄을 쓰고 안 정한 약만 [약 확인]이다', () => {
    const p = phrases({ KK090: { 아라간: EXCLUDE } })
    p.CODEMAP.X9 = { n: '가상연골약', k: 'drug', rg: null, cartilage: true }
    const lines = ['Rt knee OA', '아라간 Rt knee 2차']
    for (const rows of [[rx('KK090'), rx('A49'), rx('X9')], [rx('KK090'), rx('X9'), rx('A49')]]) {
      const out = fullText(prepareVisit(visit(lines, rows), p, NO_TABLES), p, NO_TABLES)
      expect(out).toBe('◈우측 슬관절 강내 연골주사 2회차\n[약 확인: 가상연골약]')
      expect(unfinished(out)).toBe(true)
    }
  })

  it('AC-014.9: 연골주사약 둘(빼기 하나·넣기 하나)에 차트 줄이 어느 약 것인지 모르면: [좌우 확인]·[회차 확인]으로 약마다 쓰고 빼기인 약 이름만 비운다', () => {
    const cartilageMemo = '{좌우} knee {회차}회차 {약제}'
    const p = phrases({ KK090: { 아라간: EXCLUDE, 가상연골약: INCLUDE } })
    p.CODEMAP.A49 = { ...p.CODEMAP.A49, cartilage: true, cartilageMemo }
    p.CODEMAP.X9 = { n: '가상연골약', k: 'drug', rg: null, cartilage: true, cartilageMemo }
    const out = fullText(prepareVisit(visit(['Rt knee OA', '연골주사 Rt knee 2차'], [rx('KK090'), rx('A49'), rx('X9')]), p, NO_TABLES), p, NO_TABLES)
    expect(out).toBe('◈[좌우 확인] knee [회차 확인]\n◈[좌우 확인] knee [회차 확인] 가상연골약')
  })

  it('AC-014.9 AC-014.13: 연골주사약을 안 정해 줄을 쓰지 않아도 처방 메모(rx)는 원본처럼 있다', () => {
    // Worker(memoViews)처럼 엔진 하나로 분석과 글 쓰기를 함께 한다: 분석 중에 약 설정을 읽으면 그 계획이 글 쓸 때까지 남는다
    // 비급여 IA는 처방 보충 줄이 없어 연골주사 줄이 있는지(raw)만으로 처방 메모가 생긴다
    const engine = createMemoEngine(phrases({ KK090: {} }), NO_TABLES)
    for (const rows of [[rx('KK090', 2), rx('A49', 2)], [rxNoPay('KK090'), rxNoPay('A49')]]) {
      const v = engine.prepareVisit(visit(['Both knee OA'], rows))
      expect(v.memos.map((m) => m.rg)).toEqual(['rx'])
      expect(engine.fullText(v)).toBe('[약 확인: 아라간]')
    }
  })

  it('AC-014.9: 연골주사약 설정에 없음: 줄을 쓰지 않고 [약 확인]을 남긴다', () => {
    const lines = ['Rt knee OA', '아라간 Rt knee 2차']
    expect(text(lines, [rx('KK090'), rx('A49')], { KK090: {} })).toBe('[약 확인: 아라간]')
  })

  it('AC-014.9: 처방에 연골주사약이 없으면 안 정한 약이 없으니 차트의 연골주사 줄을 그대로 쓴다', () => {
    expect(text(['Rt knee OA', '아라간 Rt knee 2차'], [rx('KK090')], { KK090: {} })).toBe('◈우측 슬관절 강내 연골주사 2회차')
  })

  it('AC-014.9: 차트 줄 없이 처방으로 만드는 연골주사 줄도 같다', () => {
    const lines = ['Both knee OA']
    expect(text(lines, [rx('KK090', 2), rx('A49', 2)], { KK090: { 아라간: EXCLUDE } })).toBe('◈양측 슬관절 강내 연골주사 [회차 확인]')
    expect(text(lines, [rx('KK090', 2), rx('A49', 2)], { KK090: {} })).toBe('[약 확인: 아라간]')
    expect(text(lines, [rx('KK090', 2), rx('A49', 2)], { KK090: { 아라간: INCLUDE } })).toBe('◈양측 슬관절 강내 연골주사 [회차 확인]')
  })

  it('AC-014.9: 약 이름이 같은 줄이 여럿이면 표시는 한 번이다', () => {
    expect(text(SHOULDER_IA, [rx('KK090'), rx('A21'), rx('A21')], { KK090: {} })).toBe('◈IA injection of - shoulder\n[약 확인: 트리암]')
  })

  it('AC-014.9: 처방 코드 표에 없는 코드는 약으로 보지 않는다', () => {
    expect(text(SHOULDER_IA, [rx('KK090'), rx('X1')], { KK090: {} })).toBe('◈IA injection of - shoulder')
  })

  it('AC-014.9: 사유 문장은 표시 뒤에 한 줄 띄워 온다', () => {
    const lines = ['Rt shoulder pain', 'Rt SSNB IA']
    const out = text(lines, [rx('LA247'), rx('KK090'), rx('A15')], { LA247: { 리도카인: EXCLUDE } })
    expect(out.split('\n\n').at(-1)).toContain('당일 주사치료 2부위')
    expect(out).toContain('[약 확인: 리도카인]')
  })
})

describe('AC-014.7 연골주사약을 알아보는 길(병원 코드 글자를 쓰지 않는다, 골든 knownDiffs)', () => {
  const lines = ['Rt knee OA', 'Rt knee IA']
  const withCode = (code: string, row: Phrases['CODEMAP'][string]) => {
    const p = phrases({ KK090: { 가상약: INCLUDE, 아라간: INCLUDE } })
    p.CODEMAP[code] = row
    return p
  }

  it('AC-014.7: 설정의 cartilage 칸이 이름보다 앞선다', () => {
    const own = withCode('X9', { n: '가상약', k: 'drug', rg: null, cartilage: true })
    expect(fullText(prepareVisit(visit(lines, [rx('KK090'), rx('X9')]), own, NO_TABLES), own, NO_TABLES)).toContain('연골주사')
    const off = withCode('A49', { n: '아라간', k: 'drug', rg: 'knee', cartilage: false })
    expect(fullText(prepareVisit(visit(lines, [rx('KK090'), rx('A49')]), off, NO_TABLES), off, NO_TABLES)).toContain('IA injection of')
  })

  it('AC-014.7: 코드 글자만으로는 연골주사약으로 보지 않는다(이름이 다르면 일반 약이다)', () => {
    const renamed = withCode('A49', { n: '가상약', k: 'drug', rg: null })
    expect(fullText(prepareVisit(visit(lines, [rx('KK090'), rx('A49')]), renamed, NO_TABLES), renamed, NO_TABLES)).toContain('IA injection of')
  })
})

describe('AC-014.10 시술 종류가 둘 이상인 진료', () => {
  const lines = ['Rt shoulder pain', 'Rt SSNB IA']
  const rows = [rx('LA247'), rx('KK090'), rx('A21')]
  const REASON = '환자 스케쥴상 주1회 내원 밖에 안되어 당일 주사치료 2부위 시행함. 환자 증상 호소 심해 치료 요하는 상태임'

  it('AC-014.10: 한 시술만 넣기여도 그 시술에 넣지 않고 [약 확인]이다', () => {
    const out = text(lines, rows, { KK090: { 트리암: INCLUDE }, LA247: { 트리암: EXCLUDE } })
    expect(out).toBe(`◈SSNB\n\n◈IA injection of - shoulder\n[약 확인: 트리암]\n\n${REASON}`)
  })

  it('AC-014.10: 한 시술이라도 안 정했으면 [약 확인]이다', () => {
    const out = text(lines, rows, { KK090: { 트리암: EXCLUDE } })
    expect(out).toBe(`◈SSNB\n\n◈IA injection of - shoulder\n[약 확인: 트리암]\n\n${REASON}`)
  })

  it('AC-014.10: 모든 시술에서 빼기일 때만 뺀다', () => {
    const out = text(lines, rows, { KK090: { 트리암: EXCLUDE }, LA247: { 트리암: EXCLUDE } })
    expect(out).toBe(`◈SSNB\n\n◈IA injection of - shoulder\n\n${REASON}`)
  })

  const ara = ['Rt knee OA', '아라간 Rt knee 2차', 'Rt SSNB']
  const araRows = [rx('KK090'), rx('A49'), rx('LA247')]

  it('AC-014.10: 연골주사약 한 시술만 넣기: 연골주사 줄을 쓰지 않고 [약 확인]이다', () => {
    const out = text(ara, araRows, { KK090: { 아라간: INCLUDE }, LA247: { 아라간: EXCLUDE } })
    expect(out).toContain('[약 확인: 아라간]')
    expect(out).not.toContain('연골주사')
  })

  it('AC-014.10: 연골주사약 한 시술이라도 안 정함: [약 확인]이다', () => {
    const out = text(ara, araRows, { KK090: { 아라간: EXCLUDE } })
    expect(out).toContain('[약 확인: 아라간]')
    expect(out).not.toContain('연골주사')
  })

  it('AC-014.10: 연골주사약 모든 시술에서 빼기: 약 이름만 빼고 연골주사 줄은 쓴다', () => {
    const out = text(ara, araRows, { KK090: { 아라간: EXCLUDE }, LA247: { 아라간: EXCLUDE } })
    expect(out).toBe(`◈우측 슬관절 강내 연골주사 2회차\n\n◈SSNB\n\n${REASON}`)
  })

  it('AC-014.10: 국소마취제도 같다', () => {
    const lido = [rx('LA247'), rx('KK090'), rx('A15')]
    expect(text(lines, lido, { KK090: { 리도카인: INCLUDE }, LA247: { 리도카인: EXCLUDE } })).toContain('[약 확인: 리도카인]')
    expect(text(lines, lido, { KK090: { 리도카인: EXCLUDE }, LA247: { 리도카인: EXCLUDE } })).not.toContain('리도카인')
  })

  it('AC-014.10: 시술 종류는 코드로 센다(같은 코드 두 줄은 한 종류)', () => {
    expect(text(['Rt shoulder pain', 'Rt shoulder IA'], [rx('KK090'), rx('KK090'), rx('A21')], { KK090: { 트리암: INCLUDE } })).toBe('◈IA injection of - shoulder(트리암)')
  })
})

describe('AC-014.14 시술 종류가 0인 진료', () => {
  it('AC-014.14: 부위 메모는 있고 시술 종류가 0이면 약 글도 표시도 없다', () => {
    const p = phrases({})
    const v = prepareVisit(visit(['어깨 통증'], [rx('MM410'), rx('A21')]), p, NO_TABLES)
    expect(v.memos.length).toBeGreaterThan(0)
    expect(fullText(v, p, NO_TABLES)).toBe('◈어깨 통증 및 관절운동 제한 지속되어 수압팽창술 시행.')
  })
})

describe('AC-014.5 AC-014.9 한 줄 문장 틀(sentence)을 쓰는 설정', () => {
  const SENTENCE = { sentence: '{시술목록} {시행함}' }

  it('AC-014.9: 문장 틀이어도 안 정한 약은 [약 확인]이 남는다', () => {
    const out = text(SHOULDER_IA, [rx('KK090'), rx('A21')], { KK090: {} }, SENTENCE)
    expect(out).toBe('IA injection of - shoulder 시행함\n[약 확인: 트리암]')
    expect(unfinished(out)).toBe(true)
  })

  it('AC-014.9: 문장 틀에 한 줄로 이어 붙여도 [약 확인]이 남는다', () => {
    const out = text(SHOULDER_IA, [rx('KK090'), rx('A21')], { KK090: {} }, { ...SENTENCE, lineJoin: 'oneLine' })
    expect(out).toBe('IA injection of - shoulder 시행함 [약 확인: 트리암]')
    expect(unfinished(out)).toBe(true)
  })

  it('AC-014.10: 문장 틀이어도 시술 종류가 둘 이상인 날의 [약 확인]이 남는다', () => {
    const out = text(['Rt shoulder pain', 'Rt SSNB IA'], [rx('LA247'), rx('KK090'), rx('A21')], { KK090: { 트리암: INCLUDE }, LA247: { 트리암: EXCLUDE } }, SENTENCE)
    expect(out).toContain('[약 확인: 트리암]')
    expect(unfinished(out)).toBe(true)
  })
})

describe('AC-014.10 시술 종류는 원본 procKeys로 센다', () => {
  const withCodes = (procedureDrugs: ProcedureDrugs, codes: Phrases['CODEMAP']) => {
    const p = phrases(procedureDrugs)
    Object.assign(p.CODEMAP, codes)
    return p
  }
  const LOCAL = { 'LOCAL-L': { n: 'LOCALBLOCK', k: 'proc', rg: null, standardCode: 'LA358', pendingReview: false, add: true } } as Phrases['CODEMAP']
  const PENDING = { LA247: { n: 'SSNB', k: 'proc', rg: 'shoulder', pendingReview: true } } as Phrases['CODEMAP']
  const memo = (p: Phrases, lines: string[], rows: RxLine[]) => fullText(prepareVisit(visit(lines, rows), p, NO_TABLES), p, NO_TABLES)

  it('AC-014.10: 코드가 달라도 표준 코드가 같으면 한 종류이고 그 표준 코드의 약 설정을 쓴다', () => {
    const p = withCodes({ LA358: { 트리암: INCLUDE } }, LOCAL)
    const rows = [rx('LA358'), rx('LOCAL-L'), rx('A21')]
    expect([...createMemoEngine(p, NO_TABLES).procKeys(visit([], rows))]).toEqual(['LA358'])
    expect(memo(p, ['MBB L4,5 Rt'], rows)).toBe('◈MBB L4,5 Rt(트리암)\n◈LOCALBLOCK')
  })

  it('AC-014.9: 병원 코드 하나만 있어도 표준 코드의 약 설정을 쓴다(코드 글자로 찾지 않는다)', () => {
    const rows = [rx('LOCAL-L'), rx('A21')]
    expect(memo(withCodes({ LA358: { 트리암: EXCLUDE } }, LOCAL), ['MBB L4,5 Rt'], rows)).toBe('◈LOCALBLOCK')
    expect(memo(withCodes({ 'LOCAL-L': { 트리암: EXCLUDE } }, LOCAL), ['MBB L4,5 Rt'], rows)).toContain('[약 확인: 트리암]')
  })

  it('AC-014.10: 검토를 기다리는 시술은 세지 않는다', () => {
    const p = withCodes({ KK090: { 트리암: INCLUDE } }, PENDING)
    const rows = [rx('LA247'), rx('KK090'), rx('A21')]
    expect([...createMemoEngine(p, NO_TABLES).procKeys(visit([], rows))]).toEqual(['KK090'])
    expect(memo(p, SHOULDER_IA, rows)).toBe('◈SSNB\n\n◈IA injection of - shoulder(트리암)')
  })

  it('AC-014.14: 검토를 기다리는 시술뿐이면 시술 종류가 0이라 약 글도 표시도 없다', () => {
    expect(memo(withCodes({}, PENDING), ['Rt shoulder pain', 'Rt SSNB'], [rx('LA247'), rx('A21')])).toBe('◈SSNB')
  })
})

describe('AC-014.12 약 이름에 줄바꿈이 있는 설정', () => {
  // 원본 validate는 CODEMAP.n의 줄바꿈을 받는다(AC-014.3). 그대로 두고 표시를 늘 한 줄로 쓴다. 정규식이 줄을 넘지 않으므로 줄이 나뉘면 확인 표시로 보이지 않는다
  const withName = (procedureDrugs: ProcedureDrugs, name: string, patch: Record<string, unknown> = {}) => {
    const p = phrases(procedureDrugs, patch)
    p.CODEMAP.X9 = { n: name, k: 'drug', rg: null }
    return p
  }
  const memo = (p: Phrases, lines: string[], rows: RxLine[]) => fullText(prepareVisit(visit(lines, rows), p, NO_TABLES), p, NO_TABLES)

  it.each([
    ['가운데 줄바꿈', '새\n약', '[약 확인: 새 약]'],
    ['윈도우 줄바꿈', '새\r\n약', '[약 확인: 새 약]'],
    ['앞뒤 줄바꿈', '\n새약\n', '[약 확인: 새약]'],
    ['줄바꿈과 칸이 섞임', '새 \n\n 약', '[약 확인: 새 약]'],
  ])('AC-014.12: %s: 검사를 지나도 표시는 한 줄이고 unfinished가 참이다', (_name, name, marker) => {
    const p = withName({ KK090: {} }, name)
    expect(validatePhrases(p).ok).toBe(true)
    const out = memo(p, SHOULDER_IA, [rx('KK090'), rx('X9')])
    expect(out).toBe(`◈IA injection of - shoulder\n${marker}`)
    expect(unfinished(out)).toBe(true)
  })

  it('AC-014.10: 시술 종류가 둘 이상인 날도 표시는 한 줄이고 unfinished가 참이다', () => {
    const out = memo(withName({ KK090: {}, LA247: {} }, '새\n약'), ['Rt shoulder pain', 'Rt SSNB IA'], [rx('LA247'), rx('KK090'), rx('X9')])
    expect(out).toContain('[약 확인: 새 약]')
    expect(unfinished(out)).toBe(true)
  })

  it('AC-014.12: 한 줄 잇기·문장 틀에서도 표시가 끊기지 않는다', () => {
    const rows = [rx('KK090'), rx('X9')]
    for (const patch of [{ lineJoin: 'oneLine' }, { sentence: '{시술목록} {시행함}' }]) {
      const out = memo(withName({ KK090: {} }, '새\n약', patch), SHOULDER_IA, rows)
      expect(out).toContain('[약 확인: 새 약]')
      expect(unfinished(out)).toBe(true)
    }
  })

  it('AC-014.9: 표시만 한 줄로 쓴다. 약 설정은 코드 표의 이름 그대로 찾는다', () => {
    const out = memo(withName({ KK090: { '새\n약': EXCLUDE } }, '새\n약'), SHOULDER_IA, [rx('KK090'), rx('X9')])
    expect(out).toBe('◈IA injection of - shoulder')
  })
})

describe('AC-014.5 부위 메모가 없는 진료는 원본처럼 빈 글이다', () => {
  const memo = (procedureDrugs: ProcedureDrugs, rows: RxLine[]) => {
    const p = phrases(procedureDrugs)
    const v = prepareVisit(visit(['물리치료만'], rows), p, NO_TABLES)
    return { memos: v.memos, out: fullText(v, p, NO_TABLES) }
  }

  it('AC-014.5: 비급여 시술에 안 정한 약: 쓸 줄이 없어 [약 확인]도 없다', () => {
    expect(memo({ LA247: {} }, [rxNoPay('LA247'), rx('A21')])).toEqual({ memos: [], out: '' })
  })

  it('AC-014.5: 시술 종류가 둘이어도 같다', () => {
    expect(memo({ LA247: { 트리암: INCLUDE }, LA358: { 트리암: EXCLUDE } }, [rxNoPay('LA247'), rxNoPay('LA358'), rx('A21')])).toEqual({ memos: [], out: '' })
  })

  it('AC-014.9: 쓸 줄이 하나라도 있으면(처방 메모) 안 정한 약의 [약 확인]은 그대로 남는다', () => {
    const p = phrases({ LA247: {} })
    const v = prepareVisit(visit(['관절조영'], [rxNoPay('LA247'), rx('HA280'), rx('A21')]), p, NO_TABLES)
    expect(v.memos.map((m) => m.rg)).toEqual(['rx'])
    expect(fullText(v, p, NO_TABLES)).toBe('◈관절조영 시행\n[약 확인: 트리암]')
  })
})
