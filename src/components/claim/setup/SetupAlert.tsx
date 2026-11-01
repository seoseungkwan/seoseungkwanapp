import { useId, type ReactNode } from 'react'
import { Icon } from '@/components/common/Icon'
import { ds } from '@/components/ui/classes'
import { errorInfo, isErrorCode } from '@/lib/errors'
import { actionsRow } from './StepGuide'

// 비트 PC 연결의 빨간 상자 두 가지. 문구는 lib/errors.ts에서만 가져오고, 받는 값은 번호 하나라 원래 오류 내용을 그릴 길이 없다(AC-006.6).
// errors.ts에 없는 번호(도우미가 새로 준 번호)는 번호 줄만 보인다

/**
 * 위 오류 상자(ui-90 AC-412.3, 시안 setup_body '.errc'): 진짜 문제(버전 안 맞음·의원 다름) 하나 또는 방금 누른 등록이 실패한 오류만.
 * negative-soft·4px·안쪽 12px 16px, Icon stop 16 → '무엇이'(body 600 negative) · '어떻게'(body ink-2) · 오류 번호(caption ink-2) · 단추 줄.
 * 단추(actions)는 진짜 문제 단계의 내려받기·다시 등록(주)과 [다시 확인](보조)이다. 오류 번호는 이 상자에서만 보인다
 */
export function SetupAlert({ code, actions }: { code: string; actions?: ReactNode }) {
  const info = isErrorCode(code) ? errorInfo(code) : null
  return (
    <div role="alert" className="flex items-start gap-2 rounded-control bg-negative-soft px-4 py-3">
      {/* 공용 아이콘 stop 16. 첫 줄(body 22px 줄높이)에 맞춰 위 2px */}
      <Icon name="stop" className="mt-0.5 shrink-0 text-negative" />
      <div className="flex min-w-0 flex-1 flex-col">
        {info && <p className="text-body font-semibold text-negative">{info.what}</p>}
        {info && <p className="mt-0.5 max-w-160 text-body text-ink-2">{info.fix}</p>}
        <p className="mt-1 text-caption text-ink-2">오류 번호 {code}</p>
        {actions && <div className={actionsRow}>{actions}</div>}
      </div>
    </div>
  )
}

/**
 * 다른 창에서 작업 중(목업 화면 6 '다른 창에서 열려 있음'): 카드 하나(ds.panel, 안쪽 24px·폰 16px). 폭 520px, 제목 title 600.
 * 다른 청구 화면처럼 왼쪽 정렬, 페이지 제목 아래 24px(부모 사이 16 + 8)·폰 20px(12 + 8).
 * outside = [건수만 보기](비트 PC 연결 화면은 /claim 링크, 청구 화면은 그 자리에서 건수 보기로)
 */
export function BusyCard({ onRetry, disabled = false, outside }: { onRetry(): void; disabled?: boolean; outside: ReactNode }) {
  const titleId = useId()
  const info = errorInfo('E-BRIDGE-BUSY')
  return (
    <section
      role="alert"
      aria-labelledby={titleId}
      className={`${ds.panel} mt-2 grid w-130 max-w-full gap-3 p-6 max-md:p-4`}
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
