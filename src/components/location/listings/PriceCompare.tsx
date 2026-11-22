// 매물 값 견주기 (spec location AC-7910.2, design.md 11절 listings.ts, 시안 ?s=listings '매물 값 견주기').
// 저장한 매물끼리만 견준다: 평균은 저장한 매물 모두(compareListings), 줄은 평수 거르기를 따른다.
// 2개 미만이면 견주지 않고 안내(FEW_LISTINGS_TEXT)만. 점 = 이 매물, 세로 선 = 저장한 매물 평균(막대 끝은 저장한 매물의 가장 싼·비싼 값)
import type { ListingComparison, ListingSide } from '@/lib/location/listings'
import { wonText } from '@/lib/location/money'
import type { Listing } from '@/types/location'
import { SourceLine } from '../common/SourceLine'
import { look } from './look'
import { listingName } from './SavedListings'
import { Section } from './Section'

type Side = 'rent' | 'deposit'
type Scale = { lo: number; hi: number } | null

const DASH = '–'

function scaleOf(cmp: ListingComparison, side: Side, avg: number | null): Scale {
  const values = Object.values(cmp.items).flatMap((v) => (v[side] ? [v[side].perPy] : []))
  if (avg !== null) values.push(avg)
  if (values.length === 0) return null
  return { lo: Math.min(...values), hi: Math.max(...values) }
}

const at = (scale: Scale, v: number) => (scale === null || scale.hi === scale.lo ? '50%' : `${(((v - scale.lo) * 100) / (scale.hi - scale.lo)).toFixed(2)}%`)

function SideCell({ side, avg, scale }: { side: ListingSide | null; avg: number | null; scale: Scale }) {
  if (side === null) return <p className={look.value}>{DASH}</p>
  const vs = side.vs
  const tone = vs === null || vs.pct === 0 ? look.same : vs.pct > 0 ? look.high : look.low
  return (
    <div>
      <div className={look.bar} aria-hidden="true">
        <span className={look.barAxis} />
        {avg !== null && <span className={look.barAvg} style={{ left: at(scale, avg) }} />}
        <span className={avg !== null && side.perPy > avg ? look.barDotHigh : look.barDot} style={{ left: at(scale, side.perPy) }} />
      </div>
      <p className={look.value}>
        {wonText(side.perPy)}
        {vs && (
          <>
            {' · '}
            <span className={tone}>{vs.text}</span>
          </>
        )}
      </p>
    </div>
  )
}

const Ticks = ({ scale }: { scale: Scale }) => (
  <div className={look.cmpTick}>{scale && scale.hi > scale.lo ? [scale.lo, scale.hi].map((v) => <span key={v}>{wonText(v)}</span>) : null}</div>
)

export function PriceCompare({ listings, shown, comparison }: { listings: readonly Listing[]; shown: readonly Listing[]; comparison: ListingComparison }) {
  const { rentAvg, depositAvg } = comparison
  const rentScale = scaleOf(comparison, 'rent', rentAvg)
  const depositScale = scaleOf(comparison, 'deposit', depositAvg)
  return (
    <Section title="매물 값 견주기" aside="저장한 매물끼리 견줘요 · 점 = 이 매물, 세로 선 = 저장한 매물 평균">
      {comparison.notice !== null ? (
        <p className={look.empty}>{comparison.notice}</p>
      ) : (
        <div className={look.cmpList}>
          <div className={look.cmpHead}>
            <span>{`저장한 매물 ${listings.length}개`}</span>
            <span>
              평당 월세 · 평균 <b className={look.cmpAvg}>{rentAvg === null ? DASH : wonText(rentAvg)}</b>
            </span>
            <span>
              평당 보증금 · 평균 <b className={look.cmpAvg}>{depositAvg === null ? DASH : wonText(depositAvg)}</b>
            </span>
          </div>
          <ul>
            {shown.map((l) => {
              const view = comparison.items[l.id]
              const name = listingName(l)
              return (
                <li key={l.id} aria-label={name} className={look.cmpRow}>
                  <span className="text-small">
                    <b className={look.strong}>{name}</b>
                  </span>
                  <SideCell side={view?.rent ?? null} avg={rentAvg} scale={rentScale} />
                  <SideCell side={view?.deposit ?? null} avg={depositAvg} scale={depositScale} />
                </li>
              )
            })}
          </ul>
          <div className={look.cmpTicks} aria-hidden="true">
            <span />
            <Ticks scale={rentScale} />
            <Ticks scale={depositScale} />
          </div>
        </div>
      )}
      <SourceLine src="user" />
    </Section>
  )
}
