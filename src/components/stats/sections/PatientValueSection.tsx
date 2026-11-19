'use client'

import { useId, useMemo } from 'react'
import { formatCount, percentOf } from '@/components/charts/format'
import { formatManWon, formatWon } from '@/components/revenue/money'
import { groupKey } from '@/components/stats/treatmentView'
import type { StatsRxGroup } from '@/types/rxGroups'
import type { MonthValue, PatientValueLine } from '@/types/stats'
import type { BitSectionsShown } from './PatientMixSection'
import { Section } from './parts'
import { useTabDesc } from './RxSection'

// 신환 1명당 매출 = 그 달 신환 (bit-total REQ-6911 AC-6911.4, 시안 docs/mockups/bit-total/index.html ⑤ · 처음 모양 stats-insights ⑥). 매출 칸 다섯째 탭이다.
// 숫자는 Worker가 불러온 범위 전체를 달마다 센 1명당 값(BitSectionsView.values)의 마지막 달(보통 이번 달, 자료 끝 날까지)이고,
// 받은 치료 이름은 지금 묶음의 열쇠(groupKey)로 찾아 붙인다.
// 지금 묶음에 없는 열쇠가 든 줄(불러온 뒤 묶음을 바꿈)은 그리지 않는다. 줄 차례는 Worker가 준 그대로다(평균이 작은 순, '그 밖'은 맨 끝).
// 금액은 시안처럼 만 원 아래까지 쓴다("41만 2,000원"). 환자별 금액은 Worker 밖으로 나오지 않는다(이 칸은 1명당 숫자만 받는다)

const TITLE = '신환 1명당 매출'
const DESC = '그 달 신환이 그 달에 낸 진료비를 받은 치료별로 봐요'
const NOT_HERE = '비트에서 불러오면 볼 수 있어요'
const OLD_HELPER = '도우미를 0.11.0으로 올리면 볼 수 있어요'
const NOBODY = '아직 셀 환자가 없어요'
const NO_FIRST_DAY = '그 달 1일부터 불러오면 볼 수 있어요'
const BY_CARE = '받은 치료별'
const FOOT =
  '진료비 = 공단 부담까지 합친 총액. 그 달에 비트 신환 표시가 있는 환자를 그 달 신환으로 보고, 그 달 안에 낸 진료비와 내원만 세요. 두 달에 신환 표시가 있으면 두 달 모두에 들어가요. 환자별 금액은 이 PC 안에서만 계산하고 서버에 저장하지 않아요.'
const CARE_ONLY = '진료만'
const REST = '그 밖'
const JOIN = ' + '
const WON_PER_MAN = 10_000

const LINE = 'mt-3 text-body text-ink-2'
// 세 칸(몇 번까지 받나와 같은 나눔): 넓으면 세 열 사이 얇은 세로선, 휴대폰은 한 열 사이 가로선
const GRID = 'mt-4 grid grid-cols-3 max-md:grid-cols-1'
const CELL_FIRST = 'pr-5 max-md:pr-0 max-md:pb-3'
const CELL_NEXT = 'border-l border-st-line px-5 max-md:border-t max-md:border-l-0 max-md:px-0 max-md:py-3'
const CELL_LAST = 'border-l border-st-line pl-5 max-md:border-t max-md:border-l-0 max-md:pt-3 max-md:pl-0'
const BIG = 'text-st-22 leading-8 font-semibold text-st-ink tabular-nums'
const CELL_NAME = 'mt-0.5 text-small text-st-muted'
const SUB_HEADING = 'mt-6 text-st-15 leading-6 font-semibold text-st-ink'
// 받은 치료별 줄(시안 .hb): 이름 110 | 막대 | 값 150. 휴대폰은 이름 84 | 막대, 값은 막대 아래 왼쪽
const ROW =
  'grid grid-cols-[110px_minmax(0,1fr)_150px] items-center gap-x-2 gap-y-0.5 py-1 text-small text-st-ink-2 max-md:grid-cols-[84px_minmax(0,1fr)]'
const NAME = 'min-w-0 break-keep'
const BAR = 'st-move-period block h-4.5 rounded-control'
const VALUE = 'text-right whitespace-nowrap text-st-ink tabular-nums max-md:col-start-2 max-md:text-left max-md:text-st-ink-2'
const FOOT_LINE = 'mt-3 text-small text-st-muted'

type Shown = { name: string; rest: boolean; n: number; average: number }

// "41만 2,000원" · "8만 800원" · "41만 원" · "6,800원" · "1억 2,345만 678원". 만 원 위는 formatManWon, 남은 원은 쉼표 숫자
function wonText(n: number): string {
  const abs = Math.abs(n)
  const won = abs % WON_PER_MAN
  if (abs < WON_PER_MAN) return formatWon(n)
  const head = formatManWon(Math.sign(n) * (abs - won))
  return won === 0 ? head : `${head.replace(/ 원$/, '')} ${formatCount(won)}원`
}

const people = (count: number) => `${formatCount(count)}명`
const times = (value: number) => `${value.toFixed(1)}회`
const monthName = (month: string) => `${Number(month.slice(5, 7))}월`
// 칸 위 줄: `{Y}년 {M}월 신환 {n}명 · {M}월 1일–{D}일`(D = 센 끝 날)
const monthLine = ({ month, to, n }: MonthValue) => `${Number(month.slice(0, 4))}년 ${monthName(month)} 신환 ${people(n)} · ${monthName(month)} 1일–${Number(to.slice(8, 10))}일`

