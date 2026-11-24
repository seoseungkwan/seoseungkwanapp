'use client'

import type { ReactNode } from 'react'
import { ErrorCard } from '@/components/common/ErrorCard'
import { Icon } from '@/components/common/Icon'
import { StatsCard } from '@/components/stats/sections/parts'
import { ds } from '@/components/ui/classes'
import { AdminNav } from '../AdminNav'
import { COMPARE_SECTIONS, ComparePickers, monthText } from './ComparePickers'
import { CompareStats } from './CompareStats'
import { PayTable } from './PayTable'
import { RankTable, tableEmpty } from './RankTable'
import { SalesTable } from './SalesTable'
import { useCompareData } from './useCompareData'

// 관리자 · 의원 비교 화면(spec admin-view REQ-8017 AC-8017.1~AC-8017.4, REQ-8023 AC-8023.4, REQ-8015 AC-8015.5, design.md '의원 비교 — 불러오기와 한도').
// 시안 docs/mockups/admin-view ?s=compare · compare-region · empty: 통계 화면과 같은 회색 바탕(data-st-canvas → globals.css가 #main을 칠함) 위에
// 머리·고르기·바로가기(ComparePickers, h1 아래 안쪽 메뉴 AdminNav) → 의원 순위 → 통계 나란히 보기 → 직군별 월급 → 매출·환자 수.
// 네 칸은 늘 같은 지역·달(useCompareData의 pick 하나)을 받는다. 자료는 useCompareData가 정의자 함수로 읽기만 한다(쓰기·Worker·비트 연결 없음).
// 처음 읽기(의원 목록·가장 이른 달)가 실패하면 화면 오류 번호(E-PAGE-FAILED) 카드 + [다시 불러오기]. 의원 하나를 읽지 못하면 그 의원만
// '–'로 두고, 나란히 보기가 없는 전체에서는 고르기 아래에 그 의원 이름 + E-COMPARE-READ 카드 + [다시 불러오기](지역을 고르면 나란히 보기 칸 안에).
// 숫자가 하나도 오지 않은 채 읽는 동안은 표 자리에 '불러오는 중'(읽는 중에 '자료 없음'이라 하지 않게). PC 화면만, 폰 전용 모양 없음

const ALL = '전체'
const RETRY = '다시 불러오기'
const WAITING = '불러오는 중'

// 시안 .stack: 카드 사이 16px, 첫 카드 위 24px
const STACK = 'mt-6 flex flex-col gap-4'
// 바로가기 띠(ComparePickers 안 sticky nav)가 화면 끝까지 붙도록 고르기 묶음 바깥 상자를 풀어(contents) 띠가 이 상자의 자식처럼 놓이게 한다
// (통계 화면 StatsToc와 같이 맨 바깥 상자의 자식이어야 그 상자 끝까지 붙는다 — 작은 상자 안이면 그 상자가 끝날 때 떨어진다)
const CANVAS = '[&>div:first-child]:contents'

const title = (id: (typeof COMPARE_SECTIONS)[number]['id']) => COMPARE_SECTIONS.find((section) => section.id === id)!.name

function WaitingLine() {
  return (
    <p className="mt-3 flex items-center gap-1.5 text-body text-muted">
      <Icon name="clock" size={14} className="shrink-0" />
      {WAITING}
    </p>
  )
}

function WaitingCard({ id, month }: { id: 'cmp-rank' | 'cmp-pay' | 'cmp-sales'; month: string }) {
  return (
    <StatsCard id={id} title={title(id)} desc={monthText(month)}>
      <WaitingLine />
    </StatsCard>
  )
}

// 처음 읽는 동안·처음 읽기 실패 때의 머리(ComparePickers 머리와 같은 모양: 작은 '관리자' → h1 → 안쪽 메뉴)
function Head({ nav }: { nav: ReactNode }) {
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-1">
        <p className="flex items-center gap-1.5 text-small font-semibold text-muted">
          <Icon name="userCheck" size={14} className="shrink-0" />
          관리자
        </p>
        <h1 className="text-title font-semibold text-ink">의원 비교</h1>
      </div>
      {nav}
    </div>
  )
}

export function ComparePage({ today }: { today: string }) {
  const data = useCompareData(today)
  const nav = <AdminNav current="/admin/compare" />

  if (data.status !== 'ready' || data.months === null) {
    return (
      <div data-st-canvas="">
        <Head nav={nav} />
        {data.status === 'failed' ? (
          <div className="mt-6">
            <ErrorCard code="E-PAGE-FAILED" />
            <button type="button" className={`${ds.button.secondarySmall} mt-2`} onClick={data.reload}>
              {RETRY}
            </button>
          </div>
        ) : (
          <div className="mt-6">
            <WaitingLine />
          </div>
        )}
      </div>
    )
  }

  const { pick, rows, reading, failed } = data
  const { region, month } = pick
  // 읽는 중인데 그릴 숫자가 아직 없으면 표 대신 불러오는 중(빈 자료 글은 다 읽은 뒤에만)
  const tableWait = reading && tableEmpty(rows, region, month) !== null
  const payWait = reading && rows.every((row) => row.pay === null || row.pay.none)

  return (
    <div data-st-canvas="" className={CANVAS}>
      <ComparePickers
        region={region}
        month={month}
        months={data.months}
        count={data.count}
        unknownRegion={data.unknownRegion}
        onChange={data.setPick}
        nav={nav}
      />
      {region === ALL && failed.length > 0 && (
        <div className="mt-6">
          <p className="mb-1 break-all text-small font-medium text-ink">{failed.map((clinic) => clinic.name).join(' · ')}</p>
          <ErrorCard code="E-COMPARE-READ" />
          <button type="button" className={`${ds.button.secondarySmall} mt-2`} onClick={data.retryFailed}>
            {RETRY}
          </button>
        </div>
      )}
      <div className={STACK}>
        {tableWait ? <WaitingCard id="cmp-rank" month={month} /> : <RankTable month={month} region={region} rows={rows} />}
        <CompareStats month={month} region={region} clinics={data.side} onRetry={data.retry} />
        {payWait ? <WaitingCard id="cmp-pay" month={month} /> : <PayTable month={month} region={region} rows={rows} />}
        {tableWait ? <WaitingCard id="cmp-sales" month={month} /> : <SalesTable month={month} region={region} rows={rows} />}
      </div>
    </div>
  )
}
