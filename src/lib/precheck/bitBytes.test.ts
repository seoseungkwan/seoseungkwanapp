import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { BIT_MEMO_MAX_BYTES, bitBytes } from './bitBytes'

// 비트 메모 칸 바이트(clinic-profile REQ-6611, AC-6611.4). 비트 청구메모 칸 OcmBilCmt는 varchar(3000)이다(2026-11-18 비트 DB 칸 정보).
// 도우미 BitBytes.Of(helper/src/Precheck.Core/Input/BitBytes.cs)와 같은 사례로 같은 답을 본다: C# 시험(BatchCheck.test.cs)에 같은 줄이 있는지도 본다

/** [글, 바이트]. 글은 C# 글자 표기로도 같은 모양이 되게 \r·\n·\uXXXX만 쓴다 */
const CASES: [string, number][] = [
  ['', 0],
  ['abc', 3],
  ['가', 2],
  ['가나다', 6],
  ['IA rt knee 시행함', 17],
  ['첫 줄\r\n둘째', 11],
  ['\u007f', 1],
  ['\u0080', 2],
  ['\u00e9', 2],
  ['\u3000', 2],
  ['\ud83d\ude00', 4],
]

/** C# 시험 줄 [InlineData("…", n)]의 글자 표기: 보이는 ASCII와 한글 음절은 그대로, \r·\n은 그 표기, 나머지는 \uXXXX */
function csharpLiteral(text: string): string {
  let out = ''
  for (const ch of text.split('')) {
    const code = ch.charCodeAt(0)
    if (ch === '\r') out += '\\r'
    else if (ch === '\n') out += '\\n'
    else if (ch === '"' || ch === '\\') out += `\\${ch}`
    else if ((code >= 0x20 && code < 0x7f) || (code >= 0xac00 && code <= 0xd7a3)) out += ch
    else out += `\\u${code.toString(16).padStart(4, '0')}`
  }
  return `"${out}"`
}

describe('AC-6611.4 bitBytes: 비트 메모 칸이 세는 바이트(ASCII 1·나머지 2)', () => {
  it.each(CASES.map(([text, bytes]) => [JSON.stringify(text), bytes, text] as const))('AC-6611.4: %s는 %i바이트', (_, bytes, text) => {
    expect(bitBytes(text)).toBe(bytes)
  })

  it('AC-6611.4: 한도는 3,000바이트이고 경계는 그 값까지다(ASCII 3,000자·한글 1,500자는 딱 한도)', () => {
    expect(BIT_MEMO_MAX_BYTES).toBe(3000)
    expect(bitBytes('a'.repeat(3000))).toBe(BIT_MEMO_MAX_BYTES)
    expect(bitBytes('가'.repeat(1500))).toBe(BIT_MEMO_MAX_BYTES)
    expect(bitBytes('가'.repeat(1500) + 'a')).toBe(BIT_MEMO_MAX_BYTES + 1)
  })

  it('AC-6611.4: 줄바꿈은 글자대로 센다(비트에 들어가는 윈도우 줄바꿈 CRLF는 2바이트)', () => {
    expect(bitBytes('가\n나')).toBe(5)
    expect(bitBytes('가\r\n나')).toBe(6)
  })

  it('AC-6611.4: 도우미 C# 시험(BatchCheck.test.cs)이 같은 사례를 같은 답으로 본다', () => {
    const source = readFileSync(fileURLToPath(new URL('../../../helper/tests/Precheck.Core.Tests/Input/BatchCheck.test.cs', import.meta.url)), 'utf8')
    for (const [text, bytes] of CASES) {
      expect(source, csharpLiteral(text)).toContain(`[InlineData(${csharpLiteral(text)}, ${bytes})]`)
    }
  })
})