// 지금 묶음의 열쇠 → 이름(sortOrder 차례, 같은 열쇠는 앞 묶음). 처방 없는 묶음은 불러오기에 실리지 않는다(groupDefs, 몇 번까지 받나와 같은 규칙)
function namesOf(groups: readonly StatsRxGroup[]): Map<string, string> {
  const names = new Map<string, string>()
  for (const group of [...groups].sort((a, b) => a.sortOrder - b.sortOrder)) {
    if (group.codes.length === 0) continue
    const key = groupKey(group.codes, group)
    if (!names.has(key)) names.set(key, group.name)
  }
  return names
}

// 받은 치료 이름: 없으면 진료만, 하나면 '진료 + {묶음}', 둘 이상이면 묶음 이름을 ' + '로 잇는다. 모르는 열쇠가 있으면 null(그리지 않음)
function careName(groups: readonly string[], names: ReadonlyMap<string, string>): string | null {
  const found = groups.map((key) => names.get(key))
  if (found.some((name) => name === undefined)) return null
  if (found.length === 0) return CARE_ONLY
  return found.length === 1 ? `진료${JOIN}${found[0]}` : found.join(JOIN)
}

function shownLines(lines: readonly PatientValueLine[], groups: readonly StatsRxGroup[]): Shown[] {
  const names = namesOf(groups)
  return lines.flatMap(({ groups: picked, n, average }) => {
    const name = picked === null ? REST : careName(picked, names)
    return name === null ? [] : [{ name, rest: picked === null, n, average }]
  })
}

function Cells({ value }: { value: MonthValue }) {
  const name = monthName(value.month)
  const cells: [string, string, string][] = [
    [wonText(value.average), `${name} 신환 1명당 평균`, CELL_FIRST],
    [times(value.times), `${name} 신환 1명당 내원 횟수`, CELL_NEXT],
    [wonText(value.perVisit), '한 번 올 때 평균', CELL_LAST],
  ]
  return (
    <div className={GRID}>
      {cells.map(([text, name, place]) => (
        <div key={name} data-kpi className={place}>
          <p className={BIG}>{text}</p>
          <p className={CELL_NAME}>{name}</p>
        </div>
      ))}
    </div>
  )
}

// 막대 폭 = 평균 ÷ ('그 밖'이 아닌 줄 가운데 가장 큰 평균, UI_GUIDE 순위 막대). '그 밖' 한 줄뿐이면 그 줄이 기준이다
function CareBars({ lines }: { lines: readonly Shown[] }) {
  const headingId = useId()
  const own = lines.filter((line) => !line.rest)
  const max = Math.max(0, ...(own.length > 0 ? own : lines).map((line) => line.average))
  return (
    <>
      <h3 id={headingId} className={SUB_HEADING}>
        {BY_CARE}
      </h3>
      <ul aria-labelledby={headingId} className="mt-2">
        {/* 묶음 이름이 같은 두 묶음이면 이름이 겹칠 수 있어 차례로 가린다 */}
        {lines.map((line, i) => (
          <li key={i} className={ROW}>
            <span className={NAME}>{line.name}</span>
            <span aria-hidden="true" className="block">
              <span data-bar className={`${BAR} ${line.rest ? 'bg-line-strong' : 'bg-cat-2'}`} style={{ width: `${percentOf(line.average, max)}%` }} />
            </span>
            <span className={VALUE}>{`${wonText(line.average)} · ${people(line.n)}`}</span>
          </li>
        ))}
      </ul>
    </>
  )
}

export function PatientValueSection({ view, groups }: { view: BitSectionsShown; groups: readonly StatsRxGroup[] }) {
  // 카드가 옆 글을 가졌으면 설명은 패널 맨 위 한 줄(lead)이다(매출 카드는 옆 글이 없어 카드 머리 줄로 간다)
  const { head, lead } = useTabDesc(DESC)
  const values = view !== null && view !== 'waiting' && view.kind === 'ready' ? view.values : undefined
  const value = values?.at(-1)
  const lines = useMemo(() => (value === undefined ? [] : shownLines(value.lines, groups)), [value, groups])

  if (view === 'waiting') {
    return (
      <Section title={TITLE} desc={head}>
        {lead}
      </Section>
    )
  }
  // 금액 줄이 없는 답: 옛 도우미(v2 답·0.11.0 전 v3~v5 답). 달 줄이 없음 = 불러온 범위에 어느 달 1일도 없음
  const note =
    view === null || view.kind === 'none'
      ? NOT_HERE
      : values === undefined
        ? OLD_HELPER
        : value === undefined
          ? NO_FIRST_DAY
          : value.n === 0
            ? NOBODY
            : null
  if (note !== null || value === undefined) {
    return (
      <Section title={TITLE} desc={head}>
        {lead}
        <p className={LINE}>{note}</p>
      </Section>
    )
  }
  return (
    <Section title={TITLE} desc={head}>
      {lead}
      <p className={LINE}>{monthLine(value)}</p>
      <Cells value={value} />
      {lines.length > 0 && <CareBars lines={lines} />}
      <p className={FOOT_LINE}>{FOOT}</p>
    </Section>
  )
}
