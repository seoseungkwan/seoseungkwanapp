import { Fragment, type ReactNode } from 'react'
import { guideColorsOf, type GuideValue } from '@/lib/forms/guide'
import { GUIDE_LOGO, GUIDE_LOGO_AREA, GUIDE_PAGE, layoutGuide, type Fitted } from '@/lib/forms/guideLayout'
import type { PosterLogo } from '@/lib/forms/layout'
import type { GuideColors } from '@/lib/forms/logoColors'
import { PICTURE_IDS, type PictureId } from '@/types/formGuide'
import { SHADOW_OPACITY, guidePalette } from './guideColors'
import { GuideDrawingPicture, GuidePicture } from './guidePictures'
import { LogoSlot } from './Poster'

// 서식 탭 환자 안내문 그림(A4 세로 794×1123 SVG, specs/forms-guide design.md 5절, AC-4504).
// 기준 그림은 승인 시안 docs/mockups/forms-guide/index.html의 poster()·T()·lineText()다 — 요소·차례·자리·색을 그대로 옮겼고,
// 자리와 글자 크기는 lib/forms/guideLayout.ts(layoutGuide)가 정한다. 검사 전 값도 그린다(미리보기). 저장·뽑기는 guideProblems가 빌 때만.
// 색은 guideColors.ts의 다섯 자리뿐이고, 노란 글자는 진회색 위(머리표·띠 제목·✓·줄 안 강조)에만 둔다.
// 노랑·진회색 두 자리는 안내문에서 직접 고른 색 > 병원 로고 색 > 지금 색으로 칠한다(spec clinic-profile AC-6604.5, guidePalette).
// 글자로 된 병원 정보(전화·주소)는 넣지 않는다 — 병원 로고 하나만 맨 아래에 둔다. 로고가 없으면 병원 이름 글자(띠 색, AC-6604.1).
// 크기를 아는 로고 그림은 더 큰 로고 자리(GUIDE_LOGO_AREA)에 가장 크게 그린다(spec logo-fit AC-6703.2).
// 글자는 React가 이스케이프하고 HTML을 넣지 않는다

const FONT = 'PosterPretendard' // 이 이름은 src/components/forms 안에서만 쓴다(AC-3510.2)
// 휴진 안내 그림(Poster.tsx)과 같은 @font-face 둘. 그림 파일(lib/forms/png.ts)이 이 주소들을 data: 주소로 바꾼다
const FONT_CSS = [
  `@font-face { font-family: ${FONT}; font-weight: 700; src: url(/poster/fonts/Pretendard-Bold.subset.woff2) format('woff2') }`,
  `@font-face { font-family: ${FONT}; font-weight: 900; src: url(/poster/fonts/Pretendard-Black.subset.woff2) format('woff2') }`,
].join('\n')

const BIG_SPACING = '-0.03em' // 작은 제목·큰 문구 자간
const BOX = { shadowX: 5, shadowY: 6, radius: 26, border: 5 } as const // 흰 상자: 그림자 자리, 모서리, 테두리 굵기(테두리는 안으로 반만큼 들어온다)

const isPictureId = (value: unknown): value is PictureId => (PICTURE_IDS as readonly unknown[]).includes(value)

type TextProps = {
  at: Fitted
  weight: 700 | 900
  fill: string
  spacing?: string
  anchor?: 'start' | 'middle'
  children: ReactNode
}
// 한 줄 글(시안 T()): 줄 가운데가 y다(dominant-baseline central). 자간은 준 칸에만
function GuideText({ at, weight, fill, spacing, anchor = 'start', children }: TextProps) {
  return (
    <text
      x={at.x}
      y={at.y}
      fontFamily={FONT}
      fontSize={at.size}
      fontWeight={weight}
      fill={fill}
      letterSpacing={spacing}
      textAnchor={anchor}
      dominantBaseline="central"
    >
      {children}
    </text>
  )
}

// 띠 줄 글(시안 lineText()): 강조 낱말은 그 줄 안의 첫 번째 같은 글을 노란 tspan 하나로. 앞뒤 조각은 줄 글 색을 따른다
function LineText({ at, em, W, Y }: { at: Fitted; em: string; W: string; Y: string }) {
  if (!em) {
    return (
      <GuideText at={at} weight={900} fill={W}>
        {at.text}
      </GuideText>
    )
  }
  const start = at.text.indexOf(em)
  const before = at.text.slice(0, start)
  const after = at.text.slice(start + em.length)
  return (
    <GuideText at={at} weight={900} fill={W}>
      {before ? <tspan>{before}</tspan> : null}
      <tspan fill={Y}>{em}</tspan>
      {after ? <tspan>{after}</tspan> : null}
    </GuideText>
  )
}

type Props = {
  content: GuideValue
  logo?: PosterLogo | null // 병원 정보 로고(서식 화면이 늘 넘긴다). null = 읽는 중(비운다)
  logoColors?: GuideColors | null // 병원 로고에서 뽑은 두 색([자동]일 때 쓴다)
}

