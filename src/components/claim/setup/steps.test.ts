import { describe, expect, it } from 'vitest'
import type { HelloResult, ResultOf } from '@/types/bridge'
import { isRealProblem, setupSteps, stepChip, type SetupInput, type StepGuideKind, type StepStatus } from './steps'

// 비트 PC 연결 '준비 순서' 5단계의 칩·설명 (ui-90 REQ-412, design.md '비트 PC 연결 (TASK-9)' 단계 칩 표, 시안 docs/mockups/ui-90/app/gen.py SDESC).
// 빨강(negative)은 진짜 문제(버전 안 맞음·의원 다름)에만, 처음 상태와 다시 확인으로 풀리는 실패는 accent "할 차례"다

const HELLO: HelloResult = { state: 'ready', extensionVersion: '0.1.0', helperVersion: '0.2.0', helperUpdateAvailable: false }
type Check = ResultOf<'bit.check'>
const step = (name: 'find' | 'db' | 'registration', r: true | string) => (r === true ? { name, ok: true } : { name, ok: false, code: r })
const check = (find: true | string, db: true | string, registration: true | string, more: Partial<Check> = {}): Check => ({
  steps: [step('find', find), step('db', db), step('registration', registration)],
  registered: true,
  institutionCode: '12345678',
  ...more,
})
const input = (more: Partial<SetupInput>): SetupInput => ({
  state: 'ready',
  hello: HELLO,
  helloError: null,
  check: check(true, true, true),
  checkError: null,
  checking: false,
  ...more,
})

// 상태 이름 → 그 상태의 setupSteps 입력
const STATES = {
  first: input({ state: 'no-extension', hello: null, check: null }),
  connecting: input({ state: 'connecting', hello: null, check: null }),
  noHelper: input({ state: 'no-helper', hello: null, check: null }),
  updateHelper: input({ state: 'update-helper', check: null }),
  updateExtension: input({ state: 'update-extension', check: null }),
  helloFailed: input({ state: 'connecting', hello: null, helloError: 'E-BRIDGE-BAD-REPLY', check: null }),
  disconnected: input({ state: 'disconnected', check: null }),
  checking: input({ check: null, checking: true }),
  bitFailed: input({ check: check(true, 'E-BIT-DB-FAILED', 'E-BIT-DB-FAILED') }),
  checkError: input({ check: null, checkError: 'E-BRIDGE-BAD-REPLY' }),
  notRegistered: input({ check: check(true, true, 'E-BIT-NOT-REGISTERED', { registered: false, institutionCode: undefined }) }),
  storeBroken: input({ check: check(true, true, 'E-STORE-BROKEN', { registered: false, institutionCode: undefined }) }),
  mismatch: input({ check: check(true, true, 'E-BIT-HOSPITAL-MISMATCH') }),
  registrationOther: input({ check: check(true, true, 'E-BIT-READ-FAILED') }),
  allOk: input({}),
} satisfies Record<string, SetupInput>

const chipsOf = (s: SetupInput) => setupSteps(s).map((v) => [v.chip.text, v.chip.tone, v.chip.icon ?? null])
const WAIT = ['대기', 'neutral', null]
const CHECKING = ['확인 중', 'accent', null]
const DONE = ['완료', 'positive', 'check']
const TURN = ['할 차례', 'accent', null]
const VERSION = ['버전 안 맞음', 'negative', 'x']
const OTHER_CLINIC = ['의원 다름', 'negative', 'x']

