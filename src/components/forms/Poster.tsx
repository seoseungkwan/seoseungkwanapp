import { useId } from 'react'
import { LOGO, LOGO_AREA, POSTER, layoutPoster, logoRect, logoTextFit, type LogoBox, type PosterLogo } from '@/lib/forms/layout'
import { isAccentHex, themeHref, themeOf } from '@/lib/forms/themes'
import type { BackgroundLook } from '@/types/formBackground'
import type { ClosureNotice, ThemeArt, ThemeId } from '@/types/forms'

// 서식 탭 휴진 안내 그림(A4 세로 794×1123 SVG, spec forms design.md 5·6절).
// 기준 그림은 승인 테마 시안 docs/mockups/forms/themes.html의 poster()다 — 자리·크기·굵기·색·자간·그림자·띠 모양을 그대로 옮겼다.
// 테마 그림 2(art 2)와 AI 배경(내 배경, background)은 specs/forms-themes design.md 6절 — 배경 위 흰 판 값은
// 승인 시안 docs/mockups/forms-themes/ai-backgrounds.html 그대로다. 로고 뒤 흰 빛은 그리지 않는다(spec logo-fit AC-6703.4,
// 사용자 2026-11-19 "그라데이션 없애").
// 안내문 그림 안의 색(강조색·글자색·흰색·그림자)과 글꼴(PosterPretendard 700·900)은 인쇄물이라 앱 토큰·굵기 규칙의 예외다(ADR-028).
// 그 값은 이 파일 안에서만 쓴다. 앱 화면 쪽은 토큰만 쓴다.
// 글자로 된 병원 정보(이름·전화·주소)는 넣지 않는다 — 병원 로고 하나만 맨 아래에 둔다(specs/forms-logo).
// 로고는 병원 정보 로고 그림, 로고가 없으면 병원 이름 굵은 글자다(spec clinic-profile AC-6604.1, LogoSlot).
// 크기를 아는 로고 그림은 더 큰 로고 자리(LOGO_AREA)에 가장 크게 그린다(spec logo-fit AC-6703.1).
// 글자는 React가 이스케이프하고 HTML을 넣지 않는다

const FONT = 'PosterPretendard' // 이 이름은 src/components/forms 안에서만 쓴다(AC-3510.2)
// 그림 파일(lib/forms/png.ts)이 이 주소들을 data: 주소로 바꾼다
const FONT_CSS = [
  `@font-face { font-family: ${FONT}; font-weight: 700; src: url(/poster/fonts/Pretendard-Bold.subset.woff2) format('woff2') }`,
  `@font-face { font-family: ${FONT}; font-weight: 900; src: url(/poster/fonts/Pretendard-Black.subset.woff2) format('woff2') }`,
].join('\n')

const INK = '#262626' // '진료일정안내'·카드 이름
const LEAD = '#3a3a3a' // 안내 두 줄
const WHITE = '#fff' // 카드 바탕·띠 글·배경 위 흰 판
const RADIUS = 22 // 카드 모서리

// 배경으로 쓸 수 있는 값: JPEG data: 주소와 '#'+소문자 6자리 강조색. 아니면 배경이 없는 것처럼 테마로 그린다(AC-4603.3)
const BACKGROUND_IMAGE = 'data:image/jpeg;base64,'
const BACKGROUND_ACCENT = /^#[0-9a-f]{6}$/
const usableBackground = (background: BackgroundLook | null | undefined): BackgroundLook | null =>
  background && typeof background.image === 'string' && background.image.startsWith(BACKGROUND_IMAGE) && BACKGROUND_ACCENT.test(background.accent)
    ? background
    : null

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

// 로고 그림으로 쓸 수 있는 주소: 병원 정보 로고의 PNG data: 주소만(바깥 주소를 그림에 넣지 않는다)
const LOGO_IMAGE = 'data:image/png;base64,'
// 그림 크기는 유한한 양수 둘일 때만 안다고 본다. 아니면 크기 모름(spec logo-fit design.md 5절)
const isSide = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value) && value > 0

