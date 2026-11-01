import Link from 'next/link'
import type { ReactNode } from 'react'
import { Icon } from '@/components/common/Icon'
import { ds } from '@/components/ui/classes'
import { ConnectSteps } from './ConnectSteps'
import { dateLine } from './dateLine'
import { FeatureIndex } from './FeatureIndex'
import { ARROW_MOVE, NOTE, PRESS } from './layout'
import { ReadyNowRow, ReadyNowSide } from './ReadyNow'
import { StickyConnect } from './StickyConnect'

// 대시보드 짜임 — 1안 오늘 브리핑 (tab-frame REQ-306·REQ-316, ui-90 REQ-414, design.md '대시보드 (TASK-11)', 시안 docs/mockups/ui-90/app/gen.py dash_body).
// 훅이 없는 부품이다(BitDashboard 안에서 그려진다). 자료를 읽지 않고 연결 상태도 판정하지 않는다: report 하나로 모양을 안다(report != null이면 연결 뒤).
//   report null·undefined = 연결 전: 큰 문장 · 연결 순서 · "연결하면 바로 쓸 수 있어요" 한 줄 · 휴대폰 아래 단추
//   report 있음 = 연결 뒤: 큰 문장 자리에 report를 그대로(h1은 report 안), 오른쪽 칸에 지금 바로 묶음
// analysis(오늘 하루 분석 + 기간별 흐름)는 갈래 라 몫이라 무엇이 오는지 모르고 받은 그대로 둔다. 무엇을 넘길지는 페이지 조립(TASK-9)이 정한다.
// 바탕은 앱 틀이 늘 흰색 한 장이다(ui-90 AC-404.1) — 뿌리에 바탕 표시를 달지 않는다
export type DashboardHomeProps = {
  /** 'YYYY-MM-DD' 한국 날짜(날짜 줄) */
  today: string
  /** null·undefined = 연결 전. 있으면 연결 뒤: 큰 문장 자리에 그대로 그린다 */
  report: ReactNode | null
  /** 오늘 하루 분석 + 기간별 흐름(갈래 라) */
  analysis?: ReactNode
}

// 휴대폰 아래 단추(StickyConnect)가 이 id로 위 주 단추를 지켜본다
const CONNECT_ID = 'dashboard-connect-start'

// 날짜 줄: small muted, 날짜만 600 ink. 그 달 마지막 날이면 "·"(muted, 좌우 8) + 덧말(줄이 넘치면 "·"와 덧말이 함께 내려간다).
// 사이는 flex 간격이다. 빈칸 글자는 flex 안이라 그려지지 않고 화면 읽기·복사 글자만 띄운다
function DateLine({ today }: { today: string }) {
  const { date, note } = dateLine(today)
  return (
    <p className="flex flex-wrap gap-x-2 gap-y-1 text-small text-muted">
      <span className="font-semibold text-ink">{date}</span>
      {note ? (
        <>
          {' '}
          <span className="inline-flex gap-x-2">
            <span className="text-muted">·</span>
            {' '}
            {note}
          </span>
        </>
      ) : null}
    </p>
  )
}

// 연결 전 큰 문장 묶음: h1(화면의 하나뿐인 h1) → 안내 문장 → [비트 PC 연결 시작](화면의 주 단추) → 안심 줄(보조 글). 문구는 시안 글자 그대로(AC-414.1)
function BigSentence() {
  return (
    <>
      <h1 className="mt-3 max-w-120 text-display-m font-semibold text-balance text-ink max-md:mt-2 max-md:text-heading-m">
        비트 PC를 연결하면 오늘 숫자가 여기에 채워져요
      </h1>
      <p className="mt-4 max-w-128 text-lead text-ink-2">
        아직 받은 진료 자료가 없어 오늘 분석이 비어 있어요. 연결은 처음 한 번만 하면 되고, 연결한 뒤에는 이 자리에 오늘의 보고 문장이 올라와요.
      </p>
      <div className="mt-6 max-md:mt-5">
        <Link id={CONNECT_ID} href="/claim/setup?next=dashboard" className={`${ds.button.primaryLarge} group no-underline ${PRESS} max-md:w-full`}>
          비트 PC 연결 시작
          <Icon name="arrow" size={16} className={ARROW_MOVE} />
        </Link>
      </div>
      {/* 방패 14px를 small 첫 줄(20px) 가운데쯤에: 위 2 */}
      <p className={`mt-4 flex items-start gap-1.5 ${NOTE}`}>
        <Icon name="shield" size={14} className="mt-0.5 shrink-0 text-positive" />
        <span>환자 개인정보는 의원 PC 밖으로 나가지 않아요. 비트 자료는 읽기만 해요.</span>
      </p>
    </>
  )
}

export function DashboardHome({ today, report, analysis }: DashboardHomeProps) {
  // undefined도 연결 전이다(tab-frame 남은 일)
  const connected = report != null
  return (
    // 본문 여백: 앱 틀 안쪽(24·48, 폰 16·32)에 더해 위 32·아래 64(폰 20·32). 폰 연결 전은 아래 단추가 본문 끝을 덮는다
    <div className="pt-2 pb-4 max-md:pt-1 max-md:pb-0">
      {/* 브리핑: 1024px 이상 12칸(왼쪽 1~7 · 오른쪽 9~12, 위 4). 768~1023px 왼쪽 전체 폭(글 최대 32em) 아래 오른쪽 위 32. 폰은 쌓는다 */}
      <section aria-label="오늘 브리핑" className="lg:grid lg:grid-cols-12 lg:items-start lg:gap-x-6">
        <div className="md:max-lg:max-w-128 lg:col-span-7">
          <DateLine today={today} />
          {connected ? report : <BigSentence />}
        </div>
        {connected ? (
          // 연결 뒤: 폰은 보고 문장 바로 다음, 위 32 + 1px line-strong + 16으로 나눈 덩어리
          <div className="mt-8 max-md:border-t max-md:border-line-strong max-md:pt-4 lg:col-span-4 lg:col-start-9 lg:mt-0 lg:pt-1">
            <ReadyNowSide />
          </div>
        ) : (
          // 연결 전: 폰은 접는 칸이 위 20
          <div className="mt-8 max-md:mt-5 lg:col-span-4 lg:col-start-9 lg:mt-0 lg:pt-1">
            <ConnectSteps />
          </div>
        )}
      </section>
      {connected ? null : <ReadyNowRow />}
      {analysis}
      <FeatureIndex connected={connected} />
      {connected ? null : <StickyConnect targetId={CONNECT_ID} />}
    </div>
  )
}
