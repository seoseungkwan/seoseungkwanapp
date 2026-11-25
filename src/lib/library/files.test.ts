// 자료실 순수 함수 (specs/library TASK-2, REQ-8102 · AC-8102.1~8102.6, design.md '순수 함수').
// 결과는 승인 시안 docs/mockups/library/index.html의 verOf·guessCat·sizeTxt·mbTxt·dayTxt·versionGroups·tableBody와 같다.
// 파일 이름·크기·시각은 모두 지어낸 값이다
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  CATEGORY_LABEL,
  DESCRIPTION_MAX,
  KIND_LABEL,
  LIBRARY_MAX_BYTES,
  NAME_MAX,
  categoryCounts,
  compareVersions,
  dayText,
  deleteNote,
  guessCategory,
  latestOfKind,
  libraryRows,
  mbText,
  pickProblem,
  sizeText,
  versionOf,
  type LibraryFile,
  type LibraryRow,
  type VersionKind,
} from './files'

const KB = 1024
const MB = 1024 * 1024

let seq = 0
const file = (fileName: string, over: Partial<LibraryFile> = {}): LibraryFile => {
  seq += 1
  return {
    id: `id-${fileName}`,
    fileName,
    name: fileName,
    category: guessCategory(fileName),
    description: '',
    storagePath: `00000000-0000-4000-8000-${String(seq).padStart(12, '0')}`,
    size: 1 * MB,
    createdAt: '2026-11-01T00:00:00.000Z',
    ...over,
  }
}

// 시안 BASE와 같은 여덟 파일(올린 시각은 UTC, 한국 시각 = +9시간)
const f1 = file('마감일지도우미_비트판_20261125.zip', { createdAt: '2026-11-25T00:12:00.000Z', size: 2.4 * MB })
const f2 = file('비트시트_프로그램_새판.zip', { createdAt: '2026-11-24T08:40:00.000Z' })
const f3 = file('비트시트_설치_설명서.pdf', { createdAt: '2026-11-24T08:38:00.000Z', size: 640 * KB })
const h133 = file('precheck-helper-0.13.3.zip', { createdAt: '2026-11-23T02:05:00.000Z' })
const e040 = file('precheck-extension-0.4.0.zip', { createdAt: '2026-11-20T06:30:00.000Z', size: 8 * KB })
const x1 = file('수납일지_샘플.xlsx', { createdAt: '2026-11-18T01:20:00.000Z', size: 46 * KB })
const h120 = file('precheck-helper-0.12.0.zip', { createdAt: '2026-11-16T05:00:00.000Z' })
const h110 = file('precheck-helper-0.11.0.zip', { createdAt: '2026-11-12T00:30:00.000Z' })
// 일부러 섞은 차례(함수가 차례를 정한다)
const BASE: readonly LibraryFile[] = Object.freeze([h120, x1, f3, h133, f1, h110, e040, f2])

const NONE: ReadonlySet<VersionKind> = new Set()
const row = (f: LibraryFile, over: Partial<{ latest: boolean; old: boolean; hasOld: boolean }> = {}): LibraryRow => ({
  type: 'file',
  file: f,
  latest: false,
  old: false,
  hasOld: false,
  ...over,
})
const toggle = (kind: VersionKind, count: number, open = false): LibraryRow => ({ type: 'toggle', kind, count, open })

