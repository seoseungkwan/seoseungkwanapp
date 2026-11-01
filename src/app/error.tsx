'use client'

import { AuthFrame } from '@/components/auth/AuthFrame'
import { SignOutButton } from '@/components/auth/SignOutButton'
import { adminContactEmail } from '@/components/common/adminContact'
import { Icon } from '@/components/common/Icon'
import { ds } from '@/components/ui/classes'
import { errorInfo } from '@/lib/errors'

// 화면을 그리다 난 오류(AC-002.8): 로그인은 됐는데 서버에서 내 병원 줄을 읽지 못함(표·권한 없음, Supabase 장애) 등.
// 저절로 로그인·대시보드로 돌려보내지 않는다 → 문지기와 서로 돌려보내는 고리가 생기지 않는다.
// 대신 [대시보드로](새로 열기)·[로그아웃](AC-003.7)으로 사용자가 직접 빠져나갈 수 있다 → 오류가 이어져도 이 화면에 갇히지 않는다.
// Next가 넘기는 error·reset은 받지 않는다: 내용(메시지·스택·digest)을 보일 길이 없고, 서버 오류는 reset()만으로는 다시 읽지 않는다
// 모양(ui-90 REQ-411, design.md '오류 화면 (TASK-8)', 시안 docs/mockups/ui-90/app/gen.py error_ui): 한 칸 AuthFrame 안에
// negative 칩(위 24) → h1(위 8, heading-m → 768px 이상 heading) → 안내(위 12, lead ink-2) → 오류 번호·관리자 메일(위 20, canvas 바탕 띠,
// 테두리 없음) → 단추 셋(위 24, 사이 8). 단추마다 flex-[1_1_160px]로 휴대폰에서 접히고, [로그아웃]만 768px 이상 md:flex-none이라
// PC 480 칸에서는 셋이 한 줄이다(시안 .er-a .btn-ghost { flex: none }). 빨간 오류 카드(ErrorCard)는 쓰지 않는다
const INFO = errorInfo('E-PAGE-FAILED')
const BUTTON_SIZE = 'flex-[1_1_160px]'

export default function PageError() {
  return (
    <AuthFrame>
      {/* 클라이언트 화면이라 metadata를 못 쓴다 → React <title>이 머리로 옮겨 탭 이름이 된다(앱 틀 밖이라 의원 이름을 읽지 않는다) */}
      <title>오류 · 병원 업무 도구</title>
      <p className="mt-6 flex">
        <span className={ds.chip.negative}>
          <Icon name="stop" size={12} />
          문제가 생겼어요
        </span>
      </p>
      <h1 className="mt-2 text-heading-m font-semibold text-ink md:text-heading">{INFO.what}</h1>
      <p className="mt-3 text-lead text-ink-2">{INFO.fix}</p>
      <div className="mt-5 grid gap-1 rounded-control bg-canvas px-4 py-3 text-body text-ink-2">
        <p>
          <b className="font-semibold text-ink">오류 번호</b> E-PAGE-FAILED
        </p>
        <p>
          <b className="font-semibold text-ink">관리자 메일:</b> {adminContactEmail()}
        </p>
      </div>
      <div className="mt-6 flex flex-wrap gap-2">
        {/* 새로 열면 middleware·서버가 처음부터 다시 확인한다 */}
        <button type="button" className={`${ds.button.primary} ${BUTTON_SIZE}`} onClick={() => window.location.reload()}>
          다시 시도
        </button>
        {/* 새로 열기(<a>, design.md): 오류 난 화면 상태를 버리고 middleware·앱 틀이 처음부터 다시 읽는다 → Link(화면 안 이동)를 쓰지 않는다 */}
        {/* eslint-disable-next-line @next/next/no-html-link-for-pages -- 일부러 새로 연다(위 주석) */}
        <a href="/dashboard" className={`${ds.button.secondary} ${BUTTON_SIZE}`}>
          대시보드로
        </a>
        <SignOutButton className={`${ds.button.ghost} ${BUTTON_SIZE} md:flex-none`} />
      </div>
    </AuthFrame>
  )
}
