import { ds } from '@/components/ui/classes'
import { SourceLine } from '@/components/location/common/SourceLine'
import { WhyLine } from '@/components/location/common/WhyLine'
import { RETRY_LABEL } from '@/components/location/common/text'
import { commaText, wonText } from '@/lib/location/money'
import type { DeptRule, Got, Rival, SourceId } from '@/types/location'
import { type HowProps, MUTED, Section, TEXT_BTN } from './Section'
import { SKIPPED_TEXT, homeVsAvgText, priceRows, priceScale, priceStats, pricesOf, shownOf, type PriceStats } from './text'

// 후보 자세히 › 경쟁 의원 진료비(spec location AC-7909.3·AC-7922.2, design.md 4·6·18절, 시안 ?s=candidate sec-price).
// 범위 안 경쟁 의원(지금 설정의 경쟁 과목, 모을 때 detail이 있는 곳)이 올린 체외충격파 1회 값의 가장 싼 곳·평균(버림)·가장 비싼 곳과
// 지금 의원 값(개원 준비에 적은 값, 모든 후보에 같이 씀). 도수치료는 공개 자료에 값이 있을 때만(detail.manual) 같은 모양.
// 비급여는 모을 때 가까운 경쟁 의원 20곳만 부른다 — 20곳 안에서 못 받은 의원은 그 의원 값만 `지금 받지 못했어요`, 20곳 밖은 곁글
// `가까운 경쟁 의원 20곳만 값을 봤어요.`로 가른다. 금액은 원 칸이라 wonText(requirements 이 명세가 정한 것 20). props·콜백만 받는다

export type PriceSectionProps = {
  radiusM: number
  /** 그날 값 rivals — 경쟁 의원마다 detail.priced·eswt·manual(원) */
  rivals: Got<Rival[]>
  /** 의원 과목 고르기 설정 */
  deptRule: DeptRule
  /** 지금 의원 체외충격파 값(location_settings.home_eswt, 원). 없으면 null */
  homeEswt: number | null
  /** [지금 의원 값은 개원 준비에서 적어요] — 개원 준비의 '지금 의원 체외충격파 값' 칸으로 */
  onWriteHomeEswt?: () => void
  onRetry?: () => void
  onOpenSource?: (id: SourceId) => void
  /** 목차 닻(기본 시안 `sec-price`) */
  id?: string
} & HowProps

const MANUAL_NONE = '도수치료는 2026년 7월부터 관리급여라 견주지 않아요'
const FAILED = '지금 받지 못했어요.'
const RETRY = `ml-1 inline-flex cursor-pointer items-center rounded-control text-small font-medium text-accent underline-offset-3 transition hover:underline ${ds.focusRing}`

