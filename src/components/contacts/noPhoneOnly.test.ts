import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { ds } from '@/components/ui/classes'
import { look } from './parts/look'

// 폰 전용 모양 없음(사용자 규칙 2026-11-21, requirements.md 이미 정한 것 18, design.md '이 명세가 정한 것' 마지막·'화면' 공통, AC-6505.1).
// 주소록 화면(src/components/contacts/**)과 대시보드 무상 수리 알림(dashboard/warranty/**)은 화면 폭 접두사를 쓰지 않고,
// 가져다 쓰는 ds 묶음도 폭 따라 바뀌는 클래스가 없는 것만 쓴다(ds.button.*에는 휴대폰 44px 줄 max-md:h-11이 들어 있다 → parts/look.ts가 뺀 묶음을 쓴다).
// 예외는 시안이 정한 PC 폭 둘뿐이다: 두 칸 틀 목록 칸 300→360px·자세히 칸 왼쪽 여백(ContactsScreen.tsx lg:, 시안 .mid = 1024px 미만)과
// 자세히 두 칸(CompanyDetail.tsx min-[1200px]:, 시안 기본값 5).
// look.ts는 빼는 앞말을 정규식으로 적어 두므로 소스 글자 대신 만든 묶음 값을 본다

const ROOTS = ['src/components/contacts', 'src/components/dashboard/warranty']
const ALLOWED: Record<string, string[]> = {
  'src/components/contacts/ContactsScreen.tsx': ['lg'],
  'src/components/contacts/parts/CompanyDetail.tsx': ['min-[1200px]'],
}
const LOOK = 'src/components/contacts/parts/look.ts'

const sourceFiles = (dir: string): string[] =>
  readdirSync(join(process.cwd(), dir), { withFileTypes: true }).flatMap((entry) => {
    const path = `${dir}/${entry.name}`
    if (entry.isDirectory()) return sourceFiles(path)
    return /\.tsx?$/.test(entry.name) && !/\.test\./.test(entry.name) ? [path] : []
  })
const FILES = ROOTS.flatMap(sourceFiles)
const withoutComments = (code: string) => code.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:\\])\/\/[^\n]*/g, '$1')
const read = (file: string) => withoutComments(readFileSync(join(process.cwd(), file), 'utf8'))

// 화면 폭 앞말: sm:·md:·lg:·xl:·2xl:·max-*:·min-*:·min-[…]:·max-[…]:
const WIDTH_VARIANT = /^(?:(?:max-|min-)?(?:sm|md|lg|\d*xl)|(?:min|max)-\[[^\]]*\])$/
const widthVariantsInSource = (code: string) => [...code.matchAll(/(?<![\w\-[])((?:max-|min-)?(?:sm|md|lg|\d*xl)|(?:min|max)-\[[^\]\s]*\]):/g)].map((m) => m[1]!)
const widthTokens = (classes: string) => classes.split(/\s+/).filter((token) => token.split(':').slice(0, -1).some((v) => WIDTH_VARIANT.test(v)))

const resolveDs = (path: string): unknown => path.split('.').reduce<unknown>((value, key) => (value && typeof value === 'object' ? (value as Record<string, unknown>)[key] : undefined), ds)

describe('AC-6505.1: 주소록·무상 수리 알림에 폰 전용 모양이 없다', () => {
  it('AC-6505.1: 살펴볼 소스가 있다(빈 검사가 아니다)', () => {
    expect(FILES).toEqual(
      expect.arrayContaining([
        'src/components/contacts/ContactsScreen.tsx',
        'src/components/contacts/parts/CompanyDetail.tsx',
        'src/components/contacts/import/UploadButton.tsx',
        'src/components/contacts/import/ImportDoneNotice.tsx',
        'src/components/dashboard/warranty/WarrantyNotice.tsx',
      ]),
    )
  })

  it('AC-6505.1: 소스에 화면 폭 앞말이 없다 — 시안이 정한 lg:(ContactsScreen)·min-[1200px]:(CompanyDetail)만', () => {
    const found = FILES.filter((file) => file !== LOOK).flatMap((file) =>
      widthVariantsInSource(read(file))
        .filter((variant) => !(ALLOWED[file] ?? []).includes(variant))
        .map((variant) => `${file}: ${variant}:`),
    )
    expect(found).toEqual([])
  })

  it('AC-6505.1: 가져다 쓰는 ds 묶음에 폭 따라 바뀌는 클래스(max-md:h-11 등)가 없다 — 단추는 parts/look.ts가 뺀 묶음을 쓴다', () => {
    const users = FILES.filter((file) => file !== LOOK && /import\s*\{[^}]*\bds\b[^}]*\}\s*from\s*['"]@\/components\/ui\/classes['"]/.test(read(file)))
    const found = users.flatMap((file) =>
      [...read(file).matchAll(/\bds\.([A-Za-z]\w*(?:\.[A-Za-z]\w*)*)/g)].flatMap((m) => {
        const value = resolveDs(m[1]!)
        if (typeof value !== 'string') return [`${file}: ds.${m[1]} (묶음 아님)`]
        return widthTokens(value).map((token) => `${file}: ds.${m[1]} ${token}`)
      }),
    )
    expect(found).toEqual([])
  })

  it('AC-6505.1: parts/look.ts 묶음 값에 폭 따라 바뀌는 클래스가 없다', () => {
    const found = Object.entries(look).flatMap(([key, value]) => widthTokens(value).map((token) => `look.${key}: ${token}`))
    expect(Object.keys(look).length).toBeGreaterThan(0)
    expect(found).toEqual([])
  })
})
