import { createHash } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { createAssembler } from './assemble'

// 조각 모으기(REQ-009 AC-009.1·AC-009.2). 도우미 Chunker처럼 JSON 글자를 UTF-8 경계에서 자르고
// end {count, bytes(UTF-8 바이트 수), sha256(소문자 hex)}를 만들어 넣는다. 가짜 자료만 쓴다

const PARTIAL = { ok: false, code: 'E-CLAIM-PARTIAL' } as const

/** 글자를 n글자씩 자른다(한글은 UTF-8 3바이트라 바이트 수와 글자 수가 다르다) */
function split(text: string, size: number): string[] {
  const parts: string[] = []
  for (let i = 0; i < text.length; i += size) parts.push(text.slice(i, i + size))
  return parts
}

function endOf(text: string, count: number) {
  return {
    count,
    bytes: Buffer.byteLength(text, 'utf8'),
    sha256: createHash('sha256').update(text, 'utf8').digest('hex'),
  }
}

const TEXT = JSON.stringify({ version: 1, s83: [{ 환자명: '가상환자01', 증상: 'S) knee pain' }], memo: '한글 메모 ✓' })

describe('AC-009.1 조각을 seq대로 잇고 end와 맞을 때만 글자를 돌려준다', () => {
  it('AC-009.1: 차례대로 온 조각을 이어 원래 글자를 돌려준다', async () => {
    const parts = split(TEXT, 7)
    const asm = createAssembler()
    parts.forEach((data, seq) => asm.chunk('r1', seq, data))
    const { count, bytes, sha256 } = endOf(TEXT, parts.length)
    expect(await asm.end('r1', count, bytes, sha256)).toEqual({ ok: true, text: TEXT })
  })

  it('AC-009.1: 순서가 뒤바뀌어 와도 seq대로 잇는다', async () => {
    const parts = split(TEXT, 5)
    const asm = createAssembler()
    const order = parts.map((_, seq) => seq).reverse()
    ;[order[0], order[1]] = [order[1], order[0]]
    for (const seq of order) asm.chunk('r1', seq, parts[seq])
    const { count, bytes, sha256 } = endOf(TEXT, parts.length)
    expect(await asm.end('r1', count, bytes, sha256)).toEqual({ ok: true, text: TEXT })
  })

  it('AC-009.1: 조각 하나짜리(작은 답)도 같은 길로 온다', async () => {
    const asm = createAssembler()
    asm.chunk('r1', 0, TEXT)
    const { bytes, sha256 } = endOf(TEXT, 1)
    expect(await asm.end('r1', 1, bytes, sha256)).toEqual({ ok: true, text: TEXT })
  })

  it('AC-009.1: 요청 id마다 따로 모은다(섞이지 않는다)', async () => {
    const other = '{"version":1,"other":"가상환자02"}'
    const asm = createAssembler()
    const a = split(TEXT, 9)
    const b = split(other, 4)
    for (let i = 0; i < Math.max(a.length, b.length); i++) {
      if (i < b.length) asm.chunk('b', i, b[i])
      if (i < a.length) asm.chunk('a', i, a[i])
    }
    const ea = endOf(TEXT, a.length)
    const eb = endOf(other, b.length)
    expect(await asm.end('b', eb.count, eb.bytes, eb.sha256)).toEqual({ ok: true, text: other })
    expect(await asm.end('a', ea.count, ea.bytes, ea.sha256)).toEqual({ ok: true, text: TEXT })
  })

  it('AC-009.1: take(id)는 end가 먼저 와도, 나중에 와도 그 요청의 결과를 한 번 준다', async () => {
    const asm = createAssembler()
    const parts = split(TEXT, 6)
    const { count, bytes, sha256 } = endOf(TEXT, parts.length)

    // end보다 먼저 기다린다(화면 메시지와 통로 포트 메시지는 다른 길이라 차례가 바뀔 수 있다)
    const early = asm.take('r1')
    parts.forEach((data, seq) => asm.chunk('r1', seq, data))
    await asm.end('r1', count, bytes, sha256)
    expect(await early).toEqual({ ok: true, text: TEXT })

    // end 다음에 찾는다
    parts.forEach((data, seq) => asm.chunk('r2', seq, data))
    await asm.end('r2', count, bytes, sha256)
    expect(await asm.take('r2')).toEqual({ ok: true, text: TEXT })
  })
})

