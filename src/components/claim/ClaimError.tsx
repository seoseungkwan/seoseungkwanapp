import { ErrorCard } from '@/components/common/ErrorCard'
import { isErrorCode } from '@/lib/errors'

// 청구 화면 오류 카드(AC-013.5). 받는 값은 번호 하나라 원래 오류 내용을 그릴 길이 없다. errors.ts에 없는 번호(도우미가 새로 준 번호)는 번호만 보인다
export function ClaimError({ code }: { code: string }) {
  if (isErrorCode(code)) return <ErrorCard code={code} />
  return (
    <p role="alert" className="rounded-control bg-negative-soft px-4 py-3 text-caption text-ink-2 tabular-nums">
      오류 번호 {code}
    </p>
  )
}
