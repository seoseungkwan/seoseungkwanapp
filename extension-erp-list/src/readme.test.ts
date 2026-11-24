// spec erp-copy-list TASK-6 REQ-3908 AC-3908.1: 새 확장 안내서 extension-erp-list/README.md(병원 팀장이 읽는 쉬운 한국어).
// - 절 1~8과 머리 글(하는 일·하지 않는 일 세 가지·지금 확장 'ERP 마감일지 채우기'와 같이 깔아도 됨)
// - 두 안내서 링크(ERP 도우미 설치 안내·ERP 마감일지 채우기 안내)가 실제 파일을 가리키고, 이름을 댄 절이 그 파일에 있다
// - 안내서의 화면 글은 화면 글 상수(listTypes.ts LIST_TEXT·WHY_TEXT, 지금 확장 panel·rangeView·errors 글) 그대로다.
//   숫자·날짜 자리는 안내서에서 {이름}으로 쓴다: 화면 글 함수에 {이름} 글이나 표시 숫자(901…)를 넣어 부른 뒤 견준다
// - 코드 이름·파일 경로·명령은 '만드는 사람에게' 소절에만 있다
// 두 안내서(extension-erp/README.md·helper-erp/install/README.md)는 읽기만 한다(고치지 않음, TASK-1·4의 git diff 시험)
import { createHash } from 'node:crypto'
import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { HELD_SALES } from '../../extension-erp/src/cells'
import { E_HELPER_MISSING, ERRORS, explain } from '../../extension-erp/src/errors'
import { FLOW_TEXT, OVERLAP_TEXT, TEXT } from '../../extension-erp/src/panel'
import { RANGE_TEXT } from '../../extension-erp/src/rangeView'
import { GROUP_NAMES } from '../../extension-erp/src/types'
import { LIST_TEXT, SCREEN_BOXES, WHY_ORDER, WHY_TEXT } from './listTypes'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..')
const EXT = path.join(ROOT, 'extension-erp-list')
const README_PATH = path.join(EXT, 'README.md')
const read = (rel: string) => readFileSync(path.join(ROOT, rel), 'utf8')
const MANIFEST = JSON.parse(read('extension-erp-list/manifest.json')) as {
  name: string
  version: string
  key: string
  action: { default_title: string }
}
const HELPER_VERSION = /<Version>([^<]+)<\/Version>/.exec(read('helper-erp/Directory.Build.props'))?.[1]
/** 안내서가 잇는 두 안내서(README.md 자리에서 본 경로) */
const HELPER_GUIDE = '../helper-erp/install/README.md'
const FILL_GUIDE = '../extension-erp/README.md'
/** 이 확장을 받는 ERP 도우미 설치 파일 */
const SINCE = '2026-11-24 이후 받은 ERP 도우미 설치 파일'

/** 절 제목(차례 그대로, 이 밖의 '## ' 절은 없다) */
const CHAPTERS = [
  '1. 먼저 ERP 도우미 설치',
  '2. 크롬에 확장 붙이기',
  '3. 목록 화면 여는 법',
  '4. 처음 한 번: 설정 저장',
  '5. 날마다 쓰는 법',
  '6. 빈 칸 까닭 · 진료 0건인 날 · 경고 줄 · 씨암·SONO 줄',
  '7. 안내 글과 할 일',
  '8. 새 판으로 바꾸기 · 지우기 · 만드는 사람에게',
] as const

/** 안내서 글(없으면 그 시험만 실패) */
function readme(): string {
  expect(existsSync(README_PATH), 'extension-erp-list/README.md가 없다').toBe(true)
  return readFileSync(README_PATH, 'utf8')
}

/** 글 안의 '{mark} {title}…' 제목 아래(제목 줄 빼고, 같은 높이나 더 높은 제목 앞까지) */
function under(text: string, mark: '##' | '###', title: string): string {
  const lines = text.split('\n')
  const head = lines.findIndex((line) => line.startsWith(`${mark} ${title}`))
  expect(head, `'${mark} ${title}' 제목이 없다`).toBeGreaterThan(-1)
  const rest = lines.slice(head + 1)
  const stop = mark === '##' ? (line: string) => line.startsWith('## ') : (line: string) => line.startsWith('## ') || line.startsWith('### ')
  const end = rest.findIndex(stop)
  return (end === -1 ? rest : rest.slice(0, end)).join('\n')
}

