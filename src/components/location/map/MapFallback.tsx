import { ErrorCard } from '@/components/common/ErrorCard'

// 지도·하늘 사진·로드뷰 자리에 대신 보이는 것(specs/location AC-7916.1, design.md 15절).
// 지도 열쇠만 없음 → 안내 글 / SDK를 못 받음 → E-LOC-MAP 오류 카드. 다른 칸(숫자)은 그대로다

export const NO_MAP_KEY = '카카오 지도 열쇠를 넣으면 지도가 보여요. 숫자는 지도 없이도 볼 수 있어요.'

export function MapFallback({ kind }: { kind: 'no-key' | 'failed' }) {
  return (
    <div className="flex h-full items-center justify-center bg-line p-4">
      {kind === 'no-key' ? <p className="text-center text-small text-ink-2">{NO_MAP_KEY}</p> : <ErrorCard code="E-LOC-MAP" />}
    </div>
  )
}