export function GuidePoster({ content, logo, logoColors = null }: Props) {
  const palette = guidePalette(guideColorsOf(content), logoColors)
  const { yellow: Y, dark: D, white: W, note: NOTE, shadow: SHADOW } = palette
  const layout = layoutGuide(content)
  const { pill, box, picture, rows } = layout
  const label = `${content.tag}: ${content.subtitle} ${content.big1} ${content.big2}`

  // 그림 자리: 16개 중 하나면 그 그림, 'custom'이고 AI 그림이 있으면 AI 그림, 그 밖에는 아무것도 없다
  let art: ReactNode = null
  if (isPictureId(content.picture)) art = <GuidePicture id={content.picture} palette={palette} />
  else if (content.picture === 'custom' && content.drawing) art = <GuideDrawingPicture drawing={content.drawing} palette={palette} />

  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox={`0 0 ${GUIDE_PAGE.width} ${GUIDE_PAGE.height}`} role="img" aria-label={label}>
      <style>{FONT_CSS}</style>
      {/* 세 구역: 노란 윗단 · 진회색 띠 · 흰 로고 칸 */}
      <rect width={GUIDE_PAGE.width} height={GUIDE_PAGE.bandY} fill={Y} />
      <rect y={GUIDE_PAGE.bandY} width={GUIDE_PAGE.width} height={GUIDE_PAGE.logoY - GUIDE_PAGE.bandY} fill={D} />
      <rect y={GUIDE_PAGE.logoY} width={GUIDE_PAGE.width} height={GUIDE_PAGE.height - GUIDE_PAGE.logoY} fill={W} />
      {/* 머리표 알약: 진회색 위 노란 글(가운데 맞춤) */}
      <rect x={pill.x} y={pill.y} width={pill.w} height={pill.h} rx={pill.h / 2} fill={D} />
      <GuideText at={pill.text} weight={900} fill={Y} anchor="middle">
        {pill.text.text}
      </GuideText>
      {/* 작은 제목·큰 문구 두 줄: 노랑 위 진회색 */}
      {[layout.subtitle, ...layout.big].map((at, i) => (
        <GuideText key={i} at={at} weight={900} fill={D} spacing={BIG_SPACING}>
          {at.text}
        </GuideText>
      ))}
      {/* 흰 상자: 그림자 + 테두리 상자 + 글(윗줄 700 · 아랫줄 900) */}
      {box && (
        <>
          <rect x={box.x + BOX.shadowX} y={box.y + BOX.shadowY} width={box.w} height={box.h} rx={BOX.radius} fill={SHADOW} fillOpacity={SHADOW_OPACITY} />
          <rect
            x={box.x + BOX.border / 2}
            y={box.y + BOX.border / 2}
            width={box.w - BOX.border}
            height={box.h - BOX.border}
            rx={BOX.radius - BOX.border / 2}
            fill={W}
            stroke={D}
            strokeWidth={BOX.border}
          />
          {box.top && (
            <GuideText at={box.top} weight={700} fill={D}>
              {box.top.text}
            </GuideText>
          )}
          <GuideText at={box.bottom} weight={900} fill={D}>
            {box.bottom.text}
          </GuideText>
        </>
      )}
      {picture && art && <g transform={`translate(${picture.x} ${picture.y})`}>{art}</g>}
      {/* 띠: 띠 제목(노랑) → 줄(✓ 노랑 또는 노랑 원 + 진회색 번호, 글은 흰색) → 아래 작은 글(옅은 회색 700) */}
      {layout.bandTitle && (
        <GuideText at={layout.bandTitle} weight={900} fill={Y}>
          {layout.bandTitle.text}
        </GuideText>
      )}
      {rows.map((row) => {
        const y = row.text.y
        const mark =
          row.circle === null ? (
            <GuideText at={{ text: '✓', size: row.markSize, x: row.markX, y }} weight={900} fill={Y}>
              ✓
            </GuideText>
          ) : (
            <>
              <circle cx={row.markX + row.circle / 2} cy={y} r={row.circle / 2} fill={Y} />
              <GuideText at={{ text: String(row.n), size: row.markSize, x: row.markX + row.circle / 2, y }} weight={900} fill={D} anchor="middle">
                {String(row.n)}
              </GuideText>
            </>
          )
        return (
          <Fragment key={row.n}>
            {mark}
            <LineText at={row.text} em={row.em} W={W} Y={Y} />
          </Fragment>
        )
      })}
      {layout.note && (
        <GuideText at={layout.note} weight={700} fill={NOTE}>
          {layout.note.text}
        </GuideText>
      )}
      {/* 병원 로고: 흰 로고 칸 가운데, 받침·필터 없이 그대로. 이름 글자는 띠 색 */}
      <LogoSlot logo={logo} area={GUIDE_LOGO_AREA} box={GUIDE_LOGO} fill={D} />
    </svg>
  )
}
