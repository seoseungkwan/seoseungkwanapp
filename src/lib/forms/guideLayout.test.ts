import { describe, expect, it } from 'vitest'
import { GUIDE_LIMITS, PICTURE_IDS, type GuideContent, type GuideLine } from '@/types/formGuide'
import { GUIDE_LOGO, GUIDE_PAGE, fitGuide, guideTextWidth, layoutGuide, type Fitted, type GuideLayout } from './guideLayout'

// 서식 탭 환자 안내문 그림(A4 세로 794×1123)의 배치 (specs/forms-guide REQ-4503, design.md 4절, TASK-1).
// 값은 승인 시안 docs/mockups/forms-guide/index.html의 emOf()·measure()·fit()·layout()과 같다

const L = (text: string, em = ''): GuideLine => ({ text, em })
const 가 = (n: number) => '가'.repeat(n)

// 요청서 예시 6장 (design.md 10절 부록)
const EXAMPLES: GuideContent[] = [
  {
    tag: '보험 서류 안내', subtitle: '보험사에 낼 서류는', big1: '수납할 때', big2: '말씀해 주세요', firstSmall: false,
    boxTop: '이렇게 말씀해 주세요', boxBottom: '"보험 서류 필요해요"', picture: 'document', bandTitle: '이런 서류가 필요하실 때', mark: 'check',
    lines: [L('진단서'), L('진료비 영수증'), L('진료비 세부내역서'), L('통원 확인서')], note: '필요한 서류는 보험사마다 다르니 미리 확인해 주세요',
  },
  {
    tag: '영상 CD 안내', subtitle: '다른 병원 영상 CD는', big1: '접수할 때', big2: '먼저 주세요', firstSmall: false,
    boxTop: '이렇게 말씀해 주세요', boxBottom: '"영상 CD 가져왔어요"', picture: 'disc', bandTitle: '이런 영상을 가져오셨다면', mark: 'check',
    lines: [L('엑스레이'), L('CT'), L('MRI')], note: '미리 주시면 진료 때 바로 확인할 수 있습니다',
  },
  {
    tag: '신분증 안내', subtitle: '접수할 때', big1: '신분증을', big2: '보여주세요', firstSmall: false,
    boxTop: '건강보험으로 진료받으시려면', boxBottom: '본인 확인이 필요합니다', picture: 'idcard', bandTitle: '이런 신분증을 가져오세요', mark: 'check',
    lines: [L('주민등록증'), L('운전면허증'), L('건강보험증'), L('모바일 건강보험증')], note: '신분증을 찍은 사진·복사본은 안 됩니다',
  },
  {
    tag: '접수 안내', subtitle: '다른 분을 대신하는', big1: '대리 접수는', big2: '안 됩니다', firstSmall: false,
    boxTop: '접수는', boxBottom: '환자 본인만 가능합니다', picture: 'nosign', bandTitle: '이렇게 해 주세요', mark: 'check',
    lines: [L('환자 본인이 오신 뒤에 접수해 주세요'), L('가족·지인 접수는 대신 할 수 없습니다')], note: '본인 확인과 공정한 순서를 위해 양해 부탁드립니다',
  },
  {
    tag: '진료 시작 전 안내', subtitle: '지금은 진료 시작 전입니다', big1: '순서 대기표를', big2: '적어 주세요', firstSmall: false,
    boxTop: '순서 대기표는', boxBottom: '왼쪽 아래에 있습니다', picture: 'clock', bandTitle: '', mark: 'number',
    lines: [L('순서 대기표를 작성해 주세요'), L('자리에 앉아 기다려 주세요'), L('적으신 순서대로 접수해 드립니다')], note: '진료는 오전 9시, 오후 2시에 시작합니다',
  },
  {
    tag: '도수치료 안내', subtitle: '도수치료 관리급여 적용', big1: '1회 비용', big2: '43,850원', firstSmall: true,
    boxTop: '2026년 7월 1일부터', boxBottom: '건강보험 적용 중입니다', picture: 'spine', bandTitle: '도수치료 전에 꼭 확인하세요', mark: 'check',
    lines: [
      L('물리치료를 먼저 2주 이상 · 4회 이상 받은 뒤', '2주 이상 · 4회 이상'),
      L('물리치료로 좋아지지 않을 때 적용', '좋아지지 않을 때'),
      L('도수치료는 주 2회, 1년 15회까지', '주 2회, 1년 15회'),
    ],
    note: '',
  },
]
const example = (n: number): GuideContent => structuredClone(EXAMPLES[n - 1]!)
// 예시 1에서 칸 몇 개만 바꾼 안내문
const withEx1 = (patch: Partial<GuideContent>): GuideContent => ({ ...example(1), ...patch })
// 4번 예시에 더하면 띠가 넘치는 28자 안의 줄 둘 (시안 '띠 넘침')
const OVER_LINES = [L('보호자는 옆에서 도와주실 수 있습니다'), L('접수 뒤에는 자리에서 기다려 주세요')]

