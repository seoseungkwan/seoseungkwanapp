import { todayInKorea } from '@/lib/analytics/dates'
import { checkQuery } from '@/lib/location/query'
import type { Adapter, Query, QueryKind, QueryReply, Registry, SiteRequest } from '@/types/location'
import { fetchSource, isNotRegistered, readKey, type SourceKey } from '../fetchSource'
import { emptyReply, guardAdmin, jsonReply } from '../guard'
import { REGISTRY } from '../registry'

// POST /api/ai/location/query (specs/location REQ-7903, design.md 3·4절, ADR-043). 관리자 화면 대신 바깥 공개 자료를 부른다.
// 관리자 확인 → 몸통 검사 → 종류의 읽는 곳 → 열쇠(서버 환경 변수) → 요청을 동시에 2개씩 정해 둔 host로 → 답 읽기 → { ok, value, src, asOf }.
// Claude는 부르지 않고, DB에 쓰지 않고, 아무것도 담아 두지 않는다(카카오 답 포함). 400·401·403·500은 몸통 없음, 나머지는 200 + 몸통.
// 로그는 console.error('[api/ai/location]', 오류 번호, 종류) 한 줄만 — 좌표·주소·답 글자·열쇠는 남기지 않는다.
// 하위 부르기마다 시간 한도는 읽는 곳의 timeoutMs(비급여 60초·인구 20초·체력단련장 15초), 없으면 8초. 읽는 곳의 retryTimeout이 참이면
// 시간 한도를 넘은 하위 부르기만 한 번 더 부른다(design.md 3절, TASK-88). 실행 한도 120초 = 비급여 한 번 60초 + 의원 목록 과목 열아홉을
// 둘씩 부를 시간(Vercel 무료판 최대 300초 안, 다른 AI 경로와 같은 값, design.md 3절).
// 이 파일은 Next가 아는 이름(POST·runtime·maxDuration)만 export한다
export const runtime = 'nodejs'
export const maxDuration = 120

const LOG = '[api/ai/location]'
// 한 요청 안 하위 부르기 한도(design.md 4절 '쪽'의 가장 큰 값)와 동시에 부르는 수
const MAX_REQUESTS = 30
const RUNNING = 2

type Fail = 'not-applied' | 'failed'

function failed(code: Fail, kind: QueryKind): QueryReply {
  console.error(LOG, code === 'failed' ? 'E-LOC-SOURCE' : code, kind)
  return { ok: false, code }
}

// 요청을 동시에 RUNNING개씩 부르고 답 글자를 요청 차례로 모은다. 하나라도 못 받으면 남은 것은 새로 부르지 않는다.
// retry가 참이면 시간 한도를 넘은(timeout) 하위 부르기만 같은 요청으로 한 번 더 부른다 — 두 번째도 넘거나 다른 실패면 그대로 실패.
// 공공 자료 답이 '미등록 열쇠'(200 + 결과 코드 20·30, 또는 401·403 + 미등록 몸통 → fetchSource가 not-applied)면 not-applied —
// 다른 하위 부르기가 먼저 실패했어도 실패보다 앞선다
async function fetchAll(
  requests: readonly SiteRequest[],
  key: SourceKey,
  timeoutMs: number | undefined,
  retry: boolean,
): Promise<string[] | Fail> {
  const texts: string[] = new Array<string>(requests.length)
  let next = 0
  let stop: Fail | null = null
  const lane = async () => {
    while (stop === null && next < requests.length) {
      const i = next
      next += 1
      let got = await fetchSource(requests[i], key, timeoutMs)
      if (retry && !got.ok && got.fail === 'timeout') got = await fetchSource(requests[i], key, timeoutMs)
      if (!got.ok && got.fail === 'not-applied') {
        stop = 'not-applied'
        return
      }
      if (!got.ok) {
        stop ??= 'failed'
        return
      }
      if (key.kind === 'data' && isNotRegistered(got.text)) {
        stop = 'not-applied'
        return
      }
      texts[i] = got.text
    }
  }
  await Promise.all(Array.from({ length: Math.min(RUNNING, requests.length) }, lane))
  return stop ?? texts
}

// 받을 쪽 수: 읽는 곳의 pagesNeeded(1쪽 답)를 1~요청 수로 자른다. 던지거나 정수가 아니면 요청 수
function pagesOf(adapter: Adapter, first: string, q: Query, max: number): number {
  let n: number
  try {
    n = adapter.pagesNeeded!(first, q as never)
  } catch {
    return max
  }
  return Number.isInteger(n) ? Math.min(Math.max(n, 1), max) : max
}

async function answer(q: Query, registry: Registry): Promise<QueryReply> {
  const adapter = registry[q.kind] as Adapter | undefined
  if (adapter === undefined || adapter.kind !== q.kind) return failed('failed', q.kind)
  const value = readKey(adapter.key)
  if (value === null) return { ok: false, code: 'no-key', key: adapter.key }

  let requests: SiteRequest[]
  try {
    requests = adapter.requests(q)
  } catch {
    return failed('failed', q.kind)
  }
  if (!Array.isArray(requests) || requests.length > MAX_REQUESTS) return failed('failed', q.kind)

  const key: SourceKey = { kind: adapter.key, value }
  const retry = adapter.retryTimeout === true
  let texts: string[] | Fail
  if (adapter.pagesNeeded !== undefined && requests.length > 1) {
    // 1쪽을 먼저 받아 몇 쪽까지 받을지 정하고 나머지만 더 부른다(design.md 3절, TASK-91)
    const first = await fetchAll(requests.slice(0, 1), key, adapter.timeoutMs, retry)
    if (!Array.isArray(first)) return failed(first, q.kind)
    texts = first
    const more = pagesOf(adapter, first[0], q, requests.length)
    if (more > 1) {
      const rest = await fetchAll(requests.slice(1, more), key, adapter.timeoutMs, retry)
      texts = Array.isArray(rest) ? [...first, ...rest] : rest
    }
  } else {
    texts = await fetchAll(requests, key, adapter.timeoutMs, retry)
  }
  if (!Array.isArray(texts)) return failed(texts, q.kind)
  try {
    const parsed = adapter.parse(texts, q, todayInKorea())
    if (!parsed.ok) return failed(parsed.code === 'not-applied' ? 'not-applied' : 'failed', q.kind)
    return { ok: true, value: parsed.value, src: adapter.src, asOf: parsed.asOf }
  } catch {
    // 답 모양이 다름(읽는 곳이 던짐). 오류 글은 버린다
    return failed('failed', q.kind)
  }
}

// 경로 처리: 읽는 곳 판(registry)을 받는다(시험은 가짜 판을 넣는다)
async function handle(request: Request, registry: Registry): Promise<Response> {
  const denied = await guardAdmin()
  if (denied !== null) return denied
  let body: unknown
  try {
    body = await request.json()
  } catch {
    return emptyReply(400)
  }
  const q = checkQuery(body)
  if (q === null) return emptyReply(400)
  return jsonReply(await answer(q, registry))
}

export async function POST(request: Request): Promise<Response> {
  return handle(request, REGISTRY)
}
