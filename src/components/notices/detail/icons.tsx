import type { ReactNode } from 'react'

// 글 화면 아이콘(specs/notices TASK-18). 그림은 승인 시안 docs/mockups/notices/index.html의 I 그대로다(공용 Icon.tsx에 없는 것들).
// 늘 꾸밈이다(aria-hidden). 색은 글자색을 따르고(currentColor) 놓는 자리가 text-* 토큰 클래스로 정한다

type Props = { size: number; viewBox: string; stroke?: string; fill?: boolean; className?: string; children: ReactNode }

function Svg({ size, viewBox, stroke, fill, className, children }: Props) {
  return (
    <svg
      aria-hidden="true"
      className={className ? `shrink-0 ${className}` : 'shrink-0'}
      width={size}
      height={size}
      viewBox={viewBox}
      fill={fill ? 'currentColor' : 'none'}
      stroke={fill ? undefined : 'currentColor'}
      strokeWidth={stroke}
      strokeLinejoin="round"
    >
      {children}
    </svg>
  )
}

type IconProps = { className?: string }

export const LeftIcon = ({ className }: IconProps) => (
  <Svg size={16} viewBox="0 0 16 16" stroke="1.6" className={className}>
    <path d="M10 3.5 5.5 8l4.5 4.5" />
  </Svg>
)

export const StarIcon = ({ on, className }: IconProps & { on: boolean }) => (
  <svg
    aria-hidden="true"
    className={className ? `shrink-0 ${className}` : 'shrink-0'}
    width="18"
    height="18"
    viewBox="0 0 20 20"
    fill={on ? 'currentColor' : 'none'}
    stroke="currentColor"
    strokeWidth="1.5"
    strokeLinejoin="round"
  >
    <path d="m10 2.8 2.2 4.6 5 .7-3.6 3.5.9 5-4.5-2.4-4.5 2.4.9-5L2.8 8.1l5-.7z" />
  </svg>
)

export const WarnIcon = ({ className }: IconProps) => (
  <Svg size={18} viewBox="0 0 20 20" stroke="1.6" className={className}>
    <path d="M10 3 18 17H2z" />
    <path d="M10 8v4M10 14.5v.5" />
  </Svg>
)

export const CheckCircleIcon = ({ className }: IconProps) => (
  <Svg size={18} viewBox="0 0 20 20" stroke="1.6" className={className}>
    <circle cx="10" cy="10" r="7.5" />
    <path d="m6.8 10.2 2.2 2.2 4.2-4.6" />
  </Svg>
)

export const CheckIcon = ({ className }: IconProps) => (
  <Svg size={14} viewBox="0 0 16 16" stroke="2" className={className}>
    <path d="m3.5 8.5 3 3 6-7" />
  </Svg>
)

export const ArrowIcon = ({ className }: IconProps) => (
  <Svg size={16} viewBox="0 0 16 16" stroke="1.6" className={className}>
    <path d="M3 8h10M9 4l4 4-4 4" />
  </Svg>
)

export const SparkIcon = ({ className }: IconProps) => (
  <Svg size={16} viewBox="0 0 16 16" fill className={className}>
    <path d="M8 1.5 9.3 6.7 14.5 8 9.3 9.3 8 14.5 6.7 9.3 1.5 8l5.2-1.3z" />
  </Svg>
)

export const InfoIcon = ({ className }: IconProps) => (
  <Svg size={14} viewBox="0 0 16 16" stroke="1.5" className={className}>
    <circle cx="8" cy="8" r="6" />
    <path d="M8 7.2v3.8M8 5v.4" />
  </Svg>
)

export const ExternalIcon = ({ className }: IconProps) => (
  <Svg size={14} viewBox="0 0 16 16" stroke="1.5" className={className}>
    <path d="M9 3h4v4M13 3 7.5 8.5M12 9.5V13H3V4h3.5" />
  </Svg>
)

export const FileIcon = ({ className }: IconProps) => (
  <Svg size={16} viewBox="0 0 16 16" stroke="1.4" className={className}>
    <path d="M4 1.8h5.2L12.5 5v9.2H4z" />
    <path d="M9 1.8V5.2h3.5" />
  </Svg>
)

export const ShieldIcon = ({ className }: IconProps) => (
  <Svg size={16} viewBox="0 0 16 16" stroke="1.5" className={className}>
    <path d="M8 1.8 13 3.6v4c0 3-2.2 5.3-5 6.6-2.8-1.3-5-3.6-5-6.6v-4z" />
    <path d="M6 8h4" />
  </Svg>
)

export const StopIcon = ({ className }: IconProps) => (
  <Svg size={18} viewBox="0 0 20 20" stroke="1.6" className={className}>
    <circle cx="10" cy="10" r="7.5" />
    <path d="M6.5 13.5l7-7" />
  </Svg>
)

export const ClockIcon = ({ className }: IconProps) => (
  <Svg size={14} viewBox="0 0 16 16" stroke="1.5" className={className}>
    <circle cx="8" cy="8" r="6" />
    <path d="M8 4.8V8l2.2 1.4" />
  </Svg>
)

export const FlagIcon = ({ className }: IconProps) => (
  <Svg size={12} viewBox="0 0 16 16" fill className={className}>
    <path d="M3 1.5h1.6v13H3z" />
    <path d="M4.6 2h8.4l-2 3.2 2 3.3H4.6z" />
  </Svg>
)
