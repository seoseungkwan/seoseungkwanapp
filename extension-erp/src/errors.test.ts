// TASK-17 REQ-3614: 오류 번호 → '무엇이'·'어떻게' 글 한 곳(errors.ts). 글은 design.md 5-2 오류 표 그대로다
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const SRC = path.dirname(fileURLToPath(import.meta.url))
const DESIGN = readFileSync(path.resolve(SRC, '..', '..', 'specs', 'erp-closing-fill', 'design.md'), 'utf8')

// errors.ts가 없을 때 파일 전체가 아니라 그 시험만 실패하게 시험 안에서 불러온다
const loadErrors = () => import('./errors')

/** design.md 5-2 표: 번호 → 무엇이·어떻게. '(그 밖)' 줄은 OTHER */
function designTable(): { rows: Record<string, { what: string; how: string }>; other: { what: string; how: string } } {
  const start = DESIGN.indexOf('### 5-2 ')
  const end = DESIGN.indexOf('### 5-3 ')
  expect(start, 'design.md 5-2 절을 찾지 못했다').toBeGreaterThan(0)
  const rows: Record<string, { what: string; how: string }> = {}
  let other: { what: string; how: string } | null = null
  for (const line of DESIGN.slice(start, end).split('\n')) {
    const cells = line.split('|').map((c) => c.trim())
    if (cells.length < 5 || !(cells[1].startsWith('E-') || cells[1] === '(그 밖)')) continue
    const text = { what: cells[2], how: cells[3] }
    if (cells[1] === '(그 밖)') other = text
    else for (const code of cells[1].split(' · ')) rows[code] = text
  }
  if (!other) throw new Error("design.md 5-2 '(그 밖)' 줄이 없다")
  return { rows, other }
}