const BAND_OVER = '띠에 다 들어가지 않아요. 줄을 하나 빼거나, 띠 제목·아래 작은 글을 비워 주세요'
const TOO_LONG = '한 줄에 들어가지 않아요. 줄여 주세요'
const BOX_BY_PICTURE = '그림 옆 상자에 들어가지 않아요. 줄이거나 그림을 빼 주세요'
const BOX_TOO_WIDE = '상자에 들어가지 않아요. 줄여 주세요'

// 그린 글·도형의 사각형(글은 dominant-baseline central이라 y ± 크기/2). 머리표 글만 가운데 맞춤
type Rect = { what: string; left: number; right: number; top: number; bottom: number }
const textRect = (what: string, t: Fitted, spacing = 0, centered = false): Rect => {
  const w = guideTextWidth(t.text, t.size, spacing)
  const left = centered ? t.x - w / 2 : t.x
  return { what, left, right: left + w, top: t.y - t.size / 2, bottom: t.y + t.size / 2 }
}
const boxRect = (what: string, b: { x: number; y: number; w: number; h: number }): Rect => ({
  what, left: b.x, right: b.x + b.w, top: b.y, bottom: b.y + b.h,
})
// 띠 안 글: 띠 제목·줄 표시·줄 글·아래 작은 글
function bandRects(g: GuideLayout): Rect[] {
  const out: Rect[] = []
  if (g.bandTitle) out.push(textRect('bandTitle', g.bandTitle))
  g.rows.forEach((r, i) => {
    if (r.circle === null) out.push(textRect(`mark${i}`, { text: '✓', size: r.markSize, x: r.markX, y: r.text.y }))
    else out.push({ what: `mark${i}`, left: r.markX, right: r.markX + r.circle, top: r.text.y - r.circle / 2, bottom: r.text.y + r.circle / 2 })
    out.push(textRect(`row${i}`, r.text))
  })
  if (g.note) out.push(textRect('note', g.note))
  return out
}
function allRects(g: GuideLayout): Rect[] {
  const out: Rect[] = [boxRect('pill', g.pill), textRect('pill.text', g.pill.text, 0, true), textRect('subtitle', g.subtitle, -0.03)]
  g.big.forEach((b, i) => out.push(textRect(`big${i + 1}`, b, -0.03)))
  if (g.box) {
    out.push(boxRect('box', g.box))
    if (g.box.top) out.push(textRect('box.top', g.box.top))
    out.push(textRect('box.bottom', g.box.bottom))
  }
  if (g.picture) out.push({ what: 'picture', left: g.picture.x, right: g.picture.x + g.picture.size, top: g.picture.y, bottom: g.picture.y + g.picture.size })
  out.push(...bandRects(g))
  out.push(boxRect('logo', { x: GUIDE_LOGO.x, y: GUIDE_LOGO.y, w: GUIDE_LOGO.width, h: GUIDE_LOGO.height }))
  return out
}
const overlaps = (a: Rect, b: Rect) => a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom
const rowsOf = (g: GuideLayout) => g.rows.map((r) => ({ n: r.n, markX: r.markX, y: r.text.y }))

