// 구글 띠·자세히의 작은 선 아이콘(시안 ICON.cal·calerr·out·clock, 16칸 선, 색은 글자색). 꾸밈이라 읽지 않는다

type IconProps = { size?: number; className?: string }

const frame = (size: number, className: string) => ({
  'aria-hidden': true as const,
  width: size,
  height: size,
  viewBox: '0 0 16 16',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.5,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
  className: `shrink-0 ${className}`,
})

/** 달력(이어짐) */
export function CalendarIcon({ size = 16, className = '' }: IconProps) {
  return (
    <svg {...frame(size, className)}>
      <rect x="2" y="3" width="12" height="11" rx="1.5" />
      <path d="M2 6.5h12M5 1.8v2.4M11 1.8v2.4" />
    </svg>
  )
}

/** 달력 + 끊김(닿지 못함) */
export function CalendarOffIcon({ size = 16, className = '' }: IconProps) {
  return (
    <svg {...frame(size, className)}>
      <rect x="2" y="3" width="12" height="11" rx="1.5" />
      <path d="M2 6.5h12M5 1.8v2.4M11 1.8v2.4M6 9l4 3M10 9l-4 3" />
    </svg>
  )
}

/** 바깥으로 여는 화살표(새 탭) */
export function OutIcon({ size = 14, className = '' }: IconProps) {
  return (
    <svg {...frame(size, className)}>
      <path d="M9.5 2.5h4v4M13.5 2.5 7.5 8.5M12 9.5V13a.5.5 0 0 1-.5.5h-8A.5.5 0 0 1 3 13V5a.5.5 0 0 1 .5-.5H7" />
    </svg>
  )
}

/** 시계(기다림) */
export function ClockIcon({ size = 12, className = '' }: IconProps) {
  return (
    <svg {...frame(size, className)}>
      <circle cx="8" cy="8" r="6" />
      <path d="M8 4.8V8l2.2 1.4" />
    </svg>
  )
}
