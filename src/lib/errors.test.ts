import { describe, expect, expectTypeOf, it } from 'vitest'
import type { ErrorCode } from '@/types/errors'
import { ERRORS, errorInfo, isErrorCode } from './errors'

// ErrorCode에 번호를 더하거나 빼면 이 목록도 같이 고쳐야 타입 검사가 통과한다
const ALL_CODES = [
  'E-PARSE-COLUMN',
  'E-PARSE-ROW',
  'E-PARSE-EMPTY',
  'E-PARSE-TOO-BIG',
  'E-PARSE-RRN',
  'E-PARSE-UNREADABLE',
  'E-ANALYZE-TIMEOUT',
  'E-ANALYZE-FAILED',
  'E-AUTH-CALLBACK',
  'E-AUTH-START',
  'E-SIGNUP-FAILED',
  'E-ADMIN-FAILED',
  'E-PAGE-FAILED',
  'E-EXT-MISSING',
  'E-HELPER-MISSING',
  'E-HELPER-OLD',
  'E-EXT-OLD',
  'E-BRIDGE-BUSY',
  'E-BRIDGE-DISCONNECTED',
  'E-BRIDGE-REJECTED',
  'E-BRIDGE-BAD-REPLY',
  'E-HELPER-BAD-MESSAGE',
  'E-HELPER-UNKNOWN-COMMAND',
  'E-BIT-NOT-FOUND',
  'E-BIT-DB-FAILED',
  'E-BIT-READ-FAILED',
  'E-BIT-NOT-REGISTERED',
  'E-BIT-HOSPITAL-MISMATCH',
  'E-STORE-FAILED',
  'E-STORE-BROKEN',
  'E-REVENUE-SAVE-FAILED',
  'E-REVENUE-GROUP-SAVE-FAILED',
  'E-REVENUE-GROUP-LOAD-FAILED',
  'E-STATS-HISTORY',
  'E-STATS-TOO-BIG',
  'E-BIT-DATA-UNSURE',
  'E-BIT-IN-USE',
  'E-STATS-CHANGED',
  'E-STATS-SAVE-FAILED',
  'E-STATS-READ-FAILED',
  'E-AI-BUSY',
  'E-AI-LIMIT',
  'E-AI-FAILED',
  'E-AI-NO-DATA',
  'E-WORKLOG-SAVE-FAILED',
  'E-WORKLOG-LOAD-FAILED',
  'E-WORKLOG-NOTE-PRIVATE',
] as const satisfies readonly ErrorCode[]

// 청구 사전점검 연결 번호(design.md 4-5 중 확장·도우미·통로 것). 비트 접속 번호는 TASK-6이 더한다
const BRIDGE_CODES = [
  'E-EXT-MISSING',
  'E-HELPER-MISSING',
  'E-HELPER-OLD',
  'E-EXT-OLD',
  'E-BRIDGE-BUSY',
  'E-BRIDGE-DISCONNECTED',
  'E-BRIDGE-REJECTED',
  'E-BRIDGE-BAD-REPLY',
  'E-HELPER-BAD-MESSAGE',
  'E-HELPER-UNKNOWN-COMMAND',
] as const satisfies readonly ErrorCode[]

const AUTH_CODES = [
  'E-AUTH-CALLBACK',
  'E-AUTH-START',
  'E-SIGNUP-FAILED',
  'E-ADMIN-FAILED',
  'E-PAGE-FAILED',
] as const satisfies readonly ErrorCode[]

describe('AC-003.4 ERRORS', () => {
  it('ErrorCode의 모든 번호가 빠짐없이, 그 밖의 번호 없이 있다', () => {
    expectTypeOf<(typeof ALL_CODES)[number]>().toEqualTypeOf<ErrorCode>()
    expect(Object.keys(ERRORS).sort()).toEqual([...ALL_CODES].sort())
  })

  it.each(ALL_CODES)('%s: 무엇이·어떻게 고치나가 비어 있지 않다', (code) => {
    const info = errorInfo(code)
    expect(info.what.trim()).not.toBe('')
    expect(info.fix.trim()).not.toBe('')
  })

  it('E-PARSE-UNREADABLE은 세 가지 확인 사항을 안내한다', () => {
    expect(errorInfo('E-PARSE-UNREADABLE').fix).toBe(
      '① 환자별 소모 통계가 맞나요 ② 보안 프로그램·암호로 잠긴 파일인가요 ③ CSV로 다시 뽑아 보세요',
    )
  })

  it('E-ANALYZE-TIMEOUT은 다시 시도·기간 줄이기를 안내한다', () => {
    expect(errorInfo('E-ANALYZE-TIMEOUT').fix).toBe('다시 시도하거나 기간을 줄여 보세요')
  })
})

