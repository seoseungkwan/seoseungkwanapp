import { useId } from 'react'
import { POSTER, layoutPoster } from '@/lib/forms/layout'
import { themeOf } from '@/lib/forms/themes'
import type { ClosureNotice, ThemeId } from '@/types/forms'

// 서식 탭 휴진 안내 그림(A4 세로 794×1123 SVG, spec forms design.md 5·6절).
// 기준 그림은 승인 테마 시안 docs/mockups/forms/themes.html의 poster()다 — 자리·크기·굵기·색·자간·그림자·띠 모양을 그대로 옮겼다.
// 안내문 그림 안의 색(강조색·글자색·흰색·그림자)과 글꼴(PosterPretendard 700·900)은 인쇄물이라 앱 토큰·굵기 규칙의 예외다(ADR-028).
// 그 값은 이 파일 안에서만 쓴다. 앱 화면 쪽은 토큰만 쓴다.
// 병원 정보(이름·전화·주소)는 넣지 않는다. 글자는 React가 이스케이프하고 HTML을 넣지 않는다

const FONT = 'PosterPretendard' // 이 이름은 src/components/forms 안에서만 쓴다(AC-3510.2)
// 그림 파일(lib/forms/png.ts)이 이 주소들을 data: 주소로 바꾼다
const FONT_CSS = [
  `@font-face { font-family: ${FONT}; font-weight: 700; src: url(/poster/fonts/Pretendard-Bold.subset.woff2) format('woff2') }`,
  `@font-face { font-family: ${FONT}; font-weight: 900; src: url(/poster/fonts/Pretendard-Black.subset.woff2) format('woff2') }`,
].join('\n')
const themeHref = (id: ThemeId) => `/poster/themes/${id}.svg`

const INK = '#262626' // '진료일정안내'·카드 이름
const LEAD = '#3a3a3a' // 안내 두 줄
const WHITE = '#fff' // 카드 바탕·띠 글
const RADIUS = 22 // 카드 모서리

type TextProps = { x: number; y: number; size: number; weight: 700 | 900; fill: string; spacing: string; children: string }
function PosterText({ x, y, size, weight, fill, spacing, children }: TextProps) {
  return (
    <text
      x={x}
      y={y}
      textAnchor="middle"
      dominantBaseline="central"
      fontFamily={FONT}
      fontSize={size}
      fontWeight={weight}
      fill={fill}
      letterSpacing={spacing}
    >
      {children}
    </text>
  )
}

export function Poster({ notice, theme }: { notice: ClosureNotice; theme: ThemeId }) {
  // 미리보기와 인쇄 사본이 한 화면에 있어도 그림자 이름이 겹치지 않게 한다(숨긴 쪽 필터를 가리키면 그림자가 사라질 수 있다)
  const shadowId = `poster-shadow-${useId().replace(/[^\w-]/g, '')}`
  const { accent } = themeOf(theme)
  const layout = layoutPoster(notice)
  const { cx } = POSTER
  const cardsLabel = layout.cards.map((c) => `${c.date.text} ${c.name.text} ${c.status.text}`).join(', ')
  const head = `${notice.year}년 ${notice.month}월 진료일정안내`
  const label = cardsLabel ? `${head}: ${cardsLabel}` : head

  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox={`0 0 ${POSTER.width} ${POSTER.height}`} role="img" aria-label={label}>
      <style>{FONT_CSS}</style>
      <defs>
        <filter id={shadowId} x="-20%" y="-20%" width="140%" height="150%">
          <feDropShadow dx="0" dy="14" stdDeviation="17" floodColor="rgb(25,45,80)" floodOpacity=".16" />
        </filter>
      </defs>
      <image href={themeHref(theme)} x="0" y="0" width={POSTER.width} height={POSTER.height} />
      <PosterText x={cx} y={162} size={132} weight={900} fill={accent} spacing="-0.02em">
        {layout.monthText}
      </PosterText>
      <PosterText x={cx} y={296} size={120} weight={900} fill={INK} spacing="-0.045em">
        진료일정안내
      </PosterText>
      <PosterText x={cx} y={417} size={27} weight={700} fill={LEAD} spacing="-0.02em">
        {layout.leadLines[0]}
      </PosterText>
      <PosterText x={cx} y={459} size={27} weight={700} fill={LEAD} spacing="-0.02em">
        {layout.leadLines[1]}
      </PosterText>
      {layout.cards.map((c, i) => {
        const r = RADIUS
        const mid = c.x + c.w / 2
        // 위 띠: 위 모서리만 둥근 path(시안 d 그대로)
        const band = `M${c.x} ${c.y + c.headH} V${c.y + r} A${r} ${r} 0 0 1 ${c.x + r} ${c.y} H${c.x + c.w - r} A${r} ${r} 0 0 1 ${c.x + c.w} ${c.y + r} V${c.y + c.headH} Z`
        return [
          <g key={`box-${i}`} filter={`url(#${shadowId})`}>
            <rect x={c.x} y={c.y} width={c.w} height={c.headH + c.bodyH} rx={r} fill={WHITE} />
          </g>,
          <path key={`band-${i}`} d={band} fill={accent} />,
          <PosterText key={`date-${i}`} x={mid} y={c.y + c.headH / 2} size={c.date.size} weight={700} fill={WHITE} spacing="-0.02em">
            {c.date.text}
          </PosterText>,
          <PosterText key={`name-${i}`} x={mid} y={c.y + c.headH + c.bodyH * 0.3} size={c.name.size} weight={900} fill={INK} spacing="-0.03em">
            {c.name.text}
          </PosterText>,
          <PosterText key={`status-${i}`} x={mid} y={c.y + c.headH + c.bodyH * 0.67} size={c.status.size} weight={900} fill={accent} spacing="0.02em">
            {c.status.text}
          </PosterText>,
        ]
      })}
    </svg>
  )
}
