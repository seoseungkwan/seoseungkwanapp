import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

// 거리 사진·건물 서류·빈 칸 짐작·땅 쓰임 부품의 소스 규칙(spec location AC-7909.4·AC-7909.5, design.md 14절, tasks.md 머리).
// PC 모양 하나(사용자 규칙 2026-11-21): 화면 폭 앞말이 없고, 폭 따라 바뀌는 클래스가 든 공용 ds 묶음(단추·입력·패널·글자 단추·기간 단추)을 쓰지 않는다.
// 부품은 props·콜백만 받는다: 읽기·저장·바깥 부르기·브라우저 저장소를 쓰지 않는다. 바깥 링크는 새 창(NEW_TAB)으로만

const DIR = 'src/components/location/detail/site'
const FILES = readdirSync(join(process.cwd(), DIR))
  .filter((name) => /\.tsx?$/.test(name) && !/\.test\./.test(name))
  .map((name) => `${DIR}/${name}`)
const withoutComments = (code: string) => code.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:\\])\/\/[^\n]*/g, '$1')
const read = (file: string) => withoutComments(readFileSync(join(process.cwd(), file), 'utf8'))

const widthVariantsInSource = (code: string) =>
  [...code.matchAll(/(?<![\w\-[])((?:max-|min-)?(?:sm|md|lg|\d*xl)|(?:min|max)-\[[^\]\s]*\]):/g)].map((m) => m[1]!)

describe('AC-7909.4·AC-7909.5: 부품 소스', () => {
  it('AC-7909.4·AC-7909.5: 살펴볼 소스가 있다(빈 검사가 아니다)', () => {
    expect(FILES).toEqual(
      expect.arrayContaining([`${DIR}/StreetPhotos.tsx`, `${DIR}/BuildingDocs.tsx`, `${DIR}/Vacancy.tsx`, `${DIR}/LandUse.tsx`, `${DIR}/floors.ts`]),
    )
  })

  it('AC-7909.4·AC-7909.5: PC 모양 하나 — 화면 폭 앞말(max-md: 등)이 없다', () => {
    expect(FILES.flatMap((file) => widthVariantsInSource(read(file)).map((variant) => `${file}: ${variant}:`))).toEqual([])
  })

  it('AC-7909.4·AC-7909.5: 폭 따라 바뀌는 공용 묶음(ds.button·ds.input·ds.textButton·ds.panel*·ds.segment·ui)을 쓰지 않는다', () => {
    const banned = /\bds\.(?:button|input|readonly|textButton|panel|panelHead|panelBody|segment)\b|\bui\./
    expect(FILES.filter((file) => banned.test(read(file)))).toEqual([])
  })

  it('AC-7909.4·AC-7909.5: 부품은 props·콜백만 — 바깥 부르기·저장·브라우저 저장소·supabase를 쓰지 않는다', () => {
    const banned = /\bfetch\s*\(|supabase|localStorage|sessionStorage|indexedDB|@\/lib\/storage|\/clients['"]|XMLHttpRequest|process\.env/
    expect(FILES.filter((file) => banned.test(read(file)))).toEqual([])
  })

  it('AC-7909.4: 바깥 링크(target)는 NEW_TAB(새 창 · noopener noreferrer)으로만 연다', () => {
    const raw = FILES.filter((file) => /target\s*=|_blank/.test(read(file)))
    expect(raw).toEqual([])
    expect(FILES.filter((file) => /\{\.\.\.NEW_TAB\}/.test(read(file))).length).toBeGreaterThan(0)
  })
})
