// @vitest-environment jsdom
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { cleanup, render } from '@testing-library/react'
import type { ReactNode } from 'react'
import { afterEach, describe, expect, it } from 'vitest'
import type { GuideValue } from '@/lib/forms/guide'
import { GUIDE_LOGO, GUIDE_LOGO_AREA, GUIDE_LOGO_MAX, layoutGuide } from '@/lib/forms/guideLayout'
import { logoRect, logoTextFit, scaleLogoRect, type PosterLogo } from '@/lib/forms/layout'
import type { GuideColors } from '@/lib/forms/logoColors'
import { DEFAULT_STYLE, type FormStyle } from '@/lib/forms/style'
import { DRAW_COLORS, PICTURE_IDS, type DrawKind, type DrawShape, type GuideContent, type GuideDrawing, type GuideLine } from '@/types/formGuide'
import { DRAW_COLOR_VALUES, GUIDE_COLORS, drawColorValues, guidePalette } from './guideColors'
import { GuidePoster } from './GuidePoster'
import { GuideDrawingPicture, GuidePicture } from './guidePictures'
import { Poster } from './Poster'

// 서식 탭 환자 안내문 그림 SVG (specs/forms-guide REQ-4504 AC-4504.1~4504.6, design.md 5절, TASK-7).
// 기준 그림은 승인 시안 docs/mockups/forms-guide/index.html의 poster()·iconSvg()·ICONS·drawingSvg()다.
// 시안 스크립트를 그대로 돌려 나온 SVG와 요소·속성·글을 견주고(그대로 옮겼나), AC마다 자리·색·굵기·강조·로고를 따로 본다

afterEach(cleanup)

// 로고색 다섯 값(시험은 값을 글자로 적어 guideColors.ts의 값 자체를 본다)
const Y = '#E6E006'
const D = '#2e2e2e'
const W = '#fff'
const NOTE = '#d6d6d6'
const SHADOW = '#000'

const L = (text: string, em = ''): GuideLine => ({ text, em })
// 요청서 예시 6장 (design.md 10절 부록, guideLayout.test.ts와 같은 값)
const EXAMPLES: GuideContent[] = [
  {
    tag: '보험 서류 안내', subtitle: '보험사에 낼 서류는', big1: '수납할 때', big2: '말씀해 주세요', firstSmall: false,
    boxTop: '이렇게 말씀해 주세요', boxBottom: '"보험 서류 필요해요"', picture: 'document', drawing: null, bandTitle: '이런 서류가 필요하실 때', mark: 'check',
    lines: [L('진단서'), L('진료비 영수증'), L('진료비 세부내역서'), L('통원 확인서')], note: '필요한 서류는 보험사마다 다르니 미리 확인해 주세요',
  },
  {
    tag: '영상 CD 안내', subtitle: '다른 병원 영상 CD는', big1: '접수할 때', big2: '먼저 주세요', firstSmall: false,
    boxTop: '이렇게 말씀해 주세요', boxBottom: '"영상 CD 가져왔어요"', picture: 'disc', drawing: null, bandTitle: '이런 영상을 가져오셨다면', mark: 'check',
    lines: [L('엑스레이'), L('CT'), L('MRI')], note: '미리 주시면 진료 때 바로 확인할 수 있습니다',
  },
  {
    tag: '신분증 안내', subtitle: '접수할 때', big1: '신분증을', big2: '보여주세요', firstSmall: false,
    boxTop: '건강보험으로 진료받으시려면', boxBottom: '본인 확인이 필요합니다', picture: 'idcard', drawing: null, bandTitle: '이런 신분증을 가져오세요', mark: 'check',
    lines: [L('주민등록증'), L('운전면허증'), L('건강보험증'), L('모바일 건강보험증')], note: '신분증을 찍은 사진·복사본은 안 됩니다',
  },
  {
    tag: '접수 안내', subtitle: '다른 분을 대신하는', big1: '대리 접수는', big2: '안 됩니다', firstSmall: false,
    boxTop: '접수는', boxBottom: '환자 본인만 가능합니다', picture: 'nosign', drawing: null, bandTitle: '이렇게 해 주세요', mark: 'check',
    lines: [L('환자 본인이 오신 뒤에 접수해 주세요'), L('가족·지인 접수는 대신 할 수 없습니다')], note: '본인 확인과 공정한 순서를 위해 양해 부탁드립니다',
  },
  {
    tag: '진료 시작 전 안내', subtitle: '지금은 진료 시작 전입니다', big1: '순서 대기표를', big2: '적어 주세요', firstSmall: false,
    boxTop: '순서 대기표는', boxBottom: '왼쪽 아래에 있습니다', picture: 'clock', drawing: null, bandTitle: '', mark: 'number',
    lines: [L('순서 대기표를 작성해 주세요'), L('자리에 앉아 기다려 주세요'), L('적으신 순서대로 접수해 드립니다')], note: '진료는 오전 9시, 오후 2시에 시작합니다',
  },
  {
    tag: '도수치료 안내', subtitle: '도수치료 관리급여 적용', big1: '1회 비용', big2: '43,850원', firstSmall: true,
    boxTop: '2026년 7월 1일부터', boxBottom: '건강보험 적용 중입니다', picture: 'spine', drawing: null, bandTitle: '도수치료 전에 꼭 확인하세요', mark: 'check',
    lines: [
      L('물리치료를 먼저 2주 이상 · 4회 이상 받은 뒤', '2주 이상 · 4회 이상'),
      L('물리치료로 좋아지지 않을 때 적용', '좋아지지 않을 때'),
      L('도수치료는 주 2회, 1년 15회까지', '주 2회, 1년 15회'),
    ],
    note: '',
  },
]
const example = (n: number): GuideContent => structuredClone(EXAMPLES[n - 1]!)
const withEx1 = (patch: Partial<GuideContent>): GuideContent => ({ ...example(1), ...patch })

const SH = (kind: DrawKind, nums: number[], fill: DrawShape['fill'], stroke: DrawShape['stroke'], width: number, d = ''): DrawShape => ({
  kind, nums, d, fill, stroke, width,
})
// 시안 '휠체어' 손 그림(docs/mockups/forms-guide ?s=screen&go=draw, guideDrawing.test.ts의 WHEELCHAIR)
const WHEELCHAIR: GuideDrawing = {
  subject: '휠체어',
  shapes: [
    SH('circle', [78, 108, 34], 'yellow', 'dark', 9), SH('circle', [78, 108, 9], 'white', 'dark', 5),
    SH('path', [], 'none', 'dark', 10, 'M58 46 L58 90 L108 90'), SH('path', [], 'none', 'dark', 9, 'M108 90 L120 122 L134 122'),
    SH('circle', [122, 132, 7], 'white', 'dark', 5), SH('path', [], 'none', 'dark', 9, 'M58 46 L44 46'),
  ],
}
const drawn = (drawing: GuideDrawing = structuredClone(WHEELCHAIR)): GuideContent => withEx1({ picture: 'custom', drawing })

// ---------- 그리기·찾기 ----------

function draw(content: GuideContent) {
  const { container } = render(<GuidePoster content={content} />)
  const svg = container.querySelector('svg')
  if (!svg) throw new Error('svg가 없다')
  return svg
}
// SVG 요소 이름은 대소문자를 가린다(clipPath) — localName으로 찾는다
const all = (root: Element, name: string) => [...root.querySelectorAll('*')].filter((el) => el.localName === name)
const texts = (svg: Element) => all(svg, 'text')
const textOf = (svg: Element, content: string) => {
  const found = texts(svg).filter((t) => t.textContent === content)
  expect(found, content).toHaveLength(1)
  return found[0]!
}
const attrsOf = (el: Element): Record<string, string> => Object.fromEntries([...el.attributes].map((a) => [a.name, a.value]))
const names = (el: Element) => [...el.children].map((child) => child.localName)
const num = (el: Element, name: string) => Number(el.getAttribute(name))
// 그림 자리: 뿌리 바로 아래의 <g>는 그림 하나뿐이다
const pictureGroups = (svg: Element) => [...svg.children].filter((el) => el.localName === 'g')
function pictureGroup(svg: Element) {
  const groups = pictureGroups(svg)
  expect(groups).toHaveLength(1)
  return groups[0]!
}
const TEXT_BASE = { 'font-family': 'PosterPretendard', 'dominant-baseline': 'central' }

// ---------- 승인 시안 스크립트(그대로 돌린다) ----------

type Mockup = {
  poster: (g: GuideContent) => string
  iconSvg: (key: string) => string
  drawingSvg: (drawing: GuideDrawing, clip: string) => string
  DRAWINGS: Record<string, GuideDrawing>
}
// 시안 <script>의 '안내문 배치'부터 '예시 6장' 앞까지(값·배치·그림 16개·AI 그림·poster()). 화면 코드(document)는 그 뒤에 있다
function loadMockup(): Mockup {
  const html = readFileSync(join(process.cwd(), 'docs/mockups/forms-guide/index.html'), 'utf8').replace(/\r\n/g, '\n')
  const start = html.indexOf("const Y = '#E6E006'")
  const end = html.lastIndexOf('\n', html.indexOf('예시 6장 (요청서'))
  if (start < 0 || end < start) throw new Error('시안 스크립트 자리를 못 찾았다')
  return new Function(`${html.slice(start, end)}\nreturn { poster, iconSvg, drawingSvg, DRAWINGS }`)() as Mockup
}
const MOCKUP = loadMockup()

