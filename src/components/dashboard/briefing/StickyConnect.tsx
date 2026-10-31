'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import { Icon } from '@/components/common/Icon'
import { ds } from '@/components/ui/classes'

// 휴대폰 아래 단추 (tab-frame AC-306.4, design.md '대시보드 짜임' 휴대폰 아래 단추, 메모 §3·§7). 연결 전에만 DashboardHome이 그린다.
// 위의 [비트 PC 연결 시작](targetId)을 IntersectionObserver로 보다가 화면 밖이면 아래에서 올라와 보이고(200ms), 다시 보이면 숨는다.
// 주 단추를 id로 찾는다 — 다른 부품을 클라이언트로 바꾸지 않으려고. 처음 그림(서버)과 IntersectionObserver가 없는 브라우저는 숨김이다.
// 숨김 = invisible·아래로 내림 + aria-hidden + 링크 Tab 차례에서 뺌. 768px 이상은 없다(md:hidden).
// 대시보드 뿌리의 마지막 자식이라 본문 끝까지 붙는다. 앱 틀 본문 좌우 16px·아래 32px(폰)을 덮어 화면 끝에서 끝까지 닿는다
export function StickyConnect({ targetId }: { targetId: string }) {
  const [shown, setShown] = useState(false)

  useEffect(() => {
    const target = document.getElementById(targetId)
    if (!target || typeof IntersectionObserver === 'undefined') return
    const observer = new IntersectionObserver((entries) => {
      const last = entries[entries.length - 1]
      if (last) setShown(!last.isIntersecting)
    })
    observer.observe(target)
    return () => observer.disconnect()
  }, [targetId])

  return (
    <div
      aria-hidden={shown ? undefined : true}
      className={`sticky bottom-0 -mx-4 -mb-8 border-t border-line bg-surface px-4 py-3 transition duration-200 md:hidden ${shown ? 'visible translate-y-0' : 'invisible translate-y-full'}`}
    >
      <Link
        href="/claim/setup"
        tabIndex={shown ? undefined : -1}
        className={`${ds.button.primaryLarge} group w-full transition not-disabled:active:translate-y-px`}
      >
        비트 PC 연결 시작
        <Icon name="arrow" size={16} className="transition group-hover:translate-x-0.5" />
      </Link>
    </div>
  )
}