/** 'n.'로 시작하는 절 */
const chapter = (n: number) => under(readme(), '##', CHAPTERS[n - 1])

/** 머리 글(첫 '## ' 앞) */
function head(): string {
  const text = readme()
  const at = text.search(/^## /m)
  return at === -1 ? text : text.slice(0, at)
}

/** '만드는 사람에게' 소절 */
const makers = () => under(chapter(8), '###', '8-3. 만드는 사람에게')

/** 화면 글이 따옴표('…' 또는 글 안에 '가 있으면 "…")로 그대로 있다 */
function expectQuoted(text: string, line: string) {
  expect(text.includes(`'${line}'`) || text.includes(`"${line}"`), `'${line}'`).toBe(true)
}

/** 화면 글 속 표시 숫자(901 …)를 안내서의 {이름}으로 */
function slots(text: string, names: Record<number, string>): string {
  return Object.entries(names).reduce((s, [mark, name]) => s.split(mark).join(name), text)
}

/** 글 조각들이 이 차례로 나온다 */
function expectInOrder(text: string, parts: readonly string[]) {
  let from = -1
  for (const part of parts) {
    const at = text.indexOf(part, from + 1)
    expect(at, `'${part}'가 앞 조각 뒤에 없다`).toBeGreaterThan(from)
    from = at
  }
}

/** 표 줄('|'로 시작, 머리·구분 줄 빼고)의 칸 글 */
function tableRows(text: string, firstCell: RegExp): string[][] {
  return text
    .split('\n')
    .filter((line) => line.startsWith('|'))
    .map((line) => line.split('|').slice(1, -1).map((cell) => cell.trim()))
    .filter((cells) => firstCell.test(cells[0] ?? ''))
}

/** 크롬 규칙: 공개키(DER) SHA-256 앞 16바이트를 16진수로 쓰고 0-f를 a-p로 바꾼 것이 확장 ID */
function extensionIdFromKey(key: string): string {
  const hex = createHash('sha256').update(Buffer.from(key, 'base64')).digest('hex').slice(0, 32)
  return [...hex].map((c) => String.fromCharCode('a'.charCodeAt(0) + parseInt(c, 16))).join('')
}

describe('AC-3908.1 안내서 틀 — 절 1~8 · 머리 글 · 링크 · 쉬운 한국어', () => {
  it('AC-3908.1: 맨 위 제목은 확장 이름이고, 절은 1~8 여덟 개가 이 차례로만 있다', () => {
    const text = readme()
    expect(MANIFEST.name).toBe(LIST_TEXT.title)
    expect(text.split('\n')[0]).toBe(`# ${MANIFEST.name} (크롬 확장) 설치·사용 안내`)
    const chapters = text.split('\n').filter((line) => line.startsWith('## '))
    expect(chapters).toEqual(CHAPTERS.map((title) => `## ${title}`))
  })

  it("AC-3908.1: 머리 글 — 하는 일([목록 만들기]·숫자 누르면 복사·[엑셀로 받기])과 하지 않는 일 셋(ERP 사이트·저장·환자 정보), 지금 확장과 같이 깔아도 됨", () => {
    const top = head()
    for (const button of [LIST_TEXT.make, LIST_TEXT.xlsx]) expect(top, button).toContain(`[${button}]`)
    expect(top).toContain('숫자 칸을 누르면 복사')
    expect(top).toContain('ERP 사이트는 건드리지 않습니다')
    expect(top).toContain('저장은 ERP에서 직접 누릅니다')
    expect(top).toContain('환자 이름·차트번호는 이 PC 밖으로 나가지 않습니다')
    expectQuoted(top, LIST_TEXT.foot)
    expect(top).toContain("**'ERP 마감일지 채우기'**")
    expect(top).toContain('같이 깔아 두어도 됩니다')
    expect(top).toContain(`입력 목록 확장 ${MANIFEST.version} ↔ ERP 도우미 ${HELPER_VERSION}(2026-11-24 이후 설치 파일)`)
  })

  it('AC-3908.1: 안내서 안 링크는 모두 실제 파일을 가리키고, 두 안내서(ERP 도우미 설치 안내·ERP 마감일지 채우기 안내)로 잇는다', () => {
    const text = readme()
    const targets = [...text.matchAll(/\]\(([^)\s]+)\)/g)].map((m) => m[1]).filter((t) => !/^(?:https?:|#)/.test(t))
    expect(targets.length).toBeGreaterThan(0)
    for (const target of targets) expect(existsSync(path.resolve(EXT, target.split('#')[0])), target).toBe(true)
    expect(text).toContain(`[ERP 도우미 설치 안내](${HELPER_GUIDE})`)
    expect(text).toContain(`[ERP 마감일지 채우기 안내](${FILL_GUIDE})`)
  })

  it("AC-3908.1: 쉬운 한국어 — 코드 이름·저장소 경로·명령은 '8-3. 만드는 사람에게' 소절에만 있다(링크 주소는 빼고 봄)", () => {
    const text = readme()
    const dev = makers()
    const rest = text.replace(dev, '').replace(/\]\([^)\s]+\)/g, ']')
    const banned = /extension-erp|helper-erp|\bsrc\/|\.ts\b|\.js\b|\bdist\b|npm run|tsc\b|LIST_TEXT|WHY_TEXT|planCells|explain\(|nativeMessaging/
    for (const [i, line] of rest.split('\n').entries()) expect(banned.test(line), `${i + 1}째 줄: ${line}`).toBe(false)
    expect(dev).toMatch(banned)
  })
})