describe('AC-009.2 빠진 조각·남는 조각·SHA-256 다름·abort면 조각을 모두 버리고 E-CLAIM-PARTIAL', () => {
  const parts = split(TEXT, 6)
  const good = endOf(TEXT, parts.length)

  it('AC-009.2: 빠진 조각이 있으면 E-CLAIM-PARTIAL', async () => {
    const asm = createAssembler()
    parts.forEach((data, seq) => seq !== 2 && asm.chunk('r1', seq, data))
    expect(await asm.end('r1', good.count, good.bytes, good.sha256)).toEqual(PARTIAL)
  })

  it('AC-009.2: end가 말한 수보다 조각이 많으면(남는 조각) E-CLAIM-PARTIAL', async () => {
    const asm = createAssembler()
    parts.forEach((data, seq) => asm.chunk('r1', seq, data))
    asm.chunk('r1', parts.length, 'x')
    expect(await asm.end('r1', good.count, good.bytes, good.sha256)).toEqual(PARTIAL)
  })

  it('AC-009.2: 같은 seq가 두 번 오면 E-CLAIM-PARTIAL', async () => {
    const asm = createAssembler()
    parts.forEach((data, seq) => asm.chunk('r1', seq, data))
    asm.chunk('r1', 1, parts[1])
    expect(await asm.end('r1', good.count, good.bytes, good.sha256)).toEqual(PARTIAL)
  })

  it.each([-1, 1.5, Number.NaN])('AC-009.2: seq가 0 이상 정수가 아니면(%s) E-CLAIM-PARTIAL', async (bad) => {
    const asm = createAssembler()
    parts.forEach((data, seq) => asm.chunk('r1', seq, data))
    asm.chunk('r1', bad, 'x')
    expect(await asm.end('r1', good.count, good.bytes, good.sha256)).toEqual(PARTIAL)
  })

  it('AC-009.2: SHA-256이 다르면 E-CLAIM-PARTIAL', async () => {
    const asm = createAssembler()
    parts.forEach((data, seq) => asm.chunk('r1', seq, data))
    const wrong = createHash('sha256').update(TEXT + ' ', 'utf8').digest('hex')
    expect(await asm.end('r1', good.count, good.bytes, wrong)).toEqual(PARTIAL)
  })

  it('AC-009.2: SHA-256을 대문자 hex로 주면 약속(소문자)과 달라 E-CLAIM-PARTIAL', async () => {
    const asm = createAssembler()
    parts.forEach((data, seq) => asm.chunk('r1', seq, data))
    expect(await asm.end('r1', good.count, good.bytes, good.sha256.toUpperCase())).toEqual(PARTIAL)
  })

  it('AC-009.2: 바이트 수가 다르면(글자 수를 준 경우 포함) E-CLAIM-PARTIAL', async () => {
    const asm = createAssembler()
    parts.forEach((data, seq) => asm.chunk('r1', seq, data))
    expect(TEXT.length).not.toBe(good.bytes)
    expect(await asm.end('r1', good.count, TEXT.length, good.sha256)).toEqual(PARTIAL)
  })

  it('AC-009.2: 조각 내용이 바뀌면(같은 수·같은 바이트) SHA-256으로 잡는다', async () => {
    const asm = createAssembler()
    parts.forEach((data, seq) => asm.chunk('r1', seq, seq === 0 ? data.replace('{', '[') : data))
    expect(await asm.end('r1', good.count, good.bytes, good.sha256)).toEqual(PARTIAL)
  })

  it('AC-009.2: abort가 오면 그 요청의 조각을 버린다. 그 뒤 늦게 온 조각·end도 받지 않는다', async () => {
    const asm = createAssembler()
    const waiting = asm.take('r1')
    parts.slice(0, 2).forEach((data, seq) => asm.chunk('r1', seq, data))
    asm.abort('r1', 'E-BIT-READ-FAILED')
    expect(await waiting).toEqual(PARTIAL)
    parts.slice(2).forEach((data, i) => asm.chunk('r1', i + 2, data))
    expect(await asm.end('r1', good.count, good.bytes, good.sha256)).toEqual(PARTIAL)
  })

  it('AC-009.2: 실패한 요청은 다른 요청에 번지지 않는다', async () => {
    const asm = createAssembler()
    parts.forEach((data, seq) => {
      asm.chunk('bad', seq, data)
      asm.chunk('good', seq, data)
    })
    asm.abort('bad', 'E-BRIDGE-DISCONNECTED')
    expect(await asm.end('good', good.count, good.bytes, good.sha256)).toEqual({ ok: true, text: TEXT })
  })

  it('AC-009.2: 한 번 끝난 요청(end)에 다시 end가 와도 같은 글자를 두 번 내주지 않는다', async () => {
    const asm = createAssembler()
    parts.forEach((data, seq) => asm.chunk('r1', seq, data))
    expect((await asm.end('r1', good.count, good.bytes, good.sha256)).ok).toBe(true)
    expect(await asm.end('r1', good.count, good.bytes, good.sha256)).toEqual(PARTIAL)
  })

  it('AC-009.2: 한 번 찾아 간 결과를 다시 take하면 같은 글자를 주지 않고 E-CLAIM-PARTIAL', async () => {
    const asm = createAssembler()
    parts.forEach((data, seq) => asm.chunk('r1', seq, data))
    await asm.end('r1', good.count, good.bytes, good.sha256)
    expect(await asm.take('r1')).toEqual({ ok: true, text: TEXT })
    expect(await asm.take('r1')).toEqual(PARTIAL)
  })

  it('AC-009.2: 찾아 가지 않은 결과는 16개까지만 둔다. 17번째가 끝나면 가장 오래된 것만 버려 E-CLAIM-PARTIAL로 읽힌다', async () => {
    const asm = createAssembler()
    for (let i = 0; i < 17; i++) {
      parts.forEach((data, seq) => asm.chunk(`r${i}`, seq, data))
      await asm.end(`r${i}`, good.count, good.bytes, good.sha256)
    }
    expect(await asm.take('r0')).toEqual(PARTIAL)
    expect(await asm.take('r1')).toEqual({ ok: true, text: TEXT })
    expect(await asm.take('r16')).toEqual({ ok: true, text: TEXT })
  })
})
