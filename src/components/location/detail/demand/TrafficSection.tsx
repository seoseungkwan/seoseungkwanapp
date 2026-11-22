import type { ReactNode } from 'react'
import { HowLine } from '@/components/location/common/HowLine'
import { SourceLine } from '@/components/location/common/SourceLine'
import { WhyLine } from '@/components/location/common/WhyLine'
import { asOfText } from '@/components/location/common/text'
import { distText } from '@/lib/location/coords'
import { filledHow, type HowCtx } from '@/lib/location/method'
import { commaText } from '@/lib/location/money'
import type { DeptRule, Got, Snapshot, SourceId } from '@/types/location'
import { look } from './look'
import { inRange, KAKAO_SRC, nearest, shownOf, type Near, type NearKind, type NearPlace } from './near'
import { KakaoSource, NearValue, Section } from './parts'
import { FLOW_NOTE, OTHERS_NOTE, flowCapped, othersCount, rangeText, stationsText, stopsText } from './text'

// 후보 자세히 › 교통·둘레 시설(spec location AC-7909.6 · AC-7908.4 · AC-7921.6 · AC-7920.2, 시안 ?s=candidate #sec-traffic).
// 제목 바로 아래 '이렇게 봤어요'(method.ts HOW.traffic을 받은 howCtx로 채움 — 채울 값·펼침은 부르는 쪽이 쥠).
// 가장 가까운 역(출구 없음) · 400m 안 정류장 · 사람 흐름(범위 안 역·정류장마다 하루 평균 승하차와 합, 교통카드 안내) · 시장은 그날 값,
// 약국·마트·큰 병원은 카카오(볼 때만 — 부르는 쪽이 열 때마다 새로 불러 넘기고, 이 부품은 저장하는 콜백에 넘기지 않음),
// 다른 과 의원은 그날 값 의원 목록을 지금 과목 고르기(deptRule)로 센 수(과목마다 수는 '둘레 다른 과 의원' 묶음에 있음).
// 승하차 자료가 없는 지역은 그 칸만 `이 지역은 자료 없음`이고 다른 칸은 그대로다. props·콜백만 받는다

/** 이 묶음이 읽는 그날 값 칸(그날 값 전체를 그대로 넘겨도 된다) */
export type TrafficFacts = Pick<Snapshot, 'radiusM' | 'station' | 'bus' | 'flow' | 'market' | 'rivals'>
export type TrafficKey = Exclude<keyof TrafficFacts, 'radiusM'>

export type TrafficSectionProps = {
  snapshot: TrafficFacts
  /** 의원 과목 고르기 설정 — '다른 과 의원' 수를 이것으로 센다(바꾸면 다시 부르지 않고 바로 다시 셈) */
  deptRule: DeptRule
  /** '이렇게 봤어요' 채울 값(그 후보 그날 값의 출처별 기준 날짜 · 범위 · 시군구 · 고른 경쟁 과목) — 묶음 열셋이 같은 값을 받는다 */
  howCtx: HowCtx
  /** '이렇게 봤어요'를 펼쳤나 — 부르는 쪽이 묶음마다 쥔다(범위를 바꿔 다시 그려도 그대로) */
  howOpen: boolean
  /** [더 보기]/[접기]를 누르면 */
  onHow: () => void
  /** 카카오 장소 찾기 답(약국·마트·큰 병원을 읽음). 빈 칸은 불러오는 중 */
  near: Near
  /** 못 받은 칸의 [다시 받기] — 그날 값 칸 이름만 넘긴다 */
  onRetry?: (key: TrafficKey) => void
  /** 카카오 값의 [다시 받기] — 종류만 넘긴다(장소 값은 넘기지 않음) */
  onRetryNear?: (kind: NearKind) => void
  /** 출처 줄을 누르면(주지 않으면 '근거와 출처' 주소로 간다) */
  onOpenSource?: (id: SourceId) => void
}

export const TRAFFIC_SECTION_ID = 'sec-traffic'

// 줄 하나(시안 .info > div): 이름 · 값
function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className={look.row}>
      <dt className={look.dt}>{label}</dt>
      <dd className={look.dd}>{children}</dd>
    </div>
  )
}

// 그날 값 줄: 값(없으면 자료 없음 글) · 옛 값 글 · 출처 줄
function GotRow<T>({
  label,
  got,
  render,
  onRetry,
  onOpenSource,
}: {
  label: string
  got: Got<T>
  render: (v: T) => ReactNode
  onRetry?: () => void
  onOpenSource?: (id: SourceId) => void
}) {
  const shown = shownOf(got)
  return (
    <Row label={label}>
      {shown ? render(shown.v) : !got.ok && <WhyLine why={got.why} src={got.src} onRetry={onRetry} place="value" />}
      {shown && !got.ok && <WhyLine why={got.why} src={got.src} prevAsOf={shown.asOf} onRetry={onRetry} />}
      <SourceLine src={got.src} asOf={shown?.asOf} onOpen={onOpenSource} />
    </Row>
  )
}