describe('AC-4503.2: 글자 폭 어림(guideTextWidth)과 크기 줄이기(fitGuide)', () => {
  it('AC-4503.2: 글자마다 design.md 4절 표의 em(한글·한자 0.87, 숫자 0.71, M·W 0.95, 대문자 0.8, 소문자 0.62, 빈칸 0.22, 문장부호 0.31, " 0.38, 괄호 0.43, ~·- 0.68, 그 밖 0.9)', () => {
    const table: [string, number][] = [
      ['가', 0.87], ['힣', 0.87], ['ㄱ', 0.87], ['漢', 0.87],
      ['0', 0.71], ['7', 0.71],
      ['M', 0.95], ['W', 0.95], ['A', 0.8], ['Z', 0.8], ['a', 0.62], ['z', 0.62],
      [' ', 0.22],
      [',', 0.31], ['.', 0.31], ['·', 0.31], [':', 0.31], [';', 0.31], ["'", 0.31], ['!', 0.31],
      ['"', 0.38], ['(', 0.43], [')', 0.43], ['~', 0.68], ['-', 0.68],
      ['※', 0.9], ['✓', 0.9], ['%', 0.9], ['?', 0.9],
    ]
    for (const [ch, em] of table) expect(guideTextWidth(ch, 100), ch).toBeCloseTo(em * 100, 6)
  })

  it("AC-4503.2: 'MRI'는 2.55em, '43,850원'은 4.73em이고 자간(em)은 글자마다 더한다", () => {
    expect(guideTextWidth('MRI', 100)).toBeCloseTo(255, 6)
    expect(guideTextWidth('MRI', 34)).toBeCloseTo(86.7, 6)
    expect(guideTextWidth('43,850원', 100)).toBeCloseTo(473, 6)
    // 큰 문구 자간 −0.03em × 7글자: (4.73 − 0.21) × 150
    expect(guideTextWidth('43,850원', 150, -0.03)).toBeCloseTo(678, 6)
    expect(guideTextWidth('', 100)).toBe(0)
  })

  it('AC-4503.2: fitGuide는 처음 크기에서 1px씩 줄여 처음으로 드는 크기를 주고, 최소 크기로도 넘으면 { size: 최소, ok: false }', () => {
    expect(fitGuide('보험 서류 안내', 37, 30, 634)).toEqual({ size: 37, ok: true })
    // 9글자 한글(7.56em): 91px에 들고 92px에는 넘는다
    expect(fitGuide(가(9), 109, 72, 692, -0.03)).toEqual({ size: 91, ok: true })
    expect(guideTextWidth(가(9), 91, -0.03)).toBeLessThanOrEqual(692)
    expect(guideTextWidth(가(9), 92, -0.03)).toBeGreaterThan(692)
    expect(fitGuide(가(12), 109, 72, 692, -0.03)).toEqual({ size: 72, ok: false })
  })
})

describe('AC-4503.1: 세 구역과 글자 자리', () => {
  it('AC-4503.1: 윗단 노랑 0~666, 띠 666~954, 로고 칸 954~1123, 글자는 x 51부터 안쪽 폭 692, 띠 아래 끝 938, 로고 400×68', () => {
    expect(GUIDE_PAGE).toEqual({ width: 794, height: 1123, x: 51, inner: 692, bandY: 666, logoY: 954, bandEnd: 938 })
    expect(GUIDE_PAGE.logoY - GUIDE_PAGE.bandY).toBe(288)
    expect(GUIDE_PAGE.height - GUIDE_PAGE.logoY).toBe(169)
    expect(GUIDE_PAGE.x * 2 + GUIDE_PAGE.inner).toBe(GUIDE_PAGE.width)
    expect(GUIDE_LOGO).toEqual({ href: '/poster/logo.png', x: 197, y: 1005, width: 400, height: 68 })
  })

  it('AC-4503.1: 예시 1의 머리표 알약(x 51·y 41·높이 65·폭 = 글 폭 + 58)·작은 제목(y 161.5)·큰 문구(y 260·382)는 x 51에서 시작한다', () => {
    const g = layoutGuide(example(1))
    expect(g.pill).toEqual({ x: 51, y: 41, w: 268, h: 65, text: { text: '보험 서류 안내', size: 37, x: 185, y: 73.5 } })
    expect(g.subtitle).toEqual({ text: '보험사에 낼 서류는', size: 67, x: 51, y: 161.5 })
    expect(g.big).toEqual([
      { text: '수납할 때', size: 109, x: 51, y: 260 },
      { text: '말씀해 주세요', size: 109, x: 51, y: 382 },
    ])
  })

  it.each(EXAMPLES.map((c, i) => [i + 1, c] as const))('AC-4503.1: 예시 %i의 모든 글은 x 51 이상에서 시작해 51 + 692 = 743을 넘지 않는다', (_n, c) => {
    for (const r of allRects(layoutGuide(c)).filter((r) => r.what !== 'logo' && r.what !== 'picture')) {
      expect(r.left, r.what).toBeGreaterThanOrEqual(51)
      expect(r.right, r.what).toBeLessThanOrEqual(743)
    }
  })
})