describe('AC-3908.1 절 1~4 — 도우미 설치 · 크롬에 붙이기 · 목록 화면 여는 법 · 처음 한 번 설정', () => {
  it("AC-3908.1: 1. ERP 도우미 설치 — 설치 안내로 잇고, '2026-11-24 이후 받은 ERP 도우미 설치 파일'이어야 하며 이미 깔았어도 다시 설치한다", () => {
    const one = chapter(1)
    expect(one).toContain(`[ERP 도우미 설치 안내](${HELPER_GUIDE})`)
    expect(one).toContain(SINCE)
    expect(one).toContain('이미 깔았어도')
    expect(one).toContain('다시 설치')
    // 이름을 댄 설치 안내의 절이 그 파일에 있다
    const guide = read('helper-erp/install/README.md')
    for (const title of ['설치하기', '이 PC 등록']) {
      expect(one).toContain(`'${title}'`)
      expect(guide.split('\n').some((line) => line.startsWith(`## ${title}`)), title).toBe(true)
    }
  })

  it("AC-3908.1: 2. 크롬에 붙이기 — 압축 풀기 → chrome://extensions → 개발자 모드 → '압축해제된 확장 프로그램을 로드합니다' 차례, 목록에 확장 이름", () => {
    const two = chapter(2)
    expectInOrder(two, ['모두 압축 풀기', '`chrome://extensions`', '개발자 모드', '압축해제된 확장 프로그램을 로드합니다'])
    expect(two).toContain(`**${MANIFEST.name}**`)
    expect(two).toContain("'ERP 마감일지 채우기'")
  })

  it('AC-3908.1: 3. 목록 화면 여는 법 — 퍼즐 모양 단추에서 고정 → 아이콘 누르기 → 새 탭, 열린 주소를 즐겨찾기', () => {
    const three = chapter(3)
    expectInOrder(three, ['퍼즐 모양', '고정', '아이콘을 누르', '새 탭'])
    expect(three).toContain(`'${MANIFEST.action.default_title}'`)
    expect(three).toContain('즐겨찾기')
    expect(three).toContain('chrome-extension://')
    expectQuoted(three, LIST_TEXT.hint.lead)
  })

  it("AC-3908.1: 4. 처음 한 번 설정 — [설정 열기] → 코드 확인 → [저장], 처음 한 번 글, 자세한 것은 'ERP 마감일지 채우기 안내' '4. 다른 의원 첫 설정'", () => {
    const four = chapter(4)
    expectInOrder(four, [`**[${TEXT.openSettings}]**`, '코드', '**[저장]**'])
    expectQuoted(four, LIST_TEXT.settingsOpened)
    expectQuoted(four, TEXT.first)
    expect(four).toContain(`[ERP 마감일지 채우기 안내](${FILL_GUIDE})`)
    expect(four).toContain("'4. 다른 의원 첫 설정'")
    expect(read('extension-erp/README.md').split('\n')).toContain('## 4. 다른 의원 첫 설정')
    // 설정 화면은 지금 확장 것을 글까지 그대로 싣는다(design.md 결정 13) — 그 제목과 저장 글
    const title = /<title>([^<]+)<\/title>/.exec(read('extension-erp/options.html'))?.[1]
    expect(title).toBeTruthy()
    expectQuoted(four, title as string)
    expectQuoted(four, '저장했어요.')
    expect(read('extension-erp/src/options.ts')).toContain("'저장했어요.'")
    // 설정은 지금 확장과 따로라 이 확장에서 한 번 더 한다(AC-3907.1)
    expect(four).toContain('따로')
  })
})

