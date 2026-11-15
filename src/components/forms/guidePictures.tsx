import { Fragment, useId, type ReactNode } from 'react'
import { checkDrawing } from '@/lib/forms/guideDrawing'
import type { DrawShape, GuideDrawing, PictureId } from '@/types/formGuide'
import { DRAW_COLOR_VALUES, GUIDE_COLORS, SHADOW_OPACITY } from './guideColors'

// 서식 탭 환자 안내문의 그림 (specs/forms-guide design.md 5절, AC-4504.4·4504.6). 170×170 좌표의 조각이고,
// 안내문(GuidePoster)이 <g transform="translate(566 468)">로 감싸 그림 자리에 둔다. 다른 곳에 보일 때는 <svg viewBox="0 0 170 170"> 안에 둔다.
// 그림 16개는 승인 시안 docs/mockups/forms-guide/index.html의 ICONS·iconSvg()를 도형 하나하나 그대로 옮겼다(GuidePoster.test가 시안 스크립트와 견준다).
// AI 그림은 도형 목록(원·타원·네모·선·길과 색 이름)만 받아 여기서 요소를 만든다 — SVG·HTML 글을 넣지 않는다(design.md 11절).
// 색은 guideColors.ts의 로고색 셋뿐이고, <text>·<image>·바깥 주소는 없다

const { yellow: Y, dark: D, white: W } = GUIDE_COLORS

// 시안 s(w): 진회색 선, 끝·꺾임 둥글게
const s = (width = 6) => ({ stroke: D, strokeWidth: width, strokeLinecap: 'round', strokeLinejoin: 'round' }) as const

// 흰 원 받침(진회색 테두리 5) + 그림자(오른쪽 5·아래 6, 번짐 없이 검정 18%)
function PictureBase() {
  return (
    <>
      <circle cx={90} cy={91} r={82} fill={GUIDE_COLORS.shadow} fillOpacity={SHADOW_OPACITY} />
      <circle cx={85} cy={85} r={80} fill={W} stroke={D} strokeWidth={5} />
    </>
  )
}

const SPINE = [[82, 34], [88, 57], [91, 80], [89, 103], [83, 126]] as const // 척추뼈 다섯 마디의 (가운데 x, 위 y)
const FINGERS = [[56, 48, 46], [70, 36, 58], [84, 38, 56], [98, 50, 44]] as const // 손가락 넷의 (x, y, 높이)
// 달력 점: 세 열 × 세 줄, 오른쪽 아래 칸은 노랑 동그라미 자리라 비운다
const CALENDAR_DOTS = [62, 85, 108].flatMap((x) => [86, 102, 118].filter((y) => !(x === 108 && y === 118)).map((y) => [x, y] as const))
const XRAY_JOINTS = [[79, 54], [91, 54], [79, 116], [91, 116]] as const

