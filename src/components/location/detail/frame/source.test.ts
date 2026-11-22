import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

// 후보 자세히 틀의 소스 규칙(spec location AC-7909.1, design.md 14절, tasks.md 머리·TASK-32).
// 묶음 열둘은 칸(slot)으로만 받는다 — 다른 묶음 폴더(detail/people·demand·rivals·site)와 다른 화면 폴더를 부르지 않는다.
// 부품은 props·콜백만: 읽기·저장·바깥 부르기·브라우저 저장소·supabase 없음. PC 모양 하나: 화면 폭 앞말(max-md: 등)이 없고,
// 폭 따라 바뀌는 클래스가 든 공용 모양(ds.button·ds.textButton·ds.input·ds.card 등)도 쓰지 않는다

const DIR = 'src/components/location/detail/frame'
const FILES = readdirSync(join(process.cwd(), DIR))
  .filter((name) => /\.tsx?$/.test(name) && !/\.test\./.test(name))
  .map((name) => `${DIR}/${name}`)
const withoutComments = (code: string) => code.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:\\])\/\/[^\n]*/g, '$1')
const read = (file: string) => withoutComments(readFileSync(join(process.cwd(), file), 'utf8'))
const importsOf = (code: string) => [...code.matchAll(/from\s+['"]([^'"]+)['"]/g)].map((m) => m[1]!)

const widthVariantsInSource = (code: string) =>
  [...code.matchAll(/(?<![\w\-[])((?:max-|min-)?(?:sm|md|lg|\d*xl)|(?:min|max)-\[[^\]\s]*\]):/g)].map((m) => m[1]!)

describe('AC-7909.1: 후보 자세히 틀 소스', () => {
  it('AC-7909.1: 살펴볼 소스가 있다(빈 검사가 아니다)', () => {
    expect(FILES).toEqual(expect.arrayContaining([`${DIR}/CandidateFrame.tsx`, `${DIR}/facts.ts`]))
  })

  it('AC-7909.1: 묶음은 칸으로만 받는다 — 다른 묶음·화면 폴더를 부르지 않는다', () => {
    const parentFolder = (path: string) => path.startsWith('../') // 상대 경로는 같은 폴더(./)만
    const otherScreens = /^@\/components\/location\/(?!common\/)/ // 입지 분석 부품은 공용(common)만
    const bad = FILES.flatMap((file) =>
      importsOf(read(file))
        .filter((path) => parentFolder(path) || otherScreens.test(path))
        .map((path) => `${file}: ${path}`),
    )
    expect(bad).toEqual([])
  })

  it('AC-7909.1: 부품은 props·콜백만 — 바깥 부르기·저장·브라우저 저장소·supabase를 쓰지 않는다', () => {
    const banned = /\bfetch\s*\(|supabase|localStorage|sessionStorage|indexedDB|@\/lib\/storage|clients|XMLHttpRequest|process\.env/
    expect(FILES.filter((file) => banned.test(read(file)))).toEqual([])
  })

  it('AC-7909.1: PC 모양 하나 — 화면 폭 앞말이 없고, 폭 따라 바뀌는 공용 모양을 쓰지 않는다', () => {
    expect(FILES.flatMap((file) => widthVariantsInSource(read(file)).map((variant) => `${file}: ${variant}:`))).toEqual([])
    const phoneShared = /\bds\.(?:button|textButton|input|readonly|card|panelHead|panelBody|segment)\b/
    expect(FILES.filter((file) => phoneShared.test(read(file)))).toEqual([])
  })

  it('AC-7909.1: 색은 토큰만 — 소스에 색 값(#·rgb·hsl)을 바로 쓰지 않는다', () => {
    const color = /#[0-9a-fA-F]{3,8}\b|\brgba?\(|\bhsla?\(/
    expect(FILES.filter((file) => color.test(read(file)))).toEqual([])
  })
})
