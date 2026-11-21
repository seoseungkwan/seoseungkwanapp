import Link from 'next/link'
import type { ReactNode } from 'react'
import { Icon } from '@/components/common/Icon'
import { ds } from '@/components/ui/classes'
import { emrWaitTitle, type NonBitEmr } from '@/lib/clinic/emrText'
import type { EmrKind } from '@/types/clinicProfile'
import { ConnectSteps } from './ConnectSteps'
import { dateLine } from './dateLine'
import { FeatureIndex } from './FeatureIndex'
import { ARROW_MOVE, NOTE, PRESS } from './layout'
import { ReadyNowRow, ReadyNowSide } from './ReadyNow'
import { StickyConnect } from './StickyConnect'

// 대시보드 짜임 — 1안 오늘 브리핑 (tab-frame REQ-306·REQ-316, ui-90 REQ-414, design.md '대시보드 (TASK-11)', 시안 docs/mockups/ui-90/app/gen.py dash_body).
// 훅이 없는 부품이다(BitDashboard 안에서 그려진다). 자료를 읽지 않고 연결 상태도 판정하지 않는다: report 하나로 모양을 안다(report != null이면 연결 뒤).
//   report null·undefined = 연결 전: 큰 문장 · 연결 순서 · "연결하면 바로 쓸 수 있어요" 한 줄 · 휴대폰 아래 단추
//   report 있음 = 연결 뒤(dashboard-ux AC-2707.2): 한 칸 브리핑(날짜 줄·report, h1은 report 안) → analysis → 바로 가기(지금 바로 묶음) → 기능 목차
//   쓰는 EMR이 비트가 아니고 연결 전(emr-choice AC-7103.1, design.md 4절, 시안 docs/mockups/emr-choice/index.html ②): 큰 문장 자리에 준비 중 안내 · [쓰는 EMR 바꾸기].
//   연결 순서·폰 아래 단추·안심 줄은 없고, 그 아래 '지금 바로' 줄·analysis·기능 목차는 다른 탭 단추처럼 그대로다. 연결 뒤는 emr과 상관없이 그대로(AC-7103.2)
// notice(contacts AC-6507.1, 무상 수리 알림)는 받은 그대로 '맨 위 줄 바로 아래'에 둔다: 연결 뒤는 브리핑 칸의 report(머리 줄과 그 아래 오류 상자, 또는 읽는 중·실패 블록) 다음,
//   연결 전(비트·비트 아닌 EMR)은 날짜 줄 다음·큰 문장 앞. 무엇을 그릴지(0줄이면 null)는 넘기는 쪽이 정한다
// analysis(오늘 하루 분석 + 기간별 흐름)는 갈래 라 몫이라 무엇이 오는지 모르고 받은 그대로 둔다. 무엇을 넘길지는 페이지 조립(TASK-9)이 정한다.
// 바탕은 앱 틀이 늘 흰색 한 장이다(ui-90 AC-404.1) — 뿌리에 바탕 표시를 달지 않는다
export type DashboardHomeProps = {
  /** 'YYYY-MM-DD' 한국 날짜(날짜 줄) */
  today: string
  /** null·undefined = 연결 전. 있으면 연결 뒤: 맨 위 한 칸에 그대로 그린다(숫자가 있으면 머리 줄) */
  report: ReactNode | null
  /** 오늘 하루 분석 + 기간별 흐름(갈래 라) */
  analysis?: ReactNode
  /** 주면 날짜 글자 대신 그린다(숫자를 읽은 뒤의 날짜 고르기, bit-dashboard AC-605.1) */
  dateLine?: ReactNode
  /** 쓰는 EMR(emr-choice AC-7103.1). 주지 않으면 'bit'. 병원 정보를 읽는 중·실패면 BitDashboard가 'bit'를 넘긴다(AC-7103.2) */
  emr?: EmrKind
  /** 맨 위 줄 바로 아래 알림(contacts AC-6507.1, 무상 수리). 주지 않거나 null이면 아무것도 없다 */
  notice?: ReactNode
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
        아직 받은 진료 자료가 없어 오늘 분석이 비어 있어요. 연결은 처음 한 번만 하면 되고, 연결한 뒤에는 이 화면에 오늘 숫자와 보고 문장이 채워져요.
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

// 비트가 아닌 병원의 연결 전 묶음(emr-choice AC-7103.1): h1(BigSentence와 같은 글 모양) → 안내 글 → [쓰는 EMR 바꾸기](설정 → 병원 정보). 문구는 명세 글자 그대로
function EmrWaitSentence({ emr }: { emr: NonBitEmr }) {
  return (
    <>
      <h1 className="mt-3 max-w-120 text-display-m font-semibold text-balance text-ink max-md:mt-2 max-md:text-heading-m">{emrWaitTitle(emr)}</h1>
      <p className="mt-4 max-w-128 text-lead text-ink-2">
        지금은 비트만 연결돼요. 연결이 생기면 이 화면에 오늘 숫자와 보고 문장이 채워져요. 그동안 업무일지·예약·서식은 그대로 쓸 수 있어요.
      </p>
      <div className="mt-6 max-md:mt-5">
        <Link href="/settings" className={`${ds.button.secondary} no-underline ${PRESS} max-md:w-full`}>
          쓰는 EMR 바꾸기
        </Link>
      </div>
    </>
  )
}

export function DashboardHome({ today, report, analysis, dateLine: dateControl, emr = 'bit', notice }: DashboardHomeProps) {
  // undefined도 연결 전이다(tab-frame 남은 일)
  const connected = report != null
  if (connected) {
    // 연결 뒤(dashboard-ux AC-2707.2): 머리 줄(report) → 분석(일별 현황 · AI 요약 · 기간별 흐름, analysis) → 바로 가기(삭감 예방 사전점검) → 기능 목차.
    // 지금 바로 묶음은 브리핑 오른쪽 칸에서 맨 아래 바로 가기 자리로 옮겼다(글 그대로)
    return (
      <div className="pt-2 pb-4 max-md:pt-1 max-md:pb-0">
        <section aria-label="오늘 브리핑">
          {/* 한 칸(전체 폭): 날짜 줄 → report(머리 줄). 숫자가 없는 읽는 중·실패는 오늘 날짜 줄(AC-605.7)이고, 숫자가 있으면 날짜 고르기가 일별 현황 기준일 묶음으로 가서 null을 받는다 */}
          <div>
            {dateControl === undefined ? <DateLine today={today} /> : dateControl}
            {report}
            {notice}
          </div>
        </section>
        {analysis}
        <div className="mt-12 border-t border-line-strong pt-5 max-md:mt-8 max-md:pt-4">
          <div className="max-w-130">
            <ReadyNowSide />
          </div>
        </div>
        <FeatureIndex connected />
      </div>
    )
  }
  if (emr !== 'bit') {
    // 비트가 아닌 병원 연결 전(AC-7103.1): 브리핑은 왼쪽 칸 하나(연결 순서 자리 없음), 폰 아래 연결 단추 없음. 그 아래는 비트 병원 연결 전과 같다
    return (
      <div className="pt-2 pb-4 max-md:pt-1 max-md:pb-0">
        <section aria-label="오늘 브리핑" className="lg:grid lg:grid-cols-12 lg:items-start lg:gap-x-6">
          <div className="md:max-lg:max-w-128 lg:col-span-7">
            {dateControl ?? <DateLine today={today} />}
            {notice}
            <EmrWaitSentence emr={emr} />
          </div>
        </section>
        <ReadyNowRow />
        {analysis}
        <FeatureIndex connected={false} />
      </div>
    )
  }
  return (
    // 본문 여백: 앱 틀 안쪽(24·48, 폰 16·32)에 더해 위 32·아래 64(폰 20·32). 폰 연결 전은 아래 단추가 본문 끝을 덮는다
    <div className="pt-2 pb-4 max-md:pt-1 max-md:pb-0">
      {/* 브리핑: 1024px 이상 12칸(왼쪽 1~7 · 오른쪽 9~12, 위 4). 768~1023px 왼쪽 전체 폭(글 최대 32em) 아래 오른쪽 위 32. 폰은 쌓는다 */}
      <section aria-label="오늘 브리핑" className="lg:grid lg:grid-cols-12 lg:items-start lg:gap-x-6">
        <div className="md:max-lg:max-w-128 lg:col-span-7">
          {dateControl ?? <DateLine today={today} />}
          {notice}
          <BigSentence />
        </div>
        {/* 연결 전: 폰은 접는 칸이 위 20 */}
        <div className="mt-8 max-md:mt-5 lg:col-span-4 lg:col-start-9 lg:mt-0 lg:pt-1">
          <ConnectSteps />
        </div>
      </section>
      <ReadyNowRow />
      {analysis}
      <FeatureIndex connected={false} />
      <StickyConnect targetId={CONNECT_ID} />
    </div>
  )
}
