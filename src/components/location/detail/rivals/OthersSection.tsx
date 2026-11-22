import { ds } from '@/components/ui/classes'
import { SourceLine } from '@/components/location/common/SourceLine'
import { WhyLine } from '@/components/location/common/WhyLine'
import { distText } from '@/lib/location/coords'
import { DEPTS } from '@/lib/location/depts'
import { commaText } from '@/lib/location/money'
import type { DeptId, DeptRule, Rival, RivalsGot, SourceId } from '@/types/location'
import { type HowProps, MUTED, Section, TABLE } from './Section'
import {
  CAP_TEXT,
  SAME_BUILDING_M,
  SPOT_TEXT,
  aroundDepts,
  deptName,
  deptShort,
  inRange,
  isCapped,
  placeAll,
  roadKeyOf,
  shownOf,
  spotOf,
  type Spot,
} from './text'

// 후보 자세히 › 둘레 다른 과 의원(spec location AC-7921.6, design.md 18절, 시안 ?s=candidate sec-others, 글은 requirements '화면 글 기본값' 새 묶음).
// 둘레 다른 과 의원 = 범위 안 의원 가운데 대표 과목이 둘레로 보기이고 한의원이 아닌 곳(경쟁 수에 넣지 않는다).
// 첫 줄은 30m 안 모든 과목 의원(안 보기 뺌, 경쟁 포함)과 카카오 약국(볼 때만) — 후보 카카오 도로명과 '도로명 + 건물 번호'가 같으면 같은 건물,
// 아니면 옆 건물(견주기는 화면에서만, 카카오 주소는 저장하지 않음). 도로명이 없으면 둘을 합쳐 `30m 안: …`. props·콜백만 받는다

/** 카카오 30m 안 약국(k-near PM9, 볼 때만) — road = 카카오 도로명 주소(없으면 옆 건물로 셈) */
export type NearPharmacy = { name: string; distM: number; road?: string | null }

export type OthersSectionProps = {
  radiusM: number
  /** 그날 값 rivals(안 보기가 아닌 모든 과목 의원)(잘렸으면 capped: true) */
  rivals: RivalsGot
  /** 의원 과목 고르기 설정 */
  deptRule: DeptRule
  /** 후보 도로명 주소(카카오 k-point, 볼 때만·저장 안 함) */
  kakaoRoad?: string | null
  /** 카카오 30m 안 약국(볼 때만·저장 안 함). 아직 못 불렀으면 의원만 적는다 */
  pharmacies?: readonly NearPharmacy[]
  onRetry?: () => void
  onOpenSource?: (id: SourceId) => void
  /** 목차 닻(기본 시안 `sec-others`) */
  id?: string
} & HowProps

const MANY = 3 // 같은 건물·옆 건물 의원이 이만큼 넘으면 '병원이 모인 건물이에요'
const NONE_NEAR = '같은 건물·옆 건물에 다른 의원이나 약국이 없어요.'
const HELP =
  '의원마다 대표 과목 하나로 셌어요(이름에 든 과목 먼저). 범위 안에 있는 과목만 보여요. 둘레로 보기 과목은 경쟁 수에 넣지 않고, 같은 건물·옆 건물(30m 안) 의원 수만 자리 점수의 세부 항목이에요(처음 무게 0).'

type NearItem = { dept: DeptId | 'pharmacy'; spot: Spot }

/** `같은 건물: 정형외과 1 · 치과 1 · 약국 1 / 옆 건물: 내과 1`(과목은 짧은 이름·목록 차례, 약국은 끝). 하나도 없으면 '' */
function nearText(items: readonly NearItem[]): string {
  const groups: Spot[] = items.some((x) => x.spot === 'near') ? ['near'] : ['same', 'next']
  const order: (DeptId | 'pharmacy')[] = [...DEPTS.map((d) => d.id), 'pharmacy']
  return groups
    .map((spot) => {
      const xs = items.filter((x) => x.spot === spot)
      const parts = order.flatMap((k) => {
        const n = xs.filter((x) => x.dept === k).length
        return n > 0 ? [`${k === 'pharmacy' ? '약국' : deptShort(k)} ${commaText(n)}`] : []
      })
      return parts.length > 0 ? `${SPOT_TEXT[spot]}: ${parts.join(' · ')}` : ''
    })
    .filter((t) => t !== '')
    .join(' / ')
}

