import type { BridgeState, HelloResult, ResultOf } from '@/types/bridge'

// 비트 PC 연결 '준비 순서' 5단계: 확장 → 도우미 → 연결(hello) → 비트 자료 읽기(bit.check find·db) → 요양기관기호 확인(registration).
// 앞 단계가 안 되면 뒤 단계는 '대기', 앞 단계를 확인하는 중이면 뒤 단계도 '확인 중'이다. 번호(code)는 통로·도우미가 준 오류 번호 그대로다.
// 칩은 ui-90 design.md '단계 칩' 표대로 상태와 안내 종류로만 정한다: 빨강(negative)은 진짜 문제(버전 안 맞음·의원 다름)에만,
// 처음 상태와 다시 확인으로 풀리는 실패·등록 없음은 accent "할 차례"다 (ui-90 REQ-412)

export type StepKey = 'extension' | 'helper' | 'link' | 'bit' | 'hospital'
export type StepStatus = 'ok' | 'bad' | 'wait' | 'checking'
/** 안 된 단계의 안내 */
export type StepGuideKind =
  | 'install-extension'
  | 'update-extension'
  | 'install-helper'
  | 'update-helper'
  | 'retry'
  | 'register'
  | 'reregister'
/** 진짜 문제의 안내: 위 오류 상자가 그 단추를 갖는다 */
export type ProblemGuideKind = 'update-extension' | 'update-helper' | 'reregister'

/** 단계 칩: 글·색(ds.chip 키)·아이콘(공용 Icon 12) */
export type StepChip = { text: string; tone: 'neutral' | 'accent' | 'positive' | 'negative'; icon?: 'check' | 'x' }

export type StepView = {
  key: StepKey
  title: string
  desc: string
  status: StepStatus
  /** 됨일 때 옆 글(버전·"이어졌어요" 등) */
  note?: string
  chip: StepChip
  code?: string
  guide?: StepGuideKind
}

export type SetupInput = {
  state: BridgeState
  hello: HelloResult | null
  /** hello가 상태를 바꾸지 않고 오류 번호로 끝났다(state는 'connecting'에 머문다) */
  helloError: string | null
  check: ResultOf<'bit.check'> | null
  /** bit.check를 부르다 난 오류 번호(통로가 거절·끊김 등) */
  checkError: string | null
  /** bit.check를 다시 부르는 중 */
  checking: boolean
}

// 이름은 시안 STEPS5, 설명은 시안 SDESC (docs/mockups/ui-90/app/gen.py)
const TEXT: Record<StepKey, readonly [string, string]> = {
  extension: ['크롬 확장 프로그램 설치', '크롬에 붙이는 작은 프로그램이에요. 우리 사이트와 도우미를 이어 줘요.'],
  helper: ['도우미 설치', '비트를 읽고 메모를 넣는 윈도우 프로그램이에요. 설치할 때 윈도우가 경고를 띄워도 정상이에요.'],
  link: ['연결', '우리 사이트, 확장 프로그램, 도우미가 서로 이어졌는지 봐요.'],
  bit: ['비트 자료 읽기', '비트를 읽기만 해요. 비트 자료를 고치지 않아요.'],
  hospital: ['요양기관기호 확인', '요양기관기호(심평원이 우리 의원에 준 번호)로 이 PC의 비트가 우리 의원 것인지 봐요.'],
}

const PROBLEM_GUIDES: ReadonlySet<StepGuideKind> = new Set<ProblemGuideKind>(['update-extension', 'update-helper', 'reregister'])

/** 진짜 문제(버전 안 맞음·의원 다름): 위 오류 상자(빨강)에 보이고, 그 단계 줄에는 칩과 설명만 둔다 */
export function isRealProblem<T extends Pick<StepView, 'status' | 'guide'>>(step: T): step is T & { guide: ProblemGuideKind } {
  return step.status === 'bad' && step.guide !== undefined && PROBLEM_GUIDES.has(step.guide)
}

