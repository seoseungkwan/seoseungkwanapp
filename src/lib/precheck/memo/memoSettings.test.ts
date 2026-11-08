import { describe, expect, it } from 'vitest'
import type { RxLine, Visit } from '@/types/precheck'
import { fullText, ourClinicPhrases, prepareVisit, unfinished, type DrugChoice, type MemoRules, type Phrases } from './index'

// 청구메모 설정 확장(specs/memo-settings) 엔진 시험. 우리 병원 설정(ourClinicPhrases)에서 시작해 사례마다 칸을 얹는다

const NO_TABLES = {}
const rx = (code: string, qty: number | null = 1): RxLine => ({ code, name: code, qty, benefit: true, pay: '급여' })
const visit = (lines: string[], rows: RxLine[]): Visit => ({ key: 't1', chart: '900001', date: '2026-10-12', month: '2026-10', name: '가상환자01', lines, hints: lines.map(() => null), rx: rows, dx: [], memosInBit: [] })
const memo = (lines: string[], rows: RxLine[], p: Phrases = ourClinicPhrases()) => fullText(prepareVisit(visit(lines, rows), p, NO_TABLES), p, NO_TABLES)
/** 우리 병원 설정에 칸을 얹는다 */
const clinic = (patch: (p: Phrases) => void = () => {}, memoRules?: MemoRules) => {
  const p = ourClinicPhrases()
  if (memoRules) p.memoRules = memoRules
  patch(p)
  return p
}
const INCLUDE: DrugChoice = { use: 'include', place: 'afterProc' }
const EXCLUDE: DrugChoice = { use: 'exclude' }
const REASON = '환자 스케쥴상 주1회 내원 밖에 안되어 당일 주사치료 2부위 시행함. 환자 증상 호소 심해 치료 요하는 상태임'

