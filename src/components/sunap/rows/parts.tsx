import type { ReactNode } from 'react'

// 수납일지 표·칸 머리 모양(시안 .panel·.phead·table) [장부 줄 화면 울타리 안 — React만]. 지출 칸·다른 기기 화면도 같은 모양을 쓴다

// 표: 13px, 머리 36px canvas 바탕 12px 600 muted, 몸 40px, 첫 칸 왼쪽·끝 칸 오른쪽 20px(휴대폰 16px)
export const TABLE = 'w-full border-collapse text-small'
const CELL = 'whitespace-nowrap border-b border-line px-3 text-left first:pl-5 last:pr-5 max-md:first:pl-4 max-md:last:pr-4'
export const TH = `h-9 bg-canvas text-caption font-semibold text-muted ${CELL}`
export const TH_NUM = `${TH} text-right!`
export const TH_MID = `${TH} text-center!`
// 몸 칸: 글자색은 하나만(같은 속성 클래스를 겹치지 않는다)
const BODY = `h-10 ${CELL}`
export const TD = `${BODY} text-ink-2`
export const TD_INK = `${BODY} text-ink`
export const TD_MUTED = `${BODY} text-muted`
export const TD_NUM = `${BODY} text-right! tabular-nums text-ink`
export const TD_MID = `${BODY} text-center!`
export const TF = `h-10 bg-canvas font-semibold text-ink ${CELL} border-b-0`
export const TF_NUM = `${TF} text-right! tabular-nums`
export const TF_MID = `${TF} text-center!`

/** 칸 머리: 제목(16px 600) · 회색 설명 · (오른쪽 것) */
export function PanelHead({ id, title, hint, children }: { id: string; title: string; hint?: string; children?: ReactNode }) {
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-2 border-b border-line px-5 py-3 max-md:px-4">
      <h2 id={id} className="text-subtitle font-semibold text-ink">
        {title}
      </h2>
      {hint !== undefined && <span className="text-caption text-muted">{hint}</span>}
      {children}
    </div>
  )
}
