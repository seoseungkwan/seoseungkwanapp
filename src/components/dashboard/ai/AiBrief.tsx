'use client'

import Link from 'next/link'
import { useId, type ReactNode } from 'react'
import { ErrorCard } from '@/components/common/ErrorCard'
import { Icon } from '@/components/common/Icon'
import { ds } from '@/components/ui/classes'
import { TAG_LABEL } from '@/lib/ai/markdown'
import { briefGroups, compareMonths, longMonth, madeAtText, modelBasis, partialNotice, shortMonth } from '@/lib/ai/reportScreen'
import { errorInfo } from '@/lib/errors'
import type { CardTag, ReportCard, ShownReport } from '@/types/aiReport'
import { useAiBrief, type AiBriefState, type BriefFailCode } from './useAiBrief'

// 대시보드 AI 경영 리포트 요약(dashboard-ux REQ-2704·AC-2707.3, design.md §5, 시안 docs/mockups/dashboard-ux/index.html ai()). 글자는 명세가 이긴다(사용자 반영 ③).
// 상태와 부르기는 useAiBrief가 맡고 여기서는 그리기만 한다. AI 글(summary·text·basis)은 JSX 글자로만 그린다(HTML로 넣지 않는다).
// 오류 글·번호는 lib/errors.ts에서만 가져온다. 대시보드에서는 리포트가 없을 때만 만든다 — 다시 만들기는 AI 리포트 화면에서만(범위 밖).
// 상자는 토큰만 쓴다: canvas 바탕 · 8px 모서리 · 안쪽 24px(폰 16px), 그라데이션·그림자·장식 없음(AC-2707.3)

const SENDS_ONLY = '병원 집계 숫자만 보내요. 환자 이름·차트번호는 보내지 않아요.'
const NUMBERS_NOTE = '근거 줄의 숫자는 앱이 저장된 통계에서 붙였어요. AI 문장에는 숫자가 없어요.'
const GUESS_NOTE = "'추정'은 자료에 없는 원인을 짐작한 글이라 확정된 사실이 아니에요."
const STALE_TITLE = '이 리포트를 만든 뒤 숫자가 바뀌었어요'
const STALE_BODY = '전체 리포트에서 [다시 분석]을 누르면 새 숫자로 다시 써요.'

// 리포트가 없을 때 받는 것 셋(시안 none)
const GAINS = [
  { name: '핵심 변화', desc: '늘거나 준 지표' },
  { name: '주의할 지표', desc: '살펴볼 만한 흐름' },
  { name: '추정', desc: '원인 짐작은 짐작이라고 따로 표시' },
] as const

// 카드 묶음 셋의 이름과 차례(AC-2704.2)
const GROUPS = [
  { key: 'change', title: '핵심 변화' },
  { key: 'watch', title: '주의할 지표' },
  { key: 'guess', title: '원인 짐작' },
] as const

// 꼬리표 칩(AI 리포트 화면과 같은 색): 늘었어요 positive ↑ · 줄었어요 negative ↓ · 살펴볼 것 warning · 추정 보조
const TAG_CHIP: Readonly<Record<CardTag, { className: string; icon: ReactNode }>> = {
  up: { className: ds.chip.positive, icon: <Icon name="arrowDown" size={12} className="rotate-180" /> },
  down: { className: ds.chip.negative, icon: <Icon name="arrowDown" size={12} /> },
  watch: { className: ds.chip.warning, icon: null },
  guess: { className: ds.chip.neutral, icon: null },
}

const BAR = 'block rounded-control bg-line' // 뼈대 한 토막(DashboardSkeleton과 같다)
const BONE_COLUMNS = [0, 1, 2] as const
const STATE_TITLE = 'mt-4 text-lead font-semibold text-ink'
const STATE_LINE = 'mt-1 max-w-160 text-body text-ink-2'
const ACTIONS = 'mt-4 flex flex-wrap items-center gap-x-3 gap-y-2'
const SMALL_NOTE = 'text-caption text-muted'

function Note({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="rounded-control bg-warning-soft px-4 py-3 text-small text-ink-2">
      <p className="font-semibold text-warning">{title}</p>
      <p>{children}</p>
    </div>
  )
}

