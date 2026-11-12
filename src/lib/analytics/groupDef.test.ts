import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import type { RxGroupDef } from '@/types/analysis'
import { copyGroupDef } from './groupDef'

// 묶음 정의 옮기기 (specs/rx-group-exclude design.md '정의 옮기기'). 불러오기 길 네 곳(TASK-4)이 이것으로 정의를 옮겨 싣는다.
// 시험 코드·이름은 지어낸 값이다

describe('AC-2703.6·AC-2704.1 copyGroupDef — 제외할 처방이 없으면 지금처럼 { id, codes }만', () => {
  it('AC-2703.6: exclude 열쇠가 없는 정의 → { id, codes }(exclude 열쇠 없음)', () => {
    const copy = copyGroupDef({ id: 'g-heat', codes: ['MM010', 'MM011'] })
    expect(copy).toEqual({ id: 'g-heat', codes: ['MM010', 'MM011'] })
    expect(Object.keys(copy).sort()).toEqual(['codes', 'id'])
  })

  it('AC-2703.6: exclude가 빈 배열 → { id, codes }(exclude 열쇠 없음)', () => {
    const copy = copyGroupDef({ id: 'g-heat', codes: ['MM010'], exclude: [] })
    expect(copy).toEqual({ id: 'g-heat', codes: ['MM010'] })
    expect('exclude' in copy).toBe(false)
  })
})

describe('AC-2704.1 copyGroupDef — 제외할 처방이 있으면 exclude를 새 배열로 싣는다', () => {
  it('AC-2704.1: { id, codes, exclude } 그대로(차례·글자 그대로)', () => {
    const copy = copyGroupDef({ id: 'g-heat', codes: ['MM010'], exclude: ['ESWT7', 'eswt1'] })
    expect(copy).toEqual({ id: 'g-heat', codes: ['MM010'], exclude: ['ESWT7', 'eswt1'] })
    expect(Object.keys(copy).sort()).toEqual(['codes', 'exclude', 'id'])
  })

  it('AC-2704.1: 새 객체·새 배열이다(원래 정의를 고쳐도 옮긴 것은 그대로)', () => {
    const def: RxGroupDef = { id: 'g-heat', codes: ['MM010'], exclude: ['ESWT7'] }
    const copy = copyGroupDef(def)
    expect(copy).not.toBe(def)
    expect(copy.codes).not.toBe(def.codes)
    expect(copy.exclude).not.toBe(def.exclude)
    def.codes.push('MM099')
    def.exclude?.push('ESWT9')
    expect(copy).toEqual({ id: 'g-heat', codes: ['MM010'], exclude: ['ESWT7'] })
  })

  it('AC-2704.1: 다른 칸(묶음 이름 등)은 싣지 않는다', () => {
    const withName = { id: 'g-heat', codes: ['MM010'], exclude: ['ESWT7'], name: '표층열만', sortOrder: 3 }
    expect(copyGroupDef(withName)).toEqual({ id: 'g-heat', codes: ['MM010'], exclude: ['ESWT7'] })
    const plainWithName = { id: 'g-heat', codes: ['MM010'], exclude: [], name: '표층열만' }
    expect(copyGroupDef(plainWithName)).toEqual({ id: 'g-heat', codes: ['MM010'] })
  })
})

describe('AC-2709.1 환자 자료 구역 소스', () => {
  it('AC-2709.1: groupDef.ts는 타입 import뿐이고 네트워크·console·브라우저 저장소를 쓰지 않는다', () => {
    const text = readFileSync(new URL('./groupDef.ts', import.meta.url), 'utf8')
    const imports = text.split('\n').filter((line) => /^\s*(import|export)\b.*\bfrom\b/.test(line))
    expect(imports).toEqual(["import type { RxGroupDef } from '@/types/analysis'"])
    for (const word of ['fetch', 'XMLHttpRequest', 'WebSocket', 'sendBeacon', 'console', 'localStorage', 'sessionStorage', 'indexedDB', 'document.cookie']) {
      expect(text, word).not.toContain(word)
    }
  })
})
