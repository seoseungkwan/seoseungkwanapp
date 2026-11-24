import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it, vi } from 'vitest'
import * as lane from './bitLane'
import { createBitLane } from './bitLane'

// 비트 통로 차례 (admin-view REQ-8021 AC-8021.8, design.md '비트 통로 차례'). 확장은 웹 연결을 한 번에 하나만 받아
// 같은 쪽 안에서 화면(useBridge·readBitDays)과 뒤에서 도는 저절로 올리기가 겹치지 않게 차례를 둔다. 화면이 먼저다.
// 순수 모듈이라 흉내 없이 부르기만 한다(새 차례 하나마다 createBitLane)

describe('bitLane: 쥔 쪽이 없을 때 (AC-8021.8)', () => {
  it('AC-8021.8: 저절로 올리기가 쥐고 있지 않으면 enterScreen은 바로 참이고(지금처럼 바로 붙음) onFree를 부르지 않는다', () => {
    const l = createBitLane()
    const onFree = vi.fn()
    expect(l.enterScreen(onFree)).toBe(true)
    expect(onFree).not.toHaveBeenCalled()
  })

  it('AC-8021.8: 화면이 하나라도 있으면 enterBackground는 null이고, 모든 화면이 떠나면 잡을 수 있다', () => {
    const l = createBitLane()
    const stop = vi.fn()
    l.enterScreen(vi.fn())
    l.enterScreen(vi.fn())
    expect(l.enterBackground(stop)).toBeNull()
    l.leaveScreen()
    expect(l.enterBackground(stop)).toBeNull()
    l.leaveScreen()
    expect(l.enterBackground(stop)).toEqual(expect.any(Function))
    expect(stop).not.toHaveBeenCalled()
  })

  it('AC-8021.8: 떠난 적 없이 leaveScreen을 더 불러도 수가 음수가 되지 않는다(다음 화면이 오면 다시 막힌다)', () => {
    const l = createBitLane()
    l.leaveScreen()
    l.leaveScreen()
    l.enterScreen(vi.fn())
    expect(l.enterBackground(vi.fn())).toBeNull()
  })
})

describe('bitLane: 저절로 올리기가 쥐고 있을 때 (AC-8021.8)', () => {
  it('AC-8021.8: 화면이 붙으려 하면 그쪽 stop()을 부르고 거짓, 놓인 뒤에 onFree를 부른다', () => {
    const l = createBitLane()
    const stop = vi.fn()
    const release = l.enterBackground(stop)!
    const onFree = vi.fn()
    expect(l.enterScreen(onFree)).toBe(false)
    expect(stop).toHaveBeenCalledTimes(1)
    expect(onFree).not.toHaveBeenCalled()
    release()
    expect(onFree).toHaveBeenCalledTimes(1)
  })

  it('AC-8021.8: 화면 둘이 기다리면 stop은 한 번만, 놓이면 둘 다 온 차례대로 부른다', () => {
    const l = createBitLane()
    const stop = vi.fn()
    const release = l.enterBackground(stop)!
    const order: string[] = []
    l.enterScreen(() => order.push('a'))
    l.enterScreen(() => order.push('b'))
    expect(stop).toHaveBeenCalledTimes(1)
    release()
    expect(order).toEqual(['a', 'b'])
  })

  it('AC-8021.8: 놓기는 한 번만 먹는다(두 번 불러도 onFree는 한 번)', () => {
    const l = createBitLane()
    const release = l.enterBackground(vi.fn())!
    const onFree = vi.fn()
    l.enterScreen(onFree)
    release()
    release()
    expect(onFree).toHaveBeenCalledTimes(1)
  })

  it('AC-8021.8: 기다리던 화면이 먼저 떠나면(leaveScreen(onFree)) 놓여도 그 onFree는 부르지 않는다', () => {
    const l = createBitLane()
    const release = l.enterBackground(vi.fn())!
    const onFree = vi.fn()
    l.enterScreen(onFree)
    l.leaveScreen(onFree)
    release()
    expect(onFree).not.toHaveBeenCalled()
    // 화면이 없으니 다시 잡을 수 있다
    expect(l.enterBackground(vi.fn())).toEqual(expect.any(Function))
  })

  it('AC-8021.8: 기다리던 화면이 있는 동안 놓이면 저절로 올리기는 다시 잡지 못한다(화면이 먼저)', () => {
    const l = createBitLane()
    const release = l.enterBackground(vi.fn())!
    l.enterScreen(vi.fn())
    release()
    expect(l.enterBackground(vi.fn())).toBeNull()
  })

  it('AC-8021.8: 이미 쥔 쪽이 있으면 둘째 enterBackground는 null이다(한 번에 하나)', () => {
    const l = createBitLane()
    expect(l.enterBackground(vi.fn())).toEqual(expect.any(Function))
    expect(l.enterBackground(vi.fn())).toBeNull()
  })

  it('AC-8021.8: 놓은 뒤에는 화면이 바로 붙는다(stop을 다시 부르지 않음)', () => {
    const l = createBitLane()
    const stop = vi.fn()
    l.enterBackground(stop)!()
    expect(l.enterScreen(vi.fn())).toBe(true)
    expect(stop).not.toHaveBeenCalled()
  })
})

describe('bitLane: 모듈 (AC-8021.8)', () => {
  it('AC-8021.8: 앱이 쓰는 차례 하나를 enterScreen·leaveScreen·enterBackground로 내보낸다(같은 차례)', () => {
    const onFree = vi.fn()
    expect(lane.enterScreen(onFree)).toBe(true)
    expect(lane.enterBackground(vi.fn())).toBeNull()
    lane.leaveScreen(onFree)
    const release = lane.enterBackground(vi.fn())
    expect(release).toEqual(expect.any(Function))
    release!()
  })

  it('AC-8021.8: 네트워크·저장소·React·통로 코드를 쓰지 않는 순수 모듈이다', () => {
    const text = readFileSync(join(process.cwd(), 'src/components/claim/bitLane.ts'), 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/(^|\s)\/\/.*$/gm, '$1')
    expect(text).not.toMatch(/^import\s/m)
    for (const word of ['fetch(', 'localStorage', 'sessionStorage', 'indexedDB', 'document.cookie', 'chrome', 'react', 'console.']) expect(text, word).not.toContain(word)
  })
})