describe('REQ-3001 IA 부위·아라간 날 일반 약', () => {
  it.each([
    ['Rt ankle IA triam', 'ankle'],
    ['Lt hip IA triam', 'hip'],
    ['Rt elbow 관절강내 주사 triam', 'elbow'],
    ['Rt wrist IA triam', 'wrist'],
  ])('AC-3001.1: 차트 %s → IA 줄이 그 부위 영어 이름(%s)을 쓰고 [부위 확인]이 없다', (line, site) => {
    const out = memo([line], [rx('KK090'), rx('A21')])
    expect(out).toBe(`◈IA injection of - ${site}(triam)`)
    expect(out).not.toContain('[부위 확인]')
  })

  it('AC-3001.1: 무릎·어깨 IA는 지금과 같다', () => {
    expect(memo(['Rt knee IA triam'], [rx('KK090'), rx('A21')])).toBe('◈IA injection of - knee(triam)')
    expect(memo(['Rt shoulder pain', 'Rt shoulder IA'], [rx('KK090'), rx('A21')])).toBe('◈IA injection of - shoulder(triam)')
  })

  it('AC-3001.2: 아라간 줄과 트리암 IA 줄이 함께 있다', () => {
    const out = memo(['Rt knee 아라간 2차', 'Lt knee IA triam'], [rx('KK090', 2), rx('A49'), rx('A21')])
    expect(out).toBe('◈우측 슬관절 강내 연골주사 2회차\n\n◈IA injection of - knee(triam)')
    expect(unfinished(out)).toBe(false)
  })

  it('AC-3001.2: 아라간이 차트 줄 없이 처방으로만 있어도 트리암 IA 줄이 함께 있다', () => {
    const out = memo(['Lt knee IA triam'], [rx('KK090', 2), rx('A49'), rx('A21')])
    expect(out).toContain('연골주사')
    expect(out).toContain('◈IA injection of - knee(triam)')
  })

  it('AC-3001.3: 아라간 날에 넣기인 일반 약이 있는데 아라간이 아닌 IA 줄이 없으면 [약 확인: 트리암]을 남긴다', () => {
    const out = memo(['Rt knee 아라간 2차'], [rx('KK090'), rx('A49'), rx('A21')])
    expect(out).toBe('◈우측 슬관절 강내 연골주사 2회차\n[약 확인: 트리암]')
    expect(unfinished(out)).toBe(true)
  })

  it('AC-3001.3: 약이 둘이면 약마다 표시를 남기고, 차트 줄 없이 처방으로 만든 연골주사 줄 날도 같다', () => {
    expect(memo(['Rt knee 아라간 2차'], [rx('KK090'), rx('A49'), rx('A21'), rx('A19')])).toBe('◈우측 슬관절 강내 연골주사 2회차\n[약 확인: 트리암]\n[약 확인: 덱사]')
    expect(memo(['Both knee OA'], [rx('KK090', 2), rx('A49', 2), rx('A21')])).toBe('◈양측 슬관절 강내 연골주사 [회차 확인]\n[약 확인: 트리암]')
  })

  it('AC-3001.3: 아라간이 든 IA 줄은 일반 IA 줄로 보지 않는다', () => {
    const out = memo(['Rt knee 아라간 IA 2차'], [rx('KK090'), rx('A49'), rx('A21')])
    expect(out).toContain('[약 확인: 트리암]')
    expect(out).not.toContain('IA injection of')
  })

  it('AC-3001.3: 일반 IA 문구(iaEtc)가 비어 줄을 쓸 수 없으면 [약 확인]을 남긴다', () => {
    const p = ourClinicPhrases()
    p.TPL.iaEtc = ''
    const out = memo(['Rt knee 아라간 2차', 'Lt knee IA triam'], [rx('KK090', 2), rx('A49'), rx('A21')], p)
    expect(out).toContain('[약 확인: 트리암]')
  })

  it('AC-3001.3: 빼기인 일반 약은 표시도 없다', () => {
    const p = ourClinicPhrases()
    p.procedureDrugs.KK090.트리암 = { use: 'exclude' }
    expect(memo(['Rt knee 아라간 2차'], [rx('KK090'), rx('A49'), rx('A21')], p)).toBe('◈우측 슬관절 강내 연골주사 2회차')
  })

  // 마지막 검토 F1: 'injection'만 있는 줄은 IA 줄이 아니다(design.md 'IA 말이 있고 아라간이 없는 줄')
  it.each([
    ['SSNB injection(다른 시술 줄)', ['Rt knee 아라간 2차', 'Rt shoulder SSNB injection'], [rx('KK090'), rx('A49'), rx('A21'), rx('LA247')]],
    ['TPI injection(코드 없는 줄)', ['Rt knee 아라간 2차', 'Rt shoulder TPI injection'], [rx('KK090'), rx('A49'), rx('A21')]],
    ['MBB injection(다른 시술 줄)', ['Rt knee 아라간 2차', 'MBB L4,5 both injection'], [rx('KK090'), rx('A49'), rx('A21'), rx('LA358')]],
  ])('AC-3001.2 AC-3001.3: 아라간 날 %s은 일반 IA 줄로 보지 않아 IA 줄을 지어내지 않고 [약 확인: 트리암]을 남긴다', (_, lines, rows) => {
    const out = memo(lines, rows)
    expect(out).not.toContain('IA injection of')
    expect(out).toContain('[약 확인: 트리암]')
    expect(unfinished(out)).toBe(true)
  })

  // 마지막 검토 F2: 차트로 만든 연골주사 줄의 {약제}에는 일반 약(트리암)이 들어가지 않는다
  it('AC-3001.2 AC-3001.3: 연골주사 문구에 {약제}가 있어도 일반 약은 연골주사 줄에 들어가지 않는다', () => {
    const p = ourClinicPhrases()
    p.TPL.ara = '{좌우} 슬관절 강내 연골주사 {회차}회차{약제}'
    const alone = memo(['Rt knee 아라간 2차'], [rx('KK090'), rx('A49'), rx('A21')], p)
    expect(alone.split('\n')[0]).not.toContain('triam')
    expect(alone).toContain('[약 확인: 트리암]')
    const withIa = memo(['Rt knee 아라간 2차', 'Lt knee IA triam'], [rx('KK090', 2), rx('A49'), rx('A21')], p)
    expect(withIa.match(/triam/g)).toHaveLength(1)
    expect(withIa).toContain('◈IA injection of - knee(triam)')
    expect(unfinished(withIa)).toBe(false)
  })

  // 재검토: 연골주사 줄이 다른 틀(부위별·Peripheral·시술 이름별)을 거치거나 코드별 메모 문구에 {약제}가 있어도 같다
  it.each([
    ['부위별 문구', (p: Phrases) => void (p.TPL.byRegion = { knee: '{시술}{약제}' })],
    ['Peripheral 시술 문구', (p: Phrases) => void (p.TPL.mainPeripheral = '{시술}{약제}')],
    ['시술 이름별 문구', (p: Phrases) => void (p.TPL.byProc = { 연골주사: '{시술}{약제}' })],
  ])('AC-3001.2 AC-3001.3: %s에 {약제}가 있어도 일반 약은 연골주사 줄에 들어가지 않는다', (_, patch) => {
    const p = clinic(patch)
    const alone = memo(['Rt knee 아라간 2차'], [rx('KK090'), rx('A49'), rx('A21')], p)
    expect(alone.split('\n')[0]).toContain('연골주사')
    expect(alone.split('\n')[0]).not.toContain('triam')
    expect(alone).toContain('[약 확인: 트리암]')
    const withIa = memo(['Rt knee 아라간 2차', 'Lt knee IA triam'], [rx('KK090', 2), rx('A49'), rx('A21')], p)
    expect(withIa.match(/triam/g)).toHaveLength(1)
    expect(withIa).toContain('◈IA injection of - knee(triam)')
  })

  it('AC-3001.3: 연골주사 날 코드별 메모 문구의 {약제}에도 일반 약이 들어가지 않는다', () => {
    const p = clinic((q) => void (q.CODEMAP.HA280 = { ...q.CODEMAP.HA280, memo: '관절조영 시행{약제}' }))
    const out = memo(['Rt knee 아라간 2차'], [rx('KK090'), rx('A49'), rx('A21'), rx('HA280')], p)
    expect(out).not.toContain('triam')
    expect(out).toContain('[약 확인: 트리암]')
  })
})

