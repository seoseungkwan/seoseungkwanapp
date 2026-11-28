import { describe, expect, it } from 'vitest'
import type { DxLine, RxLine, Visit } from '@/types/precheck'
import { createMemoEngine, fullText, ourClinicPhrases, prepareVisit, TS_WORDS_FALLBACK, type Phrases } from './index'

// 건초내주사(KK062) 줄 부위는 처방 수량만큼(claim-learn REQ-9308, design.md 9절). 차트·진단 글은 지어낸 값이다

const NO_TABLES = {}
const rx = (code: string, qty: number | null = 1): RxLine => ({ code, name: code, qty, benefit: true, pay: '급여' })
const dx = (c: string, n: string): DxLine => ({ c, n, m: false, s: '', d: '', t: '' })
const visit = (lines: string[], rows: RxLine[], dxs: DxLine[] = []): Visit => ({ key: 't1', chart: '900001', date: '2026-10-12', month: '2026-10', name: '가상환자01', lines, hints: lines.map(() => null), rx: rows, dx: dxs, memosInBit: [] })
const memo = (lines: string[], rows: RxLine[], dxs: DxLine[] = [], p: Phrases = ourClinicPhrases()) => fullText(prepareVisit(visit(lines, rows, dxs), p, NO_TABLES), p, NO_TABLES)
const choices = (lines: string[], rows: RxLine[], dxs: DxLine[] = [], p: Phrases = ourClinicPhrases()) => createMemoEngine(p, NO_TABLES).tsHoleChoices(visit(lines, rows, dxs))
const withWords = (words: string) => {
  const p = ourClinicPhrases()
  p.TPL.tsWords = words
  return p
}
const iaSide = () => {
  const p = ourClinicPhrases()
  p.memoRules = { ...p.memoRules, iaSide: true }
  return p
}

