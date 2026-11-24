import { supabaseBrowser } from '@/lib/supabase/browser'

// 다른 의원 보기·관리자 화면의 브라우저 → DB 함수 부르기(spec admin-view REQ-8005, design.md '브라우저 함수'). 서버 코드가 아니다(ADR-004·ADR-046).
// 다섯 모두 정의자 함수 하나를 한 번만 부르고 표는 쓰지 않는다 — 함수가 부른 사람이 관리자인지·승인된 의원인지·허용한 지역인지 본다
// (supabase/adminView.rls.test.ts가 증명). 답은 믿지 않는다: 줄 하나라도 모양이 틀리면 반쪽 목록 대신 막는다.
// 실패는 AdminViewError 하나로 던진다 → 화면은 정해 둔 오류 번호 글만 보인다(원래 오류는 cause에만 둔다). 저절로 다시 부르지 않는다
export class AdminViewError extends Error {}

/** regionSet = 관리자가 지역을 정했는지(정했는데 region null = '지역 모름'으로 정함). mine = 내(부른 관리자) 의원 */
export type ViewHospital = { hospitalId: string; name: string; address: string | null; regionSet: boolean; region: string | null; mine: boolean }
/** 본 기록 한 줄(최근 30일, DB가 최근 먼저 준다). 본 관리자의 의원 이름·메일은 없을 수 있다 */
export type ViewLogRow = { startedAt: string; viewerName: string | null; viewerEmail: string | null; hospitalId: string; hospitalName: string }

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

type Reply = { data: unknown; error: unknown }
type ReadRow = Record<string, unknown>

const isRecord = (value: unknown): value is ReadRow => typeof value === 'object' && value !== null && !Array.isArray(value)
const isFilled = (value: unknown): value is string => typeof value === 'string' && value !== ''
const isTextOrNull = (value: unknown): value is string | null => value === null || typeof value === 'string'

/** 클라이언트 만들기·보내기·오류 답을 한 곳에서 AdminViewError로 바꾼다(원래 오류는 cause에만) */
async function call(message: string, send: (client: ReturnType<typeof supabaseBrowser>) => PromiseLike<Reply>): Promise<unknown> {
  let reply: Reply
  try {
    reply = await send(supabaseBrowser())
  } catch (cause) {
    throw new AdminViewError(message, { cause })
  }
  if (reply.error) throw new AdminViewError(message, { cause: reply.error })
  return reply.data
}

/** 목록 답의 줄마다 바꾼다. 목록이 아니거나 줄 하나라도 틀리면 AdminViewError */
function rowsOf<T>(message: string, data: unknown, toRow: (row: ReadRow) => T | null): T[] {
  if (!Array.isArray(data)) throw new AdminViewError(message)
  return data.map((row: unknown) => {
    const shaped = isRecord(row) ? toRow(row) : null
    if (shaped === null) throw new AdminViewError(message)
    return shaped
  })
}

function toViewHospital(row: ReadRow): ViewHospital | null {
  const { hospital_id, name, address, region_set, region, is_me } = row
  if (!isFilled(hospital_id) || typeof name !== 'string' || !isTextOrNull(address)) return null
  if (typeof region_set !== 'boolean' || !isTextOrNull(region) || typeof is_me !== 'boolean') return null
  return { hospitalId: hospital_id, name, address, regionSet: region_set, region, mine: is_me }
}

function toViewLogRow(row: ReadRow): ViewLogRow | null {
  const { started_at, viewer_name, viewer_email, hospital_id, hospital_name } = row
  if (!isFilled(started_at) || !isTextOrNull(viewer_name) || !isTextOrNull(viewer_email)) return null
  if (!isFilled(hospital_id) || typeof hospital_name !== 'string') return null
  return { startedAt: started_at, viewerName: viewer_name, viewerEmail: viewer_email, hospitalId: hospital_id, hospitalName: hospital_name }
}

/** 보기 시작: rpc('start_admin_view') 한 번 → 본 기록 줄 id = 보기 열쇠(uuid, 소문자). 쿠키에 두기는 부른 쪽이 한다 */
export async function startAdminView(hospitalId: string): Promise<string> {
  const message = '다른 의원 화면을 열지 못했어요'
  const key = await call(message, (client) => client.rpc('start_admin_view', { p_hospital_id: hospitalId }))
  if (typeof key !== 'string' || !UUID.test(key)) throw new AdminViewError(message)
  return key.toLowerCase()
}

/** 보기 끝: rpc('stop_admin_view') 한 번(이 브라우저 열쇠의 줄에 끝 시각). 쿠키 지우기는 부른 쪽이 한다 */
export async function stopAdminView(): Promise<void> {
  await call('보기를 끝내지 못했어요', (client) => client.rpc('stop_admin_view'))
}

/** 보는 의원 판·의원 비교의 승인된 의원 모두(내 의원 포함). rpc('admin_view_hospitals') 한 번, 받은 차례 그대로 */
export async function listViewHospitals(): Promise<ViewHospital[]> {
  const message = '의원 목록을 읽지 못했어요'
  const data = await call(message, (client) => client.rpc('admin_view_hospitals'))
  return rowsOf(message, data, toViewHospital)
}

/** 본 기록(최근 30일). rpc('admin_view_log') 한 번, 받은 차례(최근 먼저) 그대로 */
export async function readViewLog(): Promise<ViewLogRow[]> {
  const message = '본 기록을 읽지 못했어요'
  const data = await call(message, (client) => client.rpc('admin_view_log'))
  return rowsOf(message, data, toViewLogRow)
}

/** 지역 고치기. sido null = '지역 모름'으로 정함. rpc('set_hospital_region') 한 번, 허용한 지역인지는 함수가 본다 */
export async function setHospitalRegion(hospitalId: string, sido: string | null): Promise<void> {
  await call('지역을 바꾸지 못했어요', (client) => client.rpc('set_hospital_region', { p_hospital_id: hospitalId, p_sido: sido }))
}
