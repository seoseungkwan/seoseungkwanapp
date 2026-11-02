import { Icon } from '@/components/common/Icon'
import { ds } from '@/components/ui/classes'

// 점검 뒤 설정이 바뀌었을 때의 띠(AC-013.6, design.md 6-5, 목업 화면 3 '설정이 바뀜').
// 무엇이 바뀌었는지는 싣지 않는다: 건수·누가는 서버에 없다. 화면 맨 위 노란 띠이고 [다시 점검]은 그 안에 있다(빠진 화면 승인 목업 5번). [비트에 입력]을 막는 것은 memo/MemoPanel이 settingsStale로 한다
export function SettingsChangedBanner({ onRecheck, busy }: { onRecheck(): void; busy: boolean }) {
  return (
    <div role="status" className="flex flex-wrap items-center gap-3 rounded-control bg-warning-soft px-4 py-3">
      <Icon name="stop" className="shrink-0 text-warning" />
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <p className="text-small font-semibold text-ink">설정이 바뀌었어요, 다시 점검하세요</p>
        <p className="text-small text-ink-2">지금 보이는 결과는 바뀌기 전 기준이에요. 고친 메모는 그대로 남아요.</p>
      </div>
      <button
        type="button"
        className={`${ds.button.primarySmall} max-md:w-full`}
        aria-busy={busy || undefined}
        onClick={() => {
          if (!busy) onRecheck()
        }}
      >
        {busy ? '다시 점검하는 중…' : '다시 점검'}
      </button>
    </div>
  )
}
