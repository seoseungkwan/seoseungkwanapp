import { describe, expect, it } from 'vitest'
import type { RxLine, Visit } from '@/types/precheck'
import { createMemoEngine, fullText, ourClinicPhrases, prepareVisit, type MemoCode, type Phrases } from './index'

// 모든 주사·시술 부위는 확실할 때만(claim-learn REQ-9319, design.md 9-1절). 차트 글·수량은 지어낸 값이다

const NO_TABLES = {}
const rx = (code: string, qty: number | null = 1): RxLine => ({ code, name: code, qty, benefit: true, pay: '급여' })
const visit = (lines: string[], rows: RxLine[]): Visit => ({ key: 't1', chart: '900001', date: '2026-10-12', month: '2026-10', name: '가상환자01', lines, hints: lines.map(() => null), rx: rows, dx: [], memosInBit: [] })
const memo = (lines: string[], rows: RxLine[], p: Phrases = ourClinicPhrases()) => fullText(prepareVisit(visit(lines, rows), p, NO_TABLES), p, NO_TABLES)
const holes = (lines: string[], rows: RxLine[], p: Phrases = ourClinicPhrases()) => createMemoEngine(p, NO_TABLES).siteChoices(visit(lines, rows))
/** 글에서 그 말이 든 줄 하나 */
const lineWith = (out: string, word: string) => out.split('\n').filter((line) => line.includes(word))
const iaSide = () => {
  const p = ourClinicPhrases()
  p.memoRules = { ...p.memoRules, iaSide: true }
  return p
}
/** 병원 문구에서 {부위}를 쓰는 시술 줄(지어낸 코드) */
const withSiteCode = () => {
  const p = ourClinicPhrases()
  p.CODEMAP.X9001 = { n: '시술엑스', k: 'note', rg: null, memo: '{부위} 시술엑스 시행' } as MemoCode
  return p
}

