import Link from 'next/link'
import { ds } from '@/components/ui/classes'
import { Icon } from './Icon'
import type { NotReadyFeature } from './notReadyFeatures'

// 준비 중 화면 (tab-frame REQ-305, design.md '준비 중 화면', 시안 docs/mockups/dashboard-home/index.html 화면 5 + notes.md §3 '준비 중 화면').
// 아직 없는 기능의 주소(/stats 등)마다 같은 모양: h1 기능 이름 → 바깥 상자 하나(ds.panel) 안에 꾸밈 선 + 가운데 글 묶음.
// 서버에서 그대로 그린다. 자료를 읽지 않는다. 앱 틀은 (app)/layout의 AppShell이 준다.
// 768px 이상(768~1023px 포함): 상자 높이 420px(h-105), 글 묶음 가운데(안쪽 위아래 20·좌우 24).
// 768px 미만: 높이는 글에 맞고 상자 위아래 48 + 글 묶음 위아래 12(좌우 16) = 글까지 60px(시안 40 + 20과 같은 거리, 간격 단계 값만 쓴다 — design.md '시안과 다른 점').
// 넘침 자르기 클래스를 쓰지 않는다 → 꾸밈 선은 상자 안쪽 여백(inset) 안에만 둔다

// 꾸밈 선 넷(1px, 마지막만 line-strong). 글자 없는 그림이라 aria-hidden
const GHOST_LINES = ['bg-line', 'bg-line', 'bg-line', 'bg-line-strong']

export function NotReadyScreen({ feature }: { feature: NotReadyFeature }) {
  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-title font-semibold text-ink">{feature.name}</h1>
      <div className={`${ds.panel} relative flex items-center justify-center px-4 py-12 md:h-105 md:py-0`}>
        <div
          aria-hidden="true"
          className="pointer-events-none absolute top-6 right-4 bottom-6 left-4 flex flex-col justify-between md:top-16 md:right-10 md:bottom-16 md:left-18"
        >
          {GHOST_LINES.map((tone, i) => (
            <span key={i} className={`block h-px ${tone}`} />
          ))}
        </div>
        {/* 글 묶음: surface 바탕으로 뒤의 꾸밈 선을 가린다(선보다 뒤에 적어 위에 그린다) */}
        <div className="relative flex max-w-115 flex-col items-center gap-2 bg-surface px-4 py-3 text-center md:px-6 md:py-5">
          <span className={ds.chip.neutral}>준비 중</span>
          <h2 className="mt-1 text-subtitle font-semibold text-ink">준비 중인 기능입니다</h2>
          <p className="text-body text-ink-2">{feature.intro}</p>
          <ul className="mt-1 list-none text-small text-muted">
            {feature.items.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
          <Link
            href="/dashboard"
            className={`${ds.button.secondary} mt-3 no-underline transition not-disabled:active:translate-y-px`}
          >
            {/* 오른쪽 화살표를 돌려 왼쪽(돌아가기)을 가리킨다 */}
            <Icon name="arrow" className="rotate-180 text-ink-2" />
            <span>대시보드로 돌아가기</span>
          </Link>
        </div>
      </div>
    </div>
  )
}