describe('REQ-9308 건초내주사 부위는 처방 수량만큼', () => {
  it("AC-9308.1: 수량 1, 차트에 어깨·무릎·손목이 나오고 '손목 TS' 줄이 있으면 건초내주사 줄 부위는 손목 하나다", () => {
    expect(memo(['Rt shoulder pain', 'Lt knee pain', 'Rt wrist pain', '손목 TS'], [rx('KK062')])).toBe('◈wrist 건초내주사 시행')
  })

  it('AC-9308.1: 건초 말이 든 줄이 손목이면 진단 부위(어깨·무릎)는 넣지 않고 빈칸도 없다', () => {
    const out = memo(['Rt shoulder pain', 'Lt knee pain', 'Rt wrist TS'], [rx('KK062')], [dx('M7510', '어깨 유착성 관절낭염'), dx('M1706', '무릎 관절증')])
    expect(out).toBe('◈wrist 건초내주사 시행')
    expect(choices(['Rt shoulder pain', 'Lt knee pain', 'Rt wrist TS'], [rx('KK062')])).toEqual([])
  })

  it('AC-9308.2: 건초 말 줄이 없으면 건초염 진단(M65)의 부위를 쓴다', () => {
    expect(memo(['Rt shoulder pain', 'Rt wrist pain'], [rx('KK062')], [dx('M6540', '손목 건초염')])).toBe('◈wrist 건초내주사 시행')
  })

  it('AC-9308.2: M65가 아닌 진단의 부위는 건초염 진단으로 보지 않는다', () => {
    const out = memo(['Rt shoulder pain', 'Rt wrist pain'], [rx('KK062')], [dx('M7510', '어깨 유착성 관절낭염')])
    expect(out).toBe('◈[부위 확인] 건초내주사 시행')
  })

  it('AC-9308.2: 건초 말도 건초염 진단도 없고 그 밖 부위가 수량보다 많으면 [부위 확인]이고 후보는 그 부위들이다', () => {
    const lines = ['Rt shoulder pain', 'Lt knee pain', 'Rt wrist pain']
    expect(memo(lines, [rx('KK062')])).toBe('◈[부위 확인] 건초내주사 시행')
    expect(choices(lines, [rx('KK062')])).toEqual(['shoulder', 'knee', 'wrist'])
  })

  it('AC-9308.2: 한 차례 안(건초 말 줄 둘)의 부위가 남은 수보다 많으면 [부위 확인]이고 후보는 그 차례의 부위다', () => {
    const lines = ['Rt shoulder pain', 'Rt wrist TS', 'Lt 3rd finger trigger finger']
    expect(memo(lines, [rx('KK062')])).toBe('◈[부위 확인] 건초내주사 시행')
    expect(choices(lines, [rx('KK062')])).toEqual(['wrist', '3rd finger'])
  })

  it('AC-9308.2 AC-9319.2: 건초 말 줄에서 부위가 나오면 수량이 남아도 다음 차례(건초염 진단)로 채우지 않는다', () => {
    const out = memo(['Rt wrist TS', 'Lt knee pain', 'Rt shoulder pain'], [rx('KK062', 2)], [dx('M6596', '무릎 건초염'), dx('M6581', '어깨 건초염')])
    expect(out).toBe('◈wrist 건초내주사 both 시행')
    expect(choices(['Rt wrist TS', 'Lt knee pain', 'Rt shoulder pain'], [rx('KK062', 2)], [dx('M6596', '무릎 건초염'), dx('M6581', '어깨 건초염')])).toEqual([])
  })

  it('AC-9308.2 AC-9319.2: 건초 말 줄로 부위를 찾으면 수량이 남아도 건초염 진단·그 밖 부위는 넣지 않는다', () => {
    expect(memo(['Rt shoulder pain', 'Rt wrist TS'], [rx('KK062', 3)], [dx('M6596', '무릎 건초염')])).toBe('◈wrist 건초내주사 both 시행')
  })

  it('AC-9308.3 AC-9319.7: 수량 2면 같은 차례의 두 부위(건초 말 줄 둘, 또는 건초염 진단 둘)를 쉼표로 넣고 수량 both는 붙이지 않는다', () => {
    expect(memo(['Lt knee pain', 'Rt wrist TS', 'Lt knee TS'], [rx('KK062', 2)])).toBe('◈wrist, knee 건초내주사 시행')
    expect(memo(['Lt knee pain', 'Rt shoulder pain', 'Rt wrist pain'], [rx('KK062', 2)], [dx('M6596', '무릎 건초염'), dx('M6581', '어깨 건초염')])).toBe('◈knee, shoulder 건초내주사 시행')
  })

  it('AC-9308.3: 수량이 없거나 0이면 1로 본다', () => {
    for (const qty of [null, 0]) {
      expect(memo(['Rt shoulder pain', 'Lt knee pain'], [rx('KK062', qty)], [dx('M6540', '손목 건초염')])).toBe('◈wrist 건초내주사 시행')
      expect(memo(['Rt shoulder pain', 'Lt knee pain'], [rx('KK062', qty)])).toBe('◈[부위 확인] 건초내주사 시행')
    }
  })

  it('AC-9308.3: 좌우는 지금 규칙대로 부위마다 붙인다(IA·건초내주사 줄 좌우 켬)', () => {
    expect(memo(['Rt wrist TS'], [rx('KK062')], [], iaSide())).toBe('◈Rt wrist 건초내주사 시행')
    expect(memo(['Rt wrist TS', 'Lt knee TS'], [rx('KK062', 2)], [], iaSide())).toBe('◈Rt wrist, Lt knee 건초내주사 시행')
  })

  it('AC-9308.3: 손가락 글은 지금처럼 손 부위 자리에 쓴다', () => {
    expect(memo(['Rt 3rd finger trigger finger'], [rx('KK062')])).toBe('◈3rd finger 건초내주사 시행')
    expect(memo(['Rt thumb TS'], [rx('KK062')], [], iaSide())).toBe('◈Rt thumb 건초내주사 시행')
    expect(memo(['Rt wrist TS', 'Lt 3rd finger trigger finger'], [rx('KK062', 2)], [], iaSide())).toBe('◈Rt wrist, Lt 3rd finger 건초내주사 시행')
  })

  it("AC-9308.4: 건초 말 칸에 'TSI'를 더하면 'Rt wrist TSI' 줄이 첫 차례로 잡힌다", () => {
    const lines = ['Rt shoulder pain', 'Rt wrist TSI']
    expect(memo(lines, [rx('KK062')])).toBe('◈[부위 확인] 건초내주사 시행')
    expect(memo(lines, [rx('KK062')], [], withWords('건초, tendon sheath, trigger finger, 방아쇠, quervain, tenosyn, TS, STI, TSI'))).toBe('◈wrist 건초내주사 시행')
  })

  it('AC-9308.4: 건초 말 칸이 비면 지금 말을 쓰고, 처음 값은 지금 말 그대로다', () => {
    expect(TS_WORDS_FALLBACK).toBe('건초, tendon sheath, trigger finger, 방아쇠, quervain, tenosyn, TS, STI')
    for (const words of ['', '  ']) expect(memo(['Rt shoulder pain', 'Rt wrist TS'], [rx('KK062')], [], withWords(words))).toBe('◈wrist 건초내주사 시행')
    // 지금 말의 tenosyn은 tenosynovitis도 잡는다
    expect(memo(['Rt shoulder pain', 'Rt wrist tenosynovitis'], [rx('KK062')])).toBe('◈wrist 건초내주사 시행')
  })

  it('AC-9308.4: 말은 글자 그대로(escape) 찾고 영문은 단어 경계로 잡는다', () => {
    expect(memo(['Rt shoulder pain', 'Rt wrist TxS'], [rx('KK062')], [], withWords('T.S'))).toBe('◈[부위 확인] 건초내주사 시행')
    expect(memo(['Rt shoulder pain', 'Rt wrist T.S'], [rx('KK062')], [], withWords('T.S'))).toBe('◈wrist 건초내주사 시행')
    expect(memo(['Rt shoulder pain', 'Rt wrist TSIX'], [rx('KK062')], [], withWords('TSI'))).toBe('◈[부위 확인] 건초내주사 시행')
    // 칸에서 TS를 빼면 TS 줄은 더 잡지 않는다
    expect(memo(['Rt shoulder pain', 'Rt wrist TS'], [rx('KK062')], [], withWords('TSI'))).toBe('◈[부위 확인] 건초내주사 시행')
  })
})