describe('AC-412.2 단계 칩 표 (design.md 단계 칩)', () => {
  it.each<[StepStatus, StepGuideKind | undefined, string, string, string | null]>([
    ['wait', undefined, '대기', 'neutral', null],
    ['checking', undefined, '확인 중', 'accent', null],
    ['ok', undefined, '완료', 'positive', 'check'],
    ['bad', 'install-extension', '할 차례', 'accent', null],
    ['bad', 'install-helper', '할 차례', 'accent', null],
    ['bad', 'register', '할 차례', 'accent', null],
    ['bad', 'retry', '할 차례', 'accent', null],
    ['bad', 'update-extension', '버전 안 맞음', 'negative', 'x'],
    ['bad', 'update-helper', '버전 안 맞음', 'negative', 'x'],
    ['bad', 'reregister', '의원 다름', 'negative', 'x'],
  ])('AC-412.2: %s + %s → %s 칩(%s, 아이콘 %s)', (status, guide, text, tone, icon) => {
    const chip = stepChip(status, guide)
    expect([chip.text, chip.tone, chip.icon ?? null]).toEqual([text, tone, icon])
  })

  it.each<[keyof typeof STATES, unknown[][]]>([
    ['first', [TURN, WAIT, WAIT, WAIT, WAIT]],
    ['connecting', [CHECKING, CHECKING, CHECKING, CHECKING, CHECKING]],
    ['noHelper', [DONE, TURN, WAIT, WAIT, WAIT]],
    ['updateHelper', [DONE, VERSION, WAIT, WAIT, WAIT]],
    ['updateExtension', [VERSION, WAIT, WAIT, WAIT, WAIT]],
    ['helloFailed', [DONE, DONE, TURN, WAIT, WAIT]],
    ['disconnected', [DONE, DONE, TURN, WAIT, WAIT]],
    ['checking', [DONE, DONE, DONE, CHECKING, CHECKING]],
    ['bitFailed', [DONE, DONE, DONE, TURN, WAIT]],
    ['checkError', [DONE, DONE, DONE, TURN, WAIT]],
    ['notRegistered', [DONE, DONE, DONE, DONE, TURN]],
    ['storeBroken', [DONE, DONE, DONE, DONE, TURN]],
    ['mismatch', [DONE, DONE, DONE, DONE, OTHER_CLINIC]],
    ['registrationOther', [DONE, DONE, DONE, DONE, TURN]],
    ['allOk', [DONE, DONE, DONE, DONE, DONE]],
  ])('AC-412.2: %s 상태의 다섯 칩', (name, chips) => {
    expect(chipsOf(STATES[name])).toEqual(chips)
  })

  it('AC-412.2·AC-412.1: 처음 상태(확장 없음)에는 negative 칩이 없고, 1단계만 할 차례(확장 설치 안내)다', () => {
    const steps = setupSteps(STATES.first)
    expect(steps.some((s) => s.chip.tone === 'negative')).toBe(false)
    expect(steps.map((s) => s.guide ?? null)).toEqual(['install-extension', null, null, null, null])
  })

  it('AC-412.2: 모든 상태에서 단계마다 칩이 있고, 칩은 그 단계의 상태·안내 종류로만 정해진다', () => {
    for (const [name, s] of Object.entries(STATES)) {
      for (const v of setupSteps(s)) expect(v.chip, `${name} ${v.key}`).toEqual(stepChip(v.status, v.guide))
    }
  })
})

describe('AC-412.2·AC-412.3 진짜 문제 판정', () => {
  it.each<[StepStatus, StepGuideKind | undefined, boolean]>([
    ['bad', 'update-extension', true],
    ['bad', 'update-helper', true],
    ['bad', 'reregister', true],
    ['bad', 'install-extension', false],
    ['bad', 'install-helper', false],
    ['bad', 'register', false],
    ['bad', 'retry', false],
    ['wait', undefined, false],
    ['checking', undefined, false],
    ['ok', undefined, false],
  ])('AC-412.3: %s + %s → 진짜 문제 %s', (status, guide, real) => {
    expect(isRealProblem({ status, guide })).toBe(real)
  })

  it.each<[keyof typeof STATES, string | null]>([
    ['first', null],
    ['noHelper', null],
    ['helloFailed', null],
    ['disconnected', null],
    ['bitFailed', null],
    ['notRegistered', null],
    ['storeBroken', null],
    ['allOk', null],
    ['updateHelper', 'E-HELPER-OLD'],
    ['updateExtension', 'E-EXT-OLD'],
    ['mismatch', 'E-BIT-HOSPITAL-MISMATCH'],
  ])('AC-412.3: %s 상태의 진짜 문제 번호는 %s (하나 이하)', (name, code) => {
    const real = setupSteps(STATES[name]).filter(isRealProblem)
    expect(real.length).toBeLessThanOrEqual(1)
    expect(real[0]?.code ?? null).toBe(code)
  })
})

describe('AC-412.5 단계 이름·설명 (시안 STEPS5·SDESC)', () => {
  it('AC-412.5: 다섯 단계 이름은 그대로, 설명은 시안 SDESC 글자 그대로다', () => {
    const steps = setupSteps(STATES.allOk)
    expect(steps.map((s) => s.title)).toEqual(['크롬 확장 프로그램 설치', '도우미 설치', '연결', '비트 자료 읽기', '요양기관기호 확인'])
    expect(steps.map((s) => s.desc)).toEqual([
      '크롬에 붙이는 작은 프로그램이에요. 우리 사이트와 도우미를 이어 줘요.',
      '비트를 읽고 메모를 넣는 윈도우 프로그램이에요. 설치할 때 윈도우가 경고를 띄워도 정상이에요.',
      '우리 사이트, 확장 프로그램, 도우미가 서로 이어졌는지 봐요.',
      '비트를 읽기만 해요. 비트 자료를 고치지 않아요.',
      '요양기관기호(심평원이 우리 의원에 준 번호)로 이 PC의 비트가 우리 의원 것인지 봐요.',
    ])
  })

  it("AC-412.5: 됨 옆 글은 '등록한 의원과 같아요'이고, 어느 상태의 글에도 \"병원\"·\"니다.\"가 없다", () => {
    expect(setupSteps(STATES.allOk).map((s) => s.note)).toEqual(['버전 0.1.0', '버전 0.2.0', '이어졌어요', '읽을 수 있어요', '등록한 의원과 같아요'])
    for (const [name, s] of Object.entries(STATES)) {
      for (const v of setupSteps(s)) {
        const text = [v.title, v.desc, v.note ?? '', v.chip.text].join(' ')
        expect(text, `${name} ${v.key}`).not.toMatch(/병원|니다\./)
      }
    }
  })
})
