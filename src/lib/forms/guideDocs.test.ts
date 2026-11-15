import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

// 환자 안내문 문서 시험 (specs/forms-guide REQ-4510 AC-4510.1·AC-4510.3, tasks.md TASK-9).
// 문서를 글자로 읽는다. 휴진 안내 때 쓴 ADR-028·CLAUDE.md·ARCHITECTURE 시험(src/lib/forms/rules.test.ts AC-3511.1·AC-3511.2)은
// 그대로 두고, 이 파일은 2026-11-15 환자 안내문 덧붙임만 본다
const ROOT = process.cwd()
// 줄바꿈이 CRLF로 받아져도 같은 글로 본다
const read = (rel: string) => readFileSync(join(ROOT, rel), 'utf8').replace(/\r\n/g, '\n')

// 그 번호 ADR 절(제목 줄부터 다음 ADR 제목 앞까지). 없으면 ''
function adrSection(doc: string, no: string): string {
  const head = new RegExp(`^### ADR-${no}: `, 'm').exec(doc)
  if (head === null) return ''
  const rest = doc.slice(head.index + 1)
  const next = rest.search(/^### ADR-/m)
  return next === -1 ? doc.slice(head.index) : doc.slice(head.index, head.index + 1 + next)
}
// '## 제목' 절의 본문(다음 '## ' 앞까지). 없으면 ''
function section(doc: string, title: string): string {
  const head = doc.indexOf(`\n## ${title}\n`)
  if (head === -1) return ''
  const body = doc.slice(head + `\n## ${title}\n`.length)
  const next = body.search(/^## /m)
  return next === -1 ? body : body.slice(0, next)
}
// ADR-028 안 환자 안내문 덧붙임: '덧붙임'과 '환자 안내문'이 함께 있는 줄부터 ADR-028 끝까지. 없으면 ''
function guideAddendum(): string {
  const lines = adrSection(read('docs/ADR.md'), '028').split('\n')
  const start = lines.findIndex((line) => line.includes('덧붙임') && line.includes('환자 안내문'))
  return start === -1 ? '' : lines.slice(start).join('\n')
}

// 'app/api/ai/forms/guide' 뒤에 '/'가 오지 않는 자리(그림 경로 '…/guide/picture'와 따로 적혀 있는지 본다)
const GUIDE_ROUTE = /app\/api\/ai\/forms\/guide(?!\/)/
const GUIDE_PLACE = /api\/ai\/forms\/guide(?!\/)/

describe('AC-4510.1: docs/ADR.md ADR-028의 환자 안내문 덧붙임', () => {
  it('AC-4510.1: ADR-028 안에 환자 안내문 덧붙임이 있고 2026-11-15 사용자 결정이라고 적는다', () => {
    const addendum = guideAddendum()
    expect(addendum).not.toBe('')
    for (const word of ['2026-11-15', '사용자', 'specs/forms-guide']) expect(addendum, word).toContain(word)
  })

  it('AC-4510.1: 덧붙임은 색을 로고색 하나로 고정하고, 그림은 그림 16개에서 AI가 고른다고 적는다', () => {
    const addendum = guideAddendum()
    for (const word of ['로고색', '그림 16개', 'components/forms/guideColors.ts']) expect(addendum, word).toContain(word)
  })

  it('AC-4510.1: 덧붙임은 AI 정리 경로 app/api/ai/forms/guide와 답의 숫자 검사(메모에 없는 숫자면 버림)를 적는다', () => {
    const addendum = guideAddendum()
    expect(addendum).toMatch(GUIDE_ROUTE)
    for (const word of ['메모에 없는 숫자', 'E-AI-FAILED']) expect(addendum, word).toContain(word)
  })

  it('AC-4510.1: 덧붙임은 AI 그림을 도형·색 이름·숫자로만 받아 앱이 그리고, 경로가 app/api/ai/forms/guide/picture라고 적는다', () => {
    const addendum = guideAddendum()
    for (const word of ['AI 그림', '도형·색 이름·숫자로만', 'app/api/ai/forms/guide/picture']) expect(addendum, word).toContain(word)
  })

  it('AC-4510.1: 덧붙임은 저장 표 form_guides를 적는다', () => {
    expect(guideAddendum()).toContain('form_guides')
  })

  it('AC-4510.1: 덧붙임 찾기 자체가 맞다(ADR-028 밖의 글은 잡지 않는다)', () => {
    const addendum = guideAddendum()
    // 다음 ADR 제목이 섞이지 않는다
    expect(addendum).not.toMatch(/^### ADR-/m)
    // 휴진 안내 결정(2026-11-10) 앞부분은 덧붙임에 들지 않는다
    expect(addendum).not.toContain('**결정** (2026-11-10')
  })
})

describe('AC-4510.1: CLAUDE.md 아키텍처 규칙의 ADR-028 예외 줄', () => {
  it('AC-4510.1: ADR-028을 가리키는 줄은 여전히 하나이고, 환자 안내문 색 자리 components/forms/guideColors.ts를 적는다', () => {
    const rules = section(read('CLAUDE.md'), '아키텍처 규칙')
    expect(rules).not.toBe('')
    const lines = rules.split('\n').filter((line) => line.includes('ADR-028'))
    expect(lines).toHaveLength(1)
    expect(lines[0]).toMatch(/^- /)
    for (const word of ['환자 안내문', 'components/forms/guideColors.ts']) expect(lines[0], word).toContain(word)
  })

  it("AC-4510.1: 예외 줄은 AI 그림의 '그릴 것'(20자까지)이 그림 이름으로 안내문과 함께 저장된다고 적는다(\"저장하지 않는다\"와 어긋나지 않게)", () => {
    const line = section(read('CLAUDE.md'), '아키텍처 규칙')
      .split('\n')
      .find((l) => l.includes('ADR-028'))
    for (const word of ["'그릴 것'", '20자까지', '안내문과 함께 저장']) expect(line, word).toContain(word)
  })

  it("AC-4510.1: ADR-028 덧붙임의 '저장·로그하지 않는다'는 대충 적은 글을 말하고, '그릴 것'은 함께 저장한다고 적는다", () => {
    const addendum = guideAddendum()
    expect(addendum).toContain('대충 적은 글은 개인정보 모양이면 보내지 않고, 저장·로그하지 않는다')
    expect(addendum).toContain("'그릴 것'은 그림 이름으로 안내문과 함께 저장한다")
  })

  it('AC-4510.1: CLAUDE.md 전체에서도 ADR-028 줄은 하나다(다른 절에 새 줄을 늘리지 않았다)', () => {
    expect(read('CLAUDE.md').split('\n').filter((line) => line.includes('ADR-028'))).toHaveLength(1)
  })
})

describe('AC-4510.3: docs/ARCHITECTURE.md 디렉토리 구조의 환자 안내문 자리', () => {
  it('AC-4510.3: 디렉토리 구조에 api/ai/forms/guide·api/ai/forms/guide/picture 자리와 form_guides 표가 적혀 있다', () => {
    const tree = section(read('docs/ARCHITECTURE.md'), '디렉토리 구조')
    expect(tree).not.toBe('')
    expect(tree).toMatch(GUIDE_PLACE)
    for (const place of ['api/ai/forms/guide/picture', 'form_guides']) expect(tree, place).toContain(place)
  })

  it('AC-4510.3: DB 표에 form_guides 줄이 하나 있다', () => {
    const table = section(read('docs/ARCHITECTURE.md'), 'DB 표 (§5)')
    expect(table).not.toBe('')
    expect(table.split('\n').filter((line) => line.startsWith('| `form_guides` |'))).toHaveLength(1)
  })
})
