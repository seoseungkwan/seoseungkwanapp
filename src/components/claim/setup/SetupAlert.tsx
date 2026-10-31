import { useId, type ReactNode } from 'react'
import { ds } from '@/components/ui/classes'
import { errorInfo, isErrorCode } from '@/lib/errors'

// 설치·연결 확인의 오류 카드 두 가지. 문구는 lib/errors.ts에서만 가져오고, 받는 값은 번호 하나라 원래 오류 내용을 그릴 길이 없다(AC-006.6).
// errors.ts에 없는 번호(도우미가 새로 준 번호)는 번호 줄만 보인다

/**
 * 위쪽 오류 카드(목업 화면 1 '.err'): 모양은 공통 ErrorCard(negative-soft·4px·안쪽 12px 16px)와 같고, 목업처럼 카드 안 오른쪽에 [다시 확인]이 있다.
 * 공통 ErrorCard는 단추 자리가 없어(단추는 카드 밖) 같은 모양을 여기서 그린다
 */
export function SetupAlert({ code, onRetry, disabled }: { code: string; onRetry(): void; disabled: boolean }) {
  const info = isErrorCode(code) ? errorInfo(code) : null
  return (
    <div role="alert" className="flex items-start gap-2.5 rounded-control bg-negative-soft px-4 py-3 max-md:flex-wrap">
      <svg
        aria-hidden="true"
        className="mt-0.75 shrink-0 text-negative"
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
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        {info && <p className="text-body font-semibold text-negative">{info.what}</p>}
        {info && <p className="text-small text-ink-2">{info.fix}</p>}
        <p className="text-caption text-muted">오류 번호 {code}</p>
      </div>
      <div className="ml-auto flex shrink-0 gap-2 self-center">
        <button type="button" className={ds.button.secondarySmall} onClick={onRetry} disabled={disabled}>
          다시 확인
        </button>
      </div>
    </div>
  )
}

/**
 * 다른 창에서 작업 중(목업 화면 6 '다른 창에서 열려 있음'): 가운데 카드 하나(ds.panel, 안쪽 24px·폰 16px). 폭 520px·위 72px, 제목 title 600.
 * outside = [건수만 보기](설치 화면은 /claim 링크, 청구 화면은 그 자리에서 건수 보기로)
 */
export function BusyCard({ onRetry, disabled = false, outside }: { onRetry(): void; disabled?: boolean; outside: ReactNode }) {
  const titleId = useId()
  const info = errorInfo('E-BRIDGE-BUSY')
  return (
    <section
      role="alert"
      aria-labelledby={titleId}
      className={`${ds.panel} mt-18 grid w-130 max-w-full gap-3 self-center p-6 max-md:mt-4 max-md:p-4`}
    >
      <h2 id={titleId} className="text-title font-semibold text-ink">
        {info.what}
      </h2>
      <p className="text-body text-ink-2">{info.fix}</p>
      <p className="text-small text-ink-2">다른 창을 닫았다면 [다시 확인]을 누르세요.</p>
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" className={ds.button.primary} onClick={onRetry} disabled={disabled}>
          다시 확인
        </button>
        {outside}
      </div>
      <p className="text-caption text-muted">오류 번호 E-BRIDGE-BUSY</p>
    </section>
  )
}
