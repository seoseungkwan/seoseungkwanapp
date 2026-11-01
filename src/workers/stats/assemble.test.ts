import { createHash } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { createAssembler, StatsDataError } from './assemble'

const ID = 'req-1'
const BAD_REPLY = 'E-BRIDGE-BAD-REPLY'

// 시험 쪽 기준은 구현과 다른 길(node:crypto)로 만든다
const shaOf = (text: string) => createHash('sha256').update(text, 'utf8').digest('hex')
const bytesOf = (text: string) => Buffer.byteLength(text, 'utf8')

async function codeOf(promise: Promise<unknown>): Promise<string> {
  const error = await promise.then(
    () => null,
    (e: unknown) => e,
  )
  expect(error).toBeInstanceOf(StatsDataError)
  return (error as StatsDataError).code
}

function sendAll(assembler: ReturnType<typeof createAssembler>, parts: readonly string[], id = ID) {
  parts.forEach((data, seq) => assembler.chunk(id, seq, data))
}

describe('AC-505.1 조각 모으기: 다 맞을 때만 글자를 돌려준다', () => {
  it('조각을 차례로 이어 글자 그대로 돌려준다', async () => {
    const assembler = createAssembler()
    const parts = ['{"a":', '1,"b":', '2}']
    const text = parts.join('')
    sendAll(assembler, parts)
    await expect(assembler.end(ID, parts.length, bytesOf(text), shaOf(text))).resolves.toBe(text)
  })

  it('바이트 수는 UTF-8로 센다. 한글·이모지가 조각 경계에서 갈라져도(글자 반쪽) 이어 붙이면 맞다', async () => {
    const assembler = createAssembler()
    const text = '{"처방":"표층열치료 😀"}'
    const cut = text.indexOf('😀') + 1 // 이모지 두 칸 사이
    const parts = [text.slice(0, cut), text.slice(cut)]
    sendAll(assembler, parts)
    expect(bytesOf(text)).toBeGreaterThan(text.length)
    await expect(assembler.end(ID, 2, bytesOf(text), shaOf(text))).resolves.toBe(text)
  })

  it('조각이 없고 숫자도 0이면 빈 글자다(검사는 다음 단계가 거절한다)', async () => {
    await expect(createAssembler().end(ID, 0, 0, shaOf(''))).resolves.toBe('')
  })

  it('여러 답이 섞여 들어와도 id마다 따로 모은다', async () => {
    const assembler = createAssembler()
    assembler.chunk('a', 0, 'A1')
    assembler.chunk('b', 0, 'B1')
    assembler.chunk('a', 1, 'A2')
    assembler.chunk('b', 1, 'B2')
    await expect(assembler.end('a', 2, 4, shaOf('A1A2'))).resolves.toBe('A1A2')
    await expect(assembler.end('b', 2, 4, shaOf('B1B2'))).resolves.toBe('B1B2')
  })

  it.each([
    ['0이 아닌 번호로 시작', [1, 2]],
    ['번호가 빠짐', [0, 2]],
    ['번호가 되풀이', [0, 0]],
    ['번호가 거꾸로', [1, 0]],
  ])('%s → E-BRIDGE-BAD-REPLY', async (_name, seqs) => {
    const assembler = createAssembler()
    seqs.forEach((seq) => assembler.chunk(ID, seq, 'x'))
    await expect(codeOf(assembler.end(ID, 2, 2, shaOf('xx')))).resolves.toBe(BAD_REPLY)
  })

  it.each([
    ['조각 수가 더 많다고 함', { count: 3 }],
    ['조각 수가 더 적다고 함', { count: 1 }],
    ['바이트 수가 다름', { bytes: 3 }],
    ['SHA-256이 다름', { sha256: shaOf('yy') }],
    ['SHA-256이 대문자(소문자 16진수만 받는다)', { sha256: shaOf('xx').toUpperCase() }],
  ])('%s → E-BRIDGE-BAD-REPLY', async (_name, wrong) => {
    const assembler = createAssembler()
    sendAll(assembler, ['x', 'x'])
    const { count, bytes, sha256 } = { count: 2, bytes: 2, sha256: shaOf('xx'), ...wrong }
    await expect(codeOf(assembler.end(ID, count, bytes, sha256))).resolves.toBe(BAD_REPLY)
  })

  it('틀린 답은 버린다: 맞는 숫자로 다시 끝내도 글자가 나오지 않는다', async () => {
    const assembler = createAssembler()
    sendAll(assembler, ['x', 'x'])
    await expect(codeOf(assembler.end(ID, 2, 2, shaOf('yy')))).resolves.toBe(BAD_REPLY)
    await expect(codeOf(assembler.end(ID, 2, 2, shaOf('xx')))).resolves.toBe(BAD_REPLY)
  })

  it('abort면 모은 조각을 버리고 받은 번호다. 뒤늦은 조각도 살아나지 않는다', async () => {
    const assembler = createAssembler()
    assembler.chunk(ID, 0, 'x')
    assembler.abort(ID, 'E-BIT-READ-FAILED')
    assembler.chunk(ID, 1, 'x')
    await expect(codeOf(assembler.end(ID, 2, 2, shaOf('xx')))).resolves.toBe('E-BIT-READ-FAILED')
  })

  it('abort는 다른 id를 건드리지 않는다', async () => {
    const assembler = createAssembler()
    assembler.chunk('a', 0, 'A')
    assembler.chunk('b', 0, 'B')
    assembler.abort('a', 'E-BRIDGE-DISCONNECTED')
    await expect(assembler.end('b', 1, 1, shaOf('B'))).resolves.toBe('B')
  })

  it('오류에는 번호만 있고 자료 조각이 없다', async () => {
    const assembler = createAssembler()
    const secret = `차트${'9'}${'00001'}`
    assembler.chunk(ID, 0, secret)
    const error = await assembler.end(ID, 1, 1, 'nope').catch((e: unknown) => e)
    expect(error).toBeInstanceOf(StatsDataError)
    expect(String((error as Error).message)).toBe(BAD_REPLY)
    expect(JSON.stringify(error)).not.toContain(secret)
    expect(String((error as Error).stack)).not.toContain(secret)
  })
})
