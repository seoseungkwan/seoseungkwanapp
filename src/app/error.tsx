'use client'

import { AuthFrame } from '@/components/auth/AuthFrame'
import { SignOutButton } from '@/components/auth/SignOutButton'
import { ErrorCard } from '@/components/common/ErrorCard'
import { ds } from '@/components/ui/classes'

// 화면을 그리다 난 오류(AC-002.8): 로그인은 됐는데 서버에서 내 병원 줄을 읽지 못함(표·권한 없음, Supabase 장애) 등.
// 저절로 로그인·대시보드로 돌려보내지 않는다 → 문지기와 서로 돌려보내는 고리가 생기지 않는다.
// 대신 [로그아웃](AC-003.7)으로 사용자가 직접 빠져나갈 수 있다 → 오류가 이어져도 이 화면에 갇히지 않는다.
// Next가 넘기는 error·reset은 받지 않는다: 내용(메시지·스택·digest)을 보일 길이 없고, 서버 오류는 reset()만으로는 다시 읽지 않는다
// 모양(b2b-redesign REQ-217 AC-217.2): 한 칸 AuthFrame(480 칸, 위 줄 로고) 본문에 오류 카드(위 24px) → 단추 줄(위 24px, 좁으면 아래로).
// 카드 위 24px는 다른 한 칸 인증 화면(단계 줄·상태 줄)과 같은 시작 높이다
export default function PageError() {
  return (
    <AuthFrame>
      <div className="mt-6">
        <ErrorCard code="E-PAGE-FAILED" />
      </div>
      <div className="mt-6 flex flex-wrap gap-2">
        {/* 새로 열면 middleware·서버가 처음부터 다시 확인한다 */}
        <button type="button" className={`${ds.button.primary} flex-[1_1_160px]`} onClick={() => window.location.reload()}>
          다시 시도
        </button>
        <SignOutButton className={`${ds.button.secondary} flex-[1_1_160px]`} />
      </div>
    </AuthFrame>
  )
}