describe('AC-4503.2: 칸마다 처음 → 최소 크기와 넘침 까닭', () => {
  it('AC-4503.2: 큰 문구는 보통 두 줄이 같은 크기(둘 중 작은 쪽)이다', () => {
    const g = layoutGuide(withEx1({ big1: '수납할 때', big2: 가(9) }))
    expect(g.big.map((b) => b.size)).toEqual([91, 91])
    expect(g.problems).toEqual({})
  })

  it('AC-4503.2: 큰 문구가 72px로도 안 들면 그 줄 열쇠(big1·big2)에 까닭이 붙는다(11글자는 들고 12글자는 넘친다)', () => {
    expect(layoutGuide(withEx1({ big1: 가(11) })).problems).toEqual({})
    const over1 = layoutGuide(withEx1({ big1: 가(12) }))
    expect(over1.problems).toEqual({ big1: TOO_LONG })
    expect(over1.big.map((b) => b.size)).toEqual([72, 72])
    expect(layoutGuide(withEx1({ big2: 가(12) })).problems).toEqual({ big2: TOO_LONG })
  })

  it("AC-4503.2: '윗줄 작게'면 윗줄 80 → 56·아랫줄 150 → 72에서 따로 시작하고 자리는 y 252·381이다", () => {
    const g = layoutGuide(example(6))
    expect(g.big).toEqual([
      { text: '1회 비용', size: 80, x: 51, y: 252 },
      { text: '43,850원', size: 150, x: 51, y: 381 },
    ])
    const shrunk = layoutGuide({ ...example(6), big1: 가(14), big2: 가(9) })
    expect(shrunk.big.map((b) => b.size)).toEqual([58, 91])
    expect(shrunk.problems).toEqual({})
    expect(layoutGuide({ ...example(6), big1: 가(15) }).problems).toEqual({ big1: TOO_LONG })
    expect(layoutGuide({ ...example(6), big2: 가(12) }).problems).toEqual({ big2: TOO_LONG })
  })

  it('AC-4503.2: 머리표(37 → 30, 알약 안쪽 634)가 넘치면 tag 까닭이 붙고 알약 폭은 692를 넘지 않는다', () => {
    const fits = layoutGuide(withEx1({ tag: 가(24) }))
    expect(fits.problems).toEqual({})
    expect(fits.pill.text.size).toBe(30)
    const over = layoutGuide(withEx1({ tag: 가(25) }))
    expect(over.problems).toEqual({ tag: '머리표가 한 줄에 들어가지 않아요. 줄여 주세요' })
    expect(over.pill.w).toBe(692)
    expect(over.pill.text.size).toBe(30)
  })

  it('AC-4503.2: 작은 제목(67 → 56, 자간 −0.03em)이 넘치면 subtitle 까닭이 붙는다', () => {
    expect(layoutGuide(withEx1({ subtitle: 가(14) })).subtitle.size).toBe(58)
    expect(layoutGuide(withEx1({ subtitle: 가(14) })).problems).toEqual({})
    expect(layoutGuide(withEx1({ subtitle: 가(15) })).problems).toEqual({ subtitle: '작은 제목이 한 줄에 들어가지 않아요. 줄여 주세요' })
  })

  it('AC-4503.2: 띠 제목(35 → 28)이 넘치면 bandTitle 까닭이 붙는다', () => {
    expect(layoutGuide(withEx1({ bandTitle: 가(28) })).problems).toEqual({})
    expect(layoutGuide(withEx1({ bandTitle: 가(29) })).problems).toEqual({ bandTitle: '띠 제목이 한 줄에 들어가지 않아요. 줄여 주세요' })
  })

  it("AC-4503.2: 아래 작은 글은 '※ '를 붙여 24 → 20으로 맞추고, 넘치면 note 까닭이 붙는다", () => {
    const g = layoutGuide(example(1))
    expect(g.note).toEqual({ text: '※ 필요한 서류는 보험사마다 다르니 미리 확인해 주세요', size: 24, x: 51, y: 890.5 })
    expect(layoutGuide(withEx1({ note: 가(38) })).problems).toEqual({})
    expect(layoutGuide(withEx1({ note: 가(39) })).problems).toEqual({ note: '아래 작은 글이 한 줄에 들어가지 않아요. 줄여 주세요' })
    expect(layoutGuide(withEx1({ note: '  ' })).note).toBeNull()
  })

  it('AC-4503.2: 줄 글(체크 34 → 26)이 넘치면 그 줄의 원래 자리 열쇠(line<i>)에 까닭이 붙는다(빈 줄도 자리를 센다)', () => {
    const base = withEx1({ bandTitle: '', note: '' })
    expect(layoutGuide({ ...base, lines: [L(''), L(가(28))] }).problems).toEqual({})
    const over = layoutGuide({ ...base, lines: [L(''), L(가(29))] })
    expect(over.problems).toEqual({ line1: TOO_LONG })
    expect(over.rows.map((r) => r.text.size)).toEqual([26])
  })
})

