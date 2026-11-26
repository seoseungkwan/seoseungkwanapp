import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { buildCsp } from '@/lib/csp'

// 휴진 안내 AI 배경 문서 시험 (specs/forms-themes REQ-4613 AC-4613.1·4613.2·4613.3·4613.5, tasks.md TASK-13, design.md 1·8·11절).
// 문서를 글자로 읽는다. ADR-028·CLAUDE.md ADR-028 줄 시험(rules.test.ts·guideDocs.test.ts)은 그대로 두고, 이 파일은 ADR-029만 본다
const ROOT = process.cwd()
// 줄바꿈이 CRLF로 받아져도 같은 글로 본다
const read = (rel: string) => readFileSync(join(ROOT, rel), 'utf8').replace(/\r\n/g, '\n')

const ADR_TITLE = /^### ADR-(\d{3}): (.+)$/gm
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
const adr029 = () => adrSection(read('docs/ADR.md'), '029')
// ADR-029 안에서 그 글이 든 줄(없으면 '')
const lineWith = (body: string, word: string) => body.split('\n').find((line) => line.includes(word)) ?? ''

describe('AC-4613.1: docs/ADR.md ADR-029 — 휴진 안내 AI 배경은 적은 말을 OpenAI 그림 AI로 보낸다', () => {
  it("AC-4613.1: 'OpenAI'가 든 제목의 ADR-029가 한 번 있다", () => {
    const titles = [...read('docs/ADR.md').matchAll(ADR_TITLE)].filter((m) => m[1] === '029')
    expect(titles).toHaveLength(1)
    expect(titles[0]![2]).toContain('OpenAI')
    expect(titles[0]![2]).toContain('휴진 안내 AI 배경')
  })

  it('AC-4613.1: 맥락·결정·이유·대안·트레이드오프와 보내는 것·보내지 않는 것·값과 한도·저장·열쇠·로그·CSP 항목이 있다', () => {
    const body = adr029()
    expect(body).not.toBe('')
    for (const label of ['**맥락**', '**결정**', '**이유**', '**대안**', '**트레이드오프**']) expect(body, label).toContain(label)
    for (const label of ['**보내는 것**', '**보내지 않는 것**', '**값과 한도**', '**저장**', '**열쇠**', '**로그**', '**CSP']) {
      expect(body, label).toContain(label)
    }
  })

  it('AC-4613.1: 2026-11-15 사용자 결정·모델 gpt-image-2.6-flare·경로 app/api/ai/forms/background·열쇠 OPENAI_API_KEY를 적는다', () => {
    const body = adr029()
    for (const word of ['2026-11-15', '사용자', 'gpt-image-2.6-flare', 'app/api/ai/forms/background', 'OPENAI_API_KEY']) {
      expect(body, word).toContain(word)
    }
  })

  it('AC-4613.1: 보내는 것은 고정 프롬프트와 적은 말(30자까지)뿐이고, 개인정보 모양(전화·주민·메일)이면 보내지 않는다', () => {
    const line = lineWith(adr029(), '**보내는 것**')
    for (const word of ['고정 프롬프트', '적은', '30자', '전화', '주민', '메일', 'E-FORMS-PRIVATE']) expect(line, word).toContain(word)
  })

  it('AC-4613.1: 보내지 않는 것은 병원·환자·안내문 카드·사용자 정보다', () => {
    const line = lineWith(adr029(), '**보내지 않는 것**')
    for (const word of ['병원', '환자', '안내문 카드', '사용자 정보']) expect(line, word).toContain(word)
  })

  it('AC-4613.1: 값과 한도는 하루 20장·약 80원이고 사용량은 ai_usage에 더한다', () => {
    const line = lineWith(adr029(), '**값과 한도**')
    for (const word of ['하루 20장', '약 80원', 'ai_usage', 'take_ai_image']) expect(line, word).toContain(word)
  })

  it('AC-4613.1: 저장은 고른 그림만 form_backgrounds 표와 Storage form-backgrounds에 둔다', () => {
    const line = lineWith(adr029(), '**저장**')
    for (const word of ['form_backgrounds', 'form-backgrounds', 'Storage', '[내 배경으로 저장]']) expect(line, word).toContain(word)
  })

  it('AC-4613.1: 열쇠는 서버 환경 변수에만, 로그는 오류 번호·경로만 남긴다', () => {
    const body = adr029()
    const key = lineWith(body, '**열쇠**')
    for (const word of ['OPENAI_API_KEY', '서버 환경 변수', 'NEXT_PUBLIC_']) expect(key, word).toContain(word)
    const log = lineWith(body, '**로그**')
    for (const word of ['오류 번호·경로만', '적은 말', '프롬프트']) expect(log, word).toContain(word)
  })

  it('AC-4613.1: CSP를 바꾸지 않는 까닭(브라우저는 OpenAI와 말하지 않고, 그림은 data: 주소로 그린다)을 적는다', () => {
    const line = lineWith(adr029(), '**CSP')
    for (const word of ['바꾸지 않는다', 'api.openai.com', 'connect-src', 'img-src', 'data:', '서버만']) expect(line, word).toContain(word)
  })

  it('AC-4613.1: ADR-029 찾기 자체가 맞다(다음 ADR·ADR-028 글을 잡지 않는다)', () => {
    const body = adr029()
    expect(body.startsWith('### ADR-029: ')).toBe(true)
    expect(body.slice(1)).not.toMatch(/^### ADR-/m)
    expect(body).not.toContain('**덧붙임 — 환자 안내문')
  })
})

// tasks.md TASK-13이 정한 줄 그대로
const ADR029_LINE =
  '- 예외 (ADR-029): 휴진 안내 AI 배경(`app/api/ai/forms/background`)만 사용자가 적은 짧은 말(30자까지, 개인정보 모양 거부)을 OpenAI 그림 AI로 보낸다. 열쇠 `OPENAI_API_KEY`는 서버 환경 변수에만, 하루 20장, 저장은 고른 그림만(`form_backgrounds`·Storage `form-backgrounds`)'

describe('AC-4613.2: CLAUDE.md 아키텍처 규칙의 ADR-029 예외 줄', () => {
  it("AC-4613.2: 아키텍처 규칙에 ADR-029를 가리키는 줄이 하나이고('- '로 시작, OpenAI·경로·30자·OPENAI_API_KEY), tasks.md 글 그대로다", () => {
    const rules = section(read('CLAUDE.md'), '아키텍처 규칙')
    expect(rules).not.toBe('')
    const lines = rules.split('\n').filter((line) => line.includes('ADR-029'))
    expect(lines).toHaveLength(1)
    expect(lines[0]).toMatch(/^- /)
    for (const word of ['OpenAI', 'app/api/ai/forms/background', '30자', 'OPENAI_API_KEY']) expect(lines[0], word).toContain(word)
    expect(lines[0]).toBe(ADR029_LINE)
  })

  it('AC-4613.2: ADR-029 줄은 ADR-028 줄 바로 밑에 있고, ADR-028 글자를 품지 않는다(ADR-028 줄은 여전히 하나)', () => {
    const lines = read('CLAUDE.md').split('\n')
    const at028 = lines.findIndex((line) => line.includes('ADR-028'))
    expect(at028).toBeGreaterThan(-1)
    expect(lines[at028 + 1]).toBe(ADR029_LINE)
    expect(ADR029_LINE).not.toContain('ADR-028')
    expect(lines.filter((line) => line.includes('ADR-028'))).toHaveLength(1)
    expect(lines.filter((line) => line.includes('ADR-029'))).toHaveLength(1)
  })
})

describe('AC-4613.3: docs/ARCHITECTURE.md 자리·표·Storage 버킷', () => {
  it('AC-4613.3: 디렉토리 구조에 api/ai/forms/background·formBackgrounds.ts 자리가 적혀 있다', () => {
    const tree = section(read('docs/ARCHITECTURE.md'), '디렉토리 구조')
    expect(tree).not.toBe('')
    for (const place of ['api/ai/forms/background', 'formBackgrounds.ts']) expect(tree, place).toContain(place)
  })

  it('AC-4613.3: DB 표에 form_backgrounds·ai_image_days 줄이 하나씩 있다', () => {
    const table = section(read('docs/ARCHITECTURE.md'), 'DB 표 (§5)')
    expect(table).not.toBe('')
    for (const name of ['form_backgrounds', 'ai_image_days']) {
      expect(table.split('\n').filter((line) => line.startsWith(`| \`${name}\` |`)), name).toHaveLength(1)
    }
  })

  it('AC-4613.3: DB 표 절에 Storage 버킷 form-backgrounds 줄이 있다', () => {
    const table = section(read('docs/ARCHITECTURE.md'), 'DB 표 (§5)')
    const bucket = table.split('\n').filter((line) => line.includes('Storage') && line.includes('`form-backgrounds`'))
    expect(bucket.length).toBeGreaterThan(0)
  })
})

describe('AC-4613.5: CSP는 바꾸지 않는다', () => {
  const SUPABASE = 'https://abcd.supabase.co'
  // 'connect-src x y; ...' → { 'connect-src': ['x', 'y'], ... }
  const directives = (csp: string): Record<string, string[]> =>
    Object.fromEntries(
      csp
        .split(';')
        .map((part) => part.trim().split(/\s+/))
        .filter(([name]) => name)
        .map(([name, ...values]) => [name, values]),
    )

  // connect-src의 구글 두 origin은 예약 구글 캘린더 맞춤(google-link ADR-053, lib/gcal/client.ts) — 그림 AI 길과 상관없다
  it.each([
    ['운영', false, ["'self'", SUPABASE, 'https://script.google.com', 'https://script.googleusercontent.com']],
    ['개발', true, ["'self'", SUPABASE, 'https://script.google.com', 'https://script.googleusercontent.com', 'ws:']],
  ] as const)("AC-4613.5: buildCsp(%s)에 'openai'가 없고 img-src·connect-src가 지금 그대로다(예약 구글 캘린더 두 origin 포함)", (_, isDev, connect) => {
    const csp = buildCsp(isDev, SUPABASE)
    expect(csp.toLowerCase()).not.toContain('openai')
    const d = directives(csp)
    expect(d['img-src']).toEqual(["'self'", 'data:', 'blob:'])
    expect(d['connect-src']).toEqual([...connect])
  })
})
