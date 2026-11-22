import type { ReactNode } from 'react'
import { SourceLine } from '@/components/location/common/SourceLine'
import { WhyLine } from '@/components/location/common/WhyLine'
import { distText } from '@/lib/location/coords'
import { commaText } from '@/lib/location/money'
import type { Got, Snapshot, SourceId } from '@/types/location'
import { look } from './look'
import { KAKAO_SRC, nearest, shownOf, type Near, type NearKind } from './near'
import { KakaoSource, NearValue, Section } from './parts'
import { areaKm2Text, bandsLabel, densityPerKm2, pickedPeople, rangeText, sharePct } from './text'

// 후보 자세히 › 정형외과 수요(spec location AC-7909.6, 시안 ?s=candidate #sec-demand).
// 고른 나이대 인구·1km²당 밀도(하루 환자 수 어림은 없음) · 경로당 · 체력단련장 · 교통사고 다발 · 산업단지 · 학교.
// 숫자는 그날 값(Snapshot), 산업단지 이름·위치만 카카오(볼 때만, 저장 안 함)이고 고용 인원은 시군구 합이다.
// props·콜백만 받는다(읽기·저장·부르기 없음). 못 받은 칸은 그 칸에만 design.md 15절 글이 보이고 다른 칸은 그대로다

/** 이 묶음이 읽는 그날 값 칸(그날 값 전체를 그대로 넘겨도 된다) */
export type DemandFacts = Pick<Snapshot, 'radiusM' | 'people' | 'seniors' | 'gyms' | 'accidents' | 'industry' | 'schools'>
export type DemandKey = Exclude<keyof DemandFacts, 'radiusM'>

export type DemandSectionProps = {
  snapshot: DemandFacts
  /** 셀 나이대 — 점수 설정(ScoreRule.bands, 10세 칸 번호 0~10, 처음 40세 이상) */
  bands: readonly number[]
  /** 카카오 장소 찾기 답(산업단지만 읽음). 빈 칸은 불러오는 중 */
  near: Near
  /** 못 받은 칸의 [다시 받기] — 그날 값 칸 이름만 넘긴다 */
  onRetry?: (key: DemandKey) => void
  /** 카카오 값의 [다시 받기] — 종류만 넘긴다(장소 값은 넘기지 않음) */
  onRetryNear?: (kind: NearKind) => void
  /** 출처 줄을 누르면(주지 않으면 '근거와 출처' 주소로 간다) */
  onOpenSource?: (id: SourceId) => void
}

export const DEMAND_SECTION_ID = 'sec-demand'

type BoxProps<T> = {
  label: string
  got: Got<T>
  value: (v: T) => ReactNode
  unit?: string
  note?: ReactNode | ((v: T) => ReactNode)
  extra?: string
  onRetry?: () => void
  onOpenSource?: (id: SourceId) => void
}

// 칸 하나(시안 .kbox): 이름 · 값(단위) · 곁글 · 옛 값 글 · 출처 줄. 값이 없으면 값 자리에 자료 없음 글
function Box<T>({ label, got, value, unit, note, extra, onRetry, onOpenSource }: BoxProps<T>) {
  const shown = shownOf(got)
  const noteNode = typeof note === 'function' ? (shown ? note(shown.v) : null) : note
  return (
    <div className={look.box}>
      <p className={look.label}>{label}</p>
      {shown ? (
        <p className={look.value}>
          {value(shown.v)}
          {unit && <small className={look.unit}>{unit}</small>}
        </p>
      ) : (
        !got.ok && <WhyLine why={got.why} src={got.src} onRetry={onRetry} place="value" />
      )}
      {noteNode != null && noteNode !== false && <p className={look.note}>{noteNode}</p>}
      {shown && !got.ok && <WhyLine why={got.why} src={got.src} prevAsOf={shown.asOf} onRetry={onRetry} />}
      <SourceLine src={got.src} asOf={shown?.asOf} extra={extra} onOpen={onOpenSource} />
    </div>
  )
}