describe('AC-4503.3: 흰 상자', () => {
  it('AC-4503.3: 두 줄 상자는 x 51·높이 124·아래 끝 621, 글 x 84, 윗줄 y = 위 + 36.5, 아랫줄 y = 위 + 78, 폭 = 긴 줄 폭 + 66', () => {
    const g = layoutGuide(example(1))
    expect(g.box).toEqual({
      x: 51, y: 497, w: 393, h: 124,
      top: { text: '이렇게 말씀해 주세요', size: 24, x: 84, y: 533.5 },
      bottom: { text: '"보험 서류 필요해요"', size: 40, x: 84, y: 575 },
    })
    expect(g.picture).toEqual({ x: 566, y: 468, size: 170 })
  })

  it('AC-4503.3: 아랫줄만 쓴 상자는 높이 92·아랫줄 y = 위 + 46이고, 아랫줄이 비면 상자가 없다', () => {
    const g = layoutGuide(withEx1({ boxTop: '' }))
    expect(g.box).toMatchObject({ x: 51, y: 529, h: 92, top: null, bottom: { x: 84, y: 575, size: 40 } })
    expect(layoutGuide(withEx1({ boxTop: '', boxBottom: ' ' })).box).toBeNull()
    expect(layoutGuide(withEx1({ boxBottom: '' })).box).toBeNull()
  })

  it('AC-4503.3: 그림이 있으면 상자 오른쪽 끝이 550(566 − 16) 이하이고, 넘으면 그림 옆 상자 까닭이 붙는다', () => {
    expect(layoutGuide(withEx1({ boxBottom: 가(16) })).problems).toEqual({})
    const over = layoutGuide(withEx1({ boxBottom: 가(17) }))
    expect(over.problems).toEqual({ boxBottom: BOX_BY_PICTURE })
    expect(over.box!.w).toBe(499)
    expect(over.box!.x + over.box!.w).toBe(550)
    expect(layoutGuide(withEx1({ boxTop: 가(24) })).problems).toEqual({})
    expect(layoutGuide(withEx1({ boxTop: 가(25) })).problems).toEqual({ boxTop: BOX_BY_PICTURE })
  })

  it('AC-4503.3: 그림이 없으면 상자 오른쪽 끝이 743 이하이고, 넘으면 상자 까닭이 붙는다', () => {
    const wide = layoutGuide(withEx1({ picture: null, boxBottom: 가(17) }))
    expect(wide.problems).toEqual({})
    expect(wide.picture).toBeNull()
    expect(wide.box!.bottom.size).toBe(40)
    expect(wide.box!.x + wide.box!.w).toBeGreaterThan(550)
    expect(wide.box!.x + wide.box!.w).toBeLessThanOrEqual(743)
    expect(layoutGuide(withEx1({ picture: null, boxBottom: 가(23) })).problems).toEqual({})
    const over = layoutGuide(withEx1({ picture: null, boxBottom: 가(24) }))
    expect(over.problems).toEqual({ boxBottom: BOX_TOO_WIDE })
    expect(over.box!.x + over.box!.w).toBe(743)
  })
})

