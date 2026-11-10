// 오류 번호 → '무엇이'·'어떻게' 글(design.md 5-2 오류 표 한 곳, REQ-3614). ERP 화면 안내(panel.ts)와 설정 화면(options.ts)이 같이 쓴다.
// 글자만 두고 다른 파일을 불러오지 않는다(내용 스크립트·설정 화면 어느 쪽에서 불러도 같게)

export type ErrorText = { readonly what: string; readonly how: string }

export const E_HELPER_MISSING = 'E-HELPER-MISSING'
export const E_HELPER_STOPPED = 'E-HELPER-STOPPED'
export const E_HELPER_TIMEOUT = 'E-HELPER-TIMEOUT'
export const E_CLOSING_FUTURE_DATE = 'E-CLOSING-FUTURE-DATE'
export const E_BRIDGE_DISCONNECTED = 'E-BRIDGE-DISCONNECTED'
export const E_BRIDGE_REJECTED = 'E-BRIDGE-REJECTED'
export const E_BRIDGE_BAD_REPLY = 'E-BRIDGE-BAD-REPLY'

/** 도우미 오류 번호 모양(src/lib/bridge/protocol.ts와 같음). 아니면 받은 글을 보이지 않고 E-BRIDGE-BAD-REPLY로 본다 */
export const ERROR_CODE = /^E-[A-Z0-9]+(?:-[A-Z0-9]+)*$/

const text = (what: string, how: string): ErrorText => Object.freeze({ what, how })
const OLD_HELPER = text('ERP 도우미가 예전 판이에요.', '새 판을 설치해 주세요. 확장과 ERP 도우미는 꼭 같이 바꿔요.')
const RETRY_TELL = '잠시 뒤 다시 해 주세요. 계속되면 이 번호를 알려 주세요.'

/** design.md 5-2 표(번호마다 무엇이·어떻게) */
export const ERRORS: Readonly<Record<string, ErrorText>> = Object.freeze({
  [E_HELPER_MISSING]: text(
    'ERP 도우미가 이 PC에 없어요.',
    'ERP 도우미를 설치해 주세요. 받은 zip을 풀고 install.cmd를 두 번 누르면 돼요.',
  ),
  [E_HELPER_STOPPED]: text(
    'ERP 도우미가 읽는 도중 멈췄어요.',
    '잠시 뒤 다시 해 주세요. 계속되면 ERP 도우미 설치 파일(install.cmd)을 다시 실행해 주세요.',
  ),
  [E_HELPER_TIMEOUT]: text('도우미가 답하지 않아요(120초).', '잠시 뒤 다시 해 주세요.'),
  'E-HELPER-BAD-MESSAGE': OLD_HELPER,
  'E-HELPER-UNKNOWN-COMMAND': OLD_HELPER,
  'E-BIT-NOT-REGISTERED': text(
    '이 PC가 아직 등록되지 않았어요.',
    'ERP 도우미 설치 파일을 다시 실행해 주세요(비트 로그인 → PC 확인 창 [확인]).',
  ),
  'E-BIT-HOSPITAL-MISMATCH': text(
    '이 PC의 비트가 등록할 때와 달라요(병원·설치 위치·서버).',
    '우리 병원 비트가 맞으면 ERP 도우미 설치 파일을 다시 실행해 다시 등록해 주세요.',
  ),
  'E-BIT-NOT-FOUND': text(
    '이 PC에서 비트를 찾지 못했어요.',
    '비트가 깔린 PC에서 써 주세요. 비트를 옮겼으면 ERP 도우미 설치 파일을 다시 실행해 주세요.',
  ),
  'E-BIT-DB-FAILED': text('비트 자료(DB)에 연결하지 못했어요.', '비트를 켜서 로그인되는지 먼저 확인한 뒤 다시 해 주세요.'),
  'E-BIT-READ-FAILED': text('비트 자료를 읽지 못했어요.', RETRY_TELL),
  'E-STORE-FAILED': text(
    '이 PC의 ERP 도우미 등록 파일을 읽지 못했어요.',
    '크롬을 모두 닫았다가 다시 연 뒤 다시 해 주세요. 계속되면 ERP 도우미 설치 파일을 다시 실행해 주세요.',
  ),
  'E-STORE-BROKEN': text('이 PC의 ERP 도우미 등록 파일이 깨졌어요.', 'ERP 도우미 설치 파일을 다시 실행해 다시 등록해 주세요.'),
  [E_CLOSING_FUTURE_DATE]: text('마감 일자가 오늘보다 뒤예요.', '날짜를 확인해 주세요.'),
  [E_BRIDGE_DISCONNECTED]: text('확장이 새로 읽혀 이 화면과 끊겼어요.', '이 화면을 새로고침(F5)한 뒤 다시 해 주세요.'),
  [E_BRIDGE_REJECTED]: text(
    '확장이 이 요청을 받지 않았어요.',
    '이 화면을 새로고침(F5)한 뒤 다시 해 주세요. 계속되면 이 번호를 알려 주세요.',
  ),
  [E_BRIDGE_BAD_REPLY]: text(
    '도우미 답의 모양이 맞지 않아 쓰지 않았어요.',
    '확장과 ERP 도우미를 같은 새 판으로 바꿔 주세요. 계속되면 이 번호를 알려 주세요.',
  ),
})

/** 표에 없는 번호(그 밖) */
export const OTHER: ErrorText = text('비트에서 읽지 못했어요.', RETRY_TELL)

/** 오류 번호 → 보일 번호와 글. 번호 모양이 아니면 E-BRIDGE-BAD-REPLY, 표에 없으면 그 번호 그대로 '그 밖' 글 */
export function explain(code: unknown): { code: string; what: string; how: string } {
  const shown = typeof code === 'string' && ERROR_CODE.test(code) ? code : E_BRIDGE_BAD_REPLY
  const found = Object.prototype.hasOwnProperty.call(ERRORS, shown) ? ERRORS[shown] : OTHER
  return { code: shown, what: found.what, how: found.how }
}