describe('REQ-3002 시술 2개 이상인 날의 약(넣기인 시술이 하나뿐이면 그 시술 줄에)', () => {
  const SSNB_IA = ['Rt shoulder pain', 'Rt SSNB IA']
  const SSNB_IA_RX = [rx('LA247'), rx('KK090'), rx('A21')]
  /** 트리암을 SSNB(LA247)에서만 고른 값으로 넣고 IA(KK090)는 빼기 */
  const ssnbOwns = (choice: DrugChoice) => clinic((p) => {
    p.procedureDrugs.LA247.트리암 = choice
    p.procedureDrugs.KK090.트리암 = EXCLUDE
  })
  const iaOwns = (choice: DrugChoice) => clinic((p) => {
    p.procedureDrugs.KK090.트리암 = choice
  })

  it('AC-3002.1: 명세 보기 — 넣기인 시술이 IA 하나뿐이면 IA 줄 {약제}에 넣고 MBB 줄에는 약이 없다', () => {
    const out = memo(['MBB L4,5 both', 'Rt knee IA triam'], [rx('KK090'), rx('LA358'), rx('A21')])
    expect(out).toBe(`◈MBB L4,5 both\n\n◈IA injection of - knee(triam)\n\n${REASON}`)
    expect(out).not.toContain('[약 확인')
  })

  it('AC-3002.1: SSNB + IA 날 트리암은 IA 줄에(원본과 같다)', () => {
    expect(memo(SSNB_IA, SSNB_IA_RX)).toBe(`◈SSNB\n\n◈IA injection of - shoulder(triam)\n\n${REASON}`)
  })

  it('AC-3002.1: 넣기인 시술이 건초내주사 하나뿐이면 건초내주사 줄 {약제}에 넣는다', () => {
    expect(memo(['LBP', 'MBB L4,5 Rt', 'Rt 3rd finger trigger finger'], [rx('KK062'), rx('A19'), rx('LA358')])).toBe(`◈MBB L4,5 Rt\n◈3rd finger 건초내주사 시행(dexa)\n\n${REASON}`)
  })

  it('AC-3002.1: 그 밖의 시술이 주인이면 그 시술 줄의 고른 자리(시술 뒤·끝맺음 뒤·따로 한 줄)에 넣는다', () => {
    expect(memo(SSNB_IA, SSNB_IA_RX, ssnbOwns(INCLUDE))).toBe(`◈SSNB(트리암)\n\n◈IA injection of - shoulder\n\n${REASON}`)
    expect(memo(SSNB_IA, SSNB_IA_RX, ssnbOwns({ use: 'include', place: 'afterEnding', label: 'triam' }))).toBe(`◈SSNB (triam)\n\n◈IA injection of - shoulder\n\n${REASON}`)
    expect(memo(SSNB_IA, SSNB_IA_RX, ssnbOwns({ use: 'include', place: 'ownLine' }))).toBe(`◈SSNB\n◈약: 트리암\n\n◈IA injection of - shoulder\n\n${REASON}`)
  })

  it('AC-3002.1: IA가 주인인 끝맺음 뒤·따로 한 줄 약은 IA 줄에 붙는다', () => {
    expect(memo(SSNB_IA, SSNB_IA_RX, iaOwns({ use: 'include', place: 'afterEnding' }))).toBe(`◈SSNB\n\n◈IA injection of - shoulder (트리암)\n\n${REASON}`)
    expect(memo(SSNB_IA, SSNB_IA_RX, iaOwns({ use: 'include', place: 'ownLine' }))).toBe(`◈SSNB\n\n◈IA injection of - shoulder\n◈약: 트리암\n\n${REASON}`)
  })

  it('AC-3002.1: 주인이 있는 약은 다른 시술 줄의 {약제}·첫 줄 자리에 들어가지 않는다', () => {
    const p = clinic((value) => {
      value.TPL.mainPeripheral = '{시술}{약제}'
    })
    expect(memo(SSNB_IA, SSNB_IA_RX, p)).toBe(`◈SSNB\n\n◈IA injection of - shoulder(triam)\n\n${REASON}`)
    const noSlot = clinic((value) => {
      value.TPL.mainPeripheral = '{Sono} {시술} {시행함}'
      value.procedureDrugs.LA247.트리암 = INCLUDE
      value.procedureDrugs.KK090.트리암 = EXCLUDE
    })
    expect(memo(SSNB_IA, SSNB_IA_RX, noSlot)).toBe(`◈Sono guide 하에 SSNB 시행함(트리암)\n\n◈IA injection of - shoulder\n\n${REASON}`)
  })

  it('AC-3002.2: 넣기인 시술이 2곳 이상이면 지금처럼 [약 확인]이다', () => {
    const both = clinic((p) => {
      p.procedureDrugs.LA247.트리암 = INCLUDE
    })
    const out = memo(SSNB_IA, SSNB_IA_RX, both)
    expect(out).toBe(`◈SSNB\n\n◈IA injection of - shoulder\n[약 확인: 트리암]\n\n${REASON}`)
    expect(unfinished(out)).toBe(true)
  })

  it('AC-3002.2: 정하지 않은 시술이 하나라도 있으면 [약 확인]이고, 모두 빼기면 뺀다', () => {
    const unset = clinic((p) => {
      delete p.procedureDrugs.LA247.트리암
    })
    expect(memo(SSNB_IA, SSNB_IA_RX, unset)).toBe(`◈SSNB\n\n◈IA injection of - shoulder\n[약 확인: 트리암]\n\n${REASON}`)
    const off = clinic((p) => {
      p.procedureDrugs.KK090.트리암 = EXCLUDE
    })
    expect(memo(SSNB_IA, SSNB_IA_RX, off)).toBe(`◈SSNB\n\n◈IA injection of - shoulder\n\n${REASON}`)
  })

  it('AC-3002.3: 넣기 시술의 줄이 메모에 없으면(무릎 세트 날 IA 줄 생략) [약 확인]을 남긴다', () => {
    const out = memo(['Rt knee pain', 'Rt FNB SNB IA'], [rx('LA274'), rx('LA272'), rx('KK090'), rx('A21')])
    expect(out).toBe('◈FNB\n◈SNB\n[약 확인: 트리암]')
    expect(unfinished(out)).toBe(true)
  })

  it('AC-3002.3: 건초내주사 문구가 비어 {약제} 자리가 없어도 [약 확인]을 남긴다', () => {
    const p = clinic((value) => {
      value.TPL.ts = ''
    })
    const out = memo(['LBP', 'MBB L4,5 Rt', 'Rt 3rd finger trigger finger'], [rx('KK062'), rx('A19'), rx('LA358')], p)
    expect(out).toContain('[약 확인: 덱사]')
    expect(out).not.toContain('dexa')
  })

  it('AC-3002.3: 그 밖의 시술이 주인인데 그 시술 줄이 없으면 [약 확인]을 남긴다', () => {
    const p = clinic((value) => {
      value.CODEMAP.LA247 = { ...value.CODEMAP.LA247, add: false }
      value.procedureDrugs.LA247.트리암 = { use: 'include', place: 'ownLine' }
      value.procedureDrugs.KK090.트리암 = EXCLUDE
    })
    const out = memo(['Rt shoulder pain', 'Rt shoulder IA'], SSNB_IA_RX, p)
    expect(out).toContain('[약 확인: 트리암]')
    expect(out).not.toContain('◈약:')
  })

  it('AC-3002.4: 연골주사약이 KK090에서만 넣기면 시술 2개 이상인 날에도 연골주사 줄을 쓴다(원본과 같다)', () => {
    expect(memo(['Rt knee OA', '아라간 Rt knee 2차', 'Rt SSNB'], [rx('KK090'), rx('A49'), rx('LA247')])).toBe(`◈우측 슬관절 강내 연골주사 2회차\n\n◈SSNB\n\n${REASON}`)
    expect(memo(['Both knee OA', 'KLG 3/3', 'SSNB Rt'], [rx('KK090', 2), rx('A49', 2), rx('LA247')])).toBe(`◈SSNB\n\n◈양측 슬관절 강내 연골주사 [회차 확인]\n\n${REASON}`)
  })

  it('AC-3002.4 AC-3001.2: 아라간·트리암 IA·SSNB 날: 연골주사 줄과 트리암 IA 줄을 함께 쓴다', () => {
    const out = memo(['Rt knee 아라간 2차', 'Lt knee IA triam', 'Rt SSNB'], [rx('KK090', 2), rx('A49'), rx('A21'), rx('LA247')])
    expect(out).toBe(`◈우측 슬관절 강내 연골주사 2회차\n\n◈SSNB\n\n◈IA injection of - knee(triam)\n\n${REASON}`)
  })

  it('AC-3002.5: singleOwnerDrug가 false면 옛 규칙(AC-014.10) 그대로다', () => {
    const p = clinic(undefined, { singleOwnerDrug: false })
    expect(memo(SSNB_IA, SSNB_IA_RX, p)).toBe(`◈SSNB\n\n◈IA injection of - shoulder\n[약 확인: 트리암]\n\n${REASON}`)
    const ara = memo(['Rt knee OA', '아라간 Rt knee 2차', 'Rt SSNB'], [rx('KK090'), rx('A49'), rx('LA247')], p)
    expect(ara).toContain('[약 확인: 아라간]')
    expect(ara).not.toContain('연골주사')
  })

  it('AC-3002.5: 칸이 없으면 켜진 것이다', () => {
    for (const memoRules of [undefined, {}, { singleOwnerDrug: true }]) {
      expect(memo(SSNB_IA, SSNB_IA_RX, clinic(undefined, memoRules))).toBe(`◈SSNB\n\n◈IA injection of - shoulder(triam)\n\n${REASON}`)
    }
  })
})

