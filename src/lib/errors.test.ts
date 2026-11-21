import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, expectTypeOf, it } from 'vitest'
import type { ErrorCode } from '@/types/errors'
import { STAFF_ERROR_CODES } from '@/types/staff'
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
  'E-STATS-PICK-READ-FAILED',
  'E-STATS-PICK-SAVE-FAILED',
  'E-STATS-GROUP-READ-FAILED',
  'E-STATS-GROUP-SAVE-FAILED',
  'E-STATS-GOAL-SAVE-FAILED',
  'E-RULES-LOAD-FAILED',
  'E-SETTINGS-FAILED',
  'E-MEMO-NO-SETTINGS',
  'E-CLAIM-PARTIAL',
  'E-BIT-EXPORT-FAILED',
  'E-INPUT-STOPPED',
  'E-BIT-UNSAVED-RX',
  'E-BIT-UI-CHANGED',
  'E-AI-BUSY',
  'E-AI-LIMIT',
  'E-AI-FAILED',
  'E-AI-NO-DATA',
  'E-AI-READ',
  'E-WORKLOG-SAVE-FAILED',
  'E-WORKLOG-LOAD-FAILED',
  'E-WORKLOG-NOTE-PRIVATE',
  'E-COUNTS-FAILED',
  'E-DAYCLOSE-FAILED',
  'E-PATIENTS-TEMPLATES-READ',
  'E-PATIENTS-TEMPLATES-SAVE',
  'E-PATIENTS-COUNTS-READ',
  'E-PATIENTS-COUNTS-SAVE',
  'E-PATIENTS-SOURCE',
  'E-FORMS-PRIVATE',
  'E-FORMS-NO-DATE',
  'E-FORMS-SAVE-FAILED',
  'E-FORMS-READ-FAILED',
  'E-FORMS-IMAGE-FAILED',
  'E-FORMS-BG-LIMIT',
  'E-FORMS-BG-QUOTA',
  'E-FORMS-BG-FAILED',
  'E-FORMS-BG-STORE-FAILED',
  'E-INSTALL-READ-FAILED',
  'E-INSTALL-DOWNLOAD-FAILED',
  'E-INSTALL-FILE-NAME',
  'E-INSTALL-FILE-SIZE',
  'E-INSTALL-FILE-EXISTS',
  'E-INSTALL-UPLOAD-FAILED',
  'E-DESK-READ-FAILED',
  'E-DESK-SAVE-FAILED',
  'E-DESK-EMAIL-BAD',
  'E-DESK-EMAIL-TAKEN',
  'E-DESK-EMAIL-USED',
  'E-DESK-LIMIT',
  'E-CLINIC-READ-FAILED',
  'E-CLINIC-SAVE-FAILED',
  'E-CLINIC-LOGO-FAILED',
  'E-FIRST-RUN-SAVE-FAILED',
  'E-STAFF-READ-FAILED',
  'E-STAFF-SAVE-FAILED',
  'E-STAFF-FILE-FAILED',
  'E-STAFF-EXCEL-FAILED',
  'E-STAFF-IMAGE-FAILED',
] as const satisfies readonly ErrorCode[]

