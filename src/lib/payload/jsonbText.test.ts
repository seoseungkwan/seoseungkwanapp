import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { jsonbBytes, jsonbText } from './jsonbText'

// jsonb 글 모양(specs/uisarang-upload design.md §6, AC-8808.2). DB 제약 octet_length(payload::text)와 같은 셈을 브라우저에서 한다.
// 지금 lib/storage/stats.ts의 비공개 함수를 옮긴 것이다 — 환자 자료 구역 lib/payload가 lib/storage를 부르지 않게

describe('AC-8808.2 jsonbText: DB payload::text와 같은 글 모양', () => {
  it('AC-8808.2: 콜론·콤마 뒤에 빈칸이 하나 있다(JSON.stringify와 다르다)', () => {
    expect(jsonbText({ a: 1, b: [1, 2], c: { d: 'x' } })).toBe('{"a": 1, "b": [1, 2], "c": {"d": "x"}}')
    expect(jsonbText([])).toBe('[]')
    expect(jsonbText({})).toBe('{}')
    expect(jsonbText(null)).toBe('null')
    expect(jsonbText('가"\\')).toBe('"가\\"\\\\"')
  })

  it('AC-8808.2: 열쇠는 짧은 것부터, 길이가 같으면 글자 차례다(Postgres jsonb 열쇠 차례)', () => {
    expect(jsonbText({ total: null, v: 1, rows: [] })).toBe('{"v": 1, "rows": [], "total": null}')
    expect(jsonbText({ bb: 1, ab: 2, a: 3 })).toBe('{"a": 3, "ab": 2, "bb": 1}')
  })

  it('AC-8808.2: 열쇠 길이는 UTF-8 바이트로 잰다(가 = 3바이트)', () => {
    expect(jsonbText({ 가: 1, abcd: 2, ab: 3 })).toBe('{"ab": 3, "가": 1, "abcd": 2}')
    // 바이트 수가 같으면(가·abc 모두 3바이트) 바이트 차례다(a = 0x61 < 가 = 0xEA…)
    expect(jsonbText({ 가: 1, abc: 2 })).toBe('{"abc": 2, "가": 1}')
  })

  it('AC-8808.2: 값이 undefined인 열쇠는 빼고 배열 안 undefined는 null이다(보낼 때 JSON이 하는 대로)', () => {
    expect(jsonbText({ a: undefined, b: [undefined, 1] })).toBe('{"b": [null, 1]}')
  })

  it('AC-8808.2: jsonbBytes는 그 글의 UTF-8 바이트 수다', () => {
    expect(jsonbBytes({ a: '가' })).toBe(new TextEncoder().encode('{"a": "가"}').length)
    expect(jsonbBytes({ a: '가' })).toBe(12)
    const json = JSON.stringify({ v: 1, rows: [{ code: 'A', qty: 1 }], total: null })
    // 콤마·콜론마다 빈칸 하나씩 더 — JSON.stringify로 재면 표가 받지 않는 크기도 지나 버린다
    expect(jsonbBytes({ v: 1, rows: [{ code: 'A', qty: 1 }], total: null })).toBe(json.length + (json.match(/[,:]/g) ?? []).length)
  })

  it('AC-8808.2: 환자 자료 구역 규칙 안이다(React·supabase·lib/storage·네트워크·저장소·console 없음)', () => {
    const source = readFileSync(join(process.cwd(), 'src/lib/payload/jsonbText.ts'), 'utf8')
    expect(source).not.toMatch(/from ['"][^'"]*(react|next|supabase|storage|auth)/)
    expect(source).not.toMatch(/\b(fetch|localStorage|sessionStorage|indexedDB|console)\b/)
  })

  it('AC-8808.2: 통계 저장(lib/storage/stats.ts)은 비공개 사본을 두지 않고 이 함수를 불러 쓴다', () => {
    const stats = readFileSync(join(process.cwd(), 'src/lib/storage/stats.ts'), 'utf8')
    expect(stats).toMatch(/from '@\/lib\/payload\/jsonbText'/)
    expect(stats).not.toMatch(/function jsonbText/)
  })
})
