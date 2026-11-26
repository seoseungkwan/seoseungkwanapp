import { isUnder } from '@/components/shell/menu'

// 다른 주소에서 연 문서면 틀을 그리기 전에 한 번 새로 불러온다(spec google-link TASK-15, design.md 6절).
// 까닭: 구글 시트 틀(frame-src https://docs.google.com)은 /sunap 응답 머리(CSP)에만 있다. PC 화면의 앱 안 이동(메뉴 Link·DeskGate의
// router.replace·대시보드 카드)은 문서를 새로 받지 않아, 처음 연 주소(예: /dashboard)의 CSP가 그대로라 틀이 막힌다.
// 문서를 처음 연 주소는 performance 'navigation' 항목의 name이다. 그 항목이 있고 그 주소가 /sunap(아래 주소 포함)이 아닐 때만
// location.replace(지금 주소)로 한 번 새로 불러온다. 고리를 막는 표시 하나를 sessionStorage에 둔다:
//   표시가 있으면 부르지 않는다 · 저장소가 막히면(읽기·쓰기가 던짐) 부르지 않는다(그때 틀이 막히면 20초 뒤 err-frame 안내) ·
//   표시는 location.replace를 부르기 **전에** 적는다 · /sunap에서 연 문서는 표시를 지운다(다음에 다른 문서를 거쳐 와도 다시 한 번 —
//   30분 자동 로그아웃 뒤 다시 로그인한 데스크)
// 항목이 없거나 주소를 읽지 못하면 부르지 않는다. 표시 값에는 주소·병원 같은 것을 넣지 않는다('1')

export const RELOAD_MARK = 'ssk-sunap-frame-reload'
const SHEET_PATH = '/sunap'

type MarkStore = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>
export type ReloadEnv = {
  /** 문서를 처음 연 항목(없으면 undefined) */
  navigation: () => { name: string } | undefined
  /** sessionStorage(막히면 던진다) */
  storage: () => MarkStore
  location: { href: string; replace: (url: string) => void }
}

function browserEnv(): ReloadEnv {
  return {
    navigation: () => {
      const read = globalThis.performance?.getEntriesByType
      if (typeof read !== 'function') return undefined
      return read.call(globalThis.performance, 'navigation')[0]
    },
    storage: () => globalThis.sessionStorage,
    location: globalThis.location,
  }
}

function openedPath(env: ReloadEnv): string | null {
  try {
    const entry = env.navigation()
    if (!entry || typeof entry.name !== 'string') return null
    return new URL(entry.name).pathname
  } catch {
    return null
  }
}

/** 새로 불러오기를 불렀으면 참(그때 화면은 틀을 그리지 않는다). 던지지 않는다 */
export function reloadForFrame(env: ReloadEnv = browserEnv()): boolean {
  const path = openedPath(env)
  if (path === null) return false
  let store: MarkStore
  try {
    store = env.storage()
    if (!store) return false
    if (isUnder(path, SHEET_PATH)) {
      store.removeItem(RELOAD_MARK)
      return false
    }
    if (store.getItem(RELOAD_MARK) !== null) return false
    store.setItem(RELOAD_MARK, '1')
  } catch {
    return false
  }
  env.location.replace(env.location.href)
  return true
}