describe('AC-4503.4: 체크 줄 두 열', () => {
  it('AC-4503.4: 모든 체크 줄이 34px로 296.5 안에 들면 두 열이고 차례는 왼쪽 위 → 오른쪽 위 → 왼쪽 아래 → 오른쪽 아래', () => {
    const g = layoutGuide(example(1))
    expect(g.twoCols).toBe(true)
    expect(rowsOf(g)).toEqual([
      { n: 1, markX: 51, y: 774.25 },
      { n: 2, markX: 403.5, y: 774.25 },
      { n: 3, markX: 51, y: 833.75 },
      { n: 4, markX: 403.5, y: 833.75 },
    ])
    for (const r of g.rows) {
      expect(r.circle).toBeNull()
      expect(r.markSize).toBe(36)
      expect(r.text.size).toBe(34)
      // 글 x = 열 x + 0.855 × ✓크기 + 12
      expect(r.text.x).toBeCloseTo(r.markX + 0.855 * 36 + 12, 6)
      // 열 폭 339.5 안
      expect(r.text.x + guideTextWidth(r.text.text, r.text.size)).toBeLessThanOrEqual(r.markX + 339.5)
    }
  })

  it('AC-4503.4: 10글자 한글 줄(295.8)은 두 열에 들고, 한 줄이라도 11글자(325.4)면 한 열이다', () => {
    const base = withEx1({})
    expect(layoutGuide({ ...base, lines: [L(가(10)), L(가(10))] }).twoCols).toBe(true)
    const one = layoutGuide({ ...base, lines: [L(가(10)), L(가(11))] })
    expect(one.twoCols).toBe(false)
    expect(one.rows.map((r) => r.markX)).toEqual([51, 51])
  })

  it('AC-4503.4: 체크 줄이 하나면 한 열, 번호 줄은 짧아도 늘 한 열이고 번호는 1부터다(빈 줄은 그리지도 세지도 않는다)', () => {
    expect(layoutGuide(withEx1({ lines: [L('진단서')] })).twoCols).toBe(false)
    const g = layoutGuide(withEx1({ mark: 'number', lines: [L('진단서'), L(''), L('영수증'), L('통원 확인서')] }))
    expect(g.twoCols).toBe(false)
    expect(g.rows.map((r) => [r.n, r.text.text])).toEqual([[1, '진단서'], [2, '영수증'], [3, '통원 확인서']])
    expect(new Set(g.rows.map((r) => r.markX))).toEqual(new Set([51]))
  })
})

