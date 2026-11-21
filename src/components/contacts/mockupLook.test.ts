import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import ts from 'typescript'
import { describe, expect, it } from 'vitest'

// 시안과 모양 맞춤(spec contacts AC-6505.1·AC-6506.1·AC-6506.3, TASK-8 화면 확인 — 승인 시안 docs/mockups/contacts/index.html이 기준).
// 앱은 Tailwind Preflight를 넣지 않고 .app-ui 초기화(globals.css)는 여백·테두리만 지운다 → 목록 점·링크 밑줄·글자 크기는 브라우저 기본값이 남는다.
// 시안은 목록 점이 없고(.steps list-style: none, 다른 목록은 점 없는 줄), 링크는 밑줄 없이 올림에서만(.lnk·.nb·.btn), 본문 글자는 14px/22px(body)다.
// 그래서 주소록 화면(src/components/contacts/**)과 대시보드 무상 수리 알림(dashboard/warranty/**) 소스에서:
//  - <ul>·<ol>은 모두 list-none(점 없음)
//  - <a>·<Link>는 모두 no-underline(올림 밑줄은 hover:underline·group-hover:underline으로만)
//  - ContactsScreen이 돌려주는 뿌리는 text-body인 <div> — 크기를 따로 주지 않은 글과 판·확인 창·알림이 모두 14px/22px를 물려받는다(판·창은 포털 없이 그 안에 그린다)
// 클래스 글자는 그 요소의 className 식 + 그 식이 부르는 같은 파일 변수 값(const ROW = '…' 같은)까지 본다

const ROOTS = ['src/components/contacts', 'src/components/dashboard/warranty']

const sourceFiles = (dir: string): string[] =>
  readdirSync(join(process.cwd(), dir), { withFileTypes: true }).flatMap((entry) => {
    const path = `${dir}/${entry.name}`
    if (entry.isDirectory()) return sourceFiles(path)
    return /\.tsx$/.test(entry.name) && !/\.test\./.test(entry.name) ? [path] : []
  })
const FILES = ROOTS.flatMap(sourceFiles)

const parse = (file: string) => ts.createSourceFile(file, readFileSync(join(process.cwd(), file), 'utf8'), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX)

/** 파일 안 변수 이름 → 처음 값 글자(어느 깊이든) */
function variableValues(source: ts.SourceFile): Map<string, string> {
  const values = new Map<string, string>()
  const visit = (node: ts.Node) => {
    if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && node.initializer) values.set(node.name.text, node.initializer.getText(source))
    ts.forEachChild(node, visit)
  }
  visit(source)
  return values
}

type Tag = { file: string; tag: string; line: number; classText: string }

/** 그 이름의 JSX 요소마다 className 글자(식 + 식이 부르는 같은 파일 변수 값) */
function tagsIn(file: string, names: readonly string[]): Tag[] {
  const source = parse(file)
  const values = variableValues(source)
  const found: Tag[] = []
  const visit = (node: ts.Node) => {
    if ((ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) && names.includes(node.tagName.getText(source))) {
      const attr = node.attributes.properties.find((p): p is ts.JsxAttribute => ts.isJsxAttribute(p) && p.name.getText(source) === 'className')
      const expression = attr?.initializer?.getText(source) ?? ''
      const used = [...expression.matchAll(/[A-Za-z_$][\w$]*/g)].map((m) => values.get(m[0]) ?? '')
      found.push({ file, tag: node.tagName.getText(source), line: source.getLineAndCharacterOfPosition(node.getStart(source)).line + 1, classText: [expression, ...used].join(' ') })
    }
    ts.forEachChild(node, visit)
  }
  visit(source)
  return found
}

const hasClass = (classText: string, name: string) => new RegExp(`(?<![\\w:-])${name.replace(/[-]/g, '\\-')}(?![\\w-])`).test(classText)
const where = (t: Tag) => `${t.file}:${t.line} <${t.tag}>`

