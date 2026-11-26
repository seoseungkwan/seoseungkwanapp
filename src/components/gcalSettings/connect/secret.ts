// 예약 구글 코드 비밀 글자 만들기 (spec google-link AC-8528.3, design.md 5절: 브라우저 crypto.getRandomValues 32바이트 → base64url).
// 만든 글자는 [구글 코드 복사]가 코드 맨 위에 넣고, [연결 시험]이 된 뒤에만 저장한다. 기록·console·브라우저 저장소에 두지 않는다

const SECRET_BYTES = 32

/** 무작위 32바이트 → base64url(43자, '=' 없음) */
export function newSecret(): string {
  const bytes = new Uint8Array(SECRET_BYTES)
  globalThis.crypto.getRandomValues(bytes)
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

// 저장 함수(lib/storage/gcal saveGcalConnection)·DB 제약과 같은 모양(design.md 7-3)
const SCRIPT_URL = /^https:\/\/script\.google\.com\/(a\/macros\/[A-Za-z0-9.-]{1,253}|macros)\/s\/[A-Za-z0-9_-]{10,200}\/exec$/
const SECRET = /^[A-Za-z0-9_-]{32,128}$/
const HEX = /^#[0-9A-Fa-f]{6}$/

export const isScriptUrl = (value: string) => SCRIPT_URL.test(value)
export const isSecret = (value: string) => SECRET.test(value)
export const isHex = (value: unknown): value is string => typeof value === 'string' && HEX.test(value)
