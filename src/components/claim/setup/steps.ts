import type { BridgeState, HelloResult, ResultOf } from '@/types/bridge'

// 설치·연결 확인 '준비 순서' 5단계(목업 화면 1): 확장 → 도우미 → 연결(hello) → 비트 자료 읽기(bit.check find·db) → 요양기관기호 확인(registration).
// 앞 단계가 안 되면 뒤 단계는 '대기', 앞 단계를 확인하는 중이면 뒤 단계도 '확인 중'이다. 번호(code)는 통로·도우미가 준 오류 번호 그대로다

export type StepKey = 'extension' | 'helper' | 'link' | 'bit' | 'hospital'
export type StepStatus = 'ok' | 'bad' | 'wait' | 'checking'
/** 안 된 단계 아래에 그릴 안내 */
export type StepGuideKind =
  | 'install-extension'
  | 'update-extension'
  | 'install-helper'
  | 'update-helper'
  | 'retry'
  | 'register'
  | 'reregister'

export type StepView = {
  key: StepKey
  title: string
  desc: string
  status: StepStatus
  /** 됨일 때 옆 글(버전·"이어졌어요" 등) */
  note?: string
  /** 안 됨일 때 칩 글 */
  chip?: string
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

const TEXT: Record<StepKey, readonly [string, string]> = {
  extension: ['크롬 확장 프로그램 설치', '우리 사이트와 도우미를 잇는 작은 프로그램이에요.'],
  helper: ['도우미 설치', '비트 PC에서 비트를 읽고 메모를 넣는 윈도우 프로그램이에요.'],
  link: ['연결', '웹사이트, 확장, 도우미가 서로 이어졌는지 봐요.'],
  bit: ['비트 자료 읽기', '비트를 읽기 전용으로 열어요. 비트 자료를 고치지 않아요.'],
  hospital: ['요양기관기호 확인', '이 PC의 비트가 등록한 우리 병원 것인지 봐요.'],
}

type Decided = Omit<StepView, 'key' | 'title' | 'desc'>
const ok = (note?: string): Decided => ({ status: 'ok', note })
const bad = (chip: string, code: string | undefined, guide: StepGuideKind): Decided => ({ status: 'bad', chip, code, guide })
const CHECKING: Decided = { status: 'checking' }
const version = (v: string | undefined) => (v ? `버전 ${v}` : undefined)

function decide(key: StepKey, { state, hello, helloError, check, checkError, checking }: SetupInput): Decided {
  // 확장·도우미는 답했는데(오류 번호 답) 버전을 맞추지 못했다 → 3번 연결에서 멈춘다
  const helloFailed = state === 'connecting' && helloError !== null
  switch (key) {
    case 'extension':
      if (state === 'connecting' && !helloFailed) return CHECKING
      if (state === 'no-extension') return bad('없음', 'E-EXT-MISSING', 'install-extension')
      if (state === 'update-extension') return bad('버전 안 맞음', 'E-EXT-OLD', 'update-extension')
      return ok(version(hello?.extensionVersion))
    case 'helper':
      if (state === 'no-helper') return bad('없음', 'E-HELPER-MISSING', 'install-helper')
      if (state === 'update-helper') return bad('버전 안 맞음', 'E-HELPER-OLD', 'update-helper')
      return ok(version(hello?.helperVersion))
    case 'link':
      if (helloFailed) return bad('안 됨', helloError, 'retry')
      if (state === 'disconnected') return bad('끊김', 'E-BRIDGE-DISCONNECTED', 'retry')
      if (state === 'busy') return bad('다른 창', 'E-BRIDGE-BUSY', 'retry')
      return ok('이어졌어요')
    case 'bit': {
      if (checking || (check === null && checkError === null)) return CHECKING
      if (checkError !== null || check === null) return bad('안 됨', checkError ?? undefined, 'retry')
      const failed = check.steps.find((s) => s.name !== 'registration' && !s.ok)
      return failed ? bad('안 됨', failed.code, 'retry') : ok('읽을 수 있어요')
    }
    case 'hospital': {
      // 앞 단계(bit)가 됐다 = check가 있다
      const registration = check?.steps.find((s) => s.name === 'registration')
      if (!check || !registration) return CHECKING
      if (registration.ok) return ok('등록한 병원과 같아요')
      // 등록이 없으면(등록 파일이 깨져 E-STORE-BROKEN일 때도) 처음 등록으로 새로 시작한다(AC-006.2, design.md 9-3)
      if (!check.registered) return bad('등록 없음', registration.code, 'register')
      if (registration.code === 'E-BIT-HOSPITAL-MISMATCH') return bad('병원 다름', registration.code, 'reregister')
      return bad('안 됨', registration.code, 'retry')
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
    return { key, title, desc, ...decided }
  })
}