describe('REQ-3003 고르는 칸 두 개(처음 값 = 지금 동작)', () => {
  const KNEE_SET = ['Rt knee pain', 'Rt FNB SNB IA']
  const KNEE_SET_RX = [rx('LA274'), rx('LA272'), rx('KK090')]

  it('AC-3003.1: iaSide가 없거나 거짓이면 IA·건초내주사 줄에 좌우가 없다', () => {
    for (const memoRules of [undefined, { iaSide: false }]) {
      const p = clinic(undefined, memoRules)
      expect(memo(['Rt knee IA'], [rx('KK090'), rx('A21')], p)).toBe('◈IA injection of - knee(triam)')
      expect(memo(['Rt thumb trigger finger'], [rx('KK062'), rx('A21')], p)).toBe('◈thumb 건초내주사 시행(triam)')
    }
  })

  it('AC-3003.1: iaSide가 참이면 차트 좌우를 부위 앞에 쓴다', () => {
    const p = clinic(undefined, { iaSide: true })
    expect(memo(['Rt knee IA'], [rx('KK090'), rx('A21')], p)).toBe('◈IA injection of - Rt knee(triam)')
    expect(memo(['Rt thumb trigger finger'], [rx('KK062'), rx('A21')], p)).toBe('◈Rt thumb 건초내주사 시행(triam)')
    expect(memo(['Rt knee 아라간 2차', 'Lt knee IA triam'], [rx('KK090', 2), rx('A49'), rx('A21')], p)).toBe('◈우측 슬관절 강내 연골주사 2회차\n\n◈IA injection of - Lt knee(triam)')
  })

  it('AC-3003.1: iaSide가 참이어도 차트에 좌우가 없으면 지금처럼 수량으로 양측을 쓰고, 좌우가 있으면 겹쳐 쓰지 않는다', () => {
    const p = clinic(undefined, { iaSide: true })
    expect(memo(['knee IA'], [rx('KK090', 2), rx('A41')], p)).toBe(memo(['knee IA'], [rx('KK090', 2), rx('A41')]))
    expect(memo(['Both knee pain', 'both knee IA'], [rx('KK090', 2), rx('A41')], p)).not.toMatch(/both.*both/i)
  })

  it('AC-3003.2: 무릎 세트 날 kneeSetIaWithDrug가 없거나 거짓이면 지금과 같다(IA 줄 생략, [약 확인])', () => {
    for (const memoRules of [undefined, { kneeSetIaWithDrug: false }]) {
      expect(memo(KNEE_SET, [...KNEE_SET_RX, rx('A21')], clinic(undefined, memoRules))).toBe('◈FNB\n◈SNB\n[약 확인: 트리암]')
    }
  })

  it('AC-3003.2: kneeSetIaWithDrug가 참이면 IA 줄을 그 약과 함께 쓴다', () => {
    const out = memo(KNEE_SET, [...KNEE_SET_RX, rx('A21')], clinic(undefined, { kneeSetIaWithDrug: true }))
    expect(out).toBe('◈FNB\n◈SNB\n\n◈IA injection of - knee(triam)')
    expect(unfinished(out)).toBe(false)
  })

  it('AC-3003.2: 약이 없으면 참이어도 생략한다', () => {
    expect(memo(KNEE_SET, KNEE_SET_RX, clinic(undefined, { kneeSetIaWithDrug: true }))).toBe('◈FNB\n◈SNB')
  })
})