describe('REQ-9319 건초내주사 줄 — 좌우·두 부위·넓은 부위·소수 수량', () => {
  it("AC-9319.7: 고른 부위가 둘(elbow·knee)이고 수량 2면 수량 both를 붙이지 않고, 좌우 켬이면 차트 좌우를 쓴다(10월 'both elbow, both knee' → 'Lt elbow, Lt knee')", () => {
    const lines = ['Lt elbow TS', 'Lt knee TS']
    expect(memo(lines, [rx('KK062', 2)])).toBe('◈elbow, knee 건초내주사 시행')
    expect(memo(lines, [rx('KK062', 2)], [], iaSide())).toBe('◈Lt elbow, Lt knee 건초내주사 시행')
    expect(memo(['elbow TS', 'knee TS'], [rx('KK062', 2)], [], iaSide())).toBe('◈elbow, knee 건초내주사 시행')
    expect(choices(lines, [rx('KK062', 2)])).toEqual([])
  })

  it('AC-9319.7: 빈칸이 둘이면 수량 both를 붙이지 않는다', () => {
    const lines = ['Rt elbow TS', 'Lt knee TS', 'Rt wrist TS']
    expect(memo(lines, [rx('KK062', 2)])).toBe('◈[부위 확인], [부위 확인] 건초내주사 시행')
    expect(choices(lines, [rx('KK062', 2)])).toEqual(['elbow', 'knee', 'wrist'])
  })

  it('AC-9319.5 AC-9319.7: 부위가 하나면 수량 2의 both는 지금처럼 붙는다', () => {
    expect(memo(['Rt wrist TS'], [rx('KK062', 2)])).toBe('◈wrist 건초내주사 both 시행')
    expect(memo(['both wrist TS'], [rx('KK062', 2)], [], iaSide())).toBe('◈Both wrist 건초내주사 시행')
  })

  it("AC-9319.6: 좌우 켬이면 건초내주사 줄에 그 부위 조각의 차트 좌우를 붙인다(차트 'Rt shoulder TS', 수량 1 → 'Rt shoulder')", () => {
    expect(memo(['Rt shoulder TS'], [rx('KK062')], [], iaSide())).toBe('◈Rt shoulder 건초내주사 시행')
    expect(memo(['Rt shoulder TS'], [rx('KK062')])).toBe('◈shoulder 건초내주사 시행')
    expect(memo(['Rt knee pain, Lt wrist TS'], [rx('KK062')], [], iaSide())).toBe('◈Lt wrist 건초내주사 시행')
  })

  it('AC-9319.8: 건초 말 줄의 부위가 요추·경추·흉곽·상지뿐이면 부위가 없는 차례로 보고 다음 차례로 간다', () => {
    for (const line of ['L-spine TS', 'C-spine TS', 'chest TS', 'Rt 액, 액하 TS']) {
      expect(memo([line, 'Rt wrist pain'], [rx('KK062')]), line).toBe('◈wrist 건초내주사 시행')
      expect(memo([line], [rx('KK062')]), line).toBe('◈[부위 확인] 건초내주사 시행')
      expect(choices([line], [rx('KK062')]), line).toEqual([])
    }
  })

  it('AC-9319.8: 건초 말 줄에 넓은 부위와 관절이 함께 있으면 관절만 부위로 본다', () => {
    expect(memo(['lumbar TS, Rt wrist TS'], [rx('KK062')])).toBe('◈wrist 건초내주사 시행')
  })

  it('AC-9319.8: 건초염 진단(M65)이 넓은 부위면 그 차례도 건너뛴다', () => {
    expect(memo(['Rt wrist pain'], [rx('KK062')], [dx('M6588', '요추 건초염')])).toBe('◈wrist 건초내주사 시행')
  })

  it('AC-9319.8: 후보 단추에도 넓은 부위는 없다', () => {
    const lines = ['L-spine pain', 'Rt shoulder pain', 'Lt knee pain']
    expect(memo(lines, [rx('KK062')])).toBe('◈[부위 확인] 건초내주사 시행')
    expect(choices(lines, [rx('KK062')])).toEqual(['shoulder', 'knee'])
  })

  it('AC-9319.8: 손가락은 손으로 친다', () => {
    expect(memo(['Rt 3rd finger trigger finger', 'L-spine pain'], [rx('KK062')])).toBe('◈3rd finger 건초내주사 시행')
  })

  it('AC-9319.3: 건초내주사 한도도 소수 올림이다(1.5 → 2)', () => {
    expect(memo(['Rt wrist TS', 'Lt knee TS'], [rx('KK062', 1.5)])).toBe('◈wrist, knee 건초내주사 시행')
    expect(memo(['Rt wrist TS', 'Lt knee TS'], [rx('KK062', 0.5)])).toBe('◈[부위 확인] 건초내주사 시행')
  })
})

describe('AC-9316.1 지금 건초내주사 사례는 그대로', () => {
  it('AC-9316.1: 수량 2에 손가락 건초 말 줄 하나면 지금처럼 그 손가락 한 곳 + both다(가짜 자료 m25)', () => {
    expect(memo(['Rt wrist pain', 'Rt 3rd finger trigger finger'], [rx('KK062', 2)])).toBe('◈3rd finger 건초내주사 both 시행')
  })

  it('AC-9316.1: 건초 말 줄이 다른 시술 줄이어도 그 줄 부위 하나다(가짜 자료 m27)', () => {
    expect(memo(['Rt wrist pain', 'Rt TS SSNB'], [rx('KK062'), rx('LA247')])).toContain('◈shoulder 건초내주사 시행')
  })

  it('AC-9316.1: 건초 말 줄에 부위가 없고 시술·진단 줄 부위가 하나면 그 부위다', () => {
    expect(memo(['Rt wrist pain', 'TS 시행'], [rx('KK062')])).toBe('◈wrist 건초내주사 시행')
  })
})
