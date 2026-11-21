import Link from 'next/link'
import { ds } from '@/components/ui/classes'
import { warrantyState } from '@/lib/contacts/warranty'
import type { WarrantyItem } from '@/types/contacts'

// 대시보드 무상 수리 알림 줄 (contacts REQ-6507, design.md '대시보드 알림', requirements.md '화면 글자' 대시보드 알림,
// 시안 docs/mockups/contacts/index.html dashHtml()의 .wnote·.wn). 받은 줄만 그린다(읽기는 useWarrantySoon, 자리는 DashboardHome).
// 남은 날은 받은 오늘로 다시 센다(warrantyState): 끝나는 날이 지났거나(다음 날부터 빠짐) 30일보다 많이 남은 줄은 뺀다.
// 적게 남은 것부터(같으면 장비 이름 가나다) 셋까지, 넷 이상이면 넷째 줄이 나머지 수다. [닫기]는 없다(시안 결정).
// 모양은 '이 PC에서 비트를 읽을 수 없어요' 안내(UnreadableNote)와 같은 옅은 회색 바탕·폭이고(빨강 아님), 남은 날 글자만 주황이다

const SHOWN = 3

type Line = { item: WarrantyItem; days: number }

function soonLines(items: readonly WarrantyItem[], today: string): Line[] {
  return items
    .flatMap((item) => {
      const state = warrantyState(item.warrantyUntil, today)
      return state.kind === 'soon' ? [{ item, days: state.days }] : []
    })
    .sort((a, b) => a.days - b.days || a.item.name.localeCompare(b.item.name, 'ko'))
}

// 줄 하나 = 링크 하나: 아이콘 16 · 글(남는 폭) · '주소록에서 보기'. 줄 사이 1px 선(시안 .wn + .wn)
const ROW = `group grid grid-cols-[16px_minmax(0,1fr)_auto] items-start gap-2 rounded-control px-4 py-3 text-body text-ink-2 no-underline ${ds.focusRing}`
const DIVIDED = 'border-t border-line'

// 렌치(시안 ICON.wrench). 꾸밈이고 색은 주황
function Wrench() {
  return (
    <svg aria-hidden="true" width={16} height={16} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" className="mt-0.75 text-warning">
      <path d="M10.6 2.3a3.3 3.3 0 0 0-4 4.3l-4.2 4.2a1.4 1.4 0 0 0 2 2l4.2-4.2a3.3 3.3 0 0 0 4.3-4l-2 2-1.8-.5-.5-1.8z" />
    </svg>
  )
}

// 줄 오른쪽 '주소록에서 보기' + 오른쪽 화살표(시안 .go · ICON.right)
function Go() {
  return (
    <span className="inline-flex items-center gap-0.5 text-small leading-5.5 font-medium whitespace-nowrap text-accent">
      <span>주소록에서 보기</span>
      <svg aria-hidden="true" width={14} height={14} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6">
        <path d="M6 3.5 10.5 8 6 12.5" />
      </svg>
    </span>
  )
}

export function WarrantyNotice({ items, today }: { items: readonly WarrantyItem[]; today: string }) {
  const lines = soonLines(items, today)
  if (lines.length === 0) return null
  const rest = lines.length - SHOWN
  return (
    <div role="status" aria-label="무상 수리 알림" className="mt-3 max-w-130 rounded-control bg-canvas">
      {lines.slice(0, SHOWN).map(({ item, days }, i) => (
        <Link key={item.equipmentId} href={`/contacts?c=${encodeURIComponent(item.companyId)}`} className={i === 0 ? ROW : `${ROW} ${DIVIDED}`}>
          <Wrench />
          <span className="min-w-0 text-ink underline-offset-3 group-hover:underline">
            {item.name} 무상 수리 <b className="font-semibold text-warning">{days === 0 ? '오늘 끝나요' : `${days}일 남음`}</b> · {item.companyName}
          </span>
          <Go />
        </Link>
      ))}
      {rest > 0 && (
        <Link href="/contacts" className={`${ROW} ${DIVIDED}`}>
          <Wrench />
          <span className="min-w-0 text-ink underline-offset-3 group-hover:underline">무상 수리가 곧 끝나는 장비가 {rest}개 더 있어요</span>
          <Go />
        </Link>
      )}
    </div>
  )
}
