import 'server-only'
import Anthropic from '@anthropic-ai/sdk'
import type { BatchCreateParams, MessageBatch, MessageBatchIndividualResponse } from '@anthropic-ai/sdk/resources/messages/batches'
import type { ContentBlock, Message, MessageParam, StopReason } from '@anthropic-ai/sdk/resources/messages/messages'
import { costMicroUsd } from '@/lib/ai/cost'
import type { AiUsage } from '@/types/aiReport'
import { MAX_TOKENS, MODEL, type ClaudeRequest } from '../claude'

// 고시·공지 일괄 요약(spec notices AC-7412.2·AC-7412.3, design 8절). 올라온 지 3일 지난 글을 Message Batches(반값)로 보내고
// 다음 실행이 거둔다. 일괄은 fallbacks·stream이 안 된다 → 거절·실패는 다음 실행에 바로 부르기(callClaude, fallbacks 있음)로 다시 간다
// 열쇠는 서버 환경 변수 ANTHROPIC_API_KEY만. 열쇠·오류 내용·요청·답 글자는 결과·로그에 담지 않는다(이 파일은 console을 쓰지 않는다)

// 한 일괄에 담는 몸통 합(줄마다 JSON.stringify({ custom_id, params })의 UTF-8 바이트)과 개수. API 한도(256MB·10만 개)보다 작게 잡았다
export const BATCH_MAX_BYTES = 50_000_000
export const BATCH_MAX_COUNT = 200
// 부르기 한 번(보내기, 또는 상태 + 결과 읽기)의 전체 시간 한도. 모으기 실행(300초)의 일괄 준비(~230초) 뒤에 보내도 넘지 않게
export const BATCH_CALL_TIMEOUT_MS = 40_000

type CallOptions = { signal?: AbortSignal }

// 시험이 넣는 작은 모양. 진짜 Anthropic 클라이언트(client.messages.batches, SDK 1.3.0)도 이 모양에 맞는다
export type BatchClientLike = {
  messages: {
    batches: {
      create(params: BatchCreateParams, options?: CallOptions): Promise<Pick<MessageBatch, 'id'>>
      retrieve(id: string, params?: undefined, options?: CallOptions): Promise<Pick<MessageBatch, 'processing_status'>>
      results(id: string, params?: undefined, options?: CallOptions): Promise<AsyncIterable<MessageBatchIndividualResponse>>
    }
  }
}

// id = 글(묶음) id = custom_id
export type BatchItem = { id: string; req: ClaudeRequest }
// left: 담지 못했거나(한도) 보내지 못한(실패·빈 목록·열쇠 없음) 요청. ok: false면 받은 것 모두다
export type SubmitResult = { ok: true; batchId: string; sent: string[]; left: BatchItem[] } | { ok: false; left: BatchItem[] }
// 실패의 usage: 답은 받았지만 거절·잘림으로 끝난 것만(비용 세기용). errored·expired·canceled는 없다
export type BatchOutcome = { ok: true; text: string; usage: AiUsage } | { ok: false; usage?: AiUsage }
// 'failed': 상태·결과를 읽지 못함(망·없는 id 등). 일괄은 그대로 두고 다음 실행이 다시 읽는다
export type BatchRead = 'processing' | 'failed' | Map<string, BatchOutcome>

type BatchDeps = { client?: BatchClientLike; apiKey?: string; timeoutMs?: number }

// 답이 끝까지 쓰이지 않은 끝남(거절·잘림)
const FAILED_STOPS: ReadonlySet<StopReason> = new Set<StopReason>(['refusal', 'max_tokens', 'model_context_window_exceeded'])