describe('REQ-9319 관절강 주사(KK090) 부위', () => {
  it("AC-9319.1: 수량 1, 차트에 무릎·어깨가 나오고 'knee IA' 줄이 있으면 IA 줄 부위는 무릎 하나다", () => {
    const lines = ['Rt knee pain', 'Rt shoulder pain', 'Rt knee IA']
    expect(memo(lines, [rx('KK090')])).toBe('◈IA injection of - knee')
    expect(holes(lines, [rx('KK090')])).toEqual([])
  })

  it("AC-9319.1: 어깨 줄이 'injection'(다른 시술 줄)이어도 IA 말 줄이 있으면 그 줄의 무릎 하나다", () => {
    const lines = ['Rt shoulder SSNB injection', 'Rt knee IA']
    expect(lineWith(memo(lines, [rx('KK090'), rx('LA247')]), 'IA injection')).toEqual(['◈IA injection of - knee'])
  })

  it("AC-9319.1: 'knee IA'가 다른 부위 시술과 한 줄(쉼표)이어도 IA 말이 든 조각의 무릎 하나다", () => {
    const lines = ['Rt knee IA, Lt shoulder SSNB']
    expect(lineWith(memo(lines, [rx('KK090'), rx('LA247')]), 'IA injection')).toEqual(['◈IA injection of - knee'])
  })

  it('AC-9319.3 AC-9319.7: 한 줄에 IA 부위가 둘이면(빗금) 둘로 세어 수량 1이면 [부위 확인], 수량 2면 둘 다 쓰고 수량 both는 붙이지 않는다', () => {
    const lines = ['Rt knee IA / Lt shoulder IA']
    expect(memo(lines, [rx('KK090')])).toBe('◈IA injection of - [부위 확인]')
    expect(holes(lines, [rx('KK090')])).toEqual([{ code: 'KK090', choices: ['knee', 'shoulder'] }])
    expect(memo(lines, [rx('KK090', 2)])).toBe('◈IA injection of - knee, shoulder')
    expect(memo(lines, [rx('KK090', 2)], iaSide())).toBe('◈IA injection of - Rt knee, Lt shoulder')
  })

  it('AC-9319.3: 진단 한 줄에 부위가 둘이면 둘 다 그 차례 부위다(줄의 첫 부위 하나로 보지 않는다)', () => {
    const lines = ['Rt knee OA, Lt shoulder pain']
    expect(memo(lines, [rx('KK090')])).toBe('◈IA injection of - [부위 확인]')
    expect(holes(lines, [rx('KK090')])).toEqual([{ code: 'KK090', choices: ['knee', 'shoulder'] }])
  })

  it('AC-9319.2: 부위가 하나라도 나온 첫 차례만 쓴다 — IA 말 줄이 무릎이면 수량 2여도 어깨를 채우지 않는다', () => {
    expect(memo(['Rt knee IA', 'Lt shoulder pain'], [rx('KK090', 2)])).toBe('◈IA both injection of - knee')
  })

  it('AC-9319.2: IA 말 줄이 없으면 (3) 진단·시술 줄의 부위를 (4) 그 밖 줄보다 먼저 쓴다', () => {
    expect(memo(['Rt knee OA', '어깨 아파요'], [rx('KK090')])).toBe('◈IA injection of - knee')
    expect(holes(['Rt knee OA', '어깨 아파요'], [rx('KK090')])).toEqual([])
  })

  it('AC-9319.2: 진단·시술 줄에도 부위가 없으면 (4) 그날 차트 모든 줄의 부위를 쓴다', () => {
    expect(memo(['무릎 아파요'], [rx('KK090')])).toBe('◈IA injection of - knee')
  })

  it('AC-9319.2: both는 둘로 센다 — 수량 2면 both knee를 쓴다', () => {
    expect(memo(['both knee IA'], [rx('KK090', 2)])).toBe('◈IA both injection of - knee')
    expect(memo(['both knee IA'], [rx('KK090', 2)], iaSide())).toBe('◈IA injection of - Both knee')
    expect(holes(['both knee IA'], [rx('KK090', 2)])).toEqual([])
  })

  it('AC-9319.2 AC-9319.3: both는 둘로 세므로 수량 1이면 [부위 확인]이고 후보는 그 부위다', () => {
    expect(memo(['both knee IA'], [rx('KK090')])).toBe('◈IA injection of - [부위 확인]')
    expect(holes(['both knee IA'], [rx('KK090')])).toEqual([{ code: 'KK090', choices: ['knee'] }])
  })

  it('AC-9319.2: 같은 부위의 IA 줄이 우측·좌측 둘이면 양측(둘)으로 센다', () => {
    const lines = ['Rt knee IA', 'Lt knee IA']
    expect(memo(lines, [rx('KK090', 2)])).toBe('◈IA both injection of - knee')
    expect(memo(lines, [rx('KK090', 2)], iaSide())).toBe('◈IA injection of - Both knee')
    expect(memo(lines, [rx('KK090')])).toBe('◈IA injection of - [부위 확인]')
    expect(memo(['Rt knee IA, Lt knee IA'], [rx('KK090')])).toBe('◈IA injection of - [부위 확인]')
  })

  it("AC-9319.3: 수량 1, 'IA' 말 줄 없이 무릎·어깨가 나오면 [부위 확인]이고 후보는 knee·shoulder다", () => {
    const lines = ['Rt knee pain', 'Rt shoulder pain']
    expect(memo(lines, [rx('KK090')])).toBe('◈IA injection of - [부위 확인]')
    expect(holes(lines, [rx('KK090')])).toEqual([{ code: 'KK090', choices: ['knee', 'shoulder'] }])
  })

  it('AC-9319.3: IA 말 줄에 부위가 없으면 다음 차례로 가고, 그 차례 부위가 수량보다 많으면 [부위 확인]이다', () => {
    const lines = ['Rt knee pain', 'Rt shoulder pain', 'IA 시행']
    expect(memo(lines, [rx('KK090')])).toBe('◈IA injection of - [부위 확인]')
    expect(holes(lines, [rx('KK090')])).toEqual([{ code: 'KK090', choices: ['knee', 'shoulder'] }])
  })

  it('AC-9319.3 AC-9319.7: 부위 수가 수량 이하면 모두 쓰고, 좌우가 꺼져 있으면 모든 부위에서 좌우를 떼며 수량 both는 붙이지 않는다', () => {
    expect(memo(['Rt knee IA', 'Lt shoulder IA'], [rx('KK090', 2)])).toBe('◈IA injection of - knee, shoulder')
    expect(memo(['Rt knee IA', 'Lt shoulder IA'], [rx('KK090', 2)], iaSide())).toBe('◈IA injection of - Rt knee, Lt shoulder')
  })

  it('AC-9319.3 AC-9319.7: 부위 수가 수량보다 많으면 수량만큼 [부위 확인]이고 수량보다 많은 부위를 쓰지 않는다(빈칸 둘에 수량 both를 붙이지 않는다)', () => {
    const lines = ['Rt knee pain', 'Lt shoulder pain', 'Rt elbow pain']
    expect(memo(lines, [rx('KK090', 2)])).toBe('◈IA injection of - [부위 확인], [부위 확인]')
    expect(holes(lines, [rx('KK090', 2)])).toEqual([{ code: 'KK090', choices: ['knee', 'shoulder', 'elbow'] }])
  })

  it('AC-9319.3: 수량이 없거나 0이면 1로, 소수는 올려 센다', () => {
    for (const qty of [null, 0]) expect(memo(['Rt knee pain', 'Rt shoulder pain'], [rx('KK090', qty)])).toBe('◈IA injection of - [부위 확인]')
    expect(memo(['Rt knee pain', 'Lt shoulder pain'], [rx('KK090', 2.5)])).toBe('◈IA injection of - knee, shoulder')
    expect(memo(['Rt knee pain', 'Lt shoulder pain', 'Rt elbow pain'], [rx('KK090', 2.5)])).toBe('◈IA injection of - knee, shoulder, elbow')
  })

  it('AC-9319.3: 한도는 소수 올림이다 — 0.5→1·1.5→2·2.5→3·3→3', () => {
    const two = ['Rt knee pain', 'Lt shoulder pain']
    const three = ['Rt knee pain', 'Lt shoulder pain', 'Rt elbow pain']
    const four = ['Rt knee pain', 'Lt shoulder pain', 'Rt elbow pain', 'Lt ankle pain']
    // 0.5 → 1
    expect(memo(['Rt knee pain'], [rx('KK090', 0.5)])).toBe('◈IA injection of - knee')
    expect(memo(two, [rx('KK090', 0.5)])).toBe('◈IA injection of - [부위 확인]')
    // 1.5 → 2
    expect(memo(two, [rx('KK090', 1.5)])).toBe('◈IA injection of - knee, shoulder')
    expect(holes(two, [rx('KK090', 1.5)])).toEqual([])
    expect(memo(three, [rx('KK090', 1.5)])).toBe('◈IA injection of - [부위 확인], [부위 확인]')
    // 2.5 → 3, 3 → 3
    for (const qty of [2.5, 3]) {
      expect(memo(three, [rx('KK090', qty)])).toBe('◈IA injection of - knee, shoulder, elbow')
      expect(memo(four, [rx('KK090', qty)])).toBe('◈IA injection of - [부위 확인], [부위 확인], [부위 확인]')
      expect(holes(four, [rx('KK090', qty)])).toEqual([{ code: 'KK090', choices: ['knee', 'shoulder', 'elbow', 'ankle'] }])
    }
  })

  it("AC-9319.7: 고른 부위가 둘 이상(elbow·knee)이고 수량 2면 수량 both를 붙이지 않는다 — 좌우 켬이면 차트 좌우(10월 'both elbow, both knee' → 'Lt elbow, Lt knee')", () => {
    const lines = ['Lt elbow pain', 'Lt knee pain', 'Lt elbow IA', 'Lt knee IA']
    expect(memo(lines, [rx('KK090', 2)])).toBe('◈IA injection of - elbow, knee')
    expect(memo(lines, [rx('KK090', 2)], iaSide())).toBe('◈IA injection of - Lt elbow, Lt knee')
    expect(holes(lines, [rx('KK090', 2)], iaSide())).toEqual([])
  })

  it('AC-9319.7: 좌우 켬이어도 차트에 좌우가 없으면 좌우 없이 쓰고 수량 both를 붙이지 않는다', () => {
    expect(memo(['elbow IA', 'knee IA'], [rx('KK090', 2)], iaSide())).toBe('◈IA injection of - elbow, knee')
  })

  it('AC-9319.7: 수량 규칙이 IA를 양측으로 쓰지 않는 병원이어도 두 부위 줄에는 수량으로 - both를 붙이지 않는다', () => {
    const p = ourClinicPhrases()
    p.TPL.sideByCode = { ...(p.TPL.sideByCode || {}), KK090: 'keep' }
    p.TPL.iaEtc = 'IA injection of{좌우} {부위}'
    // 부위 하나는 지금 그대로(차트 좌우를 떼지 않는 병원)
    expect(memo(['Rt knee IA'], [rx('KK090', 2)], p)).toBe('◈IA injection of - both Rt knee')
    expect(memo(['Rt knee IA', 'Lt shoulder IA'], [rx('KK090', 2)], p)).toBe('◈IA injection of Rt knee, Lt shoulder')
  })

  it('AC-9319.5 AC-9319.7: 부위가 하나면 수량 2의 both는 지금처럼 붙는다', () => {
    expect(memo(['Rt knee IA'], [rx('KK090', 2)])).toBe('◈IA both injection of - knee')
    expect(memo(['Rt knee IA'], [rx('KK090', 2)], iaSide())).toBe('◈IA injection of - Rt knee')
  })

  it("AC-9319.6: IA·건초내주사 줄에 좌우 넣기를 켜면 고른 부위의 차트 조각 좌우를 붙인다(차트 'Rt shoulder IA', 수량 1 → 'Rt shoulder')", () => {
    expect(memo(['Rt shoulder IA'], [rx('KK090')], iaSide())).toBe('◈IA injection of - Rt shoulder')
    expect(memo(['Rt shoulder IA'], [rx('KK090')])).toBe('◈IA injection of - shoulder')
    // 조각마다 그 조각의 좌우: 한 줄에 다른 좌우가 섞여도 IA 말이 든 조각의 좌우다
    expect(lineWith(memo(['Lt knee pain, Rt shoulder IA'], [rx('KK090')], iaSide()), 'IA injection')).toEqual(['◈IA injection of - Rt shoulder'])
    // IA 줄에 좌우가 없으면 그 부위 줄의 좌우
    expect(memo(['Lt shoulder pain', 'shoulder IA'], [rx('KK090')], iaSide())).toBe('◈IA injection of - Lt shoulder')
  })

  it('AC-9319.6: 연골주사 날 일반 IA 줄도 좌우 켬이면 그 IA 조각의 좌우를 붙인다', () => {
    expect(memo(['Rt knee 아라간 2차', 'Lt knee IA triam'], [rx('KK090', 2), rx('A49'), rx('A21')], iaSide())).toBe('◈우측 슬관절 강내 연골주사 2회차\n\n◈IA injection of - Lt knee(triam)')
  })

  it('AC-9319.4: 어느 차례에도 부위가 없으면 지금처럼 [부위 확인]이고 후보는 없다', () => {
    expect(memo(['IA 시행'], [rx('KK090')])).toBe('◈IA injection of - [부위 확인]')
    expect(holes(['IA 시행'], [rx('KK090')])).toEqual([{ code: 'KK090', choices: [] }])
  })

  it('AC-9319.5: 부위가 하나뿐이면 지금 메모 글과 같다', () => {
    expect(memo(['Rt knee IA'], [rx('KK090')])).toBe('◈IA injection of - knee')
    expect(memo(['Rt knee IA'], [rx('KK090')], iaSide())).toBe('◈IA injection of - Rt knee')
    expect(memo(['Rt knee pain'], [rx('KK090')])).toBe('◈IA injection of - knee')
    expect(holes(['Rt knee IA'], [rx('KK090')])).toEqual([])
  })
})

