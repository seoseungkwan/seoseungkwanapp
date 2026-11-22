import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { look } from './look'

// 정형외과 수요·교통·둘레 시설 부품의 소스 규칙(spec location AC-7909.6 · AC-7908.4, design.md 14절, tasks.md 머리).
// 폰 전용 모양 없음(사용자 규칙 2026-11-21): 소스에 화면 폭 앞말이 없고, 폭 따라 바뀌는 클래스가 든 공용 모양(ds)도 쓰지 않는다.
// 부품은 props·콜백만 받는다: 읽기·저장·바깥 부르기·브라우저 저장소를 쓰지 않는다

const DIR = 'src/components/location/detail/demand'
const FILES = readdirSync(join(process.cwd(), DIR))
  .filter((name) => /\.tsx?$/.test(name) && !/\.test\./.test(name))
  .map((name) => `${DIR}/${name}`)
const withoutComments = (code: string) => code.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:\\])\/\/[^\n]*/g, '$1')
const read = (file: string) => withoutComments(readFileSync(join(process.cwd(), file), 'utf8'))

const WIDTH_VARIANT = /^(?:(?:max-|min-)?(?:sm|md|lg|\d*xl)|(?:min|max)-\[[^\]]*\])$/
const widthVariantsInSource = (code: string) =>
  [...code.matchAll(/(?<![\w\-[])((?:max-|min-)?(?:sm|md|lg|\d*xl)|(?:min|max)-\[[^\]\s]*\]):/g)].map((m) => m[1]!)
// 소스 안 따옴표 글자(화면 글·클래스)
const literals = (code: string) => [...code.matchAll(/'([^'\n]*)'|`([^`]*)`/g)].map((m) => m[1] ?? m[2] ?? '')

describe('AC-7909.6: 정형외과 수요·교통·둘레 시설 부품 소스', () => {
  it('AC-7909.6: 살펴볼 소스가 있다(빈 검사가 아니다)', () => {
    expect(FILES).toEqual(
      expect.arrayContaining([`${DIR}/DemandSection.tsx`, `${DIR}/TrafficSection.tsx`, `${DIR}/text.ts`, `${DIR}/look.ts`, `${DIR}/near.ts`]),
    )
  })

  it('AC-7909.6: PC 모양 하나 — 소스에 화면 폭 앞말(max-md: 등)이 없고 look.ts에도 없다', () => {
    expect(FILES.flatMap((file) => widthVariantsInSource(read(file)).map((variant) => `${file}: ${variant}:`))).toEqual([])
    const tokens = Object.values(look).flatMap((classes) => classes.split(/\s+/))
    expect(tokens.filter((token) => token.split(':').slice(0, -1).some((variant) => WIDTH_VARIANT.test(variant)))).toEqual([])
  })

  it('AC-7909.6: 폭 따라 바뀌는 클래스가 든 공용 모양(components/ui/classes의 ds)을 부르지 않는다', () => {
    expect(FILES.filter((file) => /@\/components\/ui\/classes/.test(read(file)))).toEqual([])
  })

  it('AC-7909.6: 색은 토큰만 — 소스에 #색·rgb()·hsl()·Tailwind 기본 색 이름이 없다', () => {
    const raw = /#[0-9a-fA-F]{3,8}\b|\brgba?\(|\bhsla?\(|\b(?:text|bg|border|ring|fill|stroke)-(?:white|black|gray|slate|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose)\b/
    expect(FILES.filter((file) => raw.test(read(file)))).toEqual([])
  })

  it('AC-7909.6: 화면 글에 영어 낱말이 없다(단위 m·km·km²만 된다)', () => {
    const texts = FILES.filter((file) => !file.endsWith('look.ts'))
      .flatMap((file) => literals(read(file)))
      .filter((t) => /[가-힣]/.test(t))
    expect(texts.length).toBeGreaterThan(20)
    expect(texts.filter((t) => /[A-Za-z]/.test(t.replace(/\$\{[^}]*\}/g, '').replace(/(?<![A-Za-z])k?m²?(?![A-Za-z])/g, '')))).toEqual([])
  })

  it('AC-7909.6: 하루 예상 환자 계산이 없다(환자 수 어림·지금 의원 환자 숫자를 읽지 않음)', () => {
    expect(FILES.filter((file) => /예상 환자|환자 수|readDays|expected|perDayPatients/.test(read(file)))).toEqual([])
  })

  it('AC-7908.4: 부품은 props·콜백만 — 바깥 부르기·저장·브라우저 저장소·supabase를 쓰지 않는다', () => {
    const banned = /\bfetch\s*\(|supabase|localStorage|sessionStorage|indexedDB|@\/lib\/storage|\/clients|XMLHttpRequest|process\.env|onSave|useEffect/
    expect(FILES.filter((file) => banned.test(read(file)))).toEqual([])
  })
})
