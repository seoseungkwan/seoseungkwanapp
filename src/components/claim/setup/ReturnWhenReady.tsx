'use client'

import { useRouter } from 'next/navigation'
import { useEffect } from 'react'
import { Icon } from '@/components/common/Icon'

// 연결이 끝나면 대시보드로 (bit-dashboard AC-603.2, 시안 docs/mockups/bit-dashboard/gen.py setup_v '.back').
// 5단계가 모두 됨인 동안에만 그려진다. 1.5초 안에 끊기거나 화면을 떠나면 사라지면서 타이머도 지워져 이동하지 않는다.
// replace라 뒤로 가기에 연결 화면이 남지 않는다. 돌아갈 곳은 정해 둔 경로 하나다(열린 리디렉트 금지)

const RETURN_AFTER_MS = 1500

export function ReturnWhenReady({ to }: { to: '/dashboard' }) {
  const router = useRouter()

  useEffect(() => {
    const timer = setTimeout(() => router.replace(to), RETURN_AFTER_MS)
    return () => clearTimeout(timer)
  }, [router, to])

  return (
    <div role="status" className="flex items-center gap-2 rounded-control bg-positive-soft px-4 py-3">
      <Icon name="check" className="shrink-0 text-positive" />
      <p className="text-body text-ink-2">
        <b className="font-semibold text-ink">5단계를 모두 마쳤어요.</b> 대시보드로 돌아가요.
      </p>
    </div>
  )
}
