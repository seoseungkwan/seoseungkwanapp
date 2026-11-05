// 원본 mx999_v22.html을 화면 없이 끝까지 돌린다(TASK-14, design.md 10절·19-2). 뒤쪽 스크립트가 덮어쓴 함수까지 실제로 도는 판이다.
// 원본은 저장소 밖에 있고 경로로만 받는다. 화면·저장·통신은 아무 일도 하지 않는 가짜로 채운다. 원본 시험(tests/test_claim_html.py)이 스크립트를 꺼내는 방식과 같다
import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import vm from 'node:vm'

process.env.TZ = 'Asia/Seoul' // 원본 날짜 계산은 지역 시간을 쓴다

export const SOURCE = 'seoseungkwan/shared@2a1069b'
export const FILE = 'assets/mx999_v22.html'

export function args(defaults) {
  const out = { src: process.env.YANGJI_SRC ?? '', ...defaults }
  const list = process.argv.slice(2)
  for (let i = 0; i < list.length; i += 2) {
    const key = list[i].replace(/^--/, '')
    if (!Object.hasOwn(out, key) || list[i + 1] === undefined) throw new Error(`모르는 인자: ${list[i]}`)
    out[key] = list[i + 1]
  }
  if (!out.src) throw new Error('원본 폴더가 필요하다: --src 또는 YANGJI_SRC')
  return { ...out, src: resolve(out.src) }
}

function readScripts(html) {
  const scripts = []
  const re = /<script\b([^>]*)>([\s\S]*?)<\/script\s*>/gi
  for (let m; (m = re.exec(html)); ) scripts.push({ id: /\bid="([^"]+)"/.exec(m[1])?.[1] ?? '', attrs: m[1], code: m[2] })
  return scripts
}

/** 무엇을 불러도·읽어도 자기 자신을 돌려주는 가짜 화면 */
function fakeDom() {
  const target = function () {}
  const dom = new Proxy(target, {
    get(_, key) {
      if (key === Symbol.toPrimitive) return () => ''
      if (key === Symbol.iterator) return function* () {}
      if (key === 'length') return 0
      if (key === 'then') return undefined
      if (key === 'value' || key === 'textContent' || key === 'innerHTML' || key === 'id' || key === 'className') return ''
      if (key === 'readyState') return 'complete'
      return dom
    },
    set: () => true,
    apply: () => dom,
    construct: () => dom,
    has: () => true,
  })
  return dom
}

/** 문구 사전은 원본에서 병원 PC 저장소로만 들어온다. 시험 값을 넣는 문 하나만 뚫는다 */
const DICTIONARY_DOOR = ['const emit=()=>{', "global.__setDictionary=value=>{config=validate(value);};const emit=()=>{"]

export function loadOriginal(src) {
  const path = join(src, FILE)
  const html = readFileSync(path, 'utf-8')
  const dom = fakeDom()
  const inert = function () {
    return { observe() {}, disconnect() {}, postMessage() {}, addEventListener() {}, close() {} }
  }
  const ctx = {
    console: { log() {}, warn() {}, error() {}, info() {} },
    setTimeout: () => 0, clearTimeout() {}, setInterval: () => 0, clearInterval() {},
    document: dom, navigator: dom, localStorage: dom, sessionStorage: dom, indexedDB: dom, history: dom,
    location: { href: 'file:///x', protocol: 'file:', hash: '', search: '', pathname: '/x', origin: 'null' },
    fetch: async () => { throw new Error('원본 실행 중 통신은 없다') },
    crypto: globalThis.crypto, TextEncoder, TextDecoder, URL, URLSearchParams, DOMException, AbortController, performance, queueMicrotask, structuredClone, atob, btoa,
    Blob: inert, MutationObserver: inert, ResizeObserver: inert, BroadcastChannel: inert, HTMLElement: inert, Element: inert, Node: inert, Event: inert, CustomEvent: inert, WebSocket: inert, XMLHttpRequest: inert, EventSource: inert,
    addEventListener() {}, removeEventListener() {}, requestAnimationFrame: () => 0, getComputedStyle: () => dom, matchMedia: () => ({ matches: false, addEventListener() {} }),
    alert() {}, confirm: () => true, prompt: () => null,
  }
  ctx.window = ctx
  ctx.globalThis = ctx
  ctx.self = ctx
  ctx.parent = ctx
  ctx.top = ctx
  vm.createContext(ctx)
  let door = false
  for (const script of readScripts(html)) {
    if (/application\/json/.test(script.attrs) || script.code.includes('SheetJS')) continue
    let code = script.code
    if (script.id === 'new-medicore-shared-dictionary') {
      if (!code.includes(DICTIONARY_DOOR[0])) throw new Error('원본 문구 사전 모양이 다르다')
      code = code.replace(DICTIONARY_DOOR[0], DICTIONARY_DOOR[1])
      door = true
    }
    vm.runInContext(code, ctx, { filename: script.id || 'main' })
  }
  if (!door) throw new Error('원본에서 문구 사전을 찾지 못함')
  const run = (source) => vm.runInContext(source, ctx)
  return {
    ctx,
    run,
    fileSha256: createHash('sha256').update(html, 'utf-8').digest('hex'),
    /** 원본 전역 함수를 불러 JSON으로 받는다 */
    call(name, ...values) {
      ctx.__args = JSON.stringify(values)
      return JSON.parse(run(`JSON.stringify((${name})(...JSON.parse(__args)) ?? null)`))
    },
  }
}

/** 줄마다 한 항목이라 바뀐 곳만 차이에 보인다 */
export function lines(value, indent = '') {
  if (Array.isArray(value)) return value.length ? `[\n${value.map((item) => `${indent}  ${JSON.stringify(item)}`).join(',\n')}\n${indent}]` : '[]'
  if (value && typeof value === 'object') {
    const body = Object.entries(value).map(([k, v]) => `${indent}  ${JSON.stringify(k)}: ${lines(v, `${indent}  `)}`).join(',\n')
    return body ? `{\n${body}\n${indent}}` : '{}'
  }
  return JSON.stringify(value)
}
