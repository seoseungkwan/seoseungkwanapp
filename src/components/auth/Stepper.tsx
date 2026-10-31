import { Icon } from '@/components/common/Icon'

// 가입 단계 (b2b-redesign REQ-215 AC-215.1, 승인 대기 AC-216.1, UI_GUIDE '인증 화면' 단계 표시). 시안 docs/mockups/b2b-redesign/screens.mjs의 stepper.
// 가입 신청(current 2)·승인 대기(current 3)가 같이 쓴다. 서버에서 그대로 그린다(훅 없음).
// <li> 3개. 단계 사이 연결선(24px·1px line-strong, 768px 미만 10px)은 둘째·셋째 <li> 맨 앞의 aria-hidden 선이다(<ol> 안에 <li> 말고 다른 요소를 두지 않게).
// 20px 칸(번호·체크)과 선은 꾸밈이라 읽지 않는다 → 화면 읽기는 단계 이름 + 끝난 단계의 "끝남", 지금 단계는 aria-current="step"
const STEPS = ['구글 로그인', '가입 신청', '관리자 승인'] as const

// 칸: 20px·4px·1px 테두리·caption 600 가운데. 색은 상태마다
const SQUARE = 'grid size-5 shrink-0 place-items-center rounded-control border text-caption font-semibold'
const LOOK = {
  done: { li: 'text-ink-2', square: 'border-transparent bg-accent-soft text-accent' },
  now: { li: 'font-semibold text-ink', square: 'border-accent bg-accent text-surface' },
  next: { li: 'text-muted', square: 'border-line-strong text-muted' },
} as const

export function Stepper({ current }: { current: 2 | 3 }) {
  return (
    <ol aria-label="가입 단계" className="mt-6 flex list-none flex-wrap items-center gap-2 text-small max-md:gap-1.5">
      {STEPS.map((label, i) => {
        const n = i + 1
        const state = n < current ? 'done' : n === current ? 'now' : 'next'
        return (
          <li
            key={label}
            aria-current={state === 'now' ? 'step' : undefined}
            className={`flex items-center gap-2 whitespace-nowrap max-md:gap-1.5 ${LOOK[state].li}`}
          >
            {n > 1 && <span aria-hidden="true" className="h-px w-6 shrink-0 bg-line-strong max-md:w-2.5" />}
            <span aria-hidden="true" className={`${SQUARE} ${LOOK[state].square}`}>
              {state === 'done' ? <Icon name="check" size={12} /> : n}
            </span>
            <span>{label}</span>
            {state === 'done' && (
              <>
                {' '}
                <span className="sr-only">끝남</span>
              </>
            )}
          </li>
        )
      })}
    </ol>
  )
}
