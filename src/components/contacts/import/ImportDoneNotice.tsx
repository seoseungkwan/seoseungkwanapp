'use client'

import { Icon } from '@/components/common/Icon'
import { look } from '../parts/look'

// [넣기] 뒤 목록 위 초록 줄(requirements.md '화면 글자' 엑셀 미리 보기 마지막 줄, 시안 기본값 26·?s=upload-done, AC-6506.4의 부품 몫).
// [닫기]를 누를 때까지 남는다. 넣지 않은 줄이 0이면 뒤 문장을 뺀다. 숫자는 넣기 전 계획의 planCounts(changeLabels.ts)를 화면이 넘긴다.
// 바깥 여백은 놓는 자리(TASK-7)가 준다(시안은 도구 줄 아래 16px)

export function ImportDoneNotice({ added, changed, skipped, onClose }: { added: number; changed: number; skipped: number; onClose: () => void }) {
  const rest = skipped > 0 ? ` 넣지 않은 줄 ${skipped}개는 엑셀에서 고쳐 다시 올리면 돼요.` : ''
  return (
    <div role="status" className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-control bg-positive-soft px-4 py-3 text-ink">
      <Icon name="check" size={14} className="shrink-0 text-positive" />
      <p className="min-w-0 flex-[1_1_320px]">
        <b className="font-semibold text-positive">엑셀에서 넣었어요.</b>
        {` 새로 ${added}곳 · 바뀜 ${changed}곳.${rest}`}
      </p>
      <button type="button" onClick={onClose} className={look.ghostSmall}>
        닫기
      </button>
    </div>
  )
}
