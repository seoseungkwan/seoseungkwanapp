// 시험 도우미: 그린 마크업에서 상자 안 상자 찾기 (b2b-redesign REQ-204 AC-204.7·AC-212.3, UI_GUIDE '상자 안 상자 금지').
// 시험만 쓴다. 앱 화면은 이 파일을 불러오지 않는다.
// 상자 = aria-hidden 밖의 블록 요소(BOX_TAGS) 가운데 클래스 목록에 네 변 테두리 낱말 border가 있는 것(md:border처럼 접두사가 붙어도).
// aria-hidden="true" 요소는 자신과 그 안 전체를 보지 않는다 — 입력란·단추·칩을 그린 꾸밈 그림은 상자가 아니다

export const BOX_TAGS = new Set(['div', 'section', 'article', 'ul', 'ol', 'li', 'dl', 'table', 'aside', 'form'])

const classTokens = (el: Element) => (el.getAttribute('class') ?? '').split(/\s+/).filter(Boolean)

// 기본 판단: 상자 태그 + 네 변 테두리 낱말. 랜딩은 네 변 테두리를 주는 모듈 클래스(해시 이름)를 더한 판단을 넘긴다
export function isBorderBox(el: Element): boolean {
  if (!BOX_TAGS.has(el.tagName.toLowerCase())) return false
  return classTokens(el).some((token) => token === 'border' || token.endsWith(':border'))
}

const label = (el: Element) => [el.tagName.toLowerCase(), ...classTokens(el)].join('.')

// root(자신 포함)를 훑어, 바깥 상자 안에 든 상자마다 '바깥 > … > 안' 경로를 돌려준다. 겹침이 없으면 빈 배열
export function nestedBoxes(root: Element, isBox: (el: Element) => boolean = isBorderBox): string[] {
  const found: string[] = []
  const visit = (el: Element, outer: Element[]) => {
    if (el.getAttribute('aria-hidden') === 'true') return
    const chain = isBox(el) ? [...outer, el] : outer
    if (chain.length > outer.length && outer.length > 0) found.push(chain.map(label).join(' > '))
    for (const child of Array.from(el.children)) visit(child, chain)
  }
  visit(root, [])
  return found
}
