// 통로 포트로 온 환자 자료 조각 모으기(REQ-009 AC-009.1·AC-009.2) [환자 자료 구역].
// 도우미는 JSON 글자를 다 만든 뒤 UTF-8 경계에서 잘라 chunk(seq 0부터) … end {count, bytes, sha256}으로 보낸다(design.md 4-2).
// 여기서는 seq대로 잇고 조각 수·UTF-8 바이트 수·SHA-256(소문자 hex)이 end와 모두 같을 때만 글자를 내준다.
// 하나라도 다르거나 abort(도우미 error·연결 끊김)가 오면 그 요청의 조각을 모두 버리고 E-CLAIM-PARTIAL. JSON으로 푸는 것은 jobs.ts가 한 번만 한다

export type AssembleResult = { ok: true; text: string } | { ok: false; code: 'E-CLAIM-PARTIAL' }

const PARTIAL: AssembleResult = Object.freeze({ ok: false, code: 'E-CLAIM-PARTIAL' })
/** 찾아 가지 않은 결과는 이만큼만 둔다(오래된 것부터 버린다) */
const KEEP_RESULTS = 16

type Pending = { parts: Map<number, string>; broken: boolean }

export type Assembler = {
  chunk(id: string, seq: number, data: string): void
  /** 그 요청을 끝낸다. 결과는 take(id)로도 한 번 찾아 갈 수 있다 */
  end(id: string, count: number, bytes: number, sha256: string): Promise<AssembleResult>
  /** 그 id의 조각을 모두 버린다(code는 통로가 받은 오류 번호. 화면에는 E-CLAIM-PARTIAL만 알린다) */
  abort(id: string, code: string): void
  /** 그 요청의 결과를 한 번 찾아 간다. 아직 end·abort가 오지 않았으면 올 때까지 기다린다 */
  take(id: string): Promise<AssembleResult>
}

/** 글자의 UTF-8 바이트 수와 SHA-256(소문자 hex). crypto.subtle은 그 PC 안에서 계산한다(네트워크 아님) */
async function measure(text: string): Promise<{ bytes: number; sha256: string }> {
  const encoded = new TextEncoder().encode(text)
  const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', encoded))
  let hex = ''
  for (const byte of digest) hex += byte.toString(16).padStart(2, '0')
  return { bytes: encoded.length, sha256: hex }
}

export function createAssembler(): Assembler {
  const pending = new Map<string, Pending>()
  /** end·abort로 끝난 요청. 늦게 온 조각·두 번째 end를 받지 않는다 */
  const closed = new Set<string>()
  const results = new Map<string, Promise<AssembleResult>>()
  const waiters = new Map<string, Array<(result: Promise<AssembleResult>) => void>>()

  function finish(id: string, result: Promise<AssembleResult>): Promise<AssembleResult> {
    pending.delete(id)
    closed.add(id)
    const waiting = waiters.get(id)
    if (waiting) {
      waiters.delete(id)
      for (const resolve of waiting) resolve(result)
    } else {
      results.set(id, result)
      if (results.size > KEEP_RESULTS) results.delete(results.keys().next().value as string)
    }
    return result
  }

  async function join(entry: Pending, count: number, bytes: number, sha256: string): Promise<AssembleResult> {
    if (entry.broken || !Number.isSafeInteger(count) || count < 1 || entry.parts.size !== count) return PARTIAL
    const ordered: string[] = []
    for (let seq = 0; seq < count; seq++) {
      const part = entry.parts.get(seq)
      if (part === undefined) return PARTIAL // 빠진 조각(남는 조각이 있으면 수가 맞아도 여기서 빈다)
      ordered.push(part)
    }
    entry.parts.clear() // 모은 조각은 글자 하나로만 둔다
    const text = ordered.join('')
    const measured = await measure(text)
    return measured.bytes === bytes && measured.sha256 === sha256 ? { ok: true, text } : PARTIAL
  }

  return {
    chunk(id: string, seq: number, data: string): void {
      if (closed.has(id)) return
      let entry = pending.get(id)
      if (!entry) {
        entry = { parts: new Map(), broken: false }
        pending.set(id, entry)
      }
      if (entry.broken) return
      if (!Number.isSafeInteger(seq) || seq < 0 || typeof data !== 'string' || entry.parts.has(seq)) {
        entry.broken = true // 틀린 seq·같은 seq 두 번: 이 요청은 end에서 버린다
        entry.parts.clear()
        return
      }
      entry.parts.set(seq, data)
    },

    end(id: string, count: number, bytes: number, sha256: string): Promise<AssembleResult> {
      if (closed.has(id)) return Promise.resolve(PARTIAL)
      const entry = pending.get(id) ?? { parts: new Map<number, string>(), broken: false }
      pending.delete(id)
      closed.add(id)
      return finish(id, join(entry, count, bytes, sha256).catch(() => PARTIAL))
    },

    abort(id: string): void {
      if (closed.has(id)) return
      finish(id, Promise.resolve(PARTIAL))
    },

    take(id: string): Promise<AssembleResult> {
      const done = results.get(id)
      if (done) {
        results.delete(id)
        return done
      }
      if (closed.has(id)) return Promise.resolve(PARTIAL) // 이미 찾아 갔거나 오래돼 버린 결과
      return new Promise<AssembleResult>((resolve) => {
        const list = waiters.get(id) ?? []
        list.push((result) => void result.then(resolve))
        waiters.set(id, list)
      })
    },
  }
}