function parseSvg(text: string): Element {
  const doc = new DOMParser().parseFromString(text, 'image/svg+xml')
  if (doc.getElementsByTagName('parsererror').length > 0) throw new Error(`SVG를 읽지 못했다: ${text.slice(0, 80)}`)
  return doc.documentElement
}
// 그림 조각(받침 + 그림)은 <svg>로 감싸 읽는다
const parseFragment = (text: string) => parseSvg(`<svg xmlns="http://www.w3.org/2000/svg">${text}</svg>`)

// 요소·속성·글을 견줄 수 있는 모양으로. 시안과 앱이 일부러 다른 세 곳만 맞춘다:
// ① 시안 lineText는 강조 줄에 text-anchor를 빼 둔다(기본값 start) ② 시안 로고 주소는 시안 폴더 자리(../forms/logo.png)
// ③ clipPath 이름은 시안이 차례 번호, 앱이 useId다(이름이 서로 가리키는지는 AC-4504.6 시험이 따로 본다)
type Tree = { tag: string; attrs: Record<string, string>; kids: (Tree | string)[] }
function tree(el: Element): Tree {
  const attrs = attrsOf(el)
  if (el.localName === 'text' && attrs['text-anchor'] === undefined) attrs['text-anchor'] = 'start'
  if (el.localName === 'image' && attrs.href === '../forms/logo.png') attrs.href = '/poster/logo.png'
  if (el.localName === 'clipPath') attrs.id = '(clip)'
  if (attrs['clip-path'] !== undefined) attrs['clip-path'] = 'url(#(clip))'
  const kids: (Tree | string)[] = []
  for (const node of [...el.childNodes]) {
    if (node.nodeType === node.ELEMENT_NODE) kids.push(tree(node as Element))
    else if (node.nodeType === node.TEXT_NODE && node.textContent) {
      const last = kids.at(-1)
      if (typeof last === 'string') kids[kids.length - 1] = last + node.textContent
      else kids.push(node.textContent)
    }
  }
  return { tag: el.localName, attrs, kids }
}
// 앱 SVG에서 글꼴 <style>을 뺀 모양(시안 페이지는 글꼴을 페이지 CSS로 읽는다. <style>은 AC-4504.3 시험이 본다)
function appTree(svg: Element): Tree {
  const t = tree(svg)
  return { ...t, kids: t.kids.filter((k) => typeof k === 'string' || k.tag !== 'style') }
}
function pictureFragment(node: ReactNode): Element {
  const { container } = render(<svg xmlns="http://www.w3.org/2000/svg">{node}</svg>)
  const svg = container.querySelector('svg')
  if (!svg) throw new Error('svg가 없다')
  return svg
}

// ---------- AC-4504.1: 틀·차례·자리 ----------

