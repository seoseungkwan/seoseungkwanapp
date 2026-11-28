import { LIBRARY_TAB, LOCATION_TAB, MENU } from './menu'

// 열린 창 이름 묻기(claim-learn AC-9313.5, design.md 11절). 비트 연결을 다른 창이 쓰는 중(E-BRIDGE-BUSY)일 때 '어느 창'인지 알리려고,
// 이 웹앱의 다른 열린 창(같은 브라우저의 탭)에게 지금 화면의 메뉴 이름만 묻고 받는다. 주소·환자 글자는 오가지 않는다.
// 청구 화면 쪽에서 창 사이 통신(BroadcastChannel)을 쓰는 곳은 이 파일 하나다. 비트 통로(src/lib/bridge)·확장은 지금처럼 창 사이 통신을 쓰지 않는다

export const OPEN_TABS_CHANNEL = 'ssk-open-tabs'
/** 답을 모으는 시간(ms) */
export const ANSWER_MS = 300

/** 받을 수 있는 이름: 메뉴 목록(탭·[더보기]의 입지 분석·자료실) 안 이름뿐이다 */
const LABELS: ReadonlySet<string> = new Set([...MENU, LOCATION_TAB, LIBRARY_TAB].map((item) => item.label))
/** 이 창이 물은 번호. BroadcastChannel은 같은 창의 다른 채널에도 가므로, 같은 창의 답하는 쪽은 이 번호에 답하지 않는다 */
const mine = new Set<string>()

type Who = { type: 'who'; id: string }
type Here = { type: 'here'; id: string; label: string }

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null
const isWho = (value: unknown): value is Who => isRecord(value) && value.type === 'who' && typeof value.id === 'string' && value.id !== ''
const isHere = (value: unknown): value is Here => isRecord(value) && value.type === 'here' && typeof value.id === 'string' && typeof value.label === 'string'
const isMenuLabel = (label: string | null): label is string => label !== null && LABELS.has(label)

/** 창 사이 채널. BroadcastChannel이 없는 곳(옛 브라우저·서버)에서는 null이다 */
function openChannel(): BroadcastChannel | null {
  return typeof BroadcastChannel === 'function' ? new BroadcastChannel(OPEN_TABS_CHANNEL) : null
}

const newId = () => `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`

/**
 * 답하는 쪽(앱 틀이 어느 화면이든 켠다): 다른 창의 who에 지금 화면 메뉴 이름으로 here를 답한다.
 * 메뉴 밖 화면(가입 승인 등)이면 답하지 않는다. 돌려받은 함수는 채널을 닫는다
 */
export function answerOpenTabs(label: () => string | null): () => void {
  const channel = openChannel()
  if (!channel) return () => {}
  channel.onmessage = (event: MessageEvent) => {
    const asked: unknown = event.data
    if (!isWho(asked) || mine.has(asked.id)) return
    const now = label()
    if (!isMenuLabel(now)) return
    channel.postMessage({ type: 'here', id: asked.id, label: now } satisfies Here)
  }
  return () => channel.close()
}

/**
 * 묻는 쪽: who를 보내고 ANSWER_MS 동안 그 번호의 here를 모아, 메뉴 안 이름만 받은 차례대로 한 번씩 done으로 알린다.
 * 돌려받은 함수는 그 전에 멈춘다(알리지 않고 채널을 닫는다). BroadcastChannel이 없으면 묻지도 알리지도 않는다
 */
export function askOpenTabs(done: (labels: string[]) => void, ms: number = ANSWER_MS): () => void {
  const channel = openChannel()
  if (!channel) return () => {}
  const id = newId()
  const labels: string[] = []
  let stopped = false
  const stop = () => {
    if (stopped) return
    stopped = true
    clearTimeout(timer)
    channel.close()
    mine.delete(id)
  }
  channel.onmessage = (event: MessageEvent) => {
    const answer: unknown = event.data
    if (stopped || !isHere(answer) || answer.id !== id || !isMenuLabel(answer.label) || labels.includes(answer.label)) return
    labels.push(answer.label)
  }
  mine.add(id)
  const timer = setTimeout(() => {
    stop()
    done(labels)
  }, ms)
  channel.postMessage({ type: 'who', id } satisfies Who)
  return stop
}
