import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import type { PrivateKind } from '@/types/notices'
import { checkMemo, checkQuestion, kindsText, privateKinds } from './askCheck'

// 환자 정보 모양 검사(specs/notices REQ-7413, design 9절). 화면(묻기·메모·내 낱말)과 서버(묻기 경로)가 같이 쓴다.
// 모두 지어낸 번호다

describe('AC-7413.1 privateKinds', () => {
  it.each([
    ['010-1234-5678', ['tel']],
    ['차트 1234 확인', ['chart']],
    ['1234567 환자', ['digits']],
  ] as const)('AC-7413.1: 명세 예 %s는 걸린다 → %j', (text, kinds) => {
    expect(privateKinds(text)).toEqual(kinds)
  })

  it.each(['43,850원', '제2026-218호', '2026년 12월 1일', 'MM301', '', '도수치료 본인부담 80%는 언제부터인가요?'])(
    'AC-7413.1: 명세 예 %j는 통과한다(빈 배열)',
    (text) => {
      expect(privateKinds(text)).toEqual([])
    },
  )

  it.each(['900101-1234567', '900101 - 1234567', '900101 -1234567', '900101-8234567', '주민 9001011234567 환자', '9001014234567'])(
    'AC-7413.1: 주민번호 모양(6-7자리·붙인 13자리) %j는 rrn이다',
    (text) => {
      expect(privateKinds(text)).toEqual(['rrn'])
    },
  )

  it.each([
    ['900101-0234567', '성별 자리 0'],
    ['900101-9234567', '성별 자리 9'],
    ['9001019234567', '붙인 13자리 성별 자리 9'],
    ['19001011234567', '붙인 14자리(앞에 숫자)'],
    ['90010112345678', '붙인 14자리(뒤에 숫자)'],
  ])('AC-7413.1: %j(%s)는 rrn이 아니고 긴 숫자다', (text) => {
    expect(privateKinds(text)).toEqual(['digits'])
  })

  it('AC-7413.1: 실제 의약품 표준코드 모양(880…, 성별 자리 9)은 주민번호가 아니고 긴 숫자로 막힌다(plan §4)', () => {
    expect(privateKinds('코드 8806469007217 약')).toEqual(['digits'])
  })

  it.each(['010-1234-5678', '02-123-4567', '031-1234-5678', '010 - 1234 - 5678', '010-1234 -5678', '01012345678', '0111234567', '016-123-4567', '전화 01912345678 부탁'])(
    'AC-7413.1: 전화번호 모양(0으로 시작 2~3자리-3~4자리-4자리, 붙인 01x 10~11자리) %j는 tel이다',
    (text) => {
      expect(privateKinds(text)).toEqual(['tel'])
    },
  )

  // design 9절 tel 식(업무일지 PHONE과 같은 바탕)은 0으로 시작해 붙여 쓴 9~11자리를 앞자리와 상관없이 전화로 본다(2026-11-21 고침).
  // 예전에는 '01212345678'을 긴 숫자로 봤다 — 막히는 것은 같고 이름만 전화번호로 바뀐다
  it.each(['01212345678', '0212345678', '021234567'])('AC-7413.1: 0으로 시작해 붙여 쓴 9~11자리 %j는 tel이다', (text) => {
    expect(privateKinds(text)).toEqual(['tel'])
  })

  it.each(['010 1234 5678', '010.1234.5678', '(02) 1234-5678', '(02)1234-5678', '+82 10-1234-5678', '+82-10-1234-5678', '02.123.4567', '010 -1234. 5678', '전화 031 123 4567 부탁'])(
    'AC-7413.1: 붙임표·점·빈칸 어느 것으로 나눠도, 구역번호 괄호·+82를 붙여도 전화번호 %j는 tel이다',
    (text) => {
      expect(privateKinds(text)).toEqual(['tel'])
    },
  )

  it.each([
    ['０１０－１２３４－５６７８', '전각 숫자·전각 붙임표'],
    ['０１０　１２３４　５６７８', '전각 숫자·전각 빈칸'],
    ['010—1234—5678', '긴 줄표'],
    ['010–1234–5678', '반각 긴 줄표'],
    ['010ㅡ1234ㅡ5678', "한글 'ㅡ'"],
    ['010−1234−5678', '빼기표'],
    ['⓪①⓪-1234-5678', '번호 글자로만 적은 앞자리'],
    ['①010-1234-5678', '앞에 붙은 번호 글자'],
  ])('AC-7413.1: %j(%s)도 같은 모양으로 보고 tel이다', (text) => {
    expect(privateKinds(text)).toEqual(['tel'])
  })

  it.each(['900101 1234567', '900101.1234567', '900101 . 1234567', '９００１０１－１２３４５６７', '９００１０１１２３４５６７', '900101—1234567'])(
    'AC-7413.1: 빈칸·점·전각·긴 줄표로 적은 주민번호 %j도 rrn이다',
    (text) => {
      expect(privateKinds(text)).toEqual(['rrn'])
    },
  )

  it.each([
    ['차트　１２３４ 확인', ['chart']],
    ['１２３４５６７ 환자', ['digits']],
    ['１２３４５６７８－１２호', ['digits']],
  ] as const)('AC-7413.1: 전각으로 적은 %j도 같은 모양으로 본다 → %j', (text, kinds) => {
    expect(privateKinds(text)).toEqual(kinds)
  })

  it.each(['４３,８５０원', '제２０２６－２１８호', '제2026—218호', '２０２６년 １２월 １일', 'ＭＭ３０１', '2026.12.01', '02.12.2026'])(
    'AC-7413.1: 맞춰 봐도 모양이 아닌 %j는 통과한다',
    (text) => {
      expect(privateKinds(text)).toEqual([])
    },
  )

  it.each([
    ['010123456789', '붙인 12자리'],
    ['101012345678', '앞에 숫자가 붙은 12자리'],
  ])('AC-7413.1: %j(%s)는 tel이 아니고 긴 숫자다', (text) => {
    expect(privateKinds(text)).toEqual(['digits'])
  })

  it.each(['02-12-4567', '010-12345-678', '010-123-456'])('AC-7413.1: 나눈 자리 수가 다른 %j는 전화번호가 아니다', (text) => {
    expect(privateKinds(text)).toEqual([])
  })

  it.each(['차트 12', '차트번호 1234', '차트 번호: 1234', '차트번호：5678', '챠트 99', '등록번호 123456', '환자번호:00123', '차트12'])(
    "AC-7413.1: '차트·챠트·등록번호·환자번호' 뒤 2자리 이상 숫자 %j는 chart다",
    (text) => {
      expect(privateKinds(text)).toEqual(['chart'])
    },
  )

  it.each(['차트 1', '차트에 2026년', '등록 번호 1234', '진료 차트 정리'])("AC-7413.1: %j는 chart가 아니다(숫자 한 자리·사이에 다른 글자)", (text) => {
    expect(privateKinds(text)).toEqual([])
  })

  it('AC-7413.1: 여러 모양이 들면 rrn·tel·chart 차례로 하나씩 돌려준다', () => {
    const text = '차트 1234 환자 010-1234-5678, 900101-1234567 / 차트 5678 · 02-123-4567'
    expect(privateKinds(text)).toEqual(['rrn', 'tel', 'chart'])
  })

  it('AC-7413.1: 앞 셋 가운데 하나라도 있으면 긴 숫자(digits)는 넣지 않는다', () => {
    expect(privateKinds('010-1234-5678 그리고 12345678')).toEqual(['tel'])
    expect(privateKinds('차트 12 그리고 12345678')).toEqual(['chart'])
    expect(privateKinds('900101-1234567')).toEqual(['rrn'])
  })

  it.each(['123456', '약 코드 643501234', '금액 1234567원', '제2026-218호 1234567'])(
    'AC-7413.1: 앞 셋이 없고 6자리 이상 이어진 숫자 %j는 digits다',
    (text) => {
      expect(privateKinds(text)).toEqual(['digits'])
    },
  )

  it.each(['12345', '43,850,000원', '2026-218호', '보건복지부 고시 제2026-218호와 제2025-1호 개정'])(
    "AC-7413.1: 고시 번호('제2026-218호' 꼴)를 뺀 뒤 6자리 이상 이어진 숫자가 없는 %j는 통과한다",
    (text) => {
      expect(privateKinds(text)).toEqual([])
    },
  )

  it('AC-7413.1: 고시 번호를 뺀 뒤에 남은 숫자가 이어 붙지 않는다(빼고 나면 사이가 끊긴다)', () => {
    expect(privateKinds('123제2026-218호456')).toEqual([])
  })

  it("AC-7413.1: 긴 숫자 끝 네 자리 뒤에 '-12호'가 붙어도 고시 번호로 보지 않는다(연도 네 자리 앞에 숫자가 없어야 고시 번호 꼴)", () => {
    expect(privateKinds('12345678-12호')).toEqual(['digits'])
    expect(privateKinds('1234567890-12호')).toEqual(['digits'])
  })

  it('AC-7413.1: 같은 글을 여러 번 검사해도 결과가 같다(정규식 상태가 남지 않는다)', () => {
    for (let i = 0; i < 3; i++) {
      expect(privateKinds('900101-1234567 010-1234-5678 차트 12')).toEqual(['rrn', 'tel', 'chart'])
      expect(privateKinds('12345678')).toEqual(['digits'])
    }
  })
})

