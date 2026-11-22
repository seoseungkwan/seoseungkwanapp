import { SourceLine } from '@/components/location/common/SourceLine'
import { WhyLine } from '@/components/location/common/WhyLine'
import { ds } from '@/components/ui/classes'
import { areaText } from '@/lib/location/area'
import { IROS_URL, NEW_TAB } from '@/lib/location/links'
import type { Snapshot, SnapshotValue, SourceId, YesNo } from '@/types/location'
import { buildingAge, floorRows, floorText } from './floors'
import { ExtIcon, InfoList, InfoRow, LawLink, LINK_BUTTON, Picks, Section, shownOf, SIDE, TABLE, type HeadProp, type HowProp } from './parts'

// 후보 자세히 › 건물 서류(specs/location AC-7909.4, 시안 ?s=candidate 'bld' 묶음, 글은 requirements '화면 글 기본값').
// 건축물대장 표제(지은 해·구조·층수·연면적·엘리베이터·주차·용도) · 층별(위층부터, 후보 층에 '이 자리') · 출처 줄 ·
// 등기부(인터넷등기소 첫 화면 새 창 — AC-7909.4가 이 묶음에 둔다) · 위반 건축물 고르는 칸(공개 자료가 없어 직접 고름, 법 근거 violation).
// 그날 값(building)을 못 받으면 표제·층별 자리만 자료 없음 글이고, 등기부·위반 건축물 칸은 그대로다. props·콜백만 받는다

export type BuildingDocsProps = HeadProp & HowProp & {
  building: Snapshot['building']
  /** 후보 층 글(location_candidates.floor_label, 안 적었으면 '') */
  floorLabel: string
  /** 후보 전용 넓이 ㎡(location_candidates.area_m2) */
  areaM2: number | null
  /** 오늘 한국 날짜 'YYYY-MM-DD'(지은 지 몇 해인지) */
  today: string
  /** 저장된 위반 건축물(location_candidates.violation), 안 골랐으면 null */
  violation: YesNo | null
  /** 다른 값을 고르면 그 값(있음 yes · 없음 no · 모름 unknown) */
  onViolation: (v: YesNo) => void
  /** 건축물대장을 못 받았을 때 [다시 받기] */
  onRetry?: () => void
  onOpenSource?: (id: SourceId) => void
  /** 법 근거를 누르면(주지 않으면 '근거와 출처' 주소로 간다) */
  onOpenLaw?: (id: string) => void
}

const VIOLATION_OPTIONS = [
  ['yes', '있음'],
  ['no', '없음'],
  ['unknown', '모름'],
] as const

// 고른 값마다 아래 글(화면 글 기본값 '위반 건축물 칸'). 뒤에 늘 ALWAYS + 법 근거
const VIOLATION_HELP: Record<'none' | YesNo, string> = {
  none: "아직 안 골랐어요 — 위험 신호에 '확인 필요'로 떠요.",
  unknown: "'모름'이면 위험 신호에 '확인 필요'로 떠요.",
  yes: "'있음'이면 위험 신호에 빨간 깃발로 떠요.",
  no: '',
}
const ALWAYS = '위반 건축물이면 의원 개설 신고가 막힐 수 있어요.'

const IROS_HELP =
  '인터넷등기소 첫 화면이 새 창으로 열려요(주소는 거기서 직접 넣어요). 이 앱은 등기부를 받아 오지 않고 링크만 걸어요. 첫 화면에서 보안 프로그램을 깔라고 할 수 있어요.'

const NONE = '–'
const count = (n: number | null) => (n === null ? NONE : `${n}대`)
const area = (m2: number) => (m2 > 0 ? areaText(m2) : NONE)

