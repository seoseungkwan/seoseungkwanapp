import { describe, expect, it } from 'vitest'
import type { RxLine, Visit } from '@/types/precheck'
import { explainLines, FIELD_PLACE, fieldPlace, fullText, ourClinicPhrases, PHRASE_TAB_LABELS, prepareVisit, type Phrases } from './index'

// 메모 줄마다 출처(claim-learn REQ-9306, design.md 8절). 차트·메모 글은 지어낸 값이다

const NO_TABLES = {}
const rx = (code: string, qty: number | null = 1): RxLine => ({ code, name: code, qty, benefit: true, pay: '급여' })
const visit = (lines: string[], rows: RxLine[]): Pick<Visit, 'rx' | 'lines'> => ({ lines, rx: rows })
const clinic = (patch: (p: Phrases) => void = () => {}) => {
  const p = ourClinicPhrases()
  patch(p)
  return p
}
const PROC = { tab: 'proc', tabLabel: '시술별 문구와 약' } as const

describe('REQ-9306 [왜 이렇게?] 줄마다 출처', () => {
  it('AC-9306.1: 학습이 쓴 줄은 학습: {이름}이고 처방 코드·차트 줄이 함께 온다', () => {
    const text = '◈Lt L3,4 MBB 시행 (C-arm guide 하에)'
    const out = explainLines(text, [{ id: 'l0a1b2c3d', name: 'LA358 · 허리', line: text }], visit(['LBP', 'MBB L3,4 Lt'], [rx('LA358')]), clinic())
    expect(out).toEqual([{ line: text, source: { kind: 'learn', id: 'l0a1b2c3d', name: 'LA358 · 허리' }, codes: ['LA358'], chart: 'MBB L3,4 Lt' }])
  })

  it('AC-9306.1: 건초내주사 줄은 병원 문구 › 시술별 문구와 약 › 건초내주사이고 차트 줄은 같은 부위 줄이다', () => {
    const out = explainLines('◈wrist 건초내주사 시행(dexa)', [], visit(['Rt shoulder pain', 'Rt wrist TS'], [rx('KK062'), rx('A19')]), clinic())
    expect(out).toEqual([{ line: '◈wrist 건초내주사 시행(dexa)', source: { kind: 'field', ...PROC, field: 'ts', label: '건초내주사' }, codes: ['KK062'], chart: 'Rt wrist TS' }])
  })

  it('AC-9306.1: 시술 줄은 기본 시술 문구, 사유 줄은 사유 문장 탭의 칸이다', () => {
    const p = clinic()
    const text = `◈MBB L4,5 Rt\n◈wrist 건초내주사 시행\n\n${p.TPL.ia2}`
    const out = explainLines(text, [], visit(['LBP', 'MBB L4,5 Rt', 'Rt wrist TS'], [rx('LA358'), rx('KK062')]), p)
    expect(out.map((row) => row.line)).toEqual(['◈MBB L4,5 Rt', '◈wrist 건초내주사 시행', p.TPL.ia2])
    expect(out[0]).toEqual({ line: '◈MBB L4,5 Rt', source: { kind: 'field', ...PROC, field: 'main', label: '기본 시술 문구' }, codes: ['LA358'], chart: 'MBB L4,5 Rt' })
    expect(out[1].source).toEqual({ kind: 'field', ...PROC, field: 'ts', label: '건초내주사' })
    expect(out[2]).toEqual({ line: p.TPL.ia2, source: { kind: 'field', tab: 'reason', tabLabel: '사유 문장', field: 'ia2', label: '2부위 시술 사유' }, codes: [], chart: null })
  })

  it('AC-9306.1: 여러 칸이 맞으면 고정 글자가 가장 긴 칸이다(고정 멘트는 그 글로 본다)', () => {
    const p = clinic((v) => {
      v.TPL.mainCentral = '{시술} ({C-arm})'
    })
    const out = explainLines('◈MBB L4,5 Rt (C-arm guide 하에)', [], visit(['MBB L4,5 Rt'], [rx('LA358')]), p)
    expect(out[0].source).toEqual({ kind: 'field', ...PROC, field: 'mainCentral', label: 'Central 시술 문구' })
  })

  it('AC-9306.1: 부위별 문구·시술 이름별 문구·코드별 메모 문구도 그 칸을 가리킨다', () => {
    const p = clinic((v) => {
      v.TPL.byRegion = { knee: '{시술} 무릎 시행함' }
      v.TPL.byProc = { SSNB: '{시술} 어깨 신경차단 시행함' }
    })
    const out = explainLines('◈FNB 무릎 시행함\n◈SSNB 어깨 신경차단 시행함\n◈knee aspiration', [], visit(['Rt knee pain', 'Rt shoulder SSNB'], [rx('LA274'), rx('LA247'), rx('C8140010')]), p)
    expect(out.map((row) => row.source)).toEqual([
      { kind: 'field', ...PROC, field: 'byRegion.knee', label: '무릎' },
      { kind: 'field', ...PROC, field: 'byProc.SSNB', label: 'SSNB' },
      { kind: 'field', tab: 'codes', tabLabel: '처방코드', field: 'CODEMAP.C8140010.memo', label: 'C8140010 코드별 메모 문구' },
    ])
    expect(out[1].chart).toBe('Rt shoulder SSNB')
  })

  it("AC-9306.1: 못 찾은 줄은 출처 모름({kind: 'none'})이다", () => {
    const out = explainLines('◈X-ray 확인 완료\n[약 확인: 트리암]', [], visit(['LBP'], [rx('LA358')]), clinic())
    expect(out).toEqual([
      { line: '◈X-ray 확인 완료', source: { kind: 'none' }, codes: [], chart: null },
      { line: '[약 확인: 트리암]', source: { kind: 'none' }, codes: [], chart: null },
    ])
  })

  it('AC-9306.1: 칸 표(FIELD_PLACE)는 설정 화면 탭·칸 이름이고, 모르는 칸은 null이다', () => {
    expect(PHRASE_TAB_LABELS).toEqual({ basic: '기본', proc: '시술별 문구와 약', codes: '처방코드', rules: '표기 규칙', reason: '사유 문장', words: '차트 줄임말', try: '메모 시험', learn: '학습' })
    expect(FIELD_PLACE.ts).toEqual({ ...PROC, label: '건초내주사' })
    expect(FIELD_PLACE.tsWords).toEqual({ ...PROC, label: '건초내주사로 알아볼 차트 말' })
    expect(FIELD_PLACE.itv).toEqual({ tab: 'reason', tabLabel: '사유 문장', label: '주사 간격 사유' })
    expect(fieldPlace('byRegion.wrist')).toEqual({ ...PROC, label: '손목' })
    expect(fieldPlace('byProc.MBB')).toEqual({ ...PROC, label: 'MBB' })
    expect(fieldPlace('CODEMAP.KK062.memo')).toEqual({ tab: 'codes', tabLabel: '처방코드', label: 'KK062 코드별 메모 문구' })
    for (const field of ['nope', 'byRegion.moon', 'CODEMAP.KK062', '__proto__']) expect(fieldPlace(field)).toBeNull()
  })

  it('AC-9306.3: 출처를 찾아도 메모 글은 그대로이고, 줄은 메모의 빈 줄 아닌 줄 그대로다', () => {
    const p = clinic()
    const v: Visit = { key: 't1', chart: '900001', date: '2026-10-12', month: '2026-10', name: '가상환자01', lines: ['LBP', 'MBB L4,5 Rt', 'Rt wrist TS'], hints: [null, null, null], rx: [rx('LA358'), rx('KK062')], dx: [], memosInBit: [] }
    const before = fullText(prepareVisit(v, p, NO_TABLES), p, NO_TABLES)
    const lines = explainLines(before, [], v, p).map((row) => row.line)
    expect(fullText(prepareVisit(v, p, NO_TABLES), p, NO_TABLES)).toBe(before)
    expect(lines).toEqual(before.split('\n').filter((line) => line.trim()))
  })
})