export function DemandSection({ snapshot, bands, near, onRetry, onRetryNear, onOpenSource }: DemandSectionProps) {
  const r = snapshot.radiusM
  const ages = bandsLabel(bands)
  const retry = (key: DemandKey) => (onRetry ? () => onRetry(key) : undefined)
  const picked = (v: { bands: readonly number[] }) => pickedPeople(v.bands, bands)
  const count = (n: number) => commaText(n)
  return (
    <Section id={DEMAND_SECTION_ID} title="정형외과 수요" aside={rangeText(r)}>
      <div className={look.grid}>
        <Box
          label={ages}
          got={snapshot.people}
          value={(v) => commaText(picked(v))}
          unit="명"
          note={(v) => {
            const pct = sharePct(picked(v), v.total)
            return pct === null ? null : `사는 사람의 ${pct}%`
          }}
          onRetry={retry('people')}
          onOpenSource={onOpenSource}
        />
        <Box
          label={`1km²당 밀도(${ages})`}
          got={snapshot.people}
          value={(v) => commaText(densityPerKm2(picked(v), r))}
          unit="명"
          note={`범위 넓이 ${areaKm2Text(r)}km²`}
          onRetry={retry('people')}
          onOpenSource={onOpenSource}
        />
        <Box
          label="경로당"
          got={snapshot.seniors}
          value={count}
          unit="곳"
          note="어르신이 모이는 곳이에요 · 노인복지관은 전국 목록이 없어 경로당으로 대신해요"
          onRetry={retry('seniors')}
          onOpenSource={onOpenSource}
        />
        <Box
          label="체력단련장"
          got={snapshot.gyms}
          value={count}
          unit="곳"
          note="운동하다 다친 사람이 와요 · 필라테스는 빠질 수 있어요"
          onRetry={retry('gyms')}
          onOpenSource={onOpenSource}
        />
        <Box
          label="교통사고 다발 지점"
          got={snapshot.accidents}
          value={(v) =>
            v.spots > 0 ? (
              `${commaText(v.spots)}곳 · 사고 ${commaText(v.cases)}건`
            ) : (
              <span className={look.nodata}>범위 안에 다발 지점이 없어요</span>
            )
          }
          note="교통사고 환자도 정형외과에 와요"
          onRetry={retry('accidents')}
          onOpenSource={onOpenSource}
        />
        <IndustryBox snapshot={snapshot} near={near} onRetry={retry('industry')} onRetryNear={onRetryNear} onOpenSource={onOpenSource} />
        <Box
          label="학교"
          got={snapshot.schools}
          value={count}
          unit="곳"
          note="초·중·고 합 · 운동하다 다친 학생이 와요"
          onRetry={retry('schools')}
          onOpenSource={onOpenSource}
        />
      </div>
    </Section>
  )
}

// 산업단지 칸: 값 = 가장 가까운 단지 이름·거리(카카오, 볼 때만) · 곁글 = 고용 인원(시군구 합, 그날 값) · 출처 줄 둘
function IndustryBox({
  snapshot,
  near,
  onRetry,
  onRetryNear,
  onOpenSource,
}: {
  snapshot: DemandFacts
  near: Near
  onRetry?: () => void
  onRetryNear?: (kind: NearKind) => void
  onOpenSource?: (id: SourceId) => void
}) {
  const reply = near.industryPark
  const park = reply?.ok ? nearest(reply.value.places) : null
  const industry = snapshot.industry
  const shown = shownOf(industry)
  const outside = park !== null && park.distM > snapshot.radiusM ? '범위 밖 · ' : ''
  return (
    <div className={look.box}>
      <p className={look.label}>산업단지</p>
      <div className={look.valueText}>
        <NearValue
          reply={reply}
          onRetry={onRetryNear ? () => onRetryNear('industryPark') : undefined}
          render={(places) => {
            const p = nearest(places)
            return p ? (
              `가장 가까운 곳 ${p.name} · ${distText(p.distM)}`
            ) : (
              <WhyLine why="none" src={KAKAO_SRC} place="value" />
            )
          }}
        />
      </div>
      {shown ? (
        <p className={look.note}>
          {`${outside}일하는 사람 ${commaText(shown.v.employees)}명(${shown.v.sggName} 산업단지 ${commaText(shown.v.parks)}곳 합) · 일하다 다친 사람(산재)이 와요`}
        </p>
      ) : (
        !industry.ok && (
          <>
            {outside && <p className={look.note}>범위 밖</p>}
            <WhyLine why={industry.why} src={industry.src} onRetry={onRetry} />
          </>
        )
      )}
      {shown && !industry.ok && <WhyLine why={industry.why} src={industry.src} prevAsOf={shown.asOf} onRetry={onRetry} />}
      <KakaoSource extra="이름·위치" onOpen={onOpenSource} />
      <SourceLine src={industry.src} asOf={shown?.asOf} extra="고용 인원" onOpen={onOpenSource} />
    </div>
  )
}