function TitleRows({ v, today, onOpenLaw }: { v: SnapshotValue<'building'>; today: string; onOpenLaw?: (id: string) => void }) {
  const age = buildingAge(v.approvedOn, today)
  const scale = [v.structure.trim(), v.below > 0 ? `지하 ${v.below}층` : '', v.above > 0 ? `지상 ${v.above}층` : ''].filter(Boolean).join(' · ')
  return (
    <>
      <InfoRow name="지은 해">
        {v.approvedOn ? (
          <>
            {v.approvedOn.slice(0, 4)}년{age !== null && age > 0 ? <span className={SIDE}> · {age}년 됐어요</span> : null}
          </>
        ) : (
          NONE
        )}
      </InfoRow>
      <InfoRow name="구조 · 층수">{scale || NONE}</InfoRow>
      <InfoRow name="연면적">{area(v.totalM2)}</InfoRow>
      <InfoRow name="엘리베이터">{count(v.elevators)}</InfoRow>
      <InfoRow name="주차">{count(v.parking)}</InfoRow>
      <InfoRow name="용도">
        {v.usage.trim() || NONE}
        <span className="ml-2">
          <LawLink id="use" onOpen={onOpenLaw} />
        </span>
      </InfoRow>
    </>
  )
}

function FloorTable({ v, floorLabel, areaM2 }: { v: SnapshotValue<'building'>; floorLabel: string; areaM2: number | null }) {
  const rows = floorRows(v.floors, floorLabel)
  const here = rows.find((r) => r.here)
  return (
    <div className="min-w-0">
      <div className={TABLE.wrap}>
        <table aria-label="층별 개요" className={TABLE.table}>
          <thead>
            <tr>
              <th scope="col" className={TABLE.th}>
                층
              </th>
              <th scope="col" className={TABLE.th}>
                용도
              </th>
              <th scope="col" className={TABLE.thNum}>
                넓이
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={`${r.label}-${i}`} className={r.here ? TABLE.rowHere : TABLE.row}>
                <td className={`${TABLE.td} whitespace-nowrap`}>
                  <b className="font-semibold">{floorText(r.label)}</b>
                  {r.here ? <span className={`${ds.chip.accent} ml-1.5`}>이 자리</span> : null}
                </td>
                <td className={TABLE.td}>{r.usage || NONE}</td>
                <td className={TABLE.tdNum}>{area(r.m2)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {here && areaM2 !== null && areaM2 > 0 ? (
        <p className="mt-1.5 text-caption text-muted">
          이 자리는 {floorText(here.label)} 가운데 전용 {areaText(areaM2)}이에요.
        </p>
      ) : null}
    </div>
  )
}

export function BuildingDocs({
  building,
  floorLabel,
  areaM2,
  today,
  violation,
  onViolation,
  onRetry,
  onOpenSource,
  onOpenLaw,
  head,
  howCtx,
  howOpen,
  onHow,
}: BuildingDocsProps) {
  const shown = shownOf(building)
  const help = VIOLATION_HELP[violation ?? 'none']
  return (
    <Section id="bld" title="건물 서류" aside="건축물대장" head={head} howCtx={howCtx} howOpen={howOpen} onHow={onHow}>
      {shown ? (
        <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)] items-start gap-x-8 gap-y-4">
          <InfoList>
            <TitleRows v={shown.v} today={today} onOpenLaw={onOpenLaw} />
          </InfoList>
          <FloorTable v={shown.v} floorLabel={floorLabel} areaM2={areaM2} />
        </div>
      ) : null}
      <div className="min-w-0">
        {!building.ok ? (
          <WhyLine why={building.why} src={building.src} prevAsOf={shown?.asOf} onRetry={onRetry} place={shown ? 'line' : 'value'} />
        ) : null}
        <SourceLine src="building" asOf={shown?.asOf} onOpen={onOpenSource} />
      </div>
      <InfoList>
        <InfoRow name="등기부">
          <a href={IROS_URL} {...NEW_TAB} className={LINK_BUTTON}>
            인터넷등기소 바로 가기
            <ExtIcon />
          </a>
          <p className="mt-1.5 text-caption text-muted">{IROS_HELP}</p>
        </InfoRow>
      </InfoList>
      <Picks
        label="위반 건축물인가요?"
        hint="건축물대장을 떼어 확인하세요 · 공개 자료가 없어 직접 골라요"
        group="위반 건축물"
        options={VIOLATION_OPTIONS}
        value={violation}
        onPick={onViolation}
      >
        <p data-testid="violation-help" className="flex flex-wrap items-baseline gap-x-1 text-caption text-muted">
          {help ? <span>{help} </span> : null}
          <span>{ALWAYS} </span>
          <LawLink id="violation" onOpen={onOpenLaw} />
        </p>
      </Picks>
    </Section>
  )
}
