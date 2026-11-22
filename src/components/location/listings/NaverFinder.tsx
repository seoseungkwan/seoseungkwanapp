'use client'

// 매물 찾기 (spec location AC-7910.1, design.md 13절, 시안 ?s=listings '매물 찾기').
// 고른 점의 네이버 부동산 상가 매물 지도 링크(links.ts naverLandUrl)를 새 창(NEW_TAB: noopener noreferrer)으로 연다.
// 앱은 네이버를 부르지 않는다 — 주소 글자만 만들고 여는 것은 브라우저 링크다. 점(동 가운데·후보 자리)은 부르는 쪽이 준다
import { useId, useState } from 'react'
import { naverLandUrl, NEW_TAB, type LinkPoint } from '@/lib/location/links'
import { look } from './look'
import { ExtIcon, Section } from './Section'

export type NaverPlace = { id: string; label: string; point: LinkPoint }

export const FIND_TEXT = {
  title: '매물 찾기',
  aside: '부동산 사이트에서 보고 마음에 드는 것만 붙여 넣어요',
  pick: '어느 동 매물을 볼까요',
  open: '네이버 부동산에서 보기',
  help: '새 창에서 그 동 상가 매물 지도가 열려요',
  noPlace: '동네 훑기에서 동을 고르거나 후보를 더하면 그 둘레 매물 지도를 열 수 있어요.',
  why: '부동산 사이트의 매물을 이 앱이 저절로 가져오는 것은 사이트 약관과 법으로 막혀 있어요. 그래서 새 창에서 보고, 마음에 드는 매물의 주소(링크)와 숫자만 아래에 붙여 넣어요.',
} as const

/** 한국 범위 밖 점은 링크를 만들지 않는다(null) */
function hrefOf(point: LinkPoint): string | null {
  try {
    return naverLandUrl(point)
  } catch {
    return null
  }
}

export function NaverFinder({ places, defaultPlaceId }: { places: readonly NaverPlace[]; defaultPlaceId?: string }) {
  const selectId = useId()
  const usable = places.flatMap((p) => {
    const href = hrefOf(p.point)
    return href === null ? [] : [{ id: p.id, label: p.label, href }]
  })
  const [picked, setPicked] = useState(defaultPlaceId)
  const current = usable.find((p) => p.id === picked) ?? usable[0]

  return (
    <Section title={FIND_TEXT.title} aside={FIND_TEXT.aside}>
      {current ? (
        <div className={look.find}>
          <div className={look.findField}>
            <label htmlFor={selectId} className={look.label}>
              {FIND_TEXT.pick}
            </label>
            <select id={selectId} className={look.input} value={current.id} onChange={(e) => setPicked(e.target.value)}>
              {usable.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.label}
                </option>
              ))}
            </select>
          </div>
          <a className={look.buttonLarge} href={current.href} {...NEW_TAB}>
            {FIND_TEXT.open}
            <ExtIcon />
          </a>
          <span className={look.findHelp}>{FIND_TEXT.help}</span>
        </div>
      ) : (
        <p className={look.empty}>{FIND_TEXT.noPlace}</p>
      )}
      <p className={look.whyBox}>{FIND_TEXT.why}</p>
    </Section>
  )
}
