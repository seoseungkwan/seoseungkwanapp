'use client'

import Link from 'next/link'
import type { ReactNode } from 'react'
import { ErrorCard } from '@/components/common/ErrorCard'
import { Icon } from '@/components/common/Icon'
import { ds } from '@/components/ui/classes'
import { TAG_LABEL } from '@/lib/ai/markdown'
import { compareMonths, longMonth, madeAtText, modelName, partialNotice, shortMonth } from '@/lib/ai/reportScreen'
import { errorInfo } from '@/lib/errors'
import type { AiErrorCode, CardTag, ShownReport } from '@/types/aiReport'

// AI 리포트 머리 아래 본문(spec ai-report-screen REQ-708~711의 그리는 부분, design.md '화면 상태', 시안 reportView·main).
// props만 받아 그린다: 부르기·타이머·지금 시각 읽기는 화면(AiReportScreen)이 맡는다. AI 답은 JSX 글자로만 그린다.
// 시안의 em 폭은 그 글자 크기로 px을 구해 쓴다: 제목 24em × 24px = 576px → max-w-144, 요약 34em × 24px = 816px → max-w-204, 설명 34em × 16px = 544px → max-w-136

export type ReportBodyState =
  | { kind: 'loading' }
  | { kind: 'readError' }
  | { kind: 'busyEmpty'; seconds: number }
  | { kind: 'noData' }
  | { kind: 'empty'; error: Exclude<AiErrorCode, 'E-AI-NO-DATA'> | null }
  | {
      kind: 'report'
      report: ShownReport
      stale: boolean
      error: AiErrorCode | null
      busySeconds: number | null // 숫자면 다시 분석 중
      copied: boolean
    }

// 휴대폰은 한 단계 작은 제목(title 20/28, 자간 없음), 그 위는 heading-m(24/32)
const BIG_TITLE = 'text-title font-semibold text-ink md:text-heading-m'
const EMPTY_TITLE = `max-w-144 text-balance ${BIG_TITLE}`
const EMPTY_LINE = 'mt-3 max-w-136 text-lead text-ink-2'
const EMPTY_ACTIONS = 'mt-6 flex flex-wrap items-center gap-3'

const TAG_CHIP: Readonly<Record<CardTag, { className: string; icon: ReactNode }>> = {
  up: { className: ds.chip.positive, icon: <Icon name="arrowDown" size={12} className="rotate-180" /> },
  down: { className: ds.chip.negative, icon: <Icon name="arrowDown" size={12} /> },
  watch: { className: ds.chip.warning, icon: null },
  guess: { className: ds.chip.neutral, icon: null },
}

const NOTE_TONE = {
  warning: { box: 'bg-warning-soft', title: 'text-warning' },
  accent: { box: 'bg-accent-soft', title: 'text-accent-strong' },
} as const

function Note({ tone, title, live, children }: { tone: keyof typeof NOTE_TONE; title: string; live?: boolean; children: ReactNode }) {
  return (
    <div role={live ? 'status' : undefined} className={`rounded-control px-4 py-3 text-small text-ink-2 ${NOTE_TONE[tone].box}`}>
      <p className={`font-semibold ${NOTE_TONE[tone].title}`}>{title}</p>
      <p>{children}</p>
    </div>
  )
}

// 안내 묶음: 사이 8px, 본문까지 24px
function Notes({ children }: { children: ReactNode }) {
  return <div className="mb-6 flex flex-col gap-2">{children}</div>
}

