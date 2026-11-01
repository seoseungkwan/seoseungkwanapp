import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

// 업무일지 양식 CSS (worklog REQ-007 AC-007.4, design.md 12절, docs/UI_GUIDE.md '업무일지 양식').
// 파일 글자를 읽어 본다. 픽셀 모양은 화면 사진이 본다. 인쇄(TASK-11)·막힌 칸·합계 제외 표시(TASK-8)가 더해져도 이 규칙은 그대로다
const SHEET_CSS = join(process.cwd(), 'src/components/worklog/sheet.module.css')
const withoutComments = (css: string) => css.replace(/\/\*[\s\S]*?\*\//g, '')
const sheetCss = () => withoutComments(readFileSync(SHEET_CSS, 'utf8'))

const FORBIDDEN: Array<[string, RegExp]> = [
  ['16진수 색', /#[0-9a-f]{3,8}(?![\w-])/i],
  ['rgb(', /\brgba?\(/i],
  ['hsl(', /\bhsla?\(/i],
  ['color-mix(', /\bcolor-mix\(/i],
  ['url(', /\burl\(/i],
  ['@font-face', /@font-face\b/i],
  ['@import', /@import\b/i],
  ['font 줄임 속성(글꼴 이름 검사를 비켜 간다)', /(?<![\w-])font\s*:/i],
]
const forbiddenIn = (css: string) => FORBIDDEN.filter(([, pattern]) => pattern.test(css)).map(([name]) => name)

const SHEET_COLORS = new Set(['--xl-ink', '--xl-lav', '--xl-gray', '--xl-focus', '--surface', '--muted', '--negative', '--negative-soft'])
// 시안의 크기 변수(칸 글자·제목·줄 높이). 값은 이 파일 안에서 정한다
const SIZE_VARS = new Set(['--c', '--c11', '--c10', '--c14', '--t', '--h1', '--h2', '--h3', '--h28', '--h40', '--h20'])
const FONT_NAMES = new Set(['Gulim', '굴림', 'Malgun Gothic', '맑은 고딕', 'Apple SD Gothic Neo', 'sans-serif'])

// var(--이름)의 이름 가운데 허용 목록 밖의 것
const badVarsIn = (css: string) =>
  [...css.matchAll(/var\(\s*(--[\w-]+)/g)].map((m) => m[1]).filter((name) => !SHEET_COLORS.has(name) && !SIZE_VARS.has(name))
// 이 파일이 정하는 변수 가운데 크기 변수 밖의 것(색·글꼴 변수를 몰래 만들지 않는다)
const badDeclaredVarsIn = (css: string) =>
  [...css.matchAll(/(?:^|[;{\s])(--[\w-]+)\s*:/g)].map((m) => m[1]).filter((name) => !SIZE_VARS.has(name))
// font-family 값의 글꼴 이름 가운데 허용 목록 밖의 것
const fontNamesIn = (css: string) =>
  [...css.matchAll(/(?<![\w-])font-family\s*:\s*([^;}]+)/g)].flatMap((m) => m[1].split(',').map((name) => name.trim().replace(/^['"]|['"]$/g, '')))
const badFontsIn = (css: string) => fontNamesIn(css).filter((name) => !FONT_NAMES.has(name))
// 색을 담는 속성의 값에서 var()와 크기·낱말을 뺀 나머지(red·white 같은 색 이름)
const COLOR_PROPS = /(?<![\w-])(color|background(?:-color)?|border(?:-(?:top|right|bottom|left))?(?:-color)?|outline(?:-color)?|box-shadow|caret-color|fill|stroke)\s*:\s*([^;}]+)/g
const NOT_A_COLOR = /^(?:0|\d*\.?\d+(?:px|pt|em)|solid|none|inset|transparent|inherit)$/
const namedColorsIn = (css: string) =>
  [...css.matchAll(COLOR_PROPS)].flatMap((m) =>
    m[2]
      .replace(/var\([^)]*\)/g, ' ')
      .trim()
      .split(/\s+/)
      .filter((word) => word !== '' && !NOT_A_COLOR.test(word))
      .map((word) => `${m[1]}: ${word}`),
  )

describe('AC-007.4: sheet.module.css — 색은 토큰 var()만, 글꼴은 시스템 이름만', () => {
  it('AC-007.4: 16진수·rgb(·hsl(·color-mix(·url(·@font-face·@import·font 줄임 속성이 없다(주석 뺀 CSS)', () => {
    expect(forbiddenIn(sheetCss())).toEqual([])
  })

  it('AC-007.4: var(--…) 이름은 허용 목록(--xl-*·--surface·--muted·--negative·--negative-soft + 시안의 크기 변수) 안이고, 색 이름을 직접 쓰지 않는다', () => {
    const css = sheetCss()
    expect(badVarsIn(css)).toEqual([])
    expect(badDeclaredVarsIn(css)).toEqual([])
    expect(namedColorsIn(css)).toEqual([])
  })

  it('AC-007.4: 엑셀 색과 흰 종이·흐린 안내 글·초점 색을 실제로 쓴다(빈 검사가 아니다)', () => {
    const css = sheetCss()
    for (const name of ['--xl-lav', '--xl-gray', '--xl-ink', '--xl-focus', '--surface', '--muted']) {
      expect(css, name).toContain(`var(${name})`)
    }
  })

  it('AC-007.4: font-family 값의 글꼴 이름은 굴림·맑은 고딕과 그 대체 글꼴뿐이고, 칸과 제목 글꼴이 실제로 있다', () => {
    const css = sheetCss()
    expect(badFontsIn(css)).toEqual([])
    const names = fontNamesIn(css)
    for (const name of ['Gulim', '굴림', 'Malgun Gothic', '맑은 고딕']) expect(names, name).toContain(name)
  })

  it('AC-007.4: 검사 규칙 자체가 잡아야 할 것을 잡는다', () => {
    for (const [name, bad] of [
      ['16진수 색', '.a { color: #107C41; }'],
      ['16진수 색', '.a { background: #fff }'],
      ['rgb(', '.a { color: rgb(0 0 0); }'],
      ['rgb(', '.a { color: rgba(0,0,0,.1); }'],
      ['hsl(', '.a { color: hsl(0 0% 0%); }'],
      ['color-mix(', '.a { color: color-mix(in srgb, red, blue); }'],
      ['url(', '.a { background: url(x.png); }'],
      ['@font-face', '@font-face { font-family: X; }'],
      ['@import', '@import "x.css";'],
      ['font 줄임 속성(글꼴 이름 검사를 비켜 간다)', '.a { font: 700 13px Comic Sans; }'],
    ] as const) {
      expect(forbiddenIn(bad), bad).toContain(name)
    }
    expect(forbiddenIn('.a { font-family: "Gulim", sans-serif; font-size: var(--c); color: var(--xl-ink); }')).toEqual([])

    expect(badVarsIn('.a { color: var(--accent); }')).toEqual(['--accent'])
    expect(badVarsIn('.a { border: 1px solid var(--line); }')).toEqual(['--line'])
    expect(badVarsIn('.a { color: var(--xl-lavv); }')).toEqual(['--xl-lavv'])
    expect(badVarsIn('.a { color: var(--negative); background: var(--negative-soft); height: var(--h28); font-size: var(--c14); }')).toEqual([])

    expect(badDeclaredVarsIn('.a { --xl-font: "Comic Sans"; --c: 17px; }')).toEqual(['--xl-font'])

    expect(badFontsIn('.a { font-family: "IBM Plex Sans KR", "Nanum Gothic", sans-serif; }')).toEqual(['IBM Plex Sans KR', 'Nanum Gothic'])
    expect(badFontsIn(`.a { font-family: "Gulim", "굴림", "Apple SD Gothic Neo", sans-serif; }`)).toEqual([])
    expect(badFontsIn(`.a { font-family: 'Malgun Gothic', "맑은 고딕", sans-serif; }`)).toEqual([])

    expect(namedColorsIn('.a { color: red; }')).toEqual(['color: red'])
    expect(namedColorsIn('.a { background: white; }')).toEqual(['background: white'])
    expect(namedColorsIn('.a { border: 1px solid black; }')).toEqual(['border: black'])
    expect(
      namedColorsIn('.a { border: 1px solid var(--xl-ink); background: transparent; box-shadow: inset 0 0 0 2px var(--xl-focus); outline: none; color: var(--muted); border-top-width: 2px; }'),
    ).toEqual([])
  })
})

describe('AC-007.4: sheet.module.css — 시안의 화면 규칙을 옮긴 범위', () => {
  it.each(['paper', 'sheet', 'title', 'lav', 'gray', 'date', 'small', 'memo', 'in', 'L', 'R', 'B', 'r1', 'r2', 'r3', 'r28', 'r20'])(
    'AC-007.4: 클래스 .%s가 있다(양식 칸이 쓴다)',
    (name) => {
      expect(sheetCss()).toMatch(new RegExp(`\\.${name}(?![\\w-])`))
    },
  )

  it('AC-007.4: 시안의 틀 부분(.sheets·.month·.btn·.pv·.toast)과 @container는 옮기지 않는다', () => {
    const css = sheetCss()
    for (const name of ['sheets', 'month', 'btn', 'pv', 'toast']) expect(css, name).not.toMatch(new RegExp(`\\.${name}(?![\\w-])`))
    expect(css).not.toMatch(/@container\b/)
  })

  it('AC-007.4: 768px 미만은 @media (max-width: 767px)로 폰 크기 변수를 바꾼다', () => {
    const phone = sheetCss().match(/@media\s*\(\s*max-width:\s*767px\s*\)\s*\{([\s\S]*?)\n\}/)
    expect(phone, '767px 블록이 없다').not.toBeNull()
    expect(phone![1]).toMatch(/\.sheet\s*\{[^}]*--c:\s*11px/)
    expect(phone![1]).toMatch(/\.paper\s*\{[^}]*padding:\s*8px/)
  })
})
