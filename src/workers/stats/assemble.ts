// 통로가 Worker 포트로 넘긴 조각 → JSON 글자 하나 [환자 자료 구역]. 조각을 푸는 곳은 Worker뿐이다(통로·화면은 풀지 않는다).
// 조각 수·UTF-8 바이트 수·SHA-256이 모두 맞을 때만 글자를 돌려준다. 모양은 일반으로 둔다(id별 chunk·end·abort)

const BAD_REPLY = 'E-BRIDGE-BAD-REPLY'

// 번호만 싣는다. 자료 조각·예외 내용을 옮기지 않는다
export class StatsDataError extends Error {
  readonly code: string
  constructor(code: string) {
    super(code)
    this.name = 'StatsDataError'
    this.code = code
  }
}

async function sha256Hex(bytes: Uint8Array<ArrayBuffer>): Promise<string> {
  const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))
  return Array.from(digest, (byte) => byte.toString(16).padStart(2, '0')).join('')
}

export function createAssembler(): {
  chunk(id: string, seq: number, data: string): void
  end(id: string, count: number, bytes: number, sha256: string): Promise<string>
  abort(id: string, code: string): void
} {
  const parts = new Map<string, string[] | 'broken'>()
  const aborted = new Map<string, string>()

  return {
    chunk(id, seq, data) {
      if (aborted.has(id)) return // abort 뒤에 늦게 온 조각
      const got = parts.get(id) ?? []
      if (got === 'broken') return
      if (seq !== got.length) {
        parts.set(id, 'broken') // 번호가 어긋난 답. 모은 조각을 버린다
        return
      }
      got.push(data)
      parts.set(id, got)
    },

    async end(id, count, bytes, sha256) {
      const code = aborted.get(id)
      if (code !== undefined) throw new StatsDataError(code)
      const got = parts.get(id) ?? []
      parts.delete(id) // 맞든 틀리든 이 답은 여기서 끝이다
      if (got === 'broken' || got.length !== count) throw new StatsDataError(BAD_REPLY)
      const text = got.join('')
      const encoded = new TextEncoder().encode(text)
      if (encoded.length !== bytes || (await sha256Hex(encoded)) !== sha256) throw new StatsDataError(BAD_REPLY)
      return text
    },

    abort(id, code) {
      parts.delete(id)
      aborted.set(id, code)
    },
  }
}
