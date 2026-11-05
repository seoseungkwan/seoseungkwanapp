import Link from 'next/link'
import { ErrorCard } from '@/components/common/ErrorCard'
import { Icon } from '@/components/common/Icon'
import { ds } from '@/components/ui/classes'
import { EXCEL_FAILED, isErrorCode } from '@/lib/errors'

// 청구 화면 오류 카드(AC-013.5). 받는 값은 번호 하나라 원래 오류 내용을 그릴 길이 없다. errors.ts에 없는 번호(도우미가 새로 준 번호)는 번호만 보인다
export function ClaimError({ code }: { code: string }) {
  if (isErrorCode(code)) return <ErrorCard code={code} />
  return (
    <p role="alert" className="rounded-control bg-negative-soft px-4 py-3 text-caption text-ink-2 tabular-nums">
      오류 번호 {code}
    </p>
  )
}

/** 글에 비트 PC 연결 화면(/claim/setup)에만 있는 단추([다시 확인]·[처음 등록]·[다시 등록])가 나오는 번호. 청구 화면에는 그 단추가 없다 */
export const SETUP_CODES: ReadonlySet<string> = new Set([
  'E-EXT-MISSING',
  'E-HELPER-MISSING',
  'E-EXT-OLD',
  'E-BRIDGE-DISCONNECTED',
  'E-BRIDGE-REJECTED',
  'E-BRIDGE-BUSY',
  'E-BIT-IN-USE',
  'E-BIT-NOT-REGISTERED',
  'E-BIT-HOSPITAL-MISMATCH',
  'E-STORE-BROKEN',
])

/** 그 단추가 있는 곳으로 가는 링크(AC-013.5). 그런 번호가 아니면 그리지 않는다. 달 칸 store.load의 E-BIT-HOSPITAL-MISMATCH는 이 카드로 오지 않는다(AC-018.17의 StoreBlockedCard) */
export function SetupLink({ code }: { code: string }) {
  if (!SETUP_CODES.has(code)) return null
  return (
    <Link href="/claim/setup" className={`${ds.button.secondarySmall} no-underline`}>
      비트 PC 연결 확인
    </Link>
  )
}

/** [엑셀 내려받기] 실패(AC-013.4). 오류 카드와 같은 바탕에 아이콘·글 세 줄이고 번호는 그대로, 글만 EXCEL_FAILED다. ErrorCard는 번호로만 글을 찾아 쓸 수 없다 */
export function ExcelError({ code }: { code: string }) {
  return (
    <div role="alert" className="flex items-start gap-2 rounded-control bg-negative-soft px-4 py-3">
      <Icon name="stop" className="mt-0.5 shrink-0 text-negative" />
      <div className="flex min-w-0 flex-col gap-0.5">
        <p className="text-small font-semibold text-negative">{EXCEL_FAILED.what}</p>
        <p className="text-small text-ink-2">{EXCEL_FAILED.fix}</p>
        <p className="text-caption text-ink-2 tabular-nums">오류 번호 {code}</p>
      </div>
    </div>
  )
}
