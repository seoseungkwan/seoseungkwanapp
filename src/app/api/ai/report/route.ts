import { NotSignedInError, readMe } from '@/lib/auth/hospital.server'
import { isMonth, monthOf, todayInKorea } from '@/lib/analytics/dates'
import { supabaseServer } from '@/lib/supabase/server'
import type { AiErrorCode, ReportView, SavedReport, ShownReport } from '@/types/aiReport'
import { callClaude } from '../claude'
import { generateReport, isReportStale } from '../generate'
import { addUsage, loadHonorific, loadReportMonths, readSavedReport, readUsage, saveReport } from '../store'

// POST /api/ai/report (spec ai-report REQ-512). 몸통은 { month } 하나뿐 — 숫자는 서버가 DB에서 읽는다.
// GET /api/ai/report?month= (spec ai-report-screen REQ-706). 저장된 리포트·숫자 바뀜·이번 달 사용량을 한 번에 답한다.
// 400·401·403은 상태만 보낸다(몸통 없음, 로그 없음). { code }로 답하는 모든 경우에 console.error('[api/ai/report]', code) 한 줄만
// 이 파일은 Next가 아는 이름(GET·POST·runtime·maxDuration)만 export한다
export const runtime = 'nodejs'
export const maxDuration = 120

const STATUS: Record<AiErrorCode, number> = {
  'E-AI-NO-DATA': 404,
  'E-AI-LIMIT': 402,
  'E-AI-BUSY': 503,
  'E-AI-FAILED': 502,
}

function status(code: number): Response {
  return new Response(null, { status: code })
}

function fail(code: AiErrorCode): Response {
  console.error('[api/ai/report]', code)
  return Response.json({ code }, { status: STATUS[code] })
}

// GET의 502. E-AI-READ는 POST가 쓰지 않으므로 fail()·STATUS·AiErrorCode에 넣지 않는다(AC-701.1)
function readFailed(): Response {
  console.error('[api/ai/report]', 'E-AI-READ')
  return Response.json({ code: 'E-AI-READ' }, { status: 502 })
}

// 화면으로 나가는 칸만 고른다. 저장 지문(inputHash)은 보내지 않는다
function shownReport(saved: SavedReport): ShownReport {
  return {
    month: saved.month,
    partial: saved.partial,
    summary: saved.summary,
    cards: saved.cards,
    model: saved.model,
    createdAt: saved.createdAt,
  }
}

// { month: 'YYYY-MM' } 하나이고 이번 달(한국 날짜) 이전이면 그 달, 아니면 null
async function readMonth(request: Request): Promise<string | null> {
  let body: unknown
  try {
    body = await request.json()
  } catch {
    return null
  }
  if (typeof body !== 'object' || body === null || Array.isArray(body)) return null
  const keys = Object.keys(body)
  if (keys.length !== 1 || keys[0] !== 'month') return null
  const month = (body as { month: unknown }).month
  if (typeof month !== 'string' || !isMonth(month)) return null
  return month <= monthOf(todayInKorea()) ? month : null
}

export async function GET(request: Request): Promise<Response> {
  // 승인 확인이 먼저다(POST와 순서가 다르다, 명세대로). 통과하기 전에는 supabaseServer를 부르지 않는다
  let approved: boolean
  try {
    const me = await readMe()
    approved = me.hospital !== null && me.hospital.status === 'approved'
  } catch (err) {
    if (err instanceof NotSignedInError) return status(401)
    return readFailed()
  }
  if (!approved) return status(403)

  try {
    const month = new URL(request.url).searchParams.get('month')
    const thisMonth = monthOf(todayInKorea())
    if (month === null || !isMonth(month) || month > thisMonth) return status(400)

    // 함께 부른다. 차례로 부르면 망이 끊겼을 때 라이브러리 재시도 시간이 쌓인다. 사용량은 고른 달이 아니라 이번 달이다
    const sb = await supabaseServer()
    const [saved, usage] = await Promise.all([readSavedReport(sb, month), readUsage(sb, thisMonth)])
    if (saved === 'failed' || usage === 'failed') return readFailed()

    const stale = saved !== null && (await isReportStale(month, saved.inputHash, (m) => loadReportMonths(sb, m)))
    const view: ReportView = { report: saved === null ? null : shownReport(saved), stale, usage }
    return Response.json(view, { status: 200, headers: { 'Cache-Control': 'no-store' } })
  } catch {
    return readFailed()
  }
}

export async function POST(request: Request): Promise<Response> {
  const month = await readMonth(request)
  if (month === null) return status(400)

  // 승인 다시 확인. 통과하기 전에는 supabaseServer·흐름을 부르지 않는다
  let approved: boolean
  try {
    const me = await readMe()
    approved = me.hospital !== null && me.hospital.status === 'approved'
  } catch (err) {
    if (err instanceof NotSignedInError) return status(401)
    // HospitalReadError와 그 밖의 오류 모두 502 (오류 내용은 남기지 않는다)
    return fail('E-AI-FAILED')
  }
  if (!approved) return status(403)

  try {
    const sb = await supabaseServer()
    const result = await generateReport(month, {
      loadMonths: (m) => loadReportMonths(sb, m),
      // 시스템 글의 받는 사람: 같은 사용자 세션으로 서버가 병원 정보 호칭을 읽는다(clinic-profile AC-6606.4)
      loadHonorific: () => loadHonorific(sb),
      callClaude,
      saveReport: (r) => saveReport(sb, r),
      addUsage: (u) => addUsage(sb, u),
      now: () => new Date(),
    })
    if (result.ok) return Response.json({ report: result.report }, { status: 200 })
    return fail(result.code)
  } catch {
    return fail('E-AI-FAILED')
  }
}