describe('AC-012.1 인증 오류 문구', () => {
  it.each(AUTH_CODES)('AC-012.1: %s는 lib/errors.ts에 무엇이·어떻게 고치나가 있다', (code) => {
    expect(Object.keys(ERRORS)).toContain(code)
    const info = errorInfo(code)
    expect(info.what.trim()).not.toBe('')
    expect(info.fix.trim()).not.toBe('')
  })

  it('AC-012.1: E-AUTH-CALLBACK은 목업 로그인 실패 카드 문구 그대로다', () => {
    expect(errorInfo('E-AUTH-CALLBACK')).toEqual({
      what: '구글 로그인을 마치지 못했어요',
      fix: '다시 시도해 보세요. 계속되면 오류 번호와 함께 문의해 주세요.',
    })
  })

  it('AC-012.1: E-AUTH-START는 E-AUTH-CALLBACK과 같은 카드 문구다(번호만 다르다)', () => {
    expect(errorInfo('E-AUTH-START')).toEqual(errorInfo('E-AUTH-CALLBACK'))
  })

  it('AC-012.1: E-SIGNUP-FAILED는 가입 신청을 보내지 못했다고 알리고 다시 누르라고 한다', () => {
    const info = errorInfo('E-SIGNUP-FAILED')
    expect(info.what).toBe('가입 신청을 보내지 못했어요')
    expect(info.fix).toContain('다시 눌러 주세요')
  })

  it('AC-012.1: E-ADMIN-FAILED는 신청 상태를 바꾸지 못했다고 알린다', () => {
    const info = errorInfo('E-ADMIN-FAILED')
    expect(info.what).toBe('신청 상태를 바꾸지 못했어요')
    expect(info.fix).toContain('다시 눌러 주세요')
  })

  it('AC-012.1: E-PAGE-FAILED는 화면을 열지 못했다고 알리고 [다시 시도]를 안내한다', () => {
    const info = errorInfo('E-PAGE-FAILED')
    expect(info.what).toBe('화면을 열지 못했어요')
    expect(info.fix).toContain('[다시 시도]')
  })

  // ui-90 AC-409.1: E-PAGE-FAILED는 오류 화면이 관리자 메일을 함께 보여서 "관리자에게 메일로"로 바뀌었다
  it.each(AUTH_CODES.filter((code) => code !== 'E-PAGE-FAILED'))(
    'AC-012.1·AC-409.1: %s 문구는 오류 번호와 함께 문의하라고 한다',
    (code) => {
      expect(errorInfo(code).fix).toContain('오류 번호와 함께 문의해 주세요')
    },
  )

  it('AC-012.1·AC-409.1: E-PAGE-FAILED 문구는 오류 번호를 관리자에게 메일로 알리라고 한다', () => {
    expect(errorInfo('E-PAGE-FAILED').fix).toContain('오류 번호를 관리자에게 메일로 알려 주세요')
  })
})

