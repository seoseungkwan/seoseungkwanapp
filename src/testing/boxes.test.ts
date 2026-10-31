// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import { isBorderBox, nestedBoxes } from './boxes'

// 상자 안 상자 찾기 도우미 (b2b-redesign REQ-204 AC-204.7·AC-212.3, design.md '상자 겹침 시험 도우미', UI_GUIDE '상자 안 상자 금지').
// 상자 = aria-hidden 밖의 div·section·article·ul·ol·li·dl·table·aside·form 가운데 클래스 목록에 네 변 테두리 낱말 border가 있는 것
const mount = (html: string) => {
  const root = document.createElement('div')
  root.innerHTML = html
  return root
}

const BOX_TAGS = ['div', 'section', 'article', 'ul', 'ol', 'li', 'dl', 'table', 'aside', 'form'] as const

describe('AC-204.7: nestedBoxes — 상자 안 상자를 찾는다', () => {
  it('AC-204.7: 테두리 상자 안(사이에 다른 요소가 있어도)의 테두리 상자를 바깥 → 안 경로로 돌려준다', () => {
    const root = mount('<section class="border p-4"><div class="flex"><ul class="border border-line"><li>가</li></ul></div></section>')
    expect(nestedBoxes(root)).toEqual(['section.border.p-4 > ul.border.border-line'])
  })

  it('AC-204.7: 세 겹이면 안쪽 둘을 모두 돌려준다', () => {
    const root = mount('<div class="border"><div class="border a"><div class="border b"></div></div></div>')
    expect(nestedBoxes(root)).toEqual(['div.border > div.border.a', 'div.border > div.border.a > div.border.b'])
  })

  it('AC-204.7: 뿌리 요소 자신도 상자로 친다', () => {
    const root = document.createElement('section')
    root.className = 'border'
    root.innerHTML = '<div class="border"></div>'
    expect(nestedBoxes(root)).toEqual(['section.border > div.border'])
  })

  it.each(BOX_TAGS)('AC-204.7: 테두리 상자 안의 %s 상자를 찾는다', (tag) => {
    const inner = tag === 'table' ? '<table class="border"><tbody><tr><td>1</td></tr></tbody></table>' : `<${tag} class="border"></${tag}>`
    const root = mount(`<div class="border">${inner}</div>`)
    expect(nestedBoxes(root)).toEqual([`div.border > ${tag}.border`])
  })

  it('AC-204.7: 상자 태그 밖(input·button·span·label·a·p·td·svg)의 테두리는 상자가 아니다', () => {
    const root = mount(
      '<div class="border">' +
        '<input class="border"><button class="border">가</button><span class="border">칩</span><label class="border">이름</label>' +
        '<a class="border" href="/x">링크</a><p class="border">글</p>' +
        '<table><tbody><tr><td class="border">칸</td></tr></tbody></table>' +
        '<svg class="border"></svg>' +
        '</div>',
    )
    expect(nestedBoxes(root)).toEqual([])
  })

  it('AC-204.7: 네 변 테두리 낱말 border만 상자다(border-b·border-t·border-x·border-line·border-transparent는 아니다)', () => {
    const root = mount(
      '<div class="border"><div class="border-b border-line"></div><div class="border-t"></div><div class="border-x"></div><div class="border-transparent"></div></div>',
    )
    expect(nestedBoxes(root)).toEqual([])
  })

  it('AC-204.7: 화면 폭 접두사가 붙은 네 변 테두리(md:border)도 상자다', () => {
    const root = mount('<div class="border"><div class="md:border"></div></div>')
    expect(nestedBoxes(root)).toEqual(['div.border > div.md:border'])
  })
})

describe('AC-204.7: nestedBoxes — aria-hidden 그림은 상자가 아니다', () => {
  it('AC-204.7: aria-hidden="true" 안은 건너뛴다', () => {
    const root = mount('<div class="border"><div aria-hidden="true"><div class="border"><div class="border"></div></div></div></div>')
    expect(nestedBoxes(root)).toEqual([])
  })

  it('AC-204.7: 테두리 요소 자신이 aria-hidden이면 상자로 치지 않는다(입력란·단추·칩 그림)', () => {
    const root = mount(
      '<section class="border"><div aria-hidden="true" class="border h-11">입력란 그림</div><ul><li aria-hidden="true" class="border">칩 그림</li></ul></section>',
    )
    expect(nestedBoxes(root)).toEqual([])
  })

  it('AC-204.7: 바깥 테두리 요소가 aria-hidden이면 그 안의 상자도 보지 않는다', () => {
    const root = mount('<div aria-hidden="true" class="border"><div class="border"></div></div>')
    expect(nestedBoxes(root)).toEqual([])
  })

  it('AC-204.7: aria-hidden="false"는 숨김이 아니다', () => {
    const root = mount('<div class="border"><div aria-hidden="false" class="border"></div></div>')
    expect(nestedBoxes(root)).toEqual(['div.border > div.border'])
  })
})

describe('AC-204.7: nestedBoxes — 겹침이 없으면 빈 배열', () => {
  it.each([
    ['상자가 없다', '<main><section><h1>제목</h1><p>글</p></section></main>'],
    ['상자가 하나뿐', '<section class="border"><div class="p-4"><p>글</p></div></section>'],
    ['나란한 상자', '<div><div class="border">가</div><div class="border">나</div><ul class="border"><li>다</li></ul></div>'],
  ])('AC-204.7: %s면 빈 배열', (_name, html) => {
    expect(nestedBoxes(mount(html))).toEqual([])
  })
})

describe('AC-204.7·AC-212.3: isBox를 넘기면 그 판단을 쓴다(랜딩 모듈 해시 클래스)', () => {
  const landingBox = (el: Element) => isBorderBox(el) || el.classList.contains('panel_ab12')

  it('AC-212.3: 모듈 클래스 상자 안의 border 상자를 찾는다', () => {
    const root = mount('<section><div class="panel_ab12"><div class="border"></div></div></section>')
    expect(nestedBoxes(root, landingBox)).toEqual(['div.panel_ab12 > div.border'])
  })

  it('AC-212.3: 넘긴 판단에서도 aria-hidden 안은 건너뛴다', () => {
    const root = mount('<div class="panel_ab12"><div aria-hidden="true"><div class="panel_ab12"></div></div></div>')
    expect(nestedBoxes(root, landingBox)).toEqual([])
  })

  it('AC-204.7: 기본 판단 isBorderBox는 상자 태그 + border 낱말이다', () => {
    const el = (html: string) => mount(html).firstElementChild as Element
    expect(isBorderBox(el('<div class="flex border p-4"></div>'))).toBe(true)
    expect(isBorderBox(el('<aside class="border"></aside>'))).toBe(true)
    expect(isBorderBox(el('<div class="border-b"></div>'))).toBe(false)
    expect(isBorderBox(el('<div></div>'))).toBe(false)
    expect(isBorderBox(el('<button class="border"></button>'))).toBe(false)
  })
})
