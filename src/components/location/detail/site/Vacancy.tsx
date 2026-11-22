import { Icon } from '@/components/common/Icon'
import { SourceLine } from '@/components/location/common/SourceLine'
import { WhyLine } from '@/components/location/common/WhyLine'
import { ds } from '@/components/ui/classes'
import { commaText } from '@/lib/location/money'
import type { Snapshot, SourceId } from '@/types/location'
import { floorText, vacancyOf } from './floors'
import { Note, Section, shownOf, TABLE, type HeadProp, type HowProp } from './parts'

// 후보 자세히 › 빈 칸 짐작(specs/location AC-7909.4, 시안 ?s=candidate 'vac' 묶음).
// 건축물대장 층마다 그 층에 들어선 가게 수(소상공인 상가정보, 후보 30m 안)를 세고, 가게가 없는 층을 '빈 층 같아요'로 짐작한다.
// 상가정보만 쓴다(상가 공실률·임대료는 쓰지 않음 — 이 명세가 정한 것 9). 층을 알아야 하므로 건축물대장이 없으면 짐작하지 않고 그 자료 없음 글이다.
// 그날 값 둘 가운데 못 받은 것은 그 자리만 자료 없음 글(AC-7917.2), 지난 값으로 셌으면 `지난 값 · 기준 {날짜}`. props·콜백만 받는다

export type VacancyProps = HeadProp & HowProp & {
  building: Snapshot['building']
  stores: Snapshot['stores']
  /** 후보 층 글(location_candidates.floor_label, 안 적었으면 '') */
  floorLabel: string
  /** 못 받은 자료의 [다시 받기] */
  onRetry?: () => void
  onOpenSource?: (id: SourceId) => void
}

const NOTE = '가게 정보에 없는 층은 빈 층일 수도 있고, 가게 정보가 늦게 고쳐졌을 수도 있어요. 로드뷰와 함께 보고, 보러 가서 확인해요.'

export function Vacancy({ building, stores, floorLabel, onRetry, onOpenSource, head, howCtx, howOpen, onHow }: VacancyProps) {
  const bld = shownOf(building)
  const got = shownOf(stores)
  const view = bld && got ? vacancyOf(bld.v.floors, got.v, floorLabel) : null
  return (
    <Section id="vac" title="빈 칸 짐작" aside="층마다 들어선 가게로 빈 층을 짐작해요" head={head} howCtx={howCtx} howOpen={howOpen} onHow={onHow}>
      <div className="grid max-w-180 min-w-0 gap-1.5">
        {!building.ok && !bld ? <WhyLine why={building.why} src={building.src} onRetry={onRetry} place="value" /> : null}
        {!stores.ok ? <WhyLine why={stores.why} src={stores.src} prevAsOf={got?.asOf} onRetry={onRetry} place={got ? 'line' : 'value'} /> : null}
        {view && view.rows.length === 0 ? <p className="text-body text-muted">층마다 나눈 건물 자료가 없어요.</p> : null}
        {view && view.rows.length > 0 ? (
          <>
            <div className={TABLE.wrap}>
              <table aria-label="층마다 가게" className={TABLE.table}>
                <thead>
                  <tr>
                    <th scope="col" className={TABLE.th}>
                      층
                    </th>
                    <th scope="col" className={TABLE.th}>
                      지금 가게
                    </th>
                    <th scope="col" className={TABLE.th}>
                      짐작
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {view.rows.map((r) => (
                    <tr key={r.label} className={r.here ? TABLE.rowHere : TABLE.row}>
                      <td className={`${TABLE.td} whitespace-nowrap`}>
                        <b className="font-semibold">{floorText(r.label)}</b>
                      </td>
                      <td className={TABLE.td}>{r.empty ? <span className="text-muted">가게 없음</span> : `가게 ${commaText(r.stores)}곳`}</td>
                      <td className={`${TABLE.td} whitespace-nowrap`}>
                        {r.empty ? <span className={ds.chip.warning}>빈 층 같아요</span> : <span className="text-muted">쓰는 중</span>}
                        {r.here ? <span className={`${ds.chip.accent} ml-1.5`}>이 자리</span> : null}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="mt-0.5 text-small text-ink">
              {commaText(view.rows.length)}개 층 가운데 <b className="font-semibold">{commaText(view.empty)}개 층</b>이 빈 것 같아요.
            </p>
            {view.unknownStores > 0 ? <p className="text-caption text-muted">층이 적히지 않은 가게 {commaText(view.unknownStores)}곳은 세지 않았어요.</p> : null}
          </>
        ) : null}
        <SourceLine src="stores" asOf={got?.asOf} onOpen={onOpenSource} />
      </div>
      <Note icon={<Icon name="info" className="mt-0.5 text-muted" />}>{NOTE}</Note>
    </Section>
  )
}
