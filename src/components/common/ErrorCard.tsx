import { errorInfo } from '@/lib/errors'
import type { ErrorCode } from '@/types/errors'

// 오류 카드: 무엇이 · 어떻게 고치나 · 오류 번호 (b2b-redesign REQ-217 AC-217.1, UI_GUIDE '오류 카드·확인 창').
// negative-soft 바탕·4px 모서리·테두리 없음·안쪽 12px 16px. 아이콘 16(negative) + 글 세 줄(small 600 negative · small ink-2 · caption muted 고정폭).
// 안내 글은 lib/errors.ts에서만 가져온다. 받는 값은 번호 하나라 원래 오류 내용(메시지·스택)을 그릴 길이 없다.
// 다시 시도 같은 단추는 카드 밖에 둔다
export function ErrorCard({ code }: { code: ErrorCode }) {
  const info = errorInfo(code)
  return (
    <div role="alert" className="flex items-start gap-2 rounded-control bg-negative-soft px-4 py-3">
      {/* 첫 줄(small 20px 줄높이) 가운데에 맞춘다: 위 2px */}
      <svg
        aria-hidden="true"
        className="mt-0.5 shrink-0 text-negative"
        width="16"
        height="16"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <circle cx="12" cy="12" r="9" />
        <path d="M12 7.5v5.5" />
        <path d="M12 16.5h.01" />
      </svg>
      <div className="flex min-w-0 flex-col gap-0.5">
        <p className="text-small font-semibold text-negative">{info.what}</p>
        <p className="text-small text-ink-2">{info.fix}</p>
        {/* 한 덩어리 글자로 둔다(오류 번호 줄을 그대로 찾고 읽게) */}
        <p className="text-caption text-muted tabular-nums">오류 번호 {code}</p>
      </div>
    </div>
  )
}
