// 예약 구글 맞춤 시작·멈춤(spec google-link REQ-8525 AC-8525.1, REQ-8540 AC-8540.1, design.md 10-5). GcalSync가 부른다.
// 이은 병원(캘린더를 고르고 이은 날·비밀 글자가 있음)이면 그 병원 id로 맞춤 돌기(lib/gcal/loop)를 한 번 시작한다.
// 받기 간격·1분 다시 보내기·같은 브라우저 한 탭만(navigator.locks)은 loop가 한다. 여기는 언제 시작·멈추나만 정한다:
// - 시작하자마자 한 번, 그 뒤 RECHECK_MS마다 본다(돌고 있으면 보지 않음). 보는 중(관리자 보기 쿠키)이면 아무것도 읽지 않는다.
// - 병원 id는 처음 읽은 뒤 다시 읽지 않는다. 읽기가 실패하거나 잇지 않았으면 다음에 다시 본다(설정에서 이으면 1분 안에 시작).
// - 돌던 중 맞춤 상태가 '이어짐'에서 '잇지 않음'으로 바뀌면(잇기 끊기) 멈추고 다시 보기로 돌아간다.
// - 멈추면(앱 틀을 떠남) 돌던 맞춤을 멈추고 더 보지 않는다

export const RECHECK_MS = 60_000

export type GcalSyncDeps = {
  /** 보는 중(관리자 보기 쿠키) */
  viewing(): boolean
  /** 내 병원 id(원장·데스크). 없으면 null */
  hospitalId(): Promise<string | null>
  /** 캘린더를 고르고 이은 날·비밀 글자가 있다 */
  linked(): Promise<boolean>
  /** 맞춤 돌기를 시작하고 멈추는 함수를 돌려준다 */
  startLoop(hospitalId: string): () => void
  /** 맞춤 상태 듣기 */
  subscribe(listener: () => void): () => void
  /** 지금 맞춤 상태가 '이어짐'인가 */
  statusLinked(): boolean
}

export function startGcalSync(deps: GcalSyncDeps): () => void {
  let stopped = false
  let looking = false
  let hospital: string | null = null
  let stopLoop: (() => void) | null = null
  /** 돌기 시작 뒤 상태가 한 번이라도 '이어짐'이었나(처음 모양 '잇지 않음'으로는 멈추지 않는다) */
  let sawLinked = false

  const halt = () => {
    const stop = stopLoop
    stopLoop = null
    sawLinked = false
    stop?.()
  }

  const check = async () => {
    if (stopped || looking || stopLoop !== null || deps.viewing()) return
    looking = true
    try {
      hospital ??= await deps.hospitalId()
      if (hospital === null || stopped) return
      const linked = await deps.linked()
      if (!linked || stopped || stopLoop !== null) return
      sawLinked = false
      stopLoop = deps.startLoop(hospital)
    } catch {
      // 다음에 다시 본다
    } finally {
      looking = false
    }
  }

  const unsubscribe = deps.subscribe(() => {
    if (stopLoop === null) return
    if (deps.statusLinked()) sawLinked = true
    else if (sawLinked) halt()
  })
  const timer = setInterval(() => void check(), RECHECK_MS)
  void check()

  return () => {
    if (stopped) return
    stopped = true
    clearInterval(timer)
    unsubscribe()
    halt()
  }
}