/** 단계 칩 표 (ui-90 design.md '단계 칩') */
export function stepChip(status: StepStatus, guide?: StepGuideKind): StepChip {
  switch (status) {
    case 'wait':
      return { text: '대기', tone: 'neutral' }
    case 'checking':
      return { text: '확인 중', tone: 'accent' }
    case 'ok':
      return { text: '완료', tone: 'positive', icon: 'check' }
    case 'bad':
      if (guide === 'update-extension' || guide === 'update-helper') return { text: '버전 안 맞음', tone: 'negative', icon: 'x' }
      if (guide === 'reregister') return { text: '의원 다름', tone: 'negative', icon: 'x' }
      return { text: '할 차례', tone: 'accent' }
  }
}

type Decided = Pick<StepView, 'status' | 'note' | 'code' | 'guide'>
const ok = (note?: string): Decided => ({ status: 'ok', note })
const bad = (code: string | undefined, guide: StepGuideKind): Decided => ({ status: 'bad', code, guide })
const CHECKING: Decided = { status: 'checking' }
const version = (v: string | undefined) => (v ? `버전 ${v}` : undefined)

function decide(key: StepKey, { state, hello, helloError, check, checkError, checking }: SetupInput): Decided {
  // 확장·도우미는 답했는데(오류 번호 답) 버전을 맞추지 못했다 → 3번 연결에서 멈춘다
  const helloFailed = state === 'connecting' && helloError !== null
  switch (key) {
    case 'extension':
      if (state === 'connecting' && !helloFailed) return CHECKING
      if (state === 'no-extension') return bad('E-EXT-MISSING', 'install-extension')
      if (state === 'update-extension') return bad('E-EXT-OLD', 'update-extension')
      return ok(version(hello?.extensionVersion))
    case 'helper':
      if (state === 'no-helper') return bad('E-HELPER-MISSING', 'install-helper')
      if (state === 'update-helper') return bad('E-HELPER-OLD', 'update-helper')
      return ok(version(hello?.helperVersion))
    case 'link':
      if (helloFailed) return bad(helloError, 'retry')
      if (state === 'disconnected') return bad('E-BRIDGE-DISCONNECTED', 'retry')
      if (state === 'busy') return bad('E-BRIDGE-BUSY', 'retry')
      return ok('이어졌어요')
    case 'bit': {
      if (checking || (check === null && checkError === null)) return CHECKING
      if (checkError !== null || check === null) return bad(checkError ?? undefined, 'retry')
      const failed = check.steps.find((s) => s.name !== 'registration' && !s.ok)
      return failed ? bad(failed.code, 'retry') : ok('읽을 수 있어요')
    }
    case 'hospital': {
      // 앞 단계(bit)가 됐다 = check가 있다
      const registration = check?.steps.find((s) => s.name === 'registration')
      if (!check || !registration) return CHECKING
      if (registration.ok) return ok('등록한 의원과 같아요')
      // 등록이 없으면(등록 파일이 깨져 E-STORE-BROKEN일 때도) 처음 등록으로 새로 시작한다(AC-006.2, design.md 9-3)
      if (!check.registered) return bad(registration.code, 'register')
      if (registration.code === 'E-BIT-HOSPITAL-MISMATCH') return bad(registration.code, 'reregister')
      return bad(registration.code, 'retry')
    }
  }
}

const ORDER: readonly StepKey[] = ['extension', 'helper', 'link', 'bit', 'hospital']

export function setupSteps(input: SetupInput): StepView[] {
  let before: StepStatus = 'ok'
  return ORDER.map((key) => {
    const [title, desc] = TEXT[key]
    const decided: Decided =
      before === 'bad' || before === 'wait' ? { status: 'wait' } : before === 'checking' ? CHECKING : decide(key, input)
    before = decided.status
    return { key, title, desc, ...decided, chip: stepChip(decided.status, decided.guide) }
  })
}