// '병원' 낱말 예외(AC-409.1): 명세가 글자를 정한 번호만. 데스크 메일 둘은 '병원 계정'·'다른 병원'이라고 말해야 뜻이 산다(desk-feedback design.md 표, AC-6304.3).
// 메모 잠금 글은 설정 칸 이름 '병원 문구'를 가리켜야 갈 곳이 보인다(clinic-profile AC-6607.4가 글자를 정함)
const HOSPITAL_WORD_OK: ReadonlySet<ErrorCode> = new Set(['E-DESK-EMAIL-TAKEN', 'E-DESK-EMAIL-USED', 'E-MEMO-NO-SETTINGS'])

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
  // 직원 탭 번호(E-STAFF-*, spec staff AC-7610.1)도 번호 타입 ErrorCode에 들어 있다(ErrorCard가 받게)
  it('ErrorCode의 모든 번호가 빠짐없이, 그 밖의 번호 없이 있다 (AC-7610.1 E-STAFF 포함)', () => {
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

  it.each(ALL_CODES)('AC-409.1: %s의 what·fix에 "병원"(AC-6304.3 예외 둘 빼고)·"설치·연결 확인"이 없고 "니다."로 끝나는 문장이 없다', (code) => {
    const info = errorInfo(code)
    for (const [part, text] of [
      ['what', info.what],
      ['fix', info.fix],
    ] as const) {
      if (!HOSPITAL_WORD_OK.has(code)) expect(text, `${code}.${part}`).not.toContain('병원')
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
      fix: '비트 연결은 한 창에서만 쓸 수 있어요. 비트 연결을 쓰는 다른 창을 닫고 [다시 확인]을 눌러 주세요.',
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

// 환자 탭(spec patients REQ-609)이 더한 번호
const PATIENTS_CODES = [
  'E-PATIENTS-TEMPLATES-READ',
  'E-PATIENTS-TEMPLATES-SAVE',
  'E-PATIENTS-COUNTS-READ',
  'E-PATIENTS-COUNTS-SAVE',
  'E-PATIENTS-SOURCE',
] as const satisfies readonly ErrorCode[]

describe('AC-609.5 환자 탭 오류 번호 문구', () => {
  it.each(PATIENTS_CODES)('AC-609.5: %s는 lib/errors.ts에 무엇이·어떻게 고치나가 있다', (code) => {
    expect(Object.keys(ERRORS)).toContain(code)
    const info = errorInfo(code)
    expect(info.what.trim()).not.toBe('')
    expect(info.fix.trim()).not.toBe('')
  })

  it('AC-609.5: E-PATIENTS-TEMPLATES-READ는 [다시 불러오기]와 문의를 안내한다', () => {
    expect(errorInfo('E-PATIENTS-TEMPLATES-READ')).toEqual({
      what: '문자 문구를 불러오지 못했어요',
      fix: '인터넷 연결을 확인하고 [다시 불러오기]를 눌러 주세요. 계속되면 오류 번호와 함께 문의해 주세요.',
    })
  })

  it('AC-609.5: E-PATIENTS-TEMPLATES-SAVE는 고친 글이 그대로 있고 [다시 저장]을 누르라고 한다', () => {
    expect(errorInfo('E-PATIENTS-TEMPLATES-SAVE')).toEqual({
      what: '문자 문구를 저장하지 못했어요',
      fix: '고친 글은 그대로 있어요. 인터넷 연결을 확인하고 [다시 저장]을 눌러 주세요.',
    })
  })

  it('AC-609.5: E-PATIENTS-COUNTS-READ는 [다시 불러오기]를 안내한다', () => {
    expect(errorInfo('E-PATIENTS-COUNTS-READ')).toEqual({
      what: '남은 건수를 불러오지 못했어요',
      fix: '인터넷 연결을 확인하고 [다시 불러오기]를 눌러 주세요. 계속되면 오류 번호와 함께 문의해 주세요.',
    })
  })

  it('AC-609.5: E-PATIENTS-COUNTS-SAVE는 명단을 그대로 쓸 수 있고 [다시 올리기]를 누르라고 한다', () => {
    expect(errorInfo('E-PATIENTS-COUNTS-SAVE')).toEqual({
      what: '남은 건수를 올리지 못했어요',
      fix: '명단은 그대로 쓸 수 있어요. [다시 올리기]를 눌러 주세요.',
    })
  })

  it('AC-609.5: E-PATIENTS-SOURCE는 비트 칸 설정 확인과 [다시 불러오기]·문의를 안내한다', () => {
    expect(errorInfo('E-PATIENTS-SOURCE')).toEqual({
      what: '비트에서 읽은 명단 자료에 맞지 않는 줄이 있어요',
      fix: '비트 통계 화면의 칸 설정을 확인하고 [다시 불러오기]를 눌러 주세요. 계속되면 오류 번호와 함께 문의해 주세요.',
    })
  })

  it('AC-609.5: 이 명세가 더하는 E-PATIENTS- 번호는 이 다섯뿐이다(규칙 C3)', () => {
    const added = Object.keys(ERRORS).filter((code) => code.startsWith('E-PATIENTS-'))
    expect(added.sort()).toEqual([...PATIENTS_CODES].sort())
  })

  it.each(['E-SETTINGS-FAILED', 'E-COUNTS-FAILED', 'E-BIT-EXPORT-FAILED'])(
    'AC-609.5: %s는 precheck 명세가 더한 번호로 b2bc3cf를 합쳐 들어와 있다',
    (code) => {
      expect(isErrorCode(code)).toBe(true)
    },
  )
})

// 비트 PC 연결 화면과 환자 탭에 함께 뜨는 번호. 두 화면의 단추가 달라([다시 확인]·[다시 불러오기]) 단추 이름을 말하지 않는다
describe('AC-609.6 두 화면에 함께 뜨는 오류 문구', () => {
  it('AC-609.6: E-BIT-READ-FAILED는 정해 둔 글 그대로이고 단추 이름을 말하지 않는다', () => {
    const info = errorInfo('E-BIT-READ-FAILED')
    expect(info).toEqual({
      what: '비트 자료를 읽지 못했어요',
      fix: '잠시 뒤 다시 해 주세요. 계속되면 비트가 업데이트됐을 수 있으니 오류 번호와 함께 문의해 주세요.',
    })
    expect(info.fix).not.toContain('[')
  })

  it('AC-609.6: E-STORE-FAILED는 정해 둔 글 그대로이고 단추 이름을 말하지 않는다', () => {
    const info = errorInfo('E-STORE-FAILED')
    expect(info).toEqual({
      what: '이 PC의 도우미 저장 폴더를 읽거나 쓰지 못했어요',
      fix: '크롬을 모두 닫았다가 다시 연 뒤 다시 해 주세요. 계속되면 오류 번호와 함께 문의해 주세요.',
    })
    expect(info.fix).not.toContain('[')
  })

  it('AC-609.6: E-STORE-BROKEN은 정해 둔 글 그대로다', () => {
    expect(errorInfo('E-STORE-BROKEN')).toEqual({
      what: '이 PC에 저장해 둔 파일이 깨져서 읽지 못했어요',
      fix: '연락 표시 파일이 깨졌다면 다시 불러올 때 빈 상태로 시작해요. 정기 주사 기록은 비트에서 다시 읽고, 연락 표시는 다시 눌러 주세요. 같은 오류가 또 나오면 비트 PC 연결 화면을 열어 [처음 등록]이 보일 때 눌러 주세요. 비트에 이미 넣은 메모는 비트와 비교해 다시 넣지 않아요. 깨진 파일은 지우지 않고 남겨 둬요. 그래도 계속되면 오류 번호와 함께 문의해 주세요.',
    })
  })

  it('AC-609.6: E-STORE-BROKEN은 빈 상태로 시작 → [처음 등록] → 문의 차례로 말한다', () => {
    const { fix } = errorInfo('E-STORE-BROKEN')
    const blank = fix.indexOf('다시 불러올 때 빈 상태로 시작해요')
    const register = fix.indexOf('[처음 등록]')
    const contact = fix.indexOf('그래도 계속되면 오류 번호와 함께 문의해 주세요')
    expect(blank).toBeGreaterThanOrEqual(0)
    expect(register).toBeGreaterThan(blank)
    expect(contact).toBeGreaterThan(register)
  })
})

// 비트 PC 연결 화면·청구·통계·매출·대시보드·환자 탭에 함께 뜨는 비트 접속·등록 번호. 곁의 단추가 화면마다 달라
// NOT-FOUND·DB-FAILED는 단추 이름을 말하지 않고, NOT-REGISTERED는 [처음 등록]이 있는 화면 이름을 함께 말한다
describe('AC-609.7 여러 화면에 함께 뜨는 비트 접속·등록 오류 문구', () => {
  it('AC-609.7: E-BIT-NOT-FOUND는 무엇이는 그대로, 어떻게 고치나는 정해 둔 글이고 단추 이름을 말하지 않는다', () => {
    const info = errorInfo('E-BIT-NOT-FOUND')
    expect(info).toEqual({
      what: '이 PC에서 비트를 찾지 못했어요',
      fix: '비트가 설치된 PC(C:\\DrBIT50)에서 이 화면을 열었는지 확인한 뒤 다시 해 주세요.',
    })
    expect(info.fix).not.toContain('[')
  })

  it('AC-609.7: E-BIT-DB-FAILED는 무엇이는 그대로, 어떻게 고치나는 정해 둔 글이고 단추 이름을 말하지 않는다', () => {
    const info = errorInfo('E-BIT-DB-FAILED')
    expect(info).toEqual({
      what: '비트 자료(DB)에 연결하지 못했어요',
      fix: '비트를 켜서 로그인되는지 먼저 확인한 뒤 다시 해 주세요. 계속되면 오류 번호와 함께 문의해 주세요.',
    })
    expect(info.fix).not.toContain('[')
  })

  it('AC-609.7: E-BIT-NOT-REGISTERED는 무엇이는 그대로, 어떻게 고치나는 [처음 등록]이 있는 비트 PC 연결 화면을 함께 말한다', () => {
    const info = errorInfo('E-BIT-NOT-REGISTERED')
    expect(info).toEqual({
      what: '이 PC에 등록한 의원이 없어요',
      fix: '비트 PC 연결 화면에서 [처음 등록]을 눌러 비트에 로그인하고, 이 PC에 뜨는 확인 창에서 [확인]을 눌러 주세요.',
    })
    expect(info.fix).toContain('비트 PC 연결 화면에서 [처음 등록]')
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

describe('AC-6102.5 이번 달 목표 저장 실패 번호(stats-insights, 2026-11-18 검토 고침)', () => {
  it("AC-6102.5: E-STATS-GOAL-SAVE-FAILED는 무엇이 '이번 달 목표를 저장하지 못했어요', 어떻게 고치나 '인터넷 연결을 확인하고 [저장]을 다시 눌러 주세요.'다", () => {
    expect(isErrorCode('E-STATS-GOAL-SAVE-FAILED')).toBe(true)
    expect(errorInfo('E-STATS-GOAL-SAVE-FAILED')).toEqual({
      what: '이번 달 목표를 저장하지 못했어요',
      fix: '인터넷 연결을 확인하고 [저장]을 다시 눌러 주세요.',
    })
  })

  it('AC-6102.5: 목표 칸 단추는 [저장]이라 통계 저장 문구의 [다시 저장]을 가리키지 않는다', () => {
    expect(errorInfo('E-STATS-GOAL-SAVE-FAILED').fix).not.toContain('[다시 저장]')
  })

  // vitest는 타입을 보지 않는다 → 타입 파일 글자로 본다(AC-6304.3과 같은 방법)
  it('AC-6102.5: 번호 타입 ErrorCode(src/types/errors.ts)에도 있다', () => {
    const types = readFileSync(join(process.cwd(), 'src/types/errors.ts'), 'utf8')
    const union = types.slice(types.indexOf('export type ErrorCode ='), types.indexOf('export type ErrorInfo'))
    expect(union).toContain("'E-STATS-GOAL-SAVE-FAILED'")
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
      fix: '잠시 뒤 [다시 읽기]를 눌러 주세요. 계속되면 오류 번호를 관리자에게 알려 주세요.',
    })
  })

  it('AC-507.4: E-STATS-READ-FAILED의 fix는 계속되면 오류 번호를 알리라고 하고 what은 그대로다', () => {
    expect(errorInfo('E-STATS-READ-FAILED').what).toBe('저장된 통계를 읽지 못했어요')
    expect(errorInfo('E-STATS-READ-FAILED').fix).toBe(
      '잠시 뒤 [다시 읽기]를 눌러 주세요. 계속되면 오류 번호를 관리자에게 알려 주세요.',
    )
  })

  it('AC-507.4: E-ANALYZE-TIMEOUT의 what에는 시간을 적지 않고 fix는 그대로다', () => {
    expect(errorInfo('E-ANALYZE-TIMEOUT').what).toBe('계산이 너무 오래 걸려 멈췄어요')
    expect(errorInfo('E-ANALYZE-TIMEOUT').fix).toBe('다시 시도하거나 기간을 줄여 보세요')
  })
})

// 점검 표 불러오기(precheck TASK-7): Worker가 표 네 개를 import()로 불러오다 실패하거나 모양이 틀리면 점검을 시작하지 않는다
describe('AC-007.5 점검 표 불러오기 오류 문구', () => {
  it('AC-007.5: E-RULES-LOAD-FAILED는 lib/errors.ts에 무엇이·어떻게 고치나가 있다', () => {
    expect(Object.keys(ERRORS)).toContain('E-RULES-LOAD-FAILED')
    expect(isErrorCode('E-RULES-LOAD-FAILED')).toBe(true)
  })

  it('AC-007.5: 점검 규칙표를 불러오지 못해 점검을 시작하지 않았다고 알리고, 오류 카드의 [다시 불러오기]를 안내한다', () => {
    const info = errorInfo('E-RULES-LOAD-FAILED')
    expect(info.what).toContain('규칙표')
    expect(info.what).toContain('점검을 시작하지 않았어요')
    expect(info.fix).toContain('[다시 불러오기]')
    expect(info.fix).toContain('오류 번호와 함께 문의해 주세요')
  })
})

// 청구메모(precheck TASK-14): 병원 설정이 없거나 틀린 병원은 메모를 만들지 않는다
// 잠금 글은 clinic-profile AC-6607.4가 precheck AC-014.8·AC-018.18의 '처음 질문을 먼저' 글을 대신한다(번호는 그대로)
describe('AC-014.8·AC-6607.4 메모 설정 없음 오류 문구', () => {
  it('AC-014.8·AC-6607.4: E-MEMO-NO-SETTINGS는 병원 문구가 아직 없다고 알리고, 설정 → 병원 문구에서 처음 질문이나 기본 문구로 시작하라고 한다', () => {
    expect(isErrorCode('E-MEMO-NO-SETTINGS')).toBe(true)
    expect(errorInfo('E-MEMO-NO-SETTINGS')).toEqual({
      what: '병원 문구가 아직 없어요',
      fix: '설정 → 병원 문구에서 처음 질문을 하거나 기본 문구로 바로 시작해 주세요.',
    })
  })
})

// 규칙 설정(precheck TASK-12): 서버 설정 표를 읽거나 쓰지 못함. 저장 실패는 값을 그대로 두고 [다시 저장], 불러오기 실패는 표 없이 [다시 불러오기]
describe('AC-012.5 설정 저장 오류 문구', () => {
  it('AC-012.5: E-SETTINGS-FAILED는 무엇이·어떻게 고치나가 있고, 저장하던 중일 때만 고친 값이 그대로 있다고 알린다(불러오기 실패에는 고친 값도 표도 없다)', () => {
    expect(isErrorCode('E-SETTINGS-FAILED')).toBe(true)
    const info = errorInfo('E-SETTINGS-FAILED')
    expect(info.what).toContain('설정')
    expect(info.fix).toContain('저장하던 중이었다면 고친 값은 화면에 그대로 있어요')
    expect(info.fix).toContain('다시 눌러')
    expect(info.fix).toContain('오류 번호와 함께 문의해 주세요')
  })
})

// 한 달 자료(precheck TASK-9): 조각이 다 오지 않았거나 모양이 틀리면 Worker가 점검을 돌리지 않고 이 번호만 화면에 알린다
describe('AC-009.2·AC-008.4 한 달 자료 멈춤 오류 문구', () => {
  it('AC-009.2: E-CLAIM-PARTIAL은 자료가 다 오지 않아 점검을 멈췄다고 알리고 [다시 불러오기]로 다시 불러오라고 한다', () => {
    expect(isErrorCode('E-CLAIM-PARTIAL')).toBe(true)
    const info = errorInfo('E-CLAIM-PARTIAL')
    expect(info.what).toBe('자료가 다 오지 않아 점검을 멈췄어요')
    expect(info.fix).toContain('[다시 불러오기]')
    expect(info.fix).toContain('다시 불러오세요')
  })

  it('AC-009.2: E-CLAIM-PARTIAL은 Worker가 죽어 다시 불러와도 안 될 때 화면을 새로 고치라고 안내한다', () => {
    const info = errorInfo('E-CLAIM-PARTIAL')
    expect(info.fix).toContain('새로 고친')
  })

  it('AC-008.4: E-BIT-EXPORT-FAILED(도우미가 비트 통계 화면 표를 꺼내지 못함, design.md 4-5)는 무엇이·어떻게 고치나가 있다', () => {
    expect(isErrorCode('E-BIT-EXPORT-FAILED')).toBe(true)
    const info = errorInfo('E-BIT-EXPORT-FAILED')
    expect(info.what).toContain('비트 통계 화면')
    expect(info.fix).toContain('[다시 불러오기]')
    expect(info.fix).toContain('오류 번호와 함께 문의해 주세요')
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

// AI 리포트 탭 화면(spec ai-report-screen REQ-701). POST가 쓰지 않아 AiErrorCode에는 없고 ErrorCode에만 있다
describe('AC-701.1 저장한 리포트 읽기 오류 문구', () => {
  it('AC-701.1: E-AI-READ는 명세의 글자 그대로다', () => {
    expect(errorInfo('E-AI-READ')).toEqual({
      what: '저장한 AI 리포트를 읽지 못했어요',
      fix: '[다시 읽기]를 눌러 주세요. 계속되면 오류 번호와 함께 문의해 주세요.',
    })
  })

  it('AC-701.1: E-AI-READ 문구에 "병원"이 없고 "니다."로 끝나는 문장이 없다', () => {
    const info = errorInfo('E-AI-READ')
    for (const text of [info.what, info.fix]) {
      expect(text).not.toContain('병원')
      expect(text).not.toMatch(/니다\./)
    }
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

// 메모 화면(precheck TASK-18): 입력 멈춤 번호의 글과 처음 질문의 갈 곳
describe('AC-018.21·AC-018.18 입력 쪽 오류 글', () => {
  it.each([
    ['E-INPUT-STOPPED', '비트 입력을 끝까지 하지 못했어요', '비트 화면을 확인한 뒤 다시 눌러 주세요. 계속되면 오류 번호와 함께 문의해 주세요.'],
    ['E-BIT-UNSAVED-RX', '비트에 저장하지 않은 처방 창이 떠 있어요', '그 창을 마무리한 뒤 다시 눌러 주세요.'],
    ['E-BIT-UI-CHANGED', '비트 화면이 달라져 입력을 멈췄어요', '비트가 업데이트됐을 수 있어요. 아래 칸 이름과 오류 번호를 함께 문의해 주세요.'],
  ])('AC-018.21: %s의 번호와 글', (code, what, fix) => {
    expect(isErrorCode(code)).toBe(true)
    expect(errorInfo(code as ErrorCode)).toEqual({ what, fix })
  })

  it("AC-018.18·AC-6607.4: E-MEMO-NO-SETTINGS의 fix는 갈 곳(설정 → 병원 문구)을 말하고 '준비 중'·'개발자'가 없다", () => {
    const { what, fix } = errorInfo('E-MEMO-NO-SETTINGS')
    expect(`${what}. ${fix}`).toBe('병원 문구가 아직 없어요. 설정 → 병원 문구에서 처음 질문을 하거나 기본 문구로 바로 시작해 주세요.')
    expect(fix).not.toContain('준비 중')
    expect(fix).not.toContain('개발자')
  })
})

describe('AC-019.4 건수 오류 문구', () => {
  it('AC-019.4: E-COUNTS-FAILED는 무엇이·어떻게 고치나가 있고 환자 메모에 영향이 없다고 알린다. 다시 시도하는 때를 말한다', () => {
    expect(isErrorCode('E-COUNTS-FAILED')).toBe(true)
    const info = errorInfo('E-COUNTS-FAILED')
    expect(info.what).toContain('건수')
    expect(info.fix).toContain('다시')
    expect(info.fix).toContain('영향이 없어요')
  })
})

describe('AC-811.5 고른 처방 오류 번호', () => {
  it('AC-811.5: E-STATS-PICK-READ-FAILED는 읽지 못했다고 알리고 [다시 읽기]와 오류 번호 알리기를 안내한다', () => {
    expect(isErrorCode('E-STATS-PICK-READ-FAILED')).toBe(true)
    const info = errorInfo('E-STATS-PICK-READ-FAILED')
    expect(info.what).toBe('고른 처방을 읽지 못했어요')
    expect(info.fix).toContain('[다시 읽기]')
    expect(info.fix).toMatch(/계속되면 오류 번호를 .*알려 주세요\.$/)
  })

  it('AC-811.5: E-STATS-PICK-SAVE-FAILED는 저장하지 못했다고 알리고 [다시 저장]과 오류 번호 알리기를 안내한다', () => {
    expect(isErrorCode('E-STATS-PICK-SAVE-FAILED')).toBe(true)
    const info = errorInfo('E-STATS-PICK-SAVE-FAILED')
    expect(info.what).toBe('고른 처방을 저장하지 못했어요')
    expect(info.fix).toContain('[다시 저장]')
    expect(info.fix).toMatch(/계속되면 오류 번호를 .*알려 주세요\.$/)
  })
})

// spec treatment-trend REQ-1203: 통계 처방별 추세 묶음 읽기·저장(lib/storage/statsRxGroups.ts)의 번호 둘
describe('AC-1203.4 처방별 추세 묶음 오류 번호', () => {
  it('AC-1203.4: 두 번호는 lib/errors.ts에 문구가 있는 번호다(번호 목록 ALL_CODES에 든다)', () => {
    expect(isErrorCode('E-STATS-GROUP-READ-FAILED')).toBe(true)
    expect(isErrorCode('E-STATS-GROUP-SAVE-FAILED')).toBe(true)
    expect(ALL_CODES).toContain('E-STATS-GROUP-READ-FAILED')
    expect(ALL_CODES).toContain('E-STATS-GROUP-SAVE-FAILED')
  })

  it('AC-1203.4: E-STATS-GROUP-READ-FAILED는 명세 글자 그대로다', () => {
    expect(errorInfo('E-STATS-GROUP-READ-FAILED')).toEqual({
      what: '처방별 추세 묶음을 읽지 못했어요',
      fix: '[다시 읽기]를 눌러 주세요. 계속되면 오류 번호를 관리자에게 알려 주세요.',
    })
  })

  it('AC-1203.4: E-STATS-GROUP-SAVE-FAILED는 명세 글자 그대로다', () => {
    expect(errorInfo('E-STATS-GROUP-SAVE-FAILED')).toEqual({
      what: '처방별 추세 묶음을 저장하지 못했어요',
      fix: '인터넷 연결을 확인하고 [저장]을 다시 눌러 주세요. 계속되면 화면을 새로 열어 주세요.',
    })
  })
})

describe('AC-2801.5 완료 표시 저장·되돌리기 실패 문구(spec claim-day-done)', () => {
  it('AC-2801.5: E-DAYCLOSE-FAILED는 명세 글자 그대로다(무엇이·어떻게 고치나·번호)', () => {
    expect(isErrorCode('E-DAYCLOSE-FAILED')).toBe(true)
    expect(errorInfo('E-DAYCLOSE-FAILED')).toEqual({
      what: '완료 표시를 저장하지 못했어요',
      fix: '고른 날짜는 그대로 있어요. 인터넷 연결을 확인하고 다시 눌러 주세요. 처음 쓰는 거라면 서버 준비(마이그레이션)가 끝났는지 확인해 주세요. 계속되면 오류 번호와 함께 문의해 주세요.',
    })
  })
})

// 서식 탭 휴진 안내(specs/forms design.md 11절 표). 문구는 표의 글자 그대로(끝 마침표 없음)
const FORMS = {
  'E-FORMS-PRIVATE': {
    what: '적은 글에 전화번호·주민번호·메일 주소 모양이 있어 보내지 않았어요',
    fix: '그 부분을 지우고 다시 [정리하기]를 눌러 주세요',
  },
  'E-FORMS-NO-DATE': {
    what: '적은 글에서 날짜를 찾지 못했어요',
    fix: "'5월 5일 어린이날 휴진'처럼 날짜를 넣어 다시 적어 주세요",
  },
  'E-FORMS-SAVE-FAILED': {
    what: '안내문을 저장하지 못했어요',
    fix: '적은 내용은 그대로예요. 인터넷 연결을 확인하고 [다시 저장]을 눌러 주세요',
  },
  'E-FORMS-READ-FAILED': {
    what: '저장한 안내문 목록을 읽지 못했어요',
    fix: '인터넷 연결을 확인하고 [다시 읽기]를 눌러 주세요',
  },
  'E-FORMS-IMAGE-FAILED': {
    what: '그림 파일을 만들지 못했어요',
    fix: '다시 눌러 보고, 계속 안 되면 [인쇄·PDF]로 PDF를 저장해 주세요',
  },
} as const satisfies Partial<Record<ErrorCode, { what: string; fix: string }>>

// 같은 모양 검사(무엇이·어떻게 고치나가 있고 "병원"·"설치·연결 확인"·"니다."가 없다)
function expectFormsShape(code: keyof typeof FORMS) {
  expect(isErrorCode(code), code).toBe(true)
  expect(ALL_CODES, code).toContain(code)
  const info = errorInfo(code)
  expect(info.what.trim(), `${code}.what`).not.toBe('')
  expect(info.fix.trim(), `${code}.fix`).not.toBe('')
  for (const text of [info.what, info.fix]) {
    expect(text, code).not.toContain('병원')
    expect(text, code).not.toContain('설치·연결 확인')
    expect(text, code).not.toMatch(/니다\./)
  }
}

describe('AC-3502.3 서식 메모 개인정보 모양 오류 문구', () => {
  it('AC-3502.3: E-FORMS-PRIVATE는 번호가 있고 무엇이·어떻게 고치나가 표 글자 그대로다', () => {
    expectFormsShape('E-FORMS-PRIVATE')
    expect(errorInfo('E-FORMS-PRIVATE')).toEqual(FORMS['E-FORMS-PRIVATE'])
  })

  it('AC-3502.3: E-FORMS-PRIVATE는 보내지 않았다고 알리고 [정리하기]를 다시 누르라고 한다', () => {
    const info = errorInfo('E-FORMS-PRIVATE')
    expect(info.what).toContain('보내지 않았어요')
    expect(info.fix).toContain('[정리하기]')
  })
})

describe('AC-3502.5 서식 날짜 없음 오류 문구', () => {
  it('AC-3502.5: E-FORMS-NO-DATE는 번호가 있고 무엇이·어떻게 고치나가 표 글자 그대로다', () => {
    expectFormsShape('E-FORMS-NO-DATE')
    expect(errorInfo('E-FORMS-NO-DATE')).toEqual(FORMS['E-FORMS-NO-DATE'])
  })

  it('AC-3502.5: 함께 뜨는 AI 오류 셋(E-AI-BUSY·E-AI-LIMIT·E-AI-FAILED)의 지금 문구는 그대로다', () => {
    expect(errorInfo('E-AI-BUSY')).toEqual({ what: 'AI가 지금 바빠서 답하지 못했어요', fix: '1~2분 뒤 [다시 분석]을 눌러 주세요.' })
    expect(errorInfo('E-AI-LIMIT')).toEqual({
      what: '이번 달 AI 사용 한도에 닿았어요',
      fix: 'Anthropic 콘솔에서 한 달 한도를 늘리거나 다음 달에 다시 해 주세요.',
    })
    expect(errorInfo('E-AI-FAILED')).toEqual({
      what: 'AI 리포트를 만들지 못했어요',
      fix: '[다시 분석]을 눌러 주세요. 계속되면 오류 번호와 함께 문의해 주세요.',
    })
  })
})

describe('AC-3507.5 서식 저장·목록 읽기 오류 문구', () => {
  it.each(['E-FORMS-SAVE-FAILED', 'E-FORMS-READ-FAILED'] as const)(
    'AC-3507.5: %s는 번호가 있고 무엇이·어떻게 고치나가 표 글자 그대로다',
    (code) => {
      expectFormsShape(code)
      expect(errorInfo(code)).toEqual(FORMS[code])
    },
  )

  it('AC-3507.5: 저장 실패는 적은 내용이 그대로라고 알리고 [다시 저장]을, 목록 실패는 [다시 읽기]를 안내한다', () => {
    expect(errorInfo('E-FORMS-SAVE-FAILED').fix).toContain('적은 내용은 그대로예요')
    expect(errorInfo('E-FORMS-SAVE-FAILED').fix).toContain('[다시 저장]')
    expect(errorInfo('E-FORMS-READ-FAILED').fix).toContain('[다시 읽기]')
  })
})

describe('AC-3506.3 서식 그림 파일 오류 문구', () => {
  it('AC-3506.3: E-FORMS-IMAGE-FAILED는 번호가 있고 무엇이·어떻게 고치나가 표 글자 그대로다', () => {
    expectFormsShape('E-FORMS-IMAGE-FAILED')
    expect(errorInfo('E-FORMS-IMAGE-FAILED')).toEqual(FORMS['E-FORMS-IMAGE-FAILED'])
  })

  it('AC-3506.3: 계속 안 되면 [인쇄·PDF]로 PDF를 저장하라고 한다', () => {
    expect(errorInfo('E-FORMS-IMAGE-FAILED').fix).toContain('[인쇄·PDF]')
  })
})

describe('AC-3502.3·AC-3502.5·AC-3506.3·AC-3507.5 서식 명세가 더하는 번호', () => {
  it('AC-3507.5: 이 명세가 더하는 E-FORMS- 번호는 표의 다섯뿐이다', () => {
    expect(Object.keys(ERRORS).filter((code) => code.startsWith('E-FORMS-') && !code.startsWith('E-FORMS-BG-')).sort()).toEqual(Object.keys(FORMS).sort())
  })

  // vitest는 타입을 보지 않는다. 번호 타입(ErrorCode)에 없으면 tsc·npm run build가 실패하므로 타입 파일 글자로 본다
  it('AC-3507.5: 다섯 번호가 번호 타입 ErrorCode(src/types/errors.ts)에도 있다', () => {
    const types = readFileSync(join(process.cwd(), 'src/types/errors.ts'), 'utf8')
    const union = types.slice(types.indexOf('export type ErrorCode ='), types.indexOf('export type ErrorInfo'))
    for (const code of Object.keys(FORMS)) expect(union).toContain(`'${code}'`)
  })
})

// 휴진 안내 AI 배경(specs/forms-themes design.md 12절 표). 문구는 표의 글자 그대로(끝 마침표 없음)
const FORMS_BG = {
  'E-FORMS-BG-LIMIT': {
    what: '오늘 만들 수 있는 AI 배경을 다 만들었어요',
    fix: '하루 20장까지예요. 저장한 내 배경을 고르거나 내일 다시 만들어 주세요',
  },
  'E-FORMS-BG-QUOTA': {
    what: 'OpenAI 그림 사용 한도에 닿았어요',
    fix: 'OpenAI 관리 화면에서 결제 한도를 늘리거나 다음 달에 다시 해 주세요',
  },
  'E-FORMS-BG-FAILED': {
    what: 'AI 배경을 만들지 못했어요',
    fix: '적은 말을 바꾸거나 다시 눌러 주세요. 계속되면 오류 번호와 함께 문의해 주세요',
  },
  'E-FORMS-BG-STORE-FAILED': {
    what: '내 배경을 저장하거나 읽지 못했어요',
    fix: '인터넷 연결을 확인하고 다시 눌러 주세요. 만든 배경은 그대로 남아 있어요',
  },
} as const satisfies Partial<Record<ErrorCode, { what: string; fix: string }>>

describe('AC-4613.4 휴진 안내 AI 배경 오류 번호', () => {
  it.each(Object.keys(FORMS_BG) as Array<keyof typeof FORMS_BG>)('AC-4613.4: %s는 번호가 있고 무엇이·어떻게 고치나가 표 글자 그대로다', (code) => {
    expect(isErrorCode(code), code).toBe(true)
    expect(ALL_CODES, code).toContain(code)
    expect(errorInfo(code)).toEqual(FORMS_BG[code])
  })

  it('AC-4613.4: 이 명세가 더하는 E-FORMS-BG- 번호는 표의 넷뿐이다', () => {
    expect(Object.keys(ERRORS).filter((code) => code.startsWith('E-FORMS-BG-')).sort()).toEqual(Object.keys(FORMS_BG).sort())
  })

  // vitest는 타입을 보지 않는다 → 타입 파일 글자로 본다(AC-3507.5와 같은 방법)
  it('AC-4613.4: 네 번호가 번호 타입 ErrorCode(src/types/errors.ts)에도 있다', () => {
    const types = readFileSync(join(process.cwd(), 'src/types/errors.ts'), 'utf8')
    const union = types.slice(types.indexOf('export type ErrorCode ='), types.indexOf('export type ErrorInfo'))
    for (const code of Object.keys(FORMS_BG)) expect(union).toContain(`'${code}'`)
  })

  it('AC-4613.4: 함께 쓰는 E-FORMS-PRIVATE·E-AI-BUSY는 지금 문구 그대로다', () => {
    expect(errorInfo('E-FORMS-PRIVATE')).toEqual(FORMS['E-FORMS-PRIVATE'])
    expect(errorInfo('E-AI-BUSY')).toEqual({ what: 'AI가 지금 바빠서 답하지 못했어요', fix: '1~2분 뒤 [다시 분석]을 눌러 주세요.' })
  })
})

// 도우미·확장 설치 파일 보관함(specs/helper-download design.md '오류' 표). 문구는 표의 글자 그대로(끝 마침표 있음)
const INSTALL = {
  'E-INSTALL-READ-FAILED': {
    what: '설치 파일 목록을 읽지 못했어요.',
    fix: '인터넷 연결을 확인하고 새로 고침 하세요.',
  },
  'E-INSTALL-DOWNLOAD-FAILED': {
    what: '파일을 받지 못했어요.',
    fix: '인터넷 연결을 확인하고 다시 눌러 보세요.',
  },
  'E-INSTALL-FILE-NAME': {
    what: '파일 이름이 맞지 않아요.',
    fix: "precheck-helper-0.9.0.zip처럼 '종류-판 번호.zip' 모양이어야 해요. 바탕화면 도우미-설치파일 폴더의 이름 그대로 올리세요.",
  },
  'E-INSTALL-FILE-SIZE': {
    what: '파일이 너무 커요.',
    fix: '5MB까지 올릴 수 있어요. 맞는 파일인지 확인하세요.',
  },
  'E-INSTALL-FILE-EXISTS': {
    what: '같은 판이 이미 올라가 있어요.',
    fix: '판 번호가 더 높은 새 파일을 올리세요.',
  },
  'E-INSTALL-UPLOAD-FAILED': {
    what: '파일을 올리지 못했어요.',
    fix: '관리자로 로그인했는지 확인하고 다시 해 보세요.',
  },
} as const satisfies Partial<Record<ErrorCode, { what: string; fix: string }>>

describe('AC-5102.2·AC-5102.3·AC-5102.4 설치 파일 오류 번호', () => {
  it.each(Object.keys(INSTALL) as Array<keyof typeof INSTALL>)('AC-5102.2·AC-5102.3·AC-5102.4: %s는 번호가 있고 무엇이·어떻게 고치나가 표 글자 그대로다', (code) => {
    expect(isErrorCode(code), code).toBe(true)
    expect(ALL_CODES, code).toContain(code)
    expect(errorInfo(code)).toEqual(INSTALL[code])
  })

  it('AC-5102.4: 이 명세가 더하는 E-INSTALL- 번호는 표의 여섯뿐이다', () => {
    expect(Object.keys(ERRORS).filter((code) => code.startsWith('E-INSTALL-')).sort()).toEqual(Object.keys(INSTALL).sort())
  })

  // vitest는 타입을 보지 않는다 → 타입 파일 글자로 본다(AC-3507.5와 같은 방법)
  it('AC-5102.4: 여섯 번호가 번호 타입 ErrorCode(src/types/errors.ts)에도 있다', () => {
    const types = readFileSync(join(process.cwd(), 'src/types/errors.ts'), 'utf8')
    const union = types.slice(types.indexOf('export type ErrorCode ='), types.indexOf('export type ErrorInfo'))
    for (const code of Object.keys(INSTALL)) expect(union).toContain(`'${code}'`)
  })
})

// 데스크 계정 칸(specs/desk-feedback design.md '③ 설정 데스크 계정 칸' 표). 문구는 표의 글자 그대로
const DESK = {
  'E-DESK-READ-FAILED': {
    what: '데스크 계정 목록을 불러오지 못했어요',
    fix: '인터넷 연결을 확인하고 [다시 불러오기]를 눌러 주세요.',
  },
  'E-DESK-SAVE-FAILED': {
    what: '데스크 계정을 바꾸지 못했어요',
    fix: '인터넷 연결을 확인하고 다시 눌러 주세요. 계속되면 오류 번호와 함께 문의해 주세요.',
  },
  'E-DESK-EMAIL-BAD': {
    what: '메일 주소 모양이 아니에요',
    fix: '데스크가 로그인할 구글 메일 주소를 그대로 적어 주세요.',
  },
  'E-DESK-EMAIL-TAKEN': {
    what: '이미 병원 계정으로 가입된 메일이에요',
    fix: '병원 계정은 데스크가 될 수 없어요. 데스크용 다른 구글 메일을 적어 주세요.',
  },
  'E-DESK-EMAIL-USED': {
    what: '이미 데스크 계정으로 더한 메일이에요',
    fix: '목록을 확인해 주세요. 다른 병원의 데스크 메일이면 그 병원에서 먼저 빼야 해요.',
  },
  'E-DESK-LIMIT': {
    what: '데스크 계정은 5개까지예요',
    fix: '쓰지 않는 계정을 [빼기]한 뒤 더해 주세요.',
  },
} as const satisfies Partial<Record<ErrorCode, { what: string; fix: string }>>

describe('AC-6304.3 데스크 계정 오류 번호', () => {
  it.each(Object.keys(DESK) as Array<keyof typeof DESK>)('AC-6304.3: %s는 번호가 있고 무엇이·어떻게 고치나가 표 글자 그대로다', (code) => {
    expect(isErrorCode(code), code).toBe(true)
    expect(ALL_CODES, code).toContain(code)
    expect(errorInfo(code)).toEqual(DESK[code])
  })

  // 코드 속 메일 모양 글자는 관리자 연락처 하나뿐이다(ui-90 AC-409.3) → 오류 글에 메일 예시를 넣지 않는다(2026-11-18 검토 고침)
  it('AC-6304.3·AC-409.3: 데스크 오류 글에는 메일 모양 글자(@)가 없다', () => {
    for (const code of Object.keys(DESK) as Array<keyof typeof DESK>) {
      const { what, fix } = errorInfo(code)
      expect(`${what} ${fix}`, code).not.toContain('@')
    }
  })

  it("AC-6304.3: E-DESK-EMAIL-TAKEN의 '무엇이' 글은 '이미 병원 계정으로 가입된 메일이에요'다", () => {
    expect(errorInfo('E-DESK-EMAIL-TAKEN').what).toBe('이미 병원 계정으로 가입된 메일이에요')
  })

  it('AC-6304.3: 이 명세가 더하는 E-DESK- 번호는 표의 여섯뿐이다', () => {
    expect(Object.keys(ERRORS).filter((code) => code.startsWith('E-DESK-')).sort()).toEqual(Object.keys(DESK).sort())
  })

  // vitest는 타입을 보지 않는다 → 타입 파일 글자로 본다(AC-3507.5와 같은 방법)
  it('AC-6304.3: 여섯 번호가 번호 타입 ErrorCode(src/types/errors.ts)에도 있다', () => {
    const types = readFileSync(join(process.cwd(), 'src/types/errors.ts'), 'utf8')
    const union = types.slice(types.indexOf('export type ErrorCode ='), types.indexOf('export type ErrorInfo'))
    for (const code of Object.keys(DESK)) expect(union).toContain(`'${code}'`)
  })

  it("AC-409.1·AC-6304.3·AC-6607.4: '병원' 낱말 예외는 E-DESK-EMAIL-TAKEN·E-DESK-EMAIL-USED·E-MEMO-NO-SETTINGS 셋뿐이다(다른 번호는 그대로 잡는다)", () => {
    expect([...HOSPITAL_WORD_OK].sort()).toEqual(['E-DESK-EMAIL-TAKEN', 'E-DESK-EMAIL-USED', 'E-MEMO-NO-SETTINGS'])
    const withWord = ALL_CODES.filter((code) => `${errorInfo(code).what} ${errorInfo(code).fix}`.includes('병원'))
    expect(withWord.sort()).toEqual(['E-DESK-EMAIL-TAKEN', 'E-DESK-EMAIL-USED', 'E-MEMO-NO-SETTINGS'])
  })
})

// 병원 정보 칸·처음 질문 저장(spec clinic-profile design.md 2절·3절·16절, TASK-2). 읽기 실패는 [다시 불러오기], 저장·로고 실패는 [다시 저장](AC-6602.7·AC-6614.8)
const CLINIC = {
  'E-CLINIC-READ-FAILED': '[다시 불러오기]',
  'E-CLINIC-SAVE-FAILED': '[다시 저장]',
  'E-CLINIC-LOGO-FAILED': '[다시 저장]',
  'E-FIRST-RUN-SAVE-FAILED': '[다시 저장]',
} as const satisfies Partial<Record<ErrorCode, string>>

describe('AC-6602.7·AC-6614.8 병원 정보·처음 질문 오류 번호', () => {
  it.each(Object.keys(CLINIC) as Array<keyof typeof CLINIC>)('AC-6602.7·AC-6614.8: %s는 번호가 있고 무엇이·어떻게 고치나가 있으며 곁의 단추를 말한다', (code) => {
    expect(isErrorCode(code), code).toBe(true)
    expect(ALL_CODES, code).toContain(code)
    const { what, fix } = errorInfo(code)
    expect(what.trim(), code).not.toBe('')
    expect(fix, code).toContain(CLINIC[code])
    expect(`${what} ${fix}`, code).not.toContain('병원')
    expect(`${what} ${fix}`, code).not.toMatch(/니다\./)
  })

  it('AC-6602.7: 저장 실패 둘은 적은 값이 화면에 그대로 있다고 알리고, 로고 실패는 로고를 말한다', () => {
    expect(errorInfo('E-CLINIC-SAVE-FAILED').fix).toContain('그대로')
    expect(errorInfo('E-CLINIC-LOGO-FAILED').what).toContain('로고')
    expect(errorInfo('E-CLINIC-LOGO-FAILED').fix).toContain('그대로')
  })

  it('AC-6614.8: 처음 질문 저장 실패는 고른 답이 그대로 있다고 알린다', () => {
    expect(errorInfo('E-FIRST-RUN-SAVE-FAILED').fix).toContain('고른 답은 그대로')
  })

  // vitest는 타입을 보지 않는다 → 타입 파일 글자로 본다(AC-3507.5와 같은 방법)
  it('AC-6602.7·AC-6614.8: 네 번호가 번호 타입 ErrorCode(src/types/errors.ts)에도 있다', () => {
    const types = readFileSync(join(process.cwd(), 'src/types/errors.ts'), 'utf8')
    const union = types.slice(types.indexOf('export type ErrorCode ='), types.indexOf('export type ErrorInfo'))
    for (const code of Object.keys(CLINIC)) expect(union).toContain(`'${code}'`)
  })
})

// 직원 탭(spec staff AC-7610.1, design.md 5절). 문구는 E-CLINIC-* 말투('무엇이 · 어떻게 고치나'), 곁의 단추나 할 일을 말한다
const STAFF = {
  'E-STAFF-READ-FAILED': '[다시 불러오기]',
  'E-STAFF-SAVE-FAILED': '그대로',
  'E-STAFF-FILE-FAILED': '10MB',
  'E-STAFF-EXCEL-FAILED': '[엑셀 양식 받기]',
  'E-STAFF-IMAGE-FAILED': '[인쇄·PDF]',
} as const

describe('AC-7610.1 직원 탭 오류 번호', () => {
  it('AC-7610.1: 직원 탭 번호는 정확히 다섯이고 번호 목록(STAFF_ERROR_CODES)과 같다', () => {
    expect([...STAFF_ERROR_CODES].sort()).toEqual(Object.keys(STAFF).sort())
    expect(Object.keys(ERRORS).filter((code) => code.startsWith('E-STAFF-')).sort()).toEqual(Object.keys(STAFF).sort())
  })

  it.each(STAFF_ERROR_CODES)('AC-7610.1: %s는 무엇이·어떻게 고치나가 있고 곁의 단추·할 일을 말한다', (code) => {
    expect(isErrorCode(code), code).toBe(true)
    const { what, fix } = errorInfo(code)
    expect(what.trim(), code).not.toBe('')
    expect(fix.trim(), code).not.toBe('')
    expect(fix, code).toContain(STAFF[code])
    // '병원' 낱말 규칙(AC-409.1)·말끝 규칙 그대로. 비트 PC 연결 단추를 말하지 않는다(청구 화면 링크 규칙, AC-013.5)
    expect(`${what} ${fix}`, code).not.toContain('병원')
    expect(`${what} ${fix}`, code).not.toMatch(/니다\./)
    expect(fix, code).not.toMatch(/\[(다시 확인|처음 등록|다시 등록)\]/)
  })

  it('AC-7610.1: 저장 실패는 적은 값이 화면에 그대로 있다고, 파일 실패는 받는 종류·크기·개수를, 그림 실패는 그림 파일이라고 알린다', () => {
    expect(errorInfo('E-STAFF-SAVE-FAILED').fix).toContain('적은 값은 화면에 그대로 있어요')
    expect(errorInfo('E-STAFF-FILE-FAILED').fix).toContain('PDF·JPG·PNG')
    expect(errorInfo('E-STAFF-FILE-FAILED').fix).toContain('20개')
    expect(errorInfo('E-STAFF-IMAGE-FAILED').what).toContain('그림 파일')
  })

  it('AC-7610.1: E-STAFF-EXCEL-FAILED는 올린 엑셀을 못 읽음·세무사 엑셀을 못 만듦 둘 다를 말한다(문구는 명세 글 그대로)', () => {
    expect(errorInfo('E-STAFF-EXCEL-FAILED')).toEqual({
      what: '엑셀 파일을 읽거나 만들지 못했어요',
      fix: '올린 파일이면 [엑셀 양식 받기]로 받은 파일에 적었는지, 암호로 잠긴 파일이 아닌지 확인하고 다시 올려 주세요. [엑셀 받기]가 안 됐으면 다시 눌러 주세요. 계속되면 오류 번호와 함께 문의해 주세요.',
    })
  })
})
