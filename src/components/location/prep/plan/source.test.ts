import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

// 개원 준비(비용·손익분기·일정) 부품의 소스 규칙(spec location AC-7913.1·AC-7913.2, design.md 14절, tasks.md 머리).
// 폰 전용 모양 없음(사용자 규칙 2026-11-21): 소스에 화면 폭 앞말이 없고, 폭 따라 바뀌는 클래스가 든 공용 묶음(ds.input·ds.button 등)을 가져다 쓰지 않는다.
// 부품은 props·콜백만 받는다: 읽기·저장·바깥 부르기·브라우저 저장소를 쓰지 않는다. 시계를 읽지 않는다(오늘은 props)

const DIR = 'src/components/location/prep/plan'
const FILES = readdirSync(join(process.cwd(), DIR))
  .filter((name) => /\.tsx?$/.test(name) && !/\.test\./.test(name))
  .map((name) => `${DIR}/${name}`)
const withoutComments = (code: string) => code.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:\\])\/\/[^\n]*/g, '$1')
const read = (file: string) => withoutComments(readFileSync(join(process.cwd(), file), 'utf8'))

const widthVariantsInSource = (code: string) =>
  [...code.matchAll(/(?<![\w\-[])((?:max-|min-)?(?:sm|md|lg|\d*xl)|(?:min|max)-\[[^\]\s]*\]):/g)].map((m) => m[1]!)

describe('AC-7913.1·AC-7913.2: 개원 준비 부품 소스', () => {
  it('AC-7913.1: 살펴볼 소스가 있다(빈 검사가 아니다)', () => {
    expect(FILES).toEqual(expect.arrayContaining([`${DIR}/OpenCosts.tsx`, `${DIR}/OpenSchedule.tsx`, `${DIR}/HomeEswt.tsx`]))
  })

  it('AC-7913.1: PC 모양 하나 — 소스에 화면 폭 앞말(max-md: 등)이 없다', () => {
    expect(FILES.flatMap((file) => widthVariantsInSource(read(file)).map((variant) => `${file}: ${variant}:`))).toEqual([])
  })

  it('AC-7913.1: PC 모양 하나 — 폭 따라 바뀌는 클래스가 든 공용 묶음을 쓰지 않는다', () => {
    const phoneBundles = /\bds\.(?:input|readonly|textButton|button\.\w+|segment\.\w+|panelHead|panelBody)\b|\bui\.card\b/
    expect(FILES.filter((file) => phoneBundles.test(read(file)))).toEqual([])
  })

  it('AC-7913.2: 부품은 props·콜백만 — 바깥 부르기·저장·브라우저 저장소·supabase·시계를 쓰지 않는다', () => {
    const banned =
      /\bfetch\s*\(|supabase|localStorage|sessionStorage|indexedDB|@\/lib\/storage|\.\.\/\.\.\/clients|XMLHttpRequest|process\.env|new Date\(|Date\.now|todayInKorea/
    expect(FILES.filter((file) => banned.test(read(file)))).toEqual([])
  })

  it("AC-7906.2: /location 안 링크(출처 줄·법 근거·'근거와 출처')는 평범한 <a href> — next/link를 쓰지 않는다(이 화면은 주소 tab을 처음에만 읽는다)", () => {
    expect(FILES.filter((file) => /['"]next\/link['"]/.test(read(file)))).toEqual([])
  })
})