function CardGroup({ title, cards }: { title: string; cards: readonly ReportCard[] }) {
  return (
    <div className="min-w-0">
      <h3 className="border-b border-line-strong pb-2 text-small font-semibold text-ink-2">{title}</h3>
      <ul>
        {cards.map((card, index) => (
          // 받은 차례 그대로 그리기만 한다(같은 문장이 둘일 수 있어 순번을 쓴다)
          <li key={index} className="border-b border-line py-3">
            <span className={TAG_CHIP[card.tag].className}>
              {TAG_CHIP[card.tag].icon}
              {TAG_LABEL[card.tag]}
            </span>
            <p className="mt-1.5 text-body text-ink">{card.text}</p>
            <p className="mt-1 text-caption text-ink-2 tabular-nums">{card.basis}</p>
          </li>
        ))}
      </ul>
    </div>
  )
}

function ReportView({ report, stale, today }: { report: ShownReport; stale: boolean; today: string }) {
  const partial = partialNotice(report, today)
  const groups = briefGroups(report.cards)
  return (
    <>
      <p className="mt-4 flex flex-wrap items-center gap-x-2 gap-y-1 text-small text-muted">
        <span className="font-semibold text-ink">{`분석 기간 ${longMonth(report.month)}`}</span>
        <span>{`${compareMonths(report.month)}과 견줘요`}</span>
        <span aria-hidden="true">·</span>
        <span>{madeAtText(report.createdAt, new Date())}</span>
        <span aria-hidden="true">·</span>
        <span className="text-ink-2">{modelBasis(report.model)}</span>
      </p>
      {(partial !== null || stale) && (
        <div className="mt-3 flex flex-col gap-2">
          {partial !== null && <Note title={partial.title}>{partial.body}</Note>}
          {stale && <Note title={STALE_TITLE}>{STALE_BODY}</Note>}
        </div>
      )}
      <p className="mt-3 max-w-204 text-title font-semibold text-pretty text-ink">{report.summary}</p>
      <div className="mt-5 grid gap-6 max-md:gap-4 md:grid-cols-3">
        {GROUPS.map(({ key, title }) => groups[key].length > 0 && <CardGroup key={key} title={title} cards={groups[key]} />)}
      </div>
      <p className="mt-4 flex flex-wrap gap-x-3 gap-y-1 text-caption text-muted">
        <span>{NUMBERS_NOTE}</span>
        <span>{GUESS_NOTE}</span>
      </p>
    </>
  )
}

// 리포트 없음 · 만드는 중 · 만들기 실패(리포트 없음). 단추는 세 상태에서 같은 요소라 누른 뒤에도 초점이 그대로 남는다
function MakeBlock({
  month,
  seconds,
  code,
  onCreate,
}: {
  month: string
  seconds: number | null // 숫자면 만드는 중
  code: BriefFailCode | null
  onCreate: () => void
}) {
  const name = shortMonth(month)
  const busy = seconds !== null
  return (
    <>
      {code !== null && (
        <div className="mt-4">
          <ErrorCard code={code} />
        </div>
      )}
      <h3 className={STATE_TITLE}>{busy ? `${name} 리포트를 만들고 있어요` : `${name} 리포트를 아직 만들지 않았어요`}</h3>
      {busy ? (
        <p role="status" className={STATE_LINE}>
          1분쯤 걸려요. 다 되면 이 자리에 요약이 나와요.
        </p>
      ) : (
        <p className={STATE_LINE}>{`${name} 숫자를 ${compareMonths(month)}과 견줘, 원장님께 드릴 짧은 보고를 써 드려요. 1분쯤 걸려요.`}</p>
      )}
      {!busy && (
        <ul className="mt-3 grid gap-3 md:grid-cols-3">
          {GAINS.map((gain) => (
            <li key={gain.name} className="rounded-control bg-surface px-3 py-2 text-small text-ink-2">
              <span className="block text-body font-semibold text-ink">{gain.name}</span>
              {gain.desc}
            </li>
          ))}
        </ul>
      )}
      <div className={ACTIONS}>
        {/* 기다림은 disabled가 아니라 aria-busy다. 누름 처리가 없고 useAiBrief도 막아 다시 눌러도 POST는 하나다 */}
        <button
          type="button"
          aria-busy={busy ? 'true' : undefined}
          onClick={busy ? undefined : onCreate}
          className={`${ds.button.primary} max-md:w-full`}
        >
          {busy ? '만드는 중' : code !== null ? '다시 분석' : 'AI 리포트 만들기'}
        </button>
        <span className={SMALL_NOTE}>{busy ? `지금까지 ${seconds}초` : SENDS_ONLY}</span>
      </div>
    </>
  )
}

