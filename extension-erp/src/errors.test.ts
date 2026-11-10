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
