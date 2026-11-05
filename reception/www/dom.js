// 화면 요소 만들기 (design.md 10절). 모든 그리는 파일(board·detail·offline·xray·layout·app)이 이것만으로 요소를 만든다.
// - 글(문자열·숫자)은 글 마디(Text, textContent와 같음)로만 넣는다. 환자 글에 <b>가 있어도 글자로만 보인다(AC-1407.6)
// - 모양은 style.css 한 곳이라 style 속성을 받지 않는다. CSP가 인라인 스타일·처리기를 막는다(AC-1407.7, AC-1406.6)
// - 처리기는 on: { click: 함수 }로만 붙인다. onclick=… 같은 HTML 처리기 속성은 받지 않는다
// - 주소 속성(href·src…)은 같은 PC 길('/…')이나 해시('#…')만 받는다(AC-1407.8 바깥 주소 없음)

/** 주소를 담는 속성 (소문자) */
const URL_KEYS = new Set(['href', 'src', 'srcset', 'action', 'formaction', 'xlink:href', 'poster', 'data', 'cite', 'background', 'ping'])

/** HTML이나 모양을 글자로 넣는 속성 (소문자) */
const BANNED_KEYS = new Set(['style', 'innerhtml', 'outerhtml', 'srcdoc'])

/** '#…' 또는 '/' 다음이 '/'·'\'가 아닌 길. 빈칸·제어 글자·역빗금은 어디에도 없다(브라우저가 지우거나 바꿔 바깥 주소가 된다) */
const SAME_PC = /^(?:#|\/(?![/\\]))[^\s\u0000-\u001f\u007f\\]*$/

/**
 * 요소 하나를 만든다.
 * @param {string} tag 요소 이름 ('div'·'button'…)
 * @param {Record<string, unknown> | null} [attrs] class는 className, true는 빈 값 속성, false·null·undefined는 넣지 않음,
 *   on: { 사건: 함수 }는 addEventListener. style·on…·innerHTML·srcdoc은 TypeError
 * @param {unknown} [children] 글(문자열·숫자)·요소(Node)·그 배열(겹쳐도 됨). null·undefined·false는 건너뜀
 * @returns {HTMLElement}
 */
export function el(tag, attrs, children) {
  const node = document.createElement(tag)
  if (attrs) for (const key of Object.keys(attrs)) setAttr(node, key, attrs[key])
  append(node, children)
  return node
}

/** 아이를 모두 지운다(끊김·숨김 때 환자 줄·상세 지우기) */
export function clear(node) {
  while (node.firstChild) node.removeChild(node.firstChild)
}

function setAttr(node, key, value) {
  if (key === 'on') {
    listen(node, value)
    return
  }
  const lower = key.toLowerCase()
  if (lower.startsWith('on') || BANNED_KEYS.has(lower)) throw new TypeError(`화면 요소에 ${key} 속성은 넣지 않는다`)
  if (value === false || value === null || value === undefined) return
  const text = value === true ? '' : String(value)
  if (URL_KEYS.has(lower) && !SAME_PC.test(text)) throw new TypeError(`${key} 주소는 같은 PC 길('/…')이나 '#…'만 된다`)
  if (key === 'class') node.className = text
  else node.setAttribute(key, text)
}

function listen(node, handlers) {
  if (handlers === null || typeof handlers !== 'object') throw new TypeError('on은 { 사건: 함수 } 모양이다')
  for (const type of Object.keys(handlers)) {
    const handler = handlers[type]
    if (typeof handler !== 'function') throw new TypeError(`on.${type}은 함수여야 한다`)
    node.addEventListener(type, handler)
  }
}

function append(node, child) {
  if (child === null || child === undefined || child === false) return
  if (Array.isArray(child)) {
    for (const item of child) append(node, item)
    return
  }
  if (typeof child === 'string' || typeof child === 'number') {
    // 글 마디는 HTML로 읽히지 않는다(textContent와 같다)
    node.appendChild(document.createTextNode(String(child)))
    return
  }
  if (child instanceof Node) {
    node.appendChild(child)
    return
  }
  throw new TypeError('화면 요소의 아이는 글·숫자·요소·그 배열만 된다')
}
