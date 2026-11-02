import Link from 'next/link'
import { ErrorCard } from '@/components/common/ErrorCard'
import { Icon } from '@/components/common/Icon'
import { ds } from '@/components/ui/classes'
import { isErrorCode } from '@/lib/errors'
import { BANNER, ERROR_NUMBER, Glyph, KpiRow, Note, PageTitle, SECTION, STRONG } from './RevenueParts'
import type { EmptyMonth, FailedNotice, HeaderView, Notice, PeriodView, RevenueView } from './view'

// 매출 화면의 제목 줄·달 고르기·상황마다 화면 (TASK-9, 시안 gen.py not_connected()·fetching()·helper_old()·ext_old()·empty_month()·failed_months()·saved_only()).
// 글자는 보기 모양(view.ts)과 lib/errors.ts에서 받는다. 시안의 앱 틀은 components/shell이 그리고 여기서는 본문만 그린다

const SETUP = '/claim/setup'
const HEADING = 'text-title font-semibold text-balance text-ink md:text-heading-m'
const BODY = 'mt-2 max-w-144 text-lead text-ink-2'
const STATE_BLOCK = 'mt-6 pb-2'
const SAVE_FAILED = 'E-REVENUE-SAVE-FAILED'
const PAGE_FAILED = 'E-PAGE-FAILED'
const RETRY_SAVE = '다시 저장'
const RETRY_CHECK = '다시 확인'
// lib/errors.ts의 E-PAGE-FAILED 안내가 이 이름의 단추를 누르라고 한다
const RETRY_PAGE = '다시 시도'

function GoButton({ href, className, children }: { href: string; className: string; children: string }) {
  return (
    <Link href={href} className={`${className} group no-underline max-md:w-full`}>
      {children}
      <Icon name="arrow" size={16} className="transition group-hover:translate-x-0.5" />
    </Link>
  )
}

export function SafeLine({ text }: { text: string }) {
  return (
    <p className="mt-8 flex gap-1.5 border-t border-line pt-4 text-small text-muted">
      <Icon name="shield" size={14} className="mt-0.5 shrink-0 text-positive" />
      <span>{text}</span>
    </p>
  )
}

/** 단추는 보기 모양에 refresh가 있을 때만(연결된 PC) 있다 */
export function TitleRow({ header, onRefresh }: { header: HeaderView; onRefresh?(): void }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-2">
      <PageTitle>{header.title}</PageTitle>
      {(header.meta || header.refresh) && (
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
          {header.meta && (
            <p className="flex items-center gap-1.5 text-small text-muted">
              <Icon name="clock" size={14} className="shrink-0" />
              <span>{header.meta}</span>
            </p>
          )}
          {header.refresh && (
            <button type="button" className={ds.button.secondarySmall} onClick={onRefresh}>
              {header.refresh}
            </button>
          )}
        </div>
      )}
    </div>
  )
}

const STEP = `grid size-9 cursor-pointer place-items-center text-ink-2 transition not-disabled:hover:bg-canvas disabled:cursor-not-allowed disabled:opacity-40 max-md:size-11 ${ds.focusRing}`

type PeriodProps = { period: PeriodView; canPrevious: boolean; canNext: boolean; onPrevious(): void; onNext(): void }

/** 달 고르기(‹ 달 ›): 폰은 44px 높이에 전체 폭 */
export function PeriodRow({ period, canPrevious, canNext, onPrevious, onNext }: PeriodProps) {
  return (
    <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-2">
      <div className="inline-flex items-stretch rounded-control border border-line-strong max-md:w-full">
        <button type="button" aria-label="지난달" className={STEP} disabled={!canPrevious} onClick={onPrevious}>
          <Glyph name="left" size={16} />
        </button>
        <span className="flex items-center justify-center border-x border-line-strong px-4 text-body font-semibold whitespace-nowrap text-ink max-md:flex-1">{period.label}</span>
        <button type="button" aria-label="다음 달" className={STEP} disabled={!canNext} onClick={onNext}>
          <Glyph name="right" size={16} />
        </button>
      </div>
      <span className="text-small text-muted">{period.note}</span>
    </div>
  )
}

export function ConnectNeeded({ view }: { view: Extract<RevenueView, { state: 'connect-needed' }> }) {
  return (
    <div>
      <PageTitle>
        {view.title} <span className={ds.chip.neutral}>{view.chip}</span>
      </PageTitle>
      <div className={STATE_BLOCK}>
        <h2 className={HEADING}>{view.heading}</h2>
        <p className={BODY}>{view.body}</p>
        <div className="mt-5">
          <GoButton href={SETUP} className={ds.button.primaryLarge}>
            {view.action}
          </GoButton>
        </div>
      </div>
      <p className="mt-4 text-subtitle font-semibold text-ink">{view.gainsTitle}</p>
      <ol className="mt-2 grid list-none border-t border-line md:grid-cols-4 md:border-b">
        {view.gains.map((gain, index) => (
          <li key={gain.name} className="min-w-0 border-b border-line py-3 md:border-b-0 md:border-l md:px-5 md:py-4 md:first:border-l-0 md:first:pl-0">
            <p className="flex items-center gap-3 text-subtitle font-semibold text-ink md:gap-2">
              <span className="grid size-5 shrink-0 place-items-center rounded-control border border-line-strong text-caption font-semibold text-muted">{index + 1}</span>
              {gain.name}
            </p>
            <p className="mt-0.5 pl-8 text-small text-ink-2 md:mt-1 md:pl-0">{gain.text}</p>
          </li>
        ))}
      </ol>
      <SafeLine text={view.safe} />
    </div>
  )
}

