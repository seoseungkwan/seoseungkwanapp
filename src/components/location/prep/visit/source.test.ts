import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

// 개원 준비(건물 요건·계약 전 위험·점검표·사진·메모·진행 상태) 부품의 소스 규칙(spec location AC-7913.3·AC-7913.4, design.md 14절, tasks.md 머리).
// PC 모양 하나(사용자 규칙 2026-11-21): 화면 폭 앞말이 없고, 폭 따라 바뀌는 클래스가 든 공용 묶음(ds의 단추·입력·글자 단추 등)을 쓰지 않는다.
// 부품은 props·콜백만: 읽기·저장·바깥 부르기·브라우저 저장소·사진 줄이기 함수(inventory shrinkPhoto)를 직접 부르지 않는다. 색은 토큰만(16진수 없음)

const DIR = 'src/components/location/prep/visit'
const FILES = readdirSync(join(process.cwd(), DIR))
  .filter((name) => /\.tsx?$/.test(name) && !/\.test\./.test(name))
  .map((name) => `${DIR}/${name}`)
const withoutComments = (code: string) => code.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:\\])\/\/[^\n]*/g, '$1')
const read = (file: string) => withoutComments(readFileSync(join(process.cwd(), file), 'utf8'))

const widthVariantsInSource = (code: string) =>
  [...code.matchAll(/(?<![\w\-[])((?:max-|min-)?(?:sm|md|lg|\d*xl)|(?:min|max)-\[[^\]\s]*\]):/g)].map((m) => m[1]!)

describe('AC-7913.3: 개원 준비(점검·사진·메모) 부품 소스', () => {
  it('AC-7913.3: 살펴볼 소스가 있다(빈 검사가 아니다)', () => {
    expect(FILES).toEqual(expect.arrayContaining([`${DIR}/PrepVisit.tsx`]))
  })

  it('AC-7913.3: PC 모양 하나 — 소스에 화면 폭 앞말(max-md: 등)이 없다', () => {
    expect(FILES.flatMap((file) => widthVariantsInSource(read(file)).map((variant) => `${file}: ${variant}:`))).toEqual([])
  })

  it('AC-7913.3: 폭 따라 바뀌는 공용 묶음(ds.button·ds.input·ds.textButton·ds.panelHead·ds.panelBody·ds.readonly·ds.segment)을 쓰지 않는다', () => {
    const banned = /\bds\.(?:button|input|textButton|panelHead|panelBody|readonly|segment)\b/
    expect(FILES.filter((file) => banned.test(read(file)))).toEqual([])
  })

  it('AC-7913.4: 부품은 props·콜백만 — 바깥 부르기·저장·브라우저 저장소·supabase·사진 줄이기 함수를 직접 쓰지 않는다', () => {
    const banned =
      /\bfetch\s*\(|supabase|localStorage|sessionStorage|indexedDB|@\/lib\/storage|\.\.\/\.\.\/clients|components\/location\/clients|XMLHttpRequest|process\.env|components\/inventory|createImageBitmap|toBlob/
    expect(FILES.filter((file) => banned.test(read(file)))).toEqual([])
  })

  it('AC-7913.3: 색은 토큰만 — 16진수 색이 없다', () => {
    expect(FILES.filter((file) => /#[0-9a-f]{3,8}\b/i.test(readFileSync(join(process.cwd(), file), 'utf8')))).toEqual([])
  })

  it('AC-7913.3: 바깥 링크는 links.ts의 NEW_TAB(새 창 · noopener noreferrer)으로 연다', () => {
    const external = FILES.filter((file) => /https?:\/\//.test(read(file)))
    expect(external).toEqual([])
    const src = FILES.map(read).join('\n')
    expect(src).toContain('IROS_URL')
    expect(src).toContain('NEW_TAB')
  })
})
