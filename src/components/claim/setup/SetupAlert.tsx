import { useId, type ReactNode } from 'react'
import { Icon } from '@/components/common/Icon'
import { OtherTabsLine } from '@/components/shell/OtherTabsLine'
import { ds } from '@/components/ui/classes'
import { errorInfo, isErrorCode } from '@/lib/errors'
import { actionsRow } from './StepGuide'

// 비트 PC 연결의 빨간 상자 두 가지. 문구는 lib/errors.ts에서만 가져오고, 받는 값은 번호 하나라 원래 오류 내용을 그릴 길이 없다(AC-006.6).
// errors.ts에 없는 번호(도우미가 새로 준 번호)는 번호 줄만 보인다.
// 비트 연결을 다른 창이 쓰는 중(E-BRIDGE-BUSY)이면 '무엇이' 바로 아래에 다른 열린 창의 메뉴 이름 한 줄이 붙는다(claim-learn AC-9313.5, 답이 없으면 지금 글 그대로).
// 연결 화면 주소의 from·why(claim-learn AC-9313.1·AC-9313.4)도 여기서 정한다: 정해진 값만 받고, 화면에는 주소 글이 아니라 정해 둔 글만 보인다

/** 청구가 연결 화면으로 옮긴 까닭(주소 why)과 '청구에서 옴' 띠의 까닭 글(시안 notes 그대로) */
export const CLAIM_WHY = {
  'no-helper': '도우미가 없어요',
  'update-helper': '도우미를 업데이트해야 해요',
  'update-extension': '확장을 업데이트해야 해요',
  disconnected: '도우미 연결이 끊겼어요',
} as const
export type ClaimWhy = keyof typeof CLAIM_WHY
const isClaimWhy = (value: string | null): value is ClaimWhy => value !== null && Object.hasOwn(CLAIM_WHY, value)

/** 청구가 옮길 주소(AC-9313.1) */
export const claimSetupHref = (why: ClaimWhy) => `/claim/setup?from=claim&why=${why}`
/** 저장 파일이 다른 병원 것일 때 가는 다시 등록 모양(AC-9313.4) */
export const STORE_SETUP_HREF = '/claim/setup?from=store'

export type SetupFrom = { from: 'claim'; why: ClaimWhy } | { from: 'store' } | null
/** 주소 검색 글(location.search)에서 from·why를 읽는다. 정해진 값이 아니면 없음(null)이다 */
export function readSetupFrom(search: string): SetupFrom {
  const params = new URLSearchParams(search)
  const from = params.get('from')
  if (from === 'store') return { from: 'store' }
  const why = params.get('why')
  return from === 'claim' && isClaimWhy(why) ? { from: 'claim', why } : null
}

/** '청구에서 옴' 띠(AC-9313.1, 시안 band warn): 연결 화면 맨 위 노란 한 줄 */
export function ClaimReasonBand({ why }: { why: ClaimWhy }) {
  return <p className="rounded-control bg-warning-soft px-4 py-3 text-body text-ink">청구 점검을 하려면 이 PC 연결을 먼저 마쳐야 해요. ({CLAIM_WHY[why]})</p>
}

/**
 * 위 오류 상자(ui-90 AC-412.3, 시안 setup_body '.errc'): 진짜 문제(버전 안 맞음·의원 다름) 하나 또는 방금 누른 등록이 실패한 오류만.
 * negative-soft·4px·안쪽 12px 16px, Icon stop 16 → '무엇이'(body 600 negative) · '어떻게'(body ink-2) · 오류 번호(caption ink-2) · 단추 줄.
 * 단추(actions)는 진짜 문제 단계의 내려받기·다시 등록(주)과 [다시 확인](보조)이다. 오류 번호는 이 상자에서만 보인다.
 * steps는 단추 바로 위에 넣는 순서 글이다(도우미 업데이트의 HelperUpdateSteps, bit-dashboard AC-604.3)
 */
export function SetupAlert({ code, steps, actions }: { code: string; steps?: ReactNode; actions?: ReactNode }) {
  const info = isErrorCode(code) ? errorInfo(code) : null
  return (
    <div role="alert" className="flex items-start gap-2 rounded-control bg-negative-soft px-4 py-3">
      {/* 공용 아이콘 stop 16. 첫 줄(body 22px 줄높이)에 맞춰 위 2px */}
      <Icon name="stop" className="mt-0.5 shrink-0 text-negative" />
      <div className="flex min-w-0 flex-1 flex-col">
        {info && <p className="text-body font-semibold text-negative">{info.what}</p>}
        {code === 'E-BRIDGE-BUSY' && <OtherTabsLine className="mt-0.5 text-body text-ink" />}
        {info && <p className="mt-0.5 max-w-160 text-body text-ink-2">{info.fix}</p>}
        <p className="mt-1 text-caption text-ink-2">오류 번호 {code}</p>
        {steps && <div className="mt-3 max-w-160">{steps}</div>}
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
      {/* 어느 창(AC-9313.5): 다른 열린 창이 0.3초 안에 답한 메뉴 이름. 답이 없으면 줄이 없다 */}
      <OtherTabsLine />
      <p className="text-body text-ink-2">{info.fix}</p>
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
