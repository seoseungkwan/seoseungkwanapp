import { createHash } from 'node:crypto'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createAssembler } from './assemble'

// 통로 포트로 온 조각 모으기(AC-604.1). 값은 가짜다

const BAD = { ok: false, code: 'E-BRIDGE-BAD-REPLY' }
const VALUE = { v: 1, name: '가상환자01', text: '무릎 통증 / 1주 뒤 f/u' }
const TEXT = JSON.stringify(VALUE)

const sha = (text: string) => createHash('sha256').update(text, 'utf8').digest('hex')
const size = (text: string) => Buffer.byteLength(text, 'utf8')
const tick = () => new Promise<void>((resolve) => setImmediate(resolve))

// 글자를 n 조각으로 나눈다
function split(text: string, n: number): string[] {
  const step = Math.ceil(text.length / n)
  return Array.from({ length: n }, (_, i) => text.slice(i * step, (i + 1) * step))
}

function deliver(a: ReturnType<typeof createAssembler>, id: string, text = TEXT, n = 3) {
  const parts = split(text, n)
  parts.forEach((part, seq) => a.chunk(id, seq, part))
  a.end(id, parts.length, size(text), sha(text))
}

describe('createAssembler', () => {
  it('AC-604.1 조각 수·바이트·SHA-256이 맞으면 JSON으로 푼다', async () => {
    const a = createAssembler()
    deliver(a, 'r1')
    expect(await a.take('r1')).toEqual({ ok: true, json: VALUE })
  })

  it('AC-604.1 조각 하나도 맞으면 푼다', async () => {
    const a = createAssembler()
    deliver(a, 'r1', TEXT, 1)
    expect(await a.take('r1')).toEqual({ ok: true, json: VALUE })
  })

  it('AC-604.1 end 전에 take하면 end가 올 때까지 기다린다', async () => {
    const a = createAssembler()
    let settled = false
    const taken = a.take('r1').then((result) => {
      settled = true
      return result
    })
    const parts = split(TEXT, 2)
    a.chunk('r1', 0, parts[0])
    await tick()
    a.chunk('r1', 1, parts[1])
    await tick()
    await tick()
    expect(settled).toBe(false)
    a.end('r1', 2, size(TEXT), sha(TEXT))
    expect(await taken).toEqual({ ok: true, json: VALUE })
  })

  it('AC-604.1 abort가 오기 전에 take하면 abort까지 기다리고 받은 번호를 준다', async () => {
    const a = createAssembler()
    const taken = a.take('r1')
    await tick()
    a.abort('r1', 'E-BIT-READ-FAILED')
    expect(await taken).toEqual({ ok: false, code: 'E-BIT-READ-FAILED' })
  })

  it('AC-604.1 조각이 빠지면(가운데·처음) E-BRIDGE-BAD-REPLY', async () => {
    const a = createAssembler()
    const [p0, p1, p2] = split(TEXT, 3)
    a.chunk('middle', 0, p0)
    a.chunk('middle', 2, p2)
    a.end('middle', 3, size(TEXT), sha(TEXT))
    expect(await a.take('middle')).toEqual(BAD)

    a.chunk('first', 1, p1)
    a.end('first', 1, size(p1), sha(p1))
    expect(await a.take('first')).toEqual(BAD)
  })

  it('AC-604.1 순서가 바뀌면 글자 전체가 맞아도 E-BRIDGE-BAD-REPLY', async () => {
    const a = createAssembler()
    const [p0, p1] = split(TEXT, 2)
    a.chunk('r1', 1, p1)
    a.chunk('r1', 0, p0)
    a.end('r1', 2, size(TEXT), sha(TEXT))
    expect(await a.take('r1')).toEqual(BAD)
  })

  it('AC-604.1 같은 번호가 두 번 오면 E-BRIDGE-BAD-REPLY', async () => {
    const a = createAssembler()
    a.chunk('r1', 0, TEXT)
    a.chunk('r1', 0, TEXT)
    a.end('r1', 2, size(TEXT + TEXT), sha(TEXT + TEXT))
    expect(await a.take('r1')).toEqual(BAD)
  })

  it('AC-604.1 end의 조각 수가 받은 수와 다르면 E-BRIDGE-BAD-REPLY', async () => {
    const a = createAssembler()
    a.chunk('fewer', 0, TEXT)
    a.end('fewer', 2, size(TEXT), sha(TEXT))
    expect(await a.take('fewer')).toEqual(BAD)

    const [p0, p1] = split(TEXT, 2)
    a.chunk('more', 0, p0)
    a.chunk('more', 1, p1)
    a.end('more', 1, size(TEXT), sha(TEXT))
    expect(await a.take('more')).toEqual(BAD)
  })

  it('AC-604.1 바이트 수가 하나라도 다르면 E-BRIDGE-BAD-REPLY', async () => {
    const a = createAssembler()
    a.chunk('over', 0, TEXT)
    a.end('over', 1, size(TEXT) + 1, sha(TEXT))
    expect(await a.take('over')).toEqual(BAD)

    a.chunk('under', 0, TEXT)
    a.end('under', 1, size(TEXT) - 1, sha(TEXT))
    expect(await a.take('under')).toEqual(BAD)
  })

  it('AC-604.1 바이트 수는 UTF-8로 센다(글자 수가 아니다)', async () => {
    const a = createAssembler()
    a.chunk('r1', 0, TEXT)
    a.end('r1', 1, TEXT.length, sha(TEXT))
    expect(await a.take('r1')).toEqual(BAD)
  })

  it('AC-604.1 SHA-256이 다르면 E-BRIDGE-BAD-REPLY', async () => {
    const a = createAssembler()
    a.chunk('other', 0, TEXT)
    a.end('other', 1, size(TEXT), sha(`${TEXT} `))
    expect(await a.take('other')).toEqual(BAD)
  })

  it('AC-604.1 SHA-256은 16진 소문자로만 맞춘다', async () => {
    const a = createAssembler()
    a.chunk('r1', 0, TEXT)
    a.end('r1', 1, size(TEXT), sha(TEXT).toUpperCase())
    expect(await a.take('r1')).toEqual(BAD)
  })

  it('AC-604.1 검사는 맞는데 JSON이 깨졌으면 E-BRIDGE-BAD-REPLY', async () => {
    const a = createAssembler()
    const broken = '{"v":1,'
    a.chunk('r1', 0, broken)
    a.end('r1', 1, size(broken), sha(broken))
    expect(await a.take('r1')).toEqual(BAD)
  })

  it('AC-604.1 조각 없이 end만 오면 E-BRIDGE-BAD-REPLY', async () => {
    const a = createAssembler()
    a.end('r1', 0, 0, sha(''))
    expect(await a.take('r1')).toEqual(BAD)
  })

  it('AC-604.1 abort면 받은 번호로 끝내고 모으던 조각을 쓰지 않는다', async () => {
    const a = createAssembler()
    a.chunk('r1', 0, TEXT)
    a.abort('r1', 'E-BIT-READ-FAILED')
    expect(await a.take('r1')).toEqual({ ok: false, code: 'E-BIT-READ-FAILED' })
  })

  it('AC-604.1 abort 뒤의 조각·end는 결과를 바꾸지 않는다', async () => {
    const a = createAssembler()
    a.abort('r1', 'E-BIT-READ-FAILED')
    a.chunk('r1', 0, TEXT)
    a.end('r1', 1, size(TEXT), sha(TEXT))
    expect(await a.take('r1')).toEqual({ ok: false, code: 'E-BIT-READ-FAILED' })
  })

  it('AC-604.1 end 뒤의 abort·조각은 결과를 바꾸지 않는다', async () => {
    const a = createAssembler()
    a.chunk('r1', 0, TEXT)
    a.end('r1', 1, size(TEXT), sha(TEXT))
    a.chunk('r1', 1, 'x')
    a.abort('r1', 'E-BIT-READ-FAILED')
    expect(await a.take('r1')).toEqual({ ok: true, json: VALUE })
  })

  it('AC-604.1 끝난 요청은 메모리에서 지운다: 다시 take하면 기다리지 않고 실패, 늦은 조각으로 되살아나지 않는다', async () => {
    const a = createAssembler()
    deliver(a, 'r1')
    expect((await a.take('r1')).ok).toBe(true)
    expect(await a.take('r1')).toEqual(BAD)
    deliver(a, 'r1')
    expect(await a.take('r1')).toEqual(BAD)
  })

  it('AC-604.1 같은 요청을 끝나기 전에 두 번 take해도 둘째가 매달리지 않는다', async () => {
    const a = createAssembler()
    const first = a.take('r1')
    expect(await a.take('r1')).toEqual(BAD)
    deliver(a, 'r1')
    expect(await first).toEqual({ ok: true, json: VALUE })
  })

  it('AC-604.1 요청끼리 섞이지 않고, __proto__·constructor 같은 번호도 그냥 번호다', async () => {
    const a = createAssembler()
    const other = JSON.stringify({ other: true })
    deliver(a, '__proto__')
    deliver(a, 'constructor', other)
    a.abort('toString', 'E-BIT-READ-FAILED')
    expect(await a.take('constructor')).toEqual({ ok: true, json: { other: true } })
    expect(await a.take('__proto__')).toEqual({ ok: true, json: VALUE })
    expect(await a.take('toString')).toEqual({ ok: false, code: 'E-BIT-READ-FAILED' })
    expect(({} as Record<string, unknown>).parts).toBeUndefined()
  })

  describe('끝난 요청은 메모리에서 지운다', () => {
    afterEach(() => {
      vi.restoreAllMocks()
    })

    it('AC-604.1 기다리던 take가 abort로 끝나면 남은 요청이 없고 늦은 조각·end를 받지 않는다', async () => {
      const a = createAssembler()
      const digest = vi.spyOn(crypto.subtle, 'digest')
      const [p0, p1] = split(TEXT, 2)
      const taken = a.take('r1')
      a.chunk('r1', 0, p0)
      expect(a.discardUntaken()).toBe(1)
      a.abort('r1', 'E-BRIDGE-BAD-REPLY')
      expect(await taken).toEqual(BAD)
      expect(a.discardUntaken()).toBe(0)

      a.chunk('r1', 1, p1)
      a.end('r1', 2, size(TEXT), sha(TEXT))
      await tick()
      expect(digest).not.toHaveBeenCalled()
      expect(a.discardUntaken()).toBe(0)
    })

    it('AC-604.1 discardUntaken: 끝났지만 가져가지 않은 요청과 오는 중인 요청을 지우고 뒤의 take는 실패한다', async () => {
      const a = createAssembler()
      deliver(a, 'done')
      a.abort('failed', 'E-BIT-READ-FAILED')
      a.chunk('open', 0, TEXT)
      await tick()
      expect(a.discardUntaken()).toBe(0)
      expect(await a.take('done')).toEqual(BAD)
      expect(await a.take('failed')).toEqual(BAD)
      expect(await a.take('open')).toEqual(BAD)
      expect(a.discardUntaken()).toBe(0)
    })

    it('AC-604.1 discardUntaken: 지운 요청은 늦은 조각·end로 되살아나지 않는다', async () => {
      const a = createAssembler()
      const digest = vi.spyOn(crypto.subtle, 'digest')
      const [p0, p1] = split(TEXT, 2)
      a.chunk('r1', 0, p0)
      a.discardUntaken()
      a.chunk('r1', 1, p1)
      a.end('r1', 2, size(TEXT), sha(TEXT))
      await tick()
      expect(digest).not.toHaveBeenCalled()
      expect(a.discardUntaken()).toBe(0)
      expect(await a.take('r1')).toEqual(BAD)
    })

    it('AC-604.1 discardUntaken: 기다리는 take는 건드리지 않고, 그 요청은 끝나면 지워진다', async () => {
      const a = createAssembler()
      const taken = a.take('r1')
      expect(a.discardUntaken()).toBe(1)
      deliver(a, 'r1')
      expect(await taken).toEqual({ ok: true, json: VALUE })
      expect(a.discardUntaken()).toBe(0)
    })

    it('AC-604.1 discardUntaken 뒤의 새 요청은 그대로 받는다', async () => {
      const a = createAssembler()
      deliver(a, 'old')
      a.discardUntaken()
      deliver(a, 'new')
      expect(await a.take('new')).toEqual({ ok: true, json: VALUE })
    })
  })
})
