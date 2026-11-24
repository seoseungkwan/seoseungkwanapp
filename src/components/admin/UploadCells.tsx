import { ds } from '@/components/ui/classes'
import { FILL_CHOICES, uploadStatus, type UploadRow, type UploadStatus } from '@/lib/autoUpload/range'

// 가입 승인 '승인' 표의 새 두 칸 — 채울 기간 고르기 · 저절로 올림 두 줄(spec admin-view REQ-8022 AC-8022.3·AC-8022.4,
// design.md '가입 승인 표 2차', 시안 docs/mockups/admin-view ?s=admin-list 2차 .sel · .au). props만 받는다(네트워크·저장소 없음).
// 저장·완료 줄·실패 카드는 AdminApplications가 맡는다. 글은 lib/autoUpload/range.ts(FILL_CHOICES·uploadStatus) 그대로

/** 표 안 고르기 상자(시안 .sel): 32px · 1px line-strong · surface · 좌우 6px · small. 지역 고르기와 채울 기간 고르기가 같이 쓴다. 글자색은 놓는 자리가 */
export const selectBox = `h-8 cursor-pointer rounded-control border border-line-strong bg-surface px-1.5 text-small not-disabled:hover:border-muted disabled:cursor-not-allowed disabled:opacity-40 ${ds.focusRing}`

/** 채울 기간 고르기: 아홉 값(값 = months). 바꾸면 확인 창 없이 onChange(고른 months, 그 상자) — 고른 값은 부르는 쪽이 저장된 뒤 고친다 */
export function FillSelect({
  name,
  months,
  disabled = false,
  onChange,
}: {
  name: string
  months: number
  disabled?: boolean
  onChange: (months: number, box: HTMLSelectElement) => void
}) {
  return (
    <select
      aria-label={`${name} 채울 기간`}
      value={String(months)}
      disabled={disabled}
      onChange={(e) => onChange(Number(e.currentTarget.value), e.currentTarget)}
      className={`${selectBox} text-ink`}
    >
      {FILL_CHOICES.map((choice) => (
        <option key={choice.months} value={choice.months}>
          {choice.name}
        </option>
      ))}
    </select>
  )
}

// 두 줄 색(시안 .au): 첫 줄 보통 ink · 실패 negative 500 · 아직 없음 muted, 둘째 줄 muted · 채우는 중 accent-strong. 새 색 없음
const FIRST: Record<UploadStatus['kind'], string> = {
  done: 'text-ink',
  filling: 'text-ink',
  failed: 'font-medium text-negative',
  none: 'text-muted',
}

/** 저절로 올림 칸: uploadStatus 두 줄(둘째 줄은 있을 때만) + 마우스 글. months = 손에 든 채울 기간, today = 한국 오늘 */
export function UploadState({ row, months, today }: { row: UploadRow | null | undefined; months: number; today: string }) {
  const status = uploadStatus({ row, months, today })
  return (
    <div title={status.title === '' ? undefined : status.title} className="flex min-w-0 flex-col">
      <span className={`truncate text-small ${FIRST[status.kind]}`}>{status.first}</span>
      {status.second !== null && (
        <span className={`truncate text-caption ${status.kind === 'filling' ? 'text-accent-strong' : 'text-muted'}`}>{status.second}</span>
      )}
    </div>
  )
}