describe('REQ-9319 연골주사 날 일반 IA 줄', () => {
  const rows = [rx('KK090', 3), rx('A49'), rx('A21')]

  it('AC-9319.5: IA 줄이 하나면 지금 메모 글과 같다', () => {
    expect(memo(['Rt knee 아라간 2차', 'Lt knee IA triam'], [rx('KK090', 2), rx('A49'), rx('A21')])).toBe('◈우측 슬관절 강내 연골주사 2회차\n\n◈IA injection of - knee(triam)')
  })

  it('AC-9319.3: KK090 수량은 연골주사와 나눠 쓰므로 1로 보고, 일반 IA 줄 부위가 둘이면 [부위 확인]이다', () => {
    const lines = ['Rt knee 아라간 2차', 'Lt knee IA triam', 'Rt shoulder IA triam']
    expect(memo(lines, rows)).toBe('◈우측 슬관절 강내 연골주사 2회차\n\n◈IA injection of - [부위 확인](triam)')
    expect(holes(lines, rows)).toEqual([{ code: 'KK090', choices: ['knee', 'shoulder'] }])
  })
})

describe('REQ-9319 천자(C8140010) 부위', () => {
  it('AC-9319.5: 천자 말 줄이 하나면 지금처럼 그 줄의 부위(좌우 그대로)다', () => {
    expect(memo(['Rt knee aspiration', 'Rt shoulder pain'], [rx('C8140010')])).toBe('◈Rt knee aspiration')
    expect(holes(['Rt knee aspiration', 'Rt shoulder pain'], [rx('C8140010')])).toEqual([])
  })

  it('AC-9319.2: both는 둘로 센다 — 수량 2면 both knee다', () => {
    expect(memo(['both knee aspiration'], [rx('C8140010', 2)])).toBe('◈Both knee aspiration')
  })

  it('AC-9319.2: 같은 부위의 천자 줄이 우측·좌측 둘이면 양측으로 둘로 센다', () => {
    const lines = ['Rt knee aspiration', 'Lt knee aspiration']
    expect(memo(lines, [rx('C8140010', 2)])).toBe('◈Both knee aspiration')
    expect(memo(lines, [rx('C8140010')])).toBe('◈[부위 확인] aspiration')
    expect(holes(lines, [rx('C8140010')])).toEqual([{ code: 'C8140010', choices: ['Both knee'] }])
  })

  it('AC-9319.3: 천자 말 줄이 없고 부위가 수량보다 많으면 [부위 확인]이고 후보는 그 부위들이다', () => {
    const lines = ['Rt knee pain', 'Lt shoulder pain']
    expect(memo(lines, [rx('C8140010')])).toBe('◈[부위 확인] aspiration')
    expect(holes(lines, [rx('C8140010')])).toEqual([{ code: 'C8140010', choices: ['Rt knee', 'Lt shoulder'] }])
  })

  it('AC-9319.4: 어느 차례에도 부위가 없으면 [부위 확인]이고 처방 글(rx)을 부위로 쓰지 않는다', () => {
    expect(memo(['천자 시행'], [rx('C8140010')])).toBe('◈[부위 확인] aspiration')
    expect(holes(['천자 시행'], [rx('C8140010')])).toEqual([{ code: 'C8140010', choices: [] }])
  })
})