describe('AC-8102.1 versionOf·compareVersions', () => {
  it.each([
    ['precheck-helper-0.14.0.zip', { kind: 'helper', version: [0, 14, 0] }],
    ['precheck-extension-0.4.0.zip', { kind: 'extension', version: [0, 4, 0] }],
    ['precheck-helper-10.20.300.zip', { kind: 'helper', version: [10, 20, 300] }],
    ['precheck-extension-1.0.0.zip', { kind: 'extension', version: [1, 0, 0] }],
  ])('AC-8102.1: %s → 종류와 숫자 판', (name, parsed) => {
    expect(versionOf(name)).toEqual(parsed)
  })

  it.each([
    ['', '빈 글자'],
    ['precheck-helper-0.9.0.1.zip', '판 숫자 넷째 자리'],
    ['precheck-helper-1000.0.0.zip', '4자리 숫자'],
    ['precheck-helper-0.9.1000.zip', '끝 자리 4자리 숫자'],
    ['precheck-helper-0.9.zip', '판 숫자 둘'],
    ['precheck-helper-0.9.0.exe', '.zip 아님'],
    ['precheck-helper-0.9.0.zip.exe', '.zip 뒤에 더'],
    ['precheck-helper-0.9.0.ZIP', '대문자 ZIP'],
    ['Precheck-helper-0.9.0.zip', '대문자로 시작'],
    ['PRECHECK-HELPER-0.9.0.zip', '모두 대문자'],
    [' precheck-helper-0.9.0.zip', '앞에 빈칸'],
    ['xprecheck-helper-0.9.0.zip', '앞에 글자 더'],
    ['precheck-helper-0.9.0 (1).zip', '같은 파일을 두 번 받아 붙은 (1)'],
    ['precheck-helper-0.9.0.zip\n', '끝에 줄바꿈'],
    ['helper/precheck-helper-0.9.0.zip', '폴더가 붙은 이름'],
    ['precheck-tool-0.9.0.zip', '다른 종류'],
    ['precheck-helper-a.b.c.zip', '판 숫자가 글자'],
    ['precheck-helper-０.9.0.zip', '전각 숫자'],
  ])('AC-8102.1: %j(%s)은 null이다', (name) => {
    expect(versionOf(name)).toBeNull()
  })

  it('AC-8102.1: compareVersions는 숫자로 견준다 — 0.10.0 > 0.9.0, 0.9.10 > 0.9.9, 1.0.0 > 0.99.99, 같으면 0', () => {
    expect(compareVersions([0, 10, 0], [0, 9, 0])).toBeGreaterThan(0)
    expect(compareVersions([0, 9, 0], [0, 10, 0])).toBeLessThan(0)
    expect(compareVersions([0, 9, 10], [0, 9, 9])).toBeGreaterThan(0)
    expect(compareVersions([1, 0, 0], [0, 99, 99])).toBeGreaterThan(0)
    expect(compareVersions([0, 13, 3], [0, 13, 3])).toBe(0)
  })

  it('AC-8102.1: 종류 이름은 도우미·확장이다(받기 단추 [{…} 내려받기])', () => {
    expect(KIND_LABEL).toEqual({ helper: '도우미', extension: '확장' })
  })
})

describe('AC-8102.2 guessCategory', () => {
  it.each(['a.zip', 'a.exe', 'a.msi', 'a.crx', 'A.ZIP', 'setup.Exe', 'precheck-helper-0.14.0.zip', '비트_사진_모음.zip'])(
    'AC-8102.2: %s → install(설치 파일)',
    (name) => {
      expect(guessCategory(name)).toBe('install')
    },
  )

  it.each(['a.pdf', 'a.hwp', 'a.hwpx', 'a.doc', 'a.docx', 'a.ppt', 'a.pptx', '마감일지_쓰는법.PDF', 'b.HWPX', 'c.DocX'])(
    'AC-8102.2: %s → guide(설명서)',
    (name) => {
      expect(guessCategory(name)).toBe('guide')
    },
  )

  it.each(['수납일지_샘플.xlsx', 'a.txt', 'README', 'zip', 'a.zip.txt', 'a.pdfx', 'a.docxx', 'a.pd', 'a.', ''])('AC-8102.2: %j → other(그 밖, 끝 없음 포함)', (name) => {
    expect(guessCategory(name)).toBe('other')
  })

  it('AC-8102.2: 분류 이름은 설치 파일·설명서·그 밖이다', () => {
    expect(CATEGORY_LABEL).toEqual({ install: '설치 파일', guide: '설명서', other: '그 밖' })
  })
})

describe('AC-8102.3 sizeText·mbText·dayText', () => {
  it.each([
    [8_192, '8KB'],
    [655_360, '640KB'],
    [943_718, '0.9MB'],
    [1_258_291, '1.2MB'],
    [66_479_718, '63.4MB'],
    [0, '1KB'],
    [100, '1KB'],
    [512, '1KB'],
    [1_024, '1KB'],
    [1_536, '2KB'],
    [47_104, '46KB'],
    [921_599, '900KB'],
    [921_600, '0.9MB'],
    [LIBRARY_MAX_BYTES, '50.0MB'],
  ])('AC-8102.3: sizeText(%d) → %s (1KB = 1,024바이트, 921,600바이트 이상은 MB 소수 한 자리, 아래는 KB 반올림·적어도 1KB)', (bytes, text) => {
    expect(sizeText(bytes)).toBe(text)
  })

  it.each([
    [734_003, '0.7MB'],
    [1_258_291, '1.2MB'],
    [0, '0.0MB'],
    [66_479_718, '63.4MB'],
  ])('AC-8102.3: mbText(%d) → %s (늘 MB 소수 한 자리)', (bytes, text) => {
    expect(mbText(bytes)).toBe(text)
  })

  it.each([
    ['2026-11-24T15:30:00Z', '11월 25일'], // 한국 11월 25일 0시 30분
    ['2026-11-24T14:59:59Z', '11월 24일'],
    ['2026-11-25T01:00:00.123456+00:00', '11월 25일'], // Supabase가 주는 모양
    ['2027-01-04T16:00:00.000Z', '1월 5일'],
  ])('AC-8102.3: dayText(%s) → 한국 날짜 %s', (iso, text) => {
    expect(dayText(iso)).toBe(text)
  })
})

