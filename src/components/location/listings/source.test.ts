import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { ds } from '@/components/ui/classes'
import { look } from './look'

// 매물 부품 소스 규칙 (spec location AC-7910.1~4, design.md 14절 '부품은 props·콜백만'·'PC 배치 하나', 사용자 규칙 2026-11-21 폰 전용 모양 없음).
// 읽기·저장·바깥 부르기·브라우저 저장소가 없고(네이버·부동산 사이트를 부르지 않음, 링크만), 화면 폭 앞말이 없다

const DIR = 'src/components/location/listings'
const FILES = readdirSync(join(process.cwd(), DIR))
  .filter((name) => /\.tsx?$/.test(name) && !/\.test\./.test(name))
  .map((name) => `${DIR}/${name}`)
const withoutComments = (code: string) => code.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:\\])\/\/[^\n]*/g, '$1')
const read = (file: string) => withoutComments(readFileSync(join(process.cwd(), file), 'utf8'))

const WIDTH_VARIANT = /(?<![\w\-[])((?:max-|min-)?(?:sm|md|lg|\d*xl)|(?:min|max)-\[[^\]\s]*\]):/g
const hasWidthVariant = (classes: string) => /(?:^|\s|:)(?:max-|min-)?(?:sm|md|lg|\d*xl):/.test(classes)

describe('AC-7910.1~4: 매물 부품 소스', () => {
  it('AC-7910.2: 살펴볼 소스가 있다(빈 검사가 아니다)', () => {
    expect(FILES).toEqual(
      expect.arrayContaining([`${DIR}/ListingsView.tsx`, `${DIR}/form.ts`, `${DIR}/broker.ts`, `${DIR}/terms.ts`, `${DIR}/look.ts`]),
    )
  })

  it('AC-7910.1: 부품은 props·콜백만 — fetch·window.open·supabase·저장 함수·브라우저 저장소·환경 변수를 쓰지 않는다', () => {
    const banned = /\bfetch\s*\(|window\.open|XMLHttpRequest|supabase|@\/lib\/storage|\.\.\/clients|localStorage|sessionStorage|indexedDB|process\.env/
    expect(FILES.filter((file) => banned.test(read(file)))).toEqual([])
  })

  it('AC-7910.1: 바깥 링크는 links.ts NEW_TAB(새 창 · noopener noreferrer)으로만 연다', () => {
    const blankTargets = FILES.filter((file) => /target\s*=\s*["'{]/.test(read(file)))
    expect(blankTargets).toEqual([])
    expect(FILES.filter((file) => /\bNEW_TAB\b/.test(read(file))).length).toBeGreaterThan(0)
  })

  it('AC-7910.2: PC 모양 하나 — 소스에 화면 폭 앞말(max-md: 등)이 없다', () => {
    expect(FILES.flatMap((file) => [...read(file).matchAll(WIDTH_VARIANT)].map((m) => `${file}: ${m[1]}:`))).toEqual([])
  })

  it('AC-7910.2: PC 모양 하나 — look.ts와 가져다 쓰는 ds 묶음에 폭 따라 바뀌는 클래스가 없다', () => {
    expect(Object.entries(look).filter(([, classes]) => hasWidthVariant(classes))).toEqual([])
    for (const file of FILES) {
      for (const m of read(file).matchAll(/\bds\.([A-Za-z]\w*(?:\.[A-Za-z]\w*)*)/g)) {
        const value = m[1]!.split('.').reduce<unknown>((v, k) => (v && typeof v === 'object' ? (v as Record<string, unknown>)[k] : undefined), ds)
        expect(typeof value, `${file} ds.${m[1]}`).toBe('string')
        expect(hasWidthVariant(String(value)), `${file} ds.${m[1]}`).toBe(false)
      }
    }
  })

  it('AC-7910.2: 금액 글은 money.ts wonText, 넓이 글은 area.ts 함수만 쓴다(파일 안에서 다시 세지 않음)', () => {
    const code = FILES.map(read).join('\n')
    expect(code).not.toMatch(/toLocaleString|Intl\.NumberFormat|121\s*\/\s*400|400\s*\/\s*121|40_?000\s*\/\s*121/)
  })
})