// 그림 16개(시안 ICONS 차례·도형 그대로)
const ICONS: Record<PictureId, ReactNode> = {
  spine: (
    <>
      {SPINE.map(([x, y], i) => (
        <Fragment key={i}>
          <rect x={x - 25} y={y} width={50} height={17} rx={7} fill={i === 2 ? Y : W} {...s(5)} />
          <path d={`M${x + 25} ${y + 8.5} h12`} {...s(5)} />
        </Fragment>
      ))}
      <path d="M70 147 q15 -6 30 0" fill="none" {...s(5)} />
    </>
  ),
  knee: (
    <>
      <path d="M44 36 L74 30 L102 80 L80 98 Z" fill={W} {...s(6)} />
      <path d="M78 92 L102 82 L96 142 L68 142 Z" fill={W} {...s(6)} />
      <circle cx={96} cy={86} r={14} fill={Y} {...s(5)} />
      <path d="M118 64 l8 -8 M122 88 h11 M118 110 l8 8" {...s(5)} />
    </>
  ),
  hand: (
    <>
      {FINGERS.map(([x, y, h]) => (
        <rect key={x} x={x} y={y} width={13} height={h} rx={6.5} fill={Y} {...s(5)} />
      ))}
      <rect x={36} y={88} width={13} height={38} rx={6.5} fill={Y} {...s(5)} transform="rotate(-38 42 107)" />
      <rect x={54} y={78} width={60} height={52} rx={16} fill={Y} {...s(5)} />
      <rect x={66} y={128} width={38} height={16} rx={4} fill={W} {...s(5)} />
    </>
  ),
  syringe: (
    <g transform="rotate(-45 85 85)">
      <rect x={70} y={22} width={30} height={8} rx={3} fill={D} />
      <rect x={81} y={28} width={8} height={22} fill={D} />
      <rect x={68} y={48} width={34} height={62} rx={5} fill={W} {...s(5)} />
      <rect x={72} y={76} width={26} height={30} fill={Y} />
      <path d="M68 66 h10 M68 80 h10 M68 94 h10" {...s(4)} />
      <rect x={79} y={110} width={12} height={10} fill={D} />
      <path d="M85 120 V148" {...s(4)} />
    </g>
  ),
  document: (
    <>
      <path d="M50 32 H104 L126 54 V140 H50 Z" fill={W} {...s(6)} />
      <path d="M104 32 V54 H126" fill={Y} {...s(6)} />
      <path d="M64 72 H110 M64 90 H110 M64 108 H96" {...s(6)} />
      <circle cx={118} cy={128} r={17} fill={Y} {...s(5)} />
      <path d="M110 128 l6 6 l10 -12" fill="none" {...s(5)} />
    </>
  ),
  disc: (
    <>
      <circle cx={85} cy={85} r={54} fill={Y} {...s(6)} />
      <path d="M85 45 A40 40 0 0 1 125 85" fill="none" stroke={W} strokeWidth={6} strokeLinecap="round" />
      <path d="M45 85 A40 40 0 0 0 85 125" fill="none" stroke={W} strokeWidth={6} strokeLinecap="round" opacity=".7" />
      <circle cx={85} cy={85} r={18} fill={W} {...s(6)} />
      <circle cx={85} cy={85} r={5} fill={D} />
    </>
  ),
  idcard: (
    <>
      <rect x={32} y={48} width={106} height={74} rx={10} fill={W} {...s(6)} />
      <rect x={44} y={62} width={34} height={44} rx={4} fill={Y} {...s(5)} />
      <circle cx={61} cy={78} r={8} fill={D} />
      <path d="M47 106 Q61 86 75 106 Z" fill={D} />
      <path d="M90 70 H124 M90 86 H124 M90 102 H112" {...s(6)} />
    </>
  ),
  clock: (
    <>
      <circle cx={85} cy={85} r={54} fill={Y} {...s(6)} />
      <path d="M85 38 v10 M85 122 v10 M38 85 h10 M122 85 h10" {...s(5)} />
      <path d="M85 85 V56 M85 85 L107 98" {...s(7)} />
      <circle cx={85} cy={85} r={6} fill={D} />
    </>
  ),
  chair: (
    <>
      <rect x={50} y={36} width={18} height={62} rx={6} fill={Y} {...s(6)} />
      <rect x={50} y={90} width={70} height={16} rx={6} fill={Y} {...s(6)} />
      <path d="M58 108 V138 M112 108 V138" {...s(7)} />
    </>
  ),
  ticket: (
    <>
      <rect x={34} y={52} width={102} height={66} rx={8} fill={Y} {...s(6)} />
      <circle cx={34} cy={85} r={10} fill={W} {...s(6)} />
      <circle cx={136} cy={85} r={10} fill={W} {...s(6)} />
      <rect x={20} y={70} width={11} height={30} fill={W} />
      <rect x={139} y={70} width={11} height={30} fill={W} />
      <path d="M106 60 V110" {...s(4)} strokeDasharray="6 7" />
      <path d="M52 74 H90 M52 96 H78" {...s(7)} />
    </>
  ),
  calendar: (
    <>
      <path d="M38 46 H132 V130 H38 Z" fill={W} {...s(6)} />
      <path d="M38 46 H132 V70 H38 Z" fill={Y} {...s(6)} />
      <path d="M62 36 V54 M108 36 V54" {...s(7)} />
      {CALENDAR_DOTS.map(([x, y]) => (
        <circle key={`${x}-${y}`} cx={x} cy={y} r={5} fill={D} />
      ))}
      <circle cx={108} cy={116} r={10} fill={Y} {...s(4)} />
    </>
  ),
  card: (
    <>
      <rect x={32} y={52} width={106} height={68} rx={10} fill={Y} {...s(6)} />
      <rect x={35} y={66} width={100} height={13} fill={D} />
      <rect x={48} y={90} width={24} height={17} rx={3} fill={W} {...s(4)} />
      <path d="M84 99 H122" {...s(6)} />
    </>
  ),
  pill: (
    <>
      <g transform="rotate(-35 80 80)">
        <rect x={40} y={62} width={82} height={36} rx={18} fill={W} {...s(6)} />
        <path d="M81 62 H58 A18 18 0 0 0 58 98 H81 Z" fill={Y} {...s(6)} />
      </g>
      <circle cx={120} cy={120} r={15} fill={Y} {...s(5)} />
      <path d="M111 120 H129" {...s(4)} />
    </>
  ),
  xray: (
    <>
      <rect x={40} y={32} width={90} height={106} rx={8} fill={D} />
      <rect x={40} y={32} width={26} height={12} rx={3} fill={Y} />
      <rect x={80} y={54} width={10} height={62} fill={W} />
      {XRAY_JOINTS.map(([x, y]) => (
        <circle key={`${x}-${y}`} cx={x} cy={y} r={8} fill={W} />
      ))}
    </>
  ),
  nosign: (
    <>
      <circle cx={85} cy={85} r={50} fill={Y} {...s(11)} />
      <path d="M50 50 L120 120" {...s(11)} />
    </>
  ),
  warning: (
    <>
      <path d="M85 36 L134 124 H36 Z" fill={Y} {...s(7)} />
      <rect x={79} y={62} width={12} height={36} rx={6} fill={D} />
      <circle cx={85} cy={110} r={7} fill={D} />
    </>
  ),
}