export async function submitBatch(items: BatchItem[], deps?: BatchDeps): Promise<SubmitResult> {
  const apiKey = deps?.apiKey ?? process.env.ANTHROPIC_API_KEY
  if (!apiKey || items.length === 0) return { ok: false, left: items }

  try {
    // 앞에서부터 한도 안에 드는 것을 담는다. 혼자 큰 것은 건너뛰고 뒤의 작은 것은 담는다(큰 것 하나가 일괄을 막지 않게)
    const requests: BatchCreateParams.Request[] = []
    const left: BatchItem[] = []
    let bytes = 0
    for (const item of items) {
      const request = batchRequest(item)
      const size = requests.length < BATCH_MAX_COUNT ? Buffer.byteLength(JSON.stringify(request), 'utf8') : Infinity
      if (bytes + size <= BATCH_MAX_BYTES) {
        requests.push(request)
        bytes += size
      } else {
        left.push(item)
      }
    }
    if (requests.length === 0) return { ok: false, left: items }

    const client = deps?.client ?? newClient(apiKey)
    const batch = await client.messages.batches.create({ requests }, { signal: callSignal(deps) })
    return { ok: true, batchId: batch.id, sent: requests.map((r) => r.custom_id), left }
  } catch {
    return { ok: false, left: items }
  }
}

export async function readBatch(batchId: string, deps?: BatchDeps): Promise<BatchRead> {
  const apiKey = deps?.apiKey ?? process.env.ANTHROPIC_API_KEY
  if (!apiKey) return 'failed'

  try {
    const client = deps?.client ?? newClient(apiKey)
    const signal = callSignal(deps)
    const batch = await client.messages.batches.retrieve(batchId, undefined, { signal })
    if (batch.processing_status !== 'ended') return 'processing'

    // 결과는 보낸 차례와 다르게 온다 → custom_id로 맞춘다. 읽다 끊기면 반쪽을 주지 않고 'failed'
    const outcomes = new Map<string, BatchOutcome>()
    for await (const row of await client.messages.batches.results(batchId, undefined, { signal })) {
      outcomes.set(row.custom_id, outcomeOf(row))
    }
    return outcomes
  } catch {
    return 'failed'
  }
}

// 일괄은 반값이다(원 미만처럼 백만분의 1달러 미만은 버린다)
export function batchCostMicroUsd(u: Pick<AiUsage, 'model' | 'inputTokens' | 'outputTokens'>): number {
  return Math.floor(costMicroUsd(u) / 2)
}

// params는 model·max_tokens·output_config·system·messages만. stream·fallbacks·betas는 일괄에서 안 되고, thinking은 보내지 않는다(Opus 5.5는 늘 adaptive)
function batchRequest(item: BatchItem): BatchCreateParams.Request {
  const { req } = item
  return {
    custom_id: item.id,
    params: {
      model: MODEL,
      max_tokens: MAX_TOKENS,
      output_config: { effort: req.effort ?? 'medium', format: { type: 'json_schema', schema: req.schema as Record<string, unknown> } },
      system: req.system,
      // 바로 부르기(beta 스트림)와 같은 요청 모양을 쓴다. 고시·공지가 넣는 글·PDF document 블록은 beta와 일괄(정식)의 보내는 모양이 같다
      messages: [{ role: 'user', content: req.user as MessageParam['content'] }],
    },
  }
}

function outcomeOf(row: MessageBatchIndividualResponse): BatchOutcome {
  if (row.result.type !== 'succeeded') return { ok: false }
  const message: Message = row.result.message
  // 일괄은 fallbacks가 없어 시도가 하나다 → 맨 위 usage가 전부다
  const usage: AiUsage = { inputTokens: message.usage.input_tokens, outputTokens: message.usage.output_tokens, model: message.model }
  if (message.stop_reason !== null && FAILED_STOPS.has(message.stop_reason)) return { ok: false, usage }
  return { ok: true, text: answerText(message.content), usage }
}

function answerText(content: ContentBlock[]): string {
  let text = ''
  for (const block of content) {
    if (block.type === 'text') text += block.text
  }
  return text
}

function newClient(apiKey: string): BatchClientLike {
  return new Anthropic({ apiKey, timeout: BATCH_CALL_TIMEOUT_MS, maxRetries: 1, logLevel: 'off' })
}

// SDK timeout은 시도 한 번의 응답 머리만 잰다. 재시도·결과 받기까지 덮는 신호 하나를 넣는다
function callSignal(deps?: BatchDeps): AbortSignal {
  return AbortSignal.timeout(deps?.timeoutMs ?? BATCH_CALL_TIMEOUT_MS)
}