// 카카오 줄: 값(불러오는 중 · 못 받음 · 값) · 카카오 출처 줄
function NearRow({
  label,
  kind,
  near,
  render,
  onRetryNear,
  onOpenSource,
}: {
  label: string
  kind: NearKind
  near: Near
  render: (places: readonly NearPlace[], capped: boolean) => ReactNode
  onRetryNear?: (kind: NearKind) => void
  onOpenSource?: (id: SourceId) => void
}) {
  return (
    <Row label={label}>
      <NearValue reply={near[kind]} render={render} onRetry={onRetryNear ? () => onRetryNear(kind) : undefined} />
      <KakaoSource onOpen={onOpenSource} />
    </Row>
  )
}

const Muted = ({ children }: { children: ReactNode }) => <span className={look.muted}>{children}</span>

// 약국·마트: 범위 안 수와 가장 가까운 곳(시안), 없으면 그 글(empty). 한도에 걸렸으면 capped 글
function InRangeCount({ places, capped, radiusM, empty }: { places: readonly NearPlace[]; capped: boolean; radiusM: number; empty: string }) {
  const got = inRange(places, capped, radiusM)
  const first = got.list[0]
  if (!first) return <Muted>{empty}</Muted>
  return (
    <>
      <b className={look.strong}>{`${commaText(got.list.length)}곳`}</b>
      {` · 가장 가까운 곳 ${first.name} ${distText(first.distM)}`}
      {got.capped && <WhyLine why="capped" count={got.list.length} />}
    </>
  )
}

export function TrafficSection({ snapshot, deptRule, howCtx, howOpen, onHow, near, onRetry, onRetryNear, onOpenSource }: TrafficSectionProps) {
  const r = snapshot.radiusM
  const retry = (key: TrafficKey) => (onRetry ? () => onRetry(key) : undefined)
  const how = filledHow('traffic', howCtx)
  return (
    <Section
      id={TRAFFIC_SECTION_ID}
      title="교통·둘레 시설"
      aside={rangeText(r)}
      how={<HowLine {...how} open={howOpen} onToggle={onHow} />}
    >
      <dl className={look.rows}>
        <GotRow
          label="가장 가까운 역"
          got={snapshot.station}
          render={(v) => (
            <>
              <b className={look.strong}>{v.name}</b>
              {` · ${distText(v.distM)} `}
              <span className={look.aside2}>{`· ${v.line}`}</span>
            </>
          )}
          onRetry={retry('station')}
          onOpenSource={onOpenSource}
        />
        <GotRow
          label="버스 정류장"
          got={snapshot.bus}
          render={(n) => (
            <>
              {'400m 안 '}
              <b className={look.strong}>{`${commaText(n)}곳`}</b>
            </>
          )}
          onRetry={retry('bus')}
          onOpenSource={onOpenSource}
        />
        <GotRow
          label="사람 흐름"
          got={snapshot.flow}
          render={(v) => {
            const capped = flowCapped(v)
            return (
              <>
                {'하루 평균 타고 내린 사람 '}
                <b className={look.strong}>{`${commaText(v.total)}명`}</b>{' '}
                <span className={look.aside2}>{`· ${asOfText(v.ym)} 자료`}</span>
                <span className={look.line2}>{`${stationsText(v.stations)} · ${stopsText(v.stops)}`}</span>
                {capped !== null && <WhyLine why="capped" count={capped} />}
                <span className={look.line2Muted}>{FLOW_NOTE}</span>
              </>
            )
          }}
          onRetry={retry('flow')}
          onOpenSource={onOpenSource}
        />
        <GotRow
          label="시장"
          got={snapshot.market}
          render={(v) => (v.distM <= r ? `${v.name} · ${distText(v.distM)}` : <Muted>범위 안에 시장이 없어요</Muted>)}
          onRetry={retry('market')}
          onOpenSource={onOpenSource}
        />
        <NearRow
          label="약국"
          kind="pharmacy"
          near={near}
          render={(places, capped) => <InRangeCount places={places} capped={capped} radiusM={r} empty="범위 안에 약국이 없어요" />}
          onRetryNear={onRetryNear}
          onOpenSource={onOpenSource}
        />
        <NearRow
          label="마트"
          kind="mart"
          near={near}
          render={(places, capped) => <InRangeCount places={places} capped={capped} radiusM={r} empty="범위 안에 마트가 없어요" />}
          onRetryNear={onRetryNear}
          onOpenSource={onOpenSource}
        />
        <NearRow
          label="큰 병원"
          kind="bigHospital"
          near={near}
          render={(places) => {
            const p = nearest(places)
            if (!p) return <WhyLine why="none" src={KAKAO_SRC} place="value" />
            return (
              <>
                {`${p.name} · ${distText(p.distM)} `}
                <span className={look.aside2}>· 범위와 상관없이 가장 가까운 곳(수술 보낼 곳)</span>
              </>
            )
          }}
          onRetryNear={onRetryNear}
          onOpenSource={onOpenSource}
        />
        <GotRow
          label="다른 과 의원"
          got={snapshot.rivals}
          render={(clinics) => (
            <>
              <b className={look.strong}>{`${commaText(othersCount(clinics, deptRule, r))}곳`}</b>{' '}
              <span className={look.aside2}>{OTHERS_NOTE}</span>
            </>
          )}
          onRetry={retry('rivals')}
          onOpenSource={onOpenSource}
        />
      </dl>
    </Section>
  )
}