export function Fetching({ view }: { view: Extract<RevenueView, { state: 'fetching' }> }) {
  const { progress } = view
  return (
    <div>
      <PageTitle>{view.title}</PageTitle>
      <div role="status" className={STATE_BLOCK}>
        <h2 className={HEADING}>{view.heading}</h2>
        <p className={BODY}>{view.body}</p>
        {progress && (
          <div className="mt-5 max-w-130">
            <p className="flex flex-wrap justify-between gap-x-3 text-body text-ink-2">
              <span>
                {progress.lead}
                <strong className={STRONG}>{progress.strong}</strong>
                {progress.rest}
              </span>
              {progress.reading && <span className="text-muted">{progress.reading}</span>}
            </p>
            {/* 움직이지 않는 막대다(폭 %만) */}
            <div aria-hidden="true" className="mt-2 h-2 overflow-clip rounded-control bg-line">
              <div className="h-full bg-accent" style={{ width: `${progress.width}%` }} />
            </div>
          </div>
        )}
        <Note>{view.note}</Note>
      </div>
      <SafeLine text={view.safe} />
    </div>
  )
}

/** 도우미·확장이 옛것일 때. 설정 탭(비트 PC 연결)으로 보낸다 */
export function UpgradeNeeded({ view }: { view: Extract<RevenueView, { state: 'helper-old' | 'extension-old' }> }) {
  return (
    <div>
      <PageTitle>{view.title}</PageTitle>
      <div className={STATE_BLOCK}>
        <h2 className={HEADING}>{view.heading}</h2>
        <p className={BODY}>{view.body}</p>
        <div className="mt-5">
          <GoButton href={SETUP} className={ds.button.primary}>
            {view.action}
          </GoButton>
        </div>
        <p className={ERROR_NUMBER}>오류 번호 {view.code}</p>
      </div>
    </div>
  )
}

const retryLabel = (code: string) => (code === SAVE_FAILED ? RETRY_SAVE : code === PAGE_FAILED ? RETRY_PAGE : RETRY_CHECK)

/** 오류 카드 + 카드 밖 단추. lib/errors.ts에 없는 번호(도우미가 새로 준 번호)는 번호만 보인다 */
function RetryCard({ code, onRetry, className }: { code: string; onRetry(): void; className: string }) {
  return (
    <div className={className}>
      {isErrorCode(code) ? (
        <ErrorCard code={code} />
      ) : (
        <p role="alert" className="text-caption text-ink-2 tabular-nums">
          오류 번호 {code}
        </p>
      )}
      <button type="button" className={`${ds.button.secondary} mt-3 max-md:w-full`} onClick={onRetry}>
        {retryLabel(code)}
      </button>
    </div>
  )
}

/** 일반 오류: 숫자를 보이지 않는 화면 */
export function RevenueError({ view, onRetry }: { view: Extract<RevenueView, { state: 'error' }>; onRetry(): void }) {
  return (
    <div>
      <PageTitle>{view.title}</PageTitle>
      <RetryCard code={view.code} onRetry={onRetry} className="mt-6" />
    </div>
  )
}

/** 저장 실패(E-REVENUE-SAVE-FAILED): [다시 저장]은 그 달만 다시 읽어 저장한다(답을 들고 있지 않는다) */
export function SaveFailedCard({ onRetry }: { onRetry(): void }) {
  return <RetryCard code={SAVE_FAILED} onRetry={onRetry} className="mt-4" />
}

/** 다른 창이 통로를 쓰는 중: 저장된 숫자는 두고 SavedNotice 자리에 둔다(비트 PC 연결·청구 화면과 같은 번호와 [다시 확인]) */
export function BusyNotice({ onRetry }: { onRetry(): void }) {
  return <RetryCard code="E-BRIDGE-BUSY" onRetry={onRetry} className="mt-4" />
}

/** 가져오지 못한 달 알림 줄. [다시 가져오기]는 그 달들만 읽는다 */
export function FailedBanner({ failed, onRetry }: { failed: FailedNotice; onRetry(): void }) {
  return (
    <div role="status" className={`${BANNER} bg-warning-soft`}>
      <div>
        <p>
          <strong className={STRONG}>{failed.lead}</strong> {failed.months}
        </p>
        <p>{failed.rest}</p>
      </div>
      <button type="button" className={ds.button.secondarySmall} onClick={onRetry}>
        {failed.retry}
      </button>
    </div>
  )
}

/** 연결 안 된 PC 알림 줄. 시안의 폰에는 없다(제목 줄의 시각만 있다) */
export function SavedNotice({ notice }: { notice: Notice & { action: string } }) {
  return (
    <div role="note" className={`${BANNER} bg-warning-soft max-md:hidden`}>
      <p>
        <strong className={STRONG}>{notice.lead}</strong> {notice.rest}
      </p>
      <Link href={SETUP} className={`${ds.button.secondarySmall} no-underline`}>
        {notice.action}
      </Link>
    </div>
  )
}

/** 고른 달에 자료가 없을 때: 숫자 칸은 "–"와 "자료 없음"이고 빈 그래프 틀이 없다 */
export function EmptyMonthBlock({ empty }: { empty: EmptyMonth }) {
  return (
    <section className={SECTION}>
      <div className="flex min-h-8 items-center">
        <h2 className="text-title font-semibold text-ink">{empty.heading}</h2>
      </div>
      <KpiRow kpis={empty.kpis} />
      <Note>{empty.note}</Note>
    </section>
  )
}