function Body({ state, month, today, onCreate, onRetryRead }: { state: AiBriefState; month: string; today: string; onCreate: () => void; onRetryRead: () => void }) {
  switch (state.kind) {
    case 'loading':
      return (
        <>
          <p role="status" className="sr-only">{`${shortMonth(month)} AI 리포트를 읽고 있어요`}</p>
          <div aria-hidden="true" className="mt-4">
            <span className={`${BAR} h-3.5 w-2/5`} />
            <span className={`${BAR} mt-3 h-5.5 w-4/5`} />
            <div className="mt-5 grid gap-6 max-md:gap-4 md:grid-cols-3">
              {BONE_COLUMNS.map((column) => (
                <div key={column}>
                  <span className={`${BAR} h-3.5 w-1/2`} />
                  <span className={`${BAR} mt-3 h-14`} />
                </div>
              ))}
            </div>
          </div>
        </>
      )
    case 'readError':
      return (
        <>
          <div className="mt-4">
            <ErrorCard code="E-AI-READ" />
          </div>
          <div className={ACTIONS}>
            <button type="button" onClick={onRetryRead} className={`${ds.button.secondary} max-md:w-full`}>
              다시 읽기
            </button>
            <span className={SMALL_NOTE}>대시보드의 다른 숫자는 그대로 볼 수 있어요.</span>
          </div>
        </>
      )
    case 'noData': {
      const { what, fix } = errorInfo('E-AI-NO-DATA')
      return (
        <>
          <h3 className={STATE_TITLE}>{what}</h3>
          <p className={STATE_LINE}>{fix}</p>
          <div className={ACTIONS}>
            <Link href="/stats" className={`${ds.button.secondary} no-underline max-md:w-full`}>
              통계 탭으로
              <Icon name="arrow" size={16} />
            </Link>
            <span className={SMALL_NOTE}>오류 번호 E-AI-NO-DATA</span>
          </div>
        </>
      )
    }
    case 'report':
      return <ReportView report={state.report} stale={state.stale} today={today} />
    case 'failed':
      // 그려 둔 리포트가 있으면 지우지 않고 오류 상자만 위에 더한다(AC-2704.5)
      if (state.report !== null) {
        return (
          <>
            <div className="mt-4">
              <ErrorCard code={state.code} />
            </div>
            <ReportView report={state.report} stale={false} today={today} />
          </>
        )
      }
      return <MakeBlock month={month} seconds={null} code={state.code} onCreate={onCreate} />
    case 'busy':
      return <MakeBlock month={month} seconds={state.seconds} code={null} onCreate={onCreate} />
    case 'none':
      return <MakeBlock month={month} seconds={null} code={null} onCreate={onCreate} />
  }
}

/** 대시보드 AI 경영 리포트 요약. today: 오늘 한국 날짜(YYYY-MM-DD) — 위 기준일(고른 날)과 상관없이 지난달(firstMonth(today))을 보인다 */
export function AiBrief({ today }: { today: string }) {
  const { month, state, create, retryRead } = useAiBrief(today)
  const titleId = useId()
  const report = state.kind === 'report' || state.kind === 'failed' ? state.report : null
  return (
    <section aria-labelledby={titleId} aria-busy={state.kind === 'loading' ? 'true' : undefined} className="rounded-float bg-canvas p-6 max-md:p-4">
      <div className="flex flex-wrap items-start justify-between gap-x-6 gap-y-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <h2 id={titleId} className="text-title font-semibold text-ink">
              우리 병원 AI 경영 리포트
            </h2>
            <span className={ds.chip.accent}>{`지난달 분석 · ${shortMonth(month)}`}</span>
          </div>
          <p className="mt-1 text-small text-muted">위 기준일과 상관없이 지난달 한 달을 분석해요</p>
          <p className="mt-2 text-body text-ink-2">지난달 병원 숫자를 읽고 달라진 점과 살펴볼 지표를 짚어 드려요.</p>
        </div>
        {report !== null && (
          <Link href="/ai-report" className={`${ds.button.primary} no-underline max-md:w-full`}>
            전체 리포트 보기
            <Icon name="arrow" size={16} />
          </Link>
        )}
      </div>
      <Body state={state} month={month} today={today} onCreate={create} onRetryRead={retryRead} />
    </section>
  )
}