describe('AC-4504.1: 안내문 SVG 틀 — 794×1123, 세 구역, 차례', () => {
  it('AC-4504.1: 뿌리는 viewBox 0 0 794 1123·xmlns·role="img"인 svg 하나이고 안에 svg가 또 없다', () => {
    const svg = draw(example(1))
    expect(svg.getAttribute('viewBox')).toBe('0 0 794 1123')
    expect(svg.getAttribute('xmlns')).toBe('http://www.w3.org/2000/svg')
    expect(svg.getAttribute('role')).toBe('img')
    expect(all(svg, 'svg')).toHaveLength(0)
  })

  it('AC-4504.1: 예시 1(체크 두 열·띠 제목·아래 작은 글)의 자식 차례: 글꼴 → 바탕 셋 → 알약 → 작은 제목·큰 문구 → 흰 상자 → 그림 → 띠 제목 → 줄 → 아래 작은 글 → 로고', () => {
    expect(names(draw(example(1)))).toEqual([
      'style',
      'rect', 'rect', 'rect',
      'rect', 'text',
      'text', 'text', 'text',
      'rect', 'rect', 'text', 'text',
      'g',
      'text',
      ...Array.from({ length: 4 }, () => ['text', 'text']).flat(),
      'text',
      'image',
    ])
  })

  it('AC-4504.1: 예시 5(번호 세 줄·띠 제목 없음)는 줄마다 노랑 원 + 번호 + 글이고, 예시 6(윗줄 작게·아래 작은 글 없음)은 아래 작은 글이 없다', () => {
    expect(names(draw(example(5)))).toEqual([
      'style', 'rect', 'rect', 'rect', 'rect', 'text', 'text', 'text', 'text', 'rect', 'rect', 'text', 'text', 'g',
      ...Array.from({ length: 3 }, () => ['circle', 'text', 'text']).flat(),
      'text',
      'image',
    ])
    cleanup()
    expect(names(draw(example(6)))).toEqual([
      'style', 'rect', 'rect', 'rect', 'rect', 'text', 'text', 'text', 'text', 'rect', 'rect', 'text', 'text', 'g',
      'text',
      ...Array.from({ length: 3 }, () => ['text', 'text']).flat(),
      'image',
    ])
  })

  it.each(EXAMPLES.map((_, i) => [i + 1] as const))('AC-4504.1: 예시 %i은 승인 시안 poster()가 그린 SVG와 요소·속성·글이 같다', (n) => {
    const content = example(n)
    expect(appTree(draw(content))).toEqual(tree(parseSvg(MOCKUP.poster(content))))
  })

  it('AC-4504.1: 그림이 없거나·흰 상자가 아랫줄만이거나·AI 그림인 안내문도 시안 poster()와 같다', () => {
    for (const content of [
      withEx1({ picture: null }),
      withEx1({ boxTop: '' }),
      withEx1({ boxTop: '', boxBottom: '' }),
      withEx1({ bandTitle: '', note: '', mark: 'number' }),
      drawn(),
    ]) {
      expect(appTree(draw(content)), JSON.stringify(content).slice(0, 80)).toEqual(tree(parseSvg(MOCKUP.poster(content))))
      cleanup()
    }
  })

  it('AC-4504.1: 바탕 세 구역은 노랑 0~666 · 진회색 666~954 · 흰색 954~1123이다', () => {
    const rects = [...draw(example(1)).children].filter((el) => el.localName === 'rect').slice(0, 3)
    expect(rects.map(attrsOf)).toEqual([
      { width: '794', height: '666', fill: Y },
      { y: '666', width: '794', height: '288', fill: D },
      { y: '954', width: '794', height: '169', fill: W },
    ])
  })

  it('AC-4504.1: 머리표 알약은 x 51·y 41·높이 65·모서리 32.5 진회색이고, 글은 알약 가운데 노랑 900이다', () => {
    const content = example(1)
    const { pill } = layoutGuide(content)
    const svg = draw(content)
    const rect = svg.children[4]!
    expect(attrsOf(rect)).toEqual({ x: '51', y: '41', width: String(pill.w), height: '65', rx: '32.5', fill: D })
    expect(attrsOf(textOf(svg, '보험 서류 안내'))).toEqual({
      ...TEXT_BASE, x: String(pill.text.x), y: '73.5', 'font-size': String(pill.text.size), 'font-weight': '900', fill: Y, 'text-anchor': 'middle',
    })
  })

  it('AC-4504.1: 작은 제목·큰 문구 두 줄은 x 51에서 배치 크기로, 진회색 900·자간 -0.03em이다(윗줄 작게도)', () => {
    for (const n of [1, 6]) {
      const content = example(n)
      const g = layoutGuide(content)
      const svg = draw(content)
      for (const f of [g.subtitle, g.big[0], g.big[1]]) {
        expect(attrsOf(textOf(svg, f.text)), f.text).toEqual({
          ...TEXT_BASE, x: '51', y: String(f.y), 'font-size': String(f.size), 'font-weight': '900', fill: D, 'letter-spacing': '-0.03em', 'text-anchor': 'start',
        })
      }
      cleanup()
    }
  })

  it('AC-4504.1: 흰 상자는 그림자 rect(x+5·y+6, #000 18%, 모서리 26) + 테두리 rect(안으로 2.5, 흰 바탕·진회색 5, 모서리 23.5) + 글 둘(윗줄 700·아랫줄 900, x 84)이다', () => {
    const content = example(1)
    const { box } = layoutGuide(content)
    if (!box || !box.top) throw new Error('상자가 없다')
    const svg = draw(content)
    const [shadow, border] = [svg.children[9]!, svg.children[10]!]
    expect(attrsOf(shadow)).toEqual({ x: String(box.x + 5), y: String(box.y + 6), width: String(box.w), height: String(box.h), rx: '26', fill: SHADOW, 'fill-opacity': '.18' })
    expect(attrsOf(border)).toEqual({
      x: String(box.x + 2.5), y: String(box.y + 2.5), width: String(box.w - 5), height: String(box.h - 5), rx: '23.5', fill: W, stroke: D, 'stroke-width': '5',
    })
    expect(attrsOf(textOf(svg, '이렇게 말씀해 주세요'))).toEqual({
      ...TEXT_BASE, x: '84', y: String(box.top.y), 'font-size': String(box.top.size), 'font-weight': '700', fill: D, 'text-anchor': 'start',
    })
    expect(attrsOf(textOf(svg, '"보험 서류 필요해요"'))).toEqual({
      ...TEXT_BASE, x: '84', y: String(box.bottom.y), 'font-size': String(box.bottom.size), 'font-weight': '900', fill: D, 'text-anchor': 'start',
    })
  })

  it('AC-4504.1: 흰 상자는 아랫줄만 있으면 글 하나(높이 92), 아랫줄이 비면 상자가 없다', () => {
    const only = withEx1({ boxTop: '' })
    const svg = draw(only)
    const rects = [...svg.children].filter((el) => el.localName === 'rect')
    expect(rects).toHaveLength(6)
    expect(rects[4]!.getAttribute('height')).toBe('92') // 그림자
    expect(rects[5]!.getAttribute('height')).toBe('87') // 테두리(안으로 2.5씩)
    expect(texts(svg).filter((t) => t.getAttribute('x') === '84').map((t) => t.textContent)).toEqual(['"보험 서류 필요해요"'])
    cleanup()
    const none = draw(withEx1({ boxTop: '', boxBottom: '' }))
    expect([...none.children].filter((el) => el.localName === 'rect')).toHaveLength(4)
    expect(texts(none).filter((t) => t.getAttribute('x') === '84')).toHaveLength(0)
  })

  it('AC-4504.1: 띠 제목은 노랑 900(x 51), 비면 없다. 아래 작은 글은 "※ " + 글을 #d6d6d6 700으로, 비면 없다', () => {
    const content = example(1)
    const g = layoutGuide(content)
    const svg = draw(content)
    expect(attrsOf(textOf(svg, '이런 서류가 필요하실 때'))).toEqual({
      ...TEXT_BASE, x: '51', y: String(g.bandTitle!.y), 'font-size': String(g.bandTitle!.size), 'font-weight': '900', fill: Y, 'text-anchor': 'start',
    })
    expect(attrsOf(textOf(svg, '※ 필요한 서류는 보험사마다 다르니 미리 확인해 주세요'))).toEqual({
      ...TEXT_BASE, x: '51', y: String(g.note!.y), 'font-size': String(g.note!.size), 'font-weight': '700', fill: NOTE, 'text-anchor': 'start',
    })
    cleanup()
    const plain = draw(withEx1({ bandTitle: '', note: '' }))
    expect(texts(plain).some((t) => t.textContent === '이런 서류가 필요하실 때')).toBe(false)
    expect(texts(plain).some((t) => (t.textContent ?? '').startsWith('※'))).toBe(false)
  })

  it('AC-4504.1: 체크 줄은 줄마다 노랑 ✓(markX·markSize)와 흰 글(배치 자리·크기)이다 — 예시 1은 두 열', () => {
    const content = example(1)
    const g = layoutGuide(content)
    expect(g.twoCols).toBe(true)
    const svg = draw(content)
    const marks = texts(svg).filter((t) => t.textContent === '✓')
    expect(marks).toHaveLength(4)
    g.rows.forEach((r, i) => {
      expect(attrsOf(marks[i]!)).toEqual({
        ...TEXT_BASE, x: String(r.markX), y: String(r.text.y), 'font-size': String(r.markSize), 'font-weight': '900', fill: Y, 'text-anchor': 'start',
      })
      expect(attrsOf(textOf(svg, r.text.text))).toEqual({
        ...TEXT_BASE, x: String(r.text.x), y: String(r.text.y), 'font-size': String(r.text.size), 'font-weight': '900', fill: W, 'text-anchor': 'start',
      })
    })
    expect(new Set(marks.map((m) => m.getAttribute('x'))).size).toBe(2) // 두 열
  })

  it('AC-4504.1: 번호 줄은 노랑 원(x 51부터 지름 circle) + 원 가운데 진회색 번호(1부터) + 흰 글이다 — 예시 5', () => {
    const content = example(5)
    const g = layoutGuide(content)
    const svg = draw(content)
    const circles = [...svg.children].filter((el) => el.localName === 'circle')
    expect(circles).toHaveLength(3)
    g.rows.forEach((r, i) => {
      const cx = String(51 + r.circle! / 2)
      expect(attrsOf(circles[i]!)).toEqual({ cx, cy: String(r.text.y), r: String(r.circle! / 2), fill: Y })
      expect(attrsOf(textOf(svg, String(i + 1)))).toEqual({
        ...TEXT_BASE, x: cx, y: String(r.text.y), 'font-size': String(r.markSize), 'font-weight': '900', fill: D, 'text-anchor': 'middle',
      })
      expect(textOf(svg, r.text.text).getAttribute('fill')).toBe(W)
    })
    expect(texts(svg).some((t) => t.textContent === '✓')).toBe(false)
  })

  it('AC-4504.1: 빈 줄은 그리지 않는다', () => {
    const svg = draw(withEx1({ lines: [L('진단서'), L('  '), L('통원 확인서')] }))
    expect(texts(svg).filter((t) => t.textContent === '✓')).toHaveLength(2)
  })

  it('AC-4504.1: 쓰는 색은 #E6E006·#2e2e2e·#fff·#d6d6d6과 그림자 #000(18%)뿐이다 — 예시 6장·그림 16개·AI 그림 모두', () => {
    const contents = [...EXAMPLES.map((_, i) => example(i + 1)), ...PICTURE_IDS.map((picture) => withEx1({ picture })), drawn()]
    for (const content of contents) {
      const svg = draw(content)
      const label = `${content.tag} ${String(content.picture)}`
      for (const el of all(svg, '*').concat([svg])) {
        for (const name of ['fill', 'stroke']) {
          const value = el.getAttribute(name)
          if (value !== null) expect([Y, D, W, NOTE, SHADOW, 'none'], `${label} ${el.localName} ${name}`).toContain(value)
        }
        // 그림자 검정은 18%로만 쓴다
        if (el.getAttribute('fill') === SHADOW) expect(el.getAttribute('fill-opacity'), label).toBe('.18')
        expect(el.getAttribute('stroke'), label).not.toBe(SHADOW)
        for (const name of ['style', 'color', 'stop-color', 'flood-color', 'filter', 'mask']) expect(el.getAttribute(name), `${label} ${name}`).toBeNull()
      }
      const text = new XMLSerializer().serializeToString(svg)
      expect(text, label).not.toMatch(/\b(?:rgba?|hsla?|color-mix)\(/i)
      const hexes = new Set(text.match(/#(?:[0-9a-f]{8}|[0-9a-f]{6}|[0-9a-f]{3,4})(?![\w-])/gi))
      for (const hex of hexes) expect([Y, D, W, NOTE, SHADOW], `${label} ${hex}`).toContain(hex)
      cleanup()
    }
  })
})

// ---------- AC-4504.2: 노란 글자는 진회색 위에만 ----------

describe('AC-4504.2: 노란 글자는 진회색 위(머리표·띠 제목·체크 표시·줄 안 강조)에만, 노랑·흰 바탕 위 글자는 진회색', () => {
  const BAND = { top: 666, bottom: 938 }
  const inBand = (el: Element) => num(el, 'y') > BAND.top && num(el, 'y') < BAND.bottom

  it.each([1, 5, 6] as const)('AC-4504.2: 예시 %i — 노란 글자는 알약 글·띠 제목·✓뿐이고, 윗단(노랑·흰 상자) 글자는 진회색이다', (n) => {
    const content = example(n)
    const svg = draw(content)
    const list = texts(svg)
    const yellow = list.filter((t) => t.getAttribute('fill') === Y)
    const expected = [content.tag, ...(content.bandTitle ? [content.bandTitle] : []), ...(content.mark === 'check' ? content.lines.map(() => '✓') : [])]
    expect(yellow.map((t) => t.textContent).sort()).toEqual(expected.sort())
    for (const t of yellow) {
      if (t.textContent === content.tag) {
        // 머리표 글은 진회색 알약 안
        const pill = svg.children[4]!
        expect(pill.getAttribute('fill')).toBe(D)
        expect(num(t, 'y')).toBeGreaterThan(num(pill, 'y'))
        expect(num(t, 'y')).toBeLessThan(num(pill, 'y') + num(pill, 'height'))
      } else expect(inBand(t), t.textContent ?? '').toBe(true)
    }
    // 윗단(0~666)의 알약 밖 글자: 작은 제목·큰 문구·흰 상자 글은 진회색
    const top = list.filter((t) => num(t, 'y') < BAND.top && t.textContent !== content.tag)
    expect(top.length).toBeGreaterThanOrEqual(4)
    for (const t of top) expect(t.getAttribute('fill'), t.textContent ?? '').toBe(D)
    // 흰 로고 칸(954~)에는 글자가 없다
    expect(list.filter((t) => num(t, 'y') >= 954)).toEqual([])
  })

  it('AC-4504.2: 띠 안 글자는 노랑(띠 제목·✓·강조)·흰색(줄)·#d6d6d6(아래 작은 글)이고, 번호 숫자는 노랑 원 위 진회색이다', () => {
    for (const n of [1, 5]) {
      const svg = draw(example(n))
      const band = texts(svg).filter(inBand)
      for (const t of band) {
        const fill = t.getAttribute('fill')
        if (fill === D) {
          // 진회색 글은 번호 숫자뿐 — 같은 가운데의 노랑 원 위
          const circle = all(svg, 'circle').find((c) => c.getAttribute('cy') === t.getAttribute('y') && c.getAttribute('cx') === t.getAttribute('x'))
          expect(circle?.getAttribute('fill'), t.textContent ?? '').toBe(Y)
          expect(t.textContent).toMatch(/^[1-4]$/)
        } else expect([Y, W, NOTE], t.textContent ?? '').toContain(fill)
      }
      cleanup()
    }
  })

  it('AC-4504.2: 줄 안 강조(노란 tspan)는 띠 안의 흰 줄 글 안에만 있다', () => {
    const svg = draw(example(6))
    const spans = all(svg, 'tspan').filter((s) => s.getAttribute('fill') === Y)
    expect(spans).toHaveLength(3)
    for (const span of spans) {
      const parent = span.parentElement!
      expect(parent.localName).toBe('text')
      expect(parent.getAttribute('fill')).toBe(W)
      expect(inBand(parent)).toBe(true)
    }
  })
})

// ---------- AC-4504.3: 글꼴·굵기·강조·이스케이프 ----------

describe('AC-4504.3: 글꼴 PosterPretendard, 굵기 900(흰 상자 윗줄·아래 작은 글만 700), 강조 tspan, 글자 이스케이프', () => {
  it('AC-4504.3: 첫 자식 <style>은 휴진 안내 그림과 같은 @font-face 둘(PosterPretendard 700·900, /poster/fonts/…)이다', () => {
    const guide = draw(example(1)).firstElementChild
    expect(guide?.localName).toBe('style')
    const css = guide?.textContent ?? ''
    cleanup()
    const { container } = render(<Poster notice={{ year: 2027, month: 5, cards: [{ start: '2027-05-05', end: null, name: '어린이날', status: '휴진' }], theme: null }} theme="children" />)
    expect(css).toBe(container.querySelector('svg')?.firstElementChild?.textContent)
    const faces = [...css.matchAll(/@font-face\s*\{([^}]*)\}/g)].map((m) => m[1])
    expect(faces).toHaveLength(2)
    expect(faces[0]).toMatch(/font-family:\s*PosterPretendard;\s*font-weight:\s*700;\s*src:\s*url\(\/poster\/fonts\/Pretendard-Bold\.subset\.woff2\) format\('woff2'\)/)
    expect(faces[1]).toMatch(/font-family:\s*PosterPretendard;\s*font-weight:\s*900;\s*src:\s*url\(\/poster\/fonts\/Pretendard-Black\.subset\.woff2\) format\('woff2'\)/)
  })

  it('AC-4504.3: 모든 글은 PosterPretendard·dominant-baseline central이고, 700은 흰 상자 윗줄·아래 작은 글뿐, 나머지는 900이다', () => {
    for (const n of [1, 5, 6]) {
      const content = example(n)
      const svg = draw(content)
      const light = [content.boxTop, ...(content.note ? [`※ ${content.note}`] : [])]
      for (const t of texts(svg)) {
        expect(attrsOf(t), t.textContent ?? '').toMatchObject(TEXT_BASE)
        expect(t.getAttribute('font-weight'), t.textContent ?? '').toBe(light.includes(t.textContent ?? '') ? '700' : '900')
      }
      expect(texts(svg).filter((t) => t.getAttribute('font-weight') === '700').map((t) => t.textContent)).toEqual(light)
      cleanup()
    }
  })

  it('AC-4504.3: 자간은 작은 제목·큰 문구 두 줄에만(-0.03em) 있다', () => {
    const content = example(6)
    const spaced = texts(draw(content)).filter((t) => t.hasAttribute('letter-spacing'))
    expect(spaced.map((t) => t.textContent)).toEqual([content.subtitle, content.big1, content.big2])
  })

  it('AC-4504.3: 줄 안 강조 낱말은 그 줄 <text> 안의 노란 <tspan> 하나이고, 줄 글은 그대로 이어진다(예시 6)', () => {
    const content = example(6)
    const svg = draw(content)
    for (const line of content.lines) {
      const t = textOf(svg, line.text)
      const yellow = all(t, 'tspan').filter((s) => s.getAttribute('fill') === Y)
      expect(yellow, line.text).toHaveLength(1)
      expect(yellow[0]!.textContent).toBe(line.em)
      // 강조 밖 조각은 색·속성 없이 줄 글 색을 따른다
      for (const s of all(t, 'tspan').filter((x) => x !== yellow[0])) expect(attrsOf(s)).toEqual({})
      expect(all(t, 'tspan').every((s) => s.children.length === 0)).toBe(true)
    }
  })

  it('AC-4504.3: 강조가 없으면 tspan이 없고, 강조가 줄 앞·끝·전체여도 노란 tspan 하나다(첫 번째 같은 글)', () => {
    const cases: [GuideLine, string[]][] = [
      [L('진단서'), []],
      [L('진단서 원본', '진단서'), [Y, '']],
      [L('원본 진단서', '진단서'), ['', Y]],
      [L('진단서', '진단서'), [Y]],
      [L('서류 서류', '서류'), [Y, '']],
    ]
    for (const [line, fills] of cases) {
      const svg = draw(withEx1({ lines: [line] }))
      const t = textOf(svg, line.text)
      expect(all(t, 'tspan').map((s) => s.getAttribute('fill') ?? ''), line.text).toEqual(fills)
      cleanup()
    }
  })

  it('AC-4504.3: 줄에 없는 강조는 그리지 않는다(노란 tspan 없음)', () => {
    const svg = draw(withEx1({ lines: [L('진단서', '영수증')] }))
    expect(all(textOf(svg, '진단서'), 'tspan')).toHaveLength(0)
  })

  it('AC-4504.3: 글자는 글자로만 그린다 — 꺾쇠·&가 요소가 되지 않는다(머리표·줄·강조)', () => {
    const svg = draw(withEx1({ tag: '<b>서류</b>&', lines: [L('<script>a</script> 진단서', '<script>')] }))
    expect(all(svg, 'b')).toHaveLength(0)
    expect(all(svg, 'script')).toHaveLength(0)
    textOf(svg, '<b>서류</b>&')
    const line = textOf(svg, '<script>a</script> 진단서')
    expect(all(line, 'tspan').filter((s) => s.getAttribute('fill') === Y).map((s) => s.textContent)).toEqual(['<script>'])
    expect(svg.getAttribute('aria-label')).toBe('<b>서류</b>&: 보험사에 낼 서류는 수납할 때 말씀해 주세요')
  })
})

// ---------- AC-4504.4: 그림 16개 ----------

describe('AC-4504.4: 그림 16개 — x 566·y 468의 170×170, 흰 원 받침·그림자, 로고색 셋, 글자·그림·주소 없음', () => {
  const ICON_TAGS = ['circle', 'rect', 'path', 'g']

  it.each(PICTURE_IDS.map((id) => [id] as const))('AC-4504.4: %s — translate(566 468) 안 첫 둘은 그림자 원(90,91 r82 #000 18%)·흰 원(85,85 r80 진회색 5)이다', (id) => {
    const group = pictureGroup(draw(withEx1({ picture: id })))
    expect(attrsOf(group)).toEqual({ transform: 'translate(566 468)' })
    const [shadow, base, ...icon] = [...group.children]
    expect(attrsOf(shadow!)).toEqual({ cx: '90', cy: '91', r: '82', fill: SHADOW, 'fill-opacity': '.18' })
    expect(attrsOf(base!)).toEqual({ cx: '85', cy: '85', r: '80', fill: W, stroke: D, 'stroke-width': '5' })
    expect(icon.length).toBeGreaterThan(0)
  })

  it.each(PICTURE_IDS.map((id) => [id] as const))('AC-4504.4: %s — 그림은 로고색 셋(과 none)만 쓰고 <text>·<image>·주소가 없다', (id) => {
    const group = pictureGroup(draw(withEx1({ picture: id })))
    const inside = all(group, '*').slice(2) // 받침 둘 뒤
    for (const el of all(group, '*')) {
      expect(ICON_TAGS, `${id} ${el.localName}`).toContain(el.localName)
      for (const a of [...el.attributes]) {
        expect(a.name, id).not.toMatch(/href$/)
        expect(a.value, `${id} ${a.name}`).not.toMatch(/url\(|https?:|\/poster\/|javascript:/i)
      }
    }
    for (const el of inside) {
      for (const name of ['fill', 'stroke']) {
        const value = el.getAttribute(name)
        if (value !== null) expect([Y, D, W, 'none'], `${id} ${el.localName} ${name}`).toContain(value)
      }
    }
    expect(all(group, 'text')).toHaveLength(0)
    expect(all(group, 'image')).toHaveLength(0)
  })

  it.each(PICTURE_IDS.map((id) => [id] as const))('AC-4504.4: %s — 받침과 그림 도형은 승인 시안 iconSvg()와 요소·속성이 같다', (id) => {
    const app = pictureFragment(<GuidePicture id={id} />)
    const mockup = parseFragment(MOCKUP.iconSvg(id))
    expect(tree(app).kids).toEqual(tree(mockup).kids)
  })

  it('AC-4504.4: 그림 16개는 모두 다르다', () => {
    const inner = PICTURE_IDS.map((id) => {
      const svg = pictureFragment(<GuidePicture id={id} />)
      const html = svg.innerHTML
      cleanup()
      return html
    })
    expect(new Set(inner).size).toBe(16)
  })

  it('AC-4504.4: 그림이 null이면 그 자리에 아무것도 없다(그림 <g>·원이 없다)', () => {
    const svg = draw(withEx1({ picture: null }))
    expect(pictureGroups(svg)).toHaveLength(0)
    expect(all(svg, 'circle')).toHaveLength(0)
  })
})

// ---------- AC-4504.6: AI 그림 ----------

describe('AC-4504.6: AI 그림(custom) — 같은 받침 위에 도형만, 색 이름은 로고색으로, 받침 원 안으로 자름', () => {
  const PAINT = (fill: string, stroke: string, width: string) => ({ fill, stroke, 'stroke-width': width, 'stroke-linecap': 'round', 'stroke-linejoin': 'round' })

  it('AC-4504.6: 휠체어 그림 — translate(566 468) 안에 그림자 원·흰 원·clipPath·<g clip-path> 차례이고, 도형은 받은 차례대로 요소 하나씩이다', () => {
    const group = pictureGroup(draw(drawn()))
    expect(attrsOf(group)).toEqual({ transform: 'translate(566 468)' })
    expect(names(group)).toEqual(['circle', 'circle', 'clipPath', 'g'])
    const [shadow, base, clip, shapes] = [...group.children] as Element[]
    expect(attrsOf(shadow!)).toEqual({ cx: '90', cy: '91', r: '82', fill: SHADOW, 'fill-opacity': '.18' })
    expect(attrsOf(base!)).toEqual({ cx: '85', cy: '85', r: '80', fill: W, stroke: D, 'stroke-width': '5' })
    expect(names(clip!)).toEqual(['circle'])
    expect(attrsOf(clip!.children[0]!)).toEqual({ cx: '85', cy: '85', r: '77.5' })
    const id = clip!.getAttribute('id') ?? ''
    expect(Object.keys(attrsOf(clip!))).toEqual(['id'])
    expect(id).toMatch(/^[A-Za-z0-9-]+$/)
    expect(attrsOf(shapes!)).toEqual({ 'clip-path': `url(#${id})` })
    expect(names(shapes!)).toEqual(WHEELCHAIR.shapes.map((s) => s.kind))
  })

  it.each([
    ['circle', SH('circle', [85, 90, 40], 'yellow', 'dark', 7), { cx: '85', cy: '90', r: '40' }],
    ['ellipse', SH('ellipse', [85, 100, 40, 20], 'white', 'dark', 6), { cx: '85', cy: '100', rx: '40', ry: '20' }],
    ['rect', SH('rect', [40, 50, 90, 70, 10], 'yellow', 'dark', 8), { x: '40', y: '50', width: '90', height: '70', rx: '10' }],
    ['line', SH('line', [50, 50, 120, 120], 'none', 'dark', 9), { x1: '50', y1: '50', x2: '120', y2: '120' }],
    ['path', SH('path', [], 'yellow', 'dark', 6, 'M50 120 Q85 40 120 120 Z'), { d: 'M50 120 Q85 40 120 120 Z' }],
  ] as const)('AC-4504.6: %s 도형은 그 요소 하나이고 속성은 정한 것뿐이다(선 끝·꺾임 round)', (kind, shape, geometry) => {
    const group = pictureGroup(draw(drawn({ subject: '공', shapes: [shape] })))
    const g = group.children[3]!
    expect(names(g)).toEqual([kind])
    expect(attrsOf(g.children[0]!)).toEqual({ ...geometry, ...PAINT(shape.fill === 'none' ? 'none' : shape.fill === 'yellow' ? Y : W, D, String(shape.width)) })
  })

  it('AC-4504.6: 색 이름은 yellow→#E6E006 · dark→#2e2e2e · white→#fff · none→none으로만 바뀐다(채움·테두리 모두)', () => {
    const VALUE = { yellow: Y, dark: D, white: W, none: 'none' } as const
    const pairs = DRAW_COLORS.flatMap((fill) => DRAW_COLORS.map((stroke) => [fill, stroke] as const))
    const shapes = pairs.map(([fill, stroke], i) => SH('circle', [10 + i * 9, 85, 4], fill, stroke, 3))
    const g = pictureGroup(draw(drawn({ subject: '색', shapes }))).children[3]!
    expect([...g.children].map((el) => [el.getAttribute('fill'), el.getAttribute('stroke')])).toEqual(pairs.map(([f, s]) => [VALUE[f], VALUE[s]]))
  })

  it('AC-4504.6: 그리기 전에 checkDrawing을 거친다 — 수는 소수 한 자리로 반올림한 값을 그린다', () => {
    const g = pictureGroup(draw(drawn({ subject: '공', shapes: [SH('circle', [85.04, 84.96, 50.55], 'yellow', 'dark', 7.07)] }))).children[3]!
    expect(attrsOf(g.children[0]!)).toMatchObject({ cx: '85', cy: '85', r: '50.6', 'stroke-width': '7.1' })
  })

  it.each([
    ['정해 두지 않은 kind', { subject: '공', shapes: [{ ...SH('circle', [85, 85, 40], 'yellow', 'dark', 6), kind: 'text' }] }],
    ['색 이름 밖(red)', { subject: '공', shapes: [{ ...SH('circle', [85, 85, 40], 'yellow', 'dark', 6), fill: 'red' }] }],
    ['16진수 색', { subject: '공', shapes: [{ ...SH('circle', [85, 85, 40], 'yellow', 'dark', 6), stroke: '#f00' }] }],
    ['path에 꺾쇠·따옴표', { subject: '공', shapes: [SH('path', [], 'none', 'dark', 6, 'M0 0"/><script>alert(1)</script>')] }],
    ['path에 url(', { subject: '공', shapes: [SH('path', [], 'none', 'dark', 6, 'M0 0 url(#x)')] }],
    ['열쇠 하나 더(onclick)', { subject: '공', shapes: [{ ...SH('circle', [85, 85, 40], 'yellow', 'dark', 6), onclick: 'x' }] }],
    ['170 넘는 수', { subject: '공', shapes: [SH('circle', [85, 85, 171], 'yellow', 'dark', 6)] }],
    ['도형 41개', { subject: '공', shapes: Array.from({ length: 41 }, () => SH('circle', [85, 85, 4], 'yellow', 'dark', 2)) }],
    ['도형 0개', { subject: '공', shapes: [] }],
    ['그릴 것이 빈 글', { subject: ' ', shapes: [SH('circle', [85, 85, 40], 'yellow', 'dark', 6)] }],
    ['그릴 것에 전화 모양', { subject: '010-1234-5678', shapes: [SH('circle', [85, 85, 40], 'yellow', 'dark', 6)] }],
  ])('AC-4504.6: 검사를 못 넘는 그림(%s)은 받침(그림자 원·흰 원)만 그린다', (_, drawing) => {
    const svg = draw(drawn(drawing as unknown as GuideDrawing))
    const group = pictureGroup(svg)
    expect(names(group)).toEqual(['circle', 'circle'])
    expect(all(svg, 'clipPath')).toHaveLength(0)
    expect(all(svg, 'script')).toHaveLength(0)
    expect(new XMLSerializer().serializeToString(svg)).not.toMatch(/alert|onclick|url\(#x\)/)
  })

  it("AC-4504.6: 그림이 'custom'인데 drawing이 null이면 그림이 없고, 16개 그림이나 null이면 drawing이 있어도 그리지 않는다", () => {
    expect(pictureGroups(draw(withEx1({ picture: 'custom', drawing: null })))).toHaveLength(0)
    cleanup()
    const doc = draw(withEx1({ picture: 'document', drawing: structuredClone(WHEELCHAIR) }))
    expect(all(doc, 'clipPath')).toHaveLength(0)
    const withDrawing = appTree(doc)
    cleanup()
    expect(withDrawing).toEqual(appTree(draw(withEx1({ picture: 'document' }))))
    cleanup()
    expect(pictureGroups(draw(withEx1({ picture: null, drawing: structuredClone(WHEELCHAIR) })))).toHaveLength(0)
  })

  it('AC-4504.6: 안내문 두 장을 한 화면에 그려도 clipPath 이름이 겹치지 않고, 저마다 제 이름을 가리킨다(미리보기·인쇄 사본)', () => {
    const { container } = render(
      <>
        <GuidePoster content={drawn()} />
        <GuidePoster content={drawn()} />
      </>,
    )
    const ids = all(container, 'clipPath').map((c) => c.getAttribute('id'))
    expect(ids).toHaveLength(2)
    expect(new Set(ids).size).toBe(2)
    const refs = all(container, 'g').map((g) => g.getAttribute('clip-path')).filter((v) => v !== null)
    expect(refs).toEqual(ids.map((id) => `url(#${id})`))
  })

  it('AC-4504.6: 시안 손 그림 셋(휠체어·우산·계단)은 승인 시안 drawingSvg()와 요소·속성이 같다', () => {
    expect(Object.keys(MOCKUP.DRAWINGS)).toEqual(['휠체어', '우산', '계단'])
    for (const drawing of Object.values(MOCKUP.DRAWINGS)) {
      const app = pictureFragment(<GuideDrawingPicture drawing={structuredClone(drawing)} />)
      expect(tree(app).kids, drawing.subject).toEqual(tree(parseFragment(MOCKUP.drawingSvg(drawing, 'x'))).kids)
      cleanup()
    }
  })
})

// ---------- AC-4504.5: 로고·읽는 이름·병원 정보 ----------

describe('AC-4504.5: 로고 image 하나, 읽는 이름, 병원 정보 글자 없음', () => {
  it('AC-4504.5: 마지막 자식은 /poster/logo.png를 197,1005에 400×68로 그린 image 하나이고, image는 그것뿐이다', () => {
    for (const content of [example(1), example(5), drawn(), withEx1({ picture: null })]) {
      const svg = draw(content)
      const logo = svg.lastElementChild!
      expect(logo.localName).toBe('image')
      expect(attrsOf(logo)).toEqual({ href: '/poster/logo.png', x: '197', y: '1005', width: '400', height: '68' })
      expect(all(svg, 'image')).toHaveLength(1)
      cleanup()
    }
  })

  it('AC-4504.5: aria-label은 "머리표: 작은 제목 큰 문구 윗줄 큰 문구 아랫줄"이다', () => {
    expect(draw(example(1)).getAttribute('aria-label')).toBe('보험 서류 안내: 보험사에 낼 서류는 수납할 때 말씀해 주세요')
    cleanup()
    expect(draw(example(6)).getAttribute('aria-label')).toBe('도수치료 안내: 도수치료 관리급여 적용 1회 비용 43,850원')
  })

  it('AC-4504.5: 병원 이름·전화·주소 글자가 없다 — 글자는 안내문 칸에서 온 것뿐이다', () => {
    const content = example(1)
    const svg = draw(content)
    expect(texts(svg).map((t) => t.textContent)).toEqual([
      content.tag, content.subtitle, content.big1, content.big2, content.boxTop, content.boxBottom, content.bandTitle,
      ...content.lines.flatMap((l) => ['✓', l.text]),
      `※ ${content.note}`,
    ])
    const words = texts(svg).map((t) => t.textContent).join(' ')
    for (const word of ['의원', '병원', '전화', '주소', '원장', 'Tel', 'TEL']) expect(words, word).not.toContain(word)
    expect(words).not.toMatch(/\d{2,4}-\d{3,4}-\d{4}/)
  })
})

// ---------- 병원 정보 로고·안내문 색 (spec clinic-profile REQ-6604, design.md 6절) ----------

const LOGO_URL = `data:image/png;base64,iVBORw0KGgo${'B'.repeat(24)}`
type DrawProps = { logo?: PosterLogo | null; logoColors?: GuideColors | null }
function drawWith(content: GuideValue, props: DrawProps = {}) {
  const { container } = render(<GuidePoster content={content} {...props} />)
  const svg = container.querySelector('svg')
  if (!svg) throw new Error('svg가 없다')
  return svg
}
// 그릴 때마다 달라지는 자르는 원 이름을 하나로 맞춘 SVG 글
const plainSvg = (svg: Element) => svg.outerHTML.replace(/guide-draw-[A-Za-z0-9-]+/g, 'guide-draw-ID')
// 지금 색(노랑·진회색) 그림에서 두 색만 바꾼 글
const recolored = (html: string, colors: GuideColors) => html.split(Y).join(colors.main).split(D).join(colors.dark)

describe('AC-6604.1·AC-6604.2: 환자 안내문 로고 자리 — 병원 정보 로고 그림 또는 병원 이름 글자', () => {
  it('AC-6604.1: 로고가 그림이면 마지막 자식은 그 data: 주소를 로고 상자(197,1005 · 400×68)에 비율을 지켜(xMidYMid meet) 그린 image 하나다', () => {
    for (const content of [example(1), example(5), drawn()]) {
      const svg = drawWith(content, { logo: { kind: 'image', href: LOGO_URL } })
      const logo = svg.lastElementChild!
      expect(logo.localName).toBe('image')
      expect(attrsOf(logo)).toEqual({ href: LOGO_URL, x: '197', y: '1005', width: '400', height: '68', preserveAspectRatio: 'xMidYMid meet' })
      expect(all(svg, 'image')).toHaveLength(1)
      expect(svg.outerHTML).not.toContain('/poster/logo.png')
      cleanup()
    }
  })

  it('AC-6604.1: 로고가 없으면 마지막 자식은 흰 로고 칸 가운데(397, 1039)의 병원 이름 — 900·띠 색(진회색)·상자 폭에 맞춘 크기', () => {
    const name = '서승관정형외과의원'
    const svg = drawWith(example(1), { logo: { kind: 'text', text: name } })
    const logo = svg.lastElementChild!
    expect(logo.localName).toBe('text')
    expect(logo.textContent).toBe(name)
    expect(attrsOf(logo)).toMatchObject({ ...TEXT_BASE, x: '397', y: '1039', 'font-weight': '900', fill: D, 'text-anchor': 'middle' })
    expect(num(logo, 'font-size')).toBe(logoTextFit(name, GUIDE_LOGO).size)
    expect(num(logo, 'font-size')).toBeLessThanOrEqual(68 * 0.8)
    expect(all(svg, 'image')).toHaveLength(0)
    expect(svg.outerHTML).not.toContain('/poster/logo.png')
  })

  it('AC-6604.1: 병원 이름 글자는 고른 띠 색으로 칠한다', () => {
    const colors = { main: '#9fc3ff', dark: '#1b2740' }
    const logo = drawWith({ ...example(1), colors }, { logo: { kind: 'text', text: '서승관의원' } }).lastElementChild!
    expect(logo.getAttribute('fill')).toBe(colors.dark)
  })

  it('AC-6604.2: 로고를 읽는 중(null)이면 로고 자리를 비운다(image도 이름 글자도 없다)', () => {
    const content = example(1)
    const svg = drawWith(content, { logo: null })
    expect(all(svg, 'image')).toHaveLength(0)
    expect(svg.lastElementChild?.localName).toBe('text')
    expect(svg.lastElementChild?.textContent).toBe(`※ ${content.note}`)
  })

  it('AC-6604.1: 로고 말고는 옛 그림과 글자 하나까지 같다', () => {
    const base = plainSvg(drawWith(example(1), { logo: null }))
    expect(plainSvg(drawWith(example(1))).replace(/<image href="\/poster\/logo\.png"[^>]*><\/image>/, '')).toBe(base)
    cleanup()
    expect(plainSvg(drawWith(example(1), { logo: { kind: 'image', href: LOGO_URL } })).replace(/<image href="data:[^>]*><\/image>/, '')).toBe(base)
  })
})

describe('AC-6703.2·AC-6703.3·AC-6703.5: 환자 안내문 로고 자리 크게 (spec logo-fit design.md 4·5절)', () => {
  const sized = (width: number, height: number): PosterLogo => ({ kind: 'image', href: LOGO_URL, width, height })
  const boxOf = (el: Element) => ({ x: num(el, 'x'), y: num(el, 'y'), width: num(el, 'width'), height: num(el, 'height') })

  it('AC-6703.2: 크기를 아는 가로형 1033×175는 x 197·y 1005.1·400×67.8에 비율을 지켜(xMidYMid meet) 그린다', () => {
    for (const content of [example(1), example(5), drawn()]) {
      const svg = drawWith(content, { logo: sized(1033, 175) })
      const logo = svg.lastElementChild!
      expect(logo.localName).toBe('image')
      expect(attrsOf(logo)).toEqual({ href: LOGO_URL, x: '197', y: '1005.1', width: '400', height: '67.8', preserveAspectRatio: 'xMidYMid meet' })
      expect(all(svg, 'image')).toHaveLength(1)
      cleanup()
    }
  })

  it('AC-6703.2: 세로로 긴 쪽 로고(1080×501)·정사각 로고는 400×110 자리(197, 984) 안 가장 크게, 가운데 397·1039에 그린다', () => {
    for (const [w, h] of [[1080, 501], [64, 64], [300, 900]] as const) {
      const logo = drawWith(example(1), { logo: sized(w, h) }).lastElementChild!
      const r = logoRect(GUIDE_LOGO_AREA, { width: w, height: h })
      expect(boxOf(logo), `${w}×${h}`).toEqual(r)
      expect(r.height, `${w}×${h}`).toBe(110)
      expect(r.x + r.width / 2, `${w}×${h}`).toBeCloseTo(397, 0)
      expect(logo.getAttribute('preserveAspectRatio')).toBe('xMidYMid meet')
      cleanup()
    }
    expect(boxOf(drawWith(example(1), { logo: sized(1080, 501) }).lastElementChild!)).toEqual({ x: 278.4, y: 984, width: 237.1, height: 110 })
  })

  it('AC-6703.3: 크기를 모르는 로고 값(크기 없음·0·음수·NaN·무한·한쪽만)은 원래 로고 상자(197,1005 · 400×68) 전체에 그린다', () => {
    const bad: PosterLogo[] = [
      { kind: 'image', href: LOGO_URL },
      sized(0, 175),
      sized(1033, -1),
      sized(Number.NaN, 175),
      sized(Number.POSITIVE_INFINITY, 175),
      { kind: 'image', href: LOGO_URL, width: 1033 },
      { kind: 'image', href: LOGO_URL, width: '1033', height: '175' } as unknown as PosterLogo,
    ]
    for (const logo of bad) {
      const last = drawWith(example(1), { logo }).lastElementChild!
      expect(attrsOf(last), JSON.stringify(logo)).toEqual({ href: LOGO_URL, x: '197', y: '1005', width: '400', height: '68', preserveAspectRatio: 'xMidYMid meet' })
      cleanup()
    }
  })

  it('AC-6703.5: 로고 그림이 없으면 병원 이름 글자는 원래 상자(400×68) 기준 크기·자리(397, 1039)다', () => {
    const name = '서승관정형외과의원'
    const logo = drawWith(example(1), { logo: { kind: 'text', text: name } }).lastElementChild!
    expect(attrsOf(logo)).toMatchObject({ x: '397', y: '1039' })
    expect(num(logo, 'font-size')).toBe(logoTextFit(name, GUIDE_LOGO).size)
    cleanup()
    const long = drawWith(example(1), { logo: { kind: 'text', text: '가'.repeat(50) } }).lastElementChild!
    expect(attrsOf(long)).toMatchObject({ textLength: '400', lengthAdjust: 'spacingAndGlyphs' })
  })

  it('AC-6703.2: 로고 말고는 옛 그림과 글자 하나까지 같다(흰 띠·글자 배치 그대로)', () => {
    const base = plainSvg(drawWith(example(1), { logo: null }))
    expect(plainSvg(drawWith(example(1), { logo: sized(1080, 501) })).replace(/<image href="data:[^>]*><\/image>/, '')).toBe(base)
  })
})

describe('AC-6604.5·AC-6604.6: 안내문 색 — 직접 고른 색 > 로고 색 > 지금 색', () => {
  const OWN: GuideColors = { main: '#9fc3ff', dark: '#1b2740' }
  const FROM_LOGO: GuideColors = { main: '#f2b8c6', dark: '#3a1520' }

  it('AC-6604.5: guidePalette — 직접 고른 색이 있으면 그것, 없으면 로고 색, 둘 다 없으면 지금 색(노랑·진회색)이고 흰색·옅은 회색·그림자는 그대로다', () => {
    const rest = { white: W, note: NOTE, shadow: SHADOW }
    expect(guidePalette(OWN, FROM_LOGO)).toEqual({ yellow: OWN.main, dark: OWN.dark, ...rest })
    expect(guidePalette(null, FROM_LOGO)).toEqual({ yellow: FROM_LOGO.main, dark: FROM_LOGO.dark, ...rest })
    expect(guidePalette(null, null)).toEqual({ yellow: Y, dark: D, ...rest })
    expect(GUIDE_COLORS).toEqual({ yellow: Y, dark: D, ...rest })
  })

  it('AC-6604.6: AI 그림 색 이름은 고른 두 색으로 바뀐다(drawColorValues), 지금 표 DRAW_COLOR_VALUES는 지금 색이다', () => {
    expect(drawColorValues(guidePalette(OWN, null))).toEqual({ yellow: OWN.main, dark: OWN.dark, white: W, none: 'none' })
    expect(DRAW_COLOR_VALUES).toEqual({ yellow: Y, dark: D, white: W, none: 'none' })
  })

  it.each(EXAMPLES.map((_, i) => [i + 1] as const))('AC-6604.5: 예시 %i — 직접 고른 색이면 그림은 노랑→바탕색·진회색→띠 색만 바뀌고 나머지는 글자 하나까지 같다', (n) => {
    const now = plainSvg(drawWith(example(n)))
    cleanup()
    const own = plainSvg(drawWith({ ...example(n), colors: OWN }))
    expect(own).toBe(recolored(now, OWN))
    expect(own).not.toContain(Y)
    expect(own).not.toContain(D)
  })

  it('AC-6604.6: 미리 그린 그림 16개와 AI 그림도 같은 두 색으로 칠한다(노랑·진회색이 남지 않는다)', () => {
    for (const content of [...PICTURE_IDS.map((picture) => withEx1({ picture })), drawn()]) {
      const now = plainSvg(drawWith(content))
      cleanup()
      const svg = drawWith({ ...content, colors: OWN })
      const own = plainSvg(svg)
      expect(own, String(content.picture)).toBe(recolored(now, OWN))
      const group = pictureGroup(svg)
      const paints = [...group.querySelectorAll('*')].flatMap((el) => ['fill', 'stroke'].map((name) => el.getAttribute(name)).filter((v): v is string => v !== null))
      expect(paints, String(content.picture)).toContain(OWN.main)
      expect(paints, String(content.picture)).toContain(OWN.dark)
      for (const paint of paints) expect([OWN.main, OWN.dark, W, SHADOW, 'none'], String(content.picture)).toContain(paint)
      cleanup()
    }
  })

  it('AC-6604.5: [자동](색 없음)이고 로고 색이 있으면 로고 색으로 그린다', () => {
    const now = plainSvg(drawWith(example(1)))
    cleanup()
    expect(plainSvg(drawWith(example(1), { logoColors: FROM_LOGO }))).toBe(recolored(now, FROM_LOGO))
  })

  it('AC-6604.5: 직접 고른 색이 로고 색보다 먼저다', () => {
    const now = plainSvg(drawWith(example(1)))
    cleanup()
    expect(plainSvg(drawWith({ ...example(1), colors: OWN }, { logoColors: FROM_LOGO }))).toBe(recolored(now, OWN))
  })

  it('AC-6604.5: 색을 저장하지 않은 안내문(colors 없음·null)·로고 색 없음이면 지금 색 그대로다(시안과 같다)', () => {
    const now = plainSvg(drawWith(example(1)))
    cleanup()
    expect(plainSvg(drawWith({ ...example(1), colors: null }, { logoColors: null }))).toBe(now)
  })

  it('AC-6604.5: 받침 그림자 원·흰 원은 그대로(그림자 #000 18%·흰색), 테두리만 띠 색이다', () => {
    const group = pictureGroup(drawWith({ ...withEx1({ picture: 'knee' }), colors: OWN }))
    const [shadow, base] = [...group.children]
    expect(attrsOf(shadow!)).toEqual({ cx: '90', cy: '91', r: '82', fill: SHADOW, 'fill-opacity': '.18' })
    expect(attrsOf(base!)).toEqual({ cx: '85', cy: '85', r: '80', fill: W, stroke: OWN.dark, 'stroke-width': '5' })
  })
})

// ---------- 글씨·로고 크기·색 (spec form-style REQ-6803·REQ-6804·REQ-6805, design.md 6절, TASK-4) ----------

const styleOf = (patch: Partial<FormStyle>): FormStyle => ({ ...DEFAULT_STYLE, ...patch })
const styledGuide = (content: GuideContent, patch: Partial<FormStyle>): GuideValue => ({ ...content, style: styleOf(patch) })
// 그릴 때마다 달라지는 자르는 원·로고 칠 이름을 하나로 맞춘 SVG 글
const plainStyled = (svg: Element) => plainSvg(svg).replace(/logo-tint-[\w-]+/g, 'logo-tint-ID')
const htmlOfGuide = (content: GuideValue, props: DrawProps = {}) => {
  const html = plainStyled(drawWith(content, props))
  cleanup()
  return html
}
const countOf = (html: string, part: string) => html.split(part).length - 1
const TITLE_C = '#7c3aed'
const BODY_C = '#0d9488'
const LOGO_C = '#dc2626'

describe('AC-6804.3·AC-6804.4: 환자 안내문 글씨 크기대로 그리기', () => {
  it('AC-6804.3: 제목 80·130%면 큰 문구 두 줄은 layoutGuide(style)의 크기이고 작은 제목·머리표는 그대로다', () => {
    for (const n of [1, 6]) {
      for (const titleScale of [80, 130]) {
        const content = styledGuide(example(n), { titleScale })
        const svg = drawWith(content)
        const g = layoutGuide(content)
        for (const at of g.big) expect(textOf(svg, at.text).getAttribute('font-size'), `예시 ${n} ${titleScale}%`).toBe(String(at.size))
        expect(textOf(svg, content.subtitle).getAttribute('font-size')).toBe(String(layoutGuide(example(n)).subtitle.size))
        cleanup()
      }
    }
    const svg = drawWith(styledGuide(example(6), { titleScale: 130 }))
    expect(textOf(svg, '1회 비용').getAttribute('font-size')).toBe('88')
    expect(textOf(svg, '43,850원').getAttribute('font-size')).toBe('153')
  })

  it('AC-6804.4: 본문 130%면 줄 글·체크 표시 크기는 layoutGuide(style)대로(예시 4: 글 44·✓ 46)다', () => {
    const content = styledGuide(example(4), { bodyScale: 130 })
    const svg = drawWith(content)
    for (const line of content.lines) expect(textOf(svg, line.text).getAttribute('font-size'), line.text).toBe('44')
    const checks = texts(svg).filter((t) => t.textContent === '✓')
    expect(checks.map((t) => t.getAttribute('font-size'))).toEqual(['46', '46'])
    const g = layoutGuide(content)
    expect(checks.map((t) => num(t, 'x'))).toEqual(g.rows.map((r) => r.markX))
    for (const r of g.rows) expect(num(textOf(svg, r.text.text), 'x')).toBeCloseTo(r.text.x, 6)
  })

  it('AC-6804.4: 번호 표시면 줄 글만 커지고 번호 원·숫자 크기는 그대로다(예시 5, 130% → 46)', () => {
    const svg = drawWith(styledGuide(example(5), { bodyScale: 130 }))
    for (const line of example(5).lines) expect(textOf(svg, line.text).getAttribute('font-size'), line.text).toBe('46')
    // 번호 원은 뿌리 바로 아래 circle(그림 자리 <g> 안의 원은 빼고 센다)
    expect([...svg.children].filter((el) => el.localName === 'circle').map((c) => c.getAttribute('r'))).toEqual(['24.5', '24.5', '24.5'])
    for (const d of ['1', '2', '3']) expect(textOf(svg, d).getAttribute('font-size')).toBe('31')
  })
})

describe('AC-6805.2·AC-6803.4: 환자 안내문 글씨 색', () => {
  it.each(EXAMPLES.map((_, i) => [i + 1] as const))('AC-6805.2: 예시 %i — 제목 색 c면 큰 문구 두 줄만 c이고 작은 제목 등 나머지는 글자 하나까지 같다', (n) => {
    const now = htmlOfGuide(example(n))
    const picked = htmlOfGuide(styledGuide(example(n), { titleColor: TITLE_C }))
    expect(countOf(picked, TITLE_C)).toBe(2)
    expect(picked.split(TITLE_C).join(D)).toBe(now)
    const svg = drawWith(styledGuide(example(n), { titleColor: TITLE_C }))
    expect(textOf(svg, example(n).big1).getAttribute('fill')).toBe(TITLE_C)
    expect(textOf(svg, example(n).big2).getAttribute('fill')).toBe(TITLE_C)
    expect(textOf(svg, example(n).subtitle).getAttribute('fill')).toBe(D)
  })

  it.each(EXAMPLES.map((_, i) => [i + 1] as const))('AC-6805.2: 예시 %i — 본문 색 c면 띠 줄 글만 c이고 강조 낱말·체크·번호 표시는 지금 색 그대로다', (n) => {
    const content = example(n)
    const now = htmlOfGuide(content)
    const picked = htmlOfGuide(styledGuide(content, { bodyColor: BODY_C }))
    expect(countOf(picked, BODY_C)).toBe(content.lines.length)
    expect(picked.split(BODY_C).join(W)).toBe(now)
  })

  it('AC-6805.2: 강조 낱말 tspan은 노랑 그대로, 그 줄 글 색만 c다(예시 6)', () => {
    const svg = drawWith(styledGuide(example(6), { bodyColor: BODY_C }))
    const spans = all(svg, 'tspan').filter((s) => s.getAttribute('fill') === Y)
    expect(spans).toHaveLength(3)
    for (const span of spans) expect(span.parentElement!.getAttribute('fill')).toBe(BODY_C)
    expect(texts(svg).filter((t) => t.textContent === '✓').map((t) => t.getAttribute('fill'))).toEqual([Y, Y, Y])
  })

  it('AC-6803.4: 색이 null이면 제목은 띠 색(로고 색이 있으면 로고 dark), 줄 글은 흰색이다', () => {
    const FROM_LOGO: GuideColors = { main: '#f2b8c6', dark: '#3a1520' }
    const svg = drawWith(styledGuide(example(1), { titleScale: 120, bodyScale: 90 }), { logoColors: FROM_LOGO })
    expect(textOf(svg, example(1).big1).getAttribute('fill')).toBe(FROM_LOGO.dark)
    for (const line of example(1).lines) expect(textOf(svg, line.text).getAttribute('fill')).toBe(W)
  })

  it('AC-6805.2: 고른 제목·본문 색은 직접 고른 두 색·로고 색보다 먼저다', () => {
    const svg = drawWith({ ...styledGuide(example(1), { titleColor: TITLE_C, bodyColor: BODY_C }), colors: { main: '#9fc3ff', dark: '#1b2740' } }, { logoColors: { main: '#f2b8c6', dark: '#3a1520' } })
    expect(textOf(svg, example(1).big2).getAttribute('fill')).toBe(TITLE_C)
    expect(textOf(svg, example(1).lines[0]!.text).getAttribute('fill')).toBe(BODY_C)
    expect(textOf(svg, example(1).subtitle).getAttribute('fill')).toBe('#1b2740')
  })
})

describe('AC-6804.5·AC-6805.3: 환자 안내문 로고 크기·색', () => {
  const URL = `data:image/png;base64,iVBORw0KGgo${'G'.repeat(24)}`
  const boxOf = (el: Element) => ({ x: num(el, 'x'), y: num(el, 'y'), width: num(el, 'width'), height: num(el, 'height') })

  it('AC-6804.5: 크기를 아는 그림은 150%면 97, 988.2 · 600×101.7, 크기 모름은 원래 상자를 키워 97, 988 · 600×102다', () => {
    const known = drawWith(styledGuide(example(1), { logoScale: 150 }), { logo: { kind: 'image', href: URL, width: 1033, height: 175 } }).lastElementChild!
    expect(boxOf(known)).toEqual({ x: 97, y: 988.2, width: 600, height: 101.7 })
    expect(known.getAttribute('preserveAspectRatio')).toBe('xMidYMid meet')
    cleanup()
    const unknown = drawWith(styledGuide(example(1), { logoScale: 150 }), { logo: { kind: 'image', href: URL } }).lastElementChild!
    expect(boxOf(unknown)).toEqual({ x: 97, y: 988, width: 600, height: 102 })
    cleanup()
    for (const logoScale of [60, 90, 140]) {
      const el = drawWith(styledGuide(example(1), { logoScale }), { logo: { kind: 'image', href: URL, width: 1080, height: 501 } }).lastElementChild!
      expect(boxOf(el), `${logoScale}%`).toEqual(scaleLogoRect(logoRect(GUIDE_LOGO_AREA, { width: 1080, height: 501 }), logoScale, GUIDE_LOGO_MAX))
      cleanup()
    }
  })

  it('AC-6804.5: 이름 글자 로고는 150%면 81px(가운데 397·1039), 넘치면 W = 600으로 눌러 그린다', () => {
    const logo = drawWith(styledGuide(example(1), { logoScale: 150 }), { logo: { kind: 'text', text: '서승관' } }).lastElementChild!
    expect(attrsOf(logo)).toMatchObject({ x: '397', y: '1039', 'font-size': '81' })
    expect(num(logo, 'font-size')).toBe(logoTextFit('서승관', GUIDE_LOGO, 150, GUIDE_LOGO_MAX).size)
    cleanup()
    const long = drawWith(styledGuide(example(1), { logoScale: 150 }), { logo: { kind: 'text', text: '가'.repeat(50) } }).lastElementChild!
    expect(attrsOf(long)).toMatchObject({ textLength: '600', lengthAdjust: 'spacingAndGlyphs' })
  })

  it('AC-6805.3: 로고 색 c + 칠할 수 있는 그림이면 필터로 칠하고, 칠할 수 없는 그림은 지금 그대로다', () => {
    const tintable: PosterLogo = { kind: 'image', href: URL, width: 1033, height: 175, tintable: true }
    const svg = drawWith(styledGuide(example(1), { logoColor: LOGO_C }), { logo: tintable })
    const last = svg.lastElementChild!
    const filter = all(svg, 'filter').find((f) => last.getAttribute('filter') === `url(#${f.getAttribute('id')})`)
    expect(filter?.getAttribute('id')).toMatch(/^logo-tint-/)
    expect(all(filter!, 'feFlood')[0]!.getAttribute('flood-color')).toBe(LOGO_C)
    expect(attrsOf(all(filter!, 'feComposite')[0]!)).toEqual({ in2: 'SourceAlpha', operator: 'in' })
    cleanup()
    const plainLogo: PosterLogo = { kind: 'image', href: URL, width: 1033, height: 175 }
    expect(htmlOfGuide(styledGuide(example(1), { logoColor: LOGO_C }), { logo: plainLogo })).toBe(htmlOfGuide(example(1), { logo: plainLogo }))
    expect(htmlOfGuide(example(1), { logo: tintable })).toBe(htmlOfGuide(example(1), { logo: plainLogo }))
  })

  it('AC-6805.3: 이름 글자 로고는 글자를 c로 그린다', () => {
    const logo = drawWith(styledGuide(example(1), { logoColor: LOGO_C }), { logo: { kind: 'text', text: '서승관의원' } }).lastElementChild!
    expect(logo.getAttribute('fill')).toBe(LOGO_C)
  })
})

describe('AC-6804.6: 처음대로면 환자 안내문 그림은 이 기능 전과 한 점도 다르지 않다', () => {
  const URL = `data:image/png;base64,iVBORw0KGgo${'H'.repeat(24)}`
  it.each(EXAMPLES.map((_, i) => [i + 1] as const))('AC-6804.6: 예시 %i — 처음대로 style이면 로고 그림·이름 글자·없음 모두 글자 하나까지 같다', (n) => {
    for (const logo of [undefined, null, { kind: 'image', href: URL, width: 1080, height: 501, tintable: true }, { kind: 'text', text: '서승관의원' }] as (PosterLogo | null | undefined)[]) {
      expect(htmlOfGuide({ ...example(n), style: { ...DEFAULT_STYLE } }, { logo }), JSON.stringify(logo)).toBe(htmlOfGuide(example(n), { logo }))
    }
  })
})
