import { Icon } from '@/components/common/Icon'

// 기관기호 안내(AC-018.17, 빠진 화면 승인 목업 3번). 다시 등록해도 풀리지 않으므로 설치 화면용 errorInfo의 [다시 등록] 글을 쓰지 않는다(AC-005.5·AC-015.4). 지우거나 처음부터 다시 하는 단추가 없다.
// '이전 병원'과 다음 할 일은 2026-11-02 사용자 결정. 번호는 진짜 번호를 보인다

export function StoreBlockedCard() {
  return (
    <div role="alert" className="flex items-start gap-2 rounded-control bg-negative-soft px-4 py-3">
      <Icon name="stop" className="mt-0.5 shrink-0 text-negative" />
      <div className="flex min-w-0 flex-col gap-0.5">
        <p className="text-small font-semibold text-negative">등록한 기관기호가 바뀌어 이전 병원의 저장 파일이 남아 있어요</p>
        <p className="text-small text-ink-2">지금은 이 PC에 저장되지 않아요. 고친 메모는 이 화면에 그대로 있어요.</p>
        <p className="text-small text-ink-2">이 달은 저장이 막혀 있어요. 이어서 하려면 개발자에게 도움을 요청해 주세요. 등록한 기관기호는 [설정 → 비트 PC 연결]에서 확인할 수 있어요.</p>
        <p className="text-caption text-ink-2 tabular-nums">오류 번호 E-BIT-HOSPITAL-MISMATCH</p>
      </div>
    </div>
  )
}