describe('AC-3908.1 절 5 — 날마다 쓰는 법(화면 글 그대로)', () => {
  it('AC-3908.1: 기간 → [목록 만들기] → 숫자 누르기 → ERP 칸에 붙여 넣기(Ctrl+V) → ERP에서 저장 차례', () => {
    const five = chapter(5)
    expectInOrder(five, [RANGE_TEXT.pick.from, RANGE_TEXT.pick.to, `**[${LIST_TEXT.make}]**`, '숫자 칸을 누르', 'Ctrl+V', '[전체 저장]', '[일일 상세 저장]'])
    expect(five).toContain('직접 누릅니다')
  })

  it("AC-3908.1: 세는 중 '비트에서 읽는 중…' · '{N}일 중 {k}일' · [그만두기], 목록 위 줄·도움 줄·밀기 줄, 줄 차례(ERP 화면 차례)", () => {
    const five = chapter(5)
    expectQuoted(five, TEXT.reading)
    expectQuoted(five, slots(RANGE_TEXT.scanning.count(901, 902), { 901: '{N}', 902: '{k}' }))
    expect(five).toContain(`**[${RANGE_TEXT.scanning.cancel}]**`)
    expectQuoted(five, LIST_TEXT.period('{시작일}', '{끝일}') + slots(LIST_TEXT.size(901, 902), { 901: '{N}', 902: '{R}' }))
    expectQuoted(five, LIST_TEXT.sumHelp)
    expectQuoted(five, LIST_TEXT.madeAt('{날짜 시각}'))
    expectQuoted(five, LIST_TEXT.slide)
    expect(five).toContain(SCREEN_BOXES.join(' → '))
    for (const name of [LIST_TEXT.journal1, LIST_TEXT.journal2, LIST_TEXT.ops]) expect(five, name).toContain(name)
  })

  it("AC-3908.1: 복사 쪽지 '복사했어요' + '{M/D} · {묶음} {줄} {열} · {값}'(시안 예 '11/2 · 치료현황 도수상담 · 4'), 파란 테두리·초록 ✓", () => {
    const five = chapter(5)
    expectQuoted(five, LIST_TEXT.copied)
    expectQuoted(five, LIST_TEXT.copyTail('{M/D}', '{묶음}', '{줄}', '{열}', '{값}'))
    expectQuoted(five, LIST_TEXT.copyTail('11/2', '치료현황', '도수상담', null, '4'))
    expect(five).toContain('파란 테두리')
    expect(five).toContain('초록 ✓')
  })

  it("AC-3908.1: [엑셀로 받기] → 크롬 다운로드 폴더, 쪽지 '엑셀 파일을 받았어요' + 파일 이름, 끝 열 '빈 칸 까닭', 경고 줄·씨암·SONO 줄은 엑셀에 없음", () => {
    const five = chapter(5)
    expect(five).toContain(`**[${LIST_TEXT.xlsx}]**`)
    expect(five).toContain('크롬 다운로드 폴더')
    expectQuoted(five, LIST_TEXT.saved)
    expectQuoted(five, LIST_TEXT.fileName('{시작일}', '{끝일}'))
    expectQuoted(five, LIST_TEXT.legend)
    expectQuoted(five, LIST_TEXT.head)
    expect(five).toContain('엑셀에는 넣지 않습니다')
    // 목록은 이 화면에만 있다(AC-3903.7)
    expect(five).toContain('새로고침')
  })
})