describe('AC-8102.4 libraryRows·categoryCounts', () => {
  it('AC-8102.4: 올린 시각 늦은 것 먼저이고, 판 번호 파일은 종류마다 가장 높은 판이 자기 자리에 latest 줄 + 접기 줄 하나다(접힘)', () => {
    expect(libraryRows(BASE, 'all', NONE)).toEqual([
      row(f1),
      row(f2),
      row(f3),
      row(h133, { latest: true, hasOld: true }),
      toggle('helper', 2),
      row(e040, { latest: true }),
      row(x1),
    ])
  })

  it('AC-8102.4: 펼친 종류만 접기 줄 바로 아래에 옛 판 줄이 판 높은 차례로 나온다', () => {
    expect(libraryRows(BASE, 'all', new Set<VersionKind>(['helper']))).toEqual([
      row(f1),
      row(f2),
      row(f3),
      row(h133, { latest: true, hasOld: true }),
      toggle('helper', 2, true),
      row(h120, { old: true }),
      row(h110, { old: true }),
      row(e040, { latest: true }),
      row(x1),
    ])
    // 옛 판이 없는 종류는 펼쳐도 접기 줄이 없다
    expect(libraryRows(BASE, 'all', new Set<VersionKind>(['extension']))).toEqual(libraryRows(BASE, 'all', NONE))
  })

  it('AC-8102.4: 최신 판은 늦게 올린 낮은 판이 아니라 판 숫자로 정하고(0.10.0 > 0.9.0), 자기 올린 시각 자리에 선다', () => {
    const h090 = file('precheck-helper-0.9.0.zip', { createdAt: '2026-11-26T00:00:00.000Z' }) // 가장 늦게 올린 옛 판
    const h0100 = file('precheck-helper-0.10.0.zip', { createdAt: '2026-11-10T00:00:00.000Z' })
    const files = [h090, h0100, x1]
    expect(libraryRows(files, 'all', new Set<VersionKind>(['helper']))).toEqual([
      row(x1),
      row(h0100, { latest: true, hasOld: true }),
      toggle('helper', 1, true),
      row(h090, { old: true }),
    ])
  })

  it('AC-8102.4: 올린 시각이 같으면 파일 이름 차례다', () => {
    const at = '2026-11-20T00:00:00.000Z'
    const b = file('b.pdf', { createdAt: at })
    const a = file('a.pdf', { createdAt: at })
    const c = file('c.pdf', { createdAt: '2026-11-20T00:00:01.000Z' })
    expect(libraryRows([b, a, c], 'all', NONE)).toEqual([row(c), row(a), row(b)])
  })

  it('AC-8102.4: 시각 모양이 달라도(Supabase의 +00:00·마이크로초) 시각으로 견준다', () => {
    const early = file('early.pdf', { createdAt: '2026-11-20T09:00:00+09:00' }) // = 00:00Z
    const late = file('late.pdf', { createdAt: '2026-11-20T00:00:00.500000+00:00' })
    expect(libraryRows([early, late], 'all', NONE)).toEqual([row(late), row(early)])
  })

  it.each([
    ['install', [row(f1), row(f2), row(h133, { latest: true, hasOld: true }), toggle('helper', 2), row(e040, { latest: true })]],
    ['guide', [row(f3)]],
    ['other', [row(x1)]],
  ] as const)('AC-8102.4: 분류 %s로 거르면 그 분류 줄만이다', (filter, rows) => {
    expect(libraryRows(BASE, filter, NONE)).toEqual(rows)
  })

  it('AC-8102.4: 판 묶기는 거른 줄 안에서 한다 — 다른 분류에 둔 옛 판은 그 분류에서 따로 선다', () => {
    const odd = { ...h120, category: 'other' as const }
    const files = [h133, odd, h110]
    expect(libraryRows(files, 'install', new Set<VersionKind>(['helper']))).toEqual([
      row(h133, { latest: true, hasOld: true }),
      toggle('helper', 1, true),
      row(h110, { old: true }),
    ])
    expect(libraryRows(files, 'other', NONE)).toEqual([row(odd, { latest: true })])
  })

  it('AC-8102.4: 판 묶기는 올릴 때의 파일 이름으로 본다(보이는 이름을 고쳐도 그대로)', () => {
    const renamed = { ...h120, name: '청구 도우미 옛 판' }
    const plain = file('notes.pdf', { name: 'precheck-helper-9.9.9.zip', createdAt: '2026-11-01T00:00:00.000Z' })
    expect(libraryRows([h133, renamed, plain], 'all', NONE)).toEqual([row(h133, { latest: true, hasOld: true }), toggle('helper', 1), row(plain)])
  })

  it('AC-8102.4: 판 번호 없는 파일은 보통 줄이고, 빈 목록·남은 줄 없음은 빈 배열이다', () => {
    expect(libraryRows([f1, x1], 'all', NONE)).toEqual([row(f1), row(x1)])
    expect(libraryRows([], 'all', NONE)).toEqual([])
    expect(libraryRows([f1], 'guide', NONE)).toEqual([])
  })

  it('AC-8102.4: 받은 목록을 고치지 않는다', () => {
    const before = [...BASE]
    libraryRows(BASE, 'all', new Set<VersionKind>(['helper', 'extension']))
    expect(BASE).toEqual(before)
  })

  it('AC-8102.4: categoryCounts는 전체·분류마다 수(옛 판 포함)다', () => {
    expect(categoryCounts(BASE)).toEqual({ all: 8, install: 6, guide: 1, other: 1 })
    expect(categoryCounts([])).toEqual({ all: 0, install: 0, guide: 0, other: 0 })
    expect(categoryCounts([f3, x1])).toEqual({ all: 2, install: 0, guide: 1, other: 1 })
  })
})