// ui-90 REQ-409: 시안(docs/mockups/ui-90) 문구로 바꾼 네 항목과 모든 문구의 말끝·낱말
describe('AC-409.1 공용 오류 문구', () => {
  it('AC-409.1: E-PAGE-FAILED.fix는 [다시 시도] 뒤 오류 번호를 관리자에게 메일로 알리라고 한다', () => {
    expect(errorInfo('E-PAGE-FAILED')).toEqual({
      what: '화면을 열지 못했어요',
      fix: '잠시 뒤 [다시 시도]를 눌러 주세요. 계속되면 아래 오류 번호를 관리자에게 메일로 알려 주세요.',
    })
  })

  it('AC-409.1: E-BIT-NOT-REGISTERED.what은 "이 PC에 등록한 의원이 없어요"다', () => {
    expect(errorInfo('E-BIT-NOT-REGISTERED').what).toBe('이 PC에 등록한 의원이 없어요')
  })

  it('AC-409.1: E-BIT-HOSPITAL-MISMATCH는 시안의 의원 다름 상자 문구 그대로다', () => {
    expect(errorInfo('E-BIT-HOSPITAL-MISMATCH')).toEqual({
      what: '이 PC의 비트가 등록한 의원과 달라요',
      fix: '우리 의원 비트가 맞으면 [다시 등록]을 눌러요. 이 PC에 뜨는 확인 창에서 전에 등록한 값과 새 값을 보고 [확인]을 눌러요.',
    })
  })

  it('AC-409.1: E-BRIDGE-REJECTED.fix는 비트 PC 연결 화면의 [다시 확인]을 가리킨다', () => {
    expect(errorInfo('E-BRIDGE-REJECTED').fix).toBe(
      '비트 PC 연결 화면에서 [다시 확인]을 누른 뒤 다시 해 주세요. 계속되면 오류 번호와 함께 문의해 주세요.',
    )
  })

  it.each(ALL_CODES)('AC-409.1: %s의 what·fix에 "병원"·"설치·연결 확인"이 없고 "니다."로 끝나는 문장이 없다', (code) => {
    const info = errorInfo(code)
    for (const [part, text] of [
      ['what', info.what],
      ['fix', info.fix],
    ] as const) {
      expect(text, `${code}.${part}`).not.toContain('병원')
      expect(text, `${code}.${part}`).not.toContain('설치·연결 확인')
      expect(text, `${code}.${part}`).not.toMatch(/니다\./)
    }
  })
})

describe('AC-004.3·AC-004.6·AC-004.7·AC-004.9 연결 오류 번호 문구', () => {
  it.each(BRIDGE_CODES)('%s: lib/errors.ts에 무엇이·어떻게 고치나가 있다', (code) => {
    expect(Object.keys(ERRORS)).toContain(code)
    const info = errorInfo(code)
    expect(info.what.trim()).not.toBe('')
    expect(info.fix.trim()).not.toBe('')
  })

  it.each(BRIDGE_CODES)('%s: 번호는 도우미·확장과 같은 E-… 모양이다', (code) => {
    expect(code).toMatch(/^E-[A-Z0-9]+(?:-[A-Z0-9]+)*$/)
  })

  it('E-EXT-MISSING은 확장 설치를, E-HELPER-MISSING은 도우미 설치를 안내한다', () => {
    expect(errorInfo('E-EXT-MISSING').fix).toContain('확장')
    expect(errorInfo('E-EXT-MISSING').fix).toContain('설치')
    expect(errorInfo('E-HELPER-MISSING').fix).toContain('도우미')
    expect(errorInfo('E-HELPER-MISSING').fix).toContain('설치')
  })

  it('E-HELPER-OLD·E-EXT-OLD는 무엇을 업데이트할지 말한다', () => {
    expect(errorInfo('E-HELPER-OLD').fix).toContain('도우미')
    expect(errorInfo('E-EXT-OLD').fix).toContain('확장')
  })

  // ui-90 TASK-19: 확장 업데이트 안내는 화면에 없는 "1번" 단계를 가리키지 않고, 아래 단추로 새 확장을 받으라고 한다
  it('AC-006.6·ui-90 TASK-19: E-EXT-OLD.fix는 새 확장 안내 문구 그대로다 — "1번"을 가리키지 않는다', () => {
    const fix = errorInfo('E-EXT-OLD').fix
    expect(fix).toBe('이 PC의 확장이 예전 버전이라 청구 화면을 쓸 수 없어요. 아래 단추로 새 확장을 받아 바꾼 뒤 [다시 확인]을 누르세요.')
    expect(fix).not.toContain('1번')
  })

  it('E-BRIDGE-BUSY는 다른 창에서 쓰고 있다고 알린다', () => {
    expect(errorInfo('E-BRIDGE-BUSY').what).toContain('다른 창')
  })
})

// 비트 PC 연결 화면(precheck TASK-6)이 더한 번호: bit.check 단계(find·db·registration)와 등록 단계가 줄 수 있는 것
const BIT_CODES = [
  'E-BIT-NOT-FOUND',
  'E-BIT-DB-FAILED',
  'E-BIT-READ-FAILED',
  'E-BIT-NOT-REGISTERED',
  'E-BIT-HOSPITAL-MISMATCH',
  'E-STORE-FAILED',
  'E-STORE-BROKEN',
] as const satisfies readonly ErrorCode[]