function ReportView({
  state,
  today,
  now,
  onCopy,
}: {
  state: Extract<ReportBodyState, { kind: 'report' }>
  today: string
  now: Date
  onCopy: () => void
}) {
  const { report, stale, error, busySeconds, copied } = state
  const partial = partialNotice(report, today)
  const hasNotes = busySeconds !== null || error !== null || partial !== null || stale
  return (
    <>
      {hasNotes && (
        <Notes>
          {busySeconds !== null && (
            <Note tone="accent" live title="새 리포트를 만들고 있어요">
              1분쯤 걸려요. 다 되면 아래 리포트가 바뀌어요. <span aria-live="off">{`지금까지 ${busySeconds}초`}</span>
            </Note>
          )}
          {error !== null && <ErrorCard code={error} />}
          {partial !== null && (
            <Note tone="warning" title={partial.title}>
              {partial.body}
            </Note>
          )}
          {stale && (
            <Note tone="warning" title="이 리포트를 만든 뒤 숫자가 바뀌었어요">
              [다시 분석]을 누르면 새 숫자로 다시 써요.
            </Note>
          )}
        </Notes>
      )}
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
        <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-small text-muted">
          <span className="font-semibold text-ink">{`${longMonth(report.month)} 보고`}</span>
          {partial !== null && <span className={ds.chip.warning}>{partial.chip}</span>}
          <span>{`${madeAtText(report.createdAt, now)} · ${modelName(report.model)}`}</span>
        </p>
        {/* 글자가 바뀌어도 폭이 흔들리지 않게 최소 112px. 휴대폰은 전체 폭 */}
        <button type="button" onClick={onCopy} className={`${ds.button.secondarySmall} min-w-28 max-md:w-full`}>
          <Icon name={copied ? 'check' : 'copy'} size={14} />
          {copied ? '복사했어요' : '복사'}
        </button>
      </div>
      <h2 className={`mt-3 max-w-204 text-pretty ${BIG_TITLE}`}>{report.summary}</h2>
      <ol className="mt-6 border-t border-line-strong">
        {report.cards.map((card, index) => (
          // 저장된 순서 그대로 다시 그리기만 한다(같은 문장이 둘일 수 있어 순번을 쓴다)
          <li key={index} className="flex gap-4 border-b border-line py-4 max-md:flex-col max-md:gap-2">
            <div className="w-22 shrink-0 pt-0.5 max-md:w-auto max-md:pt-0">
              <span className={TAG_CHIP[card.tag].className}>
                {TAG_CHIP[card.tag].icon}
                {TAG_LABEL[card.tag]}
              </span>
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-lead text-ink">{card.text}</p>
              <p className="mt-1 text-small text-ink-2">{card.basis}</p>
            </div>
          </li>
        ))}
      </ol>
    </>
  )
}

export function ReportBody({
  state,
  month,
  today,
  now,
  onAnalyze,
  onRetryRead,
  onCopy,
}: {
  state: ReportBodyState
  month: string
  today: string // YYYY-MM-DD (partialNotice에 넘김)
  now: Date // madeAtText에 넘김. 부품 안에서 지금 시각을 새로 읽지 않는다
  onAnalyze: () => void
  onRetryRead: () => void
  onCopy: () => void
}) {
  const name = shortMonth(month)
  switch (state.kind) {
    case 'loading':
      return (
        <p role="status" className="text-body text-muted">
          {`${name} 리포트를 읽고 있어요`}
        </p>
      )
    case 'readError':
      return (
        <>
          <Notes>
            <ErrorCard code="E-AI-READ" />
          </Notes>
          <button type="button" onClick={onRetryRead} className={`${ds.button.secondary} max-md:w-full`}>
            다시 읽기
          </button>
        </>
      )
    case 'busyEmpty':
      return (
        <>
          <h2 className={EMPTY_TITLE}>{`${name} 숫자를 읽고 있어요`}</h2>
          <p role="status" className={EMPTY_LINE}>
            1분쯤 걸려요. 이 화면을 그대로 두고 기다려 주세요.
          </p>
          <div className={EMPTY_ACTIONS}>
            {/* 기다림은 disabled가 아니라 aria-busy다. 누름 처리가 없어 다시 눌러도 아무 일이 없다 */}
            <button type="button" aria-busy="true" className={`${ds.button.primaryLarge} max-md:w-full`}>
              분석 중
            </button>
            <span className="text-small text-muted">{`지금까지 ${state.seconds}초`}</span>
          </div>
        </>
      )
    case 'noData': {
      const { what, fix } = errorInfo('E-AI-NO-DATA')
      return (
        <>
          <h2 className={EMPTY_TITLE}>{what}</h2>
          <p className={EMPTY_LINE}>{fix}</p>
          <div className={EMPTY_ACTIONS}>
            <Link href="/stats" className={`${ds.button.secondary} no-underline max-md:w-full`}>
              통계 탭으로
              <Icon name="arrow" size={16} />
            </Link>
          </div>
          <p className="mt-3 text-caption text-muted">오류 번호 E-AI-NO-DATA</p>
        </>
      )
    }
    case 'empty':
      return (
        <>
          {state.error !== null && (
            <Notes>
              <ErrorCard code={state.error} />
            </Notes>
          )}
          <h2 className={EMPTY_TITLE}>{`${name} 리포트를 아직 만들지 않았어요`}</h2>
          <p className={EMPTY_LINE}>{`[AI 분석]을 누르면 ${compareMonths(month)}과 견줘 원장님께 드릴 보고를 1분쯤 걸려 써 드려요.`}</p>
          <div className={EMPTY_ACTIONS}>
            <button type="button" onClick={onAnalyze} className={`${ds.button.primaryLarge} max-md:w-full`}>
              AI 분석
            </button>
          </div>
        </>
      )
    case 'report':
      return <ReportView state={state} today={today} now={now} onCopy={onCopy} />
  }
}
