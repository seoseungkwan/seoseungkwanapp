// 비트 통로 차례 (admin-view REQ-8021 AC-8021.8, design.md '비트 통로 차례'). 확장은 웹 연결을 한 번에 하나만 받는다(E-BRIDGE-BUSY).
// 같은 쪽 안에서 화면(useBridge — 붙기 전 enterScreen, 닫을 때·떠날 때 leaveScreen / readBitDays — 읽는 동안만)과
// 뒤에서 도는 저절로 올리기(enterBackground)가 겹치지 않게 차례를 둔다. 화면이 먼저다:
// - 쥔 쪽이 없으면 enterScreen은 바로 참이다(지금과 같은 차례·횟수로 바로 붙는다).
// - 저절로 올리기가 쥐고 있으면 그쪽 stop()을 한 번 부르고 거짓이다. 그쪽이 놓으면 기다리던 화면의 onFree를 온 차례대로 부른다.
// - 화면이 하나라도 있으면(기다리는 화면 포함) enterBackground는 null이다. 놓기는 한 번만 먹는다.
// - 못 잡은 저절로 올리기는 그만두지 않고 waitBackground로 통로가 풀리기를 기다린다: 화면이 하나도 없고 쥔 쪽도 없게 되면
//   (마지막 화면이 떠나면) 그 onFree를 한 번 부른다. 다음 차례(microtask)에 다시 보고 부르므로, 한 화면이 떠나는 같은 차례에
//   다른 화면이 붙으면(탭 옮김) 풀린 것으로 치지 않는다(AC-8021.8, 마지막 검토 뒤 고침).
// 네트워크·저장소·React·통로 코드가 없는 순수 모듈이다. 차례 상태는 이 쪽의 메모리에만 있다

export type BitLane = {
  /** 화면이 붙기 전. 참이면 바로 붙고, 거짓이면 onFree가 불릴 때 붙는다 */
  enterScreen(onFree: () => void): boolean
  /** 화면을 닫을 때·떠날 때. 기다리던 화면이면 그 onFree도 넘겨 차례에서 뺀다 */
  leaveScreen(onFree?: () => void): void
  /** 저절로 올리기가 통로를 잡는다. 화면이 있거나 이미 쥔 쪽이 있으면 null, 잡으면 놓기 함수 */
  enterBackground(stop: () => void): (() => void) | null
  /** 통로가 풀리면(화면·쥔 쪽이 모두 없으면) onFree를 한 번 부른다 — 지금 풀려 있으면 다음 차례에. 돌려준 함수는 기다림을 거둔다 */
  waitBackground(onFree: () => void): () => void
}

type Holder = { stop: () => void; asked: boolean }

export function createBitLane(): BitLane {
  let screens = 0
  let holder: Holder | null = null
  const waiting: (() => void)[] = []
  // 통로가 풀리기를 기다리는 저절로 올리기(한 번씩 부르고 뺀다). 같은 함수를 둘 넣어도 따로 센다
  const idle: { onFree: () => void }[] = []
  let looking = false

  // 다음 차례에 아직 풀려 있으면 기다리던 저절로 올리기를 모두 부른다(하나가 던져도 나머지는 부름)
  const wakeIdle = () => {
    if (looking || idle.length === 0) return
    looking = true
    queueMicrotask(() => {
      looking = false
      if (screens > 0 || holder !== null) return
      for (const { onFree } of idle.splice(0)) {
        try {
          onFree()
        } catch {
          // 다른 기다림은 그대로 부른다
        }
      }
    })
  }

  const enterScreen = (onFree: () => void): boolean => {
    screens += 1
    if (holder === null) return true
    waiting.push(onFree)
    if (!holder.asked) {
      holder.asked = true
      try {
        holder.stop()
      } catch {
        // 끊기를 알리지 못해도 놓기를 기다린다
      }
    }
    return false
  }

  const leaveScreen = (onFree?: () => void): void => {
    screens = Math.max(0, screens - 1)
    if (screens === 0) wakeIdle()
    if (onFree === undefined) return
    const at = waiting.indexOf(onFree)
    if (at >= 0) waiting.splice(at, 1)
  }

  const enterBackground = (stop: () => void): (() => void) | null => {
    if (screens > 0 || holder !== null) return null
    const mine: Holder = { stop, asked: false }
    holder = mine
    return () => {
      if (holder !== mine) return
      holder = null
      for (const onFree of waiting.splice(0)) onFree()
      if (screens === 0) wakeIdle()
    }
  }

  const waitBackground = (onFree: () => void): (() => void) => {
    const entry = { onFree }
    idle.push(entry)
    if (screens === 0 && holder === null) wakeIdle()
    return () => {
      const at = idle.indexOf(entry)
      if (at >= 0) idle.splice(at, 1)
    }
  }

  return { enterScreen, leaveScreen, enterBackground, waitBackground }
}

// 앱이 쓰는 차례 하나(이 쪽 안의 모든 화면과 저절로 올리기가 같이 쓴다)
const lane = createBitLane()
export const enterScreen = lane.enterScreen
export const leaveScreen = lane.leaveScreen
export const enterBackground = lane.enterBackground
export const waitBackground = lane.waitBackground
