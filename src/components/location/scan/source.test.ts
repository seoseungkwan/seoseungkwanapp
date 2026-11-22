import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { look } from './look'
import { SCAN_TEXT } from './text'

// 동네 훑기 부품의 소스 규칙(spec location REQ-7907 AC-7907.1·AC-7907.4, design.md 14절, tasks.md 머리).
// PC 모양 하나(폰 전용 모양 없음, 사용자 규칙 2026-11-21) · 색은 토큰만 · 부품은 props·콜백만(읽기·저장·바깥 부르기 없음 — 훑기 결과는 저장하지 않는다)
// · 화면 글에 영어 낱말 없음(단위 km·m는 된다)

const DIR = 'src/components/location/scan'
const FILES = readdirSync(join(process.cwd(), DIR))
  .filter((name) => /\.tsx?$/.test(name) && !/\.test\./.test(name))
  .map((name) => `${DIR}/${name}`)
const withoutComments = (code: string) => code.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:\\])\/\/[^\n]*/g, '$1')
const read = (file: string) => withoutComments(readFileSync(join(process.cwd(), file), 'utf8'))

const WIDTH_VARIANT = /^(?:(?:max-|min-)?(?:sm|md|lg|\d*xl)|(?:min|max)-\[[^\]]*\])$/
const widthVariantsInSource = (code: string) =>
  [...code.matchAll(/(?<![\w\-[])((?:max-|min-)?(?:sm|md|lg|\d*xl)|(?:min|max)-\[[^\]\s]*\]):/g)].map((m) => m[1]!)

describe('AC-7907.1: 동네 훑기 부품 소스', () => {
  it('AC-7907.1: 살펴볼 소스가 있다(빈 검사가 아니다)', () => {
    expect(FILES).toEqual(expect.arrayContaining([`${DIR}/ScanView.tsx`, `${DIR}/rank.ts`, `${DIR}/why.ts`, `${DIR}/text.ts`, `${DIR}/look.ts`]))
  })

  it('AC-7907.1: PC 모양 하나 — 소스에 화면 폭 앞말이 없고, look.ts 묶음에도 폭 따라 바뀌는 클래스가 없다', () => {
    expect(FILES.flatMap((file) => widthVariantsInSource(read(file)).map((variant) => `${file}: ${variant}:`))).toEqual([])
    const tokens = Object.values(look).flatMap((classes) => classes.split(/\s+/))
    expect(tokens.filter((token) => token.split(':').slice(0, -1).some((variant) => WIDTH_VARIANT.test(variant)))).toEqual([])
  })

  it('AC-7907.1: 색은 토큰만 — 소스에 #색·rgb()·hsl() 글자가 없다', () => {
    expect(FILES.filter((file) => /#[0-9a-fA-F]{3,8}\b|\brgba?\(|\bhsla?\(/.test(read(file)))).toEqual([])
  })

  it('AC-7907.1: 화면 글에 영어 낱말이 없다(km·m 단위만)', () => {
    const texts = Object.values(SCAN_TEXT).map((v) => (typeof v === 'function' ? (v as (...a: unknown[]) => string)('예시', 3, 10) : v))
    const words = texts.flatMap((t) => String(t).match(/[A-Za-z]+/g) ?? []).filter((w) => !['km', 'm'].includes(w))
    expect(words).toEqual([])
  })

  it('AC-7907.4: 부품은 props·콜백만 — 바깥 부르기·저장·브라우저 저장소·supabase를 쓰지 않는다(훑기 결과 저장 없음)', () => {
    const banned = /\bfetch\s*\(|supabase|localStorage|sessionStorage|indexedDB|@\/lib\/storage|\.\.\/clients|XMLHttpRequest|process\.env/
    expect(FILES.filter((file) => banned.test(read(file)))).toEqual([])
  })
})