describe('AC-7413.2 checkQuestion', () => {
  it("AC-7413.2: 앞뒤 공백을 떼면 빈 글자인 질문은 'empty'다", () => {
    expect(checkQuestion('')).toBe('empty')
    expect(checkQuestion('   \n\t  ')).toBe('empty')
  })

  it("AC-7413.2: 앞뒤 공백을 뗀 300자는 'ok', 301자는 'too-long'이다(글자 수는 코드 포인트로 센다)", () => {
    expect(checkQuestion(`  ${'가'.repeat(300)}  `)).toBe('ok')
    expect(checkQuestion('가'.repeat(301))).toBe('too-long')
    expect(checkQuestion('😀'.repeat(300))).toBe('ok')
    expect(checkQuestion('😀'.repeat(301))).toBe('too-long')
    expect(checkQuestion('a')).toBe('ok')
  })

  it("AC-7413.2: 줄바꿈·탭은 받고, 그 밖의 제어 문자가 있으면 'control'이다", () => {
    expect(checkQuestion('첫 줄\n둘째 줄\r\n\t셋째')).toBe('ok')
    for (const c of ['\u0000', '\u0007', '\u001b', '\u007f', '\u0085', '\u009f']) {
      expect(checkQuestion(`질문${c}입니다`)).toBe('control')
    }
  })

  it("AC-7413.2: 앞뒤 끝에 붙은 제어 문자도 'control'이다", () => {
    expect(checkQuestion('질문\u000b')).toBe('control')
    expect(checkQuestion('\u000c질문')).toBe('control')
  })

  it('AC-7413.2: 환자 정보 모양이 있으면 { private: kinds }다', () => {
    expect(checkQuestion('010-1234-5678 환자 본인부담은?')).toEqual({ private: ['tel'] })
    expect(checkQuestion('차트 1234 환자, 900101-1234567')).toEqual({ private: ['rrn', 'chart'] })
    expect(checkQuestion('1234567 환자')).toEqual({ private: ['digits'] })
  })

  it("AC-7413.2: 검사 차례는 길이 → 제어 문자 → 환자 정보 모양이다", () => {
    expect(checkQuestion(`010-1234-5678${'가'.repeat(300)}`)).toBe('too-long')
    expect(checkQuestion('010-1234-5678\u0000')).toBe('control')
  })

  it('AC-7413.2: 맞춘 글자는 검사에만 쓴다 — 전각 전화는 막고, 글자 수는 받은 글 그대로 센다', () => {
    expect(checkQuestion('０１０－１２３４－５６７８ 환자 본인부담은?')).toEqual({ private: ['tel'] })
    // '㈜'는 NFKC로 '(주)' 세 자가 되지만 받은 글로는 한 자다
    expect(checkQuestion('㈜'.repeat(300))).toBe('ok')
    expect(checkQuestion('㈜'.repeat(301))).toBe('too-long')
    expect(checkMemo('㈜'.repeat(500))).toBe('ok')
  })

  it("AC-7413.2: 모양이 없는 질문은 'ok'다", () => {
    expect(checkQuestion('제2026-218호에서 도수치료 43,850원은 언제부터인가요?')).toBe('ok')
  })
})

