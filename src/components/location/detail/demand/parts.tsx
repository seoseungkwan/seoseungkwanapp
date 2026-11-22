import type { ReactNode } from 'react'
import { SourceLine } from '@/components/location/common/SourceLine'
import { WhyLine } from '@/components/location/common/WhyLine'
import type { SourceId } from '@/types/location'
import { look } from './look'
import { KAKAO_SRC, nearState, type NearPlace, type NearReply } from './near'
import { KAKAO_FRESH, LOADING } from './text'

// 두 묶음이 같이 쓰는 조각: 묶음 틀(시안 sec()) · 카카오 값 자리(불러오는 중 · 못 받음 · 값) · 카카오 출처 줄

/** 묶음 틀: 닻 id(목차가 건너뜀) · 제목 · 곁글 · 몸통 */
export function Section({ id, title, aside, children }: { id: string; title: string; aside: string; children: ReactNode }) {
  return (
    <section id={id} className={look.section}>
      <div className={look.head}>
        <h3 className={look.title}>{title}</h3>
        <span className={look.aside}>{aside}</span>
      </div>
      <div className={look.body}>{children}</div>
    </section>
  )
}

/** 카카오 값 자리. 불러오는 중이면 글, 못 받았으면 design.md 15절 글([다시 받기]는 종류만 넘김), 받았으면 render */
export function NearValue({
  reply,
  render,
  onRetry,
}: {
  reply: NearReply | undefined
  render: (places: readonly NearPlace[], capped: boolean) => ReactNode
  onRetry?: () => void
}) {
  const state = nearState(reply)
  if (state === null) return <span className={look.nodata}>{LOADING}</span>
  if (!state.ok) return <WhyLine why={state.why} src={KAKAO_SRC} onRetry={onRetry} place="value" />
  return <>{render(state.places, state.capped)}</>
}

/** 카카오 출처 줄: 기준 날짜 대신 `열 때마다 새로 불러와요, 저장하지 않아요`(+ 덧붙임) */
export function KakaoSource({ extra, onOpen }: { extra?: string; onOpen?: (id: SourceId) => void }) {
  return <SourceLine src={KAKAO_SRC} extra={extra ? `${KAKAO_FRESH} · ${extra}` : KAKAO_FRESH} onOpen={onOpen} />
}
