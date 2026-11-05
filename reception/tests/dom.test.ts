// @vitest-environment jsdom
// 화면 요소 만들기 el()·비우기 clear() (TASK-16, design.md 10절 dom.js). 글은 textContent로만 들어가고(AC-1407.6),
// 모양은 style.css 한 곳이라 style·on… 속성을 받지 않는다(AC-1407.7, CSP가 인라인 스타일·처리기를 막는다). 자료는 가짜다
import { beforeAll, describe, expect, it, vi } from 'vitest'

type El = (tag: string, attrs?: Record<string, unknown> | null, children?: unknown) => HTMLElement
type Svg = (tag: string, attrs?: Record<string, unknown> | null, children?: unknown) => SVGElement
const SVG_NS = 'http://www.w3.org/2000/svg'
// 화면 파일은 빌드 없는 JS라 형 선언이 없다(design.md 결정 '화면은 빌드 없는 JS'). 경로를 값으로 두어 형 검사가 묻지 않게 한다
const DOM_JS = '../www/dom.js'
let make: El
let makeSvg: Svg
let empty: (node: Node) => void

beforeAll(async () => {
  // 아직 없으면(RED) 아무것도 하지 않는 대역으로 시험마다 실패를 보인다
  const missing = { el: (() => document.createElement('i')) as El, clear: () => {} }
  const dom = ((await import(/* @vite-ignore */ DOM_JS).catch(() => missing)) ?? missing) as { el: El; svg?: Svg; clear: (node: Node) => void }
  make = dom.el
  makeSvg = dom.svg ?? ((() => document.createElement('i')) as unknown as Svg)
  empty = dom.clear
})