export function PriceSection({
  radiusM,
  rivals,
  deptRule,
  homeEswt,
  onWriteHomeEswt,
  onRetry,
  onOpenSource,
  id = 'sec-price',
  howCtx,
  howOpen,
  onHow,
}: PriceSectionProps) {
  const shown = shownOf(rivals)
  const rows = shown ? priceRows(shown.v, radiusM, deptRule) : []
  const eswt = pricesOf(rows, (d) => d.eswt)
  const manual = pricesOf(rows, (d) => d.manual)
  const failed = rows.filter((x) => x.state === 'failed').map((x) => x.r.name)
  const skipped = rows.some((x) => x.state === 'skipped')
  const stats = priceStats(eswt)
  const manualStats = priceStats(manual)
  return (
    <Section
      id={id}
      title="경쟁 의원 진료비"
      aside="건강보험이 안 되는 진료(비급여) · 의원마다 올린 값"
      howId="price"
      howCtx={howCtx}
      howOpen={howOpen}
      onHow={onHow}
    >
      <p className="flex flex-wrap gap-x-4 gap-y-1 text-caption text-ink-2">
        <span className="inline-flex items-center gap-1">
          <i className="inline-block size-2.5 rounded-full bg-chart-3" aria-hidden="true" />
          둘레 의원
        </span>
        <span className="inline-flex items-center gap-1">
          <i className="inline-block h-3 w-0.5 bg-ink-2" aria-hidden="true" />
          평균
        </span>
        <span className="inline-flex items-center gap-1">
          <Marker />
          지금 의원 값(개원 준비에 적은 값)
        </span>
      </p>
      {shown ? (
        <div className="min-w-0">
          <p data-testid="price-eswt-head" className="text-body font-semibold text-ink">
            체외충격파 <span className="text-small font-normal text-muted">{`1회 · 범위 안 ${commaText(eswt.length)}곳`}</span>
          </p>
          {stats ? (
            <>
              <Strip values={eswt} avg={stats.avg} home={homeEswt} />
              <p data-testid="price-eswt" className="text-small text-ink">
                <Stats stats={stats} />
                {' · '}
                {homeEswt !== null ? (
                  <>
                    지금 의원 <b className="font-semibold tabular-nums">{wonText(homeEswt)}</b> ({homeVsAvgText(homeEswt, stats.avg)})
                  </>
                ) : onWriteHomeEswt ? (
                  <button type="button" className={TEXT_BTN} onClick={onWriteHomeEswt}>
                    지금 의원 값은 개원 준비에서 적어요
                  </button>
                ) : (
                  <span className={MUTED}>지금 의원 값은 개원 준비에서 적어요</span>
                )}
              </p>
            </>
          ) : (
            failed.length === 0 && <p className={`mt-1 text-small ${MUTED}`}>범위 안에 값을 올린 의원이 없어요.</p>
          )}
          {failed.length > 0 && (
            <div data-testid="price-failed" className={`mt-1 text-small ${MUTED}`}>
              <p className="inline">{`${failed.join(' · ')}: ${FAILED}`}</p>
              {onRetry && (
                <button type="button" className={RETRY} onClick={onRetry}>
                  {RETRY_LABEL}
                </button>
              )}
            </div>
          )}
          {!rivals.ok && <WhyLine why={rivals.why} src={rivals.src} prevAsOf={shown.asOf} onRetry={onRetry} />}
        </div>
      ) : (
        !rivals.ok && <WhyLine why={rivals.why} src={rivals.src} onRetry={onRetry} place="value" />
      )}
      {manualStats ? (
        <div className="min-w-0">
          <p data-testid="price-manual-head" className="text-body font-semibold text-ink">
            도수치료 <span className="text-small font-normal text-muted">{`1회 · 범위 안 ${commaText(manual.length)}곳`}</span>
          </p>
          <Strip values={manual} avg={manualStats.avg} home={null} />
          <p data-testid="price-manual" className="text-small text-ink">
            <Stats stats={manualStats} />
          </p>
        </div>
      ) : (
        <div>
          <p className="text-body font-semibold text-ink">도수치료</p>
          <p className={`mt-1 text-small ${MUTED}`}>{MANUAL_NONE}</p>
        </div>
      )}
      <div>
        <div className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5 text-caption text-muted">
          <SourceLine src="nonpay" asOf={shown?.asOf} onOpen={onOpenSource} />
          <span>도수치료는 2026년 7월부터 관리급여예요. 공개 자료에 값이 있을 때만 보여요.</span>
        </div>
        <p className={ds.help}>의원마다 1회 기준(시간·부위)이 다를 수 있어요.</p>
        {skipped && <p className={ds.help}>{SKIPPED_TEXT}</p>}
      </div>
    </Section>
  )
}

function Stats({ stats }: { stats: PriceStats }) {
  return (
    <>
      가장 싼 곳 <b className="font-semibold tabular-nums">{wonText(stats.lo)}</b> · 평균{' '}
      <b className="font-semibold tabular-nums">{wonText(stats.avg)}</b> · 가장 비싼 곳{' '}
      <b className="font-semibold tabular-nums">{wonText(stats.hi)}</b>
    </>
  )
}

// 지금 의원 표(시안 .me 아래로 향한 세모)
function Marker({ className = '' }: { className?: string }) {
  return (
    <svg width="14" height="10" viewBox="0 0 14 10" aria-hidden="true" className={`fill-accent ${className}`}>
      <path d="M0 0h14L7 10z" />
    </svg>
  )
}

// 값 띠(시안 .strip, 그림만 — 숫자는 아래 글이 말한다): 의원마다 점 · 평균 세로 막대 · 지금 의원 세모 · 눈금 `{n}만`
function Strip({ values, avg, home }: { values: readonly number[]; avg: number; home: number | null }) {
  const { from, to, ticks } = priceScale(home === null ? values : [...values, home])
  const at = (p: number) => ({ left: `${(((p - from) / (to - from)) * 100).toFixed(2)}%` })
  return (
    <div className="relative mx-2 mt-1 h-14" aria-hidden="true">
      <span className="absolute inset-x-0 top-6 h-px bg-line-strong" />
      {values.map((p, i) => (
        <span key={i} className="absolute top-4.5 size-3 -translate-x-1/2 rounded-full bg-chart-3 ring-2 ring-surface" style={at(p)} />
      ))}
      <span className="absolute top-3 h-6 w-0.5 -translate-x-1/2 bg-ink-2" style={at(avg)} />
      {home !== null && (
        <span className="absolute top-3.5 -translate-x-1/2 leading-none" style={at(home)}>
          <Marker className="block" />
        </span>
      )}
      {ticks.map((t) => (
        <span key={t} className="absolute top-8.5 -translate-x-1/2 whitespace-nowrap text-caption tabular-nums text-muted" style={at(t)}>
          {t === 0 ? '0' : `${commaText(t / 10_000)}만`}
        </span>
      ))}
    </div>
  )
}