describe('AC-8102.5 latestOfKind·deleteNote', () => {
  it('AC-8102.5: latestOfKind는 분류와 상관없이 그 종류 가장 높은 판이고 없으면 null이다', () => {
    expect(latestOfKind(BASE, 'helper')).toBe(h133)
    expect(latestOfKind(BASE, 'extension')).toBe(e040)
    expect(latestOfKind([f1, x1], 'helper')).toBeNull()
    expect(latestOfKind([], 'extension')).toBeNull()
    const asGuide = { ...h133, category: 'guide' as const }
    expect(latestOfKind([h120, asGuide, h110], 'helper')).toBe(asGuide)
  })

  it('AC-8102.5: latestOfKind는 판을 숫자로 견준다(올린 차례가 아니다)', () => {
    const h090 = file('precheck-helper-0.9.0.zip', { createdAt: '2026-11-26T00:00:00.000Z' })
    const h0100 = file('precheck-helper-0.10.0.zip', { createdAt: '2026-11-10T00:00:00.000Z' })
    expect(latestOfKind([h090, h0100], 'helper')).toBe(h0100)
  })

  it('AC-8102.5: deleteNote — 그 종류 최신이면 { kind, next: 다음 높은 판 }, 마지막 한 판이면 next null', () => {
    expect(deleteNote(BASE, h133)).toEqual({ kind: 'helper', next: h120 })
    expect(deleteNote(BASE, e040)).toEqual({ kind: 'extension', next: null })
    expect(deleteNote([h110], h110)).toEqual({ kind: 'helper', next: null })
  })

  it('AC-8102.5: deleteNote — 최신이 아닌 판·판 번호 없는 파일은 null이다', () => {
    expect(deleteNote(BASE, h120)).toBeNull()
    expect(deleteNote(BASE, h110)).toBeNull()
    expect(deleteNote(BASE, f1)).toBeNull()
    expect(deleteNote(BASE, x1)).toBeNull()
  })

  it('AC-8102.5: deleteNote도 분류를 보지 않는다(받기 단추와 같은 판정)', () => {
    const oddNext = { ...h120, category: 'other' as const }
    expect(deleteNote([h133, oddNext, h110], h133)).toEqual({ kind: 'helper', next: oddNext })
  })
})

