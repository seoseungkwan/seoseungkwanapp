import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { ds } from '@/components/ui/classes'
import { ADD_TEXT, progressText, readyText } from './text'

// 후보 더하기 판 소스 규칙(spec location AC-7908.1·AC-7908.2·AC-7917.1, design.md 14절, tasks.md 머리).
// 부품은 props·콜백만: 읽기·저장·바깥 부르기·브라우저 저장소·서버 파일(server-only·app/api)을 쓰지 않는다.
// PC 모양 하나(사용자 규칙 2026-11-21): 화면 폭 앞말이 없고, 가져다 쓰는 ds 묶음에도 폰 전용 클래스가 없다. 색은 토큰만

const DIR = 'src/components/location/add'
const FILES = readdirSync(join(process.cwd(), DIR))
  .filter((name) => /\.tsx?$/.test(name) && !/\.test\./.test(name))
  .map((name) => `${DIR}/${name}`)
const withoutComments = (code: string) => code.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:\\])\/\/[^\n]*/g, '$1')
const read = (file: string) => withoutComments(readFileSync(join(process.cwd(), file), 'utf8'))

const widthVariantsInSource = (code: string) =>
  [...code.matchAll(/(?<![\w\-[])((?:max-|min-)?(?:sm|md|lg|\d*xl)|(?:min|max)-\[[^\]\s]*\]):/g)].map((m) => m[1]!)

// ds.a.b 글자를 ds 묶음 값으로 찾는다(없는 길이면 undefined)
function dsValue(path: string): unknown {
  return path.split('.').reduce<unknown>((at, key) => (at !== null && typeof at === 'object' ? (at as Record<string, unknown>)[key] : undefined), ds)
}

// 화면 글 모두(글 묶음 + 글 만드는 함수)
function texts(value: unknown): string[] {
  if (typeof value === 'string') return [value]
  if (value !== null && typeof value === 'object') return Object.values(value).flatMap(texts)
  return []
}

describe('AC-7908.1: 후보 더하기 판 소스', () => {
  it('AC-7908.1: 살펴볼 소스가 있다(빈 검사가 아니다)', () => {
    expect(FILES).toEqual(expect.arrayContaining([`${DIR}/AddCandidatePanel.tsx`, `${DIR}/addDraft.ts`, `${DIR}/text.ts`]))
  })

  it('AC-7908.1: 부품은 props·콜백만 — 바깥 부르기·저장·브라우저 저장소·supabase·서버 파일을 쓰지 않는다', () => {
    const banned =
      /\bfetch\s*\(|supabase|localStorage|sessionStorage|indexedDB|@\/lib\/storage|clients|XMLHttpRequest|process\.env|server-only|@\/app\/api|\/sources\/kakao/
    expect(FILES.filter((file) => banned.test(read(file)))).toEqual([])
  })

  it('AC-7908.1: PC 모양 하나 — 소스에 화면 폭 앞말(max-md: 등)이 없다', () => {
    expect(FILES.flatMap((file) => widthVariantsInSource(read(file)).map((variant) => `${file}: ${variant}:`))).toEqual([])
  })

  it('AC-7908.1: PC 모양 하나 — 가져다 쓰는 ds 묶음에 폰 전용 클래스(max-md 앞말)가 없다', () => {
    const used = FILES.flatMap((file) => [...read(file).matchAll(/\bds\.([A-Za-z]+(?:\.[A-Za-z]+)*)/g)].map((m) => `${file}: ds.${m[1]!}`))
    const phone = used.filter((ref) => {
      const value = dsValue(ref.split(': ds.')[1]!)
      return typeof value !== 'string' || /\bmax-md:/.test(value)
    })
    expect(phone).toEqual([])
  })

  it('AC-7908.1: 색은 토큰만 — 글자로 적은 색(#·rgb·hsl)이나 임의 색 클래스가 없다', () => {
    const color = /#[0-9a-fA-F]{3,8}\b|\brgba?\(|\bhsla?\(|\b(?:bg|text|border|ring|outline|fill|stroke)-\[/
    expect(FILES.filter((file) => color.test(read(file)))).toEqual([])
  })

  it('AC-7908.2: 저장 몸통을 만드는 곳(addDraft.ts)은 카카오 주소 칸(road·jibun)을 읽지 않는다', () => {
    expect(read(`${DIR}/addDraft.ts`)).not.toMatch(/\b(?:road|jibun)\b/)
  })

  it('AC-7917.1: 화면 글에 영어 낱말이 없다(m·km 단위는 된다)', () => {
    const all = [...texts(ADD_TEXT), readyText('2026-11-22'), progressText(3, 12)]
    expect(all.length).toBeGreaterThan(20)
    const latin = all.flatMap((t) => t.replace(/\d+(?:\.\d+)?k?m(?![A-Za-z])/g, '').match(/[A-Za-z]+/g) ?? [])
    expect(latin).toEqual([])
  })

  it('AC-7908.1: 저장 안내 글은 오늘 날짜를 `{달}월 {날}일`로 넣는다', () => {
    expect(readyText('2026-11-22')).toBe('저장하면 오늘(11월 22일) 받은 자료로 굳혀 두고 기준 날짜를 함께 남겨요.')
    expect(readyText('2027-01-05')).toBe('저장하면 오늘(1월 5일) 받은 자료로 굳혀 두고 기준 날짜를 함께 남겨요.')
    expect(progressText(3, 12)).toBe('자료 3/12')
  })
})
