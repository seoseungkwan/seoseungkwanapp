// 통로 포트로 온 환자 자료 조각 모으기(AC-604.1) [환자 자료 구역].
// 도우미는 JSON 글자를 다 만든 뒤 잘라 chunk(seq 0부터) … end {count, bytes, sha256}으로 보낸다.
// seq가 차례대로이고 조각 수·UTF-8 바이트 수·SHA-256(16진 소문자)이 end와 모두 같을 때만 JSON으로 푼다.
// 하나라도 다르면 E-BRIDGE-BAD-REPLY, abort면 받은 번호. 반쪽 자료는 내주지 않는다

export type AssembleResult = { ok: true; json: unknown } | { ok: false; code: string }

const BAD_REPLY: AssembleResult = Object.freeze({ ok: false, code: 'E-BRIDGE-BAD-REPLY' })

type Slot = {
  parts: string[]
  /** 번호가 틀린 조각이 왔다(모으던 글자는 바로 버린다) */
  broken: boolean
  /** end·abort가 왔다(그 뒤의 조각·end·abort는 받지 않는다) */
  closed: boolean
  /** take를 이미 불렀다 */
  claimed: boolean
  outcome: Promise<AssembleResult>
  settle(result: AssembleResult): void
}

function newSlot(): Slot {
  let settle: (result: AssembleResult) => void = () => {}
  const outcome = new Promise<AssembleResult>((resolve) => {
    settle = resolve
  })
  return { parts: [], broken: false, closed: false, claimed: false, outcome, settle }
}

// crypto.subtle은 그 PC 안에서 계산한다(네트워크 아님)
async function check(text: string, bytes: number, sha256: string): Promise<AssembleResult> {
  try {
    const encoded = new TextEncoder().encode(text)
    if (encoded.byteLength !== bytes) return BAD_REPLY
    const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', encoded))
    const hex = Array.from(digest, (byte) => byte.toString(16).padStart(2, '0')).join('')
    return hex === sha256 ? { ok: true, json: JSON.parse(text) as unknown } : BAD_REPLY
  } catch {
    return BAD_REPLY
  }
}

export function createAssembler() {
  const slots = new Map<string, Slot>()
  /** 결과를 가져간 요청 번호. 글자는 이미 지웠고, 늦은 조각으로 되살아나거나 다시 take가 매달리지 않게 번호만 둔다 */
  const finished = new Set<string>()

  // 끝난 요청이면 null
  function open(id: string): Slot | null {
    if (finished.has(id)) return null
    let slot = slots.get(id)
    if (!slot) {
      slot = newSlot()
      slots.set(id, slot)
    }
    return slot
  }

  return {
    chunk(id: string, seq: number, data: string): void {
      const slot = open(id)
      if (!slot || slot.closed || slot.broken) return
      if (seq !== slot.parts.length) {
        slot.broken = true
        slot.parts = []
        return
      }
      slot.parts.push(data)
    },

    end(id: string, count: number, bytes: number, sha256: string): void {
      const slot = open(id)
      if (!slot || slot.closed) return
      slot.closed = true
      const { parts, broken } = slot
      slot.parts = []
      if (broken || count !== parts.length) slot.settle(BAD_REPLY)
      else void check(parts.join(''), bytes, sha256).then(slot.settle)
    },

    abort(id: string, code: string): void {
      const slot = open(id)
      if (!slot || slot.closed) return
      slot.closed = true
      slot.parts = []
      slot.settle({ ok: false, code })
    },

    /** end·abort가 오기 전에 부르면 올 때까지 기다린다. 결과는 한 번만 내주고 메모리에서 지운다 */
    take(id: string): Promise<AssembleResult> {
      const slot = open(id)
      if (!slot || slot.claimed) return Promise.resolve(BAD_REPLY)
      slot.claimed = true
      return slot.outcome.then((result) => {
        slots.delete(id)
        finished.add(id)
        return result
      })
    },

    /** 아직 아무도 take하지 않은 요청(끝난 것·오는 중인 것)을 지운다. 늦은 조각으로 되살아나지 않는다. 기다리는 take가 있는 요청은 그대로 둔다. 남은 요청 수를 돌려준다 */
    discardUntaken(): number {
      for (const [id, slot] of slots) {
        if (slot.claimed) continue
        slots.delete(id)
        finished.add(id)
      }
      return slots.size
    },
  }
}