describe('AC-8102.6 pickProblem', () => {
  it('AC-8102.6: 크기가 52,428,800바이트를 넘으면 E-LIBRARY-FILE-SIZE, 딱 그만큼은 된다', () => {
    expect(LIBRARY_MAX_BYTES).toBe(52_428_800)
    expect(pickProblem({ name: 'big.zip', size: 52_428_801 }, BASE)).toBe('E-LIBRARY-FILE-SIZE')
    expect(pickProblem({ name: 'big.zip', size: 52_428_800 }, BASE)).toBeNull()
  })

  it('AC-8102.6: 파일 이름이 200자를 넘으면 E-LIBRARY-FILE-NAME, 200자는 된다(DB char_length와 같이 글자 수로 센다)', () => {
    expect(NAME_MAX).toBe(200)
    expect(pickProblem({ name: `${'가'.repeat(197)}.pdf`, size: 10 }, [])).toBe('E-LIBRARY-FILE-NAME')
    expect(pickProblem({ name: `${'가'.repeat(196)}.pdf`, size: 10 }, [])).toBeNull()
    expect(pickProblem({ name: '😀'.repeat(200), size: 10 }, [])).toBeNull()
    expect(pickProblem({ name: '😀'.repeat(201), size: 10 }, [])).toBe('E-LIBRARY-FILE-NAME')
  })

  it('AC-8102.6: 같은 파일 이름(fileName)이 이미 있으면 E-LIBRARY-FILE-EXISTS다 — 보이는 이름이 아니라 파일 이름, 대소문자도 가린다', () => {
    expect(pickProblem({ name: 'precheck-helper-0.13.3.zip', size: 10 }, BASE)).toBe('E-LIBRARY-FILE-EXISTS')
    expect(pickProblem({ name: 'PRECHECK-HELPER-0.13.3.zip', size: 10 }, BASE)).toBeNull()
    const renamed = { ...x1, name: 'shown.pdf' }
    expect(pickProblem({ name: 'shown.pdf', size: 10 }, [renamed])).toBeNull()
    expect(pickProblem({ name: 'precheck-helper-0.14.0.zip', size: 1_258_291 }, BASE)).toBeNull()
  })

  it('AC-8102.6: 여럿이 걸리면 크기 → 이름 → 같은 이름 차례로 먼저 걸린 하나다', () => {
    const longName = `${'a'.repeat(201)}`
    const existing = file(longName)
    expect(pickProblem({ name: longName, size: LIBRARY_MAX_BYTES + 1 }, [existing])).toBe('E-LIBRARY-FILE-SIZE')
    expect(pickProblem({ name: longName, size: 1 }, [existing])).toBe('E-LIBRARY-FILE-NAME')
  })

  it('AC-8102.6: 설명은 60자까지다', () => {
    expect(DESCRIPTION_MAX).toBe(60)
  })
})

describe('AC-8102.1~8102.6 files.ts는 순수 함수다', () => {
  // 주석을 뺀 소스 글자로 본다
  const source = readFileSync(join(process.cwd(), 'src/lib/library/files.ts'), 'utf8').replace(/\/\*[\s\S]*?\*\/|\/\/[^\n]*/g, '')

  it('AC-8102.4: import는 한국 날짜(lib/analytics/dates)뿐이다 — React·Next·supabase·lib/storage 없음', () => {
    const imports = [...source.matchAll(/from\s+'([^']+)'/g)].map((m) => m[1])
    expect(imports).toEqual(['@/lib/analytics/dates'])
    expect(source).not.toMatch(/\bimport\s*\(/)
    expect(source).not.toMatch(/\brequire\s*\(/)
  })

  it.each([
    ['네트워크', /\bfetch\s*\(|XMLHttpRequest|WebSocket|EventSource|sendBeacon/],
    ['브라우저 저장소', /localStorage|sessionStorage|indexedDB|document\.cookie/],
    ['화면·창', /\bdocument\b|\bwindow\b/],
    ['console', /\bconsole\b/],
    ['시계', /Date\.now|new Date\(\s*\)|performance\.now|todayInKorea\(\s*\)/],
    ['난수', /Math\.random|randomUUID/],
  ])('AC-8102.4: %s를 쓰지 않는다', (_label, pattern) => {
    expect(source).not.toMatch(pattern)
  })
})
