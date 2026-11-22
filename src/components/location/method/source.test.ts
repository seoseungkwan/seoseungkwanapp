import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

// 처음 안내 장·[분석 방법] 판 소스 규칙(spec location AC-7920.1, design.md 14·19절, tasks.md TASK-66).
// 폰 전용 모양 없음(사용자 규칙 2026-11-21): 화면 폭 앞말이 없고, 폭 따라 바뀌는 클래스가 든 ds 묶음(단추·입력·글 단추)을 쓰지 않는다.
// 글은 method.ts 한 곳: 부품 소스(주석 뺌)의 한글은 method.ts에 없는 [닫기] 한 마디(text.ts)뿐이다.
// 부품은 props·콜백만: 읽기·저장·바깥 부르기·브라우저 저장소가 없고, /location 링크는 Next Link가 아닌 평범한 <a>다

const DIR = 'src/components/location/method'
const FILES = readdirSync(join(process.cwd(), DIR))
  .filter((name) => /\.tsx?$/.test(name) && !/\.test\./.test(name))
  .map((name) => `${DIR}/${name}`)
const withoutComments = (code: string) => code.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:\\])\/\/[^\n]*/g, '$1')
const read = (file: string) => withoutComments(readFileSync(join(process.cwd(), file), 'utf8'))

const widthVariantsInSource = (code: string) =>
  [...code.matchAll(/(?<![\w\-[])((?:max-|min-)?(?:sm|md|lg|\d*xl)|(?:min|max)-\[[^\]\s]*\]):/g)].map((m) => m[1]!)

describe('AC-7920.1: 처음 안내 장·[분석 방법] 판 소스', () => {
  it('AC-7920.1: 살펴볼 소스가 있다(빈 검사가 아니다)', () => {
    expect(FILES).toEqual(expect.arrayContaining([`${DIR}/MethodCard.tsx`, `${DIR}/MethodPanel.tsx`]))
  })

  it('AC-7920.1: PC 모양 하나 — 화면 폭 앞말이 없고 ds.button·ds.input·ds.textButton을 쓰지 않는다', () => {
    expect(FILES.flatMap((file) => widthVariantsInSource(read(file)).map((variant) => `${file}: ${variant}:`))).toEqual([])
    expect(FILES.filter((file) => /\bds\.(button|input|textButton)\b/.test(read(file)))).toEqual([])
  })

  it('AC-7920.1: 부품은 props·콜백만 — 바깥 부르기·저장·브라우저 저장소·supabase가 없다', () => {
    const banned = /\bfetch\s*\(|supabase|localStorage|sessionStorage|indexedDB|@\/lib\/storage|\.\.\/clients|XMLHttpRequest|process\.env/
    expect(FILES.filter((file) => banned.test(read(file)))).toEqual([])
  })

  it('AC-7920.1: /location 링크는 평범한 <a> — next/link를 쓰지 않는다', () => {
    expect(FILES.filter((file) => /from\s+['"]next\/link['"]/.test(read(file)))).toEqual([])
  })

  it("AC-7920.1: 글은 method.ts에서 — 부품 소스의 한글은 text.ts의 '닫기' 하나뿐", () => {
    // 따옴표 글·JSX 안 글 모두(주석은 뺌)
    const hangul = FILES.flatMap((file) => (read(file).match(/[가-힣]+/g) ?? []).map((word) => `${file}: ${word}`))
    expect(hangul).toEqual([`${DIR}/text.ts: 닫기`])
  })
})
