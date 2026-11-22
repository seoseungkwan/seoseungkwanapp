import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { ds } from '@/components/ui/classes'
import { DEPTS } from '@/lib/location/depts'
import { KINDS_TEXT, countText, summaryText } from './text'

// 의원 과목 고르기 판 소스 규칙(spec location AC-7921.1·AC-7921.2·AC-7917.1, design.md 18절, tasks.md 머리).
// 부품은 props·콜백만: 읽기·저장(saveDeptRule·resetDeptRule은 부르는 쪽)·바깥 부르기·브라우저 저장소를 쓰지 않는다.
// PC 모양 하나(사용자 규칙 2026-11-21): 화면 폭 앞말이 없고, 폰 크기가 든 ds 묶음(button·input·textButton)을 쓰지 않는다. 색은 토큰만

const DIR = 'src/components/location/kinds'
const FILES = readdirSync(join(process.cwd(), DIR))
  .filter((name) => /\.tsx?$/.test(name) && !/\.test\./.test(name))
  .map((name) => `${DIR}/${name}`)
const withoutComments = (code: string) => code.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:\\])\/\/[^\n]*/g, '$1')
const read = (file: string) => withoutComments(readFileSync(join(process.cwd(), file), 'utf8'))

const widthVariantsInSource = (code: string) =>
  [...code.matchAll(/(?<![\w\-[])((?:max-|min-)?(?:sm|md|lg|\d*xl)|(?:min|max)-\[[^\]\s]*\]):/g)].map((m) => m[1]!)

function dsValue(path: string): unknown {
  return path.split('.').reduce<unknown>((at, key) => (at !== null && typeof at === 'object' ? (at as Record<string, unknown>)[key] : undefined), ds)
}

function texts(value: unknown): string[] {
  if (typeof value === 'string') return [value]
  if (value !== null && typeof value === 'object') return Object.values(value).flatMap(texts)
  return []
}

describe('AC-7921.1: 과목 고르기 판 소스', () => {
  it('AC-7921.1: 살펴볼 소스가 있다(빈 검사가 아니다)', () => {
    expect(FILES).toEqual(expect.arrayContaining([`${DIR}/DeptPicker.tsx`, `${DIR}/text.ts`]))
  })

  it('AC-7921.2: 부품은 props·콜백만 — 바깥 부르기·저장·브라우저 저장소·supabase·서버 파일을 쓰지 않는다', () => {
    const banned =
      /\bfetch\s*\(|supabase|localStorage|sessionStorage|indexedDB|@\/lib\/storage|clients|XMLHttpRequest|process\.env|server-only|@\/app\/api|saveDeptRule|resetDeptRule/
    expect(FILES.filter((file) => banned.test(read(file)))).toEqual([])
  })

  it('AC-7921.1: PC 모양 하나 — 소스에 화면 폭 앞말(max-md: 등)이 없다', () => {
    expect(FILES.flatMap((file) => widthVariantsInSource(read(file)).map((variant) => `${file}: ${variant}:`))).toEqual([])
  })

  it('AC-7921.1: PC 모양 하나 — ds.button·ds.input·ds.textButton을 쓰지 않고, 가져다 쓰는 ds 묶음에 폰 전용 클래스가 없다', () => {
    const used = FILES.flatMap((file) => [...read(file).matchAll(/\bds\.([A-Za-z]+(?:\.[A-Za-z]+)*)/g)].map((m) => `${file}: ds.${m[1]!}`))
    expect(used.filter((ref) => /: ds\.(?:button|input|textButton)\b/.test(ref))).toEqual([])
    const phone = used.filter((ref) => {
      const value = dsValue(ref.split(': ds.')[1]!)
      return typeof value !== 'string' || /\bmax-md:/.test(value)
    })
    expect(phone).toEqual([])
  })

  it('AC-7921.1: 색은 토큰만 — 글자로 적은 색(#·rgb·hsl)이나 임의 색 클래스가 없다', () => {
    const color = /#[0-9a-fA-F]{3,8}\b|\brgba?\(|\bhsla?\(|\b(?:bg|text|border|ring|outline|fill|stroke)-\[/
    expect(FILES.filter((file) => color.test(read(file)))).toEqual([])
  })

  it('AC-7921.1: 과목 이름은 depts.ts DEPTS 한 곳에서 온다(판 파일에 과목 이름을 다시 적지 않는다)', () => {
    const own = FILES.map((file) => read(file))
    for (const d of DEPTS) {
      expect(own.filter((code) => code.includes(`'${d.name}'`)).length, d.name).toBe(0)
    }
  })

  it('AC-7917.1: 화면 글에 영어 낱말이 없다(m·km 단위는 된다)', () => {
    const all = [...texts(KINDS_TEXT), summaryText(['정형외과', '재활의학과']), summaryText([]), countText('A', 1500, 3), countText('B', 500, 0)]
    expect(all.length).toBeGreaterThan(15)
    const latin = all.flatMap((t) => t.replace(/\d+(?:\.\d+)?k?m(?![A-Za-z])/g, '').match(/[A-Za-z]+/g) ?? [])
    expect(latin).toEqual(['A', 'B'])
  })

  it('AC-7921.1: 글 함수 — 요약은 이름을 " · "로 잇고 개수를 붙이고, 줄 오른쪽은 `후보 {글자} {범위} 안 {n}곳`이다', () => {
    expect(summaryText(['정형외과', '신경외과'])).toBe('정형외과 · 신경외과 (2개)')
    expect(summaryText([])).toBe('없음 (0개)')
    expect(countText('A', 1000, 12)).toBe('후보 A 1km 안 12곳')
    expect(countText('C', 700, 0)).toBe('후보 C 700m 안 0곳')
    expect(countText('B', 1500, 1234)).toBe('후보 B 1.5km 안 1,234곳')
  })
})