describe('AC-3908.1 절 6 — 빈 칸 까닭 네 가지 · 진료 0건인 날 · 경고 줄 · 씨암·SONO 줄', () => {
  it('AC-3908.1: 6-1 빈 칸 까닭 표 — 네 줄이 화면 차례이고 꼬리표·칸 안 작은 글·긴 글이 WHY_TEXT 그대로(보류 긴 글은 {이름} 꼴)', () => {
    const blanks = under(chapter(6), '###', '6-1. 빈 칸 까닭 네 가지')
    expectQuoted(blanks, LIST_TEXT.legend)
    const rows = tableRows(blanks, /^'/)
    expect(rows.map((cells) => cells[0])).toEqual(WHY_ORDER.map((why) => `'${WHY_TEXT[why].tag}'`))
    for (const [i, why] of WHY_ORDER.entries()) {
      expect(rows[i][1], why).toBe(`'${WHY_TEXT[why].cell}'`)
      // 보류 긴 글은 지금 보류 묶음(HELD_SALES) 이름이 들어간다. 안내서는 {이름} 자리로 쓴다
      const help = why === 'held' ? TEXT.held(['{이름}']) : WHY_TEXT[why].help
      expect(rows[i][2], why).toBe(`'${help}'`)
    }
    expect(WHY_TEXT.held.help).toBe(TEXT.held(HELD_SALES.map((key) => GROUP_NAMES[key])))
    // 지금 보류 묶음은 비어 있어 실제로는 나오지 않는다 — 안내서도 그렇게 적는다
    expect(HELD_SALES).toHaveLength(0)
    expect(blanks).toContain('지금은 보류 중인 항목이 없어 실제로는 나오지 않습니다')
  })

  it("AC-3908.1: 6-2 진료 0건인 날 — 머리 '진료 0건', 마우스를 올리면 '{날짜}에는 비트 진료가 한 건도 없어요.', 흐리게 보이고 복사됨", () => {
    const zero = under(chapter(6), '###', '6-2. 진료 0건인 날')
    expectQuoted(zero, LIST_TEXT.zero)
    expectQuoted(zero, FLOW_TEXT.zero('{날짜}'))
    expect(zero).toContain('흐리게')
    expect(zero).toContain('복사')
  })

  it("AC-3908.1: 6-3 경고 줄 — 표 위 '{M/D}: {경고 글}', 글과 할 일은 'ERP 마감일지 채우기 안내' '6-3. 경고 줄'과 같음", () => {
    const warn = under(chapter(6), '###', '6-3. 경고 줄')
    expectQuoted(warn, LIST_TEXT.warn('{M/D}', '{경고 글}'))
    expect(warn).toContain(`[ERP 마감일지 채우기 안내](${FILL_GUIDE})`)
    expect(warn).toContain("'6-3. 경고 줄'")
    expect(read('extension-erp/README.md').split('\n')).toContain('### 6-3. 경고 줄 (채운 뒤, 있을 때만)')
  })

  it("AC-3908.1: 6-4 씨암·SONO 줄 — '함께 있는 진료 {K}건은 씨암·SONO 둘 다에 넣었어요.'와 매출 칸을 직접 확인하라는 글", () => {
    const both = under(chapter(6), '###', '6-4. 씨암·SONO 줄')
    expectQuoted(both, slots(OVERLAP_TEXT.done(901, 'both'), { 901: '{K}' }))
    expect(both).toContain('직접 확인')
  })
})

describe('AC-3908.1 절 7 — 안내 글과 할 일(오류 글은 errors.ts 글 그대로)', () => {
  const REQUIRED = [
    'E-HELPER-MISSING',
    'E-HELPER-STOPPED',
    'E-HELPER-TIMEOUT',
    'E-HELPER-BAD-MESSAGE',
    'E-BIT-NOT-REGISTERED',
    'E-BIT-NOT-FOUND',
    'E-BRIDGE-DISCONNECTED',
    'E-BRIDGE-BAD-REPLY',
  ]

  it("AC-3908.1: 7-1 오류 표 — 줄마다 번호의 무엇이·어떻게가 explain 글 그대로이고, 작은 줄 '목록을 만들지 못했어요. (번호 {번호})'", () => {
    const errors = under(chapter(7), '###', '7-1. 오류 표')
    expectQuoted(errors, LIST_TEXT.failed('{번호}'))
    const rows = tableRows(errors, /^`E-|^\(그 밖의 번호\)$/)
    const seen: string[] = []
    for (const [first, what, how, todo] of rows) {
      const codes = first === '(그 밖의 번호)' ? ['E-NOT-IN-TABLE'] : [...first.matchAll(/`(E-[A-Z0-9-]+)`/g)].map((m) => m[1])
      expect(codes.length, first).toBeGreaterThan(0)
      for (const code of codes) {
        if (first !== '(그 밖의 번호)') expect(Object.prototype.hasOwnProperty.call(ERRORS, code), code).toBe(true)
        expect(what, code).toBe(explain(code).what)
        expect(how, code).toBe(explain(code).how)
        seen.push(code)
      }
      expect(todo, first).toBeTruthy()
    }
    for (const code of REQUIRED) expect(seen, code).toContain(code)
    expect(seen).toContain('E-NOT-IN-TABLE')
    // 여기 없는 번호는 지금 확장 안내서의 오류 표로 잇는다
    expect(errors).toContain(`[ERP 마감일지 채우기 안내](${FILL_GUIDE})`)
    expect(errors).toContain("'6-1. 오류 표'")
    expect(read('extension-erp/README.md').split('\n')).toContain('### 6-1. 오류 표')
  })

  it("AC-3908.1: 도우미를 깔았는데도 'ERP 도우미가 이 PC에 없어요.'가 나오면 이번 ERP 도우미 설치 파일로 다시 설치", () => {
    const seven = chapter(7)
    expect(seven).toContain(`도우미를 깔았는데도 '${ERRORS[E_HELPER_MISSING].what}'가 나오면 이번 ERP 도우미 설치 파일로 다시 설치`)
    expect(seven).toContain(SINCE)
  })

  it('AC-3908.1: 7-2 다른 안내 글 — 처음 한 번·막는 글 셋·복사 실패 글이 화면 글 그대로', () => {
    const other = under(chapter(7), '###', '7-2. 다른 안내 글')
    for (const line of [TEXT.first, LIST_TEXT.settingsOpened, RANGE_TEXT.pick.empty, RANGE_TEXT.pick.reversed, RANGE_TEXT.pick.future, LIST_TEXT.copyFailed]) {
      expectQuoted(other, line)
    }
  })
})

describe('AC-3908.1 절 8 — 새 판으로 바꾸기 · 지우기 · 만드는 사람에게', () => {
  it('AC-3908.1: 8-1 새 판으로 바꾸기 — 폴더 바꾸고 chrome://extensions 새로고침, 열어 둔 목록 화면 새로고침(F5), 도우미가 바뀌면 설치 안내로', () => {
    const update = under(chapter(8), '###', '8-1. 새 판으로 바꾸기')
    expectInOrder(update, ['`chrome://extensions`', '새로고침', 'F5'])
    expect(update).toContain(`[ERP 도우미 설치 안내](${HELPER_GUIDE})`)
    expect(update).toContain('E-BRIDGE-DISCONNECTED')
  })

  it("AC-3908.1: 8-2 지우기 — 이 확장 삭제(설정도 지워짐), 'ERP 마감일지 채우기'를 쓰면 ERP 도우미는 지우지 않음", () => {
    const remove = under(chapter(8), '###', '8-2. 지우기')
    expect(remove).toContain(`**${MANIFEST.name}**`)
    expect(remove).toContain('삭제')
    expect(remove).toContain("'ERP 마감일지 채우기'")
    expect(remove).toContain(`[ERP 도우미 설치 안내](${HELPER_GUIDE})`)
    expect(read('helper-erp/install/README.md').split('\n')).toContain('## 지우기')
  })

  it("AC-3908.1: 8-3 만드는 사람에게 — 빌드 명령 'npm run ext-erp-list:build'·dist 모양·짝 판 '입력 목록 확장 0.1.0 ↔ ERP 도우미 0.3.0(2026-11-24 이후 설치 파일)'·고정 ID", () => {
    const dev = makers()
    expect(dev).toContain('`npm run ext-erp-list:build`')
    expect(dev).toContain('`extension-erp-list/dist/`')
    for (const part of ['manifest.json', 'list.html', 'options.html', 'extension-erp-list/src/', 'extension-erp/src/']) expect(dev, part).toContain(part)
    expect(dev).toContain('content.js')
    expect(MANIFEST.version).toBe('0.1.0')
    expect(HELPER_VERSION).toBe('0.3.0')
    expect(dev).toContain(`입력 목록 확장 ${MANIFEST.version} ↔ ERP 도우미 ${HELPER_VERSION}(2026-11-24 이후 설치 파일)`)
    const id = extensionIdFromKey(MANIFEST.key)
    expect(id).toMatch(/^[a-p]{32}$/)
    expect(dev).toContain(`\`chrome-extension://${id}/list.html\``)
  })
})