describe('AC-006.6 비트 접속·등록 오류 번호 문구', () => {
  it.each(BIT_CODES)('AC-006.6: %s는 lib/errors.ts에 무엇이·어떻게 고치나가 있다', (code) => {
    expect(Object.keys(ERRORS)).toContain(code)
    const info = errorInfo(code)
    expect(info.what.trim()).not.toBe('')
    expect(info.fix.trim()).not.toBe('')
  })

  it('AC-006.6: 등록이 없거나(E-BIT-NOT-REGISTERED) 등록 파일이 깨지면(E-STORE-BROKEN) [처음 등록]을, 병원이 다르면 [다시 등록]을 안내한다', () => {
    expect(errorInfo('E-BIT-NOT-REGISTERED').fix).toContain('[처음 등록]')
    expect(errorInfo('E-STORE-BROKEN').fix).toContain('[처음 등록]')
    expect(errorInfo('E-BIT-HOSPITAL-MISMATCH').fix).toContain('[다시 등록]')
  })

  it('AC-006.1·AC-006.6·AC-009.6: 상태 안내는 승인받은 문구다 — 확장 없음·도우미 없음·도우미 업데이트·확장 업데이트·다른 창', () => {
    expect(errorInfo('E-EXT-MISSING')).toEqual({
      what: '크롬 확장 프로그램이 없어요',
      fix: '아래 1번에서 확장을 설치한 뒤 [다시 확인]을 누르세요.',
    })
    expect(errorInfo('E-HELPER-MISSING')).toEqual({
      what: '도우미가 없어요',
      fix: '아래 2번에서 도우미를 내려받아 설치한 뒤 [다시 확인]을 누르세요.',
    })
    expect(errorInfo('E-HELPER-OLD')).toEqual({
      what: '도우미를 업데이트하세요',
      fix: '이 PC의 도우미가 예전 버전이라 대시보드 숫자와 청구 화면을 쓸 수 없어요. 고치던 메모는 이 PC에 그대로 있어요.',
    })
    expect(errorInfo('E-EXT-OLD').what).toBe('확장을 업데이트하세요')
    expect(errorInfo('E-BRIDGE-BUSY')).toEqual({
      what: '비트 연결을 다른 창에서 쓰고 있어요',
      fix: '비트 연결은 한 창에서만 쓸 수 있어요. 청구나 매출을 연 다른 창을 닫고 [다시 확인]을 눌러 주세요.',
    })
  })

  it('AC-006.6: 화면에 없는 [연결 확인] 단추를 가리키지 않는다(설치 화면 단추는 [다시 확인]·[연결 다시 확인])', () => {
    for (const code of ALL_CODES) expect(errorInfo(code).fix, code).not.toContain('[연결 확인]')
  })

  it('AC-006.6: isErrorCode는 lib/errors.ts에 문구가 있는 번호만 참이다(도우미가 준 모르는 번호는 거짓)', () => {
    for (const code of ALL_CODES) expect(isErrorCode(code), code).toBe(true)
    expect(isErrorCode('E-SOMETHING-NEW')).toBe(false)
    expect(isErrorCode('toString')).toBe(false)
    expect(isErrorCode('__proto__')).toBe(false)
  })
})

// spec revenue REQ-007
describe('AC-007.5 매출 저장 실패 문구', () => {
  it('AC-007.5: E-REVENUE-SAVE-FAILED는 lib/errors.ts에 무엇이·어떻게 고치나가 있다(design.md 8절 문구 그대로)', () => {
    expect(ERRORS['E-REVENUE-SAVE-FAILED']).toEqual({
      what: '매출 숫자를 저장하지 못했어요',
      fix: '인터넷 연결을 확인하고 [다시 저장]을 눌러 주세요',
    })
  })
})

