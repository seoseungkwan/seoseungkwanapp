import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { look } from './look'

// 처음·열쇠 없음 부품의 소스 규칙(spec location AC-7917.1, design.md 14절, tasks.md 머리).
// 폰 전용 모양 없음(사용자 규칙 2026-11-21): 소스에 화면 폭 앞말이 없고, 가져다 쓰는 ds 묶음은 look.ts가 폭 따라 바뀌는 클래스를 뺀 것만 쓴다.
// 부품은 props·콜백만 받는다: 읽기·저장·바깥 부르기·브라우저 저장소를 쓰지 않는다

const DIR = 'src/components/location/start'
const FILES = readdirSync(join(process.cwd(), DIR))
  .filter((name) => /\.tsx?$/.test(name) && !/\.test\./.test(name))
  .map((name) => `${DIR}/${name}`)
const withoutComments = (code: string) => code.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:\\])\/\/[^\n]*/g, '$1')
const read = (file: string) => withoutComments(readFileSync(join(process.cwd(), file), 'utf8'))

const WIDTH_VARIANT = /^(?:(?:max-|min-)?(?:sm|md|lg|\d*xl)|(?:min|max)-\[[^\]]*\])$/
const widthVariantsInSource = (code: string) =>
  [...code.matchAll(/(?<![\w\-[])((?:max-|min-)?(?:sm|md|lg|\d*xl)|(?:min|max)-\[[^\]\s]*\]):/g)].map((m) => m[1]!)

describe('AC-7917.1: 처음·열쇠 없음 부품 소스', () => {
  it('AC-7917.1: 살펴볼 소스가 있다(빈 검사가 아니다)', () => {
    expect(FILES).toEqual(
      expect.arrayContaining([`${DIR}/EmptyScreen.tsx`, `${DIR}/NoKeyScreen.tsx`, `${DIR}/KeyStatusList.tsx`, `${DIR}/keys.ts`, `${DIR}/look.ts`]),
    )
  })

  it('AC-7917.1: PC 모양 하나 — 소스에 화면 폭 앞말(max-md: 등)이 없다', () => {
    expect(FILES.flatMap((file) => widthVariantsInSource(read(file)).map((variant) => `${file}: ${variant}:`))).toEqual([])
  })

  it('AC-7917.1: PC 모양 하나 — look.ts 묶음에 폭 따라 바뀌는 클래스가 없다', () => {
    const tokens = Object.values(look).flatMap((classes) => classes.split(/\s+/))
    expect(tokens.filter((token) => token.split(':').slice(0, -1).some((variant) => WIDTH_VARIANT.test(variant)))).toEqual([])
  })

  it('AC-7917.1: 부품은 props·콜백만 — 바깥 부르기·저장·브라우저 저장소·supabase를 쓰지 않는다', () => {
    const banned = /\bfetch\s*\(|supabase|localStorage|sessionStorage|indexedDB|@\/lib\/storage|\.\.\/clients|XMLHttpRequest|process\.env/
    expect(FILES.filter((file) => banned.test(read(file)))).toEqual([])
  })
})