describe('REQ-9319 병원 문구에서 {부위}를 쓰는 그 밖 시술 줄', () => {
  it('AC-9319.5: 부위가 하나면 지금과 같다', () => {
    expect(memo(['Rt knee pain'], [rx('X9001')], withSiteCode())).toBe('◈Rt knee 시술엑스 시행')
  })

  it('AC-9319.3: 부위가 수량보다 많으면 [부위 확인]이고 후보는 그 부위들이다', () => {
    const lines = ['Rt knee pain', 'Lt shoulder pain']
    expect(memo(lines, [rx('X9001')], withSiteCode())).toBe('◈[부위 확인] 시술엑스 시행')
    expect(holes(lines, [rx('X9001')], withSiteCode())).toEqual([{ code: 'X9001', choices: ['Rt knee', 'Lt shoulder'] }])
    expect(memo(lines, [rx('X9001', 2)], withSiteCode())).toBe('◈Rt knee, Lt shoulder 시술엑스 시행')
  })
})

describe('REQ-9319 siteChoices — 빈칸이 난 줄의 후보', () => {
  it('AC-9319.3: 건초내주사 빈칸 후보도 실리고 tsHoleChoices와 같다', () => {
    const lines = ['Rt shoulder pain', 'Lt knee pain', 'Rt wrist pain']
    const engine = createMemoEngine(ourClinicPhrases(), NO_TABLES)
    expect(engine.siteChoices(visit(lines, [rx('KK062')]))).toEqual([{ code: 'KK062', choices: ['shoulder', 'knee', 'wrist'] }])
    expect(engine.tsHoleChoices(visit(lines, [rx('KK062')]))).toEqual(['shoulder', 'knee', 'wrist'])
  })

  it('AC-9319.3: 빈칸이 난 줄마다 하나씩 싣고, 분석한 진료를 넘겨도 같다', () => {
    const p = ourClinicPhrases()
    const lines = ['Rt knee pain', 'Lt shoulder pain']
    const rows = [rx('KK090'), rx('C8140010')]
    const want = [
      { code: 'C8140010', choices: ['Rt knee', 'Lt shoulder'] },
      { code: 'KK090', choices: ['knee', 'shoulder'] },
    ]
    const engine = createMemoEngine(p, NO_TABLES)
    expect(engine.siteChoices(visit(lines, rows))).toEqual(want)
    const prepared = engine.prepareVisit(visit(lines, rows))
    expect(engine.fullText(prepared)).toBe('◈[부위 확인] aspiration\n\n◈IA injection of - [부위 확인]')
    expect(engine.siteChoices(prepared)).toEqual(want)
  })

  it('AC-9319.5: 빈칸이 없으면 빈 목록이다', () => {
    expect(holes(['Rt knee IA'], [rx('KK090'), rx('C8140010')])).toEqual([])
  })
})
