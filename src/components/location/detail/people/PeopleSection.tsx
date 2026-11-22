// 후보 자세히 › 사는 사람 묶음(spec location AC-7909.2, 시안 ?s=candidate #sec-people).
// 범위 인구·세대 수·60세 이상(비율)·아파트 세대 → 나이대 넷 · 4년 추세(해마다 10월) → 홍보할 아파트 차례 → 입주 예정.
// 인구·세대는 행정동, 단지는 법정동 기준이라 칸 아래 기준을 적는다(design.md 5절). 그날 값(Snapshot)만 받는다(props·콜백만, 읽기·저장·부르기 없음)
import { Fact, Facts } from '@/components/location/common/Fact'
import { WhyLine } from '@/components/location/common/WhyLine'
import { asOfText } from '@/components/location/common/text'
import { distText } from '@/lib/location/coords'
import { commaText } from '@/lib/location/money'
import type { Got, Snapshot, SnapshotValue } from '@/types/location'
import { GotView, INFO, INFO_DD, INFO_DT, INFO_ROW, type Pass, Section, SubHead } from './Section'
import { ageGroups, changeText, countShort, promoOrder, shownOf, trendChange } from './text'

export type PeopleSectionProps = Pass & {
  /** 그날 값(전체 Snapshot을 그대로 넘겨도 된다) */
  snapshot: Pick<Snapshot, 'radiusM' | 'people' | 'trend' | 'apts' | 'presale'>
}

type People = SnapshotValue<'people'>
type Trend = SnapshotValue<'trend'>

const pctText = (pct: number | null) => (pct === null ? '–' : `${pct}%`)
const seniorsOf = (v: People) => ageGroups(v)?.[3] ?? null

export function PeopleSection({ snapshot: s, onRetry, onOpenSource }: PeopleSectionProps) {
  const pass: Pass = { onRetry, onOpenSource }
  const unmatched = shownOf(s.people)?.v.unmatched ?? 0
  return (
    <Section id="people" title="사는 사람" aside={`범위 ${distText(s.radiusM)} 안`}>
      <div className="min-w-0">
        <Facts cols={4}>
          <Fact label="사는 사람" got={s.people} value={(v) => commaText(v.total)} unit="명" note="행정동 기준" {...pass} />
          <Fact label="세대 수" got={s.people} value={(v) => commaText(v.households)} unit="세대" note="행정동 기준" {...pass} />
          <Fact
            label="60세 이상"
            got={s.people}
            value={(v) => {
              const g = seniorsOf(v)
              return g ? commaText(g.count) : '–'
            }}
            unit="명"
            note={(v) => `사는 사람의 ${pctText(seniorsOf(v)?.pct ?? null)}`}
            {...pass}
          />
          <Fact
            label="아파트"
            got={s.apts}
            value={(v) => commaText(v.reduce((sum, a) => sum + a.households, 0))}
            unit="세대"
            note={(v) => `${commaText(v.length)}개 단지 · 법정동 기준`}
            {...pass}
          />
        </Facts>
        {unmatched > 0 && <p className="mt-2 text-small text-muted">범위 안 동 {commaText(unmatched)}곳은 인구 자료와 잇지 못해 빼고 셌어요.</p>}
      </div>
      <div className="grid grid-cols-2 items-start gap-x-8 gap-y-4">
        <Ages got={s.people} {...pass} />
        <TrendBars got={s.trend} {...pass} />
      </div>
      <Promo got={s.apts} {...pass} />
      <Presale got={s.presale} {...pass} />
    </Section>
  )
}

// 나이대 넷: 이름 · 막대(50%면 꽉 참, 60세 이상만 진하게) · `{%} · {명}명`
function Ages({ got, ...pass }: Pass & { got: Got<People> }) {
  return (
    <div className="min-w-0">
      <p className="mb-2 text-small font-semibold text-ink">나이대</p>
      <GotView got={got} {...pass}>
        {(v) => {
          const groups = ageGroups(v)
          if (!groups) return <WhyLine why="none" src={got.src} />
          return (
            <div className="grid gap-1.5">
              {groups.map((g, i) => (
                <div key={g.label} className="grid grid-cols-[64px_minmax(0,1fr)_96px] items-center gap-2 text-small">
                  <span className="text-ink">{g.label}</span>
                  <div className="h-2 border border-line bg-canvas">
                    <i className={`block h-full ${i === groups.length - 1 ? 'bg-accent' : 'bg-chart-3'}`} style={{ width: `${Math.min(100, (g.pct ?? 0) * 2)}%` }} />
                  </div>
                  <span className="text-right tabular-nums text-ink-2">{`${pctText(g.pct)} · ${commaText(g.count)}명`}</span>
                </div>
              ))}
            </div>
          )
        }}
      </GotView>
    </div>
  )
}

const BAR_MIN_PX = 40
const BAR_SPAN_PX = 50