describe('AC-4503.5: 줄 높이 줄이기와 띠 넘침', () => {
  it('AC-4503.5: 번호 줄은 줄 높이 67, 노랑 원 지름 min(49, 줄 높이 − 8), 원 안 숫자 round(지름 × 0.63), 글 x = 51 + 지름 + 17, 글 35px', () => {
    const g = layoutGuide(example(5))
    expect(g.bandTitle).toBeNull()
    expect(rowsOf(g)).toEqual([
      { n: 1, markX: 51, y: 723.5 },
      { n: 2, markX: 51, y: 790.5 },
      { n: 3, markX: 51, y: 857.5 },
    ])
    for (const r of g.rows) {
      expect(r.circle).toBe(49)
      expect(r.markSize).toBe(31)
      expect(r.text.x).toBe(117)
      expect(r.text.size).toBe(35)
    }
    expect(g.note).toMatchObject({ x: 51, y: 918, size: 24 })
  })

  it('AC-4503.5: 띠 제목은 y 712.75이고 줄은 그 아래(띠 위 + 24 + 54.5)부터 시작한다', () => {
    const g = layoutGuide(example(1))
    expect(g.bandTitle).toEqual({ text: '이런 서류가 필요하실 때', size: 35, x: 51, y: 712.75 })
    expect(g.rows[0]!.text.y - 59.5 / 2).toBeCloseTo(744.5, 6)
  })

  it('AC-4503.5: 줄이 다 안 들면 줄 높이를 남은 높이 / 줄 수로 줄이고(최소 이상이면 까닭 없음), 아래 작은 글은 줄들 끝 + 27에 둔다', () => {
    const g = layoutGuide(withEx1({ bandTitle: '', lines: [L(가(11)), L(가(11)), L(가(11)), L(가(11))] }))
    expect(g.problems).toEqual({})
    expect(g.twoCols).toBe(false)
    // 남은 높이 938 − 690 − 42.5 = 205.5, 줄 높이 205.5 / 4 = 51.375
    const ys = g.rows.map((r) => r.text.y)
    ys.forEach((y, i) => expect(y).toBeCloseTo(690 + 51.375 * (i + 0.5), 6))
    expect(g.note!.y).toBeCloseTo(690 + 205.5 + 27, 6)
  })

  it('AC-4503.5: 체크 최소 44로도 938을 넘치면 band 까닭이 붙고 최소 높이로 그린다(예시 4 + 줄 둘)', () => {
    const c = example(4)
    c.lines.push(...OVER_LINES)
    for (const l of c.lines) expect(Array.from(l.text).length).toBeLessThanOrEqual(GUIDE_LIMITS.line)
    const g = layoutGuide(c)
    expect(g.problems).toEqual({ band: BAND_OVER })
    expect(g.twoCols).toBe(false)
    g.rows.forEach((r, i) => expect(r.text.y).toBeCloseTo(744.5 + 44 * (i + 0.5), 6))
  })

  it('AC-4503.5: 번호 줄은 최소 54라 체크로는 드는 줄(띠 제목·작은 글·줄 셋)도 넘친다', () => {
    const c = withEx1({ lines: [L(가(11)), L(가(11)), L(가(11))] })
    expect(layoutGuide(c).problems).toEqual({})
    const n = layoutGuide({ ...c, mark: 'number' })
    expect(n.problems).toEqual({ band: BAND_OVER })
    n.rows.forEach((r, i) => {
      expect(r.text.y).toBeCloseTo(744.5 + 54 * (i + 0.5), 6)
      expect(r.circle).toBe(46)
    })
    expect(layoutGuide({ ...c, mark: 'number', bandTitle: '' }).problems).toEqual({})
  })
})

describe('AC-4503.6: 요청서 예시 6장', () => {
  it('AC-4503.6: 예시 6장은 칸 한도(GUIDE_LIMITS) 안이고 그림은 PICTURE_IDS 16개 안이다', () => {
    expect(GUIDE_LIMITS).toEqual({ tag: 10, subtitle: 14, big1: 8, big2: 8, boxTop: 16, boxBottom: 14, bandTitle: 16, line: 28, note: 28, lines: 4 })
    expect(PICTURE_IDS).toEqual([
      'spine', 'knee', 'hand', 'syringe', 'document', 'disc', 'idcard', 'clock',
      'chair', 'ticket', 'calendar', 'card', 'pill', 'xray', 'nosign', 'warning',
    ])
    const count = (s: string) => Array.from(s.trim()).length
    for (const c of EXAMPLES) {
      for (const key of ['tag', 'subtitle', 'big1', 'big2', 'boxTop', 'boxBottom', 'bandTitle', 'note'] as const) {
        expect(count(c[key]), `${c.tag} ${key}`).toBeLessThanOrEqual(GUIDE_LIMITS[key])
      }
      expect(c.lines.length).toBeLessThanOrEqual(GUIDE_LIMITS.lines)
      for (const l of c.lines) expect(count(l.text), l.text).toBeLessThanOrEqual(GUIDE_LIMITS.line)
      expect(PICTURE_IDS).toContain(c.picture)
    }
  })

  it.each(EXAMPLES.map((c, i) => [i + 1, c] as const))('AC-4503.6: 예시 %i는 배치 까닭이 없다', (_n, c) => {
    expect(layoutGuide(c).problems).toEqual({})
  })

  it('AC-4503.6: 1·3번은 체크 두 열(2×2), 2번은 두 열(2+1)이다', () => {
    for (const n of [1, 3]) {
      const g = layoutGuide(example(n))
      expect(g.twoCols, `예시 ${n}`).toBe(true)
      expect(g.rows.map((r) => r.markX), `예시 ${n}`).toEqual([51, 403.5, 51, 403.5])
    }
    const g2 = layoutGuide(example(2))
    expect(g2.twoCols).toBe(true)
    expect(g2.rows.map((r) => [r.text.text, r.markX])).toEqual([['엑스레이', 51], ['CT', 403.5], ['MRI', 51]])
    expect(g2.rows[0]!.text.y).toBe(g2.rows[1]!.text.y)
    expect(g2.rows[2]!.text.y).toBeGreaterThan(g2.rows[0]!.text.y)
  })

  it('AC-4503.6: 4·6번은 한 열, 5번은 번호 세 줄, 6번은 윗줄 작게이고 줄 안 강조 낱말을 그대로 넘긴다', () => {
    for (const n of [4, 6]) expect(layoutGuide(example(n)).twoCols, `예시 ${n}`).toBe(false)
    const g5 = layoutGuide(example(5))
    expect(g5.rows.map((r) => [r.n, r.circle])).toEqual([[1, 49], [2, 49], [3, 49]])
    const g6 = layoutGuide(example(6))
    expect(g6.big.map((b) => [b.y, b.size])).toEqual([[252, 80], [381, 150]])
    expect(g6.rows.map((r) => r.em)).toEqual(['2주 이상 · 4회 이상', '좋아지지 않을 때', '주 2회, 1년 15회'])
    expect(g6.note).toBeNull()
  })

  it('AC-4503.6: 줄에 없는 강조 낱말은 배치에서 빈 글이 된다(까닭은 칸 검사 몫)', () => {
    const c = example(6)
    c.lines[1] = L('물리치료로 좋아지지 않을 때 적용', '없는 낱말')
    const g = layoutGuide(c)
    expect(g.rows[1]!.em).toBe('')
    expect(g.rows[0]!.em).toBe('2주 이상 · 4회 이상')
  })

  it('AC-4503.6: 4번 예시에 28자 안의 줄 둘을 더하면 띠 넘침 까닭이 붙는다', () => {
    const c = example(4)
    c.lines.push(...OVER_LINES)
    expect(layoutGuide(c).problems).toEqual({ band: BAND_OVER })
  })
})