export function OthersSection({
  radiusM,
  rivals,
  deptRule,
  kakaoRoad,
  pharmacies,
  onRetry,
  onOpenSource,
  id = 'sec-others',
  howCtx,
  howOpen,
  onHow,
}: OthersSectionProps) {
  const shown = shownOf(rivals)
  const placed = shown ? placeAll(inRange(shown.v, radiusM), deptRule) : []
  const kinds = aroundDepts(deptRule)
  const around = placed.filter((p) => p.role === 'around' && p.dept !== 'korean')
  const roadKey = roadKeyOf(kakaoRoad)
  const spotOfClinic = (r: Rival): Spot | null => (r.sameBuilding ? spotOf(r.address, roadKey) : null)

  const nearClinics = placed.filter((p) => p.r.sameBuilding)
  const nearItems: NearItem[] = [
    ...nearClinics.map((p) => ({ dept: p.dept, spot: spotOf(p.r.address, roadKey) })),
    ...(pharmacies ?? []).filter((x) => x.distM <= SAME_BUILDING_M).map((x) => ({ dept: 'pharmacy' as const, spot: spotOf(x.road, roadKey) })),
  ]
  const near = nearText(nearItems)

  const rows = kinds
    .map((k) => {
      const xs = around.filter((p) => p.dept === k)
      const spots = xs.map((p) => spotOfClinic(p.r))
      return {
        k,
        n: xs.length,
        same: spots.filter((s) => s === 'same').length,
        next: spots.filter((s) => s === 'next').length,
        near: spots.filter((s) => s === 'near').length,
        d: xs.length > 0 ? Math.min(...xs.map((p) => p.r.distM)) : 0,
      }
    })
    .filter((r) => r.n > 0)
    .sort((a, b) => b.n - a.n || a.d - b.d)

  return (
    <Section
      id={id}
      title="둘레 다른 과 의원"
      count={shown ? around.length : null}
      aside={`범위 ${distText(radiusM)} 안 · 둘레로 보기 과목 ${commaText(kinds.length)}개`}
      howId="others"
      howCtx={howCtx}
      howOpen={howOpen}
      onHow={onHow}
    >
      {shown ? (
        <>
          <p data-testid="others-near" className="text-body text-ink">
            {near !== '' ? (
              <>
                <b className="font-semibold">{near}</b>
                {nearClinics.length >= MANY && (
                  <>
                    {' '}
                    <span className={`ml-1 align-[1px] ${ds.chip.accent}`}>병원이 모인 건물이에요</span>
                  </>
                )}
              </>
            ) : (
              <span className={MUTED}>{NONE_NEAR}</span>
            )}
          </p>
          {rows.length > 0 ? (
            <div className={TABLE.wrap}>
              <table className={TABLE.table}>
                <thead>
                  <tr>
                    <th className={TABLE.th}>과목</th>
                    <th className={TABLE.thNum}>범위 안 수</th>
                    <th className={TABLE.thNum}>같은 건물</th>
                    <th className={TABLE.thNum}>가장 가까운 거리</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={r.k} className={TABLE.row}>
                      <td className={TABLE.tdNowrap}>
                        <b className="font-semibold">{deptName(r.k)}</b>
                      </td>
                      <td className={TABLE.tdNum}>{`${commaText(r.n)}곳`}</td>
                      <td className={TABLE.tdNum}>
                        {r.same > 0 ? `${commaText(r.same)}곳` : <span className={MUTED}>–</span>}
                        {r.next > 0 && <span className={TABLE.sub}>{`옆 건물 ${commaText(r.next)}곳`}</span>}
                        {r.near > 0 && <span className={TABLE.sub}>{`30m 안 ${commaText(r.near)}곳`}</span>}
                      </td>
                      <td className={TABLE.tdNum}>{r.same > 0 ? SPOT_TEXT.same : r.next > 0 ? SPOT_TEXT.next : r.near > 0 ? SPOT_TEXT.near : distText(r.d)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className={`text-body ${MUTED}`}>둘레로 보기 과목 의원이 범위 안에 없어요.</p>
          )}
          {isCapped(rivals) && <p className={ds.help}>{CAP_TEXT}</p>}
          {!rivals.ok && <WhyLine why={rivals.why} src={rivals.src} prevAsOf={shown.asOf} onRetry={onRetry} />}
        </>
      ) : (
        !rivals.ok && <WhyLine why={rivals.why} src={rivals.src} onRetry={onRetry} place="value" />
      )}
      <p className={ds.help}>{HELP}</p>
      <div>
        <SourceLine src="hosp-list" asOf={shown?.asOf} extra="의원·과목" onOpen={onOpenSource} />
        <SourceLine src="kakao-local" extra="약국" onOpen={onOpenSource} />
      </div>
    </Section>
  )
}