describe('dom.js el()·svg()·clear()', () => {
  it('AC-1407.6: 글 아이(문자열)는 textContent로만 들어가 <b>·<img onerror>를 넣어도 글자로만 보인다', () => {
    const name = '<b>가상환자01</b><img src=x onerror=alert(1)>'
    const node = make('span', { class: 'name' }, name)
    expect(node.tagName).toBe('SPAN')
    expect(node.textContent).toBe(name)
    expect(node.children.length).toBe(0)
    expect(node.querySelector('b, img')).toBeNull()
    const list = make('div', null, ['메모 · ', name, make('span', null, '987654')])
    expect(list.textContent).toBe(`메모 · ${name}987654`)
    expect(list.children.length).toBe(1)
    expect(list.querySelector('b, img')).toBeNull()
  })

  it('AC-1407.6: 숫자 아이도 글자로, null·undefined·false 아이와 빈 배열은 건너뛰고 겹친 배열은 펴서 넣는다', () => {
    const node = make('p', null, [0, null, undefined, false, ['V1001', [' · ', 12]], []])
    expect(node.textContent).toBe('0V1001 · 12')
    expect(node.childNodes.length).toBe(4)
    expect(make('p').childNodes.length).toBe(0)
  })

  it('AC-1407.6: 속성: class는 className, true는 빈 값 속성, false·null·undefined는 넣지 않고, 나머지는 글자로 넣는다', () => {
    const button = make('button', { type: 'button', class: 'tile is-on', 'aria-pressed': 'true', disabled: true, hidden: false, title: null, 'data-k': 912345 })
    expect(button.className).toBe('tile is-on')
    expect(button.getAttribute('type')).toBe('button')
    expect(button.getAttribute('aria-pressed')).toBe('true')
    expect(button.hasAttribute('disabled')).toBe(true)
    expect(button.getAttribute('disabled')).toBe('')
    expect(button.hasAttribute('hidden')).toBe(false)
    expect(button.hasAttribute('title')).toBe(false)
    expect(button.getAttribute('data-k')).toBe('912345')
    // 속성 값의 HTML도 글자일 뿐이다
    const img = make('img', { class: 'logo', src: '/logo-wordmark.png', alt: '"><b>x</b>' })
    expect(img.getAttribute('alt')).toBe('"><b>x</b>')
    expect(img.getAttribute('src')).toBe('/logo-wordmark.png')
  })

  it('AC-1407.6: on: { click } 처리기는 addEventListener로 붙고 HTML 처리기 속성(onclick=…)은 받지 않는다', () => {
    const click = vi.fn()
    const button = make('button', { type: 'button', on: { click } }, '새로 고침')
    expect(button.hasAttribute('on')).toBe(false)
    button.click()
    expect(click).toHaveBeenCalledTimes(1)
    expect(() => make('button', { onclick: 'alert(1)' })).toThrow(TypeError)
    expect(() => make('img', { ONERROR: 'alert(1)' })).toThrow(TypeError)
    expect(() => make('button', { on: { click: 'alert(1)' } })).toThrow(TypeError)
  })

  it('AC-1407.6: HTML로 넣는 열쇠(innerHTML·outerHTML·srcdoc)와 바깥·스크립트 주소(href·src·action)는 받지 않는다', () => {
    for (const key of ['innerHTML', 'outerHTML', 'srcdoc', 'innerhtml']) expect(() => make('div', { [key]: '<b>x</b>' }), key).toThrow(TypeError)
    for (const bad of ['javascript:alert(1)', 'https://evil.example/x.png', '//evil.example/x', '/\\evil.example', 'data:text/html,x', ' /x', 'x.png'])
      for (const key of ['href', 'src', 'action', 'formaction', 'xlink:href'])
        expect(() => make('a', { [key]: bad }), `${key}=${bad}`).toThrow(TypeError)
    expect(make('a', { href: '#/v/V1001' }).getAttribute('href')).toBe('#/v/V1001')
    expect(make('a', { href: '#' }).getAttribute('href')).toBe('#')
    expect(make('img', { src: '/logo-mark.png' }).getAttribute('src')).toBe('/logo-mark.png')
  })

  it('AC-1407.7: 모양은 style.css 한 곳이라 style 속성을 받지 않는다(CSP가 인라인 스타일을 막는다)', () => {
    expect(() => make('div', { style: 'color: red' })).toThrow(TypeError)
    expect(() => make('div', { STYLE: 'color: red' })).toThrow(TypeError)
  })

  it('AC-1407.6: 아이로 화면 요소(Node)를 넣을 수 있고, 다른 값(객체·함수)은 받지 않는다', () => {
    const child = make('span', { class: 'chart' }, '912345')
    const row = make('div', { class: 'row' }, child)
    expect(row.firstChild).toBe(child)
    expect(() => make('div', null, { toString: () => '<b>x</b>' })).toThrow(TypeError)
    expect(() => make('div', null, [() => 'x'])).toThrow(TypeError)
  })

  it('AC-1407.10: svg()는 SVG 이름 공간 그림 요소를 만든다([새로 고침] 그림을 기기 글꼴 없이 선으로). el()과 같이 style·on…·바깥 주소는 받지 않는다', () => {
    const icon = makeSvg('svg', { class: 'refresh-icon', viewBox: '0 0 24 24', 'aria-hidden': 'true' }, makeSvg('path', { d: 'M4 12h16' }))
    expect(icon.namespaceURI).toBe(SVG_NS)
    expect(icon.tagName).toBe('svg')
    expect(icon.getAttribute('class')).toBe('refresh-icon')
    expect(icon.getAttribute('viewBox')).toBe('0 0 24 24')
    expect(icon.getAttribute('aria-hidden')).toBe('true')
    expect(icon.firstElementChild?.namespaceURI).toBe(SVG_NS)
    expect(icon.firstElementChild?.tagName).toBe('path')
    expect(icon.firstElementChild?.getAttribute('d')).toBe('M4 12h16')
    expect(() => makeSvg('svg', { style: 'color: red' })).toThrow(TypeError)
    expect(() => makeSvg('svg', { onload: 'alert(1)' })).toThrow(TypeError)
    expect(() => makeSvg('use', { href: 'https://evil.example/x.svg#a' })).toThrow(TypeError)
    expect(() => makeSvg('svg', null, { toString: () => '<b>x</b>' })).toThrow(TypeError)
  })

  it('AC-1407.6: clear()는 아이를 모두 지운다(끊김·숨김에 환자 줄 지우기)', () => {
    const list = make('main', { class: 'list' }, [make('div', { class: 'row' }, '가상환자01'), make('div', { class: 'row' }, '가상환자02')])
    document.body.append(list)
    empty(list)
    expect(list.childNodes.length).toBe(0)
    expect(document.body.textContent).not.toContain('가상환자')
    list.remove()
  })
})
