import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

// 한 장 보고서 부품의 소스 규칙(specs/location TASK-40 · AC-7914.2, design.md 14절, tasks.md 머리).
// 서버 PDF·새 패키지·보고서 저장 없음: 바깥 부르기·저장·브라우저 저장소·supabase·새 창을 쓰지 않고, 가져오는 곳은 react와 앱 안 모듈뿐이다.
// 인쇄는 window.print() 하나. 폰 전용 모양 없음(사용자 규칙 2026-11-21): 화면 폭 앞말이 없고 인쇄용 print: 만 쓴다

const DIR = 'src/components/location/report'
const FILES = readdirSync(join(process.cwd(), DIR))
  .filter((name) => /\.tsx?$/.test(name) && !/\.test\./.test(name))
  .map((name) => `${DIR}/${name}`)
const withoutComments = (code: string) => code.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:\\])\/\/[^\n]*/g, '$1')
const read = (file: string) => withoutComments(readFileSync(join(process.cwd(), file), 'utf8'))
const ALL = () => FILES.map(read).join('\n')

const widthVariantsInSource = (code: string) =>
  [...code.matchAll(/(?<![\w\-[])((?:max-|min-)?(?:sm|md|lg|\d*xl)|(?:min|max)-\[[^\]\s]*\]):/g)].map((m) => m[1]!)
const importsOf = (code: string) => [...code.matchAll(/(?:^|\n)\s*import\s[^'"]*['"]([^'"]+)['"]/g)].map((m) => m[1]!)

describe('AC-7914.2: 한 장 보고서 소스', () => {
  it('AC-7914.2: 살펴볼 소스가 있다(빈 검사가 아니다)', () => {
    expect(FILES).toEqual(expect.arrayContaining([`${DIR}/OnePageReport.tsx`]))
  })

  it('AC-7914.2: 새 패키지 없음 — 가져오는 곳은 react와 앱 안 모듈(@/·./)뿐이다', () => {
    const outside = FILES.flatMap((file) =>
      importsOf(read(file))
        .filter((from) => from !== 'react' && !from.startsWith('@/') && !from.startsWith('./'))
        .map((from) => `${file}: ${from}`),
    )
    expect(outside).toEqual([])
  })

  it('AC-7914.2: 서버 PDF·보고서 저장 없음 — 바깥 부르기·저장·브라우저 저장소·supabase·새 창을 쓰지 않는다', () => {
    const banned =
      /\bfetch\s*\(|supabase|localStorage|sessionStorage|indexedDB|@\/lib\/storage|\/clients|XMLHttpRequest|sendBeacon|process\.env|window\.open|\bBlob\b|createObjectURL|download=/
    expect(FILES.filter((file) => banned.test(read(file)))).toEqual([])
  })

  it('AC-7914.2: 인쇄는 window.print() 하나로만 연다', () => {
    const code = ALL()
    expect(code).toMatch(/window\.print\(\)/)
    expect(code).not.toMatch(/\bprint\s*\(\s*[^)\s]/)
  })

  it('AC-7914.2: PC 모양 하나 — 소스에 화면 폭 앞말(max-md: 등)이 없다', () => {
    expect(FILES.flatMap((file) => widthVariantsInSource(read(file)).map((variant) => `${file}: ${variant}:`))).toEqual([])
  })

  it('AC-7914.2: 색은 토큰만 — 16진수·rgb( 색을 쓰지 않는다', () => {
    expect(FILES.filter((file) => /#[0-9a-fA-F]{3,8}\b|rgba?\(|hsl\(/.test(read(file)))).toEqual([])
  })
})