// spec revenue REQ-013
describe('AC-013.3 치료 묶음 저장·읽기 실패 문구', () => {
  it('AC-013.3: E-REVENUE-GROUP-SAVE-FAILED는 무엇이·어떻게 고치나가 명세 문구 그대로다', () => {
    expect(ERRORS['E-REVENUE-GROUP-SAVE-FAILED']).toEqual({
      what: '치료 묶음을 저장하지 못했어요',
      fix: '인터넷 연결과 이름이 겹치지 않는지 보고 [다시 저장]을 눌러 주세요',
    })
  })

  it('AC-013.3: E-REVENUE-GROUP-LOAD-FAILED는 무엇이·어떻게 고치나가 명세 문구 그대로다', () => {
    expect(ERRORS['E-REVENUE-GROUP-LOAD-FAILED']).toEqual({
      what: '치료 묶음을 불러오지 못했어요',
      fix: '[다시 불러오기]를 눌러 주세요',
    })
  })
})

describe('REQ-601·REQ-604 비트 대시보드 오류 문구', () => {
  it('AC-601.12: E-BIT-DATA-UNSURE는 신환을 확정할 수 없다고 알리고 확인할 것을 안내한다', () => {
    expect(errorInfo('E-BIT-DATA-UNSURE')).toEqual({
      what: '비트 자료로 신환을 확정할 수 없어요',
      fix: '비트에 차트번호 없는 접수나 중복 접수가 있는지 확인하고, 계속되면 오류 번호와 함께 문의해 주세요.',
    })
  })

  it('AC-601.7: E-BIT-IN-USE는 다른 창이 쓰는 중이라고 알리고 [다시 확인]으로 안내한다', () => {
    expect(errorInfo('E-BIT-IN-USE')).toEqual({
      what: '다른 창이 비트 자료를 쓰고 있어요',
      fix: '한 번에 한 창만 비트를 읽을 수 있어요. 그 창의 일이 끝나거나 창을 닫은 뒤 [다시 확인]을 눌러 주세요.',
    })
  })

  it('AC-601.7: 청구 화면의 E-BRIDGE-BUSY 문구는 그대로다', () => {
    // 대시보드가 이 번호를 바꾸지 않는다는 뜻이다. 글자는 사용자가 OK한 새 글자다(2026-11-02 "연결문구 바꿔", specs/revenue TASK-15)
    expect(errorInfo('E-BRIDGE-BUSY').what).toContain('비트 연결을 다른 창에서 쓰고 있어요')
  })

  it('AC-604.3: E-HELPER-OLD는 대시보드 숫자와 청구 화면을 쓸 수 없다고 말한다', () => {
    expect(errorInfo('E-HELPER-OLD').fix).toBe(
      '이 PC의 도우미가 예전 버전이라 대시보드 숫자와 청구 화면을 쓸 수 없어요. 고치던 메모는 이 PC에 그대로 있어요.',
    )
  })
})

describe('REQ-505 통계 오류 번호(도우미가 stats.rows를 거절할 때)', () => {
  it('E-STATS-HISTORY는 신환을 정할 수 없다고 알리고 파일 올리기로 안내한다', () => {
    expect(errorInfo('E-STATS-HISTORY')).toEqual({
      what: '비트에 옛 자료가 따로 있어 신환을 정할 수 없어요',
      fix: '파일 올리기로 통계를 넣어 주세요',
    })
  })

  it('E-STATS-TOO-BIG은 기간을 줄여 다시 불러오라고 안내한다', () => {
    expect(errorInfo('E-STATS-TOO-BIG')).toEqual({
      what: '고른 기간의 진료 기록이 너무 많아요',
      fix: '기간을 줄여 다시 불러오세요',
    })
  })

  it('AC-505.2: E-STATS-CHANGED는 불러오는 사이에 접수가 바뀌었다고 알리고 다시 시도하라고 안내한다', () => {
    expect(errorInfo('E-STATS-CHANGED')).toEqual({
      what: '불러오는 사이에 접수가 바뀌었어요',
      fix: '다시 시도해 주세요. 계속되면 오류 번호와 함께 문의해 주세요.',
    })
  })
})

