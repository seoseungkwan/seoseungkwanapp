import Link from 'next/link'
import { Icon, type IconName } from '@/components/common/Icon'
import { ds } from '@/components/ui/classes'

// 도구 단추 줄(AC-610.2, UI_GUIDE '도구 단추 줄', 목업 .tools·.tool). 링크 목록이고 고른 것에 aria-current="page"가 붙는다(색만으로 보이지 않는다).
// 기능 폴더에 둔다(규칙 C6). 나중에 다른 탭과 공용으로 모을 수 있게 props는 일반 모양이다
const TOOL = `inline-flex h-9 shrink-0 items-center gap-2 whitespace-nowrap rounded-control border px-4 text-body no-underline transition active:translate-y-px max-md:h-11 ${ds.focusRing}`
const TOOL_ON = 'border-accent bg-accent-soft font-semibold text-accent-strong'
const TOOL_OFF = 'border-line-strong bg-surface font-medium text-ink hover:bg-canvas'

export function ToolRow<T extends string>({
  label,
  items,
  current,
}: {
  /** nav 이름 */
  label: string
  items: readonly { id: T; label: string; href: string; icon?: IconName }[]
  current: T
}) {
  return (
    // 휴대폰: 본문 좌우 여백까지 옆으로 밀린다. 위아래 2px은 초점 고리가 잘리지 않게
    <nav aria-label={label} className="flex gap-2 max-md:-mx-4 max-md:overflow-x-auto max-md:px-4 max-md:py-0.5 max-md:[scrollbar-width:none]">
      {items.map((item) => {
        const on = item.id === current
        return (
          <Link key={item.id} href={item.href} aria-current={on ? 'page' : undefined} className={`${TOOL} ${on ? TOOL_ON : TOOL_OFF}`}>
            {item.icon && <Icon name={item.icon} className={on ? 'text-accent' : 'text-ink-2'} />}
            {item.label}
          </Link>
        )
      })}
    </nav>
  )
}