// 미리 그려 둔 그림 하나: 받침 + 그림
export function GuidePicture({ id }: { id: PictureId }) {
  return (
    <>
      <PictureBase />
      {ICONS[id]}
    </>
  )
}

// AI 그림 도형 하나 = 요소 하나. 속성은 자리 수·정해 둔 색 값·굵기와 둥근 끝·꺾임뿐이다
function DrawnShape({ shape }: { shape: DrawShape }) {
  const paint = {
    fill: DRAW_COLOR_VALUES[shape.fill],
    stroke: DRAW_COLOR_VALUES[shape.stroke],
    strokeWidth: shape.width,
    strokeLinecap: 'round',
    strokeLinejoin: 'round',
  } as const
  const n = shape.nums
  switch (shape.kind) {
    case 'circle':
      return <circle cx={n[0]} cy={n[1]} r={n[2]} {...paint} />
    case 'ellipse':
      return <ellipse cx={n[0]} cy={n[1]} rx={n[2]} ry={n[3]} {...paint} />
    case 'rect':
      return <rect x={n[0]} y={n[1]} width={n[2]} height={n[3]} rx={n[4]} {...paint} />
    case 'line':
      return <line x1={n[0]} y1={n[1]} x2={n[2]} y2={n[3]} {...paint} />
    case 'path':
      return <path d={shape.d} {...paint} />
  }
}

// AI로 그린 그림(AC-4504.6): 같은 받침 위에, 받침 안쪽 원(85,85 r77.5)으로 자른 묶음 안에 도형을 받은 차례대로 그린다.
// 그리기 전에 checkDrawing을 다시 거치고, 못 넘으면 받침만 그린다(저장한 값·화면 값이 어긋나도 이상한 요소가 들어가지 않게)
export function GuideDrawingPicture({ drawing }: { drawing: GuideDrawing }) {
  // 미리보기와 인쇄 사본이 한 화면에 있어도 자르는 원 이름이 겹치지 않게 한다. 이름에는 글자·숫자·-만 남긴다
  const clipId = `guide-draw-${useId().replace(/[^A-Za-z0-9-]/g, '')}`
  const checked = checkDrawing(drawing)
  return (
    <>
      <PictureBase />
      {checked && (
        <>
          <clipPath id={clipId}>
            <circle cx={85} cy={85} r={77.5} />
          </clipPath>
          <g clipPath={`url(#${clipId})`}>
            {checked.shapes.map((shape, i) => (
              <DrawnShape key={i} shape={shape} />
            ))}
          </g>
        </>
      )}
    </>
  )
}
