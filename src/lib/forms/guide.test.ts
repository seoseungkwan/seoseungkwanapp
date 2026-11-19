import { describe, expect, it } from 'vitest'
import { DRAWING_LIMITS, GUIDE_LIMITS, PICTURE_IDS, type DrawKind, type DrawShape, type GuideContent, type GuideDrawing, type GuideField, type GuideLine } from '@/types/formGuide'
import {
  BLANK_GUIDE,
  checkGuide,
  checkGuideColors,
  checkGuideValue,
  guideColorsOf,
  guideFileName,
  guideProblems,
  guideTitle,
  savableGuide,
  type GuideValue,
} from './guide'
import { layoutGuide } from './guideLayout'
import type { GuideColors } from './logoColors'

// 서식 탭 환자 안내문의 칸 규칙: 칸 검사·저장 값 검사·목록 제목·파일 이름 (specs/forms-guide REQ-4502, design.md 3절, TASK-3).
// 배치 넘침 까닭(칸 넘침·띠 넘침 band)은 guideLayout.ts 몫이고, 여기서는 guideProblems가 둘을 합친다(칸 검사 까닭이 이긴다)

const L = (text: string, em = ''): GuideLine => ({ text, em })
const 가 = (n: number) => '가'.repeat(n)

// 요청서 예시 6장 (design.md 10절 부록, guideLayout.test.ts와 같은 값)
const EXAMPLES: GuideContent[] = [
  {
    tag: '보험 서류 안내', subtitle: '보험사에 낼 서류는', big1: '수납할 때', big2: '말씀해 주세요', firstSmall: false,
    boxTop: '이렇게 말씀해 주세요', boxBottom: '"보험 서류 필요해요"', picture: 'document', drawing: null, bandTitle: '이런 서류가 필요하실 때', mark: 'check',
    lines: [L('진단서'), L('진료비 영수증'), L('진료비 세부내역서'), L('통원 확인서')], note: '필요한 서류는 보험사마다 다르니 미리 확인해 주세요',
  },
  {
    tag: '영상 CD 안내', subtitle: '다른 병원 영상 CD는', big1: '접수할 때', big2: '먼저 주세요', firstSmall: false,
    boxTop: '이렇게 말씀해 주세요', boxBottom: '"영상 CD 가져왔어요"', picture: 'disc', drawing: null, bandTitle: '이런 영상을 가져오셨다면', mark: 'check',
    lines: [L('엑스레이'), L('CT'), L('MRI')], note: '미리 주시면 진료 때 바로 확인할 수 있습니다',
  },
  {
    tag: '신분증 안내', subtitle: '접수할 때', big1: '신분증을', big2: '보여주세요', firstSmall: false,
    boxTop: '건강보험으로 진료받으시려면', boxBottom: '본인 확인이 필요합니다', picture: 'idcard', drawing: null, bandTitle: '이런 신분증을 가져오세요', mark: 'check',
    lines: [L('주민등록증'), L('운전면허증'), L('건강보험증'), L('모바일 건강보험증')], note: '신분증을 찍은 사진·복사본은 안 됩니다',
  },
  {
    tag: '접수 안내', subtitle: '다른 분을 대신하는', big1: '대리 접수는', big2: '안 됩니다', firstSmall: false,
    boxTop: '접수는', boxBottom: '환자 본인만 가능합니다', picture: 'nosign', drawing: null, bandTitle: '이렇게 해 주세요', mark: 'check',
    lines: [L('환자 본인이 오신 뒤에 접수해 주세요'), L('가족·지인 접수는 대신 할 수 없습니다')], note: '본인 확인과 공정한 순서를 위해 양해 부탁드립니다',
  },
  {
    tag: '진료 시작 전 안내', subtitle: '지금은 진료 시작 전입니다', big1: '순서 대기표를', big2: '적어 주세요', firstSmall: false,
    boxTop: '순서 대기표는', boxBottom: '왼쪽 아래에 있습니다', picture: 'clock', drawing: null, bandTitle: '', mark: 'number',
    lines: [L('순서 대기표를 작성해 주세요'), L('자리에 앉아 기다려 주세요'), L('적으신 순서대로 접수해 드립니다')], note: '진료는 오전 9시, 오후 2시에 시작합니다',
  },
  {
    tag: '도수치료 안내', subtitle: '도수치료 관리급여 적용', big1: '1회 비용', big2: '43,850원', firstSmall: true,
    boxTop: '2026년 7월 1일부터', boxBottom: '건강보험 적용 중입니다', picture: 'spine', drawing: null, bandTitle: '도수치료 전에 꼭 확인하세요', mark: 'check',
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
// 4번 예시에 더하면 띠가 넘치는 28자 안의 줄 둘 (guideLayout.test.ts와 같음)
const OVER_LINES = [L('보호자는 옆에서 도와주실 수 있습니다'), L('접수 뒤에는 자리에서 기다려 주세요')]

// 시안 '휠체어' AI 그림 (guideDrawing.test.ts와 같음)
const SH = (kind: DrawKind, nums: number[], fill: DrawShape['fill'], stroke: DrawShape['stroke'], width: number, d = ''): DrawShape => ({
  kind, nums, d, fill, stroke, width,
})
const WHEELCHAIR: GuideDrawing = {
  subject: '휠체어',
  shapes: [
    SH('circle', [78, 108, 34], 'yellow', 'dark', 9), SH('circle', [78, 108, 9], 'white', 'dark', 5),
    SH('path', [], 'none', 'dark', 10, 'M58 46 L58 90 L108 90'), SH('path', [], 'none', 'dark', 9, 'M108 90 L120 122 L134 122'),
    SH('circle', [122, 132, 7], 'white', 'dark', 5), SH('path', [], 'none', 'dark', 9, 'M58 46 L44 46'),
  ],
}
const wheelchair = (): GuideDrawing => structuredClone(WHEELCHAIR)
// 예시 1의 그림을 AI 그림으로 바꾼 안내문
const custom = (drawing: unknown = wheelchair()): Record<string, unknown> => ({ ...example(1), picture: 'custom', drawing })

// 까닭 글 (design.md 3절)
const PRIVATE = '전화번호·주민번호·메일 주소 모양은 넣을 수 없어요'
const TOP_ONLY = '윗줄만 쓸 수는 없어요. 아랫줄을 적어 주세요'
const EM_MISSING = '그 줄에 있는 낱말만 강조할 수 있어요'
const NO_LINES = '줄을 하나 이상 적어 주세요'
const TOO_MANY = '줄은 4개까지예요'
const BLANK_LINE = '줄 글을 적거나 [빼기]를 눌러 주세요'
const over = (n: number) => `${n}자까지 적을 수 있어요`
const BAND_OVER = '띠에 다 들어가지 않아요. 줄을 하나 빼거나, 띠 제목·아래 작은 글을 비워 주세요'
const TOO_LONG = '한 줄에 들어가지 않아요. 줄여 주세요'

const REQUIRED: [GuideField, string][] = [
  ['tag', '머리표를 적어 주세요'],
  ['subtitle', '작은 제목을 적어 주세요'],
  ['big1', '큰 문구 윗줄을 적어 주세요'],
  ['big2', '큰 문구 아랫줄을 적어 주세요'],
]
const OPTIONAL: GuideField[] = ['boxTop', 'boxBottom', 'bandTitle', 'note']
const TEXT_FIELDS: GuideField[] = ['tag', 'subtitle', 'big1', 'big2', 'boxTop', 'boxBottom', 'bandTitle', 'note']
const KEYS = ['tag', 'subtitle', 'big1', 'big2', 'firstSmall', 'boxTop', 'boxBottom', 'picture', 'drawing', 'bandTitle', 'mark', 'lines', 'note']

describe('AC-4502.1: checkGuide — 글자 수와 필수 칸', () => {
  it.each(EXAMPLES.map((c, i) => [i + 1, c] as const))('AC-4502.1: 요청서 예시 %i은 칸 검사·배치 검사 까닭이 없다', (_n, c) => {
    expect(checkGuide(c)).toEqual({})
    expect(guideProblems(c)).toEqual({})
  })

  it.each(REQUIRED)('AC-4502.1: 필수 칸 %s가 비었거나 공백뿐이면 "%s"', (key, message) => {
    expect(checkGuide(withEx1({ [key]: '' }))).toEqual({ [key]: message })
    expect(checkGuide(withEx1({ [key]: '   ' }))).toEqual({ [key]: message })
  })

  it.each(OPTIONAL.map((key) => [key] as const))('AC-4502.1: 고를 수 있는 칸 %s는 비어도 된다', (key) => {
    // 흰 상자 아랫줄을 비우면 윗줄만 남으니, 아랫줄은 윗줄도 함께 비운다
    const other = key === 'boxBottom' ? { boxTop: '' } : {}
    expect(checkGuide(withEx1({ ...other, [key]: '' }))).toEqual({})
    expect(checkGuide(withEx1({ ...other, [key]: '   ' }))).toEqual({})
  })

  it.each(TEXT_FIELDS.map((key) => [key, GUIDE_LIMITS[key as keyof typeof GUIDE_LIMITS]] as const))(
    'AC-4502.1: %s는 %i자까지 들고 한 자 넘으면 "<n>자까지 적을 수 있어요"',
    (key, max) => {
      expect(checkGuide(withEx1({ [key]: 가(max) })), `${max}자`).toEqual({})
      expect(checkGuide(withEx1({ [key]: 가(max + 1) })), `${max + 1}자`).toEqual({ [key]: over(max) })
    },
  )

  it('AC-4502.1: 한도 표는 머리표 10 · 작은 제목 14 · 큰 문구 각 8 · 흰 상자 16·14 · 띠 제목 16 · 줄 28 · 아래 작은 글 28 · 줄 4개', () => {
    expect(GUIDE_LIMITS).toEqual({ tag: 10, subtitle: 14, big1: 8, big2: 8, boxTop: 16, boxBottom: 14, bandTitle: 16, line: 28, note: 28, lines: 4 })
  })

  it('AC-4502.1: 글자 수는 앞뒤 공백을 뗀 유니코드 글자 수로 센다', () => {
    expect(checkGuide(withEx1({ tag: `   ${가(10)}   ` }))).toEqual({})
    // 그림 글자 하나는 UTF-16 두 칸이지만 한 글자로 센다
    expect(checkGuide(withEx1({ tag: '🦽'.repeat(10) }))).toEqual({})
    expect(checkGuide(withEx1({ tag: '🦽'.repeat(11) }))).toEqual({ tag: over(10) })
    // 가운데 빈칸은 글자로 센다
    expect(checkGuide(withEx1({ big1: '가 가 가 가 ' }))).toEqual({})
    expect(checkGuide(withEx1({ big1: '가 가 가 가 가' }))).toEqual({ big1: over(8) })
  })

  it('AC-4502.1: 줄 글은 1~28자이고 넘치면 line<i>에 까닭이 붙는다', () => {
    expect(checkGuide(withEx1({ lines: [L(가(28)), L('진단서')] }))).toEqual({})
    expect(checkGuide(withEx1({ lines: [L('진단서'), L(가(29))] }))).toEqual({ line1: over(28) })
    expect(checkGuide(withEx1({ lines: [L(` ${가(28)} `)] }))).toEqual({})
  })

  it('AC-4502.1: 줄이 없거나 모두 빈 글이면 lines에 "줄을 하나 이상 적어 주세요"(빈 줄마다 line<i>는 붙이지 않는다)', () => {
    expect(checkGuide(withEx1({ lines: [] }))).toEqual({ lines: NO_LINES })
    expect(checkGuide(withEx1({ lines: [L('')] }))).toEqual({ lines: NO_LINES })
    expect(checkGuide(withEx1({ lines: [L('  '), L('')] }))).toEqual({ lines: NO_LINES })
  })

  it('AC-4502.1: 줄이 5개 이상이면 lines에 "줄은 4개까지예요"', () => {
    const five = [L('하나'), L('둘'), L('셋'), L('넷'), L('다섯')]
    expect(checkGuide(withEx1({ lines: five.slice(0, 4) }))).toEqual({})
    expect(checkGuide(withEx1({ lines: five }))).toEqual({ lines: TOO_MANY })
    expect(checkGuide(withEx1({ lines: [...five, L('여섯')] }))).toEqual({ lines: TOO_MANY })
  })

  it('AC-4502.1: 다른 줄이 있을 때 빈 줄 글은 line<i>에 "줄 글을 적거나 [빼기]를 눌러 주세요"', () => {
    expect(checkGuide(withEx1({ lines: [L('진단서'), L('')] }))).toEqual({ line1: BLANK_LINE })
    expect(checkGuide(withEx1({ lines: [L('   '), L('진단서'), L('')] }))).toEqual({ line0: BLANK_LINE, line2: BLANK_LINE })
  })

  it('AC-4502.1: 빈 칸 여럿은 칸마다 까닭이 붙는다', () => {
    expect(checkGuide(withEx1({ tag: '', big2: '', lines: [] }))).toEqual({
      tag: '머리표를 적어 주세요',
      big2: '큰 문구 아랫줄을 적어 주세요',
      lines: NO_LINES,
    })
  })
})

describe('AC-4502.2: 흰 상자 윗줄만', () => {
  it('AC-4502.2: 윗줄만 적고 아랫줄이 비었으면 boxBottom에 "윗줄만 쓸 수는 없어요. 아랫줄을 적어 주세요"', () => {
    expect(checkGuide(withEx1({ boxTop: '이렇게 말씀해 주세요', boxBottom: '' }))).toEqual({ boxBottom: TOP_ONLY })
    expect(checkGuide(withEx1({ boxTop: '이렇게 말씀해 주세요', boxBottom: '   ' }))).toEqual({ boxBottom: TOP_ONLY })
  })

  it('AC-4502.2: 아랫줄만 쓰거나 둘 다 비우는 것은 된다', () => {
    expect(checkGuide(withEx1({ boxTop: '', boxBottom: '"보험 서류 필요해요"' }))).toEqual({})
    expect(checkGuide(withEx1({ boxTop: '  ', boxBottom: '' }))).toEqual({})
  })

  it('AC-4502.2: 배치는 윗줄만인 상자를 그리지 않아 까닭을 붙이지 않으므로 guideProblems의 까닭은 칸 검사에서 온다', () => {
    const c = withEx1({ boxTop: '이렇게 말씀해 주세요', boxBottom: '' })
    expect(layoutGuide(c).problems).toEqual({})
    expect(guideProblems(c)).toEqual({ boxBottom: TOP_ONLY })
  })
})

describe('AC-4502.3: 줄의 강조 낱말', () => {
  it('AC-4502.3: 강조는 빈 글이거나 그 줄 글 안에 그대로 있는 글이어야 한다', () => {
    expect(checkGuide(example(6))).toEqual({})
    expect(checkGuide(withEx1({ lines: [L('진단서', ''), L('진료비 영수증', '영수증')] }))).toEqual({})
  })

  it('AC-4502.3: 그 줄에 없는 강조는 em<i>에 "그 줄에 있는 낱말만 강조할 수 있어요"', () => {
    const c = example(6)
    c.lines[1] = L('물리치료로 좋아지지 않을 때 적용', '3주')
    expect(checkGuide(c)).toEqual({ em1: EM_MISSING })
    // 다른 줄에 있는 낱말도 그 줄에 없으면 안 된다
    const other = example(6)
    other.lines[2] = L('도수치료는 주 2회, 1년 15회까지', '좋아지지 않을 때')
    expect(checkGuide(other)).toEqual({ em2: EM_MISSING })
    // 띄어쓰기가 다르면 그대로 있는 글이 아니다
    expect(checkGuide(withEx1({ lines: [L('진료비 영수증', '진료비영수증')] }))).toEqual({ em0: EM_MISSING })
  })

  it('AC-4502.3: 빈 줄 글에 강조만 있어도 em<i>에 까닭이 붙는다', () => {
    expect(checkGuide(withEx1({ lines: [L('진단서'), L('', '진단서')] }))).toEqual({ line1: BLANK_LINE, em1: EM_MISSING })
  })

  it('AC-4502.3: 배치는 줄에 없는 강조를 그리지 않을 뿐 까닭을 붙이지 않으므로 guideProblems의 까닭은 칸 검사에서 온다', () => {
    const c = withEx1({ lines: [L('진단서', '영수증')] })
    expect(layoutGuide(c).problems).toEqual({})
    expect(guideProblems(c)).toEqual({ em0: EM_MISSING })
  })
})

describe('AC-4502.4: 제어 문자와 개인정보 모양', () => {
  it.each(TEXT_FIELDS.map((key) => [key] as const))('AC-4502.4: %s에 메일 주소·제어 문자가 있으면 그 칸에 까닭이 붙는다', (key) => {
    for (const bad of ['a@b.co', '가\u0007나', '가\u0000나']) {
      expect(checkGuide(withEx1({ [key]: bad })), JSON.stringify(bad)).toEqual({ [key]: PRIVATE })
    }
  })

  it.each((['subtitle', 'boxTop', 'boxBottom', 'bandTitle', 'note'] as const).map((key) => [key] as const))(
    'AC-4502.4: %s에 전화번호(010-1234-5678·01012345678)·주민번호 모양이 있으면 그 칸에 까닭이 붙는다',
    (key) => {
      for (const bad of ['010-1234-5678', '01012345678', '900101-1234567']) {
        expect(checkGuide(withEx1({ [key]: bad })), bad).toEqual({ [key]: PRIVATE })
      }
    },
  )

  it('AC-4502.4: 줄 글에 개인정보 모양이 있으면 line<i>에, 강조에 있으면 em<i>에 까닭이 붙는다', () => {
    expect(checkGuide(withEx1({ lines: [L('진단서'), L('문의 010-1234-5678')] }))).toEqual({ line1: PRIVATE })
    expect(checkGuide(withEx1({ lines: [L('메일은 a@b.co로')] }))).toEqual({ line0: PRIVATE })
    expect(checkGuide(withEx1({ lines: [L('가\u0007나')] }))).toEqual({ line0: PRIVATE })
    expect(checkGuide(withEx1({ lines: [L('문의 010-1234-5678', '010-1234-5678')] }))).toEqual({ line0: PRIVATE, em0: PRIVATE })
    expect(checkGuide(withEx1({ lines: [L('진단서', 'a@b.co')] }))).toEqual({ em0: PRIVATE })
  })

  it('AC-4502.4: 숫자가 들어간 보통 글(금액·날짜·횟수)은 막지 않는다', () => {
    expect(checkGuide(example(6))).toEqual({})
    expect(checkGuide(withEx1({ note: '진료는 오전 9시, 오후 2시에 시작합니다' }))).toEqual({})
  })
})

describe('AC-4503.2·4503.5: guideProblems — 배치 까닭과 칸 검사 까닭을 합친다', () => {
  it('AC-4503.5: 4번 예시에 줄 둘을 더하면 칸 검사는 까닭이 없고 guideProblems에는 band 까닭이 있다', () => {
    const c = { ...example(4), lines: [...example(4).lines, ...OVER_LINES] }
    expect(checkGuide(c)).toEqual({})
    expect(guideProblems(c)).toEqual({ band: BAND_OVER })
  })

  it('AC-4503.2: 한 칸에 배치 까닭과 칸 검사 까닭이 함께 있으면 칸 검사 까닭이 이긴다', () => {
    const c = withEx1({ big1: 가(12) })
    expect(layoutGuide(c).problems).toEqual({ big1: TOO_LONG })
    expect(guideProblems(c)).toEqual({ big1: over(8) })
  })

  it('AC-4503.2: 서로 다른 칸의 까닭은 모두 남는다', () => {
    const c = { ...example(4), tag: '', lines: [...example(4).lines, ...OVER_LINES] }
    expect(guideProblems(c)).toEqual({ band: BAND_OVER, tag: '머리표를 적어 주세요' })
  })
})

describe('AC-4502.5: checkGuideValue — 저장한 줄·저장 직전 값 검사', () => {
  it.each(EXAMPLES.map((c, i) => [i + 1, c] as const))('AC-4502.5: 요청서 예시 %i은 같은 값의 새 객체로 돌려준다', (_n, c) => {
    const input = structuredClone(c)
    const out = checkGuideValue(input)
    expect(out).toEqual(c)
    expect(out).not.toBe(input)
    expect(out!.lines).not.toBe(input.lines)
    expect(Object.keys(out!).sort()).toEqual([...KEYS].sort())
  })

  it('AC-4502.5: 글 칸(줄 글·강조 포함)은 앞뒤 공백을 뗀 값으로 새 객체를 만들고, 받은 값은 고치지 않는다', () => {
    const padded = {
      ...example(6),
      tag: ' 도수치료 안내 ', subtitle: '\t도수치료 관리급여 적용', big1: '1회 비용  ', big2: ' 43,850원',
      boxTop: ' 2026년 7월 1일부터 ', boxBottom: '건강보험 적용 중입니다 ', bandTitle: ' 도수치료 전에 꼭 확인하세요', note: '   ',
      lines: example(6).lines.map((l) => L(` ${l.text} `, ` ${l.em} `)),
    }
    const before = structuredClone(padded)
    expect(checkGuideValue(padded)).toEqual(example(6))
    expect(padded).toEqual(before)
  })

  it('AC-4502.5: 열쇠가 13개에서 하나라도 더하거나 빠지면 null', () => {
    expect(checkGuideValue({ ...example(1), extra: 1 })).toBeNull()
    expect(checkGuideValue({ ...example(1), memo: '대충 적은 글' })).toBeNull()
    for (const key of KEYS) {
      const missing: Record<string, unknown> = example(1)
      delete missing[key]
      expect(checkGuideValue(missing), key).toBeNull()
    }
  })

  it('AC-4502.5: 객체가 아니면 null', () => {
    for (const bad of [null, undefined, 'x', 1, true, [], [example(1)]]) expect(checkGuideValue(bad), String(bad)).toBeNull()
  })

  it.each(TEXT_FIELDS.map((key) => [key] as const))('AC-4502.5: 글 칸 %s가 문자열이 아니면 null', (key) => {
    for (const bad of [null, 1, ['보험'], { text: '보험' }]) expect(checkGuideValue({ ...example(1), [key]: bad }), String(bad)).toBeNull()
  })

  it('AC-4502.5: firstSmall은 참/거짓만, mark는 check|number만', () => {
    expect(checkGuideValue({ ...example(1), firstSmall: true })).toEqual({ ...example(1), firstSmall: true })
    for (const bad of ['true', 1, 0, null]) expect(checkGuideValue({ ...example(1), firstSmall: bad }), String(bad)).toBeNull()
    // 예시 1(줄 4개)은 번호로 바꾸면 띠가 넘치니, 줄 2개인 예시 4로 본다
    expect(checkGuideValue({ ...example(4), mark: 'number' })).toEqual({ ...example(4), mark: 'number' })
    expect(checkGuideValue({ ...example(5), mark: 'check' })).toEqual({ ...example(5), mark: 'check' })
    for (const bad of ['circle', 'Check', '', null, 1]) expect(checkGuideValue({ ...example(1), mark: bad }), String(bad)).toBeNull()
  })

  it('AC-4502.5: 그림은 16개 열쇠 중 하나나 null이면 되고, 그 밖(모르는 열쇠·none·빈 글·수)은 null', () => {
    for (const id of PICTURE_IDS) expect(checkGuideValue({ ...example(1), picture: id }), id).toEqual({ ...example(1), picture: id })
    expect(checkGuideValue({ ...example(1), picture: null })).toEqual({ ...example(1), picture: null })
    for (const bad of ['cat', 'none', '', 'Document', 1, true]) expect(checkGuideValue({ ...example(1), picture: bad }), String(bad)).toBeNull()
  })

  it('AC-4502.5: 그림이 custom이고 drawing이 checkDrawing을 넘으면 그 결과(다시 만든 그림)로 돌려준다', () => {
    expect(checkGuideValue(custom())).toEqual({ ...example(1), picture: 'custom', drawing: WHEELCHAIR })
    const input = custom()
    expect((checkGuideValue(input) as GuideContent).drawing).not.toBe(input.drawing)
    // 그릴 것의 앞뒤 공백을 떼고 수를 소수 한 자리로 반올림한 값
    const rough = { subject: '  공 ', shapes: [SH('circle', [85.04, 84.96, 50.55], 'yellow', 'dark', 7.07)] }
    expect(checkGuideValue(custom(rough))!.drawing).toEqual({ subject: '공', shapes: [SH('circle', [85, 85, 50.6], 'yellow', 'dark', 7.1)] })
  })

  it('AC-4502.5: 그림이 custom인데 drawing이 null이거나 checkDrawing을 못 넘으면 null', () => {
    expect(checkGuideValue(custom(null))).toBeNull()
    expect(checkGuideValue(custom({ ...wheelchair(), shapes: [] }))).toBeNull()
    expect(checkGuideValue(custom({ ...wheelchair(), subject: '' }))).toBeNull()
    expect(checkGuideValue(custom({ ...wheelchair(), shapes: [{ ...SH('circle', [85, 85, 50], 'yellow', 'dark', 7), kind: 'star' }] }))).toBeNull()
    expect(checkGuideValue(custom({ ...wheelchair(), shapes: [SH('circle', [85, 85, 50], 'yellow', 'dark', 13)] }))).toBeNull()
    expect(checkGuideValue(custom({ ...wheelchair(), extra: 1 }))).toBeNull()
    expect(checkGuideValue(custom('<svg></svg>'))).toBeNull()
  })

  it('AC-4502.5: 그림이 custom이 아니면(16개 중 하나·null) drawing은 null이어야 하고, 그림이 있으면 null', () => {
    expect(checkGuideValue({ ...example(1), picture: 'document', drawing: wheelchair() })).toBeNull()
    expect(checkGuideValue({ ...example(1), picture: null, drawing: wheelchair() })).toBeNull()
    for (const bad of [undefined, {}, '', 0, false]) {
      expect(checkGuideValue({ ...example(1), drawing: bad }), String(bad)).toBeNull()
    }
  })

  it('AC-4502.5: 줄은 배열이고 줄마다 열쇠가 text·em 둘뿐인 문자열이어야 한다', () => {
    for (const bad of [null, '진단서', { 0: L('진단서') }]) expect(checkGuideValue({ ...example(1), lines: bad }), String(bad)).toBeNull()
    const badLines: unknown[] = [
      { text: '진단서' },
      { em: '' },
      { text: '진단서', em: '', extra: 1 },
      { text: 1, em: '' },
      { text: '진단서', em: null },
      '진단서',
      null,
      ['진단서', ''],
    ]
    for (const bad of badLines) expect(checkGuideValue({ ...example(1), lines: [L('진료비 영수증'), bad] }), JSON.stringify(bad)).toBeNull()
    // 비어 있는 칸(sparse)도 줄이 아니다
    const sparse: unknown[] = [L('진단서')]
    sparse[2] = L('통원 확인서')
    expect(checkGuideValue({ ...example(1), lines: sparse })).toBeNull()
  })

  it('AC-4502.5: 칸 검사(checkGuide) 까닭이 하나라도 있으면 null', () => {
    const fails: [string, Record<string, unknown>][] = [
      ['빈 머리표', { tag: '' }],
      ['공백뿐인 큰 문구', { big1: '   ' }],
      ['11자 머리표', { tag: 가(11) }],
      ['29자 줄', { lines: [L(가(29))] }],
      ['윗줄만', { boxTop: '이렇게 말씀해 주세요', boxBottom: '' }],
      ['줄에 없는 강조', { lines: [L('진단서', '영수증')] }],
      ['전화번호', { note: '문의 010-1234-5678' }],
      ['메일', { bandTitle: 'a@b.co' }],
      ['제어 문자', { subtitle: '보험사에\u0007낼 서류는' }],
      ['줄 0개', { lines: [] }],
      ['빈 줄만', { lines: [L('  ')] }],
      ['줄 5개', { lines: [L('하나'), L('둘'), L('셋'), L('넷'), L('다섯')] }],
      ['빈 줄 섞임', { lines: [L('진단서'), L('')] }],
    ]
    for (const [what, patch] of fails) expect(checkGuideValue({ ...example(1), ...patch }), what).toBeNull()
  })

  it('AC-4502.5: 배치 검사(REQ-4503) 까닭이 있으면 null — 띠 넘침', () => {
    expect(checkGuideValue({ ...example(4), lines: [...example(4).lines, ...OVER_LINES] })).toBeNull()
  })

  it('AC-4502.5: 배치 검사 까닭이 있으면 null — 14자 안이지만 넓은 글자라 한 줄에 안 드는 작은 제목', () => {
    const wide = withEx1({ subtitle: 'M'.repeat(14) })
    expect(checkGuide(wide)).toEqual({})
    expect(Object.keys(layoutGuide(wide).problems)).toEqual(['subtitle'])
    expect(checkGuideValue(wide)).toBeNull()
    expect(checkGuideValue(withEx1({ subtitle: 'M'.repeat(13) }))).toEqual(withEx1({ subtitle: 'M'.repeat(13) }))
  })
})

describe('AC-4502.5: savableGuide — 저장할 값(고른 그림이 custom일 때만 drawing)', () => {
  it('AC-4502.5: 그림이 custom이 아니면 drawing을 null로 바꾼 새 객체를 주고, 받은 객체는 고치지 않는다', () => {
    for (const picture of ['document', null] as const) {
      const c: GuideContent = { ...example(1), picture, drawing: wheelchair() }
      const before = structuredClone(c)
      const out = savableGuide(c)
      expect(out, String(picture)).toEqual({ ...example(1), picture, drawing: null })
      expect(out).not.toBe(c)
      expect(c).toEqual(before)
    }
  })

  it('AC-4502.5: 그림이 custom이면 drawing을 그대로 둔 새 객체를 준다', () => {
    const c: GuideContent = { ...example(1), picture: 'custom', drawing: wheelchair() }
    const out = savableGuide(c)
    expect(out).toEqual(c)
    expect(out).not.toBe(c)
    expect(out.drawing).toEqual(WHEELCHAIR)
  })

  it('AC-4502.5: 화면에 남겨 둔 AI 그림이 있어도 다른 그림을 고르면 checkGuideValue(savableGuide(c))는 넘는다', () => {
    const c: GuideContent = { ...example(1), picture: 'document', drawing: wheelchair() }
    expect(checkGuideValue(c)).toBeNull()
    expect(checkGuideValue(savableGuide(c))).toEqual(example(1))
  })
})

describe('AC-4502.6: guideTitle · guideFileName', () => {
  it('AC-4502.6: 목록 제목은 머리표다', () => {
    expect(guideTitle(example(1))).toBe('보험 서류 안내')
    expect(guideTitle(example(6))).toBe('도수치료 안내')
    expect(guideTitle(withEx1({ tag: '  보험 서류 안내 ' }))).toBe('보험 서류 안내')
  })

  it('AC-4502.6: 그림 파일 이름은 환자안내문_<머리표>.png', () => {
    expect(guideFileName(example(1))).toBe('환자안내문_보험 서류 안내.png')
    expect(guideFileName(example(2))).toBe('환자안내문_영상 CD 안내.png')
    expect(guideFileName(example(5))).toBe('환자안내문_진료 시작 전 안내.png')
  })

  it('AC-4502.6: 파일 이름에서 \\ / : * ? " < > | 는 뺀다', () => {
    expect(guideFileName(withEx1({ tag: '보험/서류:안내*?' }))).toBe('환자안내문_보험서류안내.png')
    expect(guideFileName(withEx1({ tag: 'a\\b/c:d*e?f"g<h>i|j' }))).toBe('환자안내문_abcdefghij.png')
    expect(guideFileName(withEx1({ tag: '"접수 안내"' }))).toBe('환자안내문_접수 안내.png')
    // 다른 문장부호는 그대로 둔다
    expect(guideFileName(withEx1({ tag: '접수·수납 (1층)' }))).toBe('환자안내문_접수·수납 (1층).png')
  })
})

describe('AC-4502.1: BLANK_GUIDE — 새 안내문', () => {
  it('AC-4502.1: 빈 글 칸, firstSmall 거짓, picture·drawing null, mark check, 빈 줄 하나', () => {
    expect(BLANK_GUIDE).toEqual({
      tag: '', subtitle: '', big1: '', big2: '', firstSmall: false, boxTop: '', boxBottom: '',
      picture: null, drawing: null, bandTitle: '', mark: 'check', lines: [{ text: '', em: '' }], note: '',
    })
    expect(Object.keys(BLANK_GUIDE).sort()).toEqual([...KEYS].sort())
  })

  it('AC-4502.1: 새 안내문은 필수 칸과 줄에 까닭이 있어 저장 값 검사를 넘지 못한다', () => {
    expect(checkGuide(BLANK_GUIDE)).toEqual({
      tag: '머리표를 적어 주세요',
      subtitle: '작은 제목을 적어 주세요',
      big1: '큰 문구 윗줄을 적어 주세요',
      big2: '큰 문구 아랫줄을 적어 주세요',
      lines: NO_LINES,
    })
    expect(checkGuideValue(BLANK_GUIDE)).toBeNull()
  })

  it('AC-4502.1: BLANK_GUIDE는 얼려 두어 함께 쓰는 값이 바뀌지 않는다', () => {
    expect(Object.isFrozen(BLANK_GUIDE)).toBe(true)
    expect(Object.isFrozen(BLANK_GUIDE.lines)).toBe(true)
    expect(Object.isFrozen(BLANK_GUIDE.lines[0])).toBe(true)
  })
})

// ---------- 안내문 색 (spec clinic-profile REQ-6604 AC-6604.5·AC-6604.6, design.md 6절) ----------

describe('AC-6604.6: 안내문 색(colors) — 저장 값 검사 checkGuideValue', () => {
  const COLORS: GuideColors = { main: '#3366cc', dark: '#102040' }
  const colored = (colors: unknown = { ...COLORS }): Record<string, unknown> => ({ ...example(1), colors })

  it('AC-6604.6: colors 열쇠가 없는 옛 안내문(지금 저장된 것)도 읽히고, 색 열쇠 없이 [자동](guideColorsOf → null)이다', () => {
    const out = checkGuideValue(example(1))
    expect(out).toEqual(example(1))
    expect(Object.keys(out!).sort()).toEqual([...KEYS].sort())
    expect(guideColorsOf(out!)).toBeNull()
  })

  it("AC-6604.6: colors가 { main, dark }('#' + 소문자 6자리)이면 그 색이 함께 남는다(새 객체)", () => {
    const input = colored()
    const out = checkGuideValue(input)
    expect(out).toEqual({ ...example(1), colors: COLORS })
    expect(Object.keys(out!).sort()).toEqual([...KEYS, 'colors'].sort())
    expect(out!.colors).not.toBe(input.colors)
    expect(guideColorsOf(out!)).toEqual(COLORS)
  })

  it('AC-6604.6: colors가 null이면 [자동]으로 읽고, 열쇠를 남기지 않는다(옛 안내문과 같은 모양)', () => {
    const out = checkGuideValue(colored(null))
    expect(out).toEqual(example(1))
    expect('colors' in out!).toBe(false)
  })

  it('AC-6604.6: 틀린 색 값이면 안내문 전체가 null이다(대문자·3자리·# 없음·한쪽 빠짐·다른 열쇠·객체 아님)', () => {
    for (const bad of [
      { main: '#3366CC', dark: '#102040' },
      { main: '#36c', dark: '#102040' },
      { main: '3366cc', dark: '#102040' },
      { main: '#3366cc' },
      { dark: '#102040' },
      { main: '#3366cc', dark: '#102040', note: '#d6d6d6' },
      { main: 1, dark: '#102040' },
      '#3366cc',
      ['#3366cc', '#102040'],
      1,
      true,
    ]) {
      expect(checkGuideValue(colored(bad)), JSON.stringify(bad)).toBeNull()
    }
  })

  it('AC-6604.6: 더할 수 있는 열쇠는 colors 하나뿐이다(다른 열쇠가 섞이면 여전히 null)', () => {
    expect(checkGuideValue({ ...colored(), memo: '대충 적은 글' })).toBeNull()
    expect(checkGuideValue({ ...colored(), palette: COLORS })).toBeNull()
  })

  it('AC-6604.6: savableGuide는 색을 그대로 두고, checkGuideValue(savableGuide(c))도 색을 남긴다', () => {
    const c: GuideValue = { ...example(1), picture: 'document', drawing: wheelchair(), colors: { ...COLORS } }
    expect(savableGuide(c)).toEqual({ ...example(1), drawing: null, colors: COLORS })
    expect(checkGuideValue(savableGuide(c))).toEqual({ ...example(1), colors: COLORS })
  })

  it('AC-6604.6: 색을 더해도 저장 크기 제약(16,000바이트) 안이다 — 모든 글 칸 한도·AI 그림 바이트 한도와 함께', () => {
    const bytes = (value: unknown) => new TextEncoder().encode(JSON.stringify(value)).length
    // AI 그림은 JSON 글 DRAWING_LIMITS.bytes(8,000)까지라 그 한도를 채운 그림으로 본다
    const shapes = Array.from({ length: 21 }, () => SH('path', [], 'yellow', 'dark', 12, `M${'1 '.repeat(149)}`.slice(0, 300)))
    const drawing = { subject: 가(DRAWING_LIMITS.subject), shapes }
    expect(bytes(drawing)).toBeLessThanOrEqual(DRAWING_LIMITS.bytes)
    const text = (key: keyof typeof GUIDE_LIMITS) => 가(GUIDE_LIMITS[key])
    const big = {
      ...example(1),
      tag: text('tag'), subtitle: text('subtitle'), big1: text('big1'), big2: text('big2'), boxTop: text('boxTop'), boxBottom: text('boxBottom'),
      bandTitle: text('bandTitle'), note: text('note'), lines: Array.from({ length: GUIDE_LIMITS.lines }, () => L(가(GUIDE_LIMITS.line), 가(GUIDE_LIMITS.line))),
      picture: 'custom', drawing, colors: COLORS,
    }
    expect(bytes(big)).toBeLessThan(16_000)
    expect(bytes(big) - bytes({ ...big, colors: undefined })).toBeLessThan(60)
  })
})

describe('AC-6604.6: checkGuideColors · guideColorsOf', () => {
  it("AC-6604.6: checkGuideColors는 { main, dark }('#' + 소문자 6자리)만 새 객체로, 아니면 null", () => {
    const colors = { main: '#e6e006', dark: '#2e2e2e' }
    expect(checkGuideColors(colors)).toEqual(colors)
    expect(checkGuideColors(colors)).not.toBe(colors)
    for (const bad of [null, undefined, {}, { main: '#E6E006', dark: '#2e2e2e' }, { main: '#e6e006', dark: '#2e2e2e', x: 1 }]) {
      expect(checkGuideColors(bad), JSON.stringify(bad)).toBeNull()
    }
  })

  it('AC-6604.6: guideColorsOf는 안내문의 직접 고른 색, 없거나 null이거나 틀리면 null([자동])', () => {
    expect(guideColorsOf({ ...example(1), colors: { main: '#3366cc', dark: '#102040' } } as GuideValue)).toEqual({ main: '#3366cc', dark: '#102040' })
    expect(guideColorsOf(example(1))).toBeNull()
    expect(guideColorsOf({ ...example(1), colors: null } as GuideValue)).toBeNull()
    expect(guideColorsOf({ ...example(1), colors: { main: 'red', dark: '#102040' } } as unknown as GuideValue)).toBeNull()
  })
})

// ---------- 글씨·로고 값 (spec form-style REQ-6806 AC-6806.3, design.md 2절, TASK-3) ----------

describe('AC-6806.3: 안내문 글씨·로고 값(content.style) — 저장 값 검사 checkGuideValue', () => {
  const DEFAULT = { titleScale: 100, bodyScale: 100, logoScale: 100, titleColor: null, bodyColor: null, logoColor: null }
  // 예시 1의 짧은 줄이 어느 크기에서도 넘치지 않을 만큼만 바꾼 값
  const STYLE = { titleScale: 105, bodyScale: 95, logoScale: 120, titleColor: '#7c3aed', bodyColor: '#111111', logoColor: null }
  const COLORS: GuideColors = { main: '#3366cc', dark: '#102040' }
  const styled = (style: unknown = { ...STYLE }): Record<string, unknown> => ({ ...example(1), style })

  it('AC-6806.3: style 열쇠가 없는 옛 안내문은 지금처럼 읽히고 열쇠가 늘지 않는다', () => {
    const out = checkGuideValue(example(1))
    expect(out).toEqual(example(1))
    expect(Object.keys(out!).sort()).toEqual([...KEYS].sort())
    expect(Object.keys(checkGuideValue({ ...example(1), colors: COLORS })!).sort()).toEqual([...KEYS, 'colors'].sort())
  })

  it('AC-6806.3: 처음대로인 style은 받되 열쇠 없이 돌려준다(색과 함께여도)', () => {
    const out = checkGuideValue(styled({ ...DEFAULT }))
    expect(out).toEqual(example(1))
    expect('style' in out!).toBe(false)
    const both = checkGuideValue({ ...styled({ ...DEFAULT }), colors: COLORS })
    expect(both).toEqual({ ...example(1), colors: COLORS })
    expect(Object.keys(both!).sort()).toEqual([...KEYS, 'colors'].sort())
  })

  it('AC-6806.3: 바꾼 style은 새 객체로 함께 남는다(색 colors와 함께여도, colors null이어도)', () => {
    const input = styled()
    const out = checkGuideValue(input)
    expect(out).toEqual({ ...example(1), style: STYLE })
    expect(out!.style).not.toBe(input.style)
    expect(Object.keys(out!).sort()).toEqual([...KEYS, 'style'].sort())

    expect(checkGuideValue({ ...styled(), colors: COLORS })).toEqual({ ...example(1), colors: COLORS, style: STYLE })
    expect(checkGuideValue({ ...styled(), colors: null })).toEqual({ ...example(1), style: STYLE })
  })

  it('AC-6806.3: 틀린 style이면 안내문 전체가 null이다(범위 밖·5의 배수 아님·대문자 색·열쇠 하나 더/덜·null·객체 아님)', () => {
    const five = Object.fromEntries(Object.entries(DEFAULT).filter(([key]) => key !== 'bodyColor'))
    for (const bad of [
      { ...DEFAULT, titleScale: 135 },
      { ...DEFAULT, bodyScale: 75 },
      { ...DEFAULT, bodyScale: 102 },
      { ...DEFAULT, logoScale: 155 },
      { ...DEFAULT, logoColor: '#FFFFFF' },
      { ...DEFAULT, titleColor: '' },
      five,
      { ...DEFAULT, accent: null },
      null,
      undefined,
      '#ffffff',
      [],
    ]) {
      expect(checkGuideValue({ ...example(1), style: bad }), String(JSON.stringify(bad))).toBeNull()
    }
  })

  it('AC-6806.3: 더할 수 있는 열쇠는 colors·style뿐이다(다른 열쇠가 섞이면 여전히 null)', () => {
    expect(checkGuideValue({ ...styled(), memo: '대충 적은 글' })).toBeNull()
    expect(checkGuideValue({ ...styled(), colors: COLORS, accent: '#c62f2f' })).toBeNull()
    expect(checkGuideValue({ ...styled(), colors: { main: '#3366CC', dark: '#102040' } })).toBeNull()
  })

  it('AC-6806.3: style이 맞아도 안내문 칸 규칙은 그대로 본다', () => {
    expect(checkGuideValue({ ...example(1), tag: '', style: STYLE })).toBeNull()
    expect(checkGuideValue({ ...example(1), lines: [], style: STYLE })).toBeNull()
  })

  it('AC-6806.3: savableGuide는 style을 그대로 두고, checkGuideValue(savableGuide(c))도 style을 남긴다', () => {
    const c: GuideValue = { ...example(1), picture: 'document', drawing: wheelchair(), style: { ...STYLE } }
    expect(savableGuide(c)).toEqual({ ...example(1), drawing: null, style: STYLE })
    expect(checkGuideValue(savableGuide(c))).toEqual({ ...example(1), style: STYLE })
  })
})

// ---------- 글씨 크기를 넣은 배치로 까닭 보기 (spec form-style REQ-6804 AC-6804.7, design.md 5-2절, TASK-4) ----------

describe('AC-6804.7: guideProblems·checkGuideValue는 그림과 같은 style을 넣은 배치로 줄 넘침을 본다', () => {
  const DEFAULT = { titleScale: 100, bodyScale: 100, logoScale: 100, titleColor: null, bodyColor: null, logoColor: null }
  const BODY_130 = { ...DEFAULT, bodyScale: 130 }
  // 28자 줄: 체크 표시 36(본문 100%)이면 26px로 자리에 들고, 체크 표시 46(본문 130%)이면 26px로도 넘친다
  const LONG = `WWWW${가(24)}`
  const content = (): GuideContent => ({ ...example(4), lines: [L(LONG), example(4).lines[1]!] })

  it('AC-6804.7: 처음대로·style 없음이면 까닭이 없고, 본문 130%면 그 줄(line0)에 한 줄 까닭이 붙는다', () => {
    expect(checkGuide(content())).toEqual({})
    expect(guideProblems(content())).toEqual({})
    expect(guideProblems({ ...content(), style: { ...DEFAULT } })).toEqual({})
    expect(guideProblems({ ...content(), style: BODY_130 })).toEqual({ line0: TOO_LONG })
    expect(layoutGuide({ ...content(), style: BODY_130 }).problems).toEqual({ line0: TOO_LONG })
  })

  it('AC-6804.7: 저장 검사(checkGuideValue)도 검사한 style을 넣은 배치로 본다 — 본문 130%의 넘치는 줄은 저장되지 않는다', () => {
    expect(checkGuideValue(content())).toEqual(content())
    expect(checkGuideValue({ ...content(), style: { ...DEFAULT } })).toEqual(content())
    expect(checkGuideValue({ ...content(), style: { ...DEFAULT, bodyScale: 80 } })).toEqual({ ...content(), style: { ...DEFAULT, bodyScale: 80 } })
    expect(checkGuideValue({ ...content(), style: BODY_130 })).toBeNull()
  })

  it('AC-6804.7: 제목 크기도 같다 — 크기를 바꿔도 가장 작은 크기 규칙은 그대로라 넘치는 큰 문구는 저장되지 않는다', () => {
    // 8자 안의 큰 문구는 72px에 들어 어느 크기에서도 저장된다
    const ok = withEx1({ big1: 가(8) })
    for (const titleScale of [80, 130]) expect(checkGuideValue({ ...ok, style: { ...DEFAULT, titleScale } }), `${titleScale}%`).not.toBeNull()
  })
})