describe('AC-4503.7: 까닭이 없는 배치의 자리', () => {
  it.each(EXAMPLES.map((c, i) => [i + 1, c] as const))('AC-4503.7: 예시 %i의 모든 글·상자·그림 사각형이 794×1123 안에 있다', (_n, c) => {
    const g = layoutGuide(c)
    expect(g.problems).toEqual({})
    for (const r of allRects(g)) {
      expect(r.left, r.what).toBeGreaterThanOrEqual(0)
      expect(r.top, r.what).toBeGreaterThanOrEqual(0)
      expect(r.right, r.what).toBeLessThanOrEqual(794)
      expect(r.bottom, r.what).toBeLessThanOrEqual(1123)
    }
  })

  it.each(EXAMPLES.map((c, i) => [i + 1, c] as const))('AC-4503.7: 예시 %i의 흰 상자와 그림은 겹치지 않는다', (_n, c) => {
    const g = layoutGuide(c)
    const rects = allRects(g)
    const box = rects.find((r) => r.what === 'box')
    const picture = rects.find((r) => r.what === 'picture')
    expect(box).toBeDefined()
    expect(picture).toBeDefined()
    expect(overlaps(box!, picture!)).toBe(false)
    expect(box!.right).toBeLessThanOrEqual(550)
  })

  it.each(EXAMPLES.map((c, i) => [i + 1, c] as const))('AC-4503.7: 예시 %i의 띠 안 글(띠 제목·줄 표시·줄 글·아래 작은 글)은 666~938 안에 있다', (_n, c) => {
    const rects = bandRects(layoutGuide(c))
    expect(rects.length).toBeGreaterThan(0)
    for (const r of rects) {
      expect(r.top, r.what).toBeGreaterThanOrEqual(666)
      expect(r.bottom, r.what).toBeLessThanOrEqual(938)
    }
  })

  it('AC-4503.7: 머리표 글은 알약 안 가운데에 있다', () => {
    for (const c of EXAMPLES) {
      const g = layoutGuide(c)
      const t = textRect('pill.text', g.pill.text, 0, true)
      expect(g.pill.text.x).toBe(g.pill.x + g.pill.w / 2)
      expect(g.pill.text.y).toBe(g.pill.y + g.pill.h / 2)
      expect(t.left).toBeGreaterThanOrEqual(g.pill.x)
      expect(t.right).toBeLessThanOrEqual(g.pill.x + g.pill.w)
    }
  })
})
