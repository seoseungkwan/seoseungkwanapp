import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import type { RxGroupDef } from '@/types/analysis'
import { copyGroupDef } from './groupDef'

const KEY = 't0123456789abcdef'

describe('AC-3705.1 copyGroupDef — Worker로 보내는 묶음 정의 사본', () => {
  it('AC-3705.1: 빼는 처방·조건이 없는 정의는 지금처럼 { id, codes }뿐이다(빈 out·cond도 싣지 않는다)', () => {
    const plain = copyGroupDef({ id: KEY, codes: ['MM010', 'MM015'] })
    expect(plain).toStrictEqual({ id: KEY, codes: ['MM010', 'MM015'] })
    expect(JSON.stringify(plain)).toBe(`{"id":"${KEY}","codes":["MM010","MM015"]}`)
    expect(copyGroupDef({ id: KEY, codes: ['MM010'], out: [], cond: [] })).toStrictEqual({ id: KEY, codes: ['MM010'] })
  })

  it('AC-3705.1: 빼는 처방·조건이 있으면 새 배열로 싣는다(원래 정의를 바꿔도 사본은 그대로)', () => {
    const def: RxGroupDef = { id: KEY, codes: ['MM010', 'MM080'], out: ['ESWT7'], cond: [{ code: 'MM080', unless: ['MM020', 'TENS'] }] }
    const copy = copyGroupDef(def)
    expect(copy).toStrictEqual({ id: KEY, codes: ['MM010', 'MM080'], out: ['ESWT7'], cond: [{ code: 'MM080', unless: ['MM020', 'TENS'] }] })
    expect(copy.codes).not.toBe(def.codes)
    expect(copy.out).not.toBe(def.out)
    expect(copy.cond).not.toBe(def.cond)
    expect(copy.cond?.[0]).not.toBe(def.cond?.[0])
    expect(copy.cond?.[0].unless).not.toBe(def.cond?.[0].unless)
    def.codes.push('MM015')
    def.out?.push('MM302')
    def.cond?.[0].unless.push('MM030')
    def.cond?.push({ code: 'MM010', unless: ['MM020'] })
    expect(copy).toStrictEqual({ id: KEY, codes: ['MM010', 'MM080'], out: ['ESWT7'], cond: [{ code: 'MM080', unless: ['MM020', 'TENS'] }] })
  })

  it('AC-3705.1: 빼는 처방만·조건만 있는 정의는 있는 칸만 싣는다', () => {
    expect(copyGroupDef({ id: KEY, codes: ['MM010'], out: ['ESWT7'], cond: [] })).toStrictEqual({ id: KEY, codes: ['MM010'], out: ['ESWT7'] })
    expect(copyGroupDef({ id: KEY, codes: ['MM080'], cond: [{ code: 'MM080', unless: ['MM020'] }] })).toStrictEqual({
      id: KEY,
      codes: ['MM080'],
      cond: [{ code: 'MM080', unless: ['MM020'] }],
    })
  })
})

describe('AC-3705.3 Worker 메시지 묶음 항목에는 열쇠와 코드뿐', () => {
  it('AC-3705.3: 이름·sortOrder·저장 id가 붙은 묶음을 넘겨도 사본에는 id·codes·out·cond뿐이고, 조건 항목은 { code, unless }만이다', () => {
    const saved = {
      id: KEY,
      codes: ['MM010', 'MM080'],
      out: ['ESWT7'],
      cond: [{ code: 'MM080', unless: ['MM020'], note: '메모' }],
      name: '기본 PT',
      sortOrder: 3,
      savedId: '7d0c2f4e-0000-4000-8000-000000000000',
    }
    const copy = copyGroupDef(saved) // 칸이 더 있는 값도 RxGroupDef로 넘어온다(화면 묶음 값을 그대로 넘긴 경우)
    expect(Object.keys(copy)).toEqual(['id', 'codes', 'out', 'cond'])
    expect(copy.cond?.map((item) => Object.keys(item))).toEqual([['code', 'unless']])
    expect(JSON.stringify(copy)).not.toMatch(/기본 PT|sortOrder|savedId|메모/)
  })
})

describe('AC-3713.3 환자 자료 구역 — 고친 파일은 타입과 같은 폴더만 부른다', () => {
  // lint(eslint.config.mjs)와 src/guardrails.test.ts가 막는 것을 고친 두 파일에서 한 번 더 본다
  it.each(['groupDef.ts', 'aggregate.ts'])('AC-3713.3: %s에 네트워크·console·브라우저 저장소·React import가 없다', (file) => {
    const source = readFileSync(new URL(`./${file}`, import.meta.url), 'utf8')
    const imports = [...source.matchAll(/^import\s[^'"]*['"]([^'"]+)['"]/gm)].map((m) => m[1])
    expect(imports.length).toBeGreaterThan(0)
    for (const from of imports) expect(from).toMatch(/^(@\/types\/|\.\/)/)
    expect(source).not.toMatch(/\b(fetch|XMLHttpRequest|WebSocket|EventSource|console|localStorage|sessionStorage|indexedDB)\b/)
  })
})