describe('AC-7413.2 checkMemo', () => {
  it("AC-7413.2: 빈 메모(앞뒤 공백만인 것도)는 'ok'다(지우기)", () => {
    expect(checkMemo('')).toBe('ok')
    expect(checkMemo('  \n ')).toBe('ok')
  })

  it("AC-7413.2: 앞뒤 공백을 뗀 500자는 'ok', 501자는 'too-long'이다", () => {
    expect(checkMemo(` ${'나'.repeat(500)}\n`)).toBe('ok')
    expect(checkMemo('나'.repeat(501))).toBe('too-long')
    expect(checkMemo('😀'.repeat(500))).toBe('ok')
    expect(checkMemo('😀'.repeat(501))).toBe('too-long')
  })

  it("AC-7413.2: 줄바꿈·탭 밖 제어 문자는 'control', 모양은 { private }, 아니면 'ok'다", () => {
    expect(checkMemo('12월 회의\n\t원장님들께 알리기')).toBe('ok')
    expect(checkMemo('메모\u0000')).toBe('control')
    expect(checkMemo('환자번호 1234 확인')).toEqual({ private: ['chart'] })
    expect(checkMemo('9001011234567')).toEqual({ private: ['rrn'] })
  })
})

describe('AC-7413.3 kindsText', () => {
  it.each([
    [['rrn'], '주민번호'],
    [['tel'], '전화번호'],
    [['chart'], '차트번호'],
    [['digits'], '긴 숫자'],
    [['rrn', 'tel'], '주민번호·전화번호'],
    [['rrn', 'tel', 'chart'], '주민번호·전화번호·차트번호'],
    [[], ''],
  ] as [PrivateKind[], string][])('AC-7413.3: %j → %j', (kinds, text) => {
    expect(kindsText(kinds)).toBe(text)
  })

  it('AC-7413.3: 차례가 섞이거나 겹쳐도 주민번호·전화번호·차트번호·긴 숫자 차례로 한 번씩 잇는다', () => {
    expect(kindsText(['chart', 'rrn', 'chart', 'tel'])).toBe('주민번호·전화번호·차트번호')
    expect(kindsText(['digits', 'tel'])).toBe('전화번호·긴 숫자')
  })

  it('AC-7413.3: 서버 답에 모르는 종류가 섞여 와도 아는 것만 잇는다', () => {
    expect(kindsText(['tel', 'mail' as PrivateKind])).toBe('전화번호')
  })
})

// 화면과 서버가 같이 쓴다: 서버 전용 코드·네트워크·화면 모듈을 불러오지 않는 순수 모듈이다(design 1절 '화면·서버가 같이 씀, 순수')
describe('AC-7413.2 화면·서버가 같이 쓰는 순수 모듈', () => {
  it("AC-7413.2: askCheck.ts는 '@/types/notices'의 타입만 불러오고 server-only·fetch·console을 쓰지 않는다", () => {
    const source = readFileSync(new URL('./askCheck.ts', import.meta.url), 'utf8')
    const imports = source.split(/\r?\n/).filter((line) => /^\s*import\b/.test(line))
    expect(imports).toEqual(["import type { PrivateKind } from '@/types/notices'"])
    expect(source).not.toMatch(/server-only|\bfetch\s*\(|\bconsole\.|\brequire\s*\(|\bimport\s*\(/)
  })
})
