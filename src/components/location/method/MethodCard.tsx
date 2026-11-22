'use client'

import { useId, type MouseEvent } from 'react'
import { sourceHref, sourceText } from '@/components/location/common/text'
import { METHOD, bulletText, fillHow, fillWeights, type HowCtx, type MethodBullet } from '@/lib/location/method'
import type { GroupId } from '@/lib/location/score'
import type { SourceId } from '@/types/location'
import { look } from './look'

// 처음 안내 '이 탭은 이렇게 분석해요' 한 장(spec location AC-7920.1, design.md 19절, 시안 ?s=empty의 .mcard·?s=method 판 안).
// 글은 lib/location/method.ts METHOD 그대로: 머리 한 줄 · 다섯 줄(첫 줄은 글 + 묶음별 기관 표, 나머지는 줄들) · 맨 아래 [근거와 출처 모두 보기].
// 셋째 줄 무게({무게}{처음 무게})는 받은 지금 무게로 채우고(fillWeights), 다른 표시는 fillHow로 채운다 — {경쟁}은 받은 경쟁 과목 짧은 이름,
// 후보가 없는 안내라 [[기준 날짜]]는 빼고 {범위}는 처음 살필 범위 1km, {시군구}는 '시·군·구'(지금 METHOD 글에는 {무게}·{처음 무게}만 있다).
// 링크는 평범한 <a>(/location 안, Next Link 없음): 그냥 누르면 콜백, Ctrl·가운데 단추 등은 새 탭에 맡긴다. 읽기·저장 없음

export type MethodCardProps = {
  /** 다섯 항목 지금 무게(점수 설정 weights) */
  weights: Readonly<Record<GroupId, number>>
  /** 지금 경쟁으로 고른 과목 짧은 이름(rivalShortText) — 글 속 {경쟁} */
  rivalShort: string
  /** [근거와 출처 모두 보기] */
  onOpenSources: () => void
  /** 예시 출처 줄을 누르면 그 출처 줄로. 없으면 링크 주소로 간다 */
  onOpenSource?: (id: SourceId) => void
}

// 근거와 출처 탭(그 출처 줄은 sourceHref)
const SOURCES_HREF = '/location?tab=sources'

// 처음 살필 범위(METHOD 둘째 줄 '처음 1km')
const FIRST_RADIUS_M = 1000

const plainClick = (e: MouseEvent) => e.button === 0 && !e.ctrlKey && !e.metaKey && !e.shiftKey && !e.altKey

/** 한 장과 판이 같이 쓰는 몸: 머리 한 줄 · 다섯 줄 · 맨 아래. inPanel = 판 안(왼쪽 칸이 좁음), beforeLeave = 근거와 출처로 가기 전에 부름(판 닫기) */
export function MethodContent({
  weights,
  rivalShort,
  onOpenSources,
  onOpenSource,
  inPanel = false,
  beforeLeave,
}: MethodCardProps & { inPanel?: boolean; beforeLeave?: () => void }) {
  const ids = useId()
  const ctx: HowCtx = { asOf: () => null, radiusM: FIRST_RADIUS_M, sggName: null, rivalShort }
  const fill = (text: string) => fillHow(fillWeights(text, weights), ctx)
  const leave = (go: () => void) => (e: MouseEvent<HTMLAnchorElement>) => {
    if (!plainClick(e)) return
    e.preventDefault()
    beforeLeave?.()
    go()
  }

  const example = (id: SourceId) => {
    const text = sourceText(id)
    if (text === null) return null
    return (
      <span className={look.example}>
        {METHOD.exampleLabel}{' '}
        <a href={sourceHref(id)} className={look.exampleLink} onClick={onOpenSource ? leave(() => onOpenSource(id)) : undefined}>
          {text}
        </a>
      </span>
    )
  }

  const bullet = (b: MethodBullet, k: number) => {
    const text = bulletText({ lead: b.lead, text: fill(b.text) })
    return (
      <li key={k}>
        {b.lead ? (
          <>
            <b className={look.bulletLead}>{b.lead}</b>
            {text.slice(b.lead.length)}
          </>
        ) : (
          text
        )}
        {b.example && example(b.example)}
      </li>
    )
  }

  return (
    <>
      <p className={look.lead}>{fill(METHOD.lead)}</p>
      <div className={inPanel ? look.rowsInPanel : look.rows}>
        {METHOD.rows.map((row, i) => {
          const titleId = `${ids}-row-${i}`
          return (
            <div key={row.title} role="group" aria-labelledby={titleId} className={inPanel ? look.rowInPanel : look.row}>
              <h3 id={titleId} className={look.rowTitle}>
                <span aria-hidden="true" className={look.rowNo}>
                  {i + 1}
                </span>
                {row.title}
              </h3>
              <div className={look.rowBody}>
                {row.text !== null && <p className={look.rowText}>{fill(row.text)}</p>}
                {row.orgs.length > 0 && (
                  <dl>
                    {row.orgs.map((o) => (
                      <div key={o.group} className={look.org}>
                        <dt className={look.orgGroup}>{o.group}</dt>
                        <dd className={look.orgText}>{fill(o.orgs)}</dd>
                      </div>
                    ))}
                  </dl>
                )}
                {row.bullets.length > 0 && <ul className={look.bullets}>{row.bullets.map(bullet)}</ul>}
              </div>
            </div>
          )
        })}
      </div>
      <div className={look.foot}>
        <a href={SOURCES_HREF} className={look.textButton} onClick={leave(onOpenSources)}>
          {METHOD.sourcesButton}
        </a>
        <span className={look.help}>{METHOD.sourcesHelp}</span>
      </div>
    </>
  )
}

/** 처음 화면 시작 단계 아래 한 장(제목 h2 + 몸) */
export function MethodCard(props: MethodCardProps) {
  const titleId = useId()
  return (
    <section aria-labelledby={titleId} className={look.card}>
      <h2 id={titleId} className={look.cardTitle}>
        {METHOD.title}
      </h2>
      <MethodContent {...props} />
    </section>
  )
}