describe('AC-6505.1: 시안 모양 — 목록 점·링크 밑줄·본문 글자 크기', () => {
  it('AC-6505.1: 살펴볼 소스가 있다(빈 검사가 아니다)', () => {
    expect(FILES).toEqual(
      expect.arrayContaining([
        'src/components/contacts/ContactsScreen.tsx',
        'src/components/contacts/parts/CompanyDetail.tsx',
        'src/components/contacts/parts/EmptyBook.tsx',
        'src/components/contacts/import/ImportPreview.tsx',
        'src/components/contacts/import/TemplateLink.tsx',
        'src/components/dashboard/warranty/WarrantyNotice.tsx',
      ]),
    )
    const lists = FILES.flatMap((file) => tagsIn(file, ['ul', 'ol']))
    const links = FILES.flatMap((file) => tagsIn(file, ['a', 'Link']))
    expect(lists.length).toBeGreaterThanOrEqual(7)
    expect(links.length).toBeGreaterThanOrEqual(4)
  })

  it('AC-6505.1·AC-6506.3: <ul>·<ol>은 모두 list-none이다(시안에는 목록 점이 없다 — 담당자·수리 기록·빈 주소록 단계·미리 보기 숫자 칸과 목록)', () => {
    const dotted = FILES.flatMap((file) => tagsIn(file, ['ul', 'ol'])).filter((t) => !hasClass(t.classText, 'list-none'))
    expect(dotted.map(where)).toEqual([])
  })

  it('AC-6505.1·AC-6506.1: <a>·<Link>는 모두 no-underline이다(시안 링크는 밑줄 없이 올림에서만 — [양식 받기]·홈페이지·전화 링크·대시보드 알림)', () => {
    const underlined = FILES.flatMap((file) => tagsIn(file, ['a', 'Link'])).filter((t) => !hasClass(t.classText, 'no-underline'))
    expect(underlined.map(where)).toEqual([])
  })

  it('AC-6505.1: 홈페이지 링크 밑줄은 올림에서만 — no-underline과 hover:underline이 함께 있다', () => {
    const homepage = tagsIn('src/components/contacts/parts/CompanyDetail.tsx', ['a'])
    expect(homepage).toHaveLength(1)
    expect(hasClass(homepage[0]!.classText, 'no-underline')).toBe(true)
    expect(homepage[0]!.classText).toMatch(/(?<![\w-])hover:underline(?![\w-])/)
  })

  it('AC-6505.1: ContactsScreen이 돌려주는 뿌리는 text-body(14px/22px)인 <div>다 — 크기를 따로 주지 않은 글과 업체 판·확인 창·알림이 모두 그 안에서 물려받는다', () => {
    const source = parse('src/components/contacts/ContactsScreen.tsx')
    const screenFn = source.statements.find((s): s is ts.FunctionDeclaration => ts.isFunctionDeclaration(s) && s.name?.text === 'ContactsScreen')
    expect(screenFn?.body).toBeTruthy()
    const returns = screenFn!.body!.statements.filter(ts.isReturnStatement)
    let root = returns[returns.length - 1]?.expression
    while (root && ts.isParenthesizedExpression(root)) root = root.expression
    expect(root && ts.isJsxElement(root)).toBe(true)
    const opening = (root as ts.JsxElement).openingElement
    expect(opening.tagName.getText(source)).toBe('div')
    const className = opening.attributes.properties.find((p): p is ts.JsxAttribute => ts.isJsxAttribute(p) && p.name.getText(source) === 'className')
    expect(hasClass(className?.initializer?.getText(source) ?? '', 'text-body')).toBe(true)
  })

  it('AC-6505.1: 주소록 부품은 포털로 화면 밖에 그리지 않는다(판·창도 뿌리의 본문 글자를 물려받는다)', () => {
    const portals = FILES.filter((file) => /\bcreatePortal\b/.test(readFileSync(join(process.cwd(), file), 'utf8')))
    expect(portals).toEqual([])
  })
})
