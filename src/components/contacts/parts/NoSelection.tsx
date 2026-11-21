// 오른쪽 빈 자리(spec contacts AC-6505.1, 시안 기본값 1 · .ph): 처음 열면 업체를 고르기 전까지 이 글만.
// 시안 .ph의 position: sticky(top 16px)는 옮기지 않는다 — 두 칸 틀을 감싼 칸이 overflow-x: auto(폰 전용 모양 없음)라 sticky가 그 칸을 기준으로 잡아 실제로는 붙지 않는다

export function NoSelection() {
  return (
    <div className="max-w-105 py-8 text-muted">
      <b className="mb-1 block text-lead font-semibold text-ink">업체를 골라 주세요</b>
      왼쪽에서 업체를 누르면 연락처·담당자·장비가 여기에 보여요.
    </div>
  )
}
