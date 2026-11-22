import type { Adapter, KeyKind, KeyState, KeysReply, Query, Registry, SiteRequest } from '@/types/location'
import { fetchSource, isNotRegistered, readKey } from '../fetchSource'
import { guardAdmin, jsonReply } from '../guard'
import { REGISTRY } from '../registry'

// GET /api/ai/location/keys (specs/location REQ-7903 AC-7903.5, design.md 3절). 열쇠 둘의 상태만 알린다.
// 비었으면 missing. 있으면 작은 부르기 하나(카카오 k-address '서울특별시청', 공공 household 행정동 하나의 첫 요청)로
// 됨 ok · 거절(401·403·공공데이터포털 미등록 열쇠 답) rejected · 그 밖의 실패 failed. 답은 읽지 않고 아무것도 저장·로그하지 않는다.
// 이 파일은 Next가 아는 이름(GET·runtime·maxDuration)만 export한다
export const runtime = 'nodejs'
export const maxDuration = 30

// 열쇠마다 확인에 쓰는 몸통(몸통 검사 checkQuery를 지나는 모양). 행정동은 서울 종로구 청운효자동
const CHECKS: Readonly<Record<KeyKind, Query>> = {
  kakao: { kind: 'k-address', q: '서울특별시청' },
  data: { kind: 'household', dongs: ['1111051500'], ym: '2025-10' },
}

async function check(kind: KeyKind, registry: Registry): Promise<KeyState> {
  const value = readKey(kind)
  if (value === null) return 'missing'
  const q = CHECKS[kind]
  const adapter = registry[q.kind] as Adapter | undefined
  if (adapter === undefined || adapter.kind !== q.kind || adapter.key !== kind) return 'failed'
  let first: SiteRequest | undefined
  try {
    first = adapter.requests(q)[0]
  } catch {
    return 'failed'
  }
  if (first === undefined) return 'failed'
  const got = await fetchSource(first, { kind, value })
  if (!got.ok) return got.fail === 'http' && (got.status === 401 || got.status === 403) ? 'rejected' : 'failed'
  return kind === 'data' && isNotRegistered(got.text) ? 'rejected' : 'ok'
}

// 경로 처리: 읽는 곳 판(registry)을 받는다(시험은 가짜 판을 넣는다)
async function handle(registry: Registry): Promise<Response> {
  const denied = await guardAdmin()
  if (denied !== null) return denied
  const [data, kakao] = await Promise.all([check('data', registry), check('kakao', registry)])
  const reply: KeysReply = { data, kakao }
  return jsonReply(reply)
}

export async function GET(): Promise<Response> {
  return handle(REGISTRY)
}
