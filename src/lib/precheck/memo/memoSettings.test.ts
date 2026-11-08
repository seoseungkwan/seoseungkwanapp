import { describe, expect, it } from 'vitest'
import type { RxLine, Visit } from '@/types/precheck'
import { fullText, ourClinicPhrases, prepareVisit, unfinished, type Phrases } from './index'

// 청구메모 설정 확장(specs/memo-settings) 엔진 시험. 우리 병원 설정(ourClinicPhrases)에서 시작해 사례마다 칸을 얹는다

const NO_TABLES = {}
const rx = (code: string, qty: number | null = 1): RxLine => ({ code, name: code, qty, benefit: true, pay: '급여' })
const visit = (lines: string[], rows: RxLine[]): Visit => ({ key: 't1', chart: '900001', date: '2026-10-12', month: '2026-10', name: '가상환자01', lines, hints: lines.map(() => null), rx: rows, dx: [], memosInBit: [] })
const memo = (lines: string[], rows: RxLine[], p: Phrases = ourClinicPhrases()) => fullText(prepareVisit(visit(lines, rows), p, NO_TABLES), p, NO_TABLES)

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
})