describe('AC-507.1·AC-507.2 통계 저장·읽기 오류 번호', () => {
  it('AC-507.1: E-STATS-SAVE-FAILED는 저장하지 못했다고 알리고 [다시 저장]을 안내한다', () => {
    expect(errorInfo('E-STATS-SAVE-FAILED')).toEqual({
      what: '통계 숫자를 저장하지 못했어요',
      fix: '인터넷 연결을 확인하고 [다시 저장]을 눌러 주세요',
    })
  })

  it('AC-507.2: E-STATS-READ-FAILED는 읽지 못했다고 알리고 [다시 읽기]를 안내한다', () => {
    expect(errorInfo('E-STATS-READ-FAILED')).toEqual({
      what: '저장된 통계를 읽지 못했어요',
      fix: '잠시 뒤 [다시 읽기]를 눌러 주세요',
    })
  })
})

// AI 리포트(spec ai-report design.md '오류 문구')
const AI_CODES = ['E-AI-BUSY', 'E-AI-LIMIT', 'E-AI-FAILED', 'E-AI-NO-DATA'] as const

describe('AC-502.1·AC-502.2 AI 오류 번호 문구', () => {
  it('AC-502.1 AI 오류 넷은 what·fix가 있고 "병원"·"니다."가 없다', () => {
    for (const code of AI_CODES) {
      const info = errorInfo(code)
      expect(info, code).toBeDefined()
      expect(info.what.trim(), code).not.toBe('')
      expect(info.fix.trim(), code).not.toBe('')
      for (const text of [info.what, info.fix]) {
        expect(text, code).not.toContain('병원')
        expect(text, code).not.toMatch(/니다\.(\s|$)/)
      }
    }
  })

  it('AC-502.2 BUSY는 잠시 뒤 다시, LIMIT는 이번 달 AI 한도, FAILED는 [다시 분석], NO-DATA는 그 달 통계를 먼저 넣으라고 한다', () => {
    expect(errorInfo('E-AI-BUSY').fix).toContain('뒤')
    expect(errorInfo('E-AI-BUSY').fix).toContain('[다시 분석]')
    expect(errorInfo('E-AI-LIMIT').what).toContain('이번 달')
    expect(errorInfo('E-AI-LIMIT').what).toContain('한도')
    expect(errorInfo('E-AI-FAILED').fix).toContain('[다시 분석]')
    expect(errorInfo('E-AI-NO-DATA').fix).toContain('통계')
    expect(errorInfo('E-AI-NO-DATA').fix).toContain('먼저')
  })
})

// 업무일지(specs/worklog) 오류 번호 셋. 문구는 design.md 11-2절 표 그대로
describe('AC-009.3 업무일지 오류 번호 문구', () => {
  const WORKLOG = {
    'E-WORKLOG-SAVE-FAILED': {
      what: '업무일지를 저장하지 못했어요',
      fix: '적은 값은 화면에 그대로 있어요. [다시 저장]을 눌러 주세요. 계속되면 오류 번호와 함께 관리자에게 알려 주세요.',
    },
    'E-WORKLOG-LOAD-FAILED': {
      what: '이 날 업무일지를 불러오지 못했어요',
      fix: '인터넷 연결을 확인하고 [다시 불러오기]를 눌러 주세요. 불러오기 전에는 칸을 고칠 수 없어요.',
    },
    'E-WORKLOG-NOTE-PRIVATE': {
      what: '전화번호나 주민번호 같은 글자가 있어 그 칸은 저장하지 않았어요',
      fix: '빨갛게 표시된 칸에서 그 글자를 지우면 바로 저장돼요. 다른 칸은 그대로 저장돼요. 환자 정보는 업무일지에 적지 말아 주세요.',
    },
  } as const satisfies Partial<Record<ErrorCode, { what: string; fix: string }>>

  it.each(Object.entries(WORKLOG) as [keyof typeof WORKLOG, (typeof WORKLOG)[keyof typeof WORKLOG]][])(
    'AC-009.3: %s 문구는 표 그대로이고 말끝이 "~요"다',
    (code, words) => {
      const info = errorInfo(code)
      expect(info).toEqual(words)
      expect(info.what).toMatch(/요$/)
      expect(info.fix).toMatch(/요\.$/)
    },
  )

  it('AC-009.3: E-WORKLOG-NOTE-PRIVATE는 비고뿐 아니라 막힌 칸 전체를 말한다("비고"가 없다)', () => {
    const { what, fix } = errorInfo('E-WORKLOG-NOTE-PRIVATE')
    expect(`${what} ${fix}`).not.toContain('비고')
  })
})
