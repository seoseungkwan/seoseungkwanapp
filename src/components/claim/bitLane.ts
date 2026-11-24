// 비트 통로 차례 (admin-view REQ-8021 AC-8021.8, design.md '비트 통로 차례'). 확장은 웹 연결을 한 번에 하나만 받는다(E-BRIDGE-BUSY).
// 같은 쪽 안에서 화면(useBridge — 붙기 전 enterScreen, 닫을 때·떠날 때 leaveScreen / readBitDays — 읽는 동안만)과
// 뒤에서 도는 저절로 올리기(enterBackground)가 겹치지 않게 차례를 둔다. 화면이 먼저다:
// - 쥔 쪽이 없으면 enterScreen은 바로 참이다(지금과 같은 차례·횟수로 바로 붙는다).
// - 저절로 올리기가 쥐고 있으면 그쪽 stop()을 한 번 부르고 거짓이다. 그쪽이 놓으면 기다리던 화면의 onFree를 온 차례대로 부른다.
// - 화면이 하나라도 있으면(기다리는 화면 포함) enterBackground는 null이다. 놓기는 한 번만 먹는다.
// 네트워크·저장소·React·통로 코드가 없는 순수 모듈이다. 차례 상태는 이 쪽의 메모리에만 있다

export type BitLane = {
  /** 화면이 붙기 전. 참이면 바로 붙고, 거짓이면 onFree가 불릴 때 붙는다 */
  enterScreen(onFree: () => void): boolean
  /** 화면을 닫을 때·떠날 때. 기다리던 화면이면 그 onFree도 넘겨 차례에서 뺀다 */
  leaveScreen(onFree?: () => void): void
  /** 저절로 올리기가 통로를 잡는다. 화면이 있거나 이미 쥔 쪽이 있으면 null, 잡으면 놓기 함수 */
  enterBackground(stop: () => void): (() => void) | null
}

type Holder = { stop: () => void; asked: boolean }

export function createBitLane(): BitLane {
  let screens = 0
  let holder: Holder | null = null
  const waiting: (() => void)[] = []

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
    }
  }

  return { enterScreen, leaveScreen, enterBackground }
}

// 앱이 쓰는 차례 하나(이 쪽 안의 모든 화면과 저절로 올리기가 같이 쓴다)
const lane = createBitLane()
export const enterScreen = lane.enterScreen
export const leaveScreen = lane.leaveScreen
export const enterBackground = lane.enterBackground