type LogoSlotProps = {
  logo: PosterLogo | null | undefined // undefined = 로고를 넘기지 않은 옛 부르기(옛 로고 그림), null = 읽는 중(비운다)
  area: LogoBox // 크기를 아는 로고 그림의 자리(spec logo-fit AC-6703.1·AC-6703.2)
  box: LogoBox // 원래 로고 상자: 크기 모르는 그림·이름 글자·옛 로고 그림(AC-6703.3·AC-6703.5)
  fill: string // 이름 글자 색
}
// 로고 자리 하나(spec clinic-profile design.md 6절, spec logo-fit design.md 5절): 그림이고 크기를 알면 자리(area) 안에 비율을 지켜
// 가장 크게(logoRect), 크기를 모르면 원래 상자(box) 전체에 비율을 지켜(xMidYMid meet). 글자면 상자 가운데 900 글자를
// 상자 높이 80%에서 상자 폭에 맞춘 크기로. 가장 작은 크기로도 넘치면 상자 폭으로 눌러 그린다. 환자 안내문(GuidePoster)도 같이 쓴다
export function LogoSlot({ logo, area, box, fill }: LogoSlotProps) {
  if (logo === undefined) return <image href={LOGO.href} x={box.x} y={box.y} width={box.width} height={box.height} />
  if (logo === null) return null
  if (logo.kind === 'image') {
    if (typeof logo.href !== 'string' || !logo.href.startsWith(LOGO_IMAGE)) return null
    const { width, height } = logo
    const at = isSide(width) && isSide(height) ? logoRect(area, { width, height }) : box
    return <image href={logo.href} x={at.x} y={at.y} width={at.width} height={at.height} preserveAspectRatio="xMidYMid meet" />
  }
  const text = typeof logo.text === 'string' ? logo.text.trim() : ''
  if (!text) return null
  const { size, squeeze } = logoTextFit(text, box)
  return (
    <text
      x={box.x + box.width / 2}
      y={box.y + box.height / 2}
      textAnchor="middle"
      dominantBaseline="central"
      fontFamily={FONT}
      fontSize={size}
      fontWeight={900}
      fill={fill}
      textLength={squeeze ? box.width : undefined}
      lengthAdjust={squeeze ? 'spacingAndGlyphs' : undefined}
    >
      {text}
    </text>
  )
}

type PosterProps = {
  notice: ClosureNotice
  theme: ThemeId
  art?: ThemeArt // 테마 그림 번호(기본 1)
  background?: BackgroundLook | null // 내 배경(AI 배경). 쓸 수 없는 값이면 테마로 그린다
  logo?: PosterLogo | null // 병원 정보 로고(서식 화면이 늘 넘긴다). null = 읽는 중
}

export function Poster({ notice, theme, art = 1, background = null, logo }: PosterProps) {
  // 미리보기와 인쇄 사본이 한 화면에 있어도 그림자·흐림 이름이 겹치지 않게 한다(숨긴 쪽 필터를 가리키면 그림자가 사라질 수 있다)
  const uid = useId().replace(/[^\w-]/g, '')
  const shadowId = `poster-shadow-${uid}`
  const softId = `poster-soft-${uid}`
  const bg = usableBackground(background)
  // 강조색('N월'·날짜 띠·카드 아래 글): 직접 고른 글자 색이 맞는 모양이면 그 색, 아니면 자동(배경 강조색 또는 테마 강조색) (specs/forms-accent design.md 6절)
  const accent = isAccentHex(notice.accent) ? notice.accent : bg ? bg.accent : themeOf(theme).accent
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
        {bg && (
          <filter id={softId} x="-10%" y="-10%" width="120%" height="120%">
            <feGaussianBlur stdDeviation="18" />
          </filter>
        )}
      </defs>
      {bg ? (
        <>
          <image href={bg.image} x="0" y="0" width={POSTER.width} height={POSTER.height} preserveAspectRatio="xMidYMid slice" />
          {/* 어떤 그림이 와도 글자가 읽히게: 글자 뒤 반투명 흰 판. 로고 뒤 흰 빛은 없다(spec logo-fit AC-6703.4) */}
          <rect x="64" y="70" width="666" height="770" rx="40" fill={WHITE} fillOpacity=".55" filter={`url(#${softId})`} />
        </>
      ) : (
        <image href={themeHref(theme, art)} x="0" y="0" width={POSTER.width} height={POSTER.height} />
      )}
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
      {/* 병원 로고: 카드 다음 맨 위에, 받침·필터 없이 그대로(사용자 선택 ①). 이름 글자는 진한 글자색 */}
      <LogoSlot logo={logo} area={LOGO_AREA} box={LOGO} fill={INK} />
    </svg>
  )
}