describe('REQ-3004 AC-3004.1 사전에 없는 처방코드의 [코드 확인]', () => {
  /** 비트 처방 이름이 따로 있는 줄 */
  const named = (code: string, name: string, benefit = true): RxLine => ({ code, name, qty: 1, benefit, pay: benefit ? '급여' : '비급여' })
  const KNEE_IA = ['Rt knee IA']

  it('AC-3004.1: 시술 줄이 있는 날 사전에 없는 급여 코드마다 [코드 확인: 처방 이름]을 남기고 unfinished가 참이다', () => {
    const out = memo(KNEE_IA, [rx('KK090'), rx('A21'), named('MM010', '표층열')])
    expect(out).toBe('◈IA injection of - knee(triam)\n[코드 확인: 표층열]')
    expect(unfinished(out)).toBe(true)
  })

  it('AC-3004.1: 코드마다 한 번, 처방 차례대로', () => {
    const rows = [named('MM010', '표층열'), rx('KK090'), named('MM020', '심층열'), named('MM010', '표층열'), rx('A21')]
    expect(memo(KNEE_IA, rows)).toBe('◈IA injection of - knee(triam)\n[코드 확인: 표층열]\n[코드 확인: 심층열]')
  })

  it('AC-3004.1: 확인 표시 자리([약 확인] 옆)에 두고 사유 문장은 그 뒤다', () => {
    const p = clinic((value) => {
      delete value.procedureDrugs.KK090.트리암
    })
    expect(memo(['Rt shoulder pain', 'Rt shoulder IA'], [rx('KK090'), rx('A21'), named('MM010', '표층열')], p)).toBe('◈IA injection of - shoulder\n[약 확인: 트리암]\n[코드 확인: 표층열]')
    expect(memo(['Rt shoulder pain', 'Rt SSNB IA'], [rx('LA247'), rx('KK090'), named('MM010', '표층열')])).toBe(`◈SSNB\n\n◈IA injection of - shoulder\n[코드 확인: 표층열]\n\n${REASON}`)
  })

  it('AC-3004.1: 한 줄 잇기·문장 틀에서도 표시가 한 줄로 남는다', () => {
    for (const patch of [{ lineJoin: 'oneLine' }, { sentence: '{시술목록} {시행함}' }]) {
      const out = memo(KNEE_IA, [rx('KK090'), named('MM010', '표\n층]열')], clinic((value) => Object.assign(value.TPL, patch)))
      expect(out).toContain('[코드 확인: 표 층열]')
      expect(unfinished(out)).toBe(true)
    }
  })

  it('AC-3004.1: 시술 줄이 없는 날은 표시가 없다', () => {
    expect(memo(['물리치료만'], [named('MM010', '표층열')])).toBe('')
    expect(memo(['관절조영'], [named('HA280', '관절조영술'), named('MM010', '표층열')])).toBe('◈관절조영 시행')
  })

  it('AC-3004.1: 비급여 줄·사전에 있는 코드·지운 코드는 표시가 없다', () => {
    expect(memo(KNEE_IA, [rx('KK090'), rx('A21'), named('MM010', '표층열', false)])).toBe('◈IA injection of - knee(triam)')
    expect(memo(KNEE_IA, [rx('KK090'), rx('A21'), named('KK010', '근주'), named('D3065', 'HbA1c')])).toBe('◈IA injection of - knee(triam)')
    const deleted = clinic((value) => {
      value.CODEMAP_DEL = ['HA280']
    })
    expect(memo(KNEE_IA, [rx('KK090'), rx('A21'), named('HA280', '관절조영술')], deleted)).toBe('◈IA injection of - knee(triam)')
  })

  it('AC-3004.1: 사전에 넣으면(제외 skip이어도) 표시가 사라진다', () => {
    const skip = clinic((value) => {
      value.CODEMAP.MM010 = { n: '표층열', k: 'skip', rg: null }
    })
    expect(memo(KNEE_IA, [rx('KK090'), rx('A21'), named('MM010', '표층열')], skip)).toBe('◈IA injection of - knee(triam)')
  })
})

