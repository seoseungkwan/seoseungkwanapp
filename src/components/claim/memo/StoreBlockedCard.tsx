import Link from 'next/link'
import { Icon } from '@/components/common/Icon'
import { ds } from '@/components/ui/classes'
import { STORE_SETUP_HREF } from '../setup/SetupAlert'

// 기관기호 안내(AC-018.17, 빠진 화면 승인 목업 3번). 설치 화면용 errorInfo의 [다시 등록] 글을 쓰지 않는다(AC-005.5·AC-015.4). 지우는 단추가 없다.
// '이전 병원'은 2026-11-02 사용자 결정. 번호는 진짜 번호를 보인다.
// claim-learn(AC-9313.4, 시안 notes '다시 등록'): 셋째 줄은 '개발자에게 도움' 대신 다시 등록 안내이고, [이 PC 다시 등록]은 연결 화면의 다시 등록 모양(?from=store)으로 간다

export function StoreBlockedCard() {
  return (
    <div role="alert" className="flex items-start gap-2 rounded-control bg-negative-soft px-4 py-3">
      <Icon name="stop" className="mt-0.5 shrink-0 text-negative" />
      <div className="flex min-w-0 flex-col gap-0.5">
        <p className="text-small font-semibold text-negative">등록한 기관기호가 바뀌어 이전 병원의 저장 파일이 남아 있어요</p>
        <p className="text-small text-ink-2">지금은 이 PC에 저장되지 않아요. 고친 메모는 이 화면에 그대로 있어요.</p>
        <p className="text-small text-ink-2">이 PC에 저장된 자료가 지금 등록한 병원(요양기관기호)과 달라요. 병원이 바뀌었으면 이 PC를 다시 등록해 주세요.</p>
        <Link href={STORE_SETUP_HREF} className={`${ds.button.secondarySmall} mt-1 self-start no-underline`}>
          이 PC 다시 등록
        </Link>
        <p className="text-caption text-ink-2 tabular-nums">오류 번호 E-BIT-HOSPITAL-MISMATCH</p>
      </div>
    </div>
  )
}