// 4년 추세: 머리 `{n}년 추세 ▲ +x%` `({처음 연월}부터 · 해마다 10월)` · 해마다 막대(마지막 해만 진하게) · 아래 해
function TrendBars({ got, ...pass }: Pass & { got: Got<Trend> }) {
  const shown = shownOf(got)
  const rows = shown ? [...shown.v].sort((a, b) => (a.ym < b.ym ? -1 : a.ym > b.ym ? 1 : 0)) : []
  const ch = trendChange(rows)
  const cols = { gridTemplateColumns: `repeat(${Math.max(1, rows.length)}, minmax(0, 1fr))` }
  const lo = rows.length ? Math.min(...rows.map((r) => r.total)) * 0.9 : 0
  const hi = rows.length ? Math.max(...rows.map((r) => r.total)) : 0
  const height = (t: number) => (hi > lo ? BAR_MIN_PX + ((t - lo) / (hi - lo)) * BAR_SPAN_PX : BAR_MIN_PX + BAR_SPAN_PX / 2)
  return (
    <div className="min-w-0">
      <p className="text-small font-semibold text-ink">
        {ch ? ch.years : 4}년 추세{' '}
        {ch && <span className={`font-medium ${ch.tenths < 0 ? 'text-negative' : 'text-positive'}`}>{`${ch.tenths < 0 ? '▼' : '▲'} ${changeText(ch.tenths)}`}</span>}{' '}
        {rows.length > 0 && <span className="font-normal text-muted">{`(${asOfText(rows[0].ym)}부터 · 해마다 10월)`}</span>}
      </p>
      <GotView got={got} {...pass}>
        {() =>
          rows.length === 0 ? (
            <WhyLine why="none" src={got.src} />
          ) : (
            <>
              <div className="mt-2 grid h-30 items-end gap-2 border-b border-line-strong pt-2" style={cols}>
                {rows.map((r, i) => (
                  <div key={r.ym} className="grid h-full content-end justify-items-center gap-1">
                    <span className="text-caption tabular-nums text-ink-2">{countShort(r.total)}</span>
                    <i className={`block w-3/5 max-w-8 ${i === rows.length - 1 ? 'bg-accent' : 'bg-chart-3'}`} style={{ height: `${height(r.total).toFixed(1)}px` }} />
                  </div>
                ))}
              </div>
              <div className="mt-1 grid gap-2 text-center text-caption tabular-nums text-muted" style={cols}>
                {rows.map((r) => (
                  <span key={r.ym}>{r.ym.slice(0, 4)}</span>
                ))}
              </div>
            </>
          )
        }
      </GotView>
    </div>
  )
}

const TH = 'h-10 border-b border-line px-3 text-left font-medium whitespace-nowrap text-muted first:pl-0 last:pr-0'
const TD = 'h-11 border-b border-line px-3 py-2 text-ink first:pl-0 last:pr-0'
const NUM = 'text-right tabular-nums whitespace-nowrap'

// 홍보할 아파트 차례: 가까운 법정동 → 세대 수 → 지은 해(text.ts promoOrder). 단지에 좌표가 없어 거리 칸 대신 법정동 칸
function Promo({ got, ...pass }: Pass & { got: Got<SnapshotValue<'apts'>> }) {
  return (
    <div className="min-w-0">
      <SubHead title="홍보할 아파트 차례" note="가까움 · 세대 수 · 지은 해로 정해요" />
      <GotView got={got} also="apt-info" {...pass}>
        {(v) =>
          v.length === 0 ? (
            <p className="text-small text-muted">범위 안에 아파트 단지가 없어요.</p>
          ) : (
            <div className="mt-1 overflow-x-auto">
              <table className="w-full border-collapse text-small">
                <thead>
                  <tr>
                    <th className={TH}>차례</th>
                    <th className={TH}>단지</th>
                    <th className={`${TH} text-right`}>세대</th>
                    <th className={`${TH} text-right`}>지은 해</th>
                    <th className={TH}>법정동</th>
                    <th className={TH}>까닭</th>
                  </tr>
                </thead>
                <tbody>
                  {promoOrder(v).map(({ apt, why }, i) => (
                    <tr key={`${apt.bdongName}-${apt.name}-${i}`} className="hover:bg-canvas">
                      <td className={`${TD} tabular-nums`}>{i + 1}</td>
                      <td className={TD}>
                        <b className="font-semibold">{apt.name}</b>
                      </td>
                      <td className={`${TD} ${NUM}`}>{commaText(apt.households)}</td>
                      <td className={`${TD} ${NUM}`}>{apt.builtYear === null ? '–' : `${apt.builtYear}년`}</td>
                      <td className={TD}>{apt.bdongName || '–'}</td>
                      <td className={`${TD} text-ink-2`}>{why}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )
        }
      </GotView>
    </div>
  )
}

// 입주 예정: `{연}년 {월}월` · `{단지} · {세대}세대`
function Presale({ got, ...pass }: Pass & { got: Got<SnapshotValue<'presale'>> }) {
  return (
    <div className="min-w-0">
      <SubHead title="입주 예정" />
      <GotView got={got} {...pass}>
        {(v) =>
          v.length === 0 ? (
            <p className="text-small text-muted">범위 안에 입주 예정 단지가 없어요.</p>
          ) : (
            <dl className={INFO}>
              {v.map((p, i) => (
                <div key={`${p.moveIn}-${p.name}-${i}`} className={INFO_ROW}>
                  <dt className={INFO_DT}>{asOfText(p.moveIn)}</dt>
                  <dd className={INFO_DD}>
                    {p.name} · <b className="font-semibold tabular-nums">{commaText(p.households)}세대</b>
                  </dd>
                </div>
              ))}
            </dl>
          )
        }
      </GotView>
    </div>
  )
}