describe('REQ-3005 메모 줄 순서(memoRules.order)', () => {
  const SSNB_IA = ['Rt shoulder pain', 'Rt SSNB IA']
  const SSNB_IA_RX = [rx('LA247'), rx('KK090'), rx('A21')]
  const ordered = (order: Record<string, number>, patch?: (p: Phrases) => void) => clinic(patch, { order })

  it('AC-3005.1: order가 없거나 비었으면 지금과 같다(차트 순서)', () => {
    const now = memo(SSNB_IA, SSNB_IA_RX)
    expect(now).toBe(`◈SSNB\n\n◈IA injection of - shoulder(triam)\n\n${REASON}`)
    for (const memoRules of [{}, { order: {} }]) expect(memo(SSNB_IA, SSNB_IA_RX, clinic(undefined, memoRules))).toBe(now)
  })

  it('AC-3005.1: 번호 있는 코드의 줄이 그날 없으면 지금과 같다', () => {
    expect(memo(SSNB_IA, SSNB_IA_RX, ordered({ LA358: 1 }))).toBe(memo(SSNB_IA, SSNB_IA_RX))
  })

  it('AC-3005.2: 번호 있는 코드의 줄이 먼저 오고 빈 줄 구분은 없앤다. 사유 문장은 맨 끝이다', () => {
    expect(memo(SSNB_IA, SSNB_IA_RX, ordered({ KK090: 1 }))).toBe(`◈IA injection of - shoulder(triam)\n◈SSNB\n\n${REASON}`)
  })

  it('AC-3005.2: 번호 작은 차례로, 번호 없는 줄은 그 뒤에 원래 차례로', () => {
    const lines = ['MBB L4,5 Rt', 'Rt shoulder pain', 'Rt SSNB IA']
    const rows = [rx('LA358'), rx('LA247'), rx('KK090'), rx('A21')]
    expect(memo(lines, rows)).toBe(`◈MBB L4,5 Rt\n\n◈SSNB\n\n◈IA injection of - shoulder(triam)\n\n${REASON}`)
    expect(memo(lines, rows, ordered({ KK090: 1, LA247: 2 }))).toBe(`◈IA injection of - shoulder(triam)\n◈SSNB\n◈MBB L4,5 Rt\n\n${REASON}`)
    expect(memo(lines, rows, ordered({ LA358: 5, KK090: 3 }))).toBe(`◈IA injection of - shoulder(triam)\n◈MBB L4,5 Rt\n◈SSNB\n\n${REASON}`)
  })

  it('AC-3005.2: 그 줄 바로 아래 붙은 ◈약: 줄은 함께 움직인다', () => {
    const p = ordered({ KK090: 1 }, (value) => {
      value.procedureDrugs.LA247.트리암 = { use: 'include', place: 'ownLine' }
      value.procedureDrugs.KK090.트리암 = EXCLUDE
    })
    expect(memo(SSNB_IA, SSNB_IA_RX, p)).toBe(`◈IA injection of - shoulder\n◈SSNB\n◈약: 트리암\n\n${REASON}`)
  })

  it('AC-3005.2: 확인 표시는 늘 맨 끝이다', () => {
    const p = ordered({ KK090: 1 }, (value) => {
      value.procedureDrugs.LA247.트리암 = INCLUDE
    })
    expect(memo(SSNB_IA, [...SSNB_IA_RX, { code: 'MM010', name: '표층열', qty: 1, benefit: true, pay: '급여' }], p)).toBe(`◈IA injection of - shoulder\n◈SSNB\n[약 확인: 트리암]\n[코드 확인: 표층열]\n\n${REASON}`)
  })

  it('AC-3005.2: 코드별 메모 줄(memo)도 그 코드 번호로 옮긴다', () => {
    const rows = [rx('LA247'), rx('HA280')]
    expect(memo(['Rt shoulder pain', 'Rt SSNB'], rows)).toBe('◈SSNB\n◈관절조영 시행')
    expect(memo(['Rt shoulder pain', 'Rt SSNB'], rows, ordered({ HA280: 1 }))).toBe('◈관절조영 시행\n◈SSNB')
  })
})
