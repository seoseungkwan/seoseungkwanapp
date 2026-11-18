// 비트 메모 칸 바이트(clinic-profile REQ-6611, AC-6611.4) [환자 자료 구역]. 순수 함수만 있다.
// 비트 청구메모 칸 OcmBilCmt는 varchar(3000)이다(2026-11-18 비트 DB 칸 정보로 확인). 도우미 BitBytes.Of(helper/src/Precheck.Core/Input/BitBytes.cs)와 같은 답을 낸다:
// 두 쪽 시험(bitBytes.test.ts·BatchCheck.test.cs)이 같은 사례를 본다. 비트에 들어가는 글은 윈도우 줄바꿈(CRLF)이므로 그 모양으로 센다

/** 비트 메모 칸 한도(바이트) */
export const BIT_MEMO_MAX_BYTES = 3000

/** 비트 메모 칸이 세는 바이트: 글자(UTF-16 코드 단위)마다 ASCII(U+0000~U+007F)면 1, 나머지(한글 등)는 2 */
export function bitBytes(text: string): number {
  let bytes = 0
  for (let i = 0; i < text.length; i++) bytes += text.charCodeAt(i) < 0x80 ? 1 : 2
  return bytes
}