describe('AC-3614.1 errors.ts: design.md 5-2 오류 표 한 곳', () => {
  it('AC-3614.1: 표의 번호마다 무엇이·어떻게 글이 design.md 5-2 그대로이고, 표 밖 번호는 없다', async () => {
    const { ERRORS } = await loadErrors()
    const { rows } = designTable()
    expect(Object.keys(rows)).toHaveLength(16)
    expect(Object.keys(ERRORS).sort()).toEqual(Object.keys(rows).sort())
    for (const [code, text] of Object.entries(rows)) expect(ERRORS[code], code).toEqual(text)
  })

  it("AC-3614.1: '그 밖' 글도 design.md 5-2 그대로다", async () => {
    const { OTHER } = await loadErrors()
    expect(OTHER).toEqual(designTable().other)
    expect(OTHER).toEqual({ what: '비트에서 읽지 못했어요.', how: '잠시 뒤 다시 해 주세요. 계속되면 이 번호를 알려 주세요.' })
  })

  it('AC-3614.1: 표는 읽기만 된다(고칠 수 없다)', async () => {
    const { ERRORS } = await loadErrors()
    expect(Object.isFrozen(ERRORS)).toBe(true)
    for (const text of Object.values(ERRORS)) expect(Object.isFrozen(text)).toBe(true)
  })

  it.each([
    ['E-HELPER-MISSING', 'ERP 도우미가 이 PC에 없어요.', 'ERP 도우미를 설치해 주세요. 받은 zip을 풀고 install.cmd를 두 번 누르면 돼요.'],
    [
      'E-HELPER-STOPPED',
      'ERP 도우미가 읽는 도중 멈췄어요.',
      '잠시 뒤 다시 해 주세요. 계속되면 ERP 도우미 설치 파일(install.cmd)을 다시 실행해 주세요.',
    ],
    ['E-HELPER-TIMEOUT', '도우미가 답하지 않아요(120초).', '잠시 뒤 다시 해 주세요.'],
    [
      'E-BIT-NOT-REGISTERED',
      '이 PC가 아직 등록되지 않았어요.',
      'ERP 도우미 설치 파일을 다시 실행해 주세요(비트 로그인 → PC 확인 창 [확인]).',
    ],
    ['E-CLOSING-FUTURE-DATE', '마감 일자가 오늘보다 뒤예요.', '날짜를 확인해 주세요.'],
    ['E-BRIDGE-DISCONNECTED', '확장이 새로 읽혀 이 화면과 끊겼어요.', '이 화면을 새로고침(F5)한 뒤 다시 해 주세요.'],
  ])('AC-3614.1: explain(%s)는 그 번호와 표 글이다', async (code, what, how) => {
    const { explain } = await loadErrors()
    expect(explain(code)).toEqual({ code, what, how })
  })

  it.each(['E-HELPER-BAD-MESSAGE', 'E-HELPER-UNKNOWN-COMMAND'])(
    "AC-3614.3: %s(새 확장 + 옛 도우미)는 'ERP 도우미가 예전 판이에요.' · 같이 바꾸라는 글이다",
    async (code) => {
      const { explain } = await loadErrors()
      expect(explain(code)).toEqual({
        code,
        what: 'ERP 도우미가 예전 판이에요.',
        how: '새 판을 설치해 주세요. 확장과 ERP 도우미는 꼭 같이 바꿔요.',
      })
    },
  )

  it.each(['E-BIT-SOMETHING-NEW', 'E-X', 'E-HELPER-MISSING2'])("AC-3614.1: 표에 없는 번호 %s 는 번호 그대로 '그 밖' 글이다", async (code) => {
    const { explain, OTHER } = await loadErrors()
    expect(explain(code)).toEqual({ code, ...OTHER })
  })

  it.each<[string, unknown]>([
    ['빈 글자', ''],
    ['소문자', 'e-helper-missing'],
    ['HTML', '<img src=x>'],
    ['앞뒤 빈칸', ' E-HELPER-MISSING '],
    ['끝이 -', 'E-HELPER-'],
    ['E- 없음', 'HELPER-MISSING'],
    ['숫자', 42],
    ['null', null],
    ['undefined', undefined],
    ['객체', { code: 'E-HELPER-MISSING' }],
    ['표 밖 물려받은 이름', 'constructor'],
  ])('AC-3614.1: 오류 번호 모양이 아니면(%s) E-BRIDGE-BAD-REPLY로 본다', async (_name, code) => {
    const { explain, ERRORS } = await loadErrors()
    expect(explain(code)).toEqual({ code: 'E-BRIDGE-BAD-REPLY', ...ERRORS['E-BRIDGE-BAD-REPLY'] })
  })

  it('AC-3614.1: errors.ts는 글자만 두고 다른 파일을 불러오지 않는다(내용 스크립트·설정 화면이 같이 씀)', () => {
    const code = readFileSync(path.join(SRC, 'errors.ts'), 'utf8')
    expect(code).not.toMatch(/^\s*import\s/m)
    expect(code).not.toMatch(/\bimport\s*\(/)
    expect(code).not.toMatch(/\brequire\s*\(/)
  })
})

// spec erp-uisarang TASK-2 REQ-4212 AC-4212.6: 의사랑 자료원 오류 글(design.md 10-4 표)과 explainFor. explain(비트)은 위 시험 그대로다
const UIS_DESIGN = readFileSync(path.resolve(SRC, '..', '..', 'specs', 'erp-uisarang', 'design.md'), 'utf8')
/** 10-4 '{폴더}' 자리: 오류 답에는 폴더 자리가 없어 이름만(시안 ⑫ 보고서를 모를 때 'ERP마감 폴더의 엑셀이 …'와 같은 꼴) */
const UIS_FOLDER_NAME = 'ERP마감 폴더'

/** design.md(erp-uisarang) 10-4 표: 번호 → 무엇이·어떻게('…' 따옴표를 뗌). '그 밖' 줄은 other */
function uisTable(): { rows: Record<string, { what: string; how: string }>; other: { what: string; how: string } } {
  const start = UIS_DESIGN.indexOf('#### 10-4.')
  const end = UIS_DESIGN.indexOf('#### 10-5.')
  expect(start, 'design.md 10-4 절을 찾지 못했다').toBeGreaterThan(0)
  const unquote = (cell: string) => cell.replace(/^'(.*)'$/, '$1').replace('{폴더}', UIS_FOLDER_NAME)
  const rows: Record<string, { what: string; how: string }> = {}
  let other: { what: string; how: string } | null = null
  for (const line of UIS_DESIGN.slice(start, end).split('\n')) {
    const cells = line.split('|').map((c) => c.trim())
    if (cells.length < 5 || !(cells[1].startsWith('E-') || cells[1] === '그 밖')) continue
    const text = { what: unquote(cells[2]), how: unquote(cells[3]) }
    if (cells[1] === '그 밖') other = text
    else rows[cells[1]] = text
  }
  if (!other) throw new Error("design.md 10-4 '그 밖' 줄이 없다")
  return { rows, other }
}

describe('AC-4212.6 explainFor: 의사랑 자료원 오류 글(spec erp-uisarang design.md 10-4)', () => {
  it('AC-4212.6: UIS_ERRORS는 E-UIS-FOLDER · E-CLOSING-WRONG-SOURCE 둘이고 글은 10-4 표 그대로다', async () => {
    const { UIS_ERRORS } = await loadErrors()
    const { rows } = uisTable()
    expect(Object.keys(rows)).toEqual(['E-UIS-FOLDER', 'E-CLOSING-WRONG-SOURCE'])
    expect(Object.keys(UIS_ERRORS).sort()).toEqual(Object.keys(rows).sort())
    for (const [code, text] of Object.entries(rows)) expect(UIS_ERRORS[code], code).toEqual(text)
  })

  it("AC-4212.6: 의사랑 '그 밖' 글도 10-4 표 그대로다", async () => {
    const { UIS_OTHER } = await loadErrors()
    expect(UIS_OTHER).toEqual(uisTable().other)
    expect(UIS_OTHER).toEqual({ what: '의사랑 엑셀을 읽지 못했어요.', how: '잠시 뒤 다시 해 주세요. 계속되면 이 번호를 알려 주세요.' })
  })

  it('AC-4212.6: 의사랑 표도 읽기만 된다(고칠 수 없다)', async () => {
    const { UIS_ERRORS, UIS_OTHER } = await loadErrors()
    expect(Object.isFrozen(UIS_ERRORS)).toBe(true)
    expect(Object.isFrozen(UIS_OTHER)).toBe(true)
    for (const text of Object.values(UIS_ERRORS)) expect(Object.isFrozen(text)).toBe(true)
  })

  it.each([
    [
      'E-UIS-FOLDER',
      'ERP마감 폴더를 만들거나 열지 못했어요.',
      'ERP 도우미 설치 파일(install.cmd)을 다시 실행해 주세요. 계속되면 이 번호를 알려 주세요.',
    ],
    [
      'E-CLOSING-WRONG-SOURCE',
      '이 PC의 ERP 도우미가 다른 차트 프로그램으로 등록되어 있어요.',
      '이 PC가 쓰는 차트 프로그램(비트·의사랑)이 맞는지 확인하고 ERP 도우미 설치 파일을 다시 실행해 주세요.',
    ],
  ])("AC-4212.6: explainFor(%s, 'uisarang')는 그 번호와 10-4 글이다", async (code, what, how) => {
    const { explainFor, E_UIS_FOLDER, E_CLOSING_WRONG_SOURCE } = await loadErrors()
    expect([E_UIS_FOLDER, E_CLOSING_WRONG_SOURCE]).toContain(code)
    expect(explainFor(code, 'uisarang')).toEqual({ code, what, how })
  })

  it("AC-4212.6: 지금 ERRORS 표의 번호(16개 모두)는 'uisarang'에서도 지금 ERRORS 글 그대로다", async () => {
    const { explainFor, ERRORS } = await loadErrors()
    const codes = Object.keys(designTable().rows)
    expect(codes).toHaveLength(16)
    for (const code of codes) expect(explainFor(code, 'uisarang'), code).toEqual({ code, ...ERRORS[code] })
  })

  it.each(['E-UIS-SOMETHING-NEW', 'E-BIT-SOMETHING-NEW', 'E-X', 'E-UIS-FILE-OPEN', 'E-UIS-FOLDER2'])(
    "AC-4212.6: 두 표 어디에도 없는 번호 %s 는 'uisarang'에서 번호 그대로 의사랑 '그 밖' 글이다(비트 '그 밖' 글이 아님)",
    async (code) => {
      const { explainFor, UIS_OTHER, OTHER } = await loadErrors()
      expect(explainFor(code, 'uisarang')).toEqual({ code, ...UIS_OTHER })
      expect(UIS_OTHER).not.toEqual(OTHER)
    },
  )

  it.each<[string, unknown]>([
    ['빈 글자', ''],
    ['소문자', 'e-uis-folder'],
    ['HTML', '<img src=x>'],
    ['앞뒤 빈칸', ' E-UIS-FOLDER '],
    ['숫자', 42],
    ['null', null],
    ['undefined', undefined],
    ['객체', { code: 'E-UIS-FOLDER' }],
    ['표 밖 물려받은 이름', 'constructor'],
    ['표 밖 물려받은 이름 2', 'toString'],
  ])("AC-4212.6: 'uisarang'에서도 오류 번호 모양이 아니면(%s) E-BRIDGE-BAD-REPLY와 지금 글이다", async (_name, code) => {
    const { explainFor, ERRORS } = await loadErrors()
    expect(explainFor(code, 'uisarang')).toEqual({ code: 'E-BRIDGE-BAD-REPLY', ...ERRORS['E-BRIDGE-BAD-REPLY'] })
  })

  it.each<unknown>([
    'E-UIS-FOLDER',
    'E-CLOSING-WRONG-SOURCE',
    'E-HELPER-MISSING',
    'E-CLOSING-FUTURE-DATE',
    'E-BIT-SOMETHING-NEW',
    'e-helper-missing',
    null,
    'constructor',
  ])("AC-4212.6: explainFor(%s, 'bit')는 explain(비트)과 같다", async (code) => {
    const { explainFor, explain } = await loadErrors()
    expect(explainFor(code, 'bit')).toEqual(explain(code))
  })

  it('AC-4212.6: explain(비트)은 그대로 — 의사랑 번호도 지금 비트 그 밖 글이고 ERRORS에 의사랑 번호를 더하지 않았다', async () => {
    const { explain, ERRORS, OTHER } = await loadErrors()
    for (const code of ['E-UIS-FOLDER', 'E-CLOSING-WRONG-SOURCE']) {
      expect(explain(code)).toEqual({ code, ...OTHER })
      expect(Object.prototype.hasOwnProperty.call(ERRORS, code), code).toBe(false)
    }
  })
})
