import { createHash, timingSafeEqual } from 'node:crypto'
import { callClaude } from '../../claude'
import { readBatch, submitBatch } from '../batch'
import { collectorClient, collectorStore } from '../collectStore'
import { runCollector, type RunReport } from '../collector'
import { fetchSite } from '../fetchSite'
import { defaultRuleIndex, type RuleBasisIndex } from '../ruleMatch'

// GET /api/ai/notices/collect (specs/notices REQ-7416, design 1·4절, ADR-034). Vercel Cron이 하루 아홉 번 부르는 고시·공지 모으기.
// 세션 없이 오므로 문지기(lib/auth/gate.ts)가 이 주소만 공개로 두고, 여기서 `Authorization: Bearer <CRON_SECRET>`를 같은 시간 비교로 본다.
// CRON_SECRET이 비었거나 머리가 다르면 401(몸통 없음)이고 사이트·DB·Claude를 부르지 않는다.
// 맞으면 모으기 계정으로 로그인해 runCollector를 한 번 돌리고 숫자와 출처 이름만 돌려준다.
// 로그는 { code }로 답할 때 console.error('[api/ai/notices/collect]', code) 한 줄뿐이다(비밀·머리·결과·오류 내용은 남기지 않는다).
// 이 파일은 Next가 아는 이름(GET·runtime·maxDuration·dynamic)만 export한다
export const runtime = 'nodejs'
/** Vercel 무료판 최대. 모으기 시간 표(collector.ts: 바로 요약 시작 ~170초 + 부름 한도 100초, 지난 글 ~250초)가 이 안에 든다 */
export const maxDuration = 300
export const dynamic = 'force-dynamic'

const LOG = '[api/ai/notices/collect]'

type CollectErrorCode = 'E-NOTICE-LOGIN' | 'E-NOTICE-RUN'

function fail(code: CollectErrorCode): Response {
  console.error(LOG, code)
  return Response.json({ code }, { status: 500 })
}

// 같은 길이의 해시끼리 같은 시간 비교 — 머리 길이로도 비밀을 알 수 없게 한다
const digest = (s: string) => createHash('sha256').update(s, 'utf8').digest()

function authorized(request: Request): boolean {
  const secret = process.env.CRON_SECRET ?? ''
  if (secret.trim() === '') return false
  const header = request.headers.get('authorization') ?? ''
  return timingSafeEqual(digest(header), digest(`Bearer ${secret}`))
}

// 규칙 색인을 못 불러오면 null — 모으기는 요약만 미루고 나머지를 한다
async function ruleIndex(): Promise<RuleBasisIndex | null> {
  try {
    return await defaultRuleIndex()
  } catch {
    return null
  }
}

// 실행 결과에서 숫자 칸과 출처 이름만 옮긴다(다른 칸이 와도 내보내지 않는다)
function reportBody(r: RunReport) {
  return {
    ok: true,
    new: { hira_notice: r.new.hira_notice, hira_crtr: r.new.hira_crtr, mohw_rss: r.new.mohw_rss },
    stopped: [...r.stopped],
    summarized: r.summarized,
    batched: r.batched,
    collected: r.collected,
    failed: r.failed,
  }
}

export async function GET(request: Request): Promise<Response> {
  if (!authorized(request)) return new Response(null, { status: 401 })

  const client = await collectorClient()
  if (client === null) return fail('E-NOTICE-LOGIN')

  let result: RunReport | 'busy' | 'failed'
  try {
    result = await runCollector({
      store: collectorStore(client),
      fetchSite,
      callClaude,
      submitBatch,
      readBatch,
      ruleIndex: await ruleIndex(),
      nowMs: () => Date.now(),
      now: () => new Date(),
    })
  } catch {
    return fail('E-NOTICE-RUN')
  }
  // 다른 실행이 돌고 있으면 그 실행이 한다(오류가 아니다)
  if (result === 'busy') return Response.json({ ok: true, busy: true }, { status: 200 })
  if (result === 'failed') return fail('E-NOTICE-RUN')
  return Response.json(reportBody(result), { status: 200 })
}
